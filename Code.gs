/**
 * ============================================================
 *  SISTEM ABSENSI BARCODE SISWA - SMKN RAKIT KULIM
 *  Backend: Google Apps Script (API ONLY, tanpa tampilan HTML)
 *  Database: Google Spreadsheet
 *
 *  Arsitektur:
 *  - File ini di-deploy sebagai Web App (Execute as: Me,
 *    Access: Anyone) dan HANYA berfungsi sebagai API (JSON).
 *  - Frontend (index.html) berjalan TERPISAH (dibuka langsung
 *    di browser / dihosting di tempat lain / Github Pages),
 *    lalu memanggil API ini via fetch(). Ini sengaja dipisah
 *    supaya izin kamera untuk scan barcode tidak terbentur
 *    sandbox iframe Apps Script.
 * ============================================================
 */

// =================== KONFIGURASI ===================
const SHEET_ID          = "GANTI_DENGAN_ID_SPREADSHEET_ANDA"; // ID spreadsheet
const SHEET_SISWA       = "Siswa";
const SHEET_ABSENSI     = "Absensi";
const SHEET_JADWAL      = "Jadwal";
const ZONA_WAKTU        = "Asia/Jakarta";
const ADMIN_PIN         = "202408"; // PIN admin default, ganti sesuai kebutuhan

// Jadwal default (dipakai kalau sheet Jadwal kosong/belum di-setup)
const JADWAL_DEFAULT = {
  Senin : { jamMasuk:"07:00", jamTerlambat:"07:15", jamPulang:"15:00" },
  Selasa: { jamMasuk:"07:00", jamTerlambat:"07:15", jamPulang:"15:00" },
  Rabu  : { jamMasuk:"07:00", jamTerlambat:"07:15", jamPulang:"15:00" },
  Kamis : { jamMasuk:"07:00", jamTerlambat:"07:15", jamPulang:"15:00" },
  Jumat : { jamMasuk:"07:00", jamTerlambat:"07:15", jamPulang:"11:30" }
};
const HARI_URUT = ["Senin","Selasa","Rabu","Kamis","Jumat"];

// =================== ENTRY POINT ===================
function doGet(e) {
  try {
    const action = e.parameter.action;

    switch (action) {
      case "getStudent":
        return jsonResponse(getStudentByBarcode(e.parameter.barcode));
      case "submitAttendance":
        return jsonResponse(submitAttendance(e.parameter.barcode, e.parameter.jenis));
      case "submitIzinSakit":
        return jsonResponse(submitIzinSakit(e.parameter.pin, e.parameter.nis, e.parameter.tanggal, e.parameter.jenis, e.parameter.keterangan));
      case "getTodayLog":
        return jsonResponse(getTodayLog());
      case "getAllStudents":
        return jsonResponse(getAllStudents());
      case "getJadwal":
        return jsonResponse(getJadwal());
      case "saveJadwal":
        return jsonResponse(saveJadwal(e.parameter.pin, e.parameter.data));
      case "getKelasList":
        return jsonResponse(getKelasList());
      case "getAbsensiByKelas":
        return jsonResponse(getAbsensiByKelas(e.parameter.kelas, e.parameter.tanggalMulai, e.parameter.tanggalAkhir));
      case "checkPin":
        return jsonResponse({ success: e.parameter.pin === ADMIN_PIN });
      case "updateAbsensi":
        return jsonResponse(updateAbsensi(e.parameter.pin, e.parameter.tanggal, e.parameter.nis, e.parameter.jenis, e.parameter.jam, e.parameter.status));
      case "deleteAbsensi":
        return jsonResponse(deleteAbsensi(e.parameter.pin, e.parameter.tanggal, e.parameter.nis, e.parameter.jenis));
      case "ping":
        return jsonResponse({ success: true, message: "API aktif", time: new Date() });
      default:
        return jsonResponse({ success: false, message: "Aksi tidak dikenali." });
    }
  } catch (err) {
    return jsonResponse({ success: false, message: "Error server: " + err.message });
  }
}

// Semua request memakai GET (query string) supaya tidak kena
// CORS preflight (OPTIONS) yang tidak didukung Apps Script.
function doPost(e) {
  return doGet(e);
}

