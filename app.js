// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL      = 'https://rzmeitgcbcpctisxsxpq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6bWVpdGdjYmNwY3Rpc3hzeHBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMzU0NTIsImV4cCI6MjA4ODYxMTQ1Mn0.NJivuuKmq48in32Ruk5hcf5F3LbNa2jL8yjD8GVClj4';

// db diinisialisasi setelah supabase.js dimuat (script defer di HTML)
var db;
function initSupabase() {
  if (window.supabase && !db) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}

// ============ STATE ============
let DB = { bus: [], spbu: [], bbm: [], ops: [], akun: [] };
let editIdx = { bus: -1, spbu: -1, bbm: -1, ops: -1, akun: -1 };

let DB_STALE   = { bus: true, spbu: true, bbm: true, ops: true };
let DB_LOADING = { bus: false, spbu: false, bbm: false, ops: false, akun: false };
let DB_LOADING_PROMISE = { bus: null, spbu: null, bbm: null, ops: null, akun: null };

let currentUser = null;
let sidebarOpen = true;

const ALL_MODULES = [
  { id: 'bus',  label: 'Data Armada Bus' },
  { id: 'spbu', label: 'Data SPBU' },
  { id: 'bbm',  label: 'Logistik BBM' },
  { id: 'ops',  label: 'Operasional Harian' },
  { id: 'akun', label: 'Manajemen Akun' }
];
const ALL_ACTIONS = [
  { id: 'r', label: 'Read' },
  { id: 'w', label: 'Write/Edit' },
  { id: 'd', label: 'Delete' }
];

// ============================================================
// FIX #1 & #6 — LAZY-LOAD LIBRARY BESAR (XLSX & jsPDF)
// Hemat ~280KB JS parsing saat halaman pertama dimuat.
// Library hanya di-inject ke DOM saat tombol Export diklik.
// ============================================================
const CDN = {
  xlsx:  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
};
const _libLoaded = { xlsx: false, jspdf: false };

function loadLib(name) {
  return new Promise((resolve, reject) => {
    if (_libLoaded[name]) { resolve(); return; }
    var s = document.createElement('script');
    s.src = CDN[name];
    s.onload  = () => { _libLoaded[name] = true; resolve(); };
    s.onerror = () => reject(new Error('Gagal memuat library ' + name));
    document.head.appendChild(s);
  });
}

// ============================================================
// CACHE & FETCH DATA DARI SUPABASE
// ============================================================
async function safeFetchModule(moduleName, table, orderCol, forceRefetch) {
  forceRefetch = forceRefetch || false;
  if (!forceRefetch && !DB_STALE[moduleName] && DB[moduleName] && DB[moduleName].length > 0) {
    return DB[moduleName];
  }
  if (DB_LOADING[moduleName]) return DB_LOADING_PROMISE[moduleName];

  DB_LOADING[moduleName] = true;
  DB_LOADING_PROMISE[moduleName] = (async () => {
    try {
      let { data, error } = await db.from(table).select('*').order(orderCol, { ascending: true });
      if (error) throw error;
      DB[moduleName] = data || [];
      DB_STALE[moduleName] = false;
      return DB[moduleName];
    } catch (err) {
      console.error('Gagal memuat data ' + moduleName + ':', err.message);
      toast('Gagal memuat data ' + moduleName + ': ' + err.message, 'danger');
      return DB[moduleName] || [];
    } finally {
      DB_LOADING[moduleName] = false;
      DB_LOADING_PROMISE[moduleName] = null;
    }
  })();
  return DB_LOADING_PROMISE[moduleName];
}

function markStale() {
  var modules = Array.prototype.slice.call(arguments);
  modules.forEach(function(m) { if (DB_STALE[m] !== undefined) DB_STALE[m] = true; });
}

async function loadBus(force)  { return safeFetchModule('bus',  'tj_bus',  'nopol',     force); }
async function loadSpbu(force) { return safeFetchModule('spbu', 'tj_spbu', 'nama_spbu', force); }
async function loadBBM(force)  { return safeFetchModule('bbm',  'tj_bbm',  'tanggal',   force); }
async function loadOps(force)  { return safeFetchModule('ops',  'tj_ops',  'tanggal',   force); }

async function loadAkun() {
  try {
    let { data, error } = await db.from('akun').select('*').order('username', { ascending: true });
    if (error) throw error;
    DB.akun = data || [];
    return DB.akun;
  } catch (err) {
    console.error('Gagal memuat akun:', err.message);
    toast('Gagal memuat data akun!', 'danger');
    return [];
  }
}

// ============================================================
// AUTENTIKASI & CHECK PERMISSION
// ============================================================
async function handleLogin(e) {
  if (e) e.preventDefault();
  var u     = document.getElementById('login-user').value.trim();
  var p     = document.getElementById('login-pass').value;
  var errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!u || !p) { errEl.textContent = 'Username dan password wajib diisi!'; return; }
  try {
    let { data, error } = await db.from('akun').select('*').eq('username', u.toLowerCase()).single();
    if (error || !data) { errEl.textContent = 'Username tidak ditemukan!'; return; }
    if (data.password !== p) { errEl.textContent = 'Password salah!'; return; }
    currentUser = data;
    sessionStorage.setItem('tjUser', JSON.stringify(data));
    initSession();
  } catch (err) {
    errEl.textContent = 'Terjadi kesalahan sistem login.';
    console.error(err);
  }
}

