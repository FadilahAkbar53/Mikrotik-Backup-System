# MikBack — MikroTik Backup Monitoring System

**MikBack** adalah platform pemantauan dan pengelolaan cadangan (*backup & disaster recovery*) otomatis untuk perangkat **MikroTik RouterOS** yang terpusat, modern, dan aman. Aplikasi ini memudahkan Network Administrator, ISP, pengelola jaringan kantor, serta pengusaha RT/RW Net dalam memastikan seluruh konfigurasi perangkat router selalu tercadangkan secara berkala dan siap dipulihkan kapan pun dibutuhkan.

---

## 🌟 Ikhtisar Aplikasi

Dalam pengelolaan infrastruktur jaringan, kehilangan konfigurasi router akibat kerusakan perangkat keras, kesalahan konfigurasi (*human error*), atau serangan siber dapat menyebabkan *downtime* yang merugikan. 

**MikBack** hadir sebagai solusi terpadu untuk:
* Mengotomatiskan pengiriman berkas konfigurasi (`.rsc`) dan berkas biner (`.backup`) dari router ke server terpusat.
* Memberikan visibilitas status *health check* dan jadwal backup terakhir dari seluruh router yang tersebar di berbagai lokasi.
* Mempermudah inspeksi dan pencarian baris konfigurasi router langsung melalui antarmuka web tanpa harus membuka terminal MikroTik.
* Merekapitulasi laporan aktivitas dan voucher hotspot jaringan secara terstruktur.

---

## ✨ Fitur-Fitur Utama

### 1. 📊 Dashboard Ringkasan Eksekutif
* **Statistik Cepat**: Informasi total router terdaftar, total berkas backup yang tersimpan, penggunaan kapasitas penyimpanan (*storage*), dan rasio router yang aktif melakukan backup.
* **Aktivitas & Log Terbaru**: Pemantauan langsung terhadap backup yang baru saja masuk dan log aktivitas otentikasi.
* **Indikator Kesehatan Server**: Ringkasan performa sistem secara berkala demi menjamin stabilitas layanan.

### 2. 🖧 Manajemen Router Terpusat
* **Daftar & Status Router**: Melihat status seluruh router, tanggal backup terakhir, status kepemilikan, dan token otentikasi unik tiap router.
* **Filter & Pencarian Cepat**: Memudahkan pencarian router berdasarkan nama, status backup aktif/terlambat, dan pemilik.
* **Ekspor Data**: Fitur ekspor daftar router beserta informasi pentingnya untuk kebutuhan dokumentasi dan pelaporan jaringan.
* **One-Click Script Generator**: Pembuatan skrip otomatisasi RouterOS yang telah disesuaikan dengan konfigurasi dan token router Anda, siap disalin langsung ke terminal MikroTik.

### 3. 💾 Eksplorasi & Pratinjau Berkas Backup
* **Riwayat Backup Terstruktur**: Arsip berkas backup tersusun rapi berdasarkan router dan periode waktu.
* **Dukungan Format Lengkap**: Mendukung berkas konfigurasi ekspor skrip (`.rsc`) dan berkas cadangan biner penuh (`.backup`).
* **Pratinjau Script Interaktif**: Membaca isi konfigurasi teks (`.rsc`) langsung di browser lengkap dengan nomor baris otomatis dan fitur **pencarian kata kunci** secara instan.
* **Unduh & Pemulihan Cepat**: Berkas backup dapat diunduh kapan saja saat dibutuhkan untuk proses *restore* perangkat.

### 4. 📈 Laporan Voucher Hotspot Jaringan
* **Rekapitulasi Penjualan Voucher**: Khusus router yang mengaktifkan fitur hotspot/Mikhmon, sistem menyediakan ringkasan voucher yang terjual.
* **Filter Periode & Profil**: Filter data berdasarkan bulan kalender dan profil paket hotspot untuk mempermudah pembukuan pendapatan.

### 5. 👤 Pengelolaan Profil Mandiri (*Self-Service*)
* **Informasi Akun & Keamanan**: Pengguna dapat memperbarui nama, email, dan mengganti kata sandi secara mandiri.
* **Panduan Format Penamaan**: Panduan ringkas bagi pengguna mengenai format nama berkas cadangan yang direkomendasikan agar arsip tersusun rapi.
* **Unggah Manual**: Fasilitas pengunggahan berkas backup secara manual melalui browser jika router sedang berada di luar jangkauan jaringan otomatis.

