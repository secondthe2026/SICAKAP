import { supabase } from './supabase.js';

export class OfflineAnswerSync {
  /**
   * @param {{ sessionId: string, schoolId: string, onStatusChange?: (status: 'online'|'syncing'|'offline'|'error') => void }} opts
   */
  constructor({ sessionId, schoolId, onStatusChange }) {
    this.sessionId = sessionId;
    this.schoolId = schoolId;
    this.storageKey = `sicakap_ans_${sessionId}`;
    this.onStatusChange = onStatusChange || (() => {});
    this.cache = this._loadLocal();
    this.isSyncing = false;
    this.intervalId = null;

    this._handleOnline = () => {
      this.onStatusChange('syncing');
      this.syncDirty();
    };
    this._handleOffline = () => this.onStatusChange('offline');
  }

  _loadLocal() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  _persistLocal() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.cache));
    } catch (err) {
      console.error('[SICAKAP] Gagal menulis localStorage:', err);
    }
  }

  /** Gabungkan jawaban lama dari server (jika pindah perangkat / refresh) dengan cache lokal */
  async hydrateFromServer() {
    try {
      const { data, error } = await supabase
        .from('student_answers')
        .select('question_id, answer_payload, is_flagged, updated_at')
        .eq('session_id', this.sessionId);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const local = this.cache[row.question_id];
          const serverTime = new Date(row.updated_at).getTime();
          if (!local || (!local.dirty && serverTime >= (local.updatedAt || 0))) {
            this.cache[row.question_id] = {
              answer_payload: row.answer_payload || {},
              is_flagged: Boolean(row.is_flagged),
              dirty: false,
              updatedAt: serverTime,
            };
          }
        }
        this._persistLocal();
      }
    } catch (err) {
      console.warn('[SICAKAP] Hydrate from server fallback:', err);
    }
    return this.getAllAnswers();
  }

  /** Simpan instan ke localStorage saat siswa klik opsi / tombol ragu-ragu */
  saveAnswer(questionId, answerPayload, isFlagged = null) {
    const prev = this.cache[questionId] || { answer_payload: {}, is_flagged: false };
    this.cache[questionId] = {
      answer_payload: answerPayload !== undefined ? answerPayload : prev.answer_payload,
      is_flagged: isFlagged !== null ? Boolean(isFlagged) : prev.is_flagged,
      dirty: true,
      updatedAt: Date.now(),
    };
    // 1. Instan simpan ke localStorage agar tidak ada progres yang hilang jika browser ditutup/crash
    this._persistLocal();

    // 2. Debounce auto-save 3 detik agar tidak membebani Supabase saat siswa klik cepat antar opsi/soal
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      if (navigator.onLine) {
        this.syncDirty();
      }
    }, 3000);
  }

  getAnswer(questionId) {
    return this.cache[questionId] || { answer_payload: {}, is_flagged: false };
  }

  getAllAnswers() {
    return this.cache;
  }

  getPendingPayloadList() {
    return Object.entries(this.cache).map(([question_id, item]) => ({
      question_id,
      answer_payload: item.answer_payload,
      is_flagged: item.is_flagged,
    }));
  }

  startAutoSync(intervalMs = 15000) {
    window.addEventListener('online', this._handleOnline);
    window.addEventListener('offline', this._handleOffline);
    this.onStatusChange(navigator.onLine ? 'online' : 'offline');

    this.intervalId = window.setInterval(() => {
      if (navigator.onLine) this.syncDirty();
    }, intervalMs);
  }

  stopAutoSync() {
    window.removeEventListener('online', this._handleOnline);
    window.removeEventListener('offline', this._handleOffline);
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    if (this.intervalId) clearInterval(this.intervalId);
  }

  async syncDirty() {
    if (this.isSyncing) return true;
    if (!navigator.onLine) {
      this.onStatusChange('offline');
      return false;
    }

    const dirtyEntries = Object.entries(this.cache).filter(([, v]) => v.dirty);
    if (dirtyEntries.length === 0) {
      this.onStatusChange('online');
      return true;
    }

    this.isSyncing = true;
    this.onStatusChange('syncing');

    const snapshotTimes = new Map(dirtyEntries.map(([qid, v]) => [qid, v.updatedAt]));
    const rows = dirtyEntries.map(([question_id, v]) => ({
      session_id: this.sessionId,
      school_id: this.schoolId,
      question_id,
      answer_payload: v.answer_payload,
      is_flagged: v.is_flagged,
    }));

    let syncSuccess = false;

    // Retry otomatis hingga 3x jika sinyal sekolah naik-turun
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { error } = await supabase
          .from('student_answers')
          .upsert(rows, { onConflict: 'session_id,question_id' });

        if (!error) {
          syncSuccess = true;
          break;
        } else {
          console.warn(`[SICAKAP] Auto-sync percobaan ${attempt}/3 catatan:`, error.message);
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, attempt * 1000));
          }
        }
      } catch (err) {
        console.warn(`[SICAKAP] Auto-sync percobaan ${attempt}/3 error:`, err);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, attempt * 1000));
        }
      }
    }

    this.isSyncing = false;

    if (!syncSuccess) {
      console.warn('[SICAKAP] Auto-sync gagal setelah 3x percobaan, data tetap aman di cache lokal.');
      this.onStatusChange('error');
      return false;
    }

    // Tandai bersih hanya jika siswa belum mengubah jawaban lagi saat sync berlangsung
    for (const [qid, syncedAt] of snapshotTimes.entries()) {
      if (this.cache[qid] && this.cache[qid].updatedAt === syncedAt) {
        this.cache[qid].dirty = false;
      }
    }
    this._persistLocal();
    this.onStatusChange('online');
    return true;
  }

  clearLocalCache() {
    localStorage.removeItem(this.storageKey);
  }
}