// =================== HELPER RESPONSE ===================
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =================== NORMALISASI LINK FOTO GOOGLE DRIVE ===================
// Menerima link Drive dalam berbagai format (link share, link uc?export=view,
// atau bahkan cuma ID file-nya saja) dan mengembalikan format "thumbnail"
// yang paling stabil untuk ditampilkan langsung di <img>. Link biasa
// (drive.google.com/uc?export=view&id=...) sering diblokir/redirect oleh
// Google saat diakses berkali-kali dari luar, sedangkan format thumbnail jauh
// lebih konsisten untuk kebutuhan hotlink seperti ini.
function normalizeFotoUrl(url) {
  if (!url) return "";
  url = url.toString().trim();
  if (!url) return "";

  let id = null;
  let m = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/);      // .../file/d/ID/view
  if (m) id = m[1];
  if (!id) { m = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/); if (m) id = m[1]; } // ...?id=ID
  if (!id && /^[a-zA-Z0-9_-]{20,}$/.test(url)) id = url; // hanya ID Drive yang ditempel langsung

  if (id) {
    return "https://drive.google.com/thumbnail?id=" + id + "&sz=w500";
  }
  return url; // bukan link Drive (mis. link foto dari luar) -> pakai apa adanya
}

// =================== AMBIL DATA SISWA ===================
function getStudentByBarcode(barcode) {
  if (!barcode) {
    return { success: false, message: "Barcode kosong." };
  }
  barcode = barcode.toString().trim();

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_SISWA);
  const data = sheet.getDataRange().getValues();
  // Header: [0]ID_Barcode [1]NIS [2]Nama [3]Kelas [4]Foto_URL [5]Status_Aktif

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const idBarcode = row[0] ? row[0].toString().trim() : "";

    if (idBarcode === barcode) {
      const statusAktif = row[5];
      if (statusAktif === false || String(statusAktif).toUpperCase() === "TIDAK") {
        return { success: false, message: "Kartu siswa ini tidak aktif." };
      }
      return {
        success: true,
        nis: row[1],
        nama: row[2],
        kelas: row[3],
        foto: normalizeFotoUrl(row[4]),
        barcode: idBarcode
      };
    }
  }
  return { success: false, message: "Barcode tidak terdaftar di database siswa." };
}

