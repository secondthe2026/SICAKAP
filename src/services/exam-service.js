import { supabase } from '../lib/supabase.js';

const DEVICE_TOKEN_KEY = 'sicakap_device_token';

function getOrCreateDeviceToken() {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}

/** Deterministic PRNG (Mulberry32) agar urutan soal acak tidak berubah saat refresh */
function seededShuffle(items, seedStr) {
  let h = 1779033703 ^ String(seedStr).length;
  for (let i = 0; i < String(seedStr).length; i++) {
    h = Math.imul(h ^ String(seedStr).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const rand = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };

  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function startOrResumeExam(examId, tokenCode = '') {
  const deviceToken = getOrCreateDeviceToken();
  const cleanToken = String(tokenCode || '').trim().toUpperCase();

  // 1. Coba panggil RPC start_exam_session
  try {
    const validUuid = (examId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(examId)) ? examId : null;
    const { data, error } = await supabase.rpc('start_exam_session', {
      p_exam_id: validUuid,
      p_token_code: cleanToken,
      p_device_token: deviceToken,
    });

    if (!error && data) return data;
    if (error && !error.message.includes('Fetch') && !error.message.includes('placeholder') && !error.message.includes('Network') && !error.message.includes('failed to fetch')) {
      console.warn('[start_exam_session RPC notice]:', error.message);
    }
  } catch (err) {
    console.warn('[start_exam_session RPC catch]:', err.message);
  }

  // 2. Direct query ke tabel public.exams di Supabase
  let activeExam = null;
  try {
    if (examId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(examId)) {
      const { data } = await supabase.from('exams').select('*').eq('id', examId).maybeSingle();
      if (data) activeExam = data;
    }

    if (!activeExam && cleanToken) {
      const { data } = await supabase.from('exams')
        .select('*')
        .ilike('token_code', cleanToken)
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) activeExam = data[0];
    }
  } catch (dbErr) {
    console.warn('[Direct Exam Lookup] Error:', dbErr);
  }

  // 3. Fallback ke SicakapDB cache lokal jika ada
  if (!activeExam && typeof window !== 'undefined' && window.SicakapDB) {
    activeExam = window.SicakapDB.getJadwalByToken ? window.SicakapDB.getJadwalByToken(cleanToken) : null;
  }

  // Jika ujian sama sekali tidak ditemukan, lemparkan error jelas
  if (!activeExam) {
    throw new Error('Ujian tidak ditemukan atau belum diaktifkan proktor.');
  }

  // 4. Buat atau ambil sesi ujian di public.exam_sessions
  let sessionData = null;
  try {
    const userRes = await supabase.auth.getUser();
    const user = userRes?.data?.user;
    if (user && activeExam.id) {
      const { data: existSess } = await supabase.from('exam_sessions')
        .select('*')
        .eq('exam_id', activeExam.id)
        .eq('student_id', user.id)
        .maybeSingle();

      if (existSess) {
        sessionData = existSess;
      } else {
        const { data: newSess, error: sessErr } = await supabase.from('exam_sessions').insert([{
          exam_id: activeExam.id,
          school_id: activeExam.school_id,
          student_id: user.id,
          status: 'in_progress',
          server_started_at: new Date().toISOString(),
          device_token: deviceToken,
        }]).select().maybeSingle();

        if (!sessErr && newSess) sessionData = newSess;
      }
    }
  } catch (sessCreateErr) {
    console.warn('[Create Exam Session] Notice:', sessCreateErr);
  }

  const durationMin = Number(activeExam.duration_minutes || activeExam.durasiMenit || activeExam.durasi || sessionStorage.getItem('sicakap_durasi')) || 60;
  const examTitle = activeExam.title || activeExam.namaUlangan || activeExam.subject || sessionStorage.getItem('sicakap_mapel') || 'Asesmen CBT SD';

  return {
    session: sessionData || {
      id: 'session-' + Date.now(),
      exam_id: activeExam.id,
      school_id: activeExam.school_id,
      student_id: 'current-student-id',
      status: 'in_progress',
      server_started_at: new Date().toISOString(),
      extra_minutes: 0,
      violation_count: 0,
    },
    exam: {
      id: activeExam.id,
      title: examTitle,
      subject: activeExam.subject || activeExam.mapel || examTitle,
      duration_minutes: durationMin,
      token_code: activeExam.token_code || activeExam.token || cleanToken,
      shuffle_questions: activeExam.shuffle_questions !== false,
      shuffle_options: activeExam.shuffle_options !== false,
      max_tab_switches: activeExam.max_tab_switches || 3,
    },
    server_now: new Date().toISOString(),
  };
}

export async function fetchExamQuestions(examId, sessionId, { shuffleQuestions, shuffleOptions }) {
  // Tabel questions aman: kunci jawaban tidak bocor
  let list = [];
  try {
    // 1. Coba ambil soal yang terikat ke exam_id
    if (examId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(examId)) {
      const { data, error } = await supabase
        .from('questions')
        .select('id, order_no, type, competency, stimulus, media_urls, prompt, options, points')
        .eq('exam_id', examId)
        .order('order_no', { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        list = data;
      }
    }

    // 2. Jika belum ada soal spesifik exam_id, ambil dari bank soal sekolah
    if (list.length === 0) {
      const { data: qData, error: qErr } = await supabase
        .from('questions')
        .select('id, order_no, type, competency, stimulus, media_urls, prompt, options, points, kelas')
        .order('order_no', { ascending: true })
        .limit(50);

      if (!qErr && Array.isArray(qData) && qData.length > 0) {
        list = qData;
      }
    }
  } catch (err) {
    console.warn('[SICAKAP] Fetch questions from Supabase fallback:', err);
  }

  // Fallback ke SicakapDB jika data soal di Supabase belum ada
  if (list.length === 0 && typeof window !== 'undefined' && window.SicakapDB) {
    const localSoals = window.SicakapDB.getSoal();
    if (Array.isArray(localSoals) && localSoals.length > 0) {
      // Hapus kunci jawaban agar tidak bocor ke sisi klien
      list = localSoals.map((s, idx) => {
        const { kunci, kunciJawaban, answer_key, ...safeSoal } = s;
        return {
          id: safeSoal.id || `Q-${idx + 1}`,
          order_no: idx + 1,
          type: safeSoal.type || 'single',
          competency: safeSoal.competency || safeSoal.mapel || 'Kompetensi SD',
          stimulus: safeSoal.stimulus || safeSoal.wacana || '',
          media_urls: safeSoal.media_urls || [],
          prompt: safeSoal.prompt || safeSoal.pertanyaan || '',
          options: safeSoal.options || safeSoal.opsi || safeSoal.pilihan || [],
          points: safeSoal.points || 1,
        };
      });
    }
  }

  if (shuffleQuestions && list.length > 0) {
    list = seededShuffle(list, sessionId);
  }
  if (shuffleOptions && list.length > 0) {
    list = list.map((q) => {
      if (['single', 'multiple'].includes(q.type) && Array.isArray(q.options)) {
        return { ...q, options: seededShuffle(q.options, `${sessionId}-${q.id}`) };
      }
      return q;
    });
  }
  return list;
}

export async function logViolation({ sessionId, schoolId, actorId, eventType, details = {}, currentCount = 0 }) {
  try {
    await supabase.from('proctor_logs').insert({
      session_id: sessionId,
      school_id: schoolId,
      actor_id: actorId,
      event_type: eventType,
      details,
    });

    await supabase
      .from('exam_sessions')
      .update({ violation_count: currentCount + 1 })
      .eq('id', sessionId);
  } catch (err) {
    console.warn('[SICAKAP] logViolation error:', err);
  }
}

export async function submitExamToServer(sessionId, finalAnswers = []) {
  let serverResult = null;
  try {
    const { data, error } = await supabase.functions.invoke('grade-exam', {
      body: { session_id: sessionId, final_answers: finalAnswers },
    });

    if (!error && data && !data.error) {
      serverResult = data;
    }
  } catch (err) {
    console.warn('[SICAKAP] Edge function grade-exam invocation fallback:', err);
  }

  const nowIso = new Date().toISOString();
  const dateStamp = nowIso.slice(0, 10).replace(/-/g, '');
  const shortHash = String(sessionId).replace(/-/g, '').slice(0, 8).toUpperCase();
  const receiptNumber = serverResult?.receipt_number || `CBT-${dateStamp}-${shortHash}`;

  // Direct persistence to Supabase: exam_sessions & exam_results + SicakapDB live score sync
  try {
    if (sessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      // 1. Update status sesi menjadi 'submitted'
      await supabase
        .from('exam_sessions')
        .update({
          status: 'submitted',
          submitted_at: nowIso,
        })
        .eq('id', sessionId);

      // 2. Query info sesi untuk hitung nilai
      const { data: sess } = await supabase
        .from('exam_sessions')
        .select('*, exams(*), profiles(*)')
        .eq('id', sessionId)
        .maybeSingle();

      if (sess) {
        const examId = sess.exam_id;
        const schoolId = sess.school_id;
        const studentId = sess.student_id;
        const p = sess.profiles;
        const e = sess.exams;

        // Ambil kunci jawaban
        const { data: qKeys } = await supabase
          .from('questions')
          .select('id, answer_key')
          .eq('exam_id', examId);

        const keyMap = {};
        (qKeys || []).forEach(q => {
          if (q.answer_key) keyMap[q.id] = String(q.answer_key).trim().toUpperCase();
        });

        let correct = 0;
        let wrong = 0;
        const total = (qKeys && qKeys.length > 0) ? qKeys.length : finalAnswers.length;

        finalAnswers.forEach(ans => {
          const qid = ans.question_id;
          const chosen = (ans.answer_payload?.value || ans.answer_payload?.selectedKey || ans.answer_payload || '').toString().trim().toUpperCase();
          const expected = keyMap[qid];
          if (expected && chosen) {
            if (chosen === expected) correct++;
            else wrong++;
          }
        });

        const score = total > 0 ? Math.round((correct / total) * 100) : 0;
        const kelas = p?.kelas || p?.class_name || e?.kelas || 'Kelas 5';
        const subject = e?.subject || e?.title || 'Asesmen CBT SD';

        // 3. Upsert ke public.exam_results
        await supabase.from('exam_results').upsert({
          session_id: sessionId,
          school_id: schoolId,
          exam_id: examId,
          student_id: studentId,
          kelas: kelas,
          subject: subject,
          score: score,
          total_questions: total,
          correct_count: correct,
          wrong_count: wrong,
          submitted_at: nowIso,
        }, { onConflict: 'session_id' });

        // 4. Update SicakapDB Live Scores agar proktor/guru langsung melihat update di dashboard
        if (typeof window !== 'undefined' && window.SicakapDB) {
          window.SicakapDB.syncLiveScoreFromSession({
            nisn: p?.identifier || sessionStorage.getItem('sicakap_nisn') || '0084928192',
            jadwalId: examId,
            mapel: subject,
            sisaDetik: 0,
            isLocked: false,
            jawabanMap: finalAnswers.reduce((acc, curr) => {
              acc[curr.question_id] = curr.answer_payload?.value || curr.answer_payload?.selectedKey || curr.answer_payload;
              return acc;
            }, {})
          });
        }
      }
    }
  } catch (dbSyncErr) {
    console.warn('[SICAKAP] Direct exam session & result persistence notice:', dbSyncErr);
  }

  return {
    receipt_number: receiptNumber,
    submitted_at: nowIso,
    answered_count: finalAnswers.length,
    total_questions: finalAnswers.length,
  };
}