function handleLogout() {
  sessionStorage.removeItem('tjUser');
  currentUser = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display   = 'none';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

function initSession() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display   = 'flex';
  document.getElementById('user-display-name').textContent = currentUser.nama;
  document.getElementById('user-display-role').textContent = currentUser.role.toUpperCase();
  applyMenuVisibility();
  switchPage('dashboard');
}

function hasPerm(module, action) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  if (!currentUser.permissions || !currentUser.permissions[module]) return false;
  return currentUser.permissions[module][action] === true;
}

function applyMenuVisibility() {
  ALL_MODULES.forEach(function(m) {
    var el = document.getElementById('menu-' + m.id);
    if (el) el.style.display = hasPerm(m.id, 'r') ? 'flex' : 'none';
  });
}

// ============================================================
// NAVIGATION & UI
// ============================================================
async function switchPage(pageId) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.sidebar-menu li').forEach(function(li) { li.classList.remove('active'); });

  var targetPage = document.getElementById('page-' + pageId);
  var targetMenu = document.getElementById('menu-' + pageId);
  if (targetPage) targetPage.classList.add('active');
  if (targetMenu) targetMenu.classList.add('active');

  // FIX #2: Baca innerWidth SEBELUM memanipulasi DOM — hindari forced reflow/layout thrashing
  var isMobile = window.innerWidth <= 900;
  if (isMobile) { sidebarOpen = false; applySidebarState(); }

  if (pageId === 'dashboard')      { await updateDashboard(); }
  if (pageId === 'data-bus')       { await loadBus();  renderBusTable(); }
  if (pageId === 'data-spbu')      { await loadSpbu(); renderSpbuTable(); }
  if (pageId === 'input-bbm')      { await loadBBM(); await loadSpbu(); await loadBus(); renderBbmTable(); }
  if (pageId === 'input-ops')      { await loadOps(); await loadBus(); renderOpsTable(); }
  if (pageId === 'manajemen-akun') {
    if (currentUser.role !== 'admin') {
      toast('Akses ditolak! Khusus admin.', 'danger');
      switchPage('dashboard');
      return;
    }
    await loadAkun();
    renderAkunTable();
  }
}

function toggleSidebar() { sidebarOpen = !sidebarOpen; applySidebarState(); }
function applySidebarState() {
  var sb   = document.getElementById('sidebar');
  var main = document.getElementById('main-content');
  // Hanya toggle class, tidak membaca properti geometri — aman dari forced reflow
  if (sidebarOpen) { sb.classList.remove('collapsed'); main.classList.remove('expanded'); }
  else             { sb.classList.add('collapsed');    main.classList.add('expanded'); }
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  var k = id.replace('modal-', '');
  if (editIdx[k] !== undefined) editIdx[k] = -1;
}

function toast(msg, type) {
  type = type || 'success';
  var container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  var t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle') + '"></i> <span>' + msg + '</span>';
  container.appendChild(t);
  setTimeout(function() { t.classList.add('show'); }, 10);
  setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }, 3500);
}

function setDateNow() {
  var now = new Date().toISOString().split('T')[0];
  ['bbm-tanggal', 'ops-tanggal', 'filter-bbm-tgl', 'filter-ops-tgl'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = now;
  });
}

// ============================================================
// MODULE 1: DATA ARMADA BUS
// ============================================================
function renderBusTable() {
  var list  = DB.bus;
  var q     = document.getElementById('search-bus').value.toLowerCase();
  var tbody = document.getElementById('table-bus-body');
  tbody.innerHTML = '';
  var filtered = list.filter(function(x) {
    return x.nopol.toLowerCase().includes(q) || x.lambung.toLowerCase().includes(q) || x.jenis.toLowerCase().includes(q);
  });
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Tidak ada data armada bus.</td></tr>'; return; }
  filtered.forEach(function(x, i) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i+1) + '</td><td><strong>' + x.nopol + '</strong></td><td><span class="badge-lambung">' + x.lambung + '</span></td><td>' + x.jenis + '</td><td class="action-cell"><button class="action-btn edit" onclick="editBusBtn(\'' + x.id + '\')" title="Ubah"><i class="fas fa-edit"></i></button><button class="action-btn delete" onclick="deleteBusBtn(\'' + x.id + '\')" title="Hapus"><i class="fas fa-trash-alt"></i></button></td>';
    tbody.appendChild(tr);
  });
}

function addBusBtn() {
  if (!hasPerm('bus', 'w')) { toast('Anda tidak memiliki izin menambah/mengubah data!', 'danger'); return; }
  editIdx.bus = -1;
  document.getElementById('modal-bus-title').textContent = 'Tambah Armada Bus';
  document.getElementById('bus-nopol').value   = '';
  document.getElementById('bus-lambung').value = '';
  document.getElementById('bus-jenis').value   = 'Medium Bus';
  openModal('modal-bus');
}

