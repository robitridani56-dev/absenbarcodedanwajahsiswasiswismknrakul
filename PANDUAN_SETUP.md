# Panduan Setup — Absensi Barcode SMKN Rakit Kulim

Sistem ini terdiri dari 2 bagian terpisah:
1. **Code.gs** → backend API (Google Apps Script + Google Sheets sebagai database)
2. **index.html** → frontend kiosk (dibuka langsung di browser, TIDAK dijalankan lewat Apps Script)

Kedua bagian sengaja dipisah agar izin kamera untuk scan barcode berjalan mulus (tidak terbentur sandbox iframe Apps Script).

---

## Langkah 1 — Siapkan Spreadsheet

1. Buat Google Spreadsheet baru, beri nama misalnya **"Database Absensi Siswa"**.
2. Salin **ID spreadsheet** dari URL:
   `https://docs.google.com/spreadsheets/d/`**`ID_SPREADSHEET_ADA_DI_SINI`**`/edit`

## Langkah 2 — Pasang Code.gs

1. Di spreadsheet tadi, buka **Extensions → Apps Script**.
2. Hapus kode default, lalu tempel isi file `Code.gs`.
3. Ganti baris berikut dengan ID spreadsheet Anda:
   ```js
   const SHEET_ID = "GANTI_DENGAN_ID_SPREADSHEET_ANDA";
   ```
4. Di dropdown fungsi (atas), pilih `setupSpreadsheet`, lalu klik **Run** (▶).
   Ini otomatis membuat sheet **"Siswa"** dan **"Absensi"** dengan header yang benar + 1 contoh baris.
5. Izinkan permission yang diminta Google saat pertama kali Run.

## Langkah 3 — Isi Data Siswa

Buka sheet **"Siswa"**, isi kolom:

| ID_Barcode | NIS | Nama | Kelas | Foto_URL | Status_Aktif |
|---|---|---|---|---|---|
| SISWA001 | 2024001 | Ahmad Fauzi | X TKJ 1 | link foto | Aktif |

**Cara mendapatkan Foto_URL dari Google Drive:**
1. Upload foto ke Google Drive → klik kanan → **Bagikan** → set ke "Siapa saja yang memiliki link".
2. Tempel di kolom Foto_URL **link apa saja dari Drive** (link share biasa, atau cukup ID file-nya saja) — sistem otomatis mengonversinya ke format yang stabil untuk ditampilkan. Kamu tidak perlu repot mengatur format link secara manual lagi.

> Catatan: sebelumnya sistem memakai format `drive.google.com/uc?export=view&id=...` yang sering diblokir/redirect oleh Google saat dipasang di `<img>` dari luar, sehingga foto tidak muncul. Sekarang backend otomatis mengonversi ke format `thumbnail` yang jauh lebih stabil.

**ID_Barcode** adalah kode unik yang akan dicetak di kartu/barcode siswa (bisa dibuat dari NIS, atau kode custom).

## Langkah 4 — Deploy sebagai Web App

1. Di Apps Script editor: **Deploy → New deployment**.
2. Pilih tipe **Web app**.
3. Isi:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Klik **Deploy**, lalu salin **URL Web App** yang muncul (diakhiri `/exec`).
5. Jika suatu saat kamu mengubah kode di Code.gs, **wajib** buat deployment versi baru
   (Deploy → Manage deployments → Edit → New version) supaya perubahan aktif.

## Langkah 5 — Hubungkan Frontend

1. Buka file `index.html` **dan** `cetak.html`, cari baris yang sama di masing-masing:
   ```js
   const API_URL = "https://script.google.com/macros/s/GANTI_DENGAN_DEPLOYMENT_ID/exec";
   ```
2. Ganti dengan URL Web App dari Langkah 4 (isi persis sama di kedua file).
3. Upload kedua file ke **hosting HTTPS** — Github Pages, Netlify, Vercel, atau cPanel dengan SSL.
4. Izinkan akses kamera saat browser meminta.

### ⚠️ Kenapa kamera tidak muncul?

Browser **memblokir akses kamera** kecuali halaman dibuka lewat:
- alamat **`https://...`**, atau
- **`localhost`** (saat development di komputer sendiri)

