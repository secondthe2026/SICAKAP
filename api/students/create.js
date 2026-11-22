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

  // Ambil profil pemanggil dari database
  const { data: callerProfile, error: profErr } = await client
    .from('profiles')
    .select('id, role, school_id, kelas, class_name, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profErr || !callerProfile) {
    return res.status(403).json({ error: 'Profil pengguna pemanggil tidak ditemukan.' });
  }

  const callerRole = String(callerProfile.role || '').toLowerCase();
  if (callerRole !== 'guru' && callerRole !== 'admin_sekolah' && callerRole !== 'superadmin') {
    return res.status(403).json({ error: 'Akses ditolak: Hanya Guru, Admin Sekolah, atau Superadmin yang berhak membuat akun siswa.' });
  }

  if (callerProfile.is_active === false) {
    return res.status(403).json({ error: 'Akun Anda sedang dinonaktifkan.' });
  }

  const targetSchoolId = callerRole === 'superadmin' ? (req.body?.school_id || callerProfile.school_id) : callerProfile.school_id;
  if (!targetSchoolId) {
    return res.status(400).json({ error: 'School ID tidak ditemukan untuk akun ini.' });
  }

  if (!serviceRoleKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diatur di server.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Helper pemrosesan 1 siswa
  async function processStudentItem(item) {
    const rawNisn = item.nisn || item.identifier;
    const cleanNisn = String(rawNisn || '').trim().replace(/\s+/g, '');
    const nama = String(item.nama || item.full_name || '').trim();

    if (!cleanNisn) {
      throw new Error('NISN siswa wajib diisi.');
    }
    if (!nama) {
      throw new Error(`Nama siswa dengan NISN ${cleanNisn} wajib diisi.`);
    }

    // Normalisasi identifier internal auth email
    const authEmail = `${cleanNisn.toLowerCase()}@siswa.sicakap.local`;

    // Penentuan password: custom jika >=6 char, else NISN jika >=6 char, else 'cakap2026'
    let studentPwd = String(item.password || '').trim();
    if (!studentPwd || studentPwd.length < 6) {
      if (cleanNisn.length >= 6) {
        studentPwd = cleanNisn;
      } else {
        studentPwd = 'cakap2026';
      }
    }

    // Penentuan kelas: terkunci ke rombel guru jika pemanggil adalah guru
    let studentKelas = '';
    if (callerRole === 'guru') {
      studentKelas = callerProfile.kelas || callerProfile.class_name || item.kelas || item.rombel_id || 'Kelas 5';
    } else {
      studentKelas = item.kelas || item.rombel_id || item.class_name || 'Kelas 1';
    }

    let authUserId = null;

    // Coba buat akun Supabase Auth
    const { data: newAuth, error: createErr } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password: studentPwd,
      email_confirm: true,
      user_metadata: {
        role: 'siswa',
        school_id: targetSchoolId,
        nisn: cleanNisn,
        full_name: nama,
        kelas: studentKelas,
      },
    });

    if (!createErr && newAuth?.user) {
      authUserId = newAuth.user.id;
    } else if (createErr) {
      const errMsg = (createErr.message || '').toLowerCase();
      if (errMsg.includes('already registered') || errMsg.includes('already exists') || errMsg.includes('duplicate')) {
        // Cari user yang sudah ada
        const { data: existingProf } = await adminClient
          .from('profiles')
          .select('id, school_id')
          .or(`email.eq."${authEmail}",identifier.eq."${cleanNisn}"`)
          .maybeSingle();

        if (existingProf) {
          if (existingProf.school_id && existingProf.school_id !== targetSchoolId && callerRole !== 'superadmin') {
            throw new Error(`NISN ${cleanNisn} sudah terdaftar di sekolah lain.`);
          }
          authUserId = existingProf.id;
          await adminClient.auth.admin.updateUserById(authUserId, {
            password: studentPwd,
            email_confirm: true,
            user_metadata: {
              role: 'siswa',
              school_id: targetSchoolId,
              nisn: cleanNisn,
              full_name: nama,
              kelas: studentKelas,
            },
          });
        } else {
          // Cari via listUsers
          const { data: listData } = await adminClient.auth.admin.listUsers();
          const found = (listData?.users || []).find(u => u.email?.toLowerCase() === authEmail.toLowerCase());
          if (found) {
            authUserId = found.id;
            await adminClient.auth.admin.updateUserById(authUserId, {
              password: studentPwd,
              email_confirm: true,
              user_metadata: {
                role: 'siswa',
                school_id: targetSchoolId,
                nisn: cleanNisn,
                full_name: nama,
                kelas: studentKelas,
              },
            });
          } else {
            throw createErr;
          }
        }
      } else {
        throw createErr;
      }
    }

    if (!authUserId) {
      throw new Error(`Gagal mendapatkan ID Auth untuk siswa NISN ${cleanNisn}.`);
    }

    // Upsert profil siswa ke public.profiles
    const profilePayload = {
      id: authUserId,
      school_id: targetSchoolId,
      role: 'siswa',
      full_name: nama,
      identifier: cleanNisn,
      email: authEmail,
      kelas: studentKelas,
      class_name: studentKelas,
      initial_password: studentPwd,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await adminClient
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' });

    if (upsertErr) {
      throw upsertErr;
    }

    return {
      id: authUserId,
      nisn: cleanNisn,
      nama,
      kelas: studentKelas,
      password: studentPwd,
      login_email: authEmail,
    };
  }

  try {
    const body = req.body || {};

    // Kasus 1: Batch / Import Siswa (Array)
    if (Array.isArray(body.students)) {
      const results = [];
      let successCount = 0;
      let failCount = 0;

      for (const item of body.students) {
        try {
          const resStudent = await processStudentItem(item);
          results.push({ success: true, student: resStudent });
          successCount++;
        } catch (err) {
          results.push({
            success: false,
            nisn: item.nisn || item.identifier,
            nama: item.nama || item.full_name,
            error: err.message,
          });
          failCount++;
        }
      }

      return res.status(200).json({
        ok: true,
        message: `Import siswa selesai: ${successCount} berhasil, ${failCount} gagal.`,
        total: body.students.length,
        successCount,
        failCount,
        results,
      });
    }

    // Kasus 2: Single Student
    const singleResult = await processStudentItem(body);
    return res.status(200).json({
      ok: true,
      message: `Akun siswa "${singleResult.nama}" (NISN: ${singleResult.nisn}) berhasil dibuat & aktif di Supabase Auth.`,
      student: singleResult,
    });
  } catch (err) {
    console.error('[API Create Student] Error:', err);
    return res.status(500).json({ error: err.message || 'Gagal memproses pendaftaran akun siswa.' });
  }
}

