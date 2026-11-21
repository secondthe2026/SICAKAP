import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isAnswerCorrect(type: string, payload: any, key: any): boolean {
  if (!payload || !key) return false;

  switch (type) {
    case 'single':
      return String(payload.selected ?? '').trim() === String(key.correct ?? '').trim();

    case 'multiple': {
      const userArr = Array.isArray(payload.selected) ? [...payload.selected].map(String).sort() : [];
      const keyArr = Array.isArray(key.correct) ? [...key.correct].map(String).sort() : [];
      return userArr.length === keyArr.length && userArr.every((v, i) => v === keyArr[i]);
    }

    case 'true_false_table': {
      const userMap = payload.answers || {};
      const keyMap = key.correct || {};
      const keys = Object.keys(keyMap);
      return keys.length > 0 && keys.every((k) => Boolean(userMap[k]) === Boolean(keyMap[k]));
    }

    case 'matching': {
      const userPairs = payload.pairs || {};
      const keyPairs = key.correct || {};
      const keys = Object.keys(keyPairs);
      return keys.length > 0 && keys.every((k) => String(userPairs[k] ?? '') === String(keyPairs[k]));
    }

    case 'short_answer': {
      const raw = String(payload.text ?? '').trim();
      const accepted: string[] = Array.isArray(key.accepted) ? key.accepted : [];
      const caseSensitive = Boolean(key.case_sensitive);
      return accepted.some((ans) =>
        caseSensitive ? raw === ans.trim() : raw.toLowerCase() === ans.trim().toLowerCase()
      );
    }

    default:
      return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Verifikasi JWT user pemanggil
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Token sesi tidak valid.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { session_id, final_answers = [] } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id wajib diisi.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Gunakan service role untuk baca kunci jawaban & update skor resmi
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: session, error: sessErr } = await admin
      .from('exam_sessions')
      .select('id, exam_id, school_id, student_id, status, receipt_number, submitted_at, score')
      .eq('id', session_id)
      .single();

    if (sessErr || !session) {
      return new Response(JSON.stringify({ error: 'Sesi ujian tidak ditemukan.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Izinkan pemilik sesi (siswa) atau staf sekolah (proktor/admin untuk Force Submit)
    if (session.student_id !== user.id) {
      const { data: callerProfile } = await admin
        .from('profiles')
        .select('role, school_id')
        .eq('id', user.id)
        .single();

      const isAuthorizedStaff =
        callerProfile &&
        (callerProfile.role === 'superadmin' ||
          (callerProfile.school_id === session.school_id &&
            ['admin_sekolah', 'proktor'].includes(callerProfile.role)));

      if (!isAuthorizedStaff) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Idempotent: jika sudah pernah submit, kembalikan bukti yang sama
    if (session.status === 'submitted') {
      return new Response(
        JSON.stringify({
          receipt_number: session.receipt_number,
          submitted_at: session.submitted_at,
          already_submitted: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Flush jawaban terakhir dari klien (jika ada antrean offline tersisa)
    if (Array.isArray(final_answers) && final_answers.length > 0) {
      const rows = final_answers.map((a: any) => ({
        session_id: session.id,
        school_id: session.school_id,
        question_id: a.question_id,
        answer_payload: a.answer_payload ?? {},
        is_flagged: Boolean(a.is_flagged),
      }));
      await admin.from('student_answers').upsert(rows, { onConflict: 'session_id,question_id' });
    }

    // 4. Ambil seluruh soal, kunci jawaban, dan jawaban siswa
    const [qRes, kRes, aRes] = await Promise.all([
      admin.from('questions').select('id, type, points').eq('exam_id', session.exam_id),
      admin.from('question_keys').select('question_id, answer_key').eq('school_id', session.school_id),
      admin.from('student_answers').select('id, question_id, answer_payload').eq('session_id', session.id),
    ]);

    const questions = qRes.data || [];
    const keyMap = new Map((kRes.data || []).map((k: any) => [k.question_id, k.answer_key]));
    const ansMap = new Map((aRes.data || []).map((a: any) => [a.question_id, a]));

    let totalPoints = 0;
    let earnedTotal = 0;
    const answerUpdates: any[] = [];

    for (const q of questions) {
      const maxPts = Number(q.points) || 1;
      totalPoints += maxPts;
      const studentAns = ansMap.get(q.id);
      const correct = studentAns
        ? isAnswerCorrect(q.type, studentAns.answer_payload, keyMap.get(q.id))
        : false;
      const earned = correct ? maxPts : 0;
      earnedTotal += earned;

      if (studentAns) {
        answerUpdates.push({
          id: studentAns.id,
          session_id: session.id,
          school_id: session.school_id,
          question_id: q.id,
          answer_payload: studentAns.answer_payload,
          is_correct: correct,
          earned_points: earned,
        });
      }
    }

    if (answerUpdates.length > 0) {
      await admin.from('student_answers').upsert(answerUpdates, { onConflict: 'id' });
    }

    const finalScore = totalPoints > 0 ? Number(((earnedTotal / totalPoints) * 100).toFixed(2)) : 0;
    const nowIso = new Date().toISOString();
    const dateStamp = nowIso.slice(0, 10).replace(/-/g, '');
    const shortHash = session.id.replace(/-/g, '').slice(0, 8).toUpperCase();
    const receiptNumber = `CBT-${dateStamp}-${shortHash}`;

    const { error: updErr } = await admin
      .from('exam_sessions')
      .update({
        status: 'submitted',
        submitted_at: nowIso,
        score: finalScore,
        receipt_number: receiptNumber,
      })
      .eq('id', session.id);

    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({
        receipt_number: receiptNumber,
        submitted_at: nowIso,
        answered_count: answerUpdates.length,
        total_questions: questions.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Gagal memproses nilai.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

