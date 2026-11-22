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

  if (!serviceRoleKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diatur di server.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile, error: profErr } = await adminClient
    .from('profiles')
    .select('id, role, school_id, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profErr || !callerProfile) {
    return res.status(403).json({ error: 'Profil administrator tidak ditemukan.' });
  }

  const callerRole = String(callerProfile.role || '').toLowerCase();
  if (callerRole !== 'admin_sekolah' && callerRole !== 'superadmin') {
    return res.status(403).json({ error: 'Akses ditolak: Hanya Admin Sekolah atau Superadmin yang berhak mereset password guru.' });
  }

  const { teacher_id, new_password, nama, nip, email, mapel, rombelWali } = req.body || {};
  if (!teacher_id && !email && !nip) {
    return res.status(400).json({ error: 'ID guru, Email, atau NIP wajib disertakan.' });
  }

  const targetPassword = String(new_password || 'cakap2026').trim();
  if (targetPassword.length < 6) {
    return res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
  }

  try {
    const targetSchoolId = callerProfile.school_id;

    // Cari profil guru yang hendak direset
    let query = adminClient.from('profiles').select('*');
    if (teacher_id) {
      query = query.eq('id', teacher_id);
    } else if (email) {
      query = query.eq('email', String(email).trim().toLowerCase());
    } else if (nip) {
      query = query.eq('nip', String(nip).trim());
    }

    if (callerRole !== 'superadmin' && targetSchoolId) {
      query = query.eq('school_id', targetSchoolId);
    }

    const { data: teacherProfile } = await query.maybeSingle();

    let authUserId = teacherProfile?.id;
    let authEmail = teacherProfile?.email;

    if (!authEmail) {
      const cleanEmail = email ? String(email).trim().toLowerCase() : '';
      const cleanNip = (nip || teacherProfile?.nip) ? String(nip || teacherProfile?.nip).trim().replace(/\s+/g, '') : '';
      if (cleanEmail && cleanEmail.includes('@')) {
        authEmail = cleanEmail;
      } else if (cleanNip) {
        authEmail = `${cleanNip.toLowerCase().replace(/[^a-z0-9._-]/g, '')}@guru.sicakap.local`;
      } else {
        authEmail = `${cleanEmail.replace(/[^a-z0-9._-]/g, '')}@guru.sicakap.local`;
      }
    }

    // Periksa apakah user ada di auth.users
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
      // Update password di Auth
      const { error: updErr } = await adminClient.auth.admin.updateUserById(authUserId, {
        password: targetPassword,
        email_confirm: true,
      });
      if (updErr) throw updErr;
    } else {
      // Belum ada di Auth (misal data legacy), buatkan akun Auth baru
      const { data: newAuth, error: createErr } = await adminClient.auth.admin.createUser({
        email: authEmail,
        password: targetPassword,
        email_confirm: true,
        user_metadata: {
          role: 'guru',
          school_id: targetSchoolId,
          full_name: nama || teacherProfile?.full_name || 'Guru SD',
          kelas: rombelWali || teacherProfile?.kelas || '',
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
      role: 'guru',
      full_name: nama || teacherProfile?.full_name || 'Guru SD',
      email: authEmail,
      identifier: nip || teacherProfile?.nip || authEmail,
      nip: nip || teacherProfile?.nip || null,
      subject: mapel || teacherProfile?.subject || '',
      kelas: rombelWali || teacherProfile?.kelas || '',
      class_name: rombelWali || teacherProfile?.class_name || rombelWali || teacherProfile?.kelas || '',
      initial_password: targetPassword,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    let { error: upsertErr } = await adminClient
      .from('profiles')
      .upsert(profileUpdate, { onConflict: 'id' });

    if (upsertErr && (upsertErr.message?.includes('column') || upsertErr.code === '42703')) {
      console.warn('[API Reset Teacher Password] Column missing in profiles, retrying with core schema:', upsertErr.message);
      const coreProfileUpdate = {
        id: authUserId,
        school_id: targetSchoolId,
        role: 'guru',
        full_name: nama || teacherProfile?.full_name || 'Guru SD',
        identifier: nip || teacherProfile?.nip || authEmail,
        kelas: rombelWali || teacherProfile?.kelas || '',
        class_name: rombelWali || teacherProfile?.class_name || rombelWali || teacherProfile?.kelas || '',
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      const retryResult = await adminClient
        .from('profiles')
        .upsert(coreProfileUpdate, { onConflict: 'id' });
      upsertErr = retryResult.error;
    }

    if (upsertErr) throw upsertErr;

    // Kaitkan Guru ke tabel classes sebagai wali kelas jika ada penugasan rombel
    const cleanRombel = String(rombelWali || teacherProfile?.kelas || '').trim();
    if (cleanRombel && authUserId && targetSchoolId) {
      try {
        const gradeMatch = cleanRombel.match(/\d+/);
        const gradeLevel = gradeMatch ? gradeMatch[0] : null;

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
        console.warn('[API Reset Teacher Password] Class link warning:', classLinkErr);
      }
    }

    return res.status(200).json({
      ok: true,
      message: `Kata sandi akun guru "${profileUpdate.full_name}" berhasil direset & diaktifkan ke "${targetPassword}".`,
      teacher: profileUpdate,
    });
  } catch (err) {
    console.error('[API Reset Teacher Password] Error:', err);
    return res.status(500).json({ error: err.message || 'Gagal mereset kata sandi guru.' });
  }
}