Jika kamu membuka `index.html` dengan cara **double-click dari File Explorer** (alamatnya jadi `file:///C:/...`), kamera **tidak akan pernah muncul** — ini batasan keamanan browser, bukan bug. Halaman sekarang otomatis mendeteksi kondisi ini dan menampilkan pesan penjelasan + tombol input manual sebagai solusi sementara.

**Solusi:** upload `index.html` ke hosting HTTPS gratis, misalnya:
- **Github Pages** (paling mudah): buat repo → upload file → aktifkan Pages di Settings → dapat URL `https://namamu.github.io/...`
- **Netlify** (drag & drop): buka netlify.com/drop → seret folder berisi `index.html` → langsung dapat URL HTTPS.

Setelah itu buka kiosk dari URL HTTPS tersebut di tablet/laptop yang terpasang di gerbang sekolah.

Kalau kamera masih belum muncul setelah dibuka lewat HTTPS, kemungkinan penyebabnya:
- Izin kamera ditolak → cek ikon gembok di address bar, aktifkan izin kamera secara manual.
- Kamera sedang dipakai aplikasi lain (Zoom, Meet, dll) → tutup aplikasi tersebut.
- Perangkat tidak punya kamera / driver bermasalah.

---

## Cetak Barcode Kartu Siswa (`cetak.html`)

File baru ini membuat kartu barcode siap cetak untuk semua siswa langsung dari data di sheet **"Siswa"** — tidak perlu bikin barcode manual.

Cara pakai:
1. Buka `cetak.html` di browser (boleh dari `file://` langsung, tidak butuh kamera jadi tidak masalah).
2. Data siswa otomatis dimuat dari spreadsheet.
3. Gunakan kolom pencarian / filter kelas untuk memilih siswa tertentu, atau **Pilih Semua**.
4. Klik **Cetak / Simpan PDF** — hanya kartu yang tercentang yang akan tercetak.
5. Pada dialog print, pilih **Save as PDF** jika ingin menyimpan file, atau pilih printer untuk cetak langsung ke kertas/label.

Barcode dibuat otomatis dari kolom **ID_Barcode** di sheet "Siswa" menggunakan format **CODE128** — kode ini yang nantinya dibaca kamera di halaman `index.html`.

## Cara Kerja Absensi

- Siswa mengarahkan barcode kartu ke kamera.
- Frontend membaca kode → memanggil API `submitAttendance`.
- Backend mengecek: siswa terdaftar? sudah absen hari ini? tepat waktu / terlambat (batas `07:15`, bisa diubah di `Code.gs`)?
- Hasil dikirim balik → foto siswa otomatis muncul di layar kiosk + tersimpan di sheet **"Absensi"**.

## Kolom di Sheet "Absensi" (otomatis terisi)

`Timestamp | Tanggal | Jam | ID_Barcode | NIS | Nama | Kelas | Status | Foto_URL`

## ⚠️ Penting — foto siswa tidak muncul?

Karena `Code.gs` baru saja diperbarui (ada fungsi normalisasi link foto), kamu **wajib redeploy versi baru** supaya perbaikannya aktif:
1. Buka Apps Script editor → **Deploy → Manage deployments**.
2. Klik ikon pensil (Edit) pada deployment yang aktif.
3. Di "Version", pilih **New version** → klik **Deploy**.
4. URL Web App tetap sama, tidak perlu ganti `API_URL` di `index.html`/`cetak.html`.

Kalau foto masih belum muncul setelah redeploy, cek:
- Foto di Drive sudah dibagikan ke **"Siapa saja yang memiliki link"** (bukan hanya "Dibatasi").
- Kolom `Foto_URL` di sheet "Siswa" tidak kosong.
- Coba buka link foto tersebut langsung di tab browser baru (mode penyamaran) — kalau muncul halaman login/izin, berarti izin share-nya belum benar.

## Tips

- Batas jam terlambat bisa diubah di `Code.gs`: `const BATAS_TERLAMBAT = "07:15";`
- Jika ada error "JSON tidak valid" saat banyak siswa scan bersamaan, sistem ini sudah memakai `LockService` untuk mencegah tabrakan data — pastikan tetap deploy versi terbaru setelah update kode.
- Untuk mencetak barcode siswa, buat halaman cetak terpisah (mis. `cetak.html`) yang membaca kolom `ID_Barcode` dari sheet "Siswa" — beri tahu saya jika ingin saya buatkan sekalian.
