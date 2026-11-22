import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    return res.status(500).json({ error: 'Konfigurasi Supabase URL tidak ditemukan di environment.' });
  }

  // 1. Verifikasi Authorization Bearer Token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token otorisasi Bearer diperlukan.' });
  }
  const token = authHeader.split(' ')[1];

  const client = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: userErr } = await client.auth.getUser(token);
  if (userErr || !user) {
    return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir. Silakan login kembali.' });
  }

  if (!serviceRoleKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diatur di server.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2. Verifikasi Profil Pemanggil
  const { data: callerProfile, error: profErr } = await adminClient
    .from('profiles')
    .select('id, role, school_id, kelas, class_name, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profErr || !callerProfile) {
    return res.status(403).json({ error: 'Profil pengguna tidak ditemukan.' });
  }

  const callerRole = String(callerProfile.role || '').toLowerCase();
  if (callerRole !== 'guru' && callerRole !== 'admin_sekolah' && callerRole !== 'superadmin') {
    return res.status(403).json({ error: 'Akses ditolak: Hanya Guru, Admin Sekolah, atau Superadmin yang berhak menyimpan soal.' });
  }

  if (callerProfile.is_active === false) {
    return res.status(403).json({ error: 'Akun Anda sedang dinonaktifkan.' });
  }

  const targetSchoolId = callerRole === 'superadmin' ? (req.body?.school_id || callerProfile.school_id) : callerProfile.school_id;
  if (!targetSchoolId) {
    return res.status(400).json({ error: 'School ID tidak ditemukan untuk akun ini.' });
  }

  const questionsList = req.body?.questions;
  if (!Array.isArray(questionsList) || questionsList.length === 0) {
    return res.status(400).json({ error: 'Daftar butir soal kosong.' });
  }

  try {
    const questionRows = [];
    const keyRows = [];
    const clientSavedItems = [];

    const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    for (const q of questionsList) {
      const qId = (q.id && isUuid(q.id)) ? q.id : crypto.randomUUID();
      const rawGrade = String(q.tingkat || q.kelas || '5').replace(/[^0-9]/g, '') || '5';
      const cleanKelas = `Kelas ${rawGrade}`;

      const options = Array.isArray(q.opsi) ? q.opsi : [
        { key: 'A', text: q.opsi_a || 'Opsi A' },
        { key: 'B', text: q.opsi_b || 'Opsi B' },
        { key: 'C', text: q.opsi_c || 'Opsi C' },
        { key: 'D', text: q.opsi_d || 'Opsi D' },
      ];

      const keyVal = String(q.kunci || q.kunci_jawaban || 'A').trim().toUpperCase();

      questionRows.push({
        id: qId,
        school_id: targetSchoolId,
        exam_id: q.exam_id || q.examId || null,
        kelas: cleanKelas,
        type: q.tipe || 'single',
        competency: q.mapel || 'Matematika SD',
        stimulus: q.stimulus || q.wacana || null,
        prompt: q.pertanyaan || q.prompt || '',
        options: options,
        points: Number(q.points) || 1.00,
        rubric_note: q.pembahasan || null,
        cognitive_level: q.levelKognitif || 'MOTS',
        topic: q.cpTp || null,
        answer_key: keyVal,
        created_by: user.id
      });

      keyRows.push({
        question_id: qId,
        school_id: targetSchoolId,
        answer_key: keyVal,
        rubric_note: q.pembahasan || null
      });

      clientSavedItems.push({
        ...q,
        id: qId,
        tingkat: rawGrade,
        kelas: cleanKelas,
        opsi: options,
        kunci: keyVal
      });
    }

    // Insert ke public.questions dengan fallback otomatis jika schema berbeda
    let { error: qErr } = await adminClient
      .from('questions')
      .upsert(questionRows, { onConflict: 'id' });

    // Fallback 1: Jika exam_id tidak boleh null pada DB live
    if (qErr && qErr.message && qErr.message.includes('exam_id') && qErr.message.includes('not-null')) {
      console.warn('[Save Questions] exam_id NOT NULL constraint detected. Finding/creating fallback exam...');
      let fallbackExamId = null;
      const { data: existingExam } = await adminClient
        .from('exams')
        .select('id')
        .eq('school_id', targetSchoolId)
        .limit(1)
        .maybeSingle();

      if (existingExam?.id) {
        fallbackExamId = existingExam.id;
      } else {
        const { data: newExam } = await adminClient
          .from('exams')
          .insert([{
            school_id: targetSchoolId,
            title: 'Bank Soal Mandiri SD',
            subject: 'Literasi & Numerasi',
            kelas: 'Kelas 5',
            is_active: false
          }])
          .select('id')
          .maybeSingle();
        fallbackExamId = newExam?.id;
      }

      if (fallbackExamId) {
        questionRows.forEach(r => { if (!r.exam_id) r.exam_id = fallbackExamId; });
        const retryRes = await adminClient
          .from('questions')
          .upsert(questionRows, { onConflict: 'id' });
        qErr = retryRes.error;
      }
    }

    // Fallback 2: Jika kolom aditif (rubric_note / answer_key / created_by) belum ada di DB live
    if (qErr && qErr.message && qErr.message.includes('column') && qErr.message.includes('does not exist')) {
      console.warn('[Save Questions] Some additive columns missing in DB. Retrying with baseline columns...');
      const strippedRows = questionRows.map(r => ({
        id: r.id,
        school_id: r.school_id,
        exam_id: r.exam_id,
        kelas: r.kelas,
        type: r.type,
        competency: r.competency,
        stimulus: r.stimulus,
        prompt: r.prompt,
        options: r.options,
        points: r.points
      }));

      const retryStrip = await adminClient
        .from('questions')
        .upsert(strippedRows, { onConflict: 'id' });
      qErr = retryStrip.error;
    }

    if (qErr) {
      console.error('[Save Questions Error]', qErr);
      throw new Error(`Gagal menyimpan butir soal ke database: ${qErr.message}`);
    }

    // Insert ke public.question_keys
    const { error: kErr } = await adminClient
      .from('question_keys')
      .upsert(keyRows, { onConflict: 'question_id' });

    if (kErr) {
      console.warn('[Save Question Keys Error]', kErr);
      // Warning only, questions already saved with answer_key column
    }

    return res.status(200).json({
      ok: true,
      savedCount: questionRows.length,
      savedQuestions: clientSavedItems
    });
  } catch (err) {
    console.error('[Batch Save Questions Error]', err);
    return res.status(500).json({
      error: err.message || 'Gagal menyimpan butir soal ke database Supabase.'
    });
  }
}
