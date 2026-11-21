export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ ok: false, error: 'Supabase env vars belum diatur di Vercel.' });
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/schools?select=id&limit=1`, {
      method: 'GET',
      headers: {
        apikey: supabaseKey,
      },
    });

    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      pinged_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