// =================== SIMPAN ABSENSI ===================
// jenis: "masuk" (default) atau "pulang". Disimpan di kolom terakhir
// sheet Absensi (kolom J) supaya data lama yang belum punya kolom ini
// tetap kompatibel (dianggap "masuk").
function submitAttendance(barcode, jenis) {
  jenis = (jenis || "masuk").toString().trim().toLowerCase();
  if (jenis !== "pulang") jenis = "masuk";

  const lock = LockService.getScriptLock();
  try {
    // Cegah tabrakan data saat banyak siswa scan bersamaan
    lock.waitLock(15000);

    const siswa = getStudentByBarcode(barcode);
    if (!siswa.success) {
      return siswa; // pesan error sudah sesuai
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheetAbsensi = ss.getSheetByName(SHEET_ABSENSI);

    const now = new Date();
    const tanggalHariIni = Utilities.formatDate(now, ZONA_WAKTU, "yyyy-MM-dd");
    const jamSekarang = Utilities.formatDate(now, ZONA_WAKTU, "HH:mm:ss");

    // Cek apakah siswa ini sudah absen (dengan jenis yang sama) hari ini (cegah duplikat)
    const dataAbsensi = sheetAbsensi.getDataRange().getValues();
    for (let i = 1; i < dataAbsensi.length; i++) {
      const row = dataAbsensi[i];
      const tglRow = row[1] ? row[1].toString() : "";
      const barcodeRow = row[3] ? row[3].toString().trim() : "";
      const jenisRow = row[9] ? row[9].toString().trim().toLowerCase() : "masuk";
      if (tglRow === tanggalHariIni && barcodeRow === siswa.barcode && jenisRow === jenis) {
        return {
          success: false,
          duplicate: true,
          message: siswa.nama + " sudah tercatat " + (jenis === "pulang" ? "pulang" : "hadir") +
            " hari ini pukul " + row[2],
          nama: siswa.nama,
          nis: siswa.nis,
          kelas: siswa.kelas,
          foto: siswa.foto,
          jam: row[2],
          jenis: jenis
        };
      }
    }

    // Tentukan status berdasarkan jadwal hari ini
    const hariIni = getNamaHari(now);
    const jadwalHariIni = getJadwalHari(hariIni);
    const detikSekarang = jamKeDetik(jamSekarang);
    let status;
    if (jenis === "pulang") {
      const detikBatasPulang = jamKeDetikBatas(jadwalHariIni.jamPulang);
      status = detikSekarang < detikBatasPulang ? "Pulang Cepat" : "Pulang";
    } else {
      const detikBatasTerlambat = jamKeDetikBatas(jadwalHariIni.jamTerlambat);
      status = detikSekarang <= detikBatasTerlambat ? "Hadir" : "Terlambat";
    }

    sheetAbsensi.appendRow([
      now,
      tanggalHariIni,
      jamSekarang,
      siswa.barcode,
      siswa.nis,
      siswa.nama,
      siswa.kelas,
      status,
      siswa.foto,
      jenis
    ]);
    // Pastikan kolom tanggal & jam tersimpan sebagai teks, bukan
    // otomatis diubah jadi Date oleh Google Sheets.
    const lastRow = sheetAbsensi.getLastRow();
    sheetAbsensi.getRange(lastRow, 2, 1, 2).setNumberFormat("@");

    return {
      success: true,
      duplicate: false,
      nama: siswa.nama,
      nis: siswa.nis,
      kelas: siswa.kelas,
      foto: siswa.foto,
      status: status,
      jam: jamSekarang,
      jenis: jenis,
      message: (jenis === "pulang" ? "Absen pulang" : "Absensi") + " berhasil dicatat."
    };

  } catch (err) {
    return { success: false, message: "Gagal menyimpan absensi: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// =================== CATAT IZIN / SAKIT (ADMIN, MANUAL) ===================
// Dipakai saat siswa tidak masuk (izin/sakit) sehingga tidak bisa scan
// barcode sendiri. Admin memasukkan NIS + tanggal secara manual dari
// panel "Kelola Data Absensi". Disimpan dengan jenis="masuk" (kolom J)
// supaya tetap terhitung sebagai satu entri "masuk" per hari (mencegah
// siswa yang sudah diizinkan/sakit tetap bisa scan absen masuk di hari
// yang sama), tapi kolom Status (kolom H) diisi "Izin"/"Sakit" sehingga
// bisa dibedakan dari kehadiran fisik (Hadir/Terlambat).
function submitIzinSakit(pin, nis, tanggal, jenisIzin, keterangan) {
  if (pin !== ADMIN_PIN) {
    return { success: false, message: "PIN admin salah." };
  }
  if (!nis || !tanggal || !jenisIzin) {
    return { success: false, message: "NIS, tanggal, dan jenis wajib diisi." };
  }
  jenisIzin = jenisIzin.toString().trim();
  if (jenisIzin !== "Izin" && jenisIzin !== "Sakit") {
    return { success: false, message: "Jenis harus 'Izin' atau 'Sakit'." };
  }
  const tgl = tanggal.toString().trim();
  const nisCari = nis.toString().trim();

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheetSiswa = ss.getSheetByName(SHEET_SISWA);
    const dataSiswa = sheetSiswa.getDataRange().getValues();
    // Header: [0]ID_Barcode [1]NIS [2]Nama [3]Kelas [4]Foto_URL [5]Status_Aktif
    let siswa = null;
    for (let i = 1; i < dataSiswa.length; i++) {
      const row = dataSiswa[i];
      if (row[1] && row[1].toString().trim() === nisCari) {
        siswa = {
          barcode: row[0] ? row[0].toString().trim() : "",
          nis: row[1],
          nama: row[2],
          kelas: row[3],
          foto: normalizeFotoUrl(row[4])
        };
        break;
      }
    }
    if (!siswa) {
      return { success: false, message: "NIS siswa tidak ditemukan." };
    }

    const sheetAbsensi = ss.getSheetByName(SHEET_ABSENSI);
    const dataAbsensi = sheetAbsensi.getDataRange().getValues();
    // Cegah duplikat: siswa yang sudah punya data absensi "masuk" (baik
    // hasil scan maupun izin/sakit sebelumnya) di tanggal yang sama.
    for (let i = 1; i < dataAbsensi.length; i++) {
      const row = dataAbsensi[i];
      const tglRow = row[1] ? row[1].toString() : "";
      const nisRow = row[4] ? row[4].toString().trim() : "";
      const jenisRow = row[9] ? row[9].toString().trim().toLowerCase() : "masuk";
      if (tglRow === tgl && nisRow === nisCari && jenisRow === "masuk") {
        return {
          success: false,
          duplicate: true,
          message: siswa.nama + " sudah punya data absensi (" + row[7] + ") pada tanggal " + tgl + "."
        };
      }
    }

    sheetAbsensi.appendRow([
      new Date(),
      tgl,
      "-",
      siswa.barcode || "-",
      siswa.nis,
      siswa.nama,
      siswa.kelas,
      jenisIzin,
      siswa.foto,
      "masuk"
    ]);
    const lastRow = sheetAbsensi.getLastRow();
    sheetAbsensi.getRange(lastRow, 2, 1, 2).setNumberFormat("@");

    return {
      success: true,
      message: siswa.nama + " berhasil dicatat " + jenisIzin + " pada tanggal " + tgl + ".",
      nama: siswa.nama,
      nis: siswa.nis,
      kelas: siswa.kelas,
      status: jenisIzin,
      tanggal: tgl
    };

  } catch (err) {
    return { success: false, message: "Gagal menyimpan data: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// =================== LOG HARI INI (untuk kiosk feed & monitor admin) ===================
function getTodayLog() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ABSENSI);
  const data = sheet.getDataRange().getValues();
  const tanggalHariIni = Utilities.formatDate(new Date(), ZONA_WAKTU, "yyyy-MM-dd");

  // "log" (untuk kiosk, dibatasi 15 item terbaru) tetap dipertahankan.
  // "monitor" (untuk tabel admin) berisi SELURUH data hari ini (tidak
  // dibatasi) lengkap dengan NIS, supaya frontend bisa menggabungkan
  // catatan Masuk & Pulang milik siswa yang sama jadi satu baris.
  const log = [];
  const monitor = [];
  let totalHadir = 0, totalTerlambat = 0, totalPulang = 0, totalIzin = 0, totalSakit = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (row[1] && row[1].toString() === tanggalHariIni) {
      const jenis = row[9] ? row[9].toString().trim().toLowerCase() : "masuk";
      if (jenis === "pulang") {
        totalPulang++;
      } else if (row[7] === "Terlambat") {
        totalTerlambat++;
      } else if (row[7] === "Izin") {
        totalIzin++;
      } else if (row[7] === "Sakit") {
        totalSakit++;
      } else {
        totalHadir++;
      }
      const entry = {
        nis: row[4],
        nama: row[5],
        kelas: row[6],
        jam: row[2],
        status: row[7],
        foto: normalizeFotoUrl(row[8]),
        jenis: jenis
      };
      monitor.push(entry);
      if (log.length < 15) log.push(entry);
    }
  }
  return {
    success: true,
    log: log,
    monitor: monitor,
    totalHadir: totalHadir,
    totalTerlambat: totalTerlambat,
    totalPulang: totalPulang,
    totalIzin: totalIzin,
    totalSakit: totalSakit,
    totalScan: totalHadir + totalTerlambat + totalPulang + totalIzin + totalSakit
  };
}

// =================== DAFTAR SEMUA SISWA (untuk halaman cetak barcode) ===================
function getAllStudents() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_SISWA);
  const data = sheet.getDataRange().getValues();
  // Header: [0]ID_Barcode [1]NIS [2]Nama [3]Kelas [4]Foto_URL [5]Status_Aktif

  const siswa = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // lewati baris kosong
    siswa.push({
      barcode: row[0].toString().trim(),
      nis: row[1],
      nama: row[2],
      kelas: row[3],
      foto: normalizeFotoUrl(row[4]),
      aktif: !(row[5] === false || String(row[5]).toUpperCase() === "TIDAK")
    });
  }
  return { success: true, siswa: siswa };
}

