import { requireRole } from '../lib/guard.js';
import { OfflineAnswerSync } from '../lib/offline-sync.js';
import {
  startOrResumeExam,
  fetchExamQuestions,
  logViolation,
  submitExamToServer,
} from '../services/exam-service.js';

export class CBTEngine {
  constructor(hooks = {}) {
    // Hooks UI agar engine terpisah rapi dari manipulasi DOM spesifik template
    this.hooks = hooks;
    this.auth = null;
    this.session = null;
    this.exam = null;
    this.questions = [];
    this.currentIndex = 0;
    this.clockOffsetMs = 0;
    this.violationCount = 0;
    this.sync = null;
    this.timerInterval = null;
    this.isSubmitted = false;
    this.lastReceiptData = null;
  }

  async boot({ examId, tokenCode = '' }) {
    this.auth = await requireRole(['siswa', 'proktor', 'guru', 'admin_sekolah', 'superadmin']);
    if (!this.auth) return;

    const { session, exam, server_now } = await startOrResumeExam(examId, tokenCode);
    this.session = session;
    this.exam = exam;
    this.violationCount = session.violation_count || 0;
    this.clockOffsetMs = new Date(server_now).getTime() - Date.now();

    this.questions = await fetchExamQuestions(exam.id, session.id, {
      shuffleQuestions: exam.shuffle_questions,
      shuffleOptions: exam.shuffle_options,
      schoolId: session.school_id,
    });

    this.sync = new OfflineAnswerSync({
      sessionId: session.id,
      schoolId: session.school_id,
      onStatusChange: (status) => this.hooks.onSyncStatus?.(status),
    });

    await this.sync.hydrateFromServer();
    this.sync.startAutoSync(15000);

    this._startServerSyncedTimer();
    this._enableAntiCheat();
    this.goTo(0);
  }

  getServerNowMs() {
    return Date.now() + this.clockOffsetMs;
  }

  _startServerSyncedTimer() {
    const startMs = new Date(this.session.server_started_at).getTime();
    const totalMinutes = (this.exam.duration_minutes || 60) + (this.session.extra_minutes || 0);
    const deadlineMs = startMs + totalMinutes * 60 * 1000;

    const tick = () => {
      const remainingSec = Math.max(0, Math.floor((deadlineMs - this.getServerNowMs()) / 1000));
      const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
      const ss = String(remainingSec % 60).padStart(2, '0');
      this.hooks.onTimerTick?.({ remainingSec, formatted: `${mm}:${ss}` });

      if (remainingSec <= 0 && !this.isSubmitted) {
        clearInterval(this.timerInterval);
        this.finishExam({ autoSubmit: true });
      }
    };

    tick();
    this.timerInterval = window.setInterval(tick, 1000);
  }

  _enableAntiCheat() {
    // 1. Deteksi pindah tab / minimize
    this._onVisibilityChange = () => {
      if (document.hidden && !this.isSubmitted) {
        this._recordViolation('TAB_SWITCH', { hiddenAt: new Date().toISOString() });
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // 2. Deteksi keluar fullscreen
    this._onFullscreenChange = () => {
      if (!document.fullscreenElement && !this.isSubmitted) {
        this._recordViolation('EXIT_FULLSCREEN', { at: new Date().toISOString() });
      }
    };
    document.addEventListener('fullscreenchange', this._onFullscreenChange);

    // 3. Blokir klik kanan & shortcut inspect sederhana
    this._onContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', this._onContextMenu);
  }

  async requestFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Browser tertentu butuh interaksi klik eksplisit dari tombol Mulai Ujian
    }
  }

  async _recordViolation(eventType, details) {
    const prev = this.violationCount;
    this.violationCount += 1;
    this.hooks.onViolation?.({
      eventType,
      count: this.violationCount,
      maxAllowed: this.exam.max_tab_switches || 3,
    });

    try {
      await logViolation({
        sessionId: this.session.id,
        schoolId: this.session.school_id,
        actorId: this.auth?.user?.id || 'demo-actor',
        eventType,
        details,
        currentCount: prev,
      });
    } catch (err) {
      console.warn('[SICAKAP] Gagal mencatat log pelanggaran:', err);
    }

    if (this.violationCount >= (this.exam.max_tab_switches || 3) && !this.isSubmitted) {
      this.finishExam({ autoSubmit: true, reason: 'Batas pelanggaran pindah tab tercapai.' });
    }
  }

  goTo(index) {
    if (index < 0 || index >= this.questions.length) return;
    this.currentIndex = index;
    const question = this.questions[index];
    const saved = this.sync.getAnswer(question.id);
    this.hooks.onRenderQuestion?.({
      index,
      total: this.questions.length,
      question,
      savedAnswer: saved.answer_payload,
      isFlagged: saved.is_flagged,
      allAnswers: this.sync.getAllAnswers(),
    });
  }