function editBusBtn(id) {
  if (!hasPerm('bus', 'w')) { toast('Anda tidak memiliki izin menambah/mengubah data!', 'danger'); return; }
  var idx = DB.bus.findIndex(function(x) { return x.id === id; }); if (idx < 0) return;
  editIdx.bus = idx; var x = DB.bus[idx];
  document.getElementById('modal-bus-title').textContent = 'Ubah Armada Bus';
  document.getElementById('bus-nopol').value   = x.nopol;
  document.getElementById('bus-lambung').value = x.lambung;
  document.getElementById('bus-jenis').value   = x.jenis;
  openModal('modal-bus');
}

async function saveBus() {
  var nopol   = document.getElementById('bus-nopol').value.trim().toUpperCase();
  var lambung = document.getElementById('bus-lambung').value.trim().toUpperCase();
  var jenis   = document.getElementById('bus-jenis').value;
  if (!nopol || !lambung) { toast('Nomor Polisi dan No. Lambung wajib diisi!', 'danger'); return; }
  var payload = { nopol, lambung, jenis };
  try {
    if (editIdx.bus < 0) {
      let { error } = await db.from('tj_bus').insert([payload]); if (error) throw error;
      toast('Armada bus berhasil ditambahkan!');
    } else {
      let { error } = await db.from('tj_bus').update(payload).eq('id', DB.bus[editIdx.bus].id); if (error) throw error;
      toast('Armada bus berhasil diperbarui!');
    }
    closeModal('modal-bus'); markStale('bus'); await loadBus(true); renderBusTable();
  } catch (err) { toast('Gagal menyimpan armada: ' + err.message, 'danger'); }
}

async function deleteBusBtn(id) {
  if (!hasPerm('bus', 'd')) { toast('Anda tidak memiliki izin menghapus data!', 'danger'); return; }
  if (!confirm('Apakah Anda yakin ingin menghapus armada bus ini?')) return;
  try {
    let { error } = await db.from('tj_bus').delete().eq('id', id); if (error) throw error;
    toast('Armada bus berhasil dihapus.'); markStale('bus'); await loadBus(true); renderBusTable();
  } catch (err) { toast('Gagal menghapus data: ' + err.message, 'danger'); }
}

// ============================================================
// MODULE 2: DATA SPBU
// ============================================================
function renderSpbuTable() {
  var list  = DB.spbu;
  var q     = document.getElementById('search-spbu').value.toLowerCase();
  var tbody = document.getElementById('table-spbu-body');
  tbody.innerHTML = '';
  var filtered = list.filter(function(x) { return x.nama_spbu.toLowerCase().includes(q) || x.lokasi.toLowerCase().includes(q); });
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Tidak ada data SPBU.</td></tr>'; return; }
  filtered.forEach(function(x, i) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i+1) + '</td><td><strong>' + x.nama_spbu + '</strong></td><td>' + (x.lokasi||'-') + '</td><td>' + (x.keterangan||'-') + '</td><td class="action-cell"><button class="action-btn edit" onclick="editSpbuBtn(\'' + x.id + '\')"><i class="fas fa-edit"></i></button><button class="action-btn delete" onclick="deleteSpbuBtn(\'' + x.id + '\')"><i class="fas fa-trash-alt"></i></button></td>';
    tbody.appendChild(tr);
  });
}

function addSpbuBtn() {
  if (!hasPerm('spbu', 'w')) { toast('Anda tidak memiliki izin penulisan!', 'danger'); return; }
  editIdx.spbu = -1;
  document.getElementById('modal-spbu-title').textContent = 'Tambah Data SPBU';
  document.getElementById('spbu-nama').value   = '';
  document.getElementById('spbu-lokasi').value = '';
  document.getElementById('spbu-ket').value    = '';
  openModal('modal-spbu');
}

function editSpbuBtn(id) {
  if (!hasPerm('spbu', 'w')) { toast('Anda tidak memiliki izin penulisan!', 'danger'); return; }
  var idx = DB.spbu.findIndex(function(x) { return x.id === id; }); if (idx < 0) return;
  editIdx.spbu = idx; var x = DB.spbu[idx];
  document.getElementById('modal-spbu-title').textContent = 'Ubah Data SPBU';
  document.getElementById('spbu-nama').value   = x.nama_spbu;
  document.getElementById('spbu-lokasi').value = x.lokasi;
  document.getElementById('spbu-ket').value    = x.keterangan;
  openModal('modal-spbu');
}

async function saveSpbu() {
  var nama   = document.getElementById('spbu-nama').value.trim();
  var lokasi = document.getElementById('spbu-lokasi').value.trim();
  var ket    = document.getElementById('spbu-ket').value.trim();
  if (!nama) { toast('Nama SPBU wajib diisi!', 'danger'); return; }
  var payload = { nama_spbu: nama, lokasi, keterangan: ket };
  try {
    if (editIdx.spbu < 0) {
      let { error } = await db.from('tj_spbu').insert([payload]); if (error) throw error;
      toast('Data SPBU ditambahkan.');
    } else {
      let { error } = await db.from('tj_spbu').update(payload).eq('id', DB.spbu[editIdx.spbu].id); if (error) throw error;
      toast('Data SPBU diperbarui.');
    }
    closeModal('modal-spbu'); markStale('spbu'); await loadSpbu(true); renderSpbuTable();
  } catch (err) { toast('Gagal menyimpan SPBU: ' + err.message, 'danger'); }
}

