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

  if (!serviceRoleKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diatur di server environment.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ambil profil caller dari database menggunakan adminClient (aman dari pembatasan RLS anon)
  const { data: callerProfile, error: profErr } = await adminClient
    .from('profiles')
    .select('id, role, school_id, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profErr || !callerProfile) {
    return res.status(403).json({ error: 'Profil administrator tidak ditemukan di database.' });
  }

  const callerRole = String(callerProfile.role || '').toLowerCase();
  if (callerRole !== 'admin_sekolah' && callerRole !== 'superadmin') {
    return res.status(403).json({ error: 'Akses ditolak: Hanya Admin Sekolah atau Superadmin yang berhak membuat akun guru.' });
  }

  if (callerProfile.is_active === false) {
    return res.status(403).json({ error: 'Akun administrator Anda sedang dinonaktifkan.' });
  }

  const { nama, nip, email, mapel, rombelWali, password, school_id } = req.body || {};

  if (!nama || !String(nama).trim()) {
    return res.status(400).json({ error: 'Nama lengkap guru wajib diisi.' });
  }

  if (!rombelWali || !String(rombelWali).trim()) {
    return res.status(400).json({ error: 'Penugasan rombel/kelas (Kelas 1 - 6) wajib dipilih untuk akun Guru.' });
  }

  // Isolasi data: jika admin_sekolah, school_id WAJIB dari profil miliknya
  const targetSchoolId = callerRole === 'superadmin' ? (school_id || callerProfile.school_id) : callerProfile.school_id;
  if (!targetSchoolId) {
    return res.status(400).json({ error: 'School ID tidak ditemukan untuk akun administrator ini.' });
  }

  // 2. Normalisasi identifier login
  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  const cleanNip = nip ? String(nip).trim().replace(/\s+/g, '') : '';

  let authEmail = '';
  if (cleanEmail && cleanEmail.includes('@')) {
    authEmail = cleanEmail;
  } else if (cleanNip) {
    const sanitized = cleanNip.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    authEmail = `${sanitized}@guru.sicakap.local`;
  } else if (cleanEmail) {
    const sanitized = cleanEmail.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    authEmail = `${sanitized}@guru.sicakap.local`;
  } else {
    return res.status(400).json({ error: 'Email atau NIP wajib diisi sebagai identitas login guru.' });
  }

  const teacherPassword = String(password || 'cakap2026').trim();
  if (teacherPassword.length < 6) {
    return res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
  }

  try {
    let authUserId = null;

    // 3. Buat akun di Supabase Auth via admin API
    const { data: newAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password: teacherPassword,
      email_confirm: true,
      user_metadata: {
        role: 'guru',
        school_id: targetSchoolId,
        full_name: String(nama).trim(),
        kelas: String(rombelWali).trim(),
      },
    });

    if (!createAuthErr && newAuth?.user) {
      authUserId = newAuth.user.id;
    } else if (createAuthErr) {
      // Tangani kasus user sudah terdaftar sebelumnya di Auth (update password & reaktivasi)
      const errMsg = (createAuthErr.message || '').toLowerCase();
      if (errMsg.includes('already registered') || errMsg.includes('duplicate') || errMsg.includes('already exists')) {
        // Cari user yang sudah ada
        const { data: existingProfile } = await adminClient
          .from('profiles')
          .select('id, school_id')
          .or(`email.eq."${authEmail}",identifier.eq."${cleanNip || authEmail}"`)
          .maybeSingle();

        if (existingProfile) {
          if (existingProfile.school_id && existingProfile.school_id !== targetSchoolId && callerRole !== 'superadmin') {
            return res.status(400).json({ error: 'Email atau NIP ini sudah terdaftar di sekolah lain.' });
          }
          authUserId = existingProfile.id;
          await adminClient.auth.admin.updateUserById(authUserId, {
            password: teacherPassword,
            email_confirm: true,
            user_metadata: {
              role: 'guru',
              school_id: targetSchoolId,
              full_name: String(nama).trim(),
              kelas: String(rombelWali).trim(),
            },
          });
        } else {
          // Cari via listUsers
          const { data: listData } = await adminClient.auth.admin.listUsers();
          const foundUser = (listData?.users || []).find(u => u.email?.toLowerCase() === authEmail.toLowerCase());
          if (foundUser) {
            authUserId = foundUser.id;
            await adminClient.auth.admin.updateUserById(authUserId, {
              password: teacherPassword,
              email_confirm: true,
              user_metadata: {
                role: 'guru',
                school_id: targetSchoolId,
                full_name: String(nama).trim(),
                kelas: String(rombelWali).trim(),
              },
            });
          } else {
            throw createAuthErr;
          }
        }
      } else {
        throw createAuthErr;
      }
    }

    if (!authUserId) {
      throw new Error('Gagal mendapatkan ID pengguna Supabase Auth.');
    }

    // 4. Upsert data profil ke public.profiles
    const profileData = {
      id: authUserId,
      school_id: targetSchoolId,
      role: 'guru',
      full_name: String(nama).trim(),
      email: cleanEmail || authEmail,
      identifier: cleanNip || cleanEmail || authEmail,
      nip: cleanNip || null,
      subject: (mapel || '').trim(),
      kelas: String(rombelWali).trim(),
      class_name: String(rombelWali).trim(),
      initial_password: teacherPassword,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    let { error: upsertErr } = await adminClient
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' });

    // Fallback jika database Supabase belum menjalankan ALTER TABLE kolom spesifik
    if (upsertErr && (upsertErr.message?.includes('column') || upsertErr.code === '42703')) {
      console.warn('[API Create Teacher] Column missing in profiles, retrying with core columns:', upsertErr.message);
      const coreProfileData = {
        id: authUserId,
        school_id: targetSchoolId,
        role: 'guru',
        full_name: String(nama).trim(),
        identifier: cleanNip || cleanEmail || authEmail,
        class_name: String(rombelWali).trim(),
        kelas: String(rombelWali).trim(),
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      const retryResult = await adminClient
        .from('profiles')
        .upsert(coreProfileData, { onConflict: 'id' });
      upsertErr = retryResult.error;
    }

    if (upsertErr) {
      throw new Error(`Gagal menyimpan data profil guru ke tabel profiles: ${upsertErr.message}`);
    }

    // 5. Kaitkan Guru ke tabel classes sebagai wali kelas (homeroom_teacher_id)
    try {
      const cleanRombel = String(rombelWali).trim();
      const gradeMatch = cleanRombel.match(/\d+/);
      const gradeLevel = gradeMatch ? gradeMatch[0] : null;

      // Update classes where school_id = targetSchoolId and name matches
      await adminClient
        .from('classes')
        .update({ homeroom_teacher_id: authUserId })
        .eq('school_id', targetSchoolId)
        .or(`name.ilike."%${cleanRombel}%",name.ilike."%${cleanRombel.replace(/^kelas\s*/i, '')}%"`);

      if (gradeLevel) {
        await adminClient
          .from('classes')
          .update({ homeroom_teacher_id: authUserId })
          .eq('school_id', targetSchoolId)
          .eq('grade_level', gradeLevel)
          .is('homeroom_teacher_id', null);
      }
    } catch (classLinkErr) {
      console.warn('[API Create Teacher] Class link warning (safe ignore):', classLinkErr);
    }

    return res.status(200).json({
      ok: true,
      message: `Akun login guru "${nama}" berhasil dibuat & disinkronkan ke Supabase Auth.`,
      teacher: {
        id: authUserId,
        nama: String(nama).trim(),
        nip: cleanNip,
        email: cleanEmail || authEmail,
        login_identifier: authEmail,
        mapel: (mapel || '').trim(),
        rombelWali: String(rombelWali).trim(),
        initial_password: teacherPassword,
      },
    });
  } catch (err) {
    console.error('[API Create Teacher] Error:', err);
    return res.status(500).json({ error: err.message || 'Gagal memproses pembuatan akun guru.' });
  }
}

