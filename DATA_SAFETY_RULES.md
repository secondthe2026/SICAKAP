# DATA SAFETY RULES - SICAKAP PRODUCTION PERSISTENCE
**Aturan Wajib Keamanan & Persistensi Data Produksi (Anti-Hilang / Anti-Reset)**

Dokumen ini adalah aturan permanen arsitektur data sistem SI-CAKAP CBT. Setiap modifikasi kode, penambahan fitur, perbaikan bug, penyesuaian UI, dan migrasi database **WAJIB** mematuhi ketentuan di bawah ini:

---

## 1. Supabase sebagai Single Source of Truth
1. Seluruh data operasional sekolah:
   - Profil Sekolah (`public.schools`)
   - Data Guru (`public.profiles` role `guru`)
   - Data Rombel / Kelas (`public.classes`)
   - Data Siswa (`public.profiles` role `siswa`)
   - Paket & Jadwal Ujian (`public.exams`)
   - Bank Soal & Pilihan Jawaban (`public.questions`)
   - Sesi Ujian & Jawaban Siswa (`public.exam_sessions`, `public.student_answers`)
   - Rekap Nilai Ujian (`public.exam_results`)
   **WAJIB** disimpan dan dibaca langsung dari database Supabase Cloud terisolasi per `school_id`.
2. `localStorage` dan `sessionStorage` **HANYA** diperbolehkan untuk:
   - Token otentikasi sesi aktif
   - Cache baca sementara (*read-through cache*) untuk performa offline
   - Preferensi tampilan UI (tema, ukuran font, status collapse sidebar)
3. **DILARANG KERAS** menjadikan `localStorage` sebagai sumber data primer yang menimpa data server saat halaman dimuat (*page refresh / redeploy*).

---

## 2. Pencegahan Race-Condition & Auto-Wipe (Anti Overwrite)
1. **Hydration Protection (`isHydrated === true`)**:
   - Sistem **DILARANG KERAS** mengirim atau menyimpan state kosong (`[]` atau `{}`) ke Supabase sebelum proses *fetch* data awal dari server benar-benar selesai dan terverifikasi.
2. **Explicit Per-Row CRUD**:
   - Seluruh mutasi data (Tambah, Ubah, Hapus) wajib menggunakan operasi eksplisit per baris (`INSERT`, `UPDATE`, `UPSERT`, `DELETE`) berdasarkan `id` dan `school_id`.
   - **DILARANG KERAS** menggunakan metode penimpaan koleksi (*full array overwrite* atau *truncate-and-reinsert*) yang berisiko menghapus data lain yang diinput bersamaan.

---

## 3. Matikan Auto-Seeding Demo & Proteksi Fitur Destruktif di Produksi
1. **Zero Demo Auto-Seeding**:
   - Akun sekolah riil yang telah login atau mendaftar **TIDAK BOLEH** pernah di-seed dengan data dummy/demo (SDN 1 Nusantara, guru contoh, soal contoh) baik saat login pertama, ganti versi aplikasi, maupun setelah deployment Vercel.
2. **Hapus Tombol Reset Demo di Produksi**:
   - Tombol atau fungsi "Reset Data Demo" dilarang berada di antarmuka produksi Admin Sekolah atau Guru.
3. **Backup & Restore Aman**:
   - Tombol "Backup JSON" wajib mengekspor data riil dari Supabase berdasarkan `school_id`.
   - Fitur "Restore JSON" wajib menggunakan mode `UPSERT` per baris dengan konfirmasi ganda dan validasi integritas skema (bukan *wipe* seluruh tabel).

---

## 4. Aturan Migrasi SQL Non-Destruktif (Additive Only)
1. Setiap perubahan skema database Supabase wajib bersifat **ADITIF**:
   - Gunakan `CREATE TABLE IF NOT EXISTS`
   - Gunakan `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` lengkap dengan nilai `DEFAULT` aman
   - Gunakan `CREATE INDEX IF NOT EXISTS`
2. **DILARANG KERAS** menjalankan:
   - `DROP TABLE`
   - `TRUNCATE`
   - `ALTER TABLE ... DROP COLUMN`
   - `DELETE FROM ...` tanpa klausa `WHERE school_id = ...` dan `id = ...` spesifik.
3. Seluruh tabel baru wajib mengaktifkan Row Level Security (`ENABLE ROW LEVEL SECURITY`) dan dilengkapi minimal policy isolasi tenant:
   - Admin Sekolah (`school_id = get_my_school_id()`)
   - Guru / Proktor / Siswa sesuai hak akses kelasnya (`.agent/rules/rbac-sicakap.md`)
   - Superadmin approval isolation.

