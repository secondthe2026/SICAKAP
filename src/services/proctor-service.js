import { supabase } from '../lib/supabase.js';

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Tanpa 0/O/1/I agar mudah dibaca siswa SD

/** Ambil daftar sesi peserta + log pelanggaran terbaru untuk satu paket ujian */
export async function fetchProctorMonitor(examId) {
  const [sessRes, logRes] = await Promise.all([
    supabase
      .from('exam_sessions')
      .select(`
        id, status, server_started_at, submitted_at, extra_minutes,
        device_token, violation_count, score, receipt_number, updated_at,
        student:profiles!exam_sessions_student_id_fkey (id, full_name, identifier, class_name)
      `)
      .eq('exam_id', examId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('proctor_logs')
      .select('id, session_id, event_type, details, created_at')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  if (sessRes.error) throw new Error(sessRes.error.message);
  return {
    sessions: sessRes.data || [],
    logs: logRes.data || [],
  };
}

/** Berlangganan update real-time saat siswa mulai, pindah tab, atau selesai ujian */
export function subscribeProctorRealtime(examId, onEvent) {
  const channel = supabase
    .channel(`proctor-exam-${examId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'exam_sessions', filter: `exam_id=eq.${examId}` },
      (payload) => onEvent({ source: 'session', payload })
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'proctor_logs' },
      (payload) => onEvent({ source: 'log', payload })
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/** Generate token 6 karakter baru (berlaku 15 menit) dan aktifkan ujian */
export async function generateExamToken(examId, validMinutes = 15) {
  let token = '';
  const randomVals = crypto.getRandomValues(new Uint32Array(6));
  for (let i = 0; i < 6; i++) {
    token += TOKEN_CHARS[randomVals[i] % TOKEN_CHARS.length];
  }

  const expiresAt = new Date(Date.now() + validMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('exams')
    .update({
      token_code: token,
      token_expires_at: expiresAt,
      status: 'active',
    })
    .eq('id', examId)
    .select('id, token_code, token_expires_at, status')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Reset Login: kosongkan device_token agar siswa bisa lanjut ujian di perangkat lain */
export async function resetStudentLogin({ sessionId, schoolId, proctorId }) {
  const { error } = await supabase
    .from('exam_sessions')
    .update({ device_token: null, status: 'in_progress' })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);

  await supabase.from('proctor_logs').insert({
    session_id: sessionId,
    school_id: schoolId,
    actor_id: proctorId,
    event_type: 'RESET_LOGIN',
    details: { at: new Date().toISOString() },
  });
}

/** Tambah Waktu (menit) untuk siswa tertentu */
export async function addExtraTime({ sessionId, schoolId, proctorId, minutes = 10 }) {
  const { data: current, error: fetchErr } = await supabase
    .from('exam_sessions')
    .select('extra_minutes')
    .eq('id', sessionId)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  const nextExtra = (current?.extra_minutes || 0) + Number(minutes);
  const { error: updErr } = await supabase
    .from('exam_sessions')
    .update({ extra_minutes: nextExtra })
    .eq('id', sessionId);

  if (updErr) throw new Error(updErr.message);

  await supabase.from('proctor_logs').insert({
    session_id: sessionId,
    school_id: schoolId,
    actor_id: proctorId,
    event_type: 'ADD_TIME',
    details: { added_minutes: Number(minutes), total_extra: nextExtra },
  });

  return nextExtra;
}

/** Paksa Selesai & Koreksi Skor di Server lewat Edge Function grade-exam */
export async function forceSubmitStudent({ sessionId, schoolId, proctorId }) {
  const { data, error } = await supabase.functions.invoke('grade-exam', {
    body: { session_id: sessionId, final_answers: [] },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);

  await supabase.from('proctor_logs').insert({
    session_id: sessionId,
    school_id: schoolId,
    actor_id: proctorId,
    event_type: 'FORCE_SUBMIT',
    details: { receipt_number: data.receipt_number },
  });

  return data;
}