async function deleteSpbuBtn(id) {
  if (!hasPerm('spbu', 'd')) { toast('Anda tidak memiliki izin penghapusan!', 'danger'); return; }
  if (!confirm('Hapus data SPBU ini?')) return;
  try {
    let { error } = await db.from('tj_spbu').delete().eq('id', id); if (error) throw error;
    toast('SPBU terhapus.'); markStale('spbu'); await loadSpbu(true); renderSpbuTable();
  } catch (err) { toast('Gagal menghapus: ' + err.message, 'danger'); }
}

// ============================================================
// MODULE 3: LOGISTIK BBM
// ============================================================
function renderBbmTable() {
  var sSel = document.getElementById('bbm-spbu');
  sSel.innerHTML = '<option value="">-- Pilih SPBU --</option>';
  DB.spbu.forEach(function(s) { sSel.innerHTML += '<option value="' + s.id + '">' + s.nama_spbu + '</option>'; });

  var bSel = document.getElementById('bbm-bus');
  bSel.innerHTML = '<option value="">-- Pilih Bus (Opsional) --</option>';
  DB.bus.forEach(function(b) { bSel.innerHTML += '<option value="' + b.id + '">' + b.lambung + ' (' + b.nopol + ')</option>'; });

  var tbody = document.getElementById('table-bbm-body');
  tbody.innerHTML = '';
  var fTgl  = document.getElementById('filter-bbm-tgl').value;
  var fSpbu = document.getElementById('filter-bbm-spbu').value;

  var fSpbuEl = document.getElementById('filter-bbm-spbu');
  if (fSpbuEl.options.length <= 1) {
    DB.spbu.forEach(function(s) { fSpbuEl.innerHTML += '<option value="' + s.id + '">' + s.nama_spbu + '</option>'; });
    fSpbuEl.value = fSpbu;
  }

  var filtered = DB.bbm.filter(function(x) {
    return (fTgl  ? x.tanggal === fTgl  : true) && (fSpbu ? x.spbu_id === fSpbu : true);
  });
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Tidak ada rekaman logistik BBM pada filter ini.</td></tr>'; return; }

  filtered.forEach(function(x, i) {
    var sObj = DB.spbu.find(function(s) { return s.id === x.spbu_id; });
    var bObj = DB.bus.find(function(b) { return b.id === x.bus_id; });
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i+1) + '</td><td>' + x.tanggal + '</td><td><span class="badge-jenis-bbm ' + x.jenis_transaksi + '">' + (x.jenis_transaksi==='masuk'?'Masuk':'Keluar') + '</span></td><td><strong>' + (sObj?sObj.nama_spbu:'Unknown SPBU') + '</strong></td><td>' + (bObj?bObj.lambung:'-') + '</td><td class="text-right"><strong>' + x.liter.toLocaleString('id-ID') + ' L</strong></td><td><small class="text-muted">' + (x.keterangan||'-') + '</small></td><td class="action-cell"><button class="action-btn edit" onclick="editBbmBtn(\'' + x.id + '\')"><i class="fas fa-edit"></i></button><button class="action-btn delete" onclick="deleteBbmBtn(\'' + x.id + '\')"><i class="fas fa-trash-alt"></i></button></td>';
    tbody.appendChild(tr);
  });
}

function addBbmBtn() {
  if (!hasPerm('bbm', 'w')) { toast('Anda tidak berkepentingan menambah logistik BBM!', 'danger'); return; }
  editIdx.bbm = -1;
  document.getElementById('modal-bbm-title').textContent = 'Tambah Logistik BBM';
  setDateNow();
  document.getElementById('bbm-jenis').value = 'masuk';
  document.getElementById('bbm-spbu').value  = '';
  document.getElementById('bbm-bus').value   = '';
  document.getElementById('bbm-liter').value = '';
  document.getElementById('bbm-ket').value   = '';
  openModal('modal-bbm');
}

function editBbmBtn(id) {
  if (!hasPerm('bbm', 'w')) { toast('Anda tidak berkepentingan mengubah logistik BBM!', 'danger'); return; }
  var idx = DB.bbm.findIndex(function(x) { return x.id === id; }); if (idx < 0) return;
  editIdx.bbm = idx; var x = DB.bbm[idx];
  document.getElementById('modal-bbm-title').textContent = 'Ubah Logistik BBM';
  document.getElementById('bbm-tanggal').value = x.tanggal;
  document.getElementById('bbm-jenis').value   = x.jenis_transaksi;
  document.getElementById('bbm-spbu').value    = x.spbu_id || '';
  document.getElementById('bbm-bus').value     = x.bus_id  || '';
  document.getElementById('bbm-liter').value   = x.liter;
  document.getElementById('bbm-ket').value     = x.keterangan || '';
  openModal('modal-bbm');
}

