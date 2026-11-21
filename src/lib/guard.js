import { getCurrentUserProfile, signOutAndRedirect } from './supabase.js';

export const ROLE_DASHBOARD_MAP = {
  superadmin: '/pages/superadmin-dashboard.html',
  admin_sekolah: '/pages/admin-dashboard.html',
  proktor: '/pages/proktor-dashboard.html',
  guru: '/pages/guru-dashboard.html',
  siswa: '/pages/exam-room.html',
};

/**
 * Proteksi halaman berdasarkan daftar role yang diizinkan.
 * @param {string[]} allowedRoles - Contoh: ['proktor', 'admin_sekolah', 'superadmin']
 * @returns {Promise<{user: object, profile: object} | null>}
 */
export async function requireRole(allowedRoles = []) {
  // Sembunyikan konten sementara agar dashboard tidak berkedip sebelum lolos auth
  document.documentElement.style.visibility = 'hidden';

  const authData = await getCurrentUserProfile();

  if (!authData) {
    window.location.replace('/index.html?reason=unauthenticated');
    return null;
  }

  const { profile } = authData;

  if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    const fallbackUrl = ROLE_DASHBOARD_MAP[profile.role] || '/index.html';
    window.location.replace(`${fallbackUrl}?reason=unauthorized`);
    return null;
  }

  // Lolos verifikasi: tampilkan halaman & expose profil aktif
  window.__SICAKAP_USER__ = authData;
  document.documentElement.style.visibility = 'visible';

  // Bind otomatis tombol logout yang memakai atribut data-action="logout"
  document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      signOutAndRedirect('/index.html');
    });
  });

  return authData;
}

