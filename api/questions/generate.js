import { createClient } from '@supabase/supabase-js';

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
      return res.status(403).json({ error: 'Profil pengguna tidak ditemukan.' });
    }

    callerRole = String(callerProfile.role || '').toLowerCase();
    if (callerRole !== 'guru' && callerRole !== 'admin_sekolah' && callerRole !== 'superadmin') {
      return res.status(403).json({ error: 'Akses ditolak: Hanya Guru, Admin Sekolah, atau Superadmin yang berhak menggunakan Generator Soal AI.' });
    }

    if (callerProfile.is_active === false) {
      return res.status(403).json({ error: 'Akun Anda sedang dinonaktifkan.' });
    }

    callerSchoolId = callerProfile.school_id;
  }

  // 3. Verifikasi Gemini API Key
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return res.status(503).json({
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

  // 5. Konstruksi Prompt Khusus SD Indonesia (Kurikulum Merdeka)
  const systemPrompt = `Anda adalah pakar pembuat soal asesmen pendidikan Sekolah Dasar (SD) Indonesia berbasis Kurikulum Merdeka (Asesmen Formatif & Sumatif AKM).
Tugas Anda adalah menghasilkan butir soal pilihan ganda berkualitas tinggi, edukatif, dan ramah anak SD dengan 4 opsi pilihan: A, B, C, D.

Pedoman Wajib:
1. Sesuai Tingkat Perkembangan Usia Siswa SD:
   - Kelas 1-2 (Fase A): Kalimat pendek, kosakata konkret, ilustrasi/cerita sangat sederhana.
   - Kelas 3-4 (Fase B): Kalimat informatif, konteks lingkungan sekitar, logika operasional konkret.
   - Kelas 5-6 (Fase C): Literasi membaca naratif/informasional, numerasi cerita terapan, penalaran logis.
2. Karakteristik Soal:
   - Bahasa Indonesia baku, santun, tidak membingungkan anak SD.
   - Setiap soal WAJIB memiliki TEPAT SATU kunci jawaban yang benar dan tak terbantahkan.
   - Tiga opsi pengecoh (distractor) harus masuk akal, logis, tidak konyol, dan mendidik.
   - Sertakan stimulus/wacana singkat (cerita sehari-hari anak Indonesia, sains alam, atau budaya nusantara) jika relevan.
3. Level Kognitif:
   - LOTS: Pemahaman dasar & ingatan fakta kontekstual.
   - MOTS: Penerapan konsep dalam pemecahan masalah sederhana.
   - HOTS: Analisis, perbandingan, evaluasi, dan kesimpulan logis.
4. Output harus murni JSON Array objek sesuai schema. Jangan sertakan teks markdown di luar blok JSON.`;

  const userPrompt = `Buatkan ${cleanJumlah} butir soal pilihan ganda (opsi A, B, C, D) untuk:
- Mata Pelajaran: ${mapel}
- Jenjang: Kelas ${cleanKelas} SD
- Topik / Materi Pokok: ${topik}
- Tingkat Kesulitan: ${tingkatKesulitan}
${materiReferensi ? `- Referensi Bahan Ajar / Teks Stimulus: \n"""\n${materiReferensi}\n"""` : ''}

Pastikan opsi A, B, C, D memiliki teks yang jelas, kunci_jawaban berupa salah satu dari "A", "B", "C", atau "D", serta sertakan pembahasan ringkas yang mudah dipahami murid SD.`;

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

  // 6. Eksekusi ke Gemini REST API dengan Fallback Model
  const candidateModels = [
    process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ];

  let rawJsonText = null;
  let lastErr = null;

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.7
          }
        })
      });

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const candidate = geminiData.candidates?.[0];
        const partText = candidate?.content?.parts?.[0]?.text;
        if (partText) {
          rawJsonText = partText;
          break; // Sukses!
        }
      } else {
        const errJson = await geminiRes.json().catch(() => ({}));
        lastErr = errJson.error?.message || `HTTP ${geminiRes.status} on model ${model}`;
        console.warn(`[Gemini] Model ${model} returned error:`, lastErr);
        // Jika 404 model not found, lanjut ke kandidat model berikutnya
        if (geminiRes.status === 404) continue;
        // Jika 400 atau 403 atau quota exceeded, simpan error
        if (geminiRes.status === 403 || geminiRes.status === 429) break;
      }
    } catch (e) {
      lastErr = e.message;
      console.warn(`[Gemini] Network error on model ${model}:`, e);
    }
  }

  if (!rawJsonText) {
    return res.status(500).json({
      error: `Gagal memanggil Gemini AI: ${lastErr || 'Respons kosong dari server AI.'}. Pastikan GEMINI_API_KEY valid.`
    });
  }

  // 7. Parse dan Normalisasi Output Soal
  try {
    let cleanText = rawJsonText.trim();
    if (cleanText.startsWith('```json')) cleanText = cleanText.slice(7);
    if (cleanText.startsWith('```')) cleanText = cleanText.slice(3);
    if (cleanText.endsWith('```')) cleanText = cleanText.slice(0, -3);
    cleanText = cleanText.trim();

    const parsedArray = JSON.parse(cleanText);
    if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
      throw new Error('Hasil AI bukan berupa array butir soal.');
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
      modelUsed: 'gemini',
      questions: normalizedQuestions
    });
  } catch (parseErr) {
    console.error('[Gemini Parse Error]', parseErr, rawJsonText);
    return res.status(500).json({
      error: `Gagal memproses hasil JSON dari Gemini: ${parseErr.message}`
    });
  }
}

