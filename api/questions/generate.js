import { createClient } from '@supabase/supabase-js';

// Cache in-memory untuk daftar model aktif Google Gemini agar tidak berulang kali ListModels
let cachedFlashModels = null;
let cachedModelsTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam

async function getAvailableFlashModels(apiKey) {
  if (cachedFlashModels && (Date.now() - cachedModelsTime < CACHE_TTL_MS)) {
    return cachedFlashModels;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const models = (data.models || [])
        .filter(m => {
          const methods = m.supportedGenerationMethods || [];
          const rawName = (m.name || '').replace(/^models\//, '').toLowerCase();
          if (!methods.includes('generateContent')) return false;
          if (!rawName.includes('flash')) return false;

          // Hapus total model lama & model non-teks
          const excludes = ['image', 'audio', 'tts', 'embedding', 'live', '2.0', '1.5', 'vision'];
          return !excludes.some(ex => rawName.includes(ex));
        })
        .map(m => m.name.replace(/^models\//, ''));

      // Urutkan versi terbaru di depan (3.x > 2.5 > lainnya)
      models.sort((a, b) => {
        const score = (str) => {
          const s = str.toLowerCase();
          if (s.includes('3.')) return 300;
          if (s.includes('2.5-flash-lite')) return 260;
          if (s.includes('2.5-flash')) return 250;
          if (s.includes('flash-latest')) return 240;
          return 100;
        };
        return score(b) - score(a);
      });

      if (models.length > 0) {
        cachedFlashModels = models;
        cachedModelsTime = Date.now();
        return models;
      }
    }
  } catch (err) {
    console.warn('[Gemini ListModels Warning]', err.message);
  }

  // Fallback aman default tanpa model usang
  return ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'];
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
      return res.status(500).json({ ok: false, error: 'Konfigurasi Supabase URL tidak ditemukan di environment.' });
    }

    // 1. Verifikasi Authorization Bearer Token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'Token otorisasi Bearer diperlukan.' });
    }
    const token = authHeader.split(' ')[1];

    const client = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: userErr } = await client.auth.getUser(token);
    if (userErr || !user) {
      return res.status(401).json({ ok: false, error: 'Sesi tidak valid atau telah berakhir. Silakan login kembali.' });
    }

    // 2. Otorisasi Role Guru, Admin Sekolah, atau Superadmin
    let callerRole = 'guru';
    let callerSchoolId = null;

    if (serviceRoleKey) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: callerProfile, error: profErr } = await adminClient
        .from('profiles')
        .select('id, role, school_id, kelas, class_name, is_active')
        .eq('id', user.id)
        .maybeSingle();

      if (profErr || !callerProfile) {
        return res.status(403).json({ ok: false, error: 'Profil pengguna tidak ditemukan.' });
      }

      callerRole = String(callerProfile.role || '').toLowerCase();
      if (callerRole !== 'guru' && callerRole !== 'admin_sekolah' && callerRole !== 'superadmin') {
        return res.status(403).json({ ok: false, error: 'Akses ditolak: Hanya Guru, Admin Sekolah, atau Superadmin yang berhak menggunakan Generator Soal AI.' });
      }

      if (callerProfile.is_active === false) {
        return res.status(403).json({ ok: false, error: 'Akun Anda sedang dinonaktifkan.' });
      }

      callerSchoolId = callerProfile.school_id;
    }

    // 3. Verifikasi Gemini API Key
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(503).json({
        ok: false,
        error: 'GEMINI_API_KEY belum dikonfigurasi di Vercel Environment Variables. Silakan tambahkan GEMINI_API_KEY di dashboard Vercel Project Settings > Environment Variables.'
      });
    }

    // 4. Parameter Request
    const {
      mapel = 'Matematika SD',
      kelas = '5',
      topik = 'Kurikulum Merdeka SD',
      materiReferensi = '',
      jumlah = 5,
      tingkatKesulitan = 'Campuran Proporsional'
    } = req.body || {};

    const cleanJumlah = Math.min(Math.max(parseInt(jumlah) || 5, 1), 25);
    const cleanKelas = String(kelas).replace(/[^0-9]/g, '') || '5';

    // 5. Prompt Padat & Terstandar (Format Murni JSON Array)
    const systemPrompt = `Pakar pembuat soal asesmen SD Kurikulum Merdeka Indonesia.
Hasilkan ${cleanJumlah} butir soal pilihan ganda A, B, C, D ramah anak SD.
Syarat:
1. Tepat 1 kunci jawaban benar ("A", "B", "C", atau "D"). 3 pengecoh logis & mendidik.
2. Bahasa Indonesia baku dan santun sesuai usia murid SD.
3. Stimulus cerita ringkas jika relevan.
4. Output WAJIB murni JSON Array objek tanpa teks pengantar di luar blok JSON.`;

    const userPrompt = `Buatkan ${cleanJumlah} butir soal pilihan ganda (opsi A, B, C, D) untuk:
- Mapel: ${mapel}
- Jenjang: Kelas ${cleanKelas} SD
- Topik: ${topik}
- Kesulitan: ${tingkatKesulitan}
${materiReferensi ? `- Teks Referensi:\n"""\n${materiReferensi.slice(0, 1500)}\n"""\n` : ''}
KEMBALIKAN HANYA JSON ARRAY OBJEK dengan struktur persis seperti ini:
[
  {
    "pertanyaan": "Teks pertanyaan jelas dan lugas...",
    "stimulus": "Wacana/cerita pengantar jika ada atau kosongkan",
    "opsi_a": "Teks opsi A",
    "opsi_b": "Teks opsi B",
    "opsi_c": "Teks opsi C",
    "opsi_d": "Teks opsi D",
    "kunci_jawaban": "A",
    "pembahasan": "Penjelasan ringkas mengapa jawaban tersebut benar",
    "level_kognitif": "LOTS",
    "topik": "${topik}"
  }
]`;

    // 6. Deteksi Otomatis Model Aktif + Fallback
    const candidateModels = [];

    // Jika ada GEMINI_MODEL di env dan bukan model usang (1.5 / 2.0), jadikan prioritas
    const envModel = process.env.GEMINI_MODEL?.trim();
    if (envModel && !envModel.includes('1.5') && !envModel.includes('2.0')) {
      candidateModels.push(envModel);
    }

    // Dapatkan model flash aktif dari API ListModels
    const activeFlashModels = await getAvailableFlashModels(geminiApiKey);
    for (const m of activeFlashModels) {
      if (!candidateModels.includes(m)) candidateModels.push(m);
    }

    // Default cadangan jika belum ada
    const safeDefaults = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'];
    for (const m of safeDefaults) {
      if (!candidateModels.includes(m)) candidateModels.push(m);
    }

    // Ambil maksimal 3 kandidat teratas
    const topCandidates = candidateModels.slice(0, 3);

    // Payload standar tanpa thinkingConfig agar kompatibel 100% dan tidak memicu HTTP 400
    const genConfig = {
      responseMimeType: 'application/json',
      temperature: 0.7
    };

    let rawJsonText = null;
    let usedModel = null;
    const attemptErrors = [];

    for (const model of topCandidates) {
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), 25000); // 25s timeout per percobaan

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

        const geminiRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: genConfig
          })
        });

        clearTimeout(timeoutTimer);

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const candidate = geminiData.candidates?.[0];
          const partText = candidate?.content?.parts?.[0]?.text;
          if (partText) {
            rawJsonText = partText;
            usedModel = model;
            break; // Sukses!
          } else {
            attemptErrors.push(`${model}: respons teks kosong`);
          }
        } else {
          const errJson = await geminiRes.json().catch(() => ({}));
          const errMsg = errJson.error?.message || `HTTP ${geminiRes.status}`;
          attemptErrors.push(`${model} (${errMsg})`);
          console.warn(`[Gemini] Model ${model} gagal:`, errMsg, '- Mencoba model berikutnya...');
          continue;
        }
      } catch (e) {
        clearTimeout(timeoutTimer);
        const errMsg = e.name === 'AbortError' ? 'timeout 25s' : e.message;
        attemptErrors.push(`${model} (${errMsg})`);
        console.warn(`[Gemini] Error pada ${model}:`, errMsg, '- Mencoba model berikutnya...');
        continue;
      }
    }

    if (!rawJsonText) {
      return res.status(500).json({
        ok: false,
        error: `Gagal memanggil Gemini AI. Percobaan: ${attemptErrors.join(' | ')}. Pastikan GEMINI_API_KEY valid di Vercel Settings.`
      });
    }

    // 7. Parse dan Normalisasi Output Soal
    let cleanText = rawJsonText.trim();
    if (cleanText.startsWith('```json')) cleanText = cleanText.slice(7);
    if (cleanText.startsWith('```')) cleanText = cleanText.slice(3);
    if (cleanText.endsWith('```')) cleanText = cleanText.slice(0, -3);
    cleanText = cleanText.trim();

    let parsedArray = null;
    try {
      parsedArray = JSON.parse(cleanText);
    } catch (parseErr) {
      console.error('[Gemini Parse Error]', parseErr, rawJsonText);
      return res.status(500).json({
        ok: false,
        error: `Gagal memproses hasil JSON dari Gemini: ${parseErr.message}`
      });
    }

    // Jika AI mengembalikan objek pembungkus { questions: [...] } atau { data: [...] }
    if (!Array.isArray(parsedArray)) {
      if (Array.isArray(parsedArray.questions)) parsedArray = parsedArray.questions;
      else if (Array.isArray(parsedArray.data)) parsedArray = parsedArray.data;
      else if (Array.isArray(parsedArray.soal)) parsedArray = parsedArray.soal;
    }

    if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
      return res.status(500).json({
        ok: false,
        error: 'Hasil AI tidak mengembalikan butir soal yang valid.'
      });
    }

    const normalizedQuestions = parsedArray.map((item, index) => {
      const kunciUpper = String(item.kunci_jawaban || item.kunci || 'A').trim().toUpperCase();
      const validKunci = ['A', 'B', 'C', 'D'].includes(kunciUpper) ? kunciUpper : 'A';

      const options = [
        { key: 'A', text: String(item.opsi_a || item.a || item.opsi?.[0]?.text || 'Pilihan A').trim() },
        { key: 'B', text: String(item.opsi_b || item.b || item.opsi?.[1]?.text || 'Pilihan B').trim() },
        { key: 'C', text: String(item.opsi_c || item.c || item.opsi?.[2]?.text || 'Pilihan C').trim() },
        { key: 'D', text: String(item.opsi_d || item.d || item.opsi?.[3]?.text || 'Pilihan D').trim() }
      ];

      return {
        id: `AI-${Date.now()}-${index + 1}`,
        mapel: mapel,
        tingkat: cleanKelas,
        kelas: `Kelas ${cleanKelas}`,
        tipe: 'single',
        stimulus: item.stimulus ? String(item.stimulus).trim() : '',
        wacana: item.stimulus ? String(item.stimulus).trim() : '',
        pertanyaan: String(item.pertanyaan || item.soal || '').trim(),
        opsi: options,
        kunci: validKunci,
        pembahasan: item.pembahasan ? String(item.pembahasan).trim() : '',
        cpTp: item.topik ? `${item.topik} (Kelas ${cleanKelas} SD)` : `${topik} (Kelas ${cleanKelas} SD)`,
        levelKognitif: item.level_kognitif || item.levelKognitif || 'MOTS',
        points: 1.00
      };
    });

    return res.status(200).json({
      ok: true,
      count: normalizedQuestions.length,
      modelUsed: usedModel || 'gemini',
      questions: normalizedQuestions
    });

  } catch (fatalErr) {
    console.error('[Unhandled Generator Error]:', fatalErr);
    return res.status(500).json({
      ok: false,
      error: `Internal Server Error: ${fatalErr.message || 'Terjadi kesalahan sistem saat merumuskan soal.'}`
    });
  }
}