async function saveBBM() {
  var tanggal    = document.getElementById('bbm-tanggal').value;
  var jenis      = document.getElementById('bbm-jenis').value;
  var spbu_id    = document.getElementById('bbm-spbu').value;
  var bus_id     = document.getElementById('bbm-bus').value || null;
  var liter      = parseFloat(document.getElementById('bbm-liter').value);
  var keterangan = document.getElementById('bbm-ket').value.trim();
  if (!tanggal || !spbu_id || isNaN(liter) || liter <= 0) { toast('Lengkapi kolom wajib dan volume liter harus positif!', 'danger'); return; }
  var payload = { tanggal, jenis_transaksi: jenis, spbu_id, bus_id, liter, keterangan, diinput_oleh: currentUser.username };
  try {
    if (editIdx.bbm < 0) {
      let { error } = await db.from('tj_bbm').insert([payload]); if (error) throw error;
      toast('Log BBM tersimpan.');
    } else {
      let { error } = await db.from('tj_bbm').update(payload).eq('id', DB.bbm[editIdx.bbm].id); if (error) throw error;
      toast('Log BBM diperbarui.');
    }
    closeModal('modal-bbm'); markStale('bbm'); await loadBBM(true); renderBbmTable();
  } catch (err) { toast('Gagal: ' + err.message, 'danger'); }
}

async function deleteBbmBtn(id) {
  if (!hasPerm('bbm', 'd')) { toast('Anda tidak memiliki otoritas hapus BBM!', 'danger'); return; }
  if (!confirm('Hapus transaksi BBM ini?')) return;
  try {
    let { error } = await db.from('tj_bbm').delete().eq('id', id); if (error) throw error;
    toast('Transaksi terhapus.'); markStale('bbm'); await loadBBM(true); renderBbmTable();
  } catch (err) { toast('Gagal: ' + err.message, 'danger'); }
}

// ============================================================
// MODULE 4: OPERASIONAL HARIAN
// ============================================================
function renderOpsTable() {
  var bSel = document.getElementById('ops-bus');
  bSel.innerHTML = '<option value="">-- Pilih Bus --</option>';
  DB.bus.forEach(function(b) { bSel.innerHTML += '<option value="' + b.id + '">' + b.lambung + ' (' + b.nopol + ')</option>'; });

  var tbody = document.getElementById('table-ops-body');
  tbody.innerHTML = '';
  var fTgl = document.getElementById('filter-ops-tgl').value;
  var filtered = DB.ops.filter(function(x) { return fTgl ? x.tanggal === fTgl : true; });
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="10" class="empty-row">Tidak ada rekaman operasional pada tanggal ini.</td></tr>'; return; }

  filtered.forEach(function(x, i) {
    var bObj       = DB.bus.find(function(b) { return b.id === x.bus_id; });
    var km_efektif = x.km_akhir - x.km_awal;
    var rasio      = x.liter_bbm > 0 ? (km_efektif / x.liter_bbm).toFixed(2) : '-';
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i+1) + '</td><td><strong>' + (bObj?bObj.lambung:'Unknown') + '</strong><br><small class="text-muted">' + (bObj?bObj.nopol:'') + '</small></td><td>' + (x.driver||'-') + '</td><td>' + (x.pramudi||'-') + '</td><td class="text-right">' + x.km_awal.toLocaleString('id-ID') + '</td><td class="text-right">' + x.km_akhir.toLocaleString('id-ID') + '</td><td class="text-right font-medium">' + km_efektif.toLocaleString('id-ID') + ' KM</td><td class="text-right font-medium text-success">' + x.liter_bbm + ' L</td><td class="text-center"><span class="badge-km-liter">' + rasio + ' km/L</span></td><td class="action-cell"><button class="action-btn edit" onclick="editOpsBtn(\'' + x.id + '\')"><i class="fas fa-edit"></i></button><button class="action-btn delete" onclick="deleteOpsBtn(\'' + x.id + '\')"><i class="fas fa-trash-alt"></i></button></td>';
    tbody.appendChild(tr);
  });
}

