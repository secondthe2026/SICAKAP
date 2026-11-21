# Product Requirements Document (PRD): SI-CAKAP SD/MI v2.0
**Produk:** SI-CAKAP SD/MI (Sistem Informasi Computerized Asesmen & Kompetensi Akademik Peserta Didik Sekolah Dasar)  
**Jenjang Pendidikan:** Sekolah Dasar & Madrasah Ibtidaiyah (SD/MI) Kelas 1 sampai Kelas 6 (Fase A, Fase B, Fase C)  
**Target Perangkat:** Laptop, Chromebook (ChromeOS), Smartphone (Android/iOS)  
**Fokus Versi 2.0:** Strict Role-Based Access Control (RBAC) Khusus SD — Desain Ramah Anak (Huruf >= 18px & Pilihan A-D), Sentralisasi Admin SD, Ruang Kerja Guru SD, & Portal Khusus Ujian Murid.

---

## 1. Tujuan Utama Sistem Khusus Jenjang SD
1. **Desain Ramah Anak Sekolah Dasar:** Tipografi terbaca jelas dengan skala minimum 18px (skala A, A+, A++), tombol ramah anak ("⬅ Soal Sebelumnya", "🤔 Masih Ragu", "Soal Berikutnya ➡", "✅ Selesai & Kumpulkan"), dan opsi Pilihan Ganda maksimal 4 opsi (A, B, C, D — tanpa opsi E).
2. **Kesesuaian Kurikulum SD:** Mendukung Kurikulum Merdeka Fase A (Kelas 1-2), Fase B (Kelas 3-4), dan Fase C (Kelas 5-6) dengan mapel Bahasa Indonesia, Matematika, IPAS, Pendidikan Pancasila, PJOK, Seni Budaya, serta Literasi & Numerasi ANBK SD.
3. **Sentralisasi Kendali (Admin SD):** Seluruh manajemen akun, rombel kelas 1-6, jadwal asesmen, dan plotting guru dipegang satu pintu oleh Admin Sekolah Dasar.
4. **Fokus Akademik (Guru SD):** Guru menyusun bank soal ramah anak (5 format AKM), mengelola murid binaan, dan mengunduh rekap nilai mapel tanpa akses ke konfigurasi sistem global.
5. **Isolasi Sesi Asesmen (Murid SD):** Murid hanya masuk ke ruang ujian aktif melalui input token, terlindungi deteksi pindah tab, dan jawaban tersimpan otomatis (*Auto-Save*).
6. **Peran Akses Portal:** Menggunakan istilah peran resmi: `Murid`, `Guru`, `Admin`, dan `Superadmin`.

---

## 2. Matriks Hak Akses Pengguna (Strict RBAC SD)

| Modul / Fitur | Superadmin | Admin SD | Guru SD | Murid (Siswa SD) |
| :--- | :---: | :---: | :---: | :---: |
| Otorisasi & Registrasi Sekolah SD Baru | ✅ Penuh | ❌ Diblokir | ❌ Diblokir | ❌ Diblokir |
| Tambah & Kelola Guru SD | ❌ Diblokir | ✅ Penuh | ❌ Diblokir | ❌ Diblokir |
| Tambah Murid & Edit Password Siswa | ❌ Diblokir | ✅ Semua Murid | ✅ Rombel Diampu | ❌ Diblokir |
| Plotting Guru ke Mapel & Kelas 1-6 | ❌ Diblokir | ✅ Penuh | ❌ Diblokir | ❌ Diblokir |
| Buat & Kelola Rombel Kelas SD | ❌ Diblokir | ✅ Semua Rombel | ✅ Buat Rombel Sendiri | ❌ Diblokir |
| Cetak Kartu Ujian SD (QR) & Berkas | ❌ Diblokir | ✅ Penuh | 👁️ Cetak Kelas | ❌ Diblokir |
| Pengaturan Jadwal Sesi CBT SD | ❌ Diblokir | ✅ Penuh | ✅ Jadwal Kelas Sendiri | ❌ Diblokir |
| Buat Bank Soal SD (Opsi Maksimal A-D) | ❌ Diblokir | ✅ Semua Mapel | ✅ Mapel Diampu | ❌ Diblokir |
| Koreksi Esai / Cerita & Peta Kompetensi | ❌ Diblokir | ✅ Semua Kelas | ✅ Kelas Diampu | ❌ Diblokir |
| Rilis Token Asesmen & Reset Login SD | ❌ Diblokir | ✅ Semua Ruang | ✅ Ruang Diampu | ❌ Diblokir |
| Pengerjaan Asesmen CBT SD (Token) | ❌ Diblokir | ❌ Diblokir | ❌ Diblokir | ✅ Khusus Ujian |

---