  recordAnswer(answerPayload) {
    const q = this.questions[this.currentIndex];
    if (!q || this.isSubmitted) return;
    this.sync.saveAnswer(q.id, answerPayload, null);
    this.hooks.onProgressUpdate?.(this.sync.getAllAnswers());
  }

  toggleFlag() {
    const q = this.questions[this.currentIndex];
    if (!q || this.isSubmitted) return;
    const current = this.sync.getAnswer(q.id);
    this.sync.saveAnswer(q.id, undefined, !current.is_flagged);
    this.goTo(this.currentIndex);
  }

  async finishExam({ autoSubmit = false, reason = '' } = {}) {
    if (this.isSubmitted) return;
    this.isSubmitted = true;

    clearInterval(this.timerInterval);
    this.sync.stopAutoSync();
    this._cleanupListeners();

    this.hooks.onSubmitting?.({ autoSubmit, reason });

    try {
      await this.sync.syncDirty();
      const result = await submitExamToServer(this.session.id, this.sync.getPendingPayloadList());
      this.sync.clearLocalCache();
      this._renderSuccessOverlay(result);
    } catch (err) {
      // Izinkan retry jika internet putus tepat di detik submit
      this.isSubmitted = false;
      this.sync.startAutoSync(15000);
      this.hooks.onSubmitError?.(err.message);
    }
  }

  _renderSuccessOverlay(result) {
    const receiptEl = document.getElementById('success-receipt-num');
    const overlayEl = document.getElementById('success-overlay');

    if (receiptEl) receiptEl.textContent = result.receipt_number;
    if (overlayEl) overlayEl.classList.remove('hidden');

    this.lastReceiptData = {
      ...result,
      studentName: this.auth?.profile?.full_name || sessionStorage.getItem('sicakap_name') || 'Ahmad Rizky Pratama',
      identifier: this.auth?.profile?.identifier || sessionStorage.getItem('sicakap_nisn') || '0084928192',
      examTitle: this.exam?.title || sessionStorage.getItem('sicakap_mapel') || 'Asesmen SD',
    };

    this.hooks.onSubmitSuccess?.(this.lastReceiptData);
  }

  /** Cetak / Simpan PDF Bukti Selesai Ujian langsung dari browser */
  printReceipt(receiptData) {
    const data = receiptData || this.lastReceiptData || {
      receipt_number: document.getElementById('success-receipt-num')?.textContent || 'CBT-BUKTI',
      studentName: this.auth?.profile?.full_name || sessionStorage.getItem('sicakap_name') || 'Ahmad Rizky Pratama',
      identifier: this.auth?.profile?.identifier || sessionStorage.getItem('sicakap_nisn') || '0084928192',
      examTitle: this.exam?.title || sessionStorage.getItem('sicakap_mapel') || 'Asesmen SD',
      submitted_at: new Date().toISOString(),
    };

    const win = window.open('', '_blank', 'width=600,height=700');
    if (!win) return window.print();

    win.document.write(`
      <!doctype html>
      <html lang="id">
      <head>
        <meta charset="utf-8" />
        <title>Bukti Selesai Ujian - ${data.receipt_number}</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 32px; color: #0f172a; }
          .card { border: 2px solid #0f172a; border-radius: 12px; padding: 24px; max-width: 480px; margin: auto; }
          h2 { margin: 0 0 8px; font-size: 18px; }
          .badge { background: #ecfdf5; color: #065f46; padding: 6px 12px; border-radius: 99px; font-weight: 700; display: inline-block; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          td { padding: 8px 0; border-bottom: 1px dashed #cbd5e1; font-size: 14px; }
          td:first-child { color: #475569; width: 42%; }
          td:last-child { font-weight: 600; text-align: right; }
          .footer { margin-top: 20px; font-size: 12px; color: #64748b; text-align: center; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">UJIAN SELESAI &amp; TERVERIFIKASI</div>
          <h2>Bukti Pengiriman Jawaban SICAKAP</h2>
          <table>
            <tr><td>Nomor Bukti</td><td>${data.receipt_number}</td></tr>
            <tr><td>Nama Peserta</td><td>${data.studentName}</td></tr>
            <tr><td>NISN</td><td>${data.identifier || '-'}</td></tr>
            <tr><td>Paket Ujian</td><td>${data.examTitle}</td></tr>
            <tr><td>Waktu Kirim</td><td>${new Date(data.submitted_at).toLocaleString('id-ID')}</td></tr>
          </table>
          <div class="footer">Dokumen ini dihasilkan otomatis oleh server SICAKAP.</div>
        </div>
        <script>window.onload = () => { window.print(); };</script>
      </body>
      </html>
    `);
    win.document.close();
  }

  _cleanupListeners() {
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    document.removeEventListener('fullscreenchange', this._onFullscreenChange);
    document.removeEventListener('contextmenu', this._onContextMenu);
  }
}