// =================== JADWAL (HARI, JAM MASUK/TERLAMBAT/PULANG) ===================
function getNamaHari(date) {
  const hari = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
  return hari[date.getDay()];
}

// Ambil jadwal satu hari tertentu. Fallback ke default kalau sheet
// belum di-setup atau hari itu tidak ada baris di sheet Jadwal
// (mis. Sabtu/Minggu, dianggap tidak ada sekolah tapi tetap dikasih
// nilai default supaya sistem tidak error kalau ada yang scan).
function getJadwalHari(namaHari) {
  const semua = getJadwal();
  const def = JADWAL_DEFAULT[namaHari] || { jamMasuk:"07:00", jamTerlambat:"07:15", jamPulang:"15:00" };
  const j = (semua.jadwal && semua.jadwal[namaHari]) || {};
  // Fallback per-field: kalau salah satu jam kosong di sheet (mis. admin
  // belum isi lewat form Jadwal), pakai nilai default untuk field itu saja,
  // bukan cuma fallback kalau seluruh objeknya tidak ada.
  return {
    jamMasuk: j.jamMasuk || def.jamMasuk,
    jamTerlambat: j.jamTerlambat || def.jamTerlambat,
    jamPulang: j.jamPulang || def.jamPulang
  };
}

// Bandingkan dua jam ("HH:mm" atau "HH:mm:ss") secara numerik (total detik),
// bukan perbandingan string. Perbandingan string sebelumnya bisa salah total
// kalau salah satu nilainya kosong atau formatnya beda panjang.
function jamKeDetik(jam) {
  if (!jam) return null;
  const parts = jam.toString().trim().split(":").map(Number);
  const h = parts[0] || 0, m = parts[1] || 0, s = parts[2] || 0;
  return h * 3600 + m * 60 + s;
}

