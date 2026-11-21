# TASKS.md — Roadmap Upgrade Profesional SICAKAP

Gunakan checklist ini secara berurutan per fase. Jangan lanjut ke fase berikutnya sebelum kriteria selesai (DoD) terpenuhi.

---

## FASE 1: Kebersihan Repo & Fondasi Build (Prioritas Tertinggi)
- [x] **1.1 Hapus file duplikat & redundan**
  - Hapus `blueprint.txt.txt`, `desain.md.md`, `PRD.md.md`, `_redirects`, dan `exam-room.html` di root.
  - Verifikasi semua link navigasi mengarah ke `pages/exam-room.html`.
- [x] **1.2 Restrukturisasi folder**
  - Pindahkan `PRD.md`, `desain.md`, `blueprint-landing.txt` ke `docs/`.
  - Pindahkan `pages/data-store.js` ke `src/services/data-store.js` dan perbarui semua tag `<script>` di seluruh file HTML.
  - Pindahkan `assets/` ke `public/assets/`.
- [x] **1.3 Setup Build Pipeline & Hygiene**
  - Konfigurasi Vite + Tailwind CSS build lokal di `package.json` (hapus script Tailwind CDN jika masih pakai CDN).
  - Tambahkan `.gitignore` (`node_modules`, `dist`, `.env`, `.vercel`) dan `.env.example`.
  - Buat halaman `404.html` dan konfigurasikan rewrite/cleanUrls di `vercel.json`.
- **DoD Fase 1:** `npm run build` sukses tanpa error, tidak ada file duplikat, semua halaman di `pages/` bisa dibuka tanpa broken link/script.

---

## FASE 2: Database Supabase, Multi-Sekolah & Auth RBAC
- [x] **2.1 Desain Skema Database (`supabase/schema.sql`)**
  - Buat tabel: `schools` (berbasis `npsn`), `profiles` (`role`: superadmin, admin_sekolah, proktor, guru, siswa), `exams`, `questions`, `question_keys` (terpisah dari tabel soal publik), `exam_sessions`, `student_answers`, `proctor_logs`.
- [x] **2.2 Row Level Security (`supabase/rls-policies.sql`)**
  - Terapkan isolasi data per `school_id`/`npsn` untuk semua query non-superadmin.
  - Blokir akses baca siswa ke tabel `question_keys`.
- [x] **2.3 Auth & Route Guard (`src/lib/guard.js`)**
  - Pasang pengecekan sesi & role aktif di awal loading `superadmin-dashboard.html`, `admin-dashboard.html`, `proktor-dashboard.html`, `guru-dashboard.html`, `rbac.html`, dan `exam-room.html`.
  - Redirect otomatis ke `index.html` jika belum login atau role tidak sesuai.
- [x] **2.4 Refactor `src/services/data-store.js`**
  - Ganti penyimpanan mock/lokal dengan query Supabase asli terisolasi per `school_id`.
- **DoD Fase 2:** User tidak bisa membuka dashboard role lain lewat URL langsung; kunci jawaban tidak pernah terkirim ke Network tab browser siswa.

---

## FASE 3: Keamanan CBT Engine & Ketahanan Offline
- [x] **3.1 Ekstrak CBT Engine (`src/engines/cbt-engine.js`)**
  - Cabut array `questions` hardcoded dan seluruh inline `<script>` dari `pages/exam-room.html`.
  - Ambil daftar soal secara dinamis dari Supabase berdasarkan `exam_id` & token aktif.
- [x] **3.2 Server-Side Grading (`supabase/functions/grade-exam/index.ts`)**
  - Hitung skor akhir di server saat siswa klik "Selesai Ujian".
  - Generate `Nomor Bukti Kirim` unik dari ID transaksi database dan tampilkan di `#success-overlay`.
  - Tambah tombol **Unduh/Cetak Bukti Selesai (PDF)** di `#success-overlay`.
- [x] **3.3 Auto-Save & Offline Queue (`src/lib/offline-sync.js`)**
  - Simpan setiap klik jawaban ke `localStorage` secara instan.
  - Lakukan background sync ke server tiap 15 detik atau saat koneksi kembali online (`window.addEventListener('online')`), disertai indikator status koneksi (Online/Menyimpan/Offline).
- [x] **3.4 Server-Synced Timer & Anti-Cheat**
  - Hitung sisa waktu ujian berdasarkan `server_start_time` + durasi (tahan manipulasi jam perangkat).
  - Aktifkan deteksi pindah tab (`visibilitychange`), wajib fullscreen, acak urutan soal & opsi, serta catat pelanggaran ke `proctor_logs`.
- **DoD Fase 3:** Simulasi matikan Wi-Fi lalu refresh halaman di `exam-room.html` tidak menghilangkan jawaban siswa; Inspect Element tidak menampilkan kunci jawaban.

---

## FASE 4: Bank Soal AKM Lengkap & UX Ramah Siswa SD
- [x] **4.1 Lengkapi Tipe Soal AKM**
  - Pertahankan tipe `single` (PG Tunggal) dan `multiple` (PG Kompleks).
  - Tambahkan tipe: `true_false_table` (Benar-Salah Majemuk), `matching` (Menjodohkan), dan `short_answer` (Isian Singkat).
- [x] **4.2 Dukungan Media Stimulus**
  - Render gambar (Supabase Storage), tabel terstruktur, pecahan/notasi matematika (KaTeX), dan audio player pada field `stimulus` (Literasi, Numerasi, IPAS).
- [x] **4.3 Aksesibilitas Ruang Ujian**
  - Hubungkan tombol kontrol ukuran huruf (`A-`, `A`, `A+`) ke class `font-size-small`, `font-size-normal`, `font-size-large` pada `<body>`.
  - Tambah mode kontras tinggi, tombol "Ragu-ragu" (kuning), dan peta navigasi nomor soal yang responsif untuk layar Chromebook/tablet.
- **DoD Fase 4:** Semua 5 tipe soal AKM dapat dibuat oleh guru, dikerjakan siswa dengan gambar/pecahan rapi, dan terkoreksi otomatis di server.

---

## FASE 5: Operasional Proktor, Guru & Stabilitas Produksi
- [x] **5.1 Dashboard Proktor Real-Time (`pages/proktor-dashboard.html`)**
  - Monitor live status peserta (Belum Login, Mengerjakan, Selesai, Peringatan Pindah Tab) via Supabase Realtime.
  - Tambah fitur: Generate Token Ujian (refresh tiap 15 menit), **Reset Login** (jika siswa pindah perangkat), dan **Tambah Waktu** per siswa/ruang.
- [x] **5.2 Import & Export Excel (`src/services/export-service.js`)**
  - Import massal bank soal & daftar peserta via template `.xlsx`.
  - Export rekap nilai kelas & analisis butir soal (tingkat kesukaran, jumlah benar/salah per soal) ke `.xlsx` di `guru-dashboard.html`.
- [x] **5.3 Keep-Alive & Hardening Deploy**
  - Buat endpoint `api/keep-alive.js` dan daftarkan di `vercel.json` (`crons`) untuk mencegah auto-pause database.
  - Uji beban minimal 30-40 sesi bersamaan dan pastikan semua halaman memiliki loading skeleton & error toast yang jelas.
- **DoD Fase 5:** Proktor bisa merilis token, memantau 1 kelas secara live, reset login dalam 1 klik, dan guru bisa mengunduh rekap nilai Excel siap cetak.
