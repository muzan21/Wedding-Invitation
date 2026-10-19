# Undangan Online

Satu template undangan, banyak acara. Semua isi (nama, tanggal, lokasi, video, foto, musik, teks, warna)
disimpan sebagai **data** dan diubah lewat **dashboard**, tanpa menyentuh kode.

```
Dashboard → Buat undangan → Unggah video → Isi data → Preview → Publikasikan → Link undangan
```

## Menjalankan

Butuh **Node.js 18 atau lebih baru**. Tidak ada dependensi yang perlu diinstal.

```bash
ADMIN_PASSWORD="password-anda" node server.js
```

- Dashboard : http://localhost:3000/admin
- Contoh    : http://localhost:3000/undangan/sandy-kala

Tanpa `ADMIN_PASSWORD`, password bawaan adalah `admin123`. **Wajib diganti sebelum online.**

| Variabel         | Fungsi                                                         |
|------------------|----------------------------------------------------------------|
| `PORT`           | Port server (bawaan 3000)                                      |
| `ADMIN_PASSWORD` | Password dashboard                                             |
| `DATA_DIR`       | Folder database (bawaan `./data`)                              |
| `UPLOAD_DIR`     | Folder video/foto/musik (bawaan `./uploads`)                   |
| `TRUST_PROXY=1`  | Aktifkan jika di belakang nginx/Cloudflare/Railway/Render      |

## Cara pakai

1. **Buat undangan**: isi nama acara. Link otomatis dibuat (`/undangan/rina-dan-dimas`), bisa diubah.
   Bisa juga *Duplikat* undangan lama agar semua pengaturan ikut tersalin.
2. **Isi data** di tab Dasar, Acara, Mempelai, Video & Musik, Galeri, Teks, Tema.
   Panel kanan menampilkan **preview langsung** (HP, tablet, desktop; sampul atau isi).
3. **Simpan draf**: hanya tersimpan sebagai draf, tamu belum melihat perubahan.
4. **Publikasikan**: draf menjadi versi yang dilihat tamu. Mengedit undangan yang sudah terbit tidak
   langsung tampil sampai Anda menekan *Terbitkan perubahan*.
5. **Bagikan**: tab Bagikan membuat link per tamu (`/undangan/slug?to=Nama+Tamu`) lengkap dengan tombol WhatsApp.
   Nama tamu tampil di sampul dan terisi otomatis di form RSVP.
6. **Tamu & RSVP**: lihat konfirmasi dan ucapan, hapus yang tidak pantas, unduh CSV.

## Tentang video sampul

- Video dipakai **apa adanya** (tidak diproses ulang). Diputar tanpa suara dan berulang; musik terpisah.
- Format terbaik: **MP4 (H.264)**, portrait 9:16, di bawah ~20 MB agar cepat dibuka di HP.
- Jika video Anda **sudah memuat nama dan tulisan** (seperti video contoh), pilih gaya sampul
  *Ringkas* atau *Hanya tombol* di tab Video & Musik agar tidak ada tulisan ganda. Tulisan yang
  sudah menempel di video tidak bisa diubah dari dashboard; ganti videonya jika perlu.
- Poster (gambar saat video dimuat) dibuat otomatis dari video saat Anda mengunggah.

## Struktur

```
server.js              server, API, upload, autentikasi (tanpa dependensi)
store.js               penyimpanan data (JSON). Ganti file ini untuk pindah ke SQLite/PostgreSQL
invitation-model.js    bentuk data undangan, data contoh, dan validasi input
public/invitation/     TEMPLATE: hanya menampilkan data (HTML/CSS/JS)
public/admin/          DASHBOARD
data/db.json           DATA undangan, RSVP (dibuat otomatis)
uploads/               video, foto, musik yang diunggah
```

Template dan data terpisah: menambah undangan = menambah satu record data, tidak ada halaman baru
yang ditulis. Untuk membuat desain baru, salin `public/invitation/` dan tambahkan pilihan template.

## Online (hosting)

Aplikasi ini butuh server Node.js dengan penyimpanan yang **persisten** (folder `data/` dan `uploads/`
tidak boleh hilang saat restart). Cocok untuk VPS, Railway, Render (dengan disk), Fly.io, dll.
Hosting statis (Netlify, GitHub Pages) **tidak cocok** karena RSVP dan upload butuh server.

- Pasang HTTPS (misalnya lewat nginx + Let's Encrypt, atau bawaan platform) dan set `TRUST_PROXY=1`.
- **Backup** folder `data/` dan `uploads/` secara berkala.
- Font memakai Google Fonts, jadi perangkat tamu perlu internet agar huruf tampil sesuai desain.

## Keamanan yang sudah ada

Login dengan batas percobaan, cookie HttpOnly, header anti-CSRF pada semua perubahan data, upload divalidasi
dari **isi file** (bukan nama), SVG tidak diizinkan untuk upload, semua teks tamu ditampilkan sebagai teks
(bukan HTML), link Maps hanya http/https, batas kecepatan kirim RSVP, honeypot anti-bot, CSV aman dari injeksi formula.

## Batasan yang perlu diketahui

- Satu admin (satu password). Untuk banyak admin, tambahkan akun pada `server.js`.
- Penyimpanan JSON nyaman untuk ribuan RSVP; untuk skala jauh lebih besar, ganti `store.js`.
- File yang dihapus dari dashboard tidak otomatis dihapus dari folder `uploads/`.