function addOpsBtn() {
  if (!hasPerm('ops', 'w')) { toast('Izin ditolak untuk menginput operasional!', 'danger'); return; }
  editIdx.ops = -1;
  document.getElementById('modal-ops-title').textContent = 'Input Operasional Harian';
  setDateNow();
  ['ops-bus','ops-driver','ops-pramudi','ops-kmawal','ops-kmakhir','ops-liter','ops-ket'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  openModal('modal-ops');
}

function editOpsBtn(id) {
  if (!hasPerm('ops', 'w')) { toast('Izin ditolak untuk mengubah data operasional!', 'danger'); return; }
  var idx = DB.ops.findIndex(function(x) { return x.id === id; }); if (idx < 0) return;
  editIdx.ops = idx; var x = DB.ops[idx];
  document.getElementById('modal-ops-title').textContent = 'Ubah Operasional Harian';
  document.getElementById('ops-tanggal').value = x.tanggal;
  document.getElementById('ops-bus').value     = x.bus_id;
  document.getElementById('ops-driver').value  = x.driver   || '';
  document.getElementById('ops-pramudi').value = x.pramudi  || '';
  document.getElementById('ops-kmawal').value  = x.km_awal;
  document.getElementById('ops-kmakhir').value = x.km_akhir;
  document.getElementById('ops-liter').value   = x.liter_bbm;
  document.getElementById('ops-ket').value     = x.keterangan || '';
  openModal('modal-ops');
}

async function saveOps() {
  var tanggal    = document.getElementById('ops-tanggal').value;
  var bus_id     = document.getElementById('ops-bus').value;
  var driver     = document.getElementById('ops-driver').value.trim();
  var pramudi    = document.getElementById('ops-pramudi').value.trim();
  var km_awal    = parseInt(document.getElementById('ops-kmawal').value);
  var km_akhir   = parseInt(document.getElementById('ops-kmakhir').value);
  var liter_bbm  = parseFloat(document.getElementById('ops-liter').value);
  var keterangan = document.getElementById('ops-ket').value.trim();
  if (!tanggal || !bus_id || isNaN(km_awal) || isNaN(km_akhir) || isNaN(liter_bbm)) { toast('Harap isi semua kolom wajib berangka!', 'danger'); return; }
  if (km_akhir < km_awal) { toast('KM Akhir tidak boleh lebih rendah dari KM Awal!', 'danger'); return; }
  var payload = { tanggal, bus_id, driver, pramudi, km_awal, km_akhir, liter_bbm, keterangan, diinput_oleh: currentUser.username };
  try {
    if (editIdx.ops < 0) {
      let { error } = await db.from('tj_ops').insert([payload]); if (error) throw error;
      toast('Data harian tersimpan.');
    } else {
      let { error } = await db.from('tj_ops').update(payload).eq('id', DB.ops[editIdx.ops].id); if (error) throw error;
      toast('Data harian diperbarui.');
    }
    closeModal('modal-ops'); markStale('ops'); await loadOps(true); renderOpsTable();
  } catch (err) { toast('Gagal: ' + err.message, 'danger'); }
}

async function deleteOpsBtn(id) {
  if (!hasPerm('ops', 'd')) { toast('Anda tidak mempunyai hak menghapus data operasional!', 'danger'); return; }
  if (!confirm('Hapus log operasional ini?')) return;
  try {
    let { error } = await db.from('tj_ops').delete().eq('id', id); if (error) throw error;
    toast('Terhapus.'); markStale('ops'); await loadOps(true); renderOpsTable();
  } catch (err) { toast('Gagal: ' + err.message, 'danger'); }
}

// ============================================================
// DASHBOARD & ANALYTICS
// ============================================================
async function updateDashboard() {
  await loadBus(); await loadBBM(); await loadOps();
  document.getElementById('dash-total-bus').textContent = DB.bus.length;

  var currMonth  = new Date().toISOString().substring(0, 7);
  var totalKM    = 0;
  var totalLiter = 0;
  DB.ops.forEach(function(x) {
    if (x.tanggal && x.tanggal.substring(0, 7) === currMonth) {
      totalKM    += (x.km_akhir - x.km_awal);
      totalLiter += x.liter_bbm;
    }
  });
  document.getElementById('dash-total-km').textContent = totalKM.toLocaleString('id-ID') + ' KM';

  var bbmTotalLiter = 0;
  DB.bbm.forEach(function(x) {
    if (x.tanggal && x.tanggal.substring(0, 7) === currMonth && x.jenis_transaksi === 'keluar') {
      bbmTotalLiter += x.liter;
    }
  });
  document.getElementById('dash-total-liter').textContent = Math.max(bbmTotalLiter, totalLiter).toLocaleString('id-ID') + ' L';
  document.getElementById('dash-avg-ratio').textContent   = (totalLiter > 0 ? (totalKM / totalLiter).toFixed(2) : '0.00') + ' km/L';
  renderRecentActivities();
}

function renderRecentActivities() {
  var listEl = document.getElementById('recent-activity-list');
  if (!listEl) return;
  var combined = [];
  DB.bbm.slice(-5).forEach(function(b) {
    combined.push({ tgl: b.tanggal, tipe: 'Logistik BBM', ket: (b.jenis_transaksi==='masuk'?'Pemasukan':'Pengeluaran') + ' BBM sebesar ' + b.liter + ' L', user: b.diinput_oleh||'system' });
  });
  DB.ops.slice(-5).forEach(function(o) {
    var bObj = DB.bus.find(function(bus) { return bus.id === o.bus_id; });
    combined.push({ tgl: o.tanggal, tipe: 'Operasional Harian', ket: 'Bus ' + (bObj?bObj.lambung:'-') + ' menempuh ' + (o.km_akhir - o.km_awal) + ' KM', user: o.diinput_oleh||'system' });
  });
  combined.sort(function(a, b) { return b.tgl.localeCompare(a.tgl); });
  var max5 = combined.slice(0, 5);
  listEl.innerHTML = max5.length > 0 ? max5.map(function(x) {
    return '<div class="activity-item"><div class="activity-badge"><i class="fas ' + (x.tipe.includes('BBM')?'fa-gas-pump':'fa-bus') + '"></i></div><div class="activity-details"><p><strong>' + x.tipe + '</strong> — ' + x.ket + '</p><span class="activity-time"><i class="far fa-calendar-alt"></i> ' + x.tgl + ' &nbsp;&bull;&nbsp; <i class="far fa-user"></i> ' + x.user + '</span></div></div>';
  }).join('') : '<div class="empty-state"><i class="fas fa-history"></i><p>Belum ada aktivitas</p></div>';
}

// ============================================================
// FIX #1 & #6 — EXPORT DENGAN LAZY-LOAD
// Library XLSX & jsPDF (~280KB total) tidak dimuat saat halaman
// pertama kali dibuka. Hanya di-inject saat tombol export diklik.
// Tombol menampilkan spinner selama library dimuat.
// ============================================================
async function exportToExcel(tableId, filename) {
  var btn = (typeof event !== 'undefined' && event) ? event.currentTarget : null;
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    await loadLib('xlsx');
    var table = document.getElementById(tableId);
    if (!table) { toast('Tabel data tidak ditemukan untuk diekspor!', 'danger'); return; }
    var clone = table.cloneNode(true);
    clone.querySelectorAll('.action-cell, th:last-child').forEach(function(el) { el.remove(); });
    var wb = XLSX.utils.table_to_book(clone, { sheet: 'Laporan TransJogja' });
    XLSX.writeFile(wb, filename + '_' + new Date().toISOString().split('T')[0] + '.xlsx');
    toast('Berkas Excel berhasil diunduh.');
  } catch (err) {
    toast('Gagal ekspor Excel: ' + err.message, 'danger');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-excel"></i> Excel'; }
  }
}

