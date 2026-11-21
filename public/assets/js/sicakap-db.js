/**
 * ==============================================================================
 * SI-CAKAP SD - IMPECCABLE DATA PERSISTENCE ENGINE (assets/js/sicakap-db.js)
 * Single Source of Truth & Real-Time Cross-Tab Persistence for SD/MI CBT Platform
 * Version: v2.5-SD
 * ==============================================================================
 */

(function (window) {
  'use strict';

  const DB_VERSION = 'v2.5-SD';
  const CHANNEL_NAME = 'sicakap_broadcast_channel';

  // Storage Keys Standard Blueprint
  const KEYS = {
    VERSION: 'sicakap_version',
    SEKOLAH: 'sicakap_sekolah',
    PROFIL_SEKOLAH: 'sicakap_profil_sekolah',
    AKUN_ADMIN: 'sicakap_akun_admin',
    GURU: 'sicakap_guru',
    ROMBEL: 'sicakap_rombel',
    SISWA: 'sicakap_siswa',
    JADWAL: 'sicakap_jadwal',
    SOAL: 'sicakap_soal',
    MAPEL: 'sicakap_mapel',
    SESI_AKTIF: 'sicakap_sesi_aktif',
    LIVE_SCORES: 'sicakap_live_scores',
    SNAPSHOT: 'sicakap_backup_snapshot',
    LEGACY_SUBMISSIONS: 'sicakap_school_submissions'
  };

  // Seed Data: Sekolah Dasar Ceria (SD/MI Kelas 1 - 6)
  const SEED_DATA = {
    sekolah: [
      { id: 'SCH-001', nama: 'SDN 1 Nusantara', npsn: '20104567', email: 'admin@sdn1nusantara.sch.id', jenjang: 'SD Negeri', waktu: '10 Menit lalu', status: 'approved', approvedAt: '2026-10-28 08:30' },
      { id: 'SCH-002', nama: 'SD Telkom Mandiri', npsn: '20531234', email: 'cbt@sdtelkom.sch.id', jenjang: 'SD Swasta', waktu: '25 Menit lalu', status: 'pending', approvedAt: null },
      { id: 'SCH-003', nama: 'MI Al-Falah Surabaya', npsn: '60718899', email: 'kurikulum@mialfalah.sch.id', jenjang: 'MI', waktu: '1 Jam lalu', status: 'pending', approvedAt: null },
      { id: 'SCH-004', nama: 'SDIT Cahaya Hati', npsn: '20119988', email: 'info@cayahati.sch.id', jenjang: 'SD Swasta', waktu: '1 Hari lalu', status: 'rejected', approvedAt: null }
    ],
    guru: [
      { id: 'GUR-01', nip: '197508122000032001', nama: 'Dra. Hj. Nurjanah, M.Pd.', email: 'guru.kelas5@sdn1nusantara.sch.id', mapel: 'Matematika & IPAS', rombelWali: 'RMB-5A', password: 'cakap2026', updatedAt: '2026-10-28 07:00' },
      { id: 'GUR-02', nip: '198204152008011004', nama: 'Budi Santoso, S.Pd.', email: 'budi.guru@sdn1nusantara.sch.id', mapel: 'Bahasa Indonesia & PPKn', rombelWali: 'RMB-5B', password: 'cakap2026', updatedAt: '2026-10-28 07:00' },
      { id: 'GUR-03', nip: '198911202014022003', nama: 'Siti Rahmawati, S.Pd.SD.', email: 'siti.rahma@sdn1nusantara.sch.id', mapel: 'Literasi & Numerasi Awal', rombelWali: 'RMB-1A', password: 'cakap2026', updatedAt: '2026-10-28 07:00' },
      { id: 'GUR-04', nip: '199103082019031002', nama: 'Ahmad Fauzi, S.Pd.', email: 'ahmad.fauzi@sdn1nusantara.sch.id', mapel: 'PJOK & Seni Budaya', rombelWali: 'RMB-6A', password: 'cakap2026', updatedAt: '2026-10-28 07:00' },
      { id: 'GUR-05', nip: '198705142010012015', nama: 'Dewi Lestari, S.Pd.', email: 'dewi.lestari@sdn1nusantara.sch.id', mapel: 'Pendidikan Pancasila & Agama', rombelWali: 'RMB-2A', password: 'cakap2026', updatedAt: '2026-10-28 07:00' },
      { id: 'GUR-06', nip: '197906232005011008', nama: 'Hendra Wijaya, M.Pd.', email: 'hendra.wijaya@sdn1nusantara.sch.id', mapel: 'Bahasa Inggris SD & IPAS', rombelWali: 'RMB-6B', password: 'cakap2026', updatedAt: '2026-10-28 07:00' }
    ],
    rombel: [
      { id: 'RMB-1A', namaRombel: 'Kelas 1A', tingkat: '1', fase: 'Fase A', waliKelasId: 'GUR-03', jumlahSiswa: 28, updatedAt: '2026-10-28' },
      { id: 'RMB-1B', namaRombel: 'Kelas 1B', tingkat: '1', fase: 'Fase A', waliKelasId: '', jumlahSiswa: 26, updatedAt: '2026-10-28' },
      { id: 'RMB-2A', namaRombel: 'Kelas 2A', tingkat: '2', fase: 'Fase A', waliKelasId: 'GUR-05', jumlahSiswa: 27, updatedAt: '2026-10-28' },
      { id: 'RMB-2B', namaRombel: 'Kelas 2B', tingkat: '2', fase: 'Fase A', waliKelasId: '', jumlahSiswa: 25, updatedAt: '2026-10-28' },
      { id: 'RMB-3A', namaRombel: 'Kelas 3A', tingkat: '3', fase: 'Fase B', waliKelasId: '', jumlahSiswa: 28, updatedAt: '2026-10-28' },
      { id: 'RMB-3B', namaRombel: 'Kelas 3B', tingkat: '3', fase: 'Fase B', waliKelasId: '', jumlahSiswa: 28, updatedAt: '2026-10-28' },
      { id: 'RMB-4A', namaRombel: 'Kelas 4A', tingkat: '4', fase: 'Fase B', waliKelasId: '', jumlahSiswa: 30, updatedAt: '2026-10-28' },
      { id: 'RMB-4B', namaRombel: 'Kelas 4B', tingkat: '4', fase: 'Fase B', waliKelasId: '', jumlahSiswa: 29, updatedAt: '2026-10-28' },
      { id: 'RMB-5A', namaRombel: 'Kelas 5A', tingkat: '5', fase: 'Fase C', waliKelasId: 'GUR-01', jumlahSiswa: 30, updatedAt: '2026-10-28' },
      { id: 'RMB-5B', namaRombel: 'Kelas 5B', tingkat: '5', fase: 'Fase C', waliKelasId: 'GUR-02', jumlahSiswa: 29, updatedAt: '2026-10-28' },
      { id: 'RMB-6A', namaRombel: 'Kelas 6A', tingkat: '6', fase: 'Fase C', waliKelasId: 'GUR-04', jumlahSiswa: 31, updatedAt: '2026-10-28' },
      { id: 'RMB-6B', namaRombel: 'Kelas 6B', tingkat: '6', fase: 'Fase C', waliKelasId: 'GUR-06', jumlahSiswa: 30, updatedAt: '2026-10-28' }
    ],
    siswa: [
      { id: 'SIS-001', nisn: '0084928192', nama: 'Ahmad Rizky Pratama', rombelId: 'RMB-5A', password: 'CAKAP-8192', statusUjian: 'Belum Ujian', updatedAt: '2026-10-28' },
      { id: 'SIS-002', nisn: '0084928193', nama: 'Aisyah Putri Azzahra', rombelId: 'RMB-5A', password: 'SD5A-8193', statusUjian: 'Sedang Mengerjakan', updatedAt: '2026-10-28' },
      { id: 'SIS-003', nisn: '0084928194', nama: 'Budi Santoso', rombelId: 'RMB-5A', password: 'SD5A-8194', statusUjian: 'Belum Ujian', updatedAt: '2026-10-28' },
      { id: 'SIS-004', nisn: '0084928195', nama: 'Cantika Dewi Lestari', rombelId: 'RMB-5B', password: 'SD5B-1094', statusUjian: 'Selesai', updatedAt: '2026-10-28' },
      { id: 'SIS-005', nisn: '0084928196', nama: 'Dimas Anggara Putra', rombelId: 'RMB-5B', password: 'SD5B-2895', statusUjian: 'Belum Ujian', updatedAt: '2026-10-28' },
      { id: 'SIS-006', nisn: '0084928197', nama: 'Farhan Maulana Malik', rombelId: 'RMB-6A', password: 'SD6A-9912', statusUjian: 'Belum Ujian', updatedAt: '2026-10-28' },
      { id: 'SIS-007', nisn: '0084928198', nama: 'Gita Rahmawati', rombelId: 'RMB-6A', password: 'SD6A-3321', statusUjian: 'Selesai', updatedAt: '2026-10-28' },
      { id: 'SIS-008', nisn: '0084928199', nama: 'Hafiz Al-Fikri', rombelId: 'RMB-1A', password: 'SD1A-7741', statusUjian: 'Belum Ujian', updatedAt: '2026-10-28' },
      { id: 'SIS-009', nisn: '0084928200', nama: 'Intan Permata Sari', rombelId: 'RMB-2A', password: 'SD2A-5510', statusUjian: 'Belum Ujian', updatedAt: '2026-10-28' },
      { id: 'SIS-010', nisn: '0084928201', nama: 'Joko Prabowo', rombelId: 'RMB-5A', password: 'SD5A-4499', statusUjian: 'Sedang Mengerjakan', updatedAt: '2026-10-28' }
    ],
    jadwal: [
      { id: 'JDW-01', namaUlangan: 'Ulangan Harian Bab 2 (Pecahan & Desimal)', mapel: 'Matematika SD', rombelId: 'RMB-5A', tanggal: '2026-10-28', jamMulai: '08:00', durasiMenit: 60, token: 'CKP26A', status: 'Aktif', updatedAt: '2026-10-28' },
      { id: 'JDW-02', namaUlangan: 'Asesmen Sumatif Tengah Semester (ASTS)', mapel: 'IPAS Fase C', rombelId: 'RMB-5B', tanggal: '2026-10-29', jamMulai: '09:30', durasiMenit: 60, token: 'ASTS26', status: 'Aktif', updatedAt: '2026-10-28' },
      { id: 'JDW-03', namaUlangan: 'Simulasi Literasi & AKM SD', mapel: 'Bahasa Indonesia', rombelId: 'RMB-6A', tanggal: '2026-10-30', jamMulai: '08:00', durasiMenit: 90, token: 'AKMSD1', status: 'Nonaktif', updatedAt: '2026-10-28' }
    ],
    soal: [
      {
        id: 1,
        mapel: 'Matematika SD',
        tingkat: '5',
        tipe: 'single',
        wacana: 'Ibu Siti membuat kue bolu pandan untuk syukuran di kelas. Kue dipotong menjadi 12 bagian sama besar. Edo makan 2 potong, Lani makan 3 potong, Siti makan 1 potong. Sisa kue akan diberikan ke wali kelas.',
        pertanyaan: 'Berapa bagian kue bolu yang masih tersisa untuk diberikan kepada guru wali kelas?',
        opsi: [
          { key: 'A', text: '4/12 bagian (atau 1/3 bagian)' },
          { key: 'B', text: '6/12 bagian (atau 1/2 bagian)' },
          { key: 'C', text: '7/12 bagian' },
          { key: 'D', text: '8/12 bagian' }
        ],
        kunci: 'B',
        cpTp: 'Numerasi SD: Pecahan & Operasi Hitung Fase C',
        levelKognitif: 'L2 (Aplikasi)'
      },
      {
        id: 2,
        mapel: 'Bahasa Indonesia',
        tingkat: '5',
        tipe: 'multiple',
        wacana: 'Di lereng Gunung Merapi, Kancil melihat kawanan Semut bergotong royong mengumpulkan padi. Kancil menolong menyingkirkan ranting pohon yang menghalangi jalan sarang semut tanpa pamrih.',
        pertanyaan: 'Sikap baik apa yang dapat diteladani dari cerita di atas? (Centang jawaban benar)',
        opsi: [
          { key: 'A', text: 'Membantu sesama yang membutuhkan dengan tulus dan sukarela.' },
          { key: 'B', text: 'Menjaga kerukunan dan saling menyayangi antar sesama makhluk.' },
          { key: 'C', text: 'Menuntut hadiah buah manis setiap kali menolong teman.' },
          { key: 'D', text: 'Mengambil bulir padi milik semut untuk diri sendiri.' }
        ],
        kunci: ['A', 'B'],
        cpTp: 'Literasi Membaca: Teks Fabel & Karakter Luhur Fase C',
        levelKognitif: 'L3 (Penalaran)'
      },
      {
        id: 3,
        mapel: 'IPAS Fase C',
        tingkat: '5',
        tipe: 'single',
        wacana: 'Rantai makanan ekosistem sawah: Padi -> Belalang -> Katak -> Ular -> Elang. Petani menyemprot pembasmi hama berlebihan sehingga belalang musnah.',
        pertanyaan: 'Apa yang kemungkinan besar akan terjadi pada populasi katak dan tanaman padi?',
        opsi: [
          { key: 'A', text: 'Populasi katak bertambah banyak dan tanaman padi rusak.' },
          { key: 'B', text: 'Populasi katak berkurang drastis, dan tanaman padi tumbuh lebih subur.' },
          { key: 'C', text: 'Burung elang langsung berkembang biak dengan cepat di sawah.' },
          { key: 'D', text: 'Tanaman padi layu karena tidak ada belalang.' }
        ],
        kunci: 'B',
        cpTp: 'IPAS SD: Keseimbangan Ekosistem & Jaring Makanan',
        levelKognitif: 'L3 (Analisis)'
      },
      {
        id: 4,
        mapel: 'IPAS Fase C',
        tingkat: '5',
        tipe: 'short',
        wacana: 'Manusia bernapas menghirup gas oksigen yang dibutuhkan tubuh dan menghembuskan karbon dioksida melalui organ respirasi di dada.',
        pertanyaan: 'Apakah nama organ utama tempat terjadinya pertukaran gas oksigen dan karbon dioksida pada manusia?',
        opsi: [],
        kunci: 'paru-paru',
        cpTp: 'IPAS SD: Sistem Pernapasan Manusia',
        levelKognitif: 'L1 (Pemahaman)'
      }
    ],
    liveScores: [
      { nisn: '0084928192', nama: 'Ahmad Rizky Pratama', rombelId: 'RMB-5A', mapel: 'Matematika SD', terjawab: 0, totalSoal: 4, benar: 0, salah: 0, skor: 0, status: 'Belum Ujian', updatedAt: '2026-10-28 08:00' },
      { nisn: '0084928193', nama: 'Aisyah Putri Azzahra', rombelId: 'RMB-5A', mapel: 'Matematika SD', terjawab: 3, totalSoal: 4, benar: 2, salah: 1, skor: 75, status: 'Sedang Mengerjakan', updatedAt: '2026-10-28 08:24' },
      { nisn: '0084928194', nama: 'Budi Santoso', rombelId: 'RMB-5A', mapel: 'Matematika SD', terjawab: 0, totalSoal: 4, benar: 0, salah: 0, skor: 0, status: 'Belum Ujian', updatedAt: '2026-10-28 08:00' },
      { nisn: '0084928195', nama: 'Cantika Dewi Lestari', rombelId: 'RMB-5B', mapel: 'IPAS Fase C', terjawab: 4, totalSoal: 4, benar: 4, salah: 0, skor: 100, status: 'Selesai', updatedAt: '2026-10-28 08:35' },
      { nisn: '0084928201', nama: 'Joko Prabowo', rombelId: 'RMB-5A', mapel: 'Matematika SD', terjawab: 2, totalSoal: 4, benar: 2, salah: 0, skor: 50, status: 'Sedang Mengerjakan', updatedAt: '2026-10-28 08:26' }
    ],
    mapel: [
      { id: 'MP-01', nama: 'Matematika', icon: '📐', deskripsi: 'Numerasi, Pecahan, & Operasi Hitung SD' },
      { id: 'MP-02', nama: 'Bahasa Indonesia', icon: '📖', deskripsi: 'Literasi Membaca, Fabel & Tata Bahasa' },
      { id: 'MP-03', nama: 'IPAS', icon: '🌿', deskripsi: 'Ilmu Pengetahuan Alam & Sosial SD' },
      { id: 'MP-04', nama: 'Pendidikan Pancasila', icon: '🇮🇩', deskripsi: 'Kewarganegaraan & Karakter Luhur' },
      { id: 'MP-05', nama: 'Bahasa Inggris', icon: '🇬🇧', deskripsi: 'Basic Vocabulary & Reading SD' },
      { id: 'MP-06', nama: 'PJOK', icon: '⚽', deskripsi: 'Pendidikan Jasmani & Kebugaran' },
      { id: 'MP-07', nama: 'Seni Budaya', icon: '🎨', deskripsi: 'Seni Rupa, Musik & Prakarya SD' },
      { id: 'MP-08', nama: 'Literasi ANBK', icon: '📝', deskripsi: 'Asesmen Nasional Literasi SD' },
      { id: 'MP-09', nama: 'Numerasi ANBK', icon: '📊', deskripsi: 'Asesmen Nasional Numerasi SD' }
    ],
    profilSekolah: {
      namaSekolah: 'SDN 1 Nusantara',
      npsn: '20104567',
      nss: '101056001001',
      alamat: 'Jl. Merdeka Pendidikan No. 45, Kebayoran Baru, Jakarta Selatan',
      kepsekNama: 'Drs. H. Mulyadi, M.Pd.',
      kepsekNip: '196803121992031004',
      tahunPelajaran: '2026/2027 SD',
      semester: 'Ganjil',
      logoUrl: ''
    },
    akunAdmin: {
      nama: 'Admin SDN 1 Nusantara',
      email: 'admin@sdn1nusantara.sch.id',
      username: 'admin',
      password: ''
    }
  };

  // Safe BroadcastChannel Setup
  let broadcastChannel = null;
  try {
    if (typeof window.BroadcastChannel !== 'undefined') {
      broadcastChannel = new window.BroadcastChannel(CHANNEL_NAME);
    }
  } catch (err) {
    console.warn('[SicakapDB] BroadcastChannel not supported, relying on storage events', err);
  }

  const SicakapDB = {
    KEYS: KEYS,
    VERSION: DB_VERSION,

    // Safe JSON Parse with fallback
    safeParse: function (str, fallback) {
      if (!str) return fallback;
      try {
        return JSON.parse(str);
      } catch (e) {
        console.warn('[SicakapDB] JSON parse error, restoring fallback', e);
        return fallback;
      }
    },

    // Atomic Read
    read: function (key, fallback) {
      try {
        const val = localStorage.getItem(key);
        if (val === null) return fallback;
        return this.safeParse(val, fallback);
      } catch (err) {
        console.error('[SicakapDB] Atomic Read error for ' + key, err);
        this.recoverFromSnapshot();
        return fallback;
      }
    },

    // Atomic Write with Snapshot Safeguard
    write: function (key, data, skipBroadcast) {
      try {
        const serialized = JSON.stringify(data);
        localStorage.setItem(key, serialized);
        this.updateSnapshot();
        if (!skipBroadcast) {
          this.broadcast(key, data);
        }
        return true;
      } catch (err) {
        console.error('[SicakapDB] Atomic Write error for ' + key, err);
        this.recoverFromSnapshot();
        return false;
      }
    },

    // Create Snapshot of all sicakap keys
    updateSnapshot: function () {
      try {
        const snapshot = {
          timestamp: new Date().toISOString(),
          version: DB_VERSION,
          sekolah: this.read(KEYS.SEKOLAH, SEED_DATA.sekolah),
          profilSekolah: this.read(KEYS.PROFIL_SEKOLAH, SEED_DATA.profilSekolah),
          akunAdmin: this.read(KEYS.AKUN_ADMIN, SEED_DATA.akunAdmin),
          guru: this.read(KEYS.GURU, SEED_DATA.guru),
          rombel: this.read(KEYS.ROMBEL, SEED_DATA.rombel),
          siswa: this.read(KEYS.SISWA, SEED_DATA.siswa),
          jadwal: this.read(KEYS.JADWAL, SEED_DATA.jadwal),
          soal: this.read(KEYS.SOAL, SEED_DATA.soal),
          mapel: this.read(KEYS.MAPEL, SEED_DATA.mapel),
          liveScores: this.read(KEYS.LIVE_SCORES, SEED_DATA.liveScores)
        };
        localStorage.setItem(KEYS.SNAPSHOT, JSON.stringify(snapshot));
      } catch (e) {
        console.warn('[SicakapDB] Failed to save snapshot', e);
      }
    },

    // Recover from Snapshot
    recoverFromSnapshot: function () {
      try {
        const raw = localStorage.getItem(KEYS.SNAPSHOT);
        if (raw) {
          const snapshot = JSON.parse(raw);
          if (snapshot && snapshot.guru) {
            localStorage.setItem(KEYS.SEKOLAH, JSON.stringify(snapshot.sekolah || SEED_DATA.sekolah));
            localStorage.setItem(KEYS.GURU, JSON.stringify(snapshot.guru));
            localStorage.setItem(KEYS.ROMBEL, JSON.stringify(snapshot.rombel));
            localStorage.setItem(KEYS.SISWA, JSON.stringify(snapshot.siswa));
            localStorage.setItem(KEYS.JADWAL, JSON.stringify(snapshot.jadwal));
            localStorage.setItem(KEYS.SOAL, JSON.stringify(snapshot.soal || SEED_DATA.soal));
            localStorage.setItem(KEYS.MAPEL, JSON.stringify(snapshot.mapel || SEED_DATA.mapel));
            localStorage.setItem(KEYS.LIVE_SCORES, JSON.stringify(snapshot.liveScores || SEED_DATA.liveScores));
            console.info('[SicakapDB] Restored database successfully from snapshot!');
            return true;
          }
        }
      } catch (e) {
        console.error('[SicakapDB] Snapshot recovery failed', e);
      }
      return false;
    },

    // Broadcast across tabs
    broadcast: function (key, data) {
      const payload = {
        key: key,
        version: DB_VERSION,
        data: data,
        timestamp: Date.now()
      };

      // 1. BroadcastChannel API
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage(payload);
        } catch (e) {
          console.warn('[SicakapDB] BroadcastChannel error', e);
        }
      }

      // 2. Dispatch internal custom events on current window
      window.dispatchEvent(new CustomEvent('sicakap_sync', { detail: payload }));
      if (key === KEYS.SISWA) window.dispatchEvent(new Event('sicakap_siswa_updated'));
      if (key === KEYS.ROMBEL) window.dispatchEvent(new Event('sicakap_rombel_updated'));
      if (key === KEYS.GURU) window.dispatchEvent(new Event('sicakap_guru_updated'));
      if (key === KEYS.JADWAL) window.dispatchEvent(new Event('sicakap_jadwal_updated'));
      if (key === KEYS.MAPEL) window.dispatchEvent(new Event('sicakap_mapel_updated'));
      if (key === KEYS.SOAL) window.dispatchEvent(new Event('sicakap_soal_updated'));
      if (key === KEYS.LIVE_SCORES) window.dispatchEvent(new Event('sicakap_live_scores_updated'));
      if (key === KEYS.SESI_AKTIF) window.dispatchEvent(new Event('sicakap_sesi_aktif_updated'));
    },

    // Initialize & Smart Auto-Seed
    init: function () {
      const curVersion = localStorage.getItem(KEYS.VERSION);
      const hasGuru = localStorage.getItem(KEYS.GURU);

      if (!curVersion || !hasGuru) {
        console.info('[SicakapDB] Auto-Seeding SD Initial Database (' + DB_VERSION + ')...');
        localStorage.setItem(KEYS.VERSION, DB_VERSION);
        localStorage.setItem(KEYS.SEKOLAH, JSON.stringify(SEED_DATA.sekolah));
        localStorage.setItem(KEYS.LEGACY_SUBMISSIONS, JSON.stringify(SEED_DATA.sekolah));
        localStorage.setItem(KEYS.GURU, JSON.stringify(SEED_DATA.guru));
        localStorage.setItem(KEYS.ROMBEL, JSON.stringify(SEED_DATA.rombel));
        localStorage.setItem(KEYS.SISWA, JSON.stringify(SEED_DATA.siswa));
        localStorage.setItem(KEYS.JADWAL, JSON.stringify(SEED_DATA.jadwal));
        localStorage.setItem(KEYS.SOAL, JSON.stringify(SEED_DATA.soal));
        localStorage.setItem(KEYS.MAPEL, JSON.stringify(SEED_DATA.mapel));
        localStorage.setItem(KEYS.LIVE_SCORES, JSON.stringify(SEED_DATA.liveScores));
        localStorage.setItem(KEYS.PROFIL_SEKOLAH, JSON.stringify(SEED_DATA.profilSekolah));
        localStorage.setItem(KEYS.AKUN_ADMIN, JSON.stringify(SEED_DATA.akunAdmin));
        this.updateSnapshot();
      }

      // Pastikan Mapel SD selalu terinisialisasi
      if (!localStorage.getItem(KEYS.MAPEL)) {
        localStorage.setItem(KEYS.MAPEL, JSON.stringify(SEED_DATA.mapel));
      }
      if (!localStorage.getItem(KEYS.PROFIL_SEKOLAH)) {
        localStorage.setItem(KEYS.PROFIL_SEKOLAH, JSON.stringify(SEED_DATA.profilSekolah));
      }
      if (!localStorage.getItem(KEYS.AKUN_ADMIN)) {
        localStorage.setItem(KEYS.AKUN_ADMIN, JSON.stringify(SEED_DATA.akunAdmin));
      }

      this.syncRombelStudentCount();
      this.listenBroadcast();
    },

    // Listen to real-time events from other tabs
    listenBroadcast: function () {
      if (this._listening) return;
      this._listening = true;

      if (broadcastChannel) {
        broadcastChannel.onmessage = (event) => {
          const payload = event.data;
          if (payload && payload.key) {
            window.dispatchEvent(new CustomEvent('sicakap_sync', { detail: payload }));
            if (payload.key === KEYS.SISWA) window.dispatchEvent(new Event('sicakap_siswa_updated'));
            if (payload.key === KEYS.ROMBEL) window.dispatchEvent(new Event('sicakap_rombel_updated'));
            if (payload.key === KEYS.GURU) window.dispatchEvent(new Event('sicakap_guru_updated'));
            if (payload.key === KEYS.JADWAL) window.dispatchEvent(new Event('sicakap_jadwal_updated'));
            if (payload.key === KEYS.MAPEL) window.dispatchEvent(new Event('sicakap_mapel_updated'));
            if (payload.key === KEYS.SOAL) window.dispatchEvent(new Event('sicakap_soal_updated'));
            if (payload.key === KEYS.LIVE_SCORES) window.dispatchEvent(new Event('sicakap_live_scores_updated'));
            if (payload.key === KEYS.SESI_AKTIF) window.dispatchEvent(new Event('sicakap_sesi_aktif_updated'));
            if (payload.key === KEYS.PROFIL_SEKOLAH) window.dispatchEvent(new Event('sicakap_profil_updated'));
            if (payload.key === KEYS.AKUN_ADMIN) window.dispatchEvent(new Event('sicakap_admin_updated'));
          }
        };
      }

      // Storage event fallback (runs on cross-tab changes in localStorage)
      window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('sicakap_')) {
          const payload = { key: e.key, data: this.safeParse(e.newValue, null), timestamp: Date.now() };
          window.dispatchEvent(new CustomEvent('sicakap_sync', { detail: payload }));
          if (e.key === KEYS.SISWA) window.dispatchEvent(new Event('sicakap_siswa_updated'));
          if (e.key === KEYS.ROMBEL) window.dispatchEvent(new Event('sicakap_rombel_updated'));
          if (e.key === KEYS.GURU) window.dispatchEvent(new Event('sicakap_guru_updated'));
          if (e.key === KEYS.JADWAL) window.dispatchEvent(new Event('sicakap_jadwal_updated'));
          if (e.key === KEYS.LIVE_SCORES) window.dispatchEvent(new Event('sicakap_live_scores_updated'));
          if (e.key === KEYS.SESI_AKTIF) window.dispatchEvent(new Event('sicakap_sesi_aktif_updated'));
          if (e.key === KEYS.PROFIL_SEKOLAH) window.dispatchEvent(new Event('sicakap_profil_updated'));
          if (e.key === KEYS.AKUN_ADMIN) window.dispatchEvent(new Event('sicakap_admin_updated'));
        }
      });
    },

    // ==========================================
    // 0. PROFIL SEKOLAH & AKUN ADMIN (SD)
    // ==========================================
    getProfilSekolah: function () {
      this.init();
      return this.read(KEYS.PROFIL_SEKOLAH, SEED_DATA.profilSekolah);
    },
    saveProfilSekolah: function (data) {
      this.write(KEYS.PROFIL_SEKOLAH, data);
      window.dispatchEvent(new CustomEvent('sicakap_profil_updated', { detail: data }));
      return data;
    },
    getAkunAdmin: function () {
      this.init();
      return this.read(KEYS.AKUN_ADMIN, SEED_DATA.akunAdmin);
    },
    saveAkunAdmin: function (data) {
      this.write(KEYS.AKUN_ADMIN, data);
      window.dispatchEvent(new CustomEvent('sicakap_admin_updated', { detail: data }));
      return data;
    },

    // ==========================================
    // 1. SEKOLAH (SUPERADMIN)
    // ==========================================
    getSekolah: function () {
      this.init();
      const list = this.read(KEYS.SEKOLAH, null);
      if (list) return list;
      const legacy = this.read(KEYS.LEGACY_SUBMISSIONS, SEED_DATA.sekolah);
      return legacy;
    },
    saveSekolah: function (list) {
      this.write(KEYS.SEKOLAH, list);
      this.write(KEYS.LEGACY_SUBMISSIONS, list, true);
    },
    addSekolah: function (item) {
      const list = this.getSekolah();
      if (!item.id) item.id = 'SCH-' + Math.floor(100 + Math.random() * 900);
      if (!item.status) item.status = 'pending';
      list.unshift(item);
      this.saveSekolah(list);
      return item;
    },
    updateSekolah: function (id, fields) {
      const list = this.getSekolah();
      const idx = list.findIndex(s => s.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...fields };
        this.saveSekolah(list);
        return list[idx];
      }
      return null;
    },

    // ==========================================
    // 2. GURU (ADMIN ONLY PERMISSIONS)
    // ==========================================
    getGuru: function () {
      this.init();
      return this.read(KEYS.GURU, SEED_DATA.guru);
    },
    getGuruById: function (id) {
      return this.getGuru().find(g => g.id === id) || null;
    },
    saveGuru: function (list) {
      this.write(KEYS.GURU, list);
    },
    addGuru: function (guru) {
      const list = this.getGuru();
      if (!guru.id) guru.id = 'GUR-' + String(list.length + 1).padStart(2, '0');
      if (!guru.password) guru.password = 'cakap2026';
      guru.updatedAt = new Date().toISOString().slice(0, 10);
      list.push(guru);
      this.saveGuru(list);
      return guru;
    },
    updateGuru: function (id, updatedFields) {
      const list = this.getGuru();
      const idx = list.findIndex(g => g.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updatedFields, updatedAt: new Date().toISOString().slice(0, 10) };
        this.saveGuru(list);
        return list[idx];
      }
      return null;
    },
    deleteGuru: function (id) {
      let list = this.getGuru();
      list = list.filter(g => g.id !== id);
      this.saveGuru(list);
    },
    bulkDeleteGuru: function (ids) {
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      const idSet = new Set(ids.map(String));
      let list = this.getGuru();
      const initialLen = list.length;
      list = list.filter(g => !idSet.has(String(g.id)));
      this.saveGuru(list);
      return initialLen - list.length;
    },
    clearAllGuru: function () {
      const list = this.getGuru();
      const count = list.length;
      this.saveGuru([]);
      return count;
    },

    // ==========================================
    // 3. ROMBEL (ADMIN & GURU)
    // ==========================================
    getRombel: function () {
      this.init();
      return this.read(KEYS.ROMBEL, SEED_DATA.rombel);
    },
    getRombelById: function (id) {
      return this.getRombel().find(r => r.id === id) || null;
    },
    saveRombel: function (list) {
      this.write(KEYS.ROMBEL, list);
      this.syncRombelStudentCount();
    },
    addRombel: function (rombel) {
      const list = this.getRombel();
      if (!rombel.id) {
        const cleanName = (rombel.namaRombel || 'RMB').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        rombel.id = 'RMB-' + cleanName + '-' + Math.floor(10 + Math.random() * 90);
      }
      if (!rombel.jumlahSiswa) rombel.jumlahSiswa = 0;
      rombel.updatedAt = new Date().toISOString().slice(0, 10);
      list.push(rombel);
      this.saveRombel(list);
      return rombel;
    },
    updateRombel: function (id, updatedFields) {
      const list = this.getRombel();
      const idx = list.findIndex(r => r.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updatedFields, updatedAt: new Date().toISOString().slice(0, 10) };
        this.saveRombel(list);
        return list[idx];
      }
      return null;
    },
    deleteRombel: function (id) {
      let list = this.getRombel();
      list = list.filter(r => r.id !== id);
      this.saveRombel(list);
    },
    bulkDeleteRombel: function (ids) {
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      const idSet = new Set(ids.map(String));
      let list = this.getRombel();
      const initialLen = list.length;
      list = list.filter(r => !idSet.has(String(r.id)));
      this.saveRombel(list);
      return initialLen - list.length;
    },
    clearAllRombel: function () {
      const list = this.getRombel();
      const count = list.length;
      this.saveRombel([]);
      return count;
    },
    syncRombelStudentCount: function () {
      try {
        const rombels = this.read(KEYS.ROMBEL, []);
        const siswas = this.read(KEYS.SISWA, []);
        if (rombels.length > 0) {
          rombels.forEach(r => {
            const count = siswas.filter(s => s.rombelId === r.id).length;
            r.jumlahSiswa = count;
          });
          localStorage.setItem(KEYS.ROMBEL, JSON.stringify(rombels));
        }
      } catch (e) {}
    },

    // ==========================================
    // 4. SISWA & PASSWORD (WALI KELAS PRO)
    // ==========================================
    getSiswa: function () {
      this.init();
      return this.read(KEYS.SISWA, SEED_DATA.siswa);
    },
    getSiswaByNisn: function (nisn) {
      return this.getSiswa().find(s => s.nisn === String(nisn).trim()) || null;
    },
    saveSiswa: function (list) {
      this.write(KEYS.SISWA, list);
      this.syncRombelStudentCount();
    },
    addSiswa: function (siswa) {
      const list = this.getSiswa();
      if (!siswa.id) siswa.id = 'SIS-' + String(list.length + 1).padStart(3, '0');
      if (!siswa.statusUjian) siswa.statusUjian = 'Belum Ujian';
      if (!siswa.password) {
        const rombel = this.getRombelById(siswa.rombelId);
        siswa.password = this.generateStudentPassword(siswa.nama, siswa.nisn, rombel ? rombel.namaRombel : '');
      }
      siswa.updatedAt = new Date().toISOString().slice(0, 10);
      list.push(siswa);
      this.saveSiswa(list);
      return siswa;
    },
    updateSiswa: function (id, updatedFields) {
      const list = this.getSiswa();
      const idx = list.findIndex(s => s.id === id || s.nisn === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updatedFields, updatedAt: new Date().toISOString().slice(0, 10) };
        this.saveSiswa(list);
        return list[idx];
      }
      return null;
    },
    deleteSiswa: function (id) {
      let list = this.getSiswa();
      list = list.filter(s => s.id !== id && s.nisn !== id);
      this.saveSiswa(list);
    },
    bulkDeleteSiswa: function (ids) {
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      const idSet = new Set(ids.map(String));
      let list = this.getSiswa();
      const initialLen = list.length;
      list = list.filter(s => !idSet.has(String(s.id)) && !idSet.has(String(s.nisn)));
      this.saveSiswa(list);
      return initialLen - list.length;
    },
    clearAllSiswa: function () {
      const list = this.getSiswa();
      const count = list.length;
      this.saveSiswa([]);
      return count;
    },

    // ==========================================
    // 5. JADWAL ULANGAN SD (ADMIN & GURU)
    // ==========================================
    getJadwal: function () {
      this.init();
      return this.read(KEYS.JADWAL, SEED_DATA.jadwal);
    },
    getJadwalByToken: function (token) {
      const clean = String(token || '').trim().toUpperCase();
      return this.getJadwal().find(j => j.token.toUpperCase() === clean) || null;
    },
    saveJadwal: function (list) {
      this.write(KEYS.JADWAL, list);
    },
    addJadwal: function (jadwal) {
      const list = this.getJadwal();
      if (!jadwal.id) jadwal.id = 'JDW-' + String(list.length + 1).padStart(2, '0');
      if (!jadwal.token) jadwal.token = this.generateToken();
      if (!jadwal.status) jadwal.status = 'Aktif';
      jadwal.updatedAt = new Date().toISOString().slice(0, 10);
      list.push(jadwal);
      this.saveJadwal(list);
      return jadwal;
    },
    updateJadwal: function (id, updatedFields) {
      const list = this.getJadwal();
      const idx = list.findIndex(j => j.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updatedFields, updatedAt: new Date().toISOString().slice(0, 10) };
        this.saveJadwal(list);
        return list[idx];
      }
      return null;
    },
    deleteJadwal: function (id) {
      let list = this.getJadwal();
      list = list.filter(j => j.id !== id);
      this.saveJadwal(list);
    },
    bulkDeleteJadwal: function (ids) {
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      const idSet = new Set(ids.map(String));
      let list = this.getJadwal();
      const initialLen = list.length;
      list = list.filter(j => !idSet.has(String(j.id)));
      this.saveJadwal(list);
      return initialLen - list.length;
    },
    clearAllJadwal: function () {
      const list = this.getJadwal();
      const count = list.length;
      this.saveJadwal([]);
      return count;
    },

    // ==========================================
    // 6. BANK SOAL SD
    // ==========================================
    getSoal: function () {
      this.init();
      return this.read(KEYS.SOAL, SEED_DATA.soal);
    },
    saveSoal: function (list) {
      this.write(KEYS.SOAL, list);
      try {
        localStorage.setItem('sicakap_banksoal', JSON.stringify(list));
      } catch (e) {}
    },
    addSoal: function (soal) {
      const list = this.getSoal();
      if (!soal.id) soal.id = (list.reduce((max, s) => Math.max(max, Number(s.id) || 0), 0) + 1);
      list.push(soal);
      this.saveSoal(list);
      return soal;
    },
    updateSoal: function (id, updatedFields) {
      const list = this.getSoal();
      const idx = list.findIndex(s => s.id === id || String(s.id) === String(id));
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updatedFields };
        this.saveSoal(list);
        return list[idx];
      }
      return null;
    },
    deleteSoal: function (id) {
      let list = this.getSoal();
      list = list.filter(s => s.id !== id && String(s.id) !== String(id));
      this.saveSoal(list);
    },
    bulkDeleteSoal: function (ids) {
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      const idSet = new Set(ids.map(String));
      let list = this.getSoal();
      const initialLen = list.length;
      list = list.filter(s => !idSet.has(String(s.id)));
      this.saveSoal(list);
      return initialLen - list.length;
    },
    clearAllSoal: function () {
      const list = this.getSoal();
      const count = list.length;
      this.saveSoal([]);
      return count;
    },
    bulkAddSoal: function (soalList) {
      if (!Array.isArray(soalList) || soalList.length === 0) return 0;
      const list = this.getSoal();
      let maxId = list.reduce((max, s) => Math.max(max, Number(s.id) || 0), 0);
      soalList.forEach(s => {
        maxId++;
        if (!s.id) s.id = maxId;
        list.push(s);
      });
      this.saveSoal(list);
      return soalList.length;
    },

    // ==========================================
    // 7. ORGANISASI MATA PELAJARAN (sicakap_mapel)
    // ==========================================
    getMapel: function () {
      this.init();
      return this.read(KEYS.MAPEL, SEED_DATA.mapel);
    },
    saveMapel: function (list) {
      this.write(KEYS.MAPEL, list);
    },
    addMapel: function (mapel) {
      const list = this.getMapel();
      if (!mapel.id) mapel.id = 'MP-' + String(list.length + 1).padStart(2, '0');
      list.push(mapel);
      this.saveMapel(list);
      return mapel;
    },
    deleteMapel: function (id) {
      let list = this.getMapel();
      list = list.filter(m => m.id !== id && m.nama !== id);
      this.saveMapel(list);
    },

    // ==========================================
    // 8. SESI AKTIF & PERSISTENCE EXAM (F5 SHIELD)
    // ==========================================
    getExamProgress: function (nisn, jadwalId) {
      const allSesi = this.read(KEYS.SESI_AKTIF, {});
      const key = `${nisn}_${jadwalId || 'DEFAULT'}`;
      return allSesi[key] || null;
    },

    saveExamProgress: function (sessionData) {
      if (!sessionData || !sessionData.nisn) return;
      const allSesi = this.read(KEYS.SESI_AKTIF, {});
      const key = `${sessionData.nisn}_${sessionData.jadwalId || 'DEFAULT'}`;

      const updated = {
        nisn: sessionData.nisn,
        jadwalId: sessionData.jadwalId || 'JDW-01',
        mapel: sessionData.mapel || '',
        sisaDetik: sessionData.sisaDetik !== undefined ? sessionData.sisaDetik : 3600,
        jawabanMap: sessionData.jawabanMap || {},
        raguMap: sessionData.raguMap || {},
        soalAktifIndex: sessionData.soalAktifIndex || 0,
        jumlahPindahTab: sessionData.jumlahPindahTab || 0,
        isLocked: Boolean(sessionData.isLocked),
        updatedAt: new Date().toISOString()
      };

      allSesi[key] = updated;
      this.write(KEYS.SESI_AKTIF, allSesi);

      // Auto update live score entry
      this.syncLiveScoreFromSession(updated);
      return updated;
    },

    clearExamProgress: function (nisn, jadwalId) {
      const allSesi = this.read(KEYS.SESI_AKTIF, {});
      const key = `${nisn}_${jadwalId || 'DEFAULT'}`;
      if (allSesi[key]) {
        delete allSesi[key];
        this.write(KEYS.SESI_AKTIF, allSesi);
      }
      this.updateSiswa(nisn, { statusUjian: 'Selesai' });
    },

    // ==========================================
    // 8. LIVE SCORES (REAL-TIME ACROSS TABS)
    // ==========================================
    getLiveScores: function () {
      this.init();
      return this.read(KEYS.LIVE_SCORES, SEED_DATA.liveScores);
    },

    saveLiveScores: function (scores) {
      this.write(KEYS.LIVE_SCORES, scores);
    },

    bulkDeleteLiveScores: function (nisns) {
      if (!Array.isArray(nisns) || nisns.length === 0) return 0;
      const nisnSet = new Set(nisns.map(String));
      let list = this.getLiveScores();
      const initialLen = list.length;
      list = list.filter(l => !nisnSet.has(String(l.nisn)));
      this.saveLiveScores(list);

      // Reset sesi aktif exam progress
      try {
        const allSesi = this.read(KEYS.SESI_AKTIF, {});
        Object.keys(allSesi).forEach(k => {
          const sNisn = k.split('_')[0];
          if (nisnSet.has(sNisn)) delete allSesi[k];
        });
        this.write(KEYS.SESI_AKTIF, allSesi);
      } catch (e) {}

      return initialLen - list.length;
    },

    clearAllLiveScores: function () {
      const list = this.getLiveScores();
      const count = list.length;
      this.saveLiveScores([]);
      this.write(KEYS.SESI_AKTIF, {});
      return count;
    },

    syncLiveScoreFromSession: function (session) {
      try {
        const scores = this.getLiveScores();
        const siswa = this.getSiswaByNisn(session.nisn);
        const soalList = this.getSoal();
        const nama = siswa ? siswa.nama : ('Siswa ' + session.nisn);
        const rombelId = siswa ? siswa.rombelId : 'RMB-5A';
        const totalSoal = Math.max(soalList.length, 4);

        // Cari Mapel Ujian dari Jadwal Aktif
        const allJadwal = this.getJadwal();
        const j = allJadwal.find(item => item.id === session.jadwalId);
        const mapelName = (j && j.mapel) ? j.mapel : (session.mapel || 'Matematika SD');

        let answered = 0;
        let benar = 0;

        Object.keys(session.jawabanMap || {}).forEach(qId => {
          const ans = session.jawabanMap[qId];
          const hasVal = Array.isArray(ans) ? ans.length > 0 : Boolean(ans);
          if (hasVal) {
            answered++;
            const q = soalList.find(item => String(item.id) === String(qId));
            if (q && q.kunci) {
              if (Array.isArray(q.kunci) && Array.isArray(ans)) {
                if (q.kunci.sort().join(',') === ans.sort().join(',')) benar++;
              } else if (String(q.kunci).trim().toUpperCase() === String(ans).trim().toUpperCase()) {
                benar++;
              }
            }
          }
        });

        const salah = Math.max(0, answered - benar);
        const skor = totalSoal > 0 ? Math.round((benar / totalSoal) * 100) : 0;
        const status = session.isLocked 
          ? 'Terkunci' 
          : (session.sisaDetik <= 0 ? 'Selesai' : 'Sedang Mengerjakan');

        const existingIdx = scores.findIndex(s => s.nisn === session.nisn);
        const entry = {
          nisn: session.nisn,
          nama: nama,
          rombelId: rombelId,
          mapel: mapelName,
          terjawab: answered,
          totalSoal: totalSoal,
          benar: benar,
          salah: salah,
          skor: skor,
          status: status,
          updatedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };

        if (existingIdx !== -1) {
          scores[existingIdx] = entry;
        } else {
          scores.unshift(entry);
        }

        this.saveLiveScores(scores);
      } catch (err) {
        console.warn('[SicakapDB] syncLiveScoreFromSession error', err);
      }
    },

    // ==========================================
    // 9. UTILITIES (TOKEN, PASSWORD, EXPORT/IMPORT)
    // ==========================================
    generateToken: function () {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let token = '';
      for (let i = 0; i < 6; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return token;
    },

    generateStudentPassword: function (nama, nisn, rombelName) {
      if (rombelName) {
        const cleanRombel = rombelName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
        const lastDigits = nisn ? String(nisn).slice(-4) : Math.floor(1000 + Math.random() * 9000);
        return `${cleanRombel}-${lastDigits}`;
      }
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      return `CAKAP-${randomNum}`;
    },

    // Panel Utilitas: Export JSON
    backupJSON: function () {
      const dump = {
        app: 'SI-CAKAP SD',
        version: DB_VERSION,
        exportedAt: new Date().toISOString(),
        data: {
          sekolah: this.getSekolah(),
          profilSekolah: this.getProfilSekolah(),
          akunAdmin: this.getAkunAdmin(),
          guru: this.getGuru(),
          rombel: this.getRombel(),
          siswa: this.getSiswa(),
          jadwal: this.getJadwal(),
          soal: this.getSoal(),
          liveScores: this.getLiveScores(),
          sesiAktif: this.read(KEYS.SESI_AKTIF, {})
        }
      };

      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sicakap_sd_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast('💾 Berhasil mendownload backup database JSON!', 'success');
    },

    // Panel Utilitas: Restore JSON
    restoreJSON: function (jsonStr) {
      try {
        const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        const target = parsed.data || parsed;

        if (!target.guru && !target.siswa && !target.jadwal && !target.profilSekolah) {
          throw new Error('Format file JSON tidak sesuai skema SI-CAKAP SD.');
        }

        if (target.sekolah) this.saveSekolah(target.sekolah);
        if (target.profilSekolah) this.saveProfilSekolah(target.profilSekolah);
        if (target.akunAdmin) this.saveAkunAdmin(target.akunAdmin);
        if (target.guru) this.saveGuru(target.guru);
        if (target.rombel) this.saveRombel(target.rombel);
        if (target.siswa) this.saveSiswa(target.siswa);
        if (target.jadwal) this.saveJadwal(target.jadwal);
        if (target.soal) this.saveSoal(target.soal);
        if (target.liveScores) this.saveLiveScores(target.liveScores);
        if (target.sesiAktif) this.write(KEYS.SESI_AKTIF, target.sesiAktif);

        this.updateSnapshot();
        this.broadcast(KEYS.SNAPSHOT, { action: 'restore' });
        this.showToast('📂 Database berhasil dipulihkan dari file JSON!', 'success');
        setTimeout(() => window.location.reload(), 1000);
        return true;
      } catch (err) {
        alert('Gagal memulihkan database: ' + err.message);
        return false;
      }
    },

    // Panel Utilitas: Reset Demo Data
    resetDemoData: function () {
      if (confirm('Konfirmasi: Reset seluruh database SI-CAKAP SD ke pengaturan awal demo?')) {
        localStorage.removeItem(KEYS.VERSION);
        localStorage.removeItem(KEYS.SEKOLAH);
        localStorage.removeItem(KEYS.GURU);
        localStorage.removeItem(KEYS.ROMBEL);
        localStorage.removeItem(KEYS.SISWA);
        localStorage.removeItem(KEYS.JADWAL);
        localStorage.removeItem(KEYS.SOAL);
        localStorage.removeItem(KEYS.SESI_AKTIF);
        localStorage.removeItem(KEYS.LIVE_SCORES);
        localStorage.removeItem(KEYS.SNAPSHOT);
        this.init();
        this.broadcast(KEYS.VERSION, { action: 'reset' });
        this.showToast('🔄 Database berhasil di-reset ke Data Demo Sekolah Dasar!', 'success');
        setTimeout(() => window.location.reload(), 800);
      }
    },

    // Inject Persistence Status Bar UI
    renderPersistenceBar: function (containerEl) {
      if (!containerEl) return;
      containerEl.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-2xl bg-white/90 border border-sky-100 shadow-xs text-xs font-bold text-slate-700">
          <div class="flex items-center gap-2">
            <span class="flex h-2 w-2 relative">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span class="text-emerald-700 font-extrabold text-[11px] sm:text-xs">🟢 DB Sync: Tersimpan Lokal &amp; Real-Time</span>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="SicakapDB.backupJSON()" class="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-black flex items-center gap-1 transition cursor-pointer" title="Backup Database ke File JSON">
              <span>💾 Backup JSON</span>
            </button>
            <label class="px-2.5 py-1 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 text-[11px] font-black flex items-center gap-1 transition cursor-pointer" title="Pulihkan Database dari JSON">
              <span>📂 Restore JSON</span>
              <input type="file" accept=".json" class="hidden" onchange="SicakapDB.handleFileInputRestore(this)">
            </label>
            <button onclick="SicakapDB.resetDemoData()" class="px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-black flex items-center gap-1 transition cursor-pointer" title="Reset ke Data Bawaan">
              <span>🔄 Reset Data Demo</span>
            </button>
          </div>
        </div>
      `;
    },

    handleFileInputRestore: function (inputEl) {
      if (inputEl.files && inputEl.files[0]) {
        const file = inputEl.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          this.restoreJSON(e.target.result);
        };
        reader.readAsText(file);
      }
    },

    // Toast Notification Standard (Typed: success, error, warning, info)
    showToast: function (msg, type) {
      type = type || 'success';
      let toast = document.getElementById('toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.innerHTML = `<span id="toast-icon">✅</span><span id="toast-message"></span>`;
        document.body.appendChild(toast);
      }
      const icon = document.getElementById('toast-icon');
      const text = document.getElementById('toast-message') || toast.querySelector('span');
      if (text) text.textContent = msg;

      let bgClass = 'bg-slate-900 border-slate-700';
      let iconEmoji = '✨';
      if (type === 'error') {
        bgClass = 'bg-rose-900 border-rose-700';
        iconEmoji = '❌';
      } else if (type === 'warning') {
        bgClass = 'bg-amber-900 border-amber-700';
        iconEmoji = '⚠️';
      } else if (type === 'info') {
        bgClass = 'bg-indigo-900 border-indigo-700';
        iconEmoji = 'ℹ️';
      } else if (type === 'success') {
        bgClass = 'bg-emerald-900 border-emerald-700';
        iconEmoji = '✅';
      }

      toast.className = `fixed bottom-5 right-5 z-50 ${bgClass} text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold transition-all duration-300 border translate-y-0 opacity-100`;
      if (icon) icon.textContent = iconEmoji;

      if (window._toastTimeout) clearTimeout(window._toastTimeout);
      window._toastTimeout = setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
      }, 3500);
    }
  };

  // Auto-init on load
  SicakapDB.init();

  // Export to window global
  window.SicakapDB = SicakapDB;
  window.showToast = function (msg, type) {
    SicakapDB.showToast(msg, type);
  };

})(window);