// Batas terlambat/pulang biasanya disimpan sebagai "HH:mm" (tanpa detik,
// input jenisnya <input type=time>). Supaya siswa yang scan persis di
// menit itu (mis. 07:15:30) masih dianggap tepat waktu, batasnya dianggap
// berlaku sampai akhir menit tsb (:59), bukan detik ke-0 saja.
function jamKeDetikBatas(jam) {
  const detik = jamKeDetik(jam);
  if (detik === null) return null;
  const adaDetik = jam.toString().trim().split(":").length > 2;
  return adaDetik ? detik : detik + 59;
}

function getJadwal() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_JADWAL);
  if (!sheet) return { success: true, jadwal: JADWAL_DEFAULT };

  const data = sheet.getDataRange().getValues();
  // Header: [0]Hari [1]JamMasuk [2]JamTerlambat [3]JamPulang
  const jadwal = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    jadwal[row[0].toString().trim()] = {
      jamMasuk: formatJamCell(row[1]),
      jamTerlambat: formatJamCell(row[2]),
      jamPulang: formatJamCell(row[3])
    };
  }
  // Lengkapi hari yang belum ada barisnya dengan default
  HARI_URUT.forEach(h => { if (!jadwal[h]) jadwal[h] = JADWAL_DEFAULT[h]; });
  return { success: true, jadwal: jadwal };
}

// Sheet bisa saja menyimpan jam sebagai objek Date (kalau diketik manual
// oleh guru di spreadsheet), jadi dinormalisasi ke string "HH:mm".
function formatJamCell(val) {
  if (val instanceof Date) return Utilities.formatDate(val, ZONA_WAKTU, "HH:mm");
  return val ? val.toString().trim() : "";
}

// data: JSON string { Senin:{jamMasuk,jamTerlambat,jamPulang}, ... }
function saveJadwal(pin, dataStr) {
  if (pin !== ADMIN_PIN) {
    return { success: false, message: "PIN admin salah." };
  }
  let parsed;
  try {
    parsed = JSON.parse(dataStr);
  } catch (err) {
    return { success: false, message: "Data jadwal tidak valid." };
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_JADWAL);
  if (!sheet) sheet = ss.insertSheet(SHEET_JADWAL);
  sheet.clear();
  sheet.appendRow(["Hari", "JamMasuk", "JamTerlambat", "JamPulang"]);
  sheet.setFrozenRows(1);

  HARI_URUT.forEach(hari => {
    const j = parsed[hari] || JADWAL_DEFAULT[hari];
    sheet.appendRow([hari, j.jamMasuk, j.jamTerlambat, j.jamPulang]);
  });
  sheet.getRange(2, 2, HARI_URUT.length, 3).setNumberFormat("@"); // simpan sebagai teks

  return { success: true, message: "Jadwal berhasil disimpan." };
}