async function exportToPDF(tableId, titleText) {
  var btn = (typeof event !== 'undefined' && event) ? event.currentTarget : null;
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    await loadLib('jspdf');
    var jsPDF = window.jspdf.jsPDF;
    var doc   = new jsPDF('p', 'pt', 'a4');
    var table = document.getElementById(tableId);
    if (!table) { toast('Sumber data tabel tidak valid!', 'danger'); return; }

    doc.setFont('Helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(26, 77, 39);
    doc.text(titleText, 40, 50);
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
    doc.text('Dicetak pada: ' + new Date().toLocaleString('id-ID') + ' | User: ' + currentUser.nama, 40, 68);
    doc.line(40, 75, 555, 75);

    var thList  = table.querySelectorAll('th');
    var headers = [];
    var rows    = [];
    thList.forEach(function(th, idx) { if (idx < thList.length - 1) headers.push(th.innerText.trim()); });
    table.querySelectorAll('tbody tr').forEach(function(tr) {
      var data = []; var tds = tr.querySelectorAll('td');
      if (tds.length > 1) {
        tds.forEach(function(td, idx) { if (idx < tds.length - 1) data.push(td.innerText.replace('\n', ' ').trim()); });
        rows.push(data);
      }
    });

    var currentY = 95; var colWidth = 515 / headers.length;
    doc.setFontSize(9); doc.setFillColor(26, 77, 39);
    doc.rect(40, currentY, 515, 22, 'F');
    doc.setTextColor(255); doc.setFont('Helvetica', 'bold');
    headers.forEach(function(h, i) { doc.text(h, 45 + i * colWidth, currentY + 14); });
    currentY += 22; doc.setFont('Helvetica', 'normal'); doc.setTextColor(40);
    rows.forEach(function(row) {
      if (currentY > 780) { doc.addPage(); currentY = 50; }
      row.forEach(function(cell, i) { doc.text(cell, 45 + i * colWidth, currentY + 15); });
      doc.setDrawColor(230); doc.line(40, currentY + 22, 555, currentY + 22); currentY += 22;
    });
    doc.save('Laporan_' + titleText.replace(/\s+/g, '_') + '.pdf');
    toast('Dokumen PDF berhasil diterbitkan.');
  } catch (err) {
    toast('Gagal ekspor PDF: ' + err.message, 'danger');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-pdf"></i> PDF'; }
  }
}

// ============================================================
// MANAJEMEN AKUN (RBAC)
// ============================================================
function renderAkunTable() {
  var tbody = document.getElementById('table-akun-body');
  tbody.innerHTML = '';
  DB.akun.forEach(function(x, i) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i+1) + '</td><td><strong>' + x.nama + '</strong></td><td><code>' + x.username + '</code></td><td><span class="badge-role ' + x.role + '">' + x.role.toUpperCase() + '</span></td><td><small class="text-muted">' + (x.role==='admin'?'Full Akses Kontrol':JSON.stringify(x.permissions||{})) + '</small></td><td class="action-cell">' + (x.username==='admin'?'':'<button class="action-btn edit" onclick="editAkunBtn(\'' + x.id + '\')"><i class="fas fa-user-cog"></i></button><button class="action-btn delete" onclick="deleteAkunBtn(\'' + x.id + '\')"><i class="fas fa-user-minus"></i></button>') + '</td>';
    tbody.appendChild(tr);
  });
}

function renderPermGrid() {
  var grid = document.getElementById('perm-grid'); if (!grid) return;
  grid.innerHTML = '';
  var role = document.getElementById('akun-role').value;
  if (role === 'admin') { grid.innerHTML = '<div class="info-all-perm"><i class="fas fa-shield-alt"></i> Akun Administrator otomatis memiliki akses penuh ke seluruh sistem tanpa batasan.</div>'; return; }
  var html = '<div><strong>Modul / Halaman</strong></div>';
  ALL_ACTIONS.forEach(function(a) { html += '<div class="text-center"><strong>' + a.label + '</strong></div>'; });
  ALL_MODULES.forEach(function(m) {
    html += '<div>' + m.label + '</div>';
    ALL_ACTIONS.forEach(function(a) {
      var checked = '';
      if (editIdx.akun >= 0) {
        var ep = DB.akun[editIdx.akun].permissions;
        if (ep && ep[m.id] && ep[m.id][a.id]) checked = 'checked';
      } else {
        if (role === 'staf'  && a.id !== 'd') checked = 'checked';
        if (role === 'guest' && a.id === 'r') checked = 'checked';
      }
      html += '<div class="text-center"><input type="checkbox" class="perm-cb" data-mod="' + m.id + '" data-act="' + a.id + '" ' + checked + '></div>';
    });
  });
  grid.innerHTML = html;
}

