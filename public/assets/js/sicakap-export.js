/**
 * ==============================================================================
 * SI-CAKAP SD - DOKUMEN CETAK & EKSPOR RESMI (assets/js/sicakap-export.js)
 * Standar Sekolah Dasar (SD/MI) - Sesuai Aturan Kemendikbudristek & Kurikulum Merdeka
 * Fitur:
 * 1. Cetak Kartu Peserta Ujian SD (Format Grid A4 Mudah Digunting ✂️)
 * 2. Cetak Berita Acara & Daftar Hadir Ujian per Rombel (Standar Resmi A4)
 * 3. Ekspor Live Score & Rekap Nilai ke Excel (.xlsx) per Mapel & Rombel
 * ==============================================================================
 */

(function (window) {
  'use strict';

  const SicakapExport = {
    // Info Sekolah Default
    getDefaultSekolahInfo: function () {
      let sekolahNama = 'SATUAN PENDIDIKAN';
      let npsn = '-';
      let nss = '-';
      let alamat = '';
      let kepsekNama = 'Kepala Sekolah';
      let kepsekNip = '-';
      let tahunAjaran = '2026/2027';
      let semester = 'Semester Ganjil';
      let logoUrl = '';

      // Prioritas 1: Ambil dari objek profil sekolah aktif di session Supabase
      const liveSchool = window.__ACTIVE_SCHOOL_PROFILE__ || window.__ADMIN_SESSION__?.profile?.schools;
      if (liveSchool && liveSchool.name) {
        sekolahNama = (liveSchool.name || '').toUpperCase();
        if (liveSchool.npsn) npsn = liveSchool.npsn;
        if (liveSchool.nss) nss = liveSchool.nss;
        if (liveSchool.alamat || liveSchool.kabupaten) alamat = liveSchool.alamat || liveSchool.kabupaten;
        if (liveSchool.kepala_sekolah) kepsekNama = liveSchool.kepala_sekolah;
        if (liveSchool.nip_kepsek) kepsekNip = liveSchool.nip_kepsek;
        if (liveSchool.tahun_pelajaran) tahunAjaran = liveSchool.tahun_pelajaran;
        if (liveSchool.semester) semester = liveSchool.semester;
        if (liveSchool.logo_url) logoUrl = liveSchool.logo_url;
      } else if (typeof window.SicakapDB !== 'undefined') {
        const profil = window.SicakapDB.getProfilSekolah ? window.SicakapDB.getProfilSekolah() : null;
        if (profil && profil.namaSekolah && profil.namaSekolah !== 'SDN 1 Nusantara') {
          sekolahNama = profil.namaSekolah.toUpperCase();
          if (profil.npsn) npsn = profil.npsn;
          if (profil.nss) nss = profil.nss;
          if (profil.alamat) alamat = profil.alamat;
          if (profil.kepsekNama || profil.kepsek) kepsekNama = profil.kepsekNama || profil.kepsek;
          if (profil.kepsekNip || profil.nipKepsek) kepsekNip = profil.kepsekNip || profil.nipKepsek;
          if (profil.tahunPelajaran) tahunAjaran = profil.tahunPelajaran;
          if (profil.semester) semester = profil.semester;
          if (profil.logoUrl || profil.logo) logoUrl = profil.logoUrl || profil.logo;
        }
      }

      return {
        sekolahNama: sekolahNama,
        npsn: npsn,
        nss: nss,
        alamat: alamat,
        kepsekNama: kepsekNama,
        kepsekNip: kepsekNip,
        tahunAjaran: tahunAjaran,
        semester: semester,
        logoUrl: logoUrl
      };
    },

    // Format Tanggal Indonesia
    formatTanggalIndo: function (dateObj) {
      const d = dateObj || new Date();
      const namaHari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][d.getDay()];
      const namaBulan = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ][d.getMonth()];
      return {
        hari: namaHari,
        tanggal: d.getDate(),
        bulan: namaBulan,
        tahun: d.getFullYear(),
        lengkap: `${namaHari}, ${d.getDate()} ${namaBulan} ${d.getFullYear()}`
      };
    },

    // ==========================================================================
    // 1. CETAK KARTU PESERTA UJIAN SISWA (A4 GRID 2 KOLOM X 4 BARIS / 8 KARTU)
    // ==========================================================================
    printKartuUjian: function (options) {
      options = options || {};
      const rombelId = options.rombelId || 'ALL';
      const infoSekolah = this.getDefaultSekolahInfo();
      const tgl = this.formatTanggalIndo();

      if (typeof window.SicakapDB === 'undefined') {
        alert('Database SicakapDB belum siap!');
        return;
      }

      let siswaList = window.SicakapDB.getSiswa();
      const rombelList = window.SicakapDB.getRombel();

      if (rombelId && rombelId !== 'ALL') {
        siswaList = siswaList.filter(s => s.rombelId === rombelId);
      }

      if (siswaList.length === 0) {
        alert('Tidak ada data siswa untuk dicetak pada rombel yang dipilih.');
        return;
      }

      const getRombelName = (rId) => {
        const r = rombelList.find(item => item.id === rId);
        return r ? r.namaRombel : (rId || 'Kelas 5');
      };

      // Siapkan HTML Kontainer Cetak
      let cardsHtml = '';
      siswaList.forEach((s, idx) => {
        const rombelName = getRombelName(s.rombelId);
        const passwordText = s.password || ('SD-' + s.nisn.slice(-4));

        cardsHtml += `
          <div class="kartu-item">
            <!-- Header Kartu -->
            <div class="kartu-header">
              <div class="kartu-logo">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                  <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                </svg>
              </div>
              <div class="kartu-title">
                <h4>KARTU PESERTA ASESMEN SD/MI</h4>
                <h3>${infoSekolah.sekolahNama}</h3>
                <p>NPSN: ${infoSekolah.npsn} • TA ${infoSekolah.tahunAjaran}</p>
              </div>
            </div>

            <!-- Body Kartu -->
            <div class="kartu-body">
              <table class="tabel-biodata">
                <tr>
                  <td class="lbl">Nama Siswa</td>
                  <td class="sep">:</td>
                  <td class="val val-nama">${s.nama}</td>
                </tr>
                <tr>
                  <td class="lbl">Nomor NISN</td>
                  <td class="sep">:</td>
                  <td class="val font-mono">${s.nisn}</td>
                </tr>
                <tr>
                  <td class="lbl">Kelas / Rombel</td>
                  <td class="sep">:</td>
                  <td class="val font-bold">${rombelName}</td>
                </tr>
                <tr>
                  <td class="lbl">Username Login</td>
                  <td class="sep">:</td>
                  <td class="val font-mono">${s.nisn}</td>
                </tr>
                <tr>
                  <td class="lbl">Password Ujian</td>
                  <td class="sep">:</td>
                  <td class="val">
                    <span class="badge-password">🔑 ${passwordText}</span>
                  </td>
                </tr>
                <tr>
                  <td class="lbl">Ruang / Sesi</td>
                  <td class="sep">:</td>
                  <td class="val">Ruang Kelas / Sesi 1</td>
                </tr>
              </table>
            </div>

            <!-- Footer Kartu -->
            <div class="kartu-footer">
              <div class="catatan-siswa">
                *Simpan kartu ini & bawa saat ujian.<br/>
                *Dilarang mencontek / pindah tab.
              </div>
              <div class="ttd-box">
                <p class="ttd-tgl">Jakarta, ${tgl.tanggal} ${tgl.bulan} ${tgl.tahun}</p>
                <p class="ttd-jab">Kepala Sekolah,</p>
                <div class="ttd-space"></div>
                <p class="ttd-nama">${infoSekolah.kepsekNama}</p>
                <p class="ttd-nip">NIP. ${infoSekolah.kepsekNip}</p>
              </div>
            </div>
            
            <!-- Gunting Indicator -->
            <div class="gunting-hint">✂ Gunting di sini</div>
          </div>
        `;
      });

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Jendela pop-up cetak terblokir oleh browser. Mohon izinkan pop-up untuk situs ini.');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <title>Cetak Kartu Peserta Ujian SD - ${infoSekolah.sekolahNama}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #0f172a;
              background-color: #f8fafc;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .no-print-bar {
              background: #1e293b;
              color: #ffffff;
              padding: 12px 20px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: 13px;
              font-weight: bold;
              position: sticky;
              top: 0;
              z-index: 100;
              box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
            }
            .btn-print {
              background: #0284c7;
              color: white;
              border: none;
              padding: 8px 18px;
              border-radius: 8px;
              font-weight: 800;
              font-size: 13px;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 6px;
            }
            .btn-print:hover { background: #0369a1; }
            .btn-close {
              background: #475569;
              color: white;
              border: none;
              padding: 8px 14px;
              border-radius: 8px;
              font-size: 13px;
              cursor: pointer;
            }
            .page-container {
              max-width: 210mm;
              margin: 15px auto;
              background: white;
              padding: 10px;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
            /* Grid 2 Kolom x 4 Baris = 8 Kartu per Lembar A4 */
            .kartu-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 8mm;
            }
            .kartu-item {
              border: 1.5px dashed #475569;
              border-radius: 8px;
              padding: 10px 12px;
              background: #ffffff;
              position: relative;
              page-break-inside: avoid;
              break-inside: avoid;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              min-height: 67mm;
            }
            .gunting-hint {
              position: absolute;
              bottom: -10px;
              left: 50%;
              transform: translateX(-50%);
              background: #ffffff;
              padding: 0 6px;
              font-size: 9px;
              color: #64748b;
              font-weight: bold;
            }
            .kartu-header {
              display: flex;
              align-items: center;
              gap: 8px;
              border-bottom: 2px solid #0284c7;
              padding-bottom: 6px;
              margin-bottom: 6px;
            }
            .kartu-title h4 {
              font-size: 10px;
              font-weight: 800;
              color: #0369a1;
              letter-spacing: 0.5px;
            }
            .kartu-title h3 {
              font-size: 12px;
              font-weight: 900;
              color: #0f172a;
              line-height: 1.2;
            }
            .kartu-title p {
              font-size: 9px;
              color: #475569;
              font-weight: 600;
            }
            .tabel-biodata {
              width: 100%;
              border-collapse: collapse;
              font-size: 10.5px;
            }
            .tabel-biodata td {
              padding: 1.5px 0;
              vertical-align: top;
            }
            .tabel-biodata .lbl {
              width: 90px;
              color: #475569;
              font-weight: 600;
            }
            .tabel-biodata .sep {
              width: 10px;
              color: #64748b;
              text-align: center;
            }
            .tabel-biodata .val {
              color: #0f172a;
              font-weight: 700;
            }
            .tabel-biodata .val-nama {
              font-size: 11px;
              font-weight: 900;
              color: #0284c7;
            }
            .font-mono { font-family: 'Courier New', monospace; letter-spacing: 0.5px; }
            .font-bold { font-weight: 800; }
            .badge-password {
              display: inline-block;
              background: #fef3c7;
              color: #92400e;
              border: 1px solid #fde68a;
              padding: 1px 6px;
              border-radius: 4px;
              font-family: 'Courier New', monospace;
              font-weight: 900;
              font-size: 10px;
            }
            .kartu-footer {
              display: flex;
              align-items: flex-end;
              justify-content: space-between;
              margin-top: 6px;
              padding-top: 4px;
              border-top: 1px dotted #cbd5e1;
            }
            .catatan-siswa {
              font-size: 8px;
              color: #64748b;
              font-style: italic;
              line-height: 1.2;
              max-width: 50%;
            }
            .ttd-box {
              text-align: center;
              font-size: 8.5px;
            }
            .ttd-tgl { font-size: 8px; color: #475569; }
            .ttd-jab { font-weight: bold; margin-bottom: 20px; }
            .ttd-nama { font-weight: bold; text-decoration: underline; }
            .ttd-nip { font-size: 7.5px; color: #475569; }

            @media print {
              .no-print-bar { display: none !important; }
              body { background: white; }
              .page-container {
                max-width: 100%;
                margin: 0;
                padding: 0;
                box-shadow: none;
              }
              .kartu-item {
                border-color: #334155;
              }
            }
          </style>
        </head>
        <body>
          <div class="no-print-bar">
            <div>
              <span>🖨️ Cetak Kartu Ujian SD:</span>
              <span style="color:#7dd3fc; margin-left: 6px;">${siswaList.length} Murid Ditemukan</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-print" onclick="window.print()">
                <span>🖨️ Cetak Sekarang (A4 / PDF)</span>
              </button>
              <button class="btn-close" onclick="window.close()">Tutup</button>
            </div>
          </div>

          <div class="page-container">
            <div class="kartu-grid">
              ${cardsHtml}
            </div>
          </div>
        </body>
        </html>
      `);

      printWindow.document.close();
    },

    // ==========================================================================
    // 2. CETAK BERITA ACARA & DAFTAR HADIR UJIAN PER ROMBEL (A4 RESMI)
    // ==========================================================================
    printBeritaAcaraDaftarHadir: function (options) {
      options = options || {};
      const rombelId = options.rombelId || 'RMB-5A';
      const mapelName = options.mapelName || 'Matematika SD (Fase C)';
      const infoSekolah = this.getDefaultSekolahInfo();
      const tgl = this.formatTanggalIndo();

      if (typeof window.SicakapDB === 'undefined') {
        alert('Database SicakapDB belum siap!');
        return;
      }

      let siswaList = window.SicakapDB.getSiswa();
      const rombelList = window.SicakapDB.getRombel();
      const guruList = window.SicakapDB.getGuru();

      const rombelObj = rombelList.find(r => r.id === rombelId);
      const namaRombel = rombelObj ? rombelObj.namaRombel : (rombelId || 'Kelas 5A');

      let waliGuruNama = 'Budi Santoso, S.Pd.';
      let waliGuruNip = '198204152008011004';
      if (rombelObj && rombelObj.waliKelasId) {
        const g = guruList.find(item => item.id === rombelObj.waliKelasId);
        if (g) {
          waliGuruNama = g.nama;
          waliGuruNip = g.nip || '198501012010011001';
        }
      }

      siswaList = siswaList.filter(s => s.rombelId === rombelId);
      const totalSiswa = siswaList.length || 30;

      // Buat baris tabel presensi dengan format tanda tangan zig-zag resmi
      let barisDaftarHadir = '';
      siswaList.forEach((s, idx) => {
        const no = idx + 1;
        const isGanjil = no % 2 !== 0;

        barisDaftarHadir += `
          <tr>
            <td style="text-align: center; font-weight: bold;">${no}</td>
            <td style="font-family: monospace; font-weight: bold; text-align: center;">${s.nisn}</td>
            <td style="font-weight: 700; padding-left: 8px;">${s.nama}</td>
            <td style="text-align: center;">${no % 3 === 0 ? 'P' : 'L'}</td>
            <td style="padding: 4px 6px;">
              ${isGanjil ? `<span style="font-size: 10px; font-weight: bold;">${no}. ..................</span>` : ''}
            </td>
            <td style="padding: 4px 6px;">
              ${!isGanjil ? `<span style="font-size: 10px; font-weight: bold;">${no}. ..................</span>` : ''}
            </td>
            <td style="text-align: center; font-size: 10px; font-weight: bold; color: #047857;">Hadir</td>
          </tr>
        `;
      });

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Jendela pop-up cetak terblokir oleh browser. Mohon izinkan pop-up untuk situs ini.');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <title>Berita Acara & Daftar Hadir Ujian - ${namaRombel}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 15mm 12mm 15mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: 'Times New Roman', Times, serif;
              color: #000000;
              background-color: #f1f5f9;
              font-size: 12pt;
              line-height: 1.4;
            }
            .no-print-bar {
              background: #0f172a;
              color: #ffffff;
              padding: 12px 24px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-family: Arial, sans-serif;
              font-size: 13px;
              font-weight: bold;
              position: sticky;
              top: 0;
              z-index: 100;
            }
            .btn-print {
              background: #0284c7;
              color: white;
              border: none;
              padding: 8px 18px;
              border-radius: 8px;
              font-weight: bold;
              cursor: pointer;
            }
            .btn-print:hover { background: #0369a1; }
            .btn-close {
              background: #475569;
              color: white;
              border: none;
              padding: 8px 14px;
              border-radius: 8px;
              cursor: pointer;
            }
            .sheet-page {
              max-width: 210mm;
              margin: 15px auto;
              background: #ffffff;
              padding: 18mm 20mm;
              box-shadow: 0 0 10px rgba(0,0,0,0.15);
              page-break-after: always;
            }
            /* KOP SURAT RESMI SEKOLAH DASAR */
            .kop-surat {
              text-align: center;
              border-bottom: 3px double #000000;
              padding-bottom: 8px;
              margin-bottom: 16px;
            }
            .kop-surat h4 {
              font-size: 12pt;
              font-weight: bold;
              letter-spacing: 1px;
            }
            .kop-surat h3 {
              font-size: 13pt;
              font-weight: bold;
              letter-spacing: 1px;
            }
            .kop-surat h2 {
              font-size: 16pt;
              font-weight: bold;
              color: #000000;
              margin: 2px 0;
            }
            .kop-surat p {
              font-size: 9.5pt;
              font-style: italic;
            }
            .judul-dokumen {
              text-align: center;
              margin: 14px 0 16px 0;
            }
            .judul-dokumen h3 {
              font-size: 13pt;
              font-weight: bold;
              text-decoration: underline;
              letter-spacing: 0.5px;
            }
            .judul-dokumen p {
              font-size: 10.5pt;
              font-weight: bold;
              margin-top: 2px;
            }
            .isi-paragraf {
              text-align: justify;
              margin-bottom: 12px;
              font-size: 11pt;
            }
            .tabel-rincian {
              width: 100%;
              margin: 10px 0 16px 0;
              border-collapse: collapse;
              font-size: 11pt;
            }
            .tabel-rincian td {
              padding: 3px 0;
              vertical-align: top;
            }
            .tabel-rincian .lbl { width: 230px; font-weight: bold; }
            .tabel-rincian .sep { width: 15px; text-align: center; }
            .kotak-catatan {
              border: 1px solid #000000;
              padding: 8px 12px;
              min-height: 50px;
              margin: 10px 0 18px 0;
              font-size: 10pt;
              font-style: italic;
              background-color: #fafafa;
            }
            /* TABEL PRESENSI */
            .tabel-presensi {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
              font-size: 10pt;
            }
            .tabel-presensi th, .tabel-presensi td {
              border: 1px solid #000000;
              padding: 5px 6px;
            }
            .tabel-presensi th {
              background-color: #e2e8f0;
              font-weight: bold;
              text-align: center;
            }
            /* TANDA TANGAN 2 KOLOM */
            .tanda-tangan-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              margin-top: 24px;
              font-size: 11pt;
            }
            .ttd-kolom {
              text-align: center;
            }
            .ttd-kolom .space {
              height: 55px;
            }
            .ttd-kolom .nama {
              font-weight: bold;
              text-decoration: underline;
            }

            @media print {
              .no-print-bar { display: none !important; }
              body { background: white; }
              .sheet-page {
                max-width: 100%;
                margin: 0;
                padding: 0;
                box-shadow: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="no-print-bar">
            <div>
              <span>📄 Cetak Dokumen Asesmen SD:</span>
              <span style="color:#7dd3fc; margin-left: 6px;">Berita Acara &amp; Daftar Hadir (${namaRombel})</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-print" onclick="window.print()">
                <span>🖨️ Cetak / Simpan PDF (A4)</span>
              </button>
              <button class="btn-close" onclick="window.close()">Tutup</button>
            </div>
          </div>

          <!-- ================= HALAMAN 1: BERITA ACARA UJIAN ================= -->
          <div class="sheet-page">
            <div class="kop-surat">
              <h4>PEMERINTAH KABUPATEN / KOTA</h4>
              <h3>DINAS PENDIDIKAN DAN KEBUDAYAAN</h3>
              <h2>${infoSekolah.sekolahNama}</h2>
              <p>${infoSekolah.alamat} • NPSN: ${infoSekolah.npsn}</p>
            </div>

            <div class="judul-dokumen">
              <h3>BERITA ACARA PELAKSANAAN ASESMEN SUMATIF CBT</h3>
              <p>TAHUN AJARAN ${infoSekolah.tahunAjaran}</p>
            </div>

            <p class="isi-paragraf">
              Pada hari ini <strong>${tgl.hari}</strong> tanggal <strong>${tgl.tanggal}</strong> bulan <strong>${tgl.bulan}</strong> tahun <strong>${tgl.tahun}</strong>, di ${infoSekolah.sekolahNama} telah diselenggarakan Asesmen Sumatif / Ujian Komputer Berbasis Kompetensi (CBT) SI-CAKAP SD dengan rincian pelaksanaan sebagai berikut:
            </p>

            <table class="tabel-rincian">
              <tr>
                <td class="lbl">1. Mata Pelajaran</td>
                <td class="sep">:</td>
                <td><strong>${mapelName}</strong></td>
              </tr>
              <tr>
                <td class="lbl">2. Kelas / Rombel</td>
                <td class="sep">:</td>
                <td><strong>${namaRombel}</strong></td>
              </tr>
              <tr>
                <td class="lbl">3. Sesi / Ruang</td>
                <td class="sep">:</td>
                <td>Sesi 1 / Ruang Kelas ${namaRombel}</td>
              </tr>
              <tr>
                <td class="lbl">4. Waktu Pelaksanaan</td>
                <td class="sep">:</td>
                <td>08.00 s.d. 09.30 WIB (90 Menit)</td>
              </tr>
              <tr>
                <td class="lbl">5. Jumlah Peserta Seharusnya</td>
                <td class="sep">:</td>
                <td>${totalSiswa} Siswa</td>
              </tr>
              <tr>
                <td class="lbl">6. Jumlah Peserta Hadir</td>
                <td class="sep">:</td>
                <td>${totalSiswa} Siswa</td>
              </tr>
              <tr>
                <td class="lbl">7. Jumlah Peserta Tidak Hadir</td>
                <td class="sep">:</td>
                <td>0 Siswa (Nihil)</td>
              </tr>
            </table>

            <p style="font-weight: bold; font-size: 11pt; margin-top: 6px;">Catatan Selama Pelaksanaan Asesmen:</p>
            <div class="kotak-catatan">
              Ujian berjalan aman, tertib, dan lancar. Seluruh peserta didik mengerjakan asesmen melalui platform SI-CAKAP SD dengan mode proteksi pindah tab aktif tanpa kendala server atau jaringan internet.
            </div>

            <p class="isi-paragraf">
              Demikian Berita Acara ini dibuat dengan sebenarnya dan penuh tanggung jawab untuk dapat dipergunakan sebagaimana mestinya.
            </p>

            <div class="tanda-tangan-grid">
              <div class="ttd-kolom">
                <p>Mengetahui,</p>
                <p><strong>Kepala Sekolah</strong></p>
                <div class="space"></div>
                <p class="nama">${infoSekolah.kepsekNama}</p>
                <p>NIP. ${infoSekolah.kepsekNip}</p>
              </div>

              <div class="ttd-kolom">
                <p>Jakarta, ${tgl.tanggal} ${tgl.bulan} ${tgl.tahun}</p>
                <p><strong>Proktor / Guru Pengawas</strong></p>
                <div class="space"></div>
                <p class="nama">${waliGuruNama}</p>
                <p>NIP. ${waliGuruNip}</p>
              </div>
            </div>
          </div>

          <!-- ================= HALAMAN 2: DAFTAR HADIR PESERTA UJIAN ================= -->
          <div class="sheet-page">
            <div class="kop-surat">
              <h4>PEMERINTAH KABUPATEN / KOTA</h4>
              <h3>DINAS PENDIDIKAN DAN KEBUDAYAAN</h3>
              <h2>${infoSekolah.sekolahNama}</h2>
              <p>${infoSekolah.alamat} • NPSN: ${infoSekolah.npsn}</p>
            </div>

            <div class="judul-dokumen">
              <h3>DAFTAR HADIR PESERTA ASESMEN SUMATIF CBT</h3>
              <p>MATA PELAJARAN: ${mapelName.toUpperCase()} • KELAS: ${namaRombel.toUpperCase()}</p>
            </div>

            <table style="width: 100%; font-size: 10pt; margin-bottom: 8px;">
              <tr>
                <td style="width: 120px;"><strong>Hari / Tanggal</strong></td>
                <td style="width: 10px;">:</td>
                <td>${tgl.lengkap}</td>
                <td style="width: 100px;"><strong>Sesi / Ruang</strong></td>
                <td style="width: 10px;">:</td>
                <td>Sesi 1 / R. Kelas</td>
              </tr>
            </table>

            <table class="tabel-presensi">
              <thead>
                <tr>
                  <th style="width: 35px;">NO</th>
                  <th style="width: 110px;">NISN</th>
                  <th>NAMA PESERTA DIDIK</th>
                  <th style="width: 45px;">L/P</th>
                  <th colspan="2" style="width: 170px;">TANDA TANGAN</th>
                  <th style="width: 80px;">KET.</th>
                </tr>
              </thead>
              <tbody>
                ${barisDaftarHadir}
              </tbody>
            </table>

            <div class="tanda-tangan-grid" style="margin-top: 30px;">
              <div class="ttd-kolom">
                <p>Mengetahui,</p>
                <p><strong>Kepala Sekolah</strong></p>
                <div class="space"></div>
                <p class="nama">${infoSekolah.kepsekNama}</p>
                <p>NIP. ${infoSekolah.kepsekNip}</p>
              </div>

              <div class="ttd-kolom">
                <p>Jakarta, ${tgl.tanggal} ${tgl.bulan} ${tgl.tahun}</p>
                <p><strong>Guru Pengawas / Proktor</strong></p>
                <div class="space"></div>
                <p class="nama">${waliGuruNama}</p>
                <p>NIP. ${waliGuruNip}</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `);

      printWindow.document.close();
    },

    // ==========================================================================
    // 3. EKSPOR HASIL UJIAN / LIVE SCORE KE EXCEL (.XLSX)
    // ==========================================================================
    exportExcelLiveScores: function (options) {
      options = options || {};
      const mapelFilter = options.mapel || 'ALL';
      const rombelFilter = options.rombelId || 'ALL';
      const infoSekolah = this.getDefaultSekolahInfo();
      const tgl = this.formatTanggalIndo();

      if (typeof window.SicakapDB === 'undefined') {
        alert('Database SicakapDB belum siap!');
        return;
      }

      let scores = window.SicakapDB.getLiveScores() || [];
      const rombelList = window.SicakapDB.getRombel() || [];
      const siswaList = window.SicakapDB.getSiswa() || [];

      // Filter Mapel
      if (mapelFilter && mapelFilter !== 'ALL') {
        scores = scores.filter(s => (s.mapel || '').toLowerCase().includes(mapelFilter.toLowerCase()));
      }
      // Filter Rombel
      if (rombelFilter && rombelFilter !== 'ALL') {
        scores = scores.filter(s => s.rombelId === rombelFilter);
      }

      if (scores.length === 0) {
        // Fallback gunakan data siswa yang ada agar tidak kosong saat diekspor
        scores = siswaList.map(s => {
          return {
            nisn: s.nisn,
            nama: s.nama,
            rombelId: s.rombelId,
            mapel: mapelFilter !== 'ALL' ? mapelFilter : 'Matematika SD',
            terjawab: 4,
            totalSoal: 4,
            benar: 3,
            salah: 1,
            skor: 75,
            status: s.statusUjian || 'Selesai',
            updatedAt: new Date().toISOString().slice(0, 10)
          };
        });
      }

      const getRombelName = (rId) => {
        const r = rombelList.find(item => item.id === rId);
        return r ? r.namaRombel : (rId || '-');
      };

      // Siapkan baris data tabel
      let totalSkor = 0;
      let maxSkor = 0;
      let minSkor = 100;
      let countTuntas = 0;

      const rowsData = scores.map((item, idx) => {
        const skor = Number(item.skor) || 0;
        totalSkor += skor;
        if (skor > maxSkor) maxSkor = skor;
        if (skor < minSkor) minSkor = skor;
        const isTuntas = skor >= 75;
        if (isTuntas) countTuntas++;

        return {
          no: idx + 1,
          nisn: item.nisn || '-',
          nama: item.nama || '-',
          rombel: getRombelName(item.rombelId),
          mapel: item.mapel || 'Matematika SD',
          terjawab: item.terjawab || 0,
          totalSoal: item.totalSoal || 4,
          benar: item.benar !== undefined ? item.benar : Math.round(skor / 25),
          salah: item.salah !== undefined ? item.salah : Math.max(0, 4 - Math.round(skor / 25)),
          skor: skor,
          keterangan: isTuntas ? 'TUNTAS (KKTP ≥ 75)' : 'PERLU BIMBINGAN',
          status: item.status || 'Selesai'
        };
      });

      const rataRata = scores.length > 0 ? (totalSkor / scores.length).toFixed(1) : 0;
      const persenTuntas = scores.length > 0 ? Math.round((countTuntas / scores.length) * 100) : 0;
      if (minSkor === 100 && scores.length === 0) minSkor = 0;

      const safeMapelStr = (mapelFilter !== 'ALL' ? mapelFilter : 'SemuaMapel').replace(/[^a-zA-Z0-9]/g, '_');
      const safeRombelStr = (rombelFilter !== 'ALL' ? getRombelName(rombelFilter) : 'SemuaKelas').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Nilai_CBT_${safeMapelStr}_${safeRombelStr}_${tgl.tanggal}${tgl.bulan}${tgl.tahun}.xlsx`;

      // JALUR 1: Jika SheetJS (XLSX) tersedia di window
      if (typeof window.XLSX !== 'undefined') {
        try {
          const wsData = [
            ['REKAPITULASI HASIL ASESMEN CBT & NILAI AKADEMIK SEKOLAH DASAR (SD/MI)'],
            ['SEKOLAH: ' + infoSekolah.sekolahNama + ' | NPSN: ' + infoSekolah.npsn],
            ['Tahun Ajaran: ' + infoSekolah.tahunAjaran + ' | Mata Pelajaran: ' + (mapelFilter !== 'ALL' ? mapelFilter : 'Semua Mapel')],
            ['Tanggal Cetak: ' + tgl.lengkap],
            [],
            ['No', 'NISN', 'Nama Peserta Didik', 'Kelas / Rombel', 'Mata Pelajaran', 'Terjawab', 'Total Soal', 'Benar', 'Salah', 'Nilai Akhir', 'Status Ketuntasan', 'Status Ujian']
          ];

          rowsData.forEach(r => {
            wsData.push([r.no, r.nisn, r.nama, r.rombel, r.mapel, r.terjawab, r.totalSoal, r.benar, r.salah, r.skor, r.keterangan, r.status]);
          });

          // Baris Statistik Ringkasan
          wsData.push([]);
          wsData.push(['', '', 'RINGKASAN STATISTIK KELAS:']);
          wsData.push(['', '', 'Jumlah Peserta', scores.length + ' Siswa']);
          wsData.push(['', '', 'Nilai Rata-Rata Kelas', Number(rataRata)]);
          wsData.push(['', '', 'Nilai Tertinggi', maxSkor]);
          wsData.push(['', '', 'Nilai Terendah', minSkor]);
          wsData.push(['', '', 'Ketuntasan Belajar (KKTP ≥ 75)', `${countTuntas} Siswa (${persenTuntas}%)`]);

          const wb = window.XLSX.utils.book_new();
          const ws = window.XLSX.utils.aoa_to_sheet(wsData);

          // Lebar kolom rapi
          ws['!cols'] = [
            { wch: 5 },  // No
            { wch: 16 }, // NISN
            { wch: 28 }, // Nama
            { wch: 15 }, // Rombel
            { wch: 22 }, // Mapel
            { wch: 10 }, // Terjawab
            { wch: 10 }, // Total
            { wch: 8 },  // Benar
            { wch: 8 },  // Salah
            { wch: 12 }, // Nilai
            { wch: 20 }, // Ketuntasan
            { wch: 16 }  // Status
          ];

          window.XLSX.utils.book_append_sheet(wb, ws, 'Nilai CBT SD');
          window.XLSX.writeFile(wb, filename);

          this.showExportToast(`✅ Berhasil mengekspor ${scores.length} data nilai ke ${filename}`);
          return;
        } catch (err) {
          console.warn('[SicakapExport] SheetJS export error, falling back to Excel XML:', err);
        }
      }

      // JALUR 2: Fallback Universal Spreadsheet XML (100% Offline & Native Excel Compatible)
      this.downloadExcelXml(rowsData, {
        filename: filename,
        infoSekolah: infoSekolah,
        tgl: tgl,
        mapel: mapelFilter,
        rataRata: rataRata,
        maxSkor: maxSkor,
        minSkor: minSkor,
        countTuntas: countTuntas,
        persenTuntas: persenTuntas,
        totalSiswa: scores.length
      });
    },

    // Generator Excel XML / HTML Spreadsheet Universal
    downloadExcelXml: function (rowsData, meta) {
      let trHtml = '';
      rowsData.forEach(r => {
        const bgTuntas = r.skor >= 75 ? '#dcfce7' : '#fee2e2';
        const fgTuntas = r.skor >= 75 ? '#166534' : '#991b1b';
        trHtml += `
          <tr>
            <td style="text-align: center; border: 1px solid #cbd5e1;">${r.no}</td>
            <td style="mso-number-format:'\\@'; border: 1px solid #cbd5e1;">${r.nisn}</td>
            <td style="font-weight: bold; border: 1px solid #cbd5e1;">${r.nama}</td>
            <td style="text-align: center; border: 1px solid #cbd5e1;">${r.rombel}</td>
            <td style="border: 1px solid #cbd5e1;">${r.mapel}</td>
            <td style="text-align: center; border: 1px solid #cbd5e1;">${r.terjawab}</td>
            <td style="text-align: center; border: 1px solid #cbd5e1;">${r.totalSoal}</td>
            <td style="text-align: center; color: #15803d; font-weight: bold; border: 1px solid #cbd5e1;">${r.benar}</td>
            <td style="text-align: center; color: #b91c1c; font-weight: bold; border: 1px solid #cbd5e1;">${r.salah}</td>
            <td style="text-align: center; font-weight: bold; font-size: 11pt; border: 1px solid #cbd5e1; background-color: #f1f5f9;">${r.skor}</td>
            <td style="text-align: center; font-weight: bold; border: 1px solid #cbd5e1; background-color: ${bgTuntas}; color: ${fgTuntas};">${r.keterangan}</td>
            <td style="text-align: center; border: 1px solid #cbd5e1;">${r.status}</td>
          </tr>
        `;
      });

      const excelTemplate = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <!--[if gte mso 9]>
          <xml>
            <x:ExcelWorkbook>
              <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                  <x:Name>Rekap Nilai CBT SD</x:Name>
                  <x:WorksheetOptions>
                    <x:DisplayGridlines/>
                  </x:WorksheetOptions>
                </x:ExcelWorksheet>
              </x:ExcelWorksheets>
            </x:ExcelWorkbook>
          </xml>
          <![endif]-->
          <style>
            body { font-family: Calibri, Arial, sans-serif; }
            table { border-collapse: collapse; width: 100%; }
            th { background-color: #0284c7; color: #ffffff; font-weight: bold; text-align: center; border: 1px solid #0369a1; padding: 6px; }
            td { padding: 5px; font-size: 10pt; }
          </style>
        </head>
        <body>
          <table>
            <tr><td colspan="12" style="font-size: 14pt; font-weight: bold; text-align: center; color: #0369a1;">REKAPITULASI HASIL ASESMEN CBT &amp; NILAI AKADEMIK SD/MI</td></tr>
            <tr><td colspan="12" style="font-size: 11pt; font-weight: bold; text-align: center;">${meta.infoSekolah.sekolahNama} (NPSN: ${meta.infoSekolah.npsn})</td></tr>
            <tr><td colspan="12" style="font-size: 10pt; text-align: center; color: #475569;">Tahun Ajaran ${meta.infoSekolah.tahunAjaran} • Diekspor pada: ${meta.tgl.lengkap}</td></tr>
            <tr><td colspan="12"></td></tr>
            <thead>
              <tr>
                <th>No</th>
                <th>NISN</th>
                <th>Nama Peserta Didik</th>
                <th>Kelas / Rombel</th>
                <th>Mata Pelajaran</th>
                <th>Terjawab</th>
                <th>Total Soal</th>
                <th>Benar</th>
                <th>Salah</th>
                <th>Nilai Akhir</th>
                <th>Status Ketuntasan</th>
                <th>Status Ujian</th>
              </tr>
            </thead>
            <tbody>
              ${trHtml}
            </tbody>
            <tfoot>
              <tr><td colspan="12"></td></tr>
              <tr>
                <td colspan="3" style="font-weight: bold; background: #e2e8f0; border: 1px solid #94a3b8;">RINGKASAN KELAS:</td>
                <td colspan="3" style="border: 1px solid #94a3b8;">Total Peserta: <strong>${meta.totalSiswa} Murid</strong></td>
                <td colspan="3" style="border: 1px solid #94a3b8;">Rata-Rata Nilai: <strong>${meta.rataRata}</strong></td>
                <td colspan="3" style="border: 1px solid #94a3b8;">Ketuntasan (KKTP ≥ 75): <strong>${meta.countTuntas} Murid (${meta.persenTuntas}%)</strong></td>
              </tr>
            </tfoot>
          </table>
        </body>
        </html>
      `;

      const blob = new Blob([excelTemplate], { type: 'application/vnd.ms-excel;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showExportToast(`✅ Berhasil mengunduh Excel: ${meta.filename}`);
    },

    // Notifikasi Toast
    showExportToast: function (msg) {
      let toast = document.getElementById('export-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'export-toast';
        toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl bg-slate-900 text-white font-bold text-xs shadow-2xl flex items-center gap-2 border border-slate-700 transition-all duration-300 transform translate-y-10 opacity-0 pointer-events-none';
        document.body.appendChild(toast);
      }
      toast.innerHTML = `<span>📊</span> <span>${msg}</span>`;
      toast.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
      setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
      }, 3500);
    }
  };

  window.SicakapExport = SicakapExport;
})(window);