### 6. 🛡️ Keamanan & Perlindungan Akun
* **Otentikasi Berlapis**: Sesi pengguna terlindungi dengan mekanisme anti-pembajakan sesi (*session hardening*).
* **Kebijakan Penguncian Akun (*Account Lockout*)**: Akun otomatis dibekukan sementara jika terdeteksi kesalahan kata sandi beruntun demi melindungi akun dari upaya tebakan paksa (*brute-force*).
* **Pembatasan Laju Akses (*Rate Limiting*)**: Mencegah beban berlebih (*flooding*) pada portal login dan endpoint unggah cadangan.
* **Validasi Berkas Ketat**: Menolak berkas di luar format cadangan resmi MikroTik untuk memastikan integritas dan keamanan repositori.

### 7. ⚙️ Panel Khusus Administrator (*Super Admin*)
* **Manajemen Pengguna (Tenant Management)**: Menambah pengguna baru, mengatur hak akses, menonaktifkan (*suspend*) akun yang tidak aktif, membuka kunci akun pengguna yang terkunci, serta mereset kata sandi.
* **Simulasi Akses Pengguna (*User Impersonation*)**: Membantu admin meninjau tampilan dan membantu kendala teknis pengguna tanpa perlu mengetahui kata sandi pengguna.
* **Pengaturan Template Skrip Terpusat**: Mengelola template skrip RouterOS yang digunakan di seluruh sistem.
* **Kebijakan Retensi Otomatis**: Mengatur batas masa simpan berkas cadangan agar kapasitas disk server tetap efisien, dilengkapi fitur simulasi pembersihan (*dry-run*).
* **Audit System Log**: Rekaman riwayat aktivitas operasional penting demi transparansi dan audit keamanan.
* **Pengaturan Umum Aplikasi**: Kendali terpusat untuk konfigurasi platform (nama aplikasi, perizinan registrasi publik, dll).

---

## 🔑 Cara Akses & Navigasi Sistem

### 1. Akses Melalui Web Browser
Aplikasi MikBack dapat diakses menggunakan peramban modern (Google Chrome, Mozilla Firefox, Microsoft Edge, Safari) baik melalui komputer desktop, laptop, maupun perangkat tablet/smartphone.

### 2. Tingkatan Hak Akses (*User Roles*)
Sistem memiliki 2 (dua) tingkatan peran dengan wewenang yang terisolasi:

| Peran | Cakupan Wewenang |
|---|---|
| **Tenant / Pengguna Biasa** | • Mengelola router miliknya sendiri.<br>• Melihat riwayat dan mengunduh berkas backup miliknya.<br>• Melihat laporan hotspot routernya.<br>• Mengatur profil akun pribadi. |
| **Administrator** | • Memiliki seluruh akses tenant.<br>• Mengelola seluruh pengguna dan seluruh router di sistem.<br>• Mengatur kebijakan retensi storage dan template skrip.<br>• Memantau log audit dan kesehatan server. |

---

## 🧭 Alur Penggunaan Dasar

1. **Masuk ke Akun**: Buka halaman login aplikasi, masukkan email dan kata sandi yang telah terdaftar.
2. **Daftarkan Router**: Buka menu **Router** > klik tombol **Tambah Router**, lalu isi nama dan keterangan router Anda.
3. **Ambil Skrip Konfigurasi**: Buka detail router yang baru dibuat, masuk ke tab **Generator Script**, lalu salin skrip yang telah disediakan.
4. **Pasang di MikroTik**: Buka terminal Winbox/SSH router MikroTik Anda, lalu tempel (*paste*) skrip tersebut. Skrip akan menjadwalkan backup berkala secara otomatis.
5. **Pantau Cadangan**: Berkas cadangan yang terkirim dari MikroTik akan otomatis muncul di halaman detail router dan siap diunduh atau dipratinjau kapan pun dibutuhkan.

---

## 🔒 Kebijakan Keamanan & Privasi

* Seluruh data konfigurasi router Anda tersimpan secara privat dan hanya dapat diakses oleh pemilik akun yang bersangkutan serta administrator berwenang.
* Demi menjaga keamanan akun, gunakan kata sandi yang kuat dan jangan membagikan Token API Router Anda kepada pihak yang tidak berkepentingan.

---
*© MikBack — MikroTik Backup Monitoring System. Hak Cipta Dilindungi Undang-Undang.*