function addAkunBtn() {
  editIdx.akun = -1;
  document.getElementById('modal-akun-title').textContent = 'Tambah Akun Pengguna';
  document.getElementById('akun-nama').value = '';
  document.getElementById('akun-username').value = '';
  document.getElementById('akun-username').disabled = false;
  document.getElementById('akun-password').value = '';
  document.getElementById('akun-password').placeholder = 'Min. 6 karakter';
  document.getElementById('akun-role').value = 'staf';
  renderPermGrid();
  openModal('modal-akun');
}

function editAkunBtn(id) {
  var idx = DB.akun.findIndex(function(x) { return x.id === id; }); if (idx < 0) return;
  editIdx.akun = idx; var x = DB.akun[idx];
  document.getElementById('modal-akun-title').textContent = 'Konfigurasi Hak Akses Akun';
  document.getElementById('akun-nama').value = x.nama;
  document.getElementById('akun-username').value = x.username;
  document.getElementById('akun-username').disabled = true;
  document.getElementById('akun-password').value = '';
  document.getElementById('akun-password').placeholder = '(Kosongkan jika tidak diganti)';
  document.getElementById('akun-role').value = x.role;
  renderPermGrid();
  openModal('modal-akun');
}

async function saveAkun() {
  var nama     = document.getElementById('akun-nama').value.trim();
  var username = document.getElementById('akun-username').value.trim().toLowerCase();
  var pass     = document.getElementById('akun-password').value;
  var role     = document.getElementById('akun-role').value;
  if (!nama || !username) { toast('Nama dan Username tidak boleh kosong!', 'danger'); return; }
  if (editIdx.akun < 0 && pass.length < 6) { toast('Akun baru wajib password minimal 6 karakter!', 'danger'); return; }

  var permissions = {};
  if (role !== 'admin') {
    ALL_MODULES.forEach(function(m) { permissions[m.id] = { r: false, w: false, d: false }; });
    document.querySelectorAll('.perm-cb').forEach(function(cb) {
      var m = cb.getAttribute('data-mod'); var a = cb.getAttribute('data-act');
      if (cb.checked) permissions[m][a] = true;
    });
  }
  var payload = { nama, username, role, permissions };
  if (pass) payload.password = pass;
  try {
    if (editIdx.akun < 0) {
      let { data: cek } = await db.from('akun').select('id').eq('username', username).maybeSingle();
      if (cek) { toast('Username sudah terpakai pengguna lain!', 'danger'); return; }
      let { error } = await db.from('akun').insert([payload]); if (error) throw error;
      toast('Akun baru berhasil didaftarkan.');
    } else {
      let { error } = await db.from('akun').update(payload).eq('id', DB.akun[editIdx.akun].id); if (error) throw error;
      toast('Profil dan Hak Akses Akun diperbarui.');
    }
    closeModal('modal-akun'); await loadAkun(); renderAkunTable();
    if (currentUser && currentUser.username === username) {
      let { data: freshUser } = await db.from('akun').select('*').eq('username', username).single();
      currentUser = freshUser;
      sessionStorage.setItem('tjUser', JSON.stringify(freshUser));
      applyMenuVisibility();
    }
  } catch (err) { toast('Gagal memproses manajemen akun: ' + err.message, 'danger'); }
}

async function deleteAkunBtn(id) {
  if (!confirm('Hapus akun pengguna ini secara permanen dari sistem?')) return;
  try {
    let { error } = await db.from('akun').delete().eq('id', id); if (error) throw error;
    toast('Akun berhasil dihapus dari sistem.'); await loadAkun(); renderAkunTable();
  } catch (err) { toast('Gagal menghapus akun: ' + err.message, 'danger'); }
}

async function refreshData() {
  var page = document.querySelector('.page.active');
  var id   = page ? page.id.replace('page-', '') : '';
  markStale('bus', 'spbu', 'bbm', 'ops');
  if (id === 'data-bus')  await loadBus(true);
  if (id === 'data-spbu') await loadSpbu(true);
  if (id === 'input-bbm') await loadBBM(true);
  if (id === 'input-ops') await loadOps(true);
  await updateDashboard();
  toast('Data diperbarui!');
}

// ============================================================
// INIT — DOMContentLoaded (script pakai defer di HTML)
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
  initSupabase();
  setDateNow();

  // FIX #2: Baca layout metric SATU KALI sebelum set class DOM
  sidebarOpen = window.innerWidth > 900;
  applySidebarState();

  document.querySelectorAll('.modal-overlay').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(m.id); });
  });

  var _maEl = document.getElementById('modal-akun');
  if (_maEl) _maEl.addEventListener('transitionend', function () {
    if (this.classList.contains('open') && editIdx.akun < 0) renderPermGrid();
  });

  var savedUser = sessionStorage.getItem('tjUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    initSession();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-screen').style.display   = 'none';
  }
});
