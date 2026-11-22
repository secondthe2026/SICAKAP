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

  const { name, npsn, jenjang, kabupaten, alamat, admin_email, password, is_active } = req.body || {};

  if (!name || !npsn || !admin_email || !password) {
    return res.status(400).json({ error: 'Nama sekolah, NPSN, email admin, dan kata sandi wajib diisi.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
  }

  const cleanNpsn = String(npsn).trim().replace(/\s+/g, '');
  const cleanEmail = String(admin_email).trim().toLowerCase();

  // Cek apakah pemanggil adalah Superadmin
  let isSuperadmin = false;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const client = createClient(supabaseUrl, anonKey);
    const { data: { user } } = await client.auth.getUser(token);
    if (user) {
      const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile && String(profile.role).toLowerCase() === 'superadmin') {
        isSuperadmin = true;
      }
    }
  }

  // Pendaftaran mandiri dari publik WAJIB is_active = false & approval_status = 'pending'
  const finalIsActive = isSuperadmin ? Boolean(is_active) : false;
  const finalApprovalStatus = isSuperadmin && is_active ? 'approved' : 'pending';

  // 1. Coba via RPC PostgreSQL (Atomic & Full Permissions via SECURITY DEFINER)
  try {
    const client = createClient(supabaseUrl, anonKey);
    const { data: rpcData, error: rpcErr } = await client.rpc('register_school_and_admin', {
      p_name: name.trim(),
      p_npsn: cleanNpsn,
      p_jenjang: jenjang || 'SD',
      p_kabupaten: kabupaten ? kabupaten.trim() : null,
      p_admin_email: cleanEmail,
      p_password: password.trim(),
      p_is_active: finalIsActive,
    });

    if (!rpcErr && rpcData?.success) {
      return res.status(200).json({
        ok: true,
        message: 'Pendaftaran sekolah dan akun admin berhasil diproses.',
        data: rpcData,
        is_active: finalIsActive,
        approval_status: finalApprovalStatus,
      });
    } else if (rpcErr && !rpcErr.message.includes('function') && !rpcErr.message.includes('does not exist')) {
      return res.status(400).json({ error: rpcErr.message });
    }
  } catch (err) {
    console.warn('[Register School] RPC notice:', err.message);
  }

  // 2. Jika ada serviceRoleKey, jalankan transaksi server-side
  if (serviceRoleKey) {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let createdSchoolId = null;
    let createdUserId = null;

    try {
      // Validasi NPSN unik
      const { data: existingSchool } = await adminClient
        .from('schools')
        .select('id, name')
        .eq('npsn', cleanNpsn)
        .maybeSingle();

      if (existingSchool) {
        return res.status(400).json({ error: `Sekolah dengan NPSN ${cleanNpsn} sudah terdaftar (${existingSchool.name}).` });
      }

      // Validasi Email unik di school_credentials
      const { data: existingCred } = await adminClient
        .from('school_credentials')
        .select('id')
        .ilike('admin_email', cleanEmail)
        .maybeSingle();

      if (existingCred) {
        return res.status(400).json({ error: `Email admin ${cleanEmail} sudah digunakan sekolah lain.` });
      }

      // Insert ke public.schools
      const { data: school, error: schoolErr } = await adminClient
        .from('schools')
        .insert([{
          name: name.trim(),
          npsn: cleanNpsn,
          jenjang: jenjang || 'SD',
          kabupaten: kabupaten ? kabupaten.trim() : null,
          alamat: (alamat || kabupaten) ? String(alamat || kabupaten).trim() : null,
          is_active: finalIsActive,
          approval_status: finalApprovalStatus,
          approved_at: finalIsActive ? new Date().toISOString() : null,
        }])
        .select()
        .single();

      if (schoolErr || !school) {
        throw new Error(schoolErr?.message || 'Gagal menyimpan data sekolah.');
      }
      createdSchoolId = school.id;

      // Buat user Auth untuk admin_sekolah
      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: password.trim(),
        email_confirm: true,
        user_metadata: {
          full_name: `Admin ${name.trim()}`,
          role: 'admin_sekolah',
          identifier: cleanNpsn,
          school_id: school.id,
        },
      });

      if (authErr || !authUser?.user) {
        throw new Error(authErr?.message || 'Gagal membuat akun autentikasi admin.');
      }
      createdUserId = authUser.user.id;

      // Upsert profiles
      await adminClient.from('profiles').upsert({
        id: createdUserId,
        school_id: school.id,
        role: 'admin_sekolah',
        full_name: `Admin ${name.trim()}`,
        identifier: cleanNpsn,
        is_active: finalIsActive,
      }, { onConflict: 'id' });

      // Upsert school_credentials
      await adminClient.from('school_credentials').upsert({
        school_id: school.id,
        admin_user_id: createdUserId,
        admin_email: cleanEmail,
        initial_password: password.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'school_id' });

      return res.status(200).json({
        ok: true,
        message: 'Pendaftaran sekolah dan akun admin berhasil disimpan.',
        school,
        admin_email: cleanEmail,
        is_active: finalIsActive,
        approval_status: finalApprovalStatus,
      });
    } catch (err) {
      console.error('Register school error:', err);
      if (createdUserId) {
        try { await adminClient.auth.admin.deleteUser(createdUserId); } catch (_) {}
      }
      if (createdSchoolId) {
        try { await adminClient.from('schools').delete().eq('id', createdSchoolId); } catch (_) {}
      }
      return res.status(500).json({ error: err.message || 'Terjadi kesalahan saat mendaftarkan sekolah.' });
    }
  }

  return res.status(500).json({ error: 'Gagal memproses pendaftaran sekolah. Periksa konfigurasi RPC Supabase.' });
}
