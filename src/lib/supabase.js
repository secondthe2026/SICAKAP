import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[SICAKAP] Env VITE_SUPABASE_URL atau VITE_SUPABASE_ANON_KEY belum diatur.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Konversi NISN ke format email auth internal tanpa domain publik
 * @param {string|number} nisn
 * @returns {string} Contoh: "0084928192@siswa.sicakap.local"
 */
export function nisnToAuthEmail(nisn) {
  const cleanNisn = String(nisn || '').trim().replace(/\s+/g, '');
  return `${cleanNisn.toLowerCase()}@siswa.sicakap.local`;
}

/**
 * Helper terpadu konversi identifier login (NISN / Email)
 * Digunakan seragam oleh API server dan Halaman Login
 */
export function normalizeLoginIdentifier(input) {
  const clean = String(input || '').trim().toLowerCase();
  if (clean.includes('@')) {
    return clean;
  }
  const sanitized = clean.replace(/[^a-z0-9._-]/g, '');
  return `${sanitized}@siswa.sicakap.local`;
}

/**
 * Konversi NIP / Username Guru ke format email auth internal
 * @param {string|number} identifier
 * @returns {string} Contoh: "19850101...@guru.sicakap.local" atau email asli jika mengandung '@'
 */
export function teacherToAuthEmail(identifier) {
  const clean = String(identifier || '').trim().toLowerCase();
  if (clean.includes('@')) {
    return clean;
  }
  const sanitized = clean.replace(/[^a-z0-9._-]/g, '');
  return `${sanitized}@guru.sicakap.local`;
}

/**
 * Client Auth terpisah tanpa persistSession untuk membuat/mendaftarkan akun Siswa
 * Mencegah sesi login Guru tertimpa / auto-logout saat menambah siswa
 */
export function createUnpersistedAuthClient() {
  return createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-anon-key',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

if (typeof window !== 'undefined') {
  window.nisnToAuthEmail = nisnToAuthEmail;
  window.normalizeLoginIdentifier = normalizeLoginIdentifier;
  window.teacherToAuthEmail = teacherToAuthEmail;
  window.createUnpersistedAuthClient = createUnpersistedAuthClient;
}

export async function getCurrentUserProfile() {
  try {
    // 1. Ambil session aktif (dengan retry ringan untuk atasi race condition saat reload browser)
    let session = null;
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (!sessionError && sessionData?.session) {
      session = sessionData.session;
    } else {
      // Retry jeda 120ms jika storage auth browser sedang diinisialisasi
      await new Promise(r => setTimeout(r, 120));
      const retryResult = await supabase.auth.getSession();
      if (!retryResult.error && retryResult.data?.session) {
        session = retryResult.data.session;
      }
    }

    if (!session?.user) {
      // Backup coba ambil langsung via getUser()
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!userError && userData?.user) {
        session = { user: userData.user };
      }
    }

    if (!session?.user) {
      return null;
    }

    const userId = session.user.id;

    // 2. Query tabel profiles: gunakan select('*') dan .maybeSingle() agar 100% cocok dengan RLS policy users_read_own_profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('[SICAKAP Auth] Error mengambil profil pengguna:', profileError);
      return null;
    }

    if (!profile) {
      console.error('[SICAKAP Auth] Baris profil tidak ditemukan di database untuk user ID:', userId);
      return null;
    }

    // 3. Normalisasi role huruf kecil tanpa spasi
    const normalizedRole = String(profile.role || '').toLowerCase().trim();
    profile.role = normalizedRole;

    // 4. Validasi keaktifan akun user
    if (profile.is_active === false) {
      console.warn('[SICAKAP Auth] Akun pengguna dinonaktifkan:', userId);
      return null;
    }

    // 5. BYPASS KHUSUS SUPERADMIN: Superadmin pengelola pusat, WAJIB lolos tanpa validasi sekolah
    if (normalizedRole === 'superadmin') {
      profile.schools = null;
      return { user: session.user, profile, isSuperadmin: true };
    }

    // 6. NON-SUPERADMIN: Ambil data sekolah secara opsional (LEFT JOIN aman)
    if (profile.school_id) {
      try {
        const { data: school, error: schoolErr } = await supabase
          .from('schools')
          .select('*')
          .eq('id', profile.school_id)
          .maybeSingle();

        if (!schoolErr && school) {
          profile.schools = school;
          if (school.is_active === false) {
            console.warn('[SICAKAP Auth] Sekolah pengguna berstatus nonaktif:', profile.school_id);
            return { user: session.user, profile, schoolInactive: true };
          }
        }
      } catch (sErr) {
        console.warn('[SICAKAP Auth] Warning membaca relasi sekolah:', sErr);
      }
    }

    return { user: session.user, profile };
  } catch (err) {
    console.error('[SICAKAP Auth] Exception pada getCurrentUserProfile:', err);
    return null;
  }
}

export async function signOutAndRedirect(redirectTo = '/index.html') {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('sicakap_active_role');
    sessionStorage.removeItem('sicakap_active_guru');
    sessionStorage.removeItem('sicakap_nisn');
    sessionStorage.removeItem('sicakap_token');
  }
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('[SICAKAP Auth] SignOut error:', err);
  }
  window.location.replace(redirectTo);
}

