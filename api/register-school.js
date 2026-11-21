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

  const { name, npsn, jenjang, kabupaten, admin_email, password, is_active } = req.body || {};

  if (!name || !npsn || !admin_email || !password) {
    return res.status(400).json({ error: 'Nama sekolah, NPSN, email admin, dan kata sandi wajib diisi.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
  }

  // Cek apakah pemanggil adalah Superadmin
  let isSuperadmin = false;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const client = createClient(supabaseUrl, anonKey);
    const { data: { user } } = await client.auth.getUser(token);
    if (user) {
      const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile && profile.role === 'superadmin') {
        isSuperadmin = true;
      }
    }
  }

  // Jika bukan Superadmin, pendaftaran mandiri WAJIB is_active = false
  const finalIsActive = isSuperadmin ? Boolean(is_active) : false;

  // Jika ada service role key, eksekusi admin API
  if (serviceRoleKey) {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      // 1. Cek duplikasi NPSN
      const { data: existingSchool } = await adminClient
        .from('schools')
        .select('id')
        .eq('npsn', npsn)
        .maybeSingle();

      if (existingSchool) {
        return res.status(400).json({ error: `Sekolah dengan NPSN ${npsn} sudah terdaftar.` });
      }

      // 2. Buat record sekolah
      const { data: school, error: schoolErr } = await adminClient
        .from('schools')
        .insert([{
          name: name.trim(),
          npsn: npsn.trim(),
          jenjang: jenjang || 'SD',
          kabupaten: kabupaten || null,
          is_active: finalIsActive,
        }])
        .select()
        .single();

      if (schoolErr || !school) {
        throw new Error(schoolErr?.message || 'Gagal menyimpan data sekolah.');
      }

      // 3. Buat user Auth untuk admin_sekolah
      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email: admin_email.trim(),
        password: password.trim(),
        email_confirm: true,
        user_metadata: {
          full_name: `Admin ${name.trim()}`,
          role: 'admin_sekolah',
          identifier: npsn.trim(),
          school_id: school.id,
        },
      });

      if (authErr || !authUser?.user) {
        await adminClient.from('schools').delete().eq('id', school.id);
        throw new Error(authErr?.message || 'Gagal membuat akun autentikasi admin.');
      }

      const userId = authUser.user.id;

      // 4. Buat baris profiles
      await adminClient.from('profiles').upsert({
        id: userId,
        school_id: school.id,
        role: 'admin_sekolah',
        full_name: `Admin ${name.trim()}`,
        identifier: npsn.trim(),
        is_active: finalIsActive,
      }, { onConflict: 'id' });

      // 5. Simpan ke public.school_credentials
      await adminClient.from('school_credentials').upsert({
        school_id: school.id,
        admin_user_id: userId,
        admin_email: admin_email.trim(),
        initial_password: password.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'school_id' });

      return res.status(200).json({
        ok: true,
        message: 'Pendaftaran sekolah dan akun admin berhasil diproses.',
        school,
        admin_email: admin_email.trim(),
        is_active: finalIsActive,
      });
    } catch (err) {
      console.error('Register school error:', err);
      return res.status(500).json({ error: err.message || 'Terjadi kesalahan server saat mendaftarkan sekolah.' });
    }
  } else {
    // Fallback via RPC Supabase
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client.rpc('register_school_and_admin', {
      p_name: name,
      p_npsn: npsn,
      p_jenjang: jenjang || 'SD',
      p_kabupaten: kabupaten || null,
      p_admin_email: admin_email.trim(),
      p_password: password.trim(),
      p_is_active: finalIsActive,
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true, data });
  }
}
