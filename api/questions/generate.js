import { createClient } from '@supabase/supabase-js';

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

    // 5. Prompt Ringkas Khusus SD Indonesia (Kurikulum Merdeka) agar respons cepat & hemat token
    const systemPrompt = `Pakar pembuat soal asesmen SD Kurikulum Merdeka Indonesia.
Hasilkan ${cleanJumlah} butir soal pilihan ganda A, B, C, D ramah anak SD sesuai jenjang kelas.
Ketentuan Wajib:
1. Tepat 1 kunci jawaban benar (A, B, C, atau D). Tiga opsi pengecoh logis dan mendidik.
2. Bahasa Indonesia baku dan sederhana. Stimulus cerita ringkas jika relevan.
3. Level kognitif: LOTS, MOTS, atau HOTS.
4. Output murni JSON Array sesuai schema.`;

    const userPrompt = `Buat ${cleanJumlah} butir soal pilihan ganda (opsi A, B, C, D) untuk:
- Mapel: ${mapel}
- Kelas: Kelas ${cleanKelas} SD
- Topik: ${topik}
- Kesulitan: ${tingkatKesulitan}
${materiReferensi ? `- Teks Referensi:\n"""\n${materiReferensi.slice(0, 1500)}\n"""` : ''}`;

    const schema = {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          pertanyaan: { type: 'STRING' },
          stimulus: { type: 'STRING' },
          opsi_a: { type: 'STRING' },
          opsi_b: { type: 'STRING' },
          opsi_c: { type: 'STRING' },
          opsi_d: { type: 'STRING' },
          kunci_jawaban: { type: 'STRING', enum: ['A', 'B', 'C', 'D'] },
          pembahasan: { type: 'STRING' },
          level_kognitif: { type: 'STRING', enum: ['LOTS', 'MOTS', 'HOTS'] },
          topik: { type: 'STRING' }
        },
        required: ['pertanyaan', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'kunci_jawaban', 'level_kognitif']
      }
    };

    // 6. Eksekusi ke Gemini REST API dengan Fallback Model & Thinking Budget = 0
    let requestedModel = process.env.GEMINI_MODEL;
    if (!requestedModel || requestedModel === 'gemini-1.5-flash') {
      requestedModel = 'gemini-2.5-flash-lite';
    }

    const fallbackList = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
    const candidateModels = Array.from(new Set([requestedModel, ...fallbackList]));

    let rawJsonText = null;
    let lastErr = null;
    let usedModel = null;

    for (const model of candidateModels) {
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), 25000); // 25s timeout per request

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

        const genConfig = {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.7
        };

        // Matikan internal thinking budget pada Gemini 2.5 Flash agar tidak delay/timeout
        if (model.includes('2.5')) {
          genConfig.thinkingConfig = { thinkingBudget: 0 };
        }

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
          }
        } else {
          const errJson = await geminiRes.json().catch(() => ({}));
          lastErr = errJson.error?.message || `HTTP ${geminiRes.status} on model ${model}`;
          console.warn(`[Gemini] Model ${model} returned error:`, lastErr, '- Mencoba model fallback...');
          continue;
        }
      } catch (e) {
        clearTimeout(timeoutTimer);
        lastErr = e.name === 'AbortError' ? `Timeout 25s pada model ${model}` : e.message;
        console.warn(`[Gemini] Network/timeout error on model ${model}:`, lastErr, '- Mencoba fallback...');
        continue;
      }
    }

    if (!rawJsonText) {
      return res.status(500).json({
        ok: false,
        error: `Gagal memanggil Gemini AI: ${lastErr || 'Respons kosong dari server AI.'}. Pastikan GEMINI_API_KEY valid di Vercel Settings.`
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

    if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
      return res.status(500).json({
        ok: false,
        error: 'Hasil AI tidak mengembalikan butir soal yang valid.'
      });
    }

    const normalizedQuestions = parsedArray.map((item, index) => {
      const kunciUpper = String(item.kunci_jawaban || 'A').trim().toUpperCase();
      const validKunci = ['A', 'B', 'C', 'D'].includes(kunciUpper) ? kunciUpper : 'A';

      const options = [
        { key: 'A', text: String(item.opsi_a || 'Pilihan A').trim() },
        { key: 'B', text: String(item.opsi_b || 'Pilihan B').trim() },
        { key: 'C', text: String(item.opsi_c || 'Pilihan C').trim() },
        { key: 'D', text: String(item.opsi_d || 'Pilihan D').trim() }
      ];

      return {
        id: `AI-${Date.now()}-${index + 1}`,
        mapel: mapel,
        tingkat: cleanKelas,
        kelas: `Kelas ${cleanKelas}`,
        tipe: 'single',
        stimulus: item.stimulus ? String(item.stimulus).trim() : '',
        wacana: item.stimulus ? String(item.stimulus).trim() : '',
        pertanyaan: String(item.pertanyaan || '').trim(),
        opsi: options,
        kunci: validKunci,
        pembahasan: item.pembahasan ? String(item.pembahasan).trim() : '',
        cpTp: item.topik ? `${item.topik} (Kelas ${cleanKelas} SD)` : `${topik} (Kelas ${cleanKelas} SD)`,
        levelKognitif: item.level_kognitif || 'MOTS',
        points: 1.00
      };
    });

    return res.status(200).json({
      ok: true,
      count: normalizedQuestions.length,
      modelUsed: usedModel || requestedModel || 'gemini-2.5-flash-lite',
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
