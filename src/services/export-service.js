import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase.js';

/** 1. Unduh Template Excel Import Bank Soal (Ramah Guru SD) */
export function downloadQuestionTemplate() {
  const sampleRows = [
    {
      No: 1,
      Tipe: 'single',
      Kompetensi: 'Numerasi - Pecahan Fase C',
      Stimulus: 'Ibu memotong bolu menjadi 12 bagian sama besar, lalu dimakan 4 bagian.',
      Pertanyaan: 'Berapa bagian bolu yang tersisa?',
      Opsi_A: '$\\frac{4}{12}$ bagian',
      Opsi_B: '$\\frac{8}{12}$ bagian',
      Opsi_C: '$\\frac{6}{12}$ bagian',
      Opsi_D: '$\\frac{7}{12}$ bagian',
      Kunci: 'B',
      Poin: 1,
      JSON_Opsi_Khusus: '',
      JSON_Kunci_Khusus: '',
    },
    {
      No: 2,
      Tipe: 'multiple',
      Kompetensi: 'Literasi - Memahami Teks Fabel',
      Stimulus: 'Kancil membantu kura-kura menyeberangi sungai dengan rakit bambu.',
      Pertanyaan: 'Pilih 2 sifat terpuji tokoh Kancil!',
      Opsi_A: 'Suka menolong',
      Opsi_B: 'Pemalas',
      Opsi_C: 'Cerdik mencari solusi',
      Opsi_D: 'Sombong',
      Kunci: 'A,C',
      Poin: 2,
      JSON_Opsi_Khusus: '',
      JSON_Kunci_Khusus: '',
    },
    {
      No: 3,
      Tipe: 'short_answer',
      Kompetensi: 'Numerasi - Operasi Hitung',
      Stimulus: '',
      Pertanyaan: 'Hasil dari 25 x 4 adalah...',
      Opsi_A: '',
      Opsi_B: '',
      Opsi_C: '',
      Opsi_D: '',
      Kunci: '100',
      Poin: 1,
      JSON_Opsi_Khusus: '{"placeholder":"Ketik angka saja","input_mode":"numeric"}',
      JSON_Kunci_Khusus: '',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template_Soal_AKM');
  XLSX.writeFile(wb, 'Template_Import_Soal_SICAKAP.xlsx');
}

/** 2. Import Massal Bank Soal dari File .xlsx ke Tabel questions & question_keys */
export async function importQuestionsFromExcel(file, { examId, schoolId, kelas = null }) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows.length) throw new Error('File Excel kosong.');

  let insertedCount = 0;
  const activeKelas = kelas || (typeof window !== 'undefined' ? (window.__ACTIVE_GURU_KELAS__ || window.__SICAKAP_USER__?.profile?.kelas || window.__SICAKAP_USER__?.profile?.class_name) : null);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const type = String(r.Tipe || 'single').trim().toLowerCase();
    const prompt = String(r.Pertanyaan || '').trim();
    if (!prompt) continue;

    let options;
    let answerKey;

    if (r.JSON_Opsi_Khusus) {
      options = JSON.parse(String(r.JSON_Opsi_Khusus));
    } else if (['single', 'multiple'].includes(type)) {
      options = ['A', 'B', 'C', 'D']
        .map((k) => ({ key: k, text: String(r[`Opsi_${k}`] || '').trim() }))
        .filter((o) => o.text !== '');
    } else {
      options = {};
    }

    if (r.JSON_Kunci_Khusus) {
      answerKey = JSON.parse(String(r.JSON_Kunci_Khusus));
    } else if (type === 'single') {
      answerKey = { correct: String(r.Kunci || '').trim().toUpperCase() };
    } else if (type === 'multiple') {
      answerKey = {
        correct: String(r.Kunci || '')
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      };
    } else if (type === 'short_answer') {
      answerKey = {
        accepted: String(r.Kunci || '')
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean),
        case_sensitive: false,
      };
    } else {
      throw new Error(`Baris ${i + 2}: Tipe "${type}" wajib mengisi kolom JSON_Kunci_Khusus.`);
    }

    const { data: qData, error: qErr } = await supabase
      .from('questions')
      .insert({
        exam_id: examId,
        school_id: schoolId,
        kelas: activeKelas,
        order_no: Number(r.No) || i + 1,
        type,
        competency: String(r.Kompetensi || '').trim() || null,
        stimulus: String(r.Stimulus || '').trim() || null,
        prompt,
        options,
        points: Number(r.Poin) || 1,
      })
      .select('id')
      .single();

    if (qErr) throw new Error(`Gagal simpan soal baris ${i + 2}: ${qErr.message}`);

    const { error: kErr } = await supabase.from('question_keys').insert({
      question_id: qData.id,
      school_id: schoolId,
      answer_key: answerKey,
    });

    if (kErr) throw new Error(`Gagal simpan kunci baris ${i + 2}: ${kErr.message}`);
    insertedCount += 1;
  }

  return { insertedCount };
}