// =================== DAFTAR KELAS (untuk dropdown admin) ===================
function getKelasList() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_SISWA);
  const data = sheet.getDataRange().getValues();
  const set = {};
  for (let i = 1; i < data.length; i++) {
    const kelas = data[i][3] ? data[i][3].toString().trim() : "";
    if (kelas) set[kelas] = true;
  }
  const kelasList = Object.keys(set).sort();
  return { success: true, kelasList: kelasList };
}

// =================== REKAP ABSENSI PER KELAS (untuk download) ===================
// tanggalMulai / tanggalAkhir bersifat opsional, format "yyyy-MM-dd".
// Dipakai admin untuk memfilter rekap berdasarkan tanggal tertentu,
// rentang bulan, atau rentang tahun (mis. "2025-01-01" s/d "2025-01-31"
// untuk sebulan penuh, atau "2025-01-01" s/d "2025-12-31" untuk setahun).
// Karena kolom Tanggal disimpan sebagai teks "yyyy-MM-dd", perbandingan
// string biasa sudah cukup akurat untuk filter rentang tanggal.
function getAbsensiByKelas(kelas, tanggalMulai, tanggalAkhir) {
  if (!kelas) return { success: false, message: "Kelas belum dipilih." };
  tanggalMulai = tanggalMulai ? tanggalMulai.toString().trim() : "";
  tanggalAkhir = tanggalAkhir ? tanggalAkhir.toString().trim() : "";

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ABSENSI);
  const data = sheet.getDataRange().getValues();
  // Header: [0]Timestamp [1]Tanggal [2]Jam [3]ID_Barcode [4]NIS [5]Nama [6]Kelas [7]Status [8]Foto_URL [9]Jenis

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const tglRow = row[1] ? row[1].toString().trim() : "";
    if (!row[6] || row[6].toString().trim() !== kelas.trim()) continue;
    if (tanggalMulai && tglRow < tanggalMulai) continue;
    if (tanggalAkhir && tglRow > tanggalAkhir) continue;

    rows.push({
      tanggal: tglRow,
      jam: row[2] ? row[2].toString() : "",
      nis: row[4],
      nama: row[5],
      kelas: row[6],
      status: row[7],
      jenis: row[9] ? row[9].toString().trim().toLowerCase() : "masuk"
    });
  }
  // Urutkan terbaru dulu
  rows.sort((a, b) => (a.tanggal + a.jam < b.tanggal + b.jam) ? 1 : -1);
  return { success: true, kelas: kelas, tanggalMulai: tanggalMulai, tanggalAkhir: tanggalAkhir, data: rows };
}