## 3. Spesifikasi Detail Standar Sekolah Dasar (SD/MI)

### 3.1. Standar Butir Soal & Ruang Ujian Anak SD (`pages/exam-room.html`)
1. **Opsi Pilihan Ganda (Maksimal 4 Pilihan):** Mengikuti standar asesmen Sekolah Dasar, soal pilihan ganda hanya menyediakan opsi **A, B, C, dan D**. Opsi E ditiadakan di seluruh sistem.
2. **Tipografi & Skalabilitas Ukuran Huruf:** Ukuran default teks soal dan bacaan minimal **18px** dengan opsi perbesaran font hingga 22px untuk kenyamanan membaca anak SD.
3. **Bahasa Tombol Navigasi:**
   * Tombol mundur: `⬅ Soal Sebelumnya`
   * Tombol ragu: `🤔 Masih Ragu`
   * Tombol maju: `Soal Berikutnya ➡`
   * Tombol akhir: `✅ Selesai & Kumpulkan`
4. **Materi Soal Contoh SD:** Disesuaikan dengan konten Fase C (Kelas 5-6 SD):
   * Numerasi: Pecahan kue bolu dan perkalian kontekstual.
   * Literasi: Cerita fabel dan teks narasi anak.
   * IPAS: Ekosistem sawah, rantai makanan, dan organ pernapasan manusia.
   * Pancasila: Praktik gotong royong dan toleransi di sekolah.

### 3.2. Modul Data Master & Dashboard Admin SD (`pages/admin-dashboard.html`)
1. **Tingkat Kelas SD:** Kelas 1, Kelas 2, Kelas 3, Kelas 4, Kelas 5, dan Kelas 6 (Fase A, Fase B, Fase C).
2. **Mata Pelajaran SD:** Bahasa Indonesia, Matematika, IPAS (Ilmu Pengetahuan Alam & Sosial), Pendidikan Pancasila, PJOK, Seni Budaya, serta Literasi & Numerasi ANBK SD.
3. **Manajemen Pengguna SD:** Kelola akun Guru SD dan Murid SD, pencarian berbasis NIP/NISN, serta tombol tindakan langsung `Reset Akun Guru` dan `Reset Akun Siswa`.

### 3.3. Modul Ruang Kerja Guru SD (`pages/guru-dashboard.html`)
1. **Scope Terkunci:** Guru hanya mengakses rombel SD dan mapel SD yang di-plotting oleh Admin SD (misal: Matematika & IPAS Fase C Kelas 5).
2. **Bank Soal 5 Format Ramah Anak:** Pilihan Ganda (A-D), PG Kompleks, Menjodohkan Kata/Gambar, Isian Singkat, dan Cerita Pendek.
3. **Monitoring Ujian & Reset:** Guru dapat memantau progres pengerjaan murid SD secara langsung dan membuka murid yang terkunci tab.
4. **Rekap Nilai Mapel SD:** Rekapitulasi nilai otomatis dengan pembobotan dan ekspor ke Excel (.xlsx).

### 3.4. Portal Akses & Pendaftaran Sekolah (`index.html`)
1. **Identitas Jenjang:** Ditujukan khusus untuk jenjang Sekolah Dasar (SD/MI) Kelas 1 - 6.
2. **Pendaftaran Sekolah Baru:** Menggunakan contoh entitas SD (seperti `SDN 1 Nusantara`, NPSN SD 8 digit).
3. **Istilah RBAC Login:** Menggunakan 4 tab peran: `Murid`, `Guru`, `Admin`, dan `Superadmin`.

### 3.5. Modul Dokumen Cetak Resmi & Ekspor Nilai (`assets/js/sicakap-export.js`)
1. **Cetak Kartu Peserta Ujian SD:** Format Grid A4 siap cetak (8 kartu per lembar, 2 kolom x 4 baris) dengan garis putus-putus (*dashed line*) dan ikon gunting (✂️). Memuat kop SDN 1 Nusantara, Nama Siswa, NISN, Rombel, Username, Password Ujian mono tebal, dan tanda tangan Kepala Sekolah.
2. **Cetak Berita Acara & Daftar Hadir Ujian:** Format resmi kedinasan A4 lengkap dengan Kop Surat Sekolah, data rombel/mapel, catatan pelaksanaan, tanda tangan Proktor & Kepala Sekolah, serta format presensi tanda tangan zig-zag resmi (1.... 2....).
3. **Ekspor Nilai ke Excel (.xlsx):** Ekspor hasil ujian/live score per mapel dan rombel dengan SheetJS + universal fallback Spreadsheet XML, format tabel resmi, evaluasi KKTP (≥ 75), dan ringkasan statistik kelas (rata-rata, tertinggi, terendah, % ketuntasan).



