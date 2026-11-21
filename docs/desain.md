# Dokumentasi Desain UI/UX & Arsitektur Frontend: SI-CAKAP (`desain.md`)

## 1. Filosofi Desain
* **Distraction-Free (Bebas Gangguan):** Fokus utama adalah keterbacaan soal dan kemudahan interaksi tanpa elemen dekoratif yang membebani CPU Chromebook atau menguras baterai HP.
* **Touch & Cursor Friendly:** Semua tombol dan area klik opsi jawaban memiliki tinggi minimal `48px` agar nyaman ditekan jari di layar HP maupun diklik menggunakan *touchpad* Chromebook.
* **High Contrast & Clear Status:** Warna status fungsional (Terjawab, Ragu-ragu, Waktu Hampir Habis) harus langsung dikenali dalam sekali lihat.

---

## 2. Palet Warna (Color System)

| Kategori | Nama Token | Kode Hex | Setara Tailwind | Penggunaan |
| :--- | :--- | :--- | :--- | :--- |
| **Primary** | Cakap Blue | `#1E40AF` | `blue-800` | Header utama, identitas brand, tombol utama |
| **Primary Accent** | Royal Sky | `#2563EB` | `blue-600` | Hover state, link aktif, indikator fokus |
| **Secondary** | Academic Teal | `#0D9488` | `teal-600` | Badge kompetensi, aksen visual landing page |
| **Status: Terjawab** | Answered Green | `#16A34A` | `green-600` | Nomor soal sudah dijawab, status online |
| **Status: Ragu-ragu**| Doubt Amber | `#F59E0B` | `amber-500` | Tombol & indikator nomor soal ragu-ragu |
| **Status: Bahaya** | Alert Red | `#DC2626` | `red-600` | Sisa waktu di bawah 5 menit, peringatan kecurangan |
| **Background** | Surface Slate | `#F8FAFC` | `slate-50` | Latar belakang utama ruang ujian (tidak menyilaukan) |
| **Card / Paper** | Pure White | `#FFFFFF` | `white` | Kartu soal, modal dialog, kartu navigasi |
| **Text Primary** | Ink Dark | `#0F172A` | `slate-900` | Teks bacaan soal dan judul |
| **Text Muted** | Slate Gray | `#475569` | `slate-600` | Label sekunder, petunjuk pengerjaan |

---

## 3. Tipografi (Typography)
* **Font Utama (UI & Bacaan Soal):** `Plus Jakarta Sans` atau `Inter` (Sans-serif modern dengan *x-height* tinggi agar jelas di layar resolusi rendah 1366x768).
* **Font Monospace (Token & Timer):** `JetBrains Mono` atau `Fira Code` (angka memiliki lebar tetap/*tabular-nums* agar timer tidak bergoyang saat berdetik).
* **Skala Ukuran Teks Soal (Aksesibilitas):**
  * Normal (`A`): `16px` (`line-height: 1.6`)
  * Besar (`A+`): `18px` (`line-height: 1.7`)
  * Ekstra Besar (`A++`): `20px` (`line-height: 1.75`)

---

## 4. Strategi Responsif Lintas Perangkat (Responsive Breakpoints)

### A. Smartphone / Handphone (Lebar di bawah 768px)
* **Header Ringkas:** Hanya menampilkan Logo singkat, Nomor Soal Aktif, Sisa Waktu (*Sticky Top*), dan tombol *Grid Daftar Soal* (membuka *Bottom Sheet Drawer*).
* **Soal Berwacana:** Wacana panjang ditampilkan dalam *Accordion* yang bisa dibuka-tutup di atas soal agar siswa tidak perlu menggulir terlalu jauh.
* **Navigasi Bawah (*Sticky Bottom Bar*):** Tombol `Sebelumnya`, `Ragu-ragu`, dan `Selanjutnya` menempel di bagian bawah layar, mudah dijangkau ibu jari.

### B. Chromebook (11.6" - 14" / Resolusi 1366x768px)
* **Optimasi Ruang Vertikal:** Karena tinggi layar Chromebook terbatas (`768px`), tinggi *Top Navbar* dibatasi maksimal `56px`.
* **Layout 2 Kolom Proporsional:**
  * **Kiri (75% lebar):** Area wacana dan butir soal (dapat di-*scroll* independen).
  * **Kanan (25% lebar):** Panel profil singkat, Timer besar, dan Grid Nomor Soal (tetap terlihat tanpa perlu membuka tutup menu).
* **Pintasan Keyboard Chromebook:** Mendukung tombol `A`, `B`, `C`, `D`, `E` untuk memilih jawaban dan tombol panah Kiri/Kanan untuk pindah soal.

### C. Laptop & Desktop (Lebar 1440px ke atas)
* **Split-Screen Wacana & Soal:** Untuk soal literasi/numerasi dengan teks panjang, layar otomatis membagi area bacaan di sisi kiri dan opsi pertanyaan di sisi kanan, sementara panel navigasi nomor soal berada di bilah kanan.

---

## 5. Arsitektur Komponen Landing Page
1. **Top Navigation Bar:** Logo SI-CAKAP, Menu navigasi cepat (*Fitur, Perangkat, Alur Ujian, Statistik*), serta tombol CTA **Masuk Portal Ujian**.
2. **Hero Section:**
   * *Headline* kuat tentang transformasi asesmen akademik.
   * *Badge* kompatibilitas: Laptop, Chromebook, Smartphone.
   * **Interactive Quick-Login Card:** Widget simulasi input NISN & Token Ujian 6 digit langsung di beranda.
3. **Device Compatibility Showcase:** Visualisasi bagaimana sistem beradaptasi otomatis di 3 perangkat.
4. **Core Features Bento Grid:** 6 keunggulan utama (CBT Adaptif, Anti-Curang, Rapor Kompetensi, Hemat Kuota, Bank Soal Multimedia, Sinkronisasi Dapodik/Excel).
5. **Exam Workflow (4 Langkah):** Persiapan -> Masuk Token -> Kerjakan Asesmen -> Hasil & Peta Kompetensi.
6. **Footer & Pusat Bantuan:** Informasi sekolah/instansi, status server *live*, dan kontak proktor pusat.

---

## 6. Rekomendasi Tech Stack Implementasi
* **Frontend:** HTML5, Tailwind CSS, Alpine.js (untuk prototipe cepat/ringan) atau Next.js / Vue.js (untuk skala produksi penuh dengan PWA).
* **Penyimpanan Lokal (Client):** IndexedDB (via Dexie.js) untuk menyimpan antrean jawaban saat *offline*.
* **Backend & Database:** Laravel 11 / Node.js (Fastify) + PostgreSQL + Redis (untuk penyimpanan sesi ujian & *token caching*).