/** 3. Export Rekap Nilai & Analisis Butir Soal ke File Excel (.xlsx) 2 Sheet */
export async function exportExamReportToExcel(examId, examTitle = 'Ujian_SICAKAP') {
  const [sessRes, qRes] = await Promise.all([
    supabase
      .from('exam_sessions')
      .select(`
        id, status, score, violation_count, submitted_at, receipt_number,
        student:profiles!exam_sessions_student_id_fkey (full_name, identifier, class_name)
      `)
      .eq('exam_id', examId)
      .order('score', { ascending: false, nullsFirst: false }),
    supabase
      .from('questions')
      .select('id, order_no, type, competency, points')
      .eq('exam_id', examId)
      .order('order_no', { ascending: true }),
  ]);

  if (sessRes.error) throw new Error(sessRes.error.message);
  if (qRes.error) throw new Error(qRes.error.message);

  const sessions = sessRes.data || [];
  const questions = qRes.data || [];
  const sessionIds = sessions.map((s) => s.id);

  let answers = [];
  if (sessionIds.length > 0) {
    const ansRes = await supabase
      .from('student_answers')
      .select('question_id, is_correct')
      .in('session_id', sessionIds);
    if (!ansRes.error) answers = ansRes.data || [];
  }

  // Sheet 1: Rekap Nilai Peserta
  const rekapRows = sessions.map((s, idx) => ({
    No: idx + 1,
    NISN: s.student?.identifier || '-',
    'Nama Peserta': s.student?.full_name || '-',
    Kelas: s.student?.class_name || '-',
    Status: s.status,
    'Skor Akhir': s.score ?? '-',
    'Pindah Tab': s.violation_count || 0,
    'Waktu Kirim': s.submitted_at ? new Date(s.submitted_at).toLocaleString('id-ID') : '-',
    'Nomor Bukti': s.receipt_number || '-',
  }));

  // Sheet 2: Analisis Butir Soal (Indeks Kesukaran P)
  const submittedCount = sessions.filter((s) => s.status === 'submitted').length;
  const analisisRows = questions.map((q) => {
    const qAnswers = answers.filter((a) => a.question_id === q.id);
    const benar = qAnswers.filter((a) => a.is_correct === true).length;
    const salah = Math.max(0, submittedCount - benar);
    const indeksP = submittedCount > 0 ? benar / submittedCount : 0;

    let kategori = 'Sedang';
    if (indeksP > 0.7) kategori = 'Mudah';
    else if (indeksP < 0.3) kategori = 'Sukar';

    return {
      'No Soal': q.order_no,
      'Tipe AKM': q.type,
      Kompetensi: q.competency || '-',
      'Bobot Poin': q.points,
      'Peserta Selesai': submittedCount,
      Benar: benar,
      Salah: salah,
      'Persentase Benar (%)': Number((indeksP * 100).toFixed(1)),
      'Kategori Kesukaran': kategori,
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rekapRows), 'Rekap_Nilai');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(analisisRows), 'Analisis_Butir_Soal');

  const safeTitle = examTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateTag = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Laporan_${safeTitle}_${dateTag}.xlsx`);
}

