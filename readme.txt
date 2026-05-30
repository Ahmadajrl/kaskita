====================================================================
           KAS KITA - SISTEM PENGELOLAAN KAS SEKOLAH
====================================================================

Dokumen ini berisi penjelasan lengkap mengenai fitur-fitur yang ada 
pada proyek "Kas Kita", termasuk modul Kecerdasan Buatan (AI) yang 
diimplementasikan untuk keamanan dan analitik.

--------------------------------------------------------------------
1. FITUR KEAMANAN & AUTENTIKASI (SECURITY FEATURES)
--------------------------------------------------------------------

A. Sistem Login & Register Terenkripsi (SHA-256 + Salt)
- Fungsi   : Mengamankan proses pendaftaran dan masuk pengguna. Password tidak disimpan dalam bentuk teks biasa, melainkan diacak menggunakan algoritma kriptografi modern (SHA-256) ditambah dengan kode unik (Salt).
- Urgensi  : Sangat Penting. Melindungi akun dari peretasan dan pencurian data. Bahkan jika database bocor, password asli tidak akan diketahui.

B. Multi-Layer Signature Scanner (Verifikasi Tanda Tangan Biometrik)
- Fungsi   : Sebelum pengguna bisa menambah data kas atau pengeluaran, pengguna wajib memindai/memfoto tanda tangan. Sistem menggunakan OpenCV untuk membandingkan bentuk umum (Heatmap) dan detail presisi goresan dengan tanda tangan asli.
- Urgensi  : Sangat Penting. Mencegah pemalsuan identitas (Impersonation). Seseorang yang mengetahui password Anda tetap tidak akan bisa memanipulasi data tanpa tanda tangan Anda.

C. Lupa Password Aman
- Fungsi   : Memungkinkan pengguna mereset password jika lupa, dengan menggunakan verifikasi username dan membuat Salt baru untuk password baru.
- Urgensi  : Penting. Memberikan akses kembali kepada pengguna tanpa mengorbankan standar keamanan enkripsi.

--------------------------------------------------------------------
2. FITUR KECERDASAN BUATAN (ARTIFICIAL INTELLIGENCE - AI)
--------------------------------------------------------------------

A. Sistem Deteksi Anomali & Pencegahan Fraud AI (AI Fraud Detection)
- Fungsi   : Bertindak sebagai "Penjaga Gerbang" terakhir sebelum data disimpan ke database. AI ini menganalisis:
  1. Anomali Nominal: Memblokir transaksi kas yang nominalnya melebihi batas wajar (Maksimal Rp 50.000). Untuk pengeluaran, menggunakan Z-Score (Statistik deviasi) untuk melihat apakah jumlahnya jauh menyimpang dari rata-rata historis.
  2. Anomali Waktu: Memblokir transaksi yang dilakukan pada jam tidak wajar (Jam 20:00 malam hingga 05:00 pagi).
  3. Anomali Kecepatan (Velocity): Mendeteksi jika ada terlalu banyak input dalam 1 menit (mencegah spam/bot).
- Urgensi  : Sangat Penting. Mencegah kesalahan input (human error), manipulasi angka, dan serangan spam, dengan memblokir transaksi berisiko tinggi (High Risk) secara otomatis.

B. AI Predictive Model (Prediksi Risiko Keterlambatan)
- Fungsi   : Menganalisis riwayat pembayaran kas setiap siswa menggunakan Probabilitas Historis. Sistem memprediksi persentase (0-100%) seberapa besar kemungkinan seorang siswa akan telat membayar kas di bulan ini, dan memberikan label "High Risk", "Medium Risk", atau "Low Risk".
- Urgensi  : Penting. Membantu pengurus kas melakukan penagihan secara proaktif kepada siswa yang memiliki kebiasaan menunggak, sebelum tunggakan menjadi terlalu besar.

C. AI Clustering (Pengelompokan Siswa)
- Fungsi   : Menggunakan algoritma Machine Learning untuk mengelompokkan (clustering) siswa berdasarkan pola pembayarannya.
- Urgensi  : Menengah. Berguna untuk memahami demografi kedisiplinan kelas secara keseluruhan tanpa harus menganalisis data satu per satu.

--------------------------------------------------------------------
3. FITUR PENGELOLAAN & DATABASE (CORE FEATURES)
--------------------------------------------------------------------

A. Integrasi Google Sheets (Backend Serverless)
- Fungsi   : Menggunakan Google Sheets sebagai database (menyimpan data kas, pengeluaran, dan user) secara real-time melalui Google Apps Script (GAS).
- Urgensi  : Sangat Penting. Menyediakan database gratis, mudah diakses, transparan, dan tidak memerlukan biaya sewa server.

B. Pencatatan Pemasukan (Kas) & Pengeluaran
- Fungsi   : Form terstruktur untuk memasukkan data pembayaran siswa dan mencatat pengeluaran uang kas.
- Urgensi  : Sangat Penting (Fitur Utama). Memastikan arus kas keluar masuk tercatat dengan rapi.

--------------------------------------------------------------------
4. FITUR ANALITIK & PELAPORAN (REPORTING)
--------------------------------------------------------------------

A. Dashboard Interaktif (Visualisasi Data Chart.js)
- Fungsi   : Menampilkan grafik batang untuk pemasukan per bulan, grafik donat untuk rasio siswa tepat waktu vs telat, serta metrik instan (Total Saldo, Total Pemasukan, dll).
- Urgensi  : Penting. Memberikan rangkuman visual yang mudah dipahami dalam hitungan detik bagi pengurus kelas/sekolah.

B. iLovePDF API Integration (Export PDF Profesional)
- Fungsi   : Mengubah laporan keuangan menjadi file PDF resmi menggunakan server iLovePDF. Sistem melakukan autentikasi JWT, mengunggah kerangka, lalu mengunduh hasil PDF yang sudah terkompresi.
- Urgensi  : Penting. Diperlukan untuk mencetak laporan akhir bulan atau menyerahkan pertanggungjawaban dana (SPJ) kepada wali kelas/sekolah dengan format yang tidak bisa diubah-ubah.

C. Export Excel (.xlsx) & PDF Lokal (Fallback)
- Fungsi   : Mengunduh data mentah ke Microsoft Excel, serta fitur pembuat PDF bawaan peramban (jsPDF) jika server iLovePDF sedang gangguan.
- Urgensi  : Penting. Sebagai opsi cadangan (fallback) dan untuk kebutuhan audit data secara manual.

====================================================================
                      DIBUAT PADA: TAHUN 2026
====================================================================
