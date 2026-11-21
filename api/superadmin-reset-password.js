import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token otorisasi diperlukan.' });
  }
  const token = authHeader.split(' ')[1];

  // Verifikasi caller adalah Superadmin
  const client = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: userErr } = await client.auth.getUser(token);
  if (userErr || !user) {
    return res.status(401).json({ error: 'Sesi tidak valid.' });
  }

  const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'superadmin') {
    return res.status(403).json({ error: 'Akses ditolak: Hanya Superadmin yang berhak mereset password sekolah.' });
  }

  const { school_id, new_password } = req.body || {};
  if (!school_id || !new_password) {
    return res.status(400).json({ error: 'ID sekolah dan kata sandi baru wajib diisi.' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
  }

  if (serviceRoleKey) {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      const { data: cred, error: credErr } = await adminClient
        .from('school_credentials')
        .select('*')
        .eq('school_id', school_id)
        .maybeSingle();

      if (credErr || !cred) {
        throw new Error('Data kredensial sekolah tidak ditemukan.');
      }

      if (cred.admin_user_id) {
        const { error: authErr } = await adminClient.auth.admin.updateUserById(cred.admin_user_id, {
          password: new_password.trim(),
        });
        if (authErr) throw authErr;
      }

      const { error: updateErr } = await adminClient
        .from('school_credentials')
        .update({
          initial_password: new_password.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('school_id', school_id);

      if (updateErr) throw updateErr;

      return res.status(200).json({
        ok: true,
        message: 'Kata sandi admin sekolah berhasil direset.',
        school_id,
        new_password: new_password.trim(),
      });
    } catch (err) {
      console.error('Reset school password error:', err);
      return res.status(500).json({ error: err.message || 'Gagal mereset kata sandi.' });
    }
  } else {
    // Fallback RPC Supabase
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data, error } = await authClient.rpc('superadmin_reset_school_password', {
      p_school_id: school_id,
      p_new_password: new_password.trim(),
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, data });
  }
}
