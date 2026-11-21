import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    return res.status(500).json({ error: 'Supabase URL belum dikonfigurasi.' });
  }

  const { query, npsn, email } = req.body || {};
  const searchQuery = String(query || npsn || email || '').trim();

  if (!searchQuery) {
    return res.status(400).json({ error: 'Masukkan NPSN atau Email Admin Sekolah.' });
  }

  // 1. Coba panggil RPC public.check_school_registration_status
  try {
    const client = createClient(supabaseUrl, anonKey);
    const { data: rpcData, error: rpcErr } = await client.rpc('check_school_registration_status', {
      p_query: searchQuery,
    });

    if (!rpcErr && rpcData) {
      return res.status(200).json(rpcData);
    }
  } catch (err) {
    console.warn('[Check Status] RPC notice:', err.message);
  }

  // 2. Fallback via serviceRoleKey jika ada
  if (serviceRoleKey) {
    try {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      
      let { data: school } = await adminClient
        .from('schools')
        .select('id, name, npsn, jenjang, kabupaten, is_active, approval_status, rejection_reason, created_at, approved_at')
        .eq('npsn', searchQuery.replace(/\s+/g, ''))
        .maybeSingle();

      if (!school && searchQuery.includes('@')) {
        const { data: cred } = await adminClient
          .from('school_credentials')
          .select('school_id')
          .ilike('admin_email', searchQuery.toLowerCase())
          .maybeSingle();

        if (cred?.school_id) {
          const { data: s } = await adminClient
            .from('schools')
            .select('id, name, npsn, jenjang, kabupaten, is_active, approval_status, rejection_reason, created_at, approved_at')
            .eq('id', cred.school_id)
            .maybeSingle();
          school = s;
        }
      }

      if (!school) {
        return res.status(200).json({
          found: false,
          message: 'Pendaftaran sekolah dengan NPSN atau Email tersebut tidak ditemukan.',
        });
      }

      return res.status(200).json({
        found: true,
        school_name: school.name,
        npsn: school.npsn,
        jenjang: school.jenjang || 'SD',
        kabupaten: school.kabupaten || '-',
        approval_status: school.approval_status || (school.is_active ? 'approved' : 'pending'),
        is_active: Boolean(school.is_active),
        rejection_reason: school.rejection_reason || null,
        created_at: school.created_at,
        approved_at: school.approved_at,
      });
    } catch (err) {
      console.error('[Check Status] Service role fallback error:', err);
      return res.status(500).json({ error: 'Gagal memeriksa status pendaftaran.' });
    }
  }

  return res.status(200).json({
    found: false,
    message: 'Data tidak ditemukan atau layanan verifikasi sedang diinisialisasi.',
  });
}
