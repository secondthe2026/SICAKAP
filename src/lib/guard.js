import { getCurrentUserProfile, signOutAndRedirect } from './supabase.js';

export const ROLE_DASHBOARD_MAP = {
  superadmin: '/pages/superadmin-dashboard.html',
  admin_sekolah: '/pages/admin-dashboard.html',
  proktor: '/pages/proktor-dashboard.html',
  guru: '/pages/guru-dashboard.html',
  siswa: '/pages/exam-room.html',
};

// UI Loader transisi saat verifikasi auth (cegah kedip & cegah silent redirect saat loading)
function showGuardLoading() {
  if (typeof document === 'undefined') return;
  let loader = document.getElementById('sicakap-guard-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'sicakap-guard-loader';
    loader.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#f8fafc;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;color:#334155;';
    loader.innerHTML = `
      <div style="width:36px;height:36px;border:3px solid #e2e8f0;border-top-color:#4f46e5;border-radius:50%;animation:sicakap-spin 0.7s linear infinite;"></div>
      <p style="margin-top:14px;font-size:12px;font-weight:700;color:#64748b;letter-spacing:0.02em;">Memeriksa sesi &amp; hak akses...</p>
      <style>@keyframes sicakap-spin{to{transform:rotate(360deg)}}</style>
    `;
    (document.body || document.documentElement).appendChild(loader);
  }
}

function hideGuardLoading() {
  if (typeof document === 'undefined') return;
  const loader = document.getElementById('sicakap-guard-loader');
  if (loader) loader.remove();
  document.documentElement.style.visibility = 'visible';
}

/**
 * Proteksi halaman berdasarkan daftar role yang diizinkan.
 * @param {string[]} allowedRoles - Contoh: ['superadmin'] atau ['proktor', 'admin_sekolah']
 * @returns {Promise<{user: object, profile: object} | null>}
 */
export async function requireRole(allowedRoles = []) {
  if (typeof document !== 'undefined') {
    document.documentElement.style.visibility = 'hidden';
    showGuardLoading();
  }

  try {
    const authData = await getCurrentUserProfile();

    if (!authData) {
      console.warn('[Route Guard] Sesi Supabase tidak ditemukan / belum login. Mengalihkan ke login...');
      hideGuardLoading();
      window.location.replace('/index.html?reason=unauthenticated');
      return null;
    }

    const { profile, schoolInactive } = authData;
    const userRole = String(profile.role || '').toLowerCase().trim();

    // Validasi sekolah nonaktif HANYA untuk non-superadmin
    if (userRole !== 'superadmin' && schoolInactive) {
      hideGuardLoading();
      alert('Sekolah Anda sedang dinonaktifkan atau dalam proses verifikasi Superadmin.');
      signOutAndRedirect('/index.html?reason=school_inactive');
      return null;
    }

    // Normalisasi role yang diizinkan
    const normalizedAllowed = allowedRoles.map((r) => String(r).toLowerCase().trim());

    if (normalizedAllowed.length > 0 && !normalizedAllowed.includes(userRole)) {
      console.warn(`[Route Guard] Akses ditolak. Role "${userRole}" tidak cocok dengan:`, normalizedAllowed);
      hideGuardLoading();
      const fallbackUrl = ROLE_DASHBOARD_MAP[userRole] || '/index.html';
      window.location.replace(`${fallbackUrl}?reason=unauthorized`);
      return null;
    }

    // Otorisasi sukses: simpan ke window & tampilkan layar
    window.__SICAKAP_USER__ = authData;
    hideGuardLoading();

    // Bind otomatis tombol logout
    document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        signOutAndRedirect('/index.html');
      });
    });

    return authData;
  } catch (err) {
    console.error('[Route Guard] Exception saat verifikasi akses:', err);
    hideGuardLoading();
    window.location.replace('/index.html?reason=guard_error');
    return null;
  }
}
