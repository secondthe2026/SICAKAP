---
description: Validasi build lokal dan deploy otomatis SICAKAP ke GitHub dan Vercel
---
Jalankan langkah berikut secara berurutan tanpa menunggu konfirmasi tambahan:
1. Validasi Build: Jalankan `npm run build` (dan `npx tsc --noEmit` jika TypeScript aktif). Jika ada error build/type/import, perbaiki dulu sampai build sukses 100%. Jangan lanjut push jika build gagal.
2. Cek Keamanan File: Jalankan `git status` dan pastikan file `.env`, `.env.local`, dan credential rahasia TIDAK ikut ter-stage.
3. Deploy Otomatis ke Produksi: Jalankan:
   - `git add .`
   - `git commit -m "<pesan commit singkat sesuai perubahan>"`
   - `git push origin main`
   (Push ke branch `main` pada repo `secondthe2026/SICAKAP` otomatis memicu Production Deployment di Vercel `digitalpemula-sicakap.vercel.app`).
4. Jika tidak ada perubahan file tetapi tetap diminta deploy, jalankan:
   - `git commit --allow-empty -m "chore: trigger vercel deploy"`
   - `git push origin main`
5. Fallback: Hanya jika `git push` gagal atau tidak memicu deploy Vercel, jalankan `npx vercel --prod --yes`.
6. Sinkronisasi Supabase (jika ada perubahan tabel/RLS/Edge Function): Jalankan `npx supabase db push` jika CLI terhubung, atau tampilkan blok SQL siap salin untuk dijalankan di SQL Editor Supabase.
7. Laporan Akhir (maksimal 4 baris): Status Build, Commit Hash & Branch, Status Push/Deploy, dan URL Produksi `https://digitalpemula-sicakap.vercel.app`.

