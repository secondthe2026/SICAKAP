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

  // 1. Verifikasi caller
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token otorisasi Bearer diperlukan.' });
  }
  const token = authHeader.split(' ')[1];

  const client = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: userErr } = await client.auth.getUser(token);
  if (userErr || !user) {
    return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir.' });
  }

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
    return res.status(403).json({ error: 'Akses ditolak: Hanya Guru atau Admin Sekolah yang berhak mereset password siswa.' });
  }

  const { student_id, nisn, new_password } = req.body || {};
  if (!student_id && !nisn) {
    return res.status(400).json({ error: 'ID siswa atau NISN wajib disertakan.' });
  }

  if (!serviceRoleKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diatur di server.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const targetSchoolId = callerProfile.school_id;

    // Cari profil siswa
    let query = adminClient.from('profiles').select('*').eq('role', 'siswa');
    if (student_id) {
      query = query.eq('id', student_id);
    } else if (nisn) {
      query = query.eq('identifier', String(nisn).trim());
    }

    if (callerRole !== 'superadmin' && targetSchoolId) {
      query = query.eq('school_id', targetSchoolId);
    }

    const { data: studentProfile, error: sErr } = await query.maybeSingle();

    if (sErr || !studentProfile) {
      // Coba cari alternatif by identifier jika sebelumnya dicari by student_id
      if (nisn) {
        const { data: altProf } = await adminClient
          .from('profiles')
          .select('*')
          .eq('identifier', String(nisn).trim())
          .eq('school_id', targetSchoolId)
          .maybeSingle();
        if (altProf) {
          studentProfile = altProf;
        }
      }
    }

    const cleanNisn = studentProfile?.identifier || String(nisn || '').trim();
    if (!cleanNisn) {
      return res.status(404).json({ error: 'Data siswa tidak ditemukan di database.' });
    }

    // Tentukan password baru
    let targetPassword = String(new_password || '').trim();
    if (!targetPassword || targetPassword.length < 6) {
      if (cleanNisn.length >= 6) {
        targetPassword = cleanNisn;
      } else {
        targetPassword = 'cakap2026';
      }
    }

    const authEmail = studentProfile?.email || `${cleanNisn.toLowerCase()}@siswa.sicakap.local`;
    let authUserId = studentProfile?.id;

    // Periksa apakah user sudah ada di auth.users
    let userExistsInAuth = false;
    if (authUserId) {
      try {
        const { data: userCheck } = await adminClient.auth.admin.getUserById(authUserId);
        if (userCheck?.user) {
          userExistsInAuth = true;
        }
      } catch (err) {
        userExistsInAuth = false;
      }
    }

    if (userExistsInAuth) {
      // Update password di Supabase Auth
      const { error: updErr } = await adminClient.auth.admin.updateUserById(authUserId, {
        password: targetPassword,
        email_confirm: true,
      });
      if (updErr) throw updErr;
    } else {
      // Belum ada di Auth (legacy record), buatkan akun Auth baru
      const { data: newAuth, error: createErr } = await adminClient.auth.admin.createUser({
        email: authEmail,
        password: targetPassword,
        email_confirm: true,
        user_metadata: {
          role: 'siswa',
          school_id: targetSchoolId,
          nisn: cleanNisn,
          full_name: studentProfile?.full_name || 'Siswa SD',
          kelas: studentProfile?.kelas || callerProfile.kelas || 'Kelas 5',
        },
      });

      if (createErr) {
        const errMsg = (createErr.message || '').toLowerCase();
        if (errMsg.includes('already registered') || errMsg.includes('already exists') || errMsg.includes('duplicate')) {
          const { data: listUsers } = await adminClient.auth.admin.listUsers();
          const found = (listUsers?.users || []).find(u => u.email?.toLowerCase() === authEmail.toLowerCase());
          if (found) {
            authUserId = found.id;
            await adminClient.auth.admin.updateUserById(authUserId, {
              password: targetPassword,
              email_confirm: true,
            });
          } else {
            throw createErr;
          }
        } else {
          throw createErr;
        }
      } else if (newAuth?.user) {
        authUserId = newAuth.user.id;
      }
    }

    // Update profil di public.profiles
    const profileUpdate = {
      id: authUserId,
      school_id: targetSchoolId,
      role: 'siswa',
      full_name: studentProfile?.full_name || 'Siswa SD',
      identifier: cleanNisn,
      email: authEmail,
      kelas: studentProfile?.kelas || callerProfile.kelas || 'Kelas 5',
      class_name: studentProfile?.class_name || studentProfile?.kelas || callerProfile.kelas || 'Kelas 5',
      initial_password: targetPassword,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await adminClient
      .from('profiles')
      .upsert(profileUpdate, { onConflict: 'id' });

    if (upsertErr) throw upsertErr;

    return res.status(200).json({
      ok: true,
      message: `Password siswa "${profileUpdate.full_name}" (NISN: ${cleanNisn}) berhasil direset & diaktifkan ke "${targetPassword}".`,
      student: {
        id: authUserId,
        nisn: cleanNisn,
        nama: profileUpdate.full_name,
        password: targetPassword,
        email: authEmail,
      },
    });
  } catch (err) {
    console.error('[API Reset Student Password] Error:', err);
    return res.status(500).json({ error: err.message || 'Gagal mereset kata sandi siswa.' });
  }
}

