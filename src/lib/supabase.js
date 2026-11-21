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
  return `${cleanNisn}@siswa.sicakap.local`;
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
  window.createUnpersistedAuthClient = createUnpersistedAuthClient;
}

export async function getCurrentUserProfile() {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (!sessionError && session?.user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, school_id, role, full_name, identifier, class_name, kelas, is_active, schools(npsn, name, is_active)')
        .eq('id', session.user.id)
        .single();

      if (!profileError && profile && profile.is_active) {
        return { user: session.user, profile };
      }
    }
  } catch (err) {
    console.warn('[SICAKAP Auth] Supabase getSession error:', err);
  }

  // No mock fallback in production - strictly authenticated Supabase sessions only
  return null;
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

