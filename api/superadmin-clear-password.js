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

  const client = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: userErr } = await client.auth.getUser(token);
  if (userErr || !user) {
    return res.status(401).json({ error: 'Sesi tidak valid.' });
  }

  const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'superadmin') {
    return res.status(403).json({ error: 'Akses ditolak: Hanya Superadmin yang berhak membersihkan catatan password.' });
  }

  const { school_id } = req.body || {};
  if (!school_id) {
    return res.status(400).json({ error: 'ID sekolah wajib diisi.' });
  }

  if (serviceRoleKey) {
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await adminClient
      .from('school_credentials')
      .update({
        initial_password: null,
        updated_at: new Date().toISOString(),
      })
      .eq('school_id', school_id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, message: 'Catatan password berhasil dibersihkan.' });
  } else {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { error } = await authClient
      .from('school_credentials')
      .update({
        initial_password: null,
        updated_at: new Date().toISOString(),
      })
      .eq('school_id', school_id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, message: 'Catatan password berhasil dibersihkan.' });
  }
}
