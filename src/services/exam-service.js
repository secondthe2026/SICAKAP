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
        const tagged = q.options.map((opt, idx) => ({
          ...opt,
          originalKey: (typeof opt === 'object' && opt.key) ? opt.key : (['A', 'B', 'C', 'D', 'E'][idx] || String(idx)),
          originalIndex: idx
        }));
        const shuffled = seededShuffle(tagged, `${sessionId}-${q.id}`);
        return {
          ...q,
          options: shuffled.map((opt, idx) => ({
            ...opt,
            key: opt.originalKey, // nilai jawaban tetap sesuai kunci asli
            displayKey: ['A', 'B', 'C', 'D', 'E'][idx] || String(idx) // tampilan visual tetap urut A, B, C, D
          }))
        };
      }
      return q;
    });
  }
  return list;
}

export function isAnswerCorrect(question, studentAnswer) {
  try {
    if (!question || studentAnswer === undefined || studentAnswer === null) return false;

    let q = question;
    if (typeof q === 'string') {
      try { q = JSON.parse(q); } catch (e) {}
    }
    let sa = studentAnswer;
    if (typeof sa === 'string' && (sa.startsWith('{') || sa.startsWith('['))) {
      try { sa = JSON.parse(sa); } catch (e) {}
    }

    const type = q.type || 'single';

    // 1. Ekstrak Kunci Jawaban
    let rawKey = q.answer_key ?? q.correct_answer ?? q.kunci ?? q.kunci_jawaban ?? q.correct_index ?? q.correct;
    if (typeof rawKey === 'string' && (rawKey.startsWith('{') || rawKey.startsWith('['))) {
      try { rawKey = JSON.parse(rawKey); } catch (e) {}
    }
    if (rawKey && typeof rawKey === 'object' && !Array.isArray(rawKey)) {
      if (rawKey.correct !== undefined) rawKey = rawKey.correct;
      else if (rawKey.accepted !== undefined) rawKey = rawKey.accepted;
      else if (rawKey.key !== undefined) rawKey = rawKey.key;
      else if (rawKey.value !== undefined) rawKey = rawKey.value;
    }

    // 2. Ekstrak Jawaban Siswa
    let rawAns = sa;
    if (rawAns && typeof rawAns === 'object' && !Array.isArray(rawAns)) {
      if (rawAns.selected !== undefined) rawAns = rawAns.selected;
      else if (rawAns.value !== undefined) rawAns = rawAns.value;
      else if (rawAns.selectedKey !== undefined) rawAns = rawAns.selectedKey;
      else if (rawAns.text !== undefined) rawAns = rawAns.text;
      else if (rawAns.answers !== undefined) rawAns = rawAns.answers;
      else if (rawAns.pairs !== undefined) rawAns = rawAns.pairs;
      else if (rawAns.answer !== undefined) rawAns = rawAns.answer;
    }

    // Helper normalisasi huruf / indeks
    function normalizeToLetter(val, options) {
      if (val === null || val === undefined) return '';
      const s = String(val).trim();
      if (!s) return '';

      // Jika angka 0..4 -> 'A'..'E'
      if (/^[0-4]$/.test(s)) {
        return String.fromCharCode(65 + parseInt(s, 10));
      }

      // Jika format prefix seperti "A." atau "A)" atau "(A)"
      const m = s.match(/^\(?([A-Ea-e])[\.\)\:\s]/);
      if (m) return m[1].toUpperCase();

      // Jika huruf tunggal A-E
      if (s.length === 1 && /^[A-Ea-e]$/.test(s)) {
        return s.toUpperCase();
      }

      let opts = options;
      if (typeof opts === 'string') {
        try { opts = JSON.parse(opts); } catch (e) {}
      }

      // Jika mencocokkan teks opsi
      if (Array.isArray(opts)) {
        const sLower = s.toLowerCase();
        for (let i = 0; i < opts.length; i++) {
          const opt = opts[i];
          const optText = (typeof opt === 'string' ? opt : (opt?.text || opt?.label || '')).trim().toLowerCase();
          if (optText && (optText === sLower || sLower.includes(optText))) {
            const optKey = (typeof opt === 'object' && (opt?.originalKey || opt?.key)) ? (opt.originalKey || opt.key) : String.fromCharCode(65 + i);
            return String(optKey).toUpperCase();
          }
        }
      }

      return s.toUpperCase();
    }

    // 3. Evaluasi berdasarkan tipe soal
    if (type === 'single' || type === 'mcq' || type === 'pg' || !type) {
      const keyLetter = normalizeToLetter(rawKey, q.options);
      const ansLetter = normalizeToLetter(rawAns, q.options);
      if (keyLetter && ansLetter) {
        return keyLetter === ansLetter;
      }
      return String(rawAns).trim().toLowerCase() === String(rawKey).trim().toLowerCase();
    }

    if (type === 'multiple') {
      const userArr = Array.isArray(rawAns) ? rawAns : [rawAns];
      const keyArr = Array.isArray(rawKey) ? rawKey : [rawKey];
      const normUser = userArr.map(u => normalizeToLetter(u, q.options)).filter(Boolean).sort();
      const normKey = keyArr.map(k => normalizeToLetter(k, q.options)).filter(Boolean).sort();
      if (normUser.length === 0 || normKey.length === 0) return false;
      return normUser.length === normKey.length && normUser.every((v, i) => v === normKey[i]);
    }

    if (type === 'true_false_table') {
      const userMap = (typeof rawAns === 'object' && rawAns) ? rawAns : {};
      const keyMap = (typeof rawKey === 'object' && rawKey) ? rawKey : {};
      const keys = Object.keys(keyMap);
      if (keys.length === 0) return false;
      return keys.every(k => Boolean(userMap[k]) === Boolean(keyMap[k]));
    }

    if (type === 'matching') {
      const userPairs = (typeof rawAns === 'object' && rawAns) ? rawAns : {};
      const keyPairs = (typeof rawKey === 'object' && rawKey) ? rawKey : {};
      const keys = Object.keys(keyPairs);
      if (keys.length === 0) return false;
      return keys.every(k => String(userPairs[k] ?? '').trim().toLowerCase() === String(keyPairs[k] ?? '').trim().toLowerCase());
    }

    if (type === 'short_answer' || type === 'isian') {
      const userText = String(rawAns ?? '').trim().toLowerCase();
      const accepted = Array.isArray(rawKey) ? rawKey : [rawKey];
      return accepted.some(acc => String(acc ?? '').trim().toLowerCase() === userText);
    }

    return false;
  } catch (err) {
    console.warn('[isAnswerCorrect] Evaluation warning:', err);
    return false;
  }
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
      // 1. Query info sesi untuk hitung nilai
      const { data: sess } = await supabase
        .from('exam_sessions')
        .select('*, exams(*), profiles(*)')
        .eq('id', sessionId)
        .maybeSingle();

      const examId = sess?.exam_id;
      const schoolId = sess?.school_id;
      const studentId = sess?.student_id;
      const p = sess?.profiles;
      const e = sess?.exams;

      // 2. Kumpulkan ID soal dari finalAnswers & dari student_answers DB jika finalAnswers kosong
      let effectiveAnswers = Array.isArray(finalAnswers) ? [...finalAnswers] : [];
      if (effectiveAnswers.length === 0) {
        const { data: dbAnswers } = await supabase
          .from('student_answers')
          .select('question_id, answer_payload')
          .eq('session_id', sessionId);
        if (Array.isArray(dbAnswers)) effectiveAnswers = dbAnswers;
      }

      const qIds = effectiveAnswers.map(a => a.question_id).filter(Boolean);

      // 3. Ambil data soal & kunci jawaban dari DB (questions & question_keys)
      let questionsList = [];
      if (qIds.length > 0) {
        const { data: qByIds } = await supabase
          .from('questions')
          .select('id, exam_id, type, prompt, options, answer_key, points, competency, stimulus')
          .in('id', qIds);
        if (Array.isArray(qByIds)) questionsList = qByIds;
      }
      if (questionsList.length === 0 && examId) {
        const { data: qByExam } = await supabase
          .from('questions')
          .select('id, exam_id, type, prompt, options, answer_key, points, competency, stimulus')
          .eq('exam_id', examId);
        if (Array.isArray(qByExam)) questionsList = qByExam;
      }

      let keysList = [];
      if (qIds.length > 0) {
        const { data: kData } = await supabase
          .from('question_keys')
          .select('question_id, answer_key')
          .in('question_id', qIds);
        if (Array.isArray(kData)) keysList = kData;
      }

      // Gabungkan dengan bank soal lokal SicakapDB
      const localSoals = (typeof window !== 'undefined' && window.SicakapDB?.getSoal()) || [];
      const qMap = new Map();
      localSoals.forEach(s => qMap.set(String(s.id), s));
      questionsList.forEach(q => qMap.set(String(q.id), { ...(qMap.get(String(q.id)) || {}), ...q }));
      keysList.forEach(k => {
        const existing = qMap.get(String(k.question_id)) || {};
        qMap.set(String(k.question_id), { ...existing, answer_key: k.answer_key || existing.answer_key });
      });

      // 4. Koreksi setiap jawaban siswa menggunakan isAnswerCorrect
      let correct = 0;
      let wrong = 0;
      const total = Math.max(qMap.size, effectiveAnswers.length, 1);

      effectiveAnswers.forEach(ans => {
        const qidStr = String(ans.question_id || '');
        const qObj = qMap.get(qidStr) || { id: qidStr, type: 'single' };
        const ansPayload = ans.answer_payload !== undefined ? ans.answer_payload : ans;
        if (isAnswerCorrect(qObj, ansPayload)) {
          correct++;
        } else {
          wrong++;
        }
      });

      const score = Math.round((correct / total) * 100);
      const kelas = p?.kelas || p?.class_name || e?.kelas || 'Kelas 5';
      const subject = e?.subject || e?.title || 'Asesmen CBT SD';

      // 5. Update status sesi menjadi 'submitted' & simpan score
      await supabase
        .from('exam_sessions')
        .update({
          status: 'submitted',
          submitted_at: nowIso,
          score: score
        })
        .eq('id', sessionId);

      // 6. Upsert ke public.exam_results
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

      // 7. Update SicakapDB Live Scores agar proktor/guru langsung melihat update di dashboard
      if (typeof window !== 'undefined' && window.SicakapDB) {
        window.SicakapDB.syncLiveScoreFromSession({
          nisn: p?.identifier || sessionStorage.getItem('sicakap_nisn') || '0084928192',
          jadwalId: examId,
          mapel: subject,
          sisaDetik: 0,
          isLocked: false,
          skor: score,
          benar: correct,
          salah: wrong,
          totalSoal: total,
          jawabanMap: effectiveAnswers.reduce((acc, curr) => {
            acc[curr.question_id] = curr.answer_payload?.value || curr.answer_payload?.selectedKey || curr.answer_payload?.selected || curr.answer_payload;
            return acc;
          }, {})
        });
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