// =================== EDIT ABSENSI (ADMIN) ===================
// Cari baris absensi berdasarkan tanggal + NIS + jenis (masuk/pulang),
// lalu update kolom Jam & Status-nya saja. Kolom lain (nama, kelas, foto,
// dsb) tidak diubah karena tidak relevan untuk koreksi jam/status.
function updateAbsensi(pin, tanggal, nis, jenis, jam, status) {
  if (pin !== ADMIN_PIN) {
    return { success: false, message: "PIN admin salah." };
  }
  if (!tanggal || !nis || !jam || !status) {
    return { success: false, message: "Data tidak lengkap." };
  }
  jenis = (jenis || "masuk").toString().trim().toLowerCase();
  if (jenis !== "pulang") jenis = "masuk";

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ABSENSI);
    const data = sheet.getDataRange().getValues();
    // Header: [0]Timestamp [1]Tanggal [2]Jam [3]ID_Barcode [4]NIS [5]Nama [6]Kelas [7]Status [8]Foto_URL [9]Jenis

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const tglRow = row[1] ? row[1].toString().trim() : "";
      const nisRow = row[4] ? row[4].toString().trim() : "";
      const jenisRow = row[9] ? row[9].toString().trim().toLowerCase() : "masuk";

      if (tglRow === tanggal.toString().trim() && nisRow === nis.toString().trim() && jenisRow === jenis) {
        const rowIndex = i + 1; // baris di spreadsheet (1-indexed, +1 karena header)
        sheet.getRange(rowIndex, 3).setValue(jam.toString().trim());   // kolom C: Jam
        sheet.getRange(rowIndex, 3).setNumberFormat("@");
        sheet.getRange(rowIndex, 8).setValue(status.toString().trim()); // kolom H: Status
        return { success: true, message: "Data absensi berhasil diperbarui." };
      }
    }
    return { success: false, message: "Data absensi tidak ditemukan." };

  } catch (err) {
    return { success: false, message: "Gagal memperbarui data: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// =================== HAPUS ABSENSI (ADMIN) ===================
// Cari baris absensi berdasarkan tanggal + NIS + jenis, lalu hapus
// barisnya dari sheet. Hanya menghapus SATU baris yang paling cocok
// (biasanya cuma ada satu barus per kombinasi tanggal+nis+jenis karena
// submitAttendance() sudah mencegah duplikat).
function deleteAbsensi(pin, tanggal, nis, jenis) {
  if (pin !== ADMIN_PIN) {
    return { success: false, message: "PIN admin salah." };
  }
  if (!tanggal || !nis) {
    return { success: false, message: "Data tidak lengkap." };
  }
  jenis = (jenis || "masuk").toString().trim().toLowerCase();
  if (jenis !== "pulang") jenis = "masuk";

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ABSENSI);
    const data = sheet.getDataRange().getValues();
    // Header: [0]Timestamp [1]Tanggal [2]Jam [3]ID_Barcode [4]NIS [5]Nama [6]Kelas [7]Status [8]Foto_URL [9]Jenis

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const tglRow = row[1] ? row[1].toString().trim() : "";
      const nisRow = row[4] ? row[4].toString().trim() : "";
      const jenisRow = row[9] ? row[9].toString().trim().toLowerCase() : "masuk";

      if (tglRow === tanggal.toString().trim() && nisRow === nis.toString().trim() && jenisRow === jenis) {
        const rowIndex = i + 1; // baris di spreadsheet (1-indexed, +1 karena header)
        sheet.deleteRow(rowIndex);
        return { success: true, message: "Data absensi berhasil dihapus." };
      }
    }
    return { success: false, message: "Data absensi tidak ditemukan." };

  } catch (err) {
    return { success: false, message: "Gagal menghapus data: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * =================== SETUP AWAL SPREADSHEET ===================
 * Jalankan fungsi ini SEKALI dari editor Apps Script untuk
 * membuat struktur sheet otomatis (header + contoh baris).
 */
function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  let siswa = ss.getSheetByName(SHEET_SISWA);
  if (!siswa) siswa = ss.insertSheet(SHEET_SISWA);
  siswa.clear();
  siswa.appendRow(["ID_Barcode", "NIS", "Nama", "Kelas", "Foto_URL", "Status_Aktif"]);
  siswa.appendRow(["SISWA001", "2024001", "Contoh Nama Siswa", "X TKJ 1",
    "TEMPEL_ID_ATAU_LINK_FOTO_DARI_DRIVE", "Aktif"]);
  siswa.setFrozenRows(1);

  let absensi = ss.getSheetByName(SHEET_ABSENSI);
  if (!absensi) absensi = ss.insertSheet(SHEET_ABSENSI);
  absensi.clear();
  absensi.appendRow(["Timestamp", "Tanggal", "Jam", "ID_Barcode", "NIS", "Nama", "Kelas", "Status", "Foto_URL", "Jenis"]);
  absensi.setFrozenRows(1);

  let jadwal = ss.getSheetByName(SHEET_JADWAL);
  if (!jadwal) jadwal = ss.insertSheet(SHEET_JADWAL);
  jadwal.clear();
  jadwal.appendRow(["Hari", "JamMasuk", "JamTerlambat", "JamPulang"]);
  HARI_URUT.forEach(hari => {
    const j = JADWAL_DEFAULT[hari];
    jadwal.appendRow([hari, j.jamMasuk, j.jamTerlambat, j.jamPulang]);
  });
  jadwal.getRange(2, 2, HARI_URUT.length, 3).setNumberFormat("@");
  jadwal.setFrozenRows(1);

  SpreadsheetApp.getUi().alert("Setup selesai! Sheet 'Siswa', 'Absensi' & 'Jadwal' sudah siap dipakai.");
}
