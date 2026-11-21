---
trigger: always_on
---
ATURAN WAJIB HAK AKSES PENGGUNA (RBAC) & ISOLASI KELAS - SICAKAP

Setiap pembuatan atau modifikasi fitur, route UI, query Supabase, dan RLS Policy WAJIB mematuhi pembatasan 4 role berikut tanpa pengecualian:

1. SUPERADMIN
- Akses: HANYA manajemen & approval sekolah (setujui, tolak, aktifkan/nonaktifkan, hapus sekolah).
- Larangan: Tidak boleh menampilkan/mengakses operasional internal ujian sekolah (bank soal, data siswa, pantau ujian, rekap nilai).

2. ADMIN SEKOLAH
- Scope Data: Terkunci hanya pada `school_id` miliknya.
- Akses:
  - Tambah, edit, reset password, dan hapus akun GURU untuk login SICAKAP.
  - Wajib mengisi field `kelas` (misal: Kelas 1 s.d. Kelas 6 / rombel) saat membuat atau mengedit akun Guru.
  - Akses penuh seluruh fitur operasional di dalam sekolahnya untuk semua kelas (siswa, bank soal, jadwal ujian, pantau ujian, rekap nilai).
- Larangan: DILARANG keras mengakses menu, halaman, atau API approval sekolah milik Superadmin.

3. GURU (TERKUNCI PER KELAS - ANTI TUMPANG TINDIH)
- Scope Data: Terkunci ketat pada `school_id = guru.school_id` DAN `kelas = guru.kelas`.
- Akses (hanya untuk kelasnya sendiri):
  - Tambah, edit, dan hapus data siswa (`school_id` & `kelas` otomatis terkunci/read-only sesuai profil guru).
  - Buat dan kelola username & password login siswa.
  - Buat, edit, dan hapus soal serta paket ujian khusus kelasnya.
  - Pantau ujian secara real-time khusus siswa di kelasnya.
  - Lihat dan ekspor rekap nilai per mata pelajaran khusus siswa di kelasnya.
- Larangan:
  - DILARANG melihat, menambah, mengubah, memantau, atau merekap siswa, soal, ujian, maupun nilai milik kelas lain (contoh: Guru Kelas 1 tidak boleh mengakses data Guru Kelas 5 dan sebaliknya).
  - Tidak bisa membuat akun Guru lain atau mengakses menu Admin Sekolah & Superadmin.

4. SISWA
- Scope Data: Terkunci pada `user_id`, `school_id`, dan `kelas` miliknya.
- Akses: HANYA login, melihat ujian aktif milik sekolah & kelasnya, mengerjakan ujian, dan submit jawaban.
- Larangan: Tidak bisa mengakses panel Guru, Admin Sekolah, Superadmin, soal kelas lain, atau nilai siswa lain.

ENFORSEMEN TEKNIS WAJIB:
- Kolom `school_id` dan `kelas` wajib ada & terindeks pada tabel `profiles`, `exams`, `questions`, `exam_sessions`, dan `exam_results`.
- Supabase RLS Policy memblokir query lintas tenant / lintas kelas sesuai spesifikasi di atas.
- Frontend Route Guard me-redirect user jika tidak memiliki role yang diizinkan.
- Input/dropdown kelas pada form Guru wajib terkunci (disabled/read-only) sesuai profil guru yang login.

