/**
 * Reusable School Kop Header Component (SI-CAKAP CBT)
 * Menampilkan Kop Kabupaten & Kop Sekolah resmi dari tabel public.schools Supabase
 */
import { supabase, getCurrentUserProfile } from '../lib/supabase.js';

let cachedSchoolProfile = null;

export async function getActiveSchoolProfile(schoolId = null) {
  if (cachedSchoolProfile && (!schoolId || cachedSchoolProfile.id === schoolId)) {
    return cachedSchoolProfile;
  }

  // 1. Cek dari window cache
  if (window.__ACTIVE_SCHOOL_PROFILE__ && (!schoolId || window.__ACTIVE_SCHOOL_PROFILE__.id === schoolId)) {
    cachedSchoolProfile = window.__ACTIVE_SCHOOL_PROFILE__;
    return cachedSchoolProfile;
  }

  // 2. Cek dari session aktif
  try {
    let session = window.__SICAKAP_USER__ || window.__ADMIN_SESSION__;
    if (!session && typeof getCurrentUserProfile === 'function') {
      session = await getCurrentUserProfile();
    }

    const targetSchoolId = schoolId || session?.profile?.school_id;
    if (!targetSchoolId) return null;

    const { data: school, error } = await supabase
      .from('schools')
      .select('id, name, npsn, jenjang, kabupaten, alamat, nama_pemda, nama_dinas, logo_kabupaten_url, logo_url, tahun_pelajaran, semester')
      .eq('id', targetSchoolId)
      .maybeSingle();

    if (!error && school) {
      cachedSchoolProfile = school;
      window.__ACTIVE_SCHOOL_PROFILE__ = school;
      return school;
    }
  } catch (err) {
    console.warn('[SchoolKop] Gagal membaca profil sekolah:', err);
  }

  return null;
}

export function generateSchoolKopHtml(school, options = {}) {
  const { compact = false, timerFormatted = '' } = options;

  const s = school || {};
  const namaSekolah = (s.name || s.nama_sekolah || 'SATUAN PENDIDIKAN').toUpperCase();
  const namaPemda = (s.nama_pemda || (s.kabupaten ? `PEMERINTAH ${s.kabupaten.toUpperCase()}` : 'PEMERINTAH KABUPATEN / KOTA')).toUpperCase();
  const namaDinas = (s.nama_dinas || 'DINAS PENDIDIKAN DAN KEBUDAYAAN').toUpperCase();
  const alamat = s.alamat || (s.kabupaten ? `Kabupaten / Kota: ${s.kabupaten}` : '');
  const npsn = s.npsn ? `NPSN: ${s.npsn}` : '';

  const logoKabUrl = s.logo_kabupaten_url || '';
  const logoSekolahUrl = s.logo_url || '';

  // Mode Ringkas (Header Sticky Layar Ujian Mobile-First)
  if (compact) {
    const kabImg = logoKabUrl
      ? `<img src="${logoKabUrl}" alt="Kabupaten" class="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0" onerror="this.style.display='none'" />`
      : '';
    const schoolImg = logoSekolahUrl
      ? `<img src="${logoSekolahUrl}" alt="Sekolah" class="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0" onerror="this.style.display='none'" />`
      : `<span class="text-base sm:text-lg shrink-0">🏫</span>`;

    return `
      <div class="flex items-center gap-2 min-w-0">
        <div class="flex items-center gap-1 shrink-0">
          ${kabImg}
          ${schoolImg}
        </div>
        <div class="min-w-0 text-left">
          <p class="font-black text-xs sm:text-sm text-slate-900 truncate max-w-[130px] xs:max-w-[160px] sm:max-w-xs leading-tight">
            ${namaSekolah}
          </p>
          <p class="text-[10px] text-slate-500 font-bold truncate max-w-[130px] xs:max-w-[160px] hidden sm:block">
            ${namaDinas}
          </p>
        </div>
      </div>
    `;
  }

  // Mode Lengkap (Lobi Ujian, Kartu Peserta, Bukti Hasil Ujian)
  const leftLogo = logoKabUrl
    ? `<img src="${logoKabUrl}" alt="Logo Pemda" class="w-10 h-10 sm:w-14 sm:h-14 object-contain shrink-0" onerror="this.style.display='none'" />`
    : `<div class="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-xl sm:text-2xl shrink-0">🏛️</div>`;

  const rightLogo = logoSekolahUrl
    ? `<img src="${logoSekolahUrl}" alt="Logo Sekolah" class="w-10 h-10 sm:w-14 sm:h-14 object-contain shrink-0" onerror="this.style.display='none'" />`
    : `<div class="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-xl sm:text-2xl shrink-0">🏫</div>`;

  return `
    <div class="w-full pb-3 mb-4 border-b-2 border-slate-900 text-slate-900">
      <div class="flex items-center justify-between gap-2 sm:gap-4">
        <div class="flex items-center justify-center shrink-0">
          ${leftLogo}
        </div>

        <div class="flex-1 text-center px-1 sm:px-2 min-w-0">
          <p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 leading-tight">
            ${namaPemda}
          </p>
          <p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 leading-tight">
            ${namaDinas}
          </p>
          <h2 class="text-sm sm:text-base md:text-lg font-black uppercase text-slate-900 tracking-wide break-words mt-0.5 leading-snug">
            ${namaSekolah}
          </h2>
          ${(alamat || npsn) ? `
            <p class="text-[9px] sm:text-[11px] text-slate-500 font-medium leading-tight mt-0.5 break-words">
              ${[alamat, npsn].filter(Boolean).join(' • ')}
            </p>
          ` : ''}
        </div>

        <div class="flex items-center justify-center shrink-0">
          ${rightLogo}
        </div>
      </div>
      <div class="w-full border-t border-slate-900 mt-1.5 pt-0.5"></div>
    </div>
  `;
}

// Custom Element definition: <school-kop-header compact></school-kop-header>
class SchoolKopHeaderElement extends HTMLElement {
  async connectedCallback() {
    const compact = this.hasAttribute('compact');
    const school = await getActiveSchoolProfile();
    this.innerHTML = generateSchoolKopHtml(school, { compact });
  }
}

if (typeof window !== 'undefined' && !customElements.get('school-kop-header')) {
  customElements.define('school-kop-header', SchoolKopHeaderElement);
}

