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
var DB_FILTER = { bus: null, spbu: null, bbm: null, ops: null, akun: null };

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

async function loadBus(force)  { return safeFetchModule('bus',  'bus',  'nopol',     force); }
async function loadSpbu(force) { return safeFetchModule('spbu', 'spbu', 'nama', force); }
async function loadBBM(force)  { return safeFetchModule('bbm',  'bbm',  'tgl',   force); }
async function loadOps(force)  { return safeFetchModule('ops',  'operasional',  'tgl',   force); }

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
  // Laporan pages — load data dulu jika belum
  if (pageId === 'lap-bbm-waktu') { await loadBBM(); await loadSpbu(); populateSpbuFilter(); }
  if (pageId === 'lap-bbm')       { await loadBBM(); await loadBus(); populateLambFilter('lb-lamb'); }
  if (pageId === 'lap-ops')       { await loadOps(); await loadBus(); populateLambFilter('lo-lamb'); }
  if (pageId === 'lap-gabungan')  { await loadBBM(); await loadOps(); await loadBus(); populateLapGabFilter(); }
  if (pageId === 'lap-harian')    { await loadBBM(); await loadOps(); }
  if (pageId === 'lap-efisiensi') { await loadBBM(); await loadOps(); }
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
      let { error } = await db.from('bus').insert([payload]); if (error) throw error;
      toast('Armada bus berhasil ditambahkan!');
    } else {
      let { error } = await db.from('bus').update(payload).eq('id', DB.bus[editIdx.bus].id); if (error) throw error;
      toast('Armada bus berhasil diperbarui!');
    }
    closeModal('modal-bus'); markStale('bus'); await loadBus(true); renderBusTable();
  } catch (err) { toast('Gagal menyimpan armada: ' + err.message, 'danger'); }
}

async function deleteBusBtn(id) {
  if (!hasPerm('bus', 'd')) { toast('Anda tidak memiliki izin menghapus data!', 'danger'); return; }
  if (!confirm('Apakah Anda yakin ingin menghapus armada bus ini?')) return;
  try {
    let { error } = await db.from('bus').delete().eq('id', id); if (error) throw error;
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
  var filtered = list.filter(function(x) { return x.nama.toLowerCase().includes(q) || ( x.alamat||'').toLowerCase().includes(q); });
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Tidak ada data SPBU.</td></tr>'; return; }
  filtered.forEach(function(x, i) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i+1) + '</td><td><strong>' + x.nama + '</strong></td><td>' + (x.alamat||'-') + '</td><td>' + (x.ket||'-') + '</td><td class="action-cell"><button class="action-btn edit" onclick="editSpbuBtn(\'' + x.id + '\')"><i class="fas fa-edit"></i></button><button class="action-btn delete" onclick="deleteSpbuBtn(\'' + x.id + '\')"><i class="fas fa-trash-alt"></i></button></td>';
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
  document.getElementById('spbu-nama').value   = x.nama;
  document.getElementById('spbu-lokasi').value = x.alamat;
  document.getElementById('spbu-ket').value    = x.ket;
  openModal('modal-spbu');
}

async function saveSpbu() {
  var nama   = document.getElementById('spbu-nama').value.trim();
  var alamat = document.getElementById('spbu-lokasi').value.trim();
  var ket    = document.getElementById('spbu-ket').value.trim();
  if (!nama) { toast('Nama SPBU wajib diisi!', 'danger'); return; }
  var payload = { nama: nama, alamat: alamat, ket: ket };
  try {
    if (editIdx.spbu < 0) {
      let { error } = await db.from('spbu').insert([payload]); if (error) throw error;
      toast('Data SPBU ditambahkan.');
    } else {
      let { error } = await db.from('spbu').update(payload).eq('id', DB.spbu[editIdx.spbu].id); if (error) throw error;
      toast('Data SPBU diperbarui.');
    }
    closeModal('modal-spbu'); markStale('spbu'); await loadSpbu(true); renderSpbuTable();
  } catch (err) { toast('Gagal menyimpan SPBU: ' + err.message, 'danger'); }
}

async function deleteSpbuBtn(id) {
  if (!hasPerm('spbu', 'd')) { toast('Anda tidak memiliki izin penghapusan!', 'danger'); return; }
  if (!confirm('Hapus data SPBU ini?')) return;
  try {
    let { error } = await db.from('spbu').delete().eq('id', id); if (error) throw error;
    toast('SPBU terhapus.'); markStale('spbu'); await loadSpbu(true); renderSpbuTable();
  } catch (err) { toast('Gagal menghapus: ' + err.message, 'danger'); }
}

// ============================================================
// MODULE 3: LOGISTIK BBM
// ============================================================
function renderBbmTable() {
  var sSel = document.getElementById('bbm-spbu');
  sSel.innerHTML = '<option value="">-- Pilih SPBU --</option>';
  DB.spbu.forEach(function(s) { sSel.innerHTML += '<option value="' + s.nama + '">' + s.nama + '</option>'; });

  var bSel = document.getElementById('bbm-bus');
  bSel.innerHTML = '<option value="">-- Pilih Bus (Opsional) --</option>';
  DB.bus.forEach(function(b) { bSel.innerHTML += '<option value="' + b.lambung + '">' + b.lambung + ' (' + b.nopol + ')</option>'; });

  var tbody = document.getElementById('table-bbm-body');
  tbody.innerHTML = '';
  var fTgl  = document.getElementById('filter-bbm-tgl').value;
  var fSpbu = document.getElementById('filter-bbm-spbu').value;

  var fSpbuEl = document.getElementById('filter-bbm-spbu');
  if (fSpbuEl.options.length <= 1) {
    DB.spbu.forEach(function(s) { fSpbuEl.innerHTML += '<option value="' + s.nama + '">' + s.nama + '</option>'; });
    fSpbuEl.value = fSpbu;
  }

  var filtered = DB.bbm.filter(function(x) {
    return (fTgl  ? x.tgl === fTgl  : true) && (fSpbu ? x.spbu === fSpbu : true);
  });
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Tidak ada rekaman logistik BBM pada filter ini.</td></tr>'; return; }

  filtered.forEach(function(x, i) {
    // spbu stored as name string directly
    var bObj = DB.bus.find(function(b) { return b.lambung === x.lambung; });
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i+1) + '</td><td>' + x.tgl + '</td><td><span class="badge-jenis-bbm">' + (x.jalur||'-') + '</span></td><td><strong>' + (x.spbu||'-') + '</strong></td><td>' + (bObj?bObj.lambung:'-') + '</td><td class="text-right"><strong>' + x.nominal.toLocaleString('id-ID') + ' L</strong></td><td><small class="text-muted">' + (x.ket||'-') + '</small></td><td class="action-cell"><button class="action-btn edit" onclick="editBbmBtn(\'' + x.id + '\')"><i class="fas fa-edit"></i></button><button class="action-btn delete" onclick="deleteBbmBtn(\'' + x.id + '\')"><i class="fas fa-trash-alt"></i></button></td>';
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
  document.getElementById('bbm-tanggal').value = x.tgl;
  document.getElementById('bbm-jenis').value = x.jalur||'';
  document.getElementById('bbm-spbu').value = x.spbu||'';
  document.getElementById('bbm-bus').value = x.lambung||'';
  document.getElementById('bbm-liter').value = x.nominal;
  document.getElementById('bbm-ket').value     = x.ket || '';
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
  // Map to Supabase columns
  var busObj = bus_id ? DB.bus.find(function(b){ return b.lambung === bus_id; }) : null;
  var payload = { tgl: tanggal, jalur: jenis, spbu: spbu_id, lambung: busObj ? busObj.lambung : null, nopol: busObj ? busObj.nopol : null, nominal: liter, ket: keterangan };
  try {
    if (editIdx.bbm < 0) {
      let { error } = await db.from('bbm').insert([payload]); if (error) throw error;
      toast('Log BBM tersimpan.');
    } else {
      let { error } = await db.from('bbm').update(payload).eq('id', DB.bbm[editIdx.bbm].id); if (error) throw error;
      toast('Log BBM diperbarui.');
    }
    closeModal('modal-bbm'); markStale('bbm'); await loadBBM(true); renderBbmTable();
  } catch (err) { toast('Gagal: ' + err.message, 'danger'); }
}

async function deleteBbmBtn(id) {
  if (!hasPerm('bbm', 'd')) { toast('Anda tidak memiliki otoritas hapus BBM!', 'danger'); return; }
  if (!confirm('Hapus transaksi BBM ini?')) return;
  try {
    let { error } = await db.from('bbm').delete().eq('id', id); if (error) throw error;
    toast('Transaksi terhapus.'); markStale('bbm'); await loadBBM(true); renderBbmTable();
  } catch (err) { toast('Gagal: ' + err.message, 'danger'); }
}

// ============================================================
// MODULE 4: OPERASIONAL HARIAN
// ============================================================
function renderOpsTable() {
  var bSel = document.getElementById('ops-bus');
  bSel.innerHTML = '<option value="">-- Pilih Bus --</option>';
  DB.bus.forEach(function(b) { bSel.innerHTML += '<option value="' + b.lambung + '">' + b.lambung + ' (' + b.nopol + ')</option>'; });

  var tbody = document.getElementById('table-ops-body');
  tbody.innerHTML = '';
  var fTgl = document.getElementById('filter-ops-tgl').value;
  var filtered = DB.ops.filter(function(x) { return fTgl ? x.tgl === fTgl : true; });
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="10" class="empty-row">Tidak ada rekaman operasional pada tanggal ini.</td></tr>'; return; }

  filtered.forEach(function(x, i) {
    var bObj = DB.bus.find(function(b) { return b.lambung === x.lambung; });
    var km_efektif = (x.km_akhir_pool||0) - (x.km_awal_pool||0);
    var rasio      = x.bbm_rp > 0 ? (km_efektif / (x.bbm_rp/6800)).toFixed(2) : '-';
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i+1) + '</td><td><strong>' + (bObj?bObj.lambung:'Unknown') + '</strong><br><small class="text-muted">' + (bObj?bObj.nopol:'') + '</small></td><td>' + ('-') + '</td><td>' + (x.ket||'-') + '</td><td class="text-right">' + ( x.km_awal_pool||0).toLocaleString('id-ID') + '</td><td class="text-right">' + (x.km_akhir_pool||0).toLocaleString('id-ID') + '</td><td class="text-right font-medium">' + km_efektif.toLocaleString('id-ID') + ' KM</td><td class="text-right font-medium text-success">' + (x.bbm_rp ? (x.bbm_rp/6800).toFixed(1) : '-') + ' L</td><td class="text-center"><span class="badge-km-liter">' + rasio + ' km/L</span></td><td class="action-cell"><button class="action-btn edit" onclick="editOpsBtn(\'' + x.id + '\')"><i class="fas fa-edit"></i></button><button class="action-btn delete" onclick="deleteOpsBtn(\'' + x.id + '\')"><i class="fas fa-trash-alt"></i></button></td>';
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
  document.getElementById('ops-tanggal').value = x.tgl;
  document.getElementById('ops-bus').value = x.lambung||'';
  document.getElementById('ops-driver').value  = x.driver   || '';
  document.getElementById('ops-pramudi').value = x.ket||''; // pramudi not in schema, stored in ket
  document.getElementById('ops-kmawal').value = x.km_awal_pool||'';
  document.getElementById('ops-kmakhir').value = x.km_akhir_pool||'';
  document.getElementById('ops-liter').value = x.bbm_rp ? (x.bbm_rp/6800).toFixed(1) : '';
  document.getElementById('ops-ket').value     = x.ket || '';
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
  var busObjOps = DB.bus.find(function(b){ return b.lambung === bus_id || b.id === bus_id; });
  var km_tempuh = km_akhir - km_awal;
  var payload = { tgl: tanggal, lambung: busObjOps ? busObjOps.lambung : bus_id, nopol: busObjOps ? busObjOps.nopol : null, jalur: busObjOps ? busObjOps.jalur : null, km_awal_pool: km_awal, km_akhir_pool: km_akhir, km_tempuh: km_tempuh, bbm_rp: Math.round(liter_bbm * 6800), rit: 0, ket: keterangan };
  try {
    if (editIdx.ops < 0) {
      let { error } = await db.from('operasional').insert([payload]); if (error) throw error;
      toast('Data harian tersimpan.');
    } else {
      let { error } = await db.from('operasional').update(payload).eq('id', DB.ops[editIdx.ops].id); if (error) throw error;
      toast('Data harian diperbarui.');
    }
    closeModal('modal-ops'); markStale('ops'); await loadOps(true); renderOpsTable();
  } catch (err) { toast('Gagal: ' + err.message, 'danger'); }
}

async function deleteOpsBtn(id) {
  if (!hasPerm('ops', 'd')) { toast('Anda tidak mempunyai hak menghapus data operasional!', 'danger'); return; }
  if (!confirm('Hapus log operasional ini?')) return;
  try {
    let { error } = await db.from('operasional').delete().eq('id', id); if (error) throw error;
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
    if (x.tgl && x.tgl.substring(0, 7) === currMonth) {
      totalKM += ((x.km_akhir_pool||0) - (x.km_awal_pool||0));
      totalLiter += x.bbm_rp ? x.bbm_rp/6800 : 0;
    }
  });
  document.getElementById('dash-total-km').textContent = totalKM.toLocaleString('id-ID') + ' KM';

  var bbmTotalLiter = 0;
  DB.bbm.forEach(function(x) {
    if (x.tgl && x.tgl.substring(0, 7) === currMonth) {
      bbmTotalLiter += x.nominal ? Number(x.nominal) : 0;
    }
  });
  document.getElementById('dash-total-liter').textContent = Math.max(bbmTotalLiter, totalLiter).toLocaleString('id-ID') + ' L';
  document.getElementById('dash-avg-ratio').textContent   = (totalLiter > 0 ? (totalKM / totalLiter).toFixed(2) : '0.00') + ' km/L';

  // Bar chart BBM 7 hari terakhir
  var days = [];
  for (var i = 6; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().split('T')[0]); }
  var chart = document.getElementById('chart-bbm');
  if (chart) {
    var cnts = days.map(function(day) {
      return DB.bbm.filter(function(r) { return String(r.tgl||'').substring(0,10) === day; }).length;
    });
    var mx = Math.max.apply(null, cnts.concat([1]));
    if (cnts.some(function(c){ return c > 0; })) {
      chart.style.display = 'flex';
      chart.innerHTML = cnts.map(function(c, i) {
        return '<div class="bar-wrap"><div class="bar-val">' + c + '</div><div class="bar" style="height:' + Math.max((c/mx)*100, 4) + '%"></div><div class="bar-label">' + days[i].slice(5) + '</div></div>';
      }).join('');
    }
  }

  renderRecentActivities();
}

function renderRecentActivities() {
  var listEl = document.getElementById('recent-activity-list');
  if (!listEl) return;
  var combined = [];
  DB.bbm.slice(-5).forEach(function(b) {
    combined.push({ tgl: b.tgl, tipe: 'Logistik BBM', ket: 'Pengisian BBM ' + (b.nominal||0) + ' Rp di ' + (b.spbu||'-'), user: 'system' });
  });
  DB.ops.slice(-5).forEach(function(o) {
    var bObj = DB.bus.find(function(bus) { return bus.lambung === o.lambung; });
    combined.push({ tgl: o.tgl, tipe: 'Operasional Harian', ket: 'Bus ' + (o.lambung||'-') + ' menempuh ' + ((o.km_akhir_pool||0)-(o.km_awal_pool||0)) + ' KM', user: o.ket||'system' });
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
  // Refresh laporan jika sedang di halaman laporan
  if (id.startsWith('lap-')) { await loadBBM(true); await loadOps(true); }
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

// ============================================================
// FREEZE KOLOM TABEL (helper untuk laporan)
// ============================================================
function applyFreeze(tableId) {
  var tbl = tableId ? document.getElementById(tableId) : null;
  var tables = tbl ? [tbl] : document.querySelectorAll('.table-outer table');
  tables.forEach(function(t) {
    // Freeze th pertama (pojok kiri atas)
    var firstTh = t.querySelector('thead tr th:first-child');
    if (firstTh) firstTh.classList.add('col-freeze-head');
    // Freeze td pertama setiap baris
    t.querySelectorAll('tbody tr').forEach(function(tr) {
      var td = tr.querySelector('td:first-child');
      if (td) td.classList.add('col-freeze');
    });
  });
}

// ============================================================
// FETCH ALL — Supabase default limit 1000, ini ambil semua halaman
// ============================================================
async function fetchAll(table, orderCol, orderAsc, orderCol2, orderAsc2) {
  var allData = [];
  var pageSize = 1000;
  var from = 0;
  while (true) {
    var q = db.from(table).select('*').order(orderCol, { ascending: orderAsc });
    if (orderCol2) q = q.order(orderCol2, { ascending: orderAsc2 !== false });
    q = q.range(from, from + pageSize - 1);
    var r = await q;
    if (r.error) return { data: null, error: r.error };
    allData = allData.concat(r.data);
    if (r.data.length < pageSize) break;
    from += pageSize;
  }
  return { data: allData, error: null };
}

// ============================================================
// BUS
// ============================================================
// ============================================================
// LAPORAN & EXPORT — dari Mode Komplit
// ============================================================
function filterTable(tableId, keyword) {
  var kw = keyword.trim().toLowerCase();

  var keyMap = { 'tbl-bus':'bus', 'tbl-spbu':'spbu', 'tbl-bbm':'bbm', 'tbl-ops':'ops', 'tbl-akun':'akun' };
  var renderMap = {
    'tbl-bus':  function(){ renderBusTable(); },
    'tbl-spbu': function(){ renderSpbuTable(); },
    'tbl-bbm':  function(){ renderBbmTable(); },
    'tbl-ops':  function(){ renderOpsTable(); },
    'tbl-akun': function(){ renderAkunTable(); }
  };

  var key = keyMap[tableId];
  if (!key || !renderMap[tableId]) return;

  if (!kw) {
    // Kosong: hapus filter, pakai DB asli
    DB_FILTER[key] = null;
  } else {
    // Simpan hasil filter ke DB_FILTER, JANGAN timpa DB[key]
    DB_FILTER[key] = DB[key].filter(function(r) {
      return Object.values(r).some(function(v) {
        return v !== null && v !== undefined && String(v).toLowerCase().includes(kw);
      });
    });
  }

  renderMap[tableId]();
  applyFreeze(tableId);
}
function populateSpbuFilter() {
  var sel=document.getElementById('lw-spbu');if(!sel)return;
  sel.innerHTML='<option value="">Semua SPBU</option>'+DB.spbu.map(function(s){return'<option value="'+s.nama+'">'+s.nama+'</option>';}).join('');
}
function populateLambFilter(selId) {
  var sel=document.getElementById(selId);if(!sel)return;
  sel.innerHTML='<option value="">Semua Lambung</option>'+DB.bus.map(function(b){return'<option value="'+b.lambung+'">'+b.lambung+'</option>';}).join('');
}
function generateLapWaktu() {
  var tglMulai=document.getElementById('lw-tgl-mulai').value,tglAkhir=document.getElementById('lw-tgl-akhir').value;
  var jamMulai=document.getElementById('lw-jam-mulai').value||'05:00',jamAkhir=document.getElementById('lw-jam-akhir').value||'22:00';
  var spbuF=document.getElementById('lw-spbu').value;
  var data=DB.bbm.slice();
  if(tglMulai)data=data.filter(function(r){return r.tgl>=tglMulai;});if(tglAkhir)data=data.filter(function(r){return r.tgl<=tglAkhir;});
  if(spbuF)data=data.filter(function(r){return r.spbu===spbuF;});
  var jamOps=data.filter(function(r){return r.waktu&&r.waktu>=jamMulai&&r.waktu<=jamAkhir;});
  var sblm=data.filter(function(r){return r.waktu&&r.waktu<jamMulai;}),atas=data.filter(function(r){return r.waktu&&r.waktu>jamAkhir;});
  var el=document.getElementById('result-lap-waktu');
  if(!data.length){el.innerHTML='<div class="card"><div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada data</p></div></div>';return;}
  el.innerHTML='<div class="report-summary"><div class="sum-card"><div class="val">'+data.length+'</div><div class="lbl">Total</div></div><div class="sum-card"><div class="val">'+jamOps.length+'</div><div class="lbl">Jam Operasional</div></div><div class="sum-card"><div class="val">'+sblm.length+'</div><div class="lbl">Sebelum</div></div><div class="sum-card"><div class="val">'+atas.length+'</div><div class="lbl">Setelah</div></div></div><div class="card"><div class="card-header"><div class="card-title">Detail Pengisian BBM</div></div><div class="tabs"><button class="tab active" onclick="showWaktuTab(this,\'tab-jam\')">Jam Operasional ('+jamOps.length+')</button><button class="tab" onclick="showWaktuTab(this,\'tab-sblm\')">Sebelum ('+sblm.length+')</button><button class="tab" onclick="showWaktuTab(this,\'tab-atas\')">Setelah ('+atas.length+')</button></div><div id="tab-jam">'+renderBBMRows(jamOps)+'</div><div id="tab-sblm" style="display:none">'+renderBBMRows(sblm)+'</div><div id="tab-atas" style="display:none">'+renderBBMRows(atas)+'</div></div>';
}
function showWaktuTab(btn,tabId) {
  btn.closest('.card').querySelectorAll('.tabs .tab').forEach(function(t){t.classList.remove('active');});btn.classList.add('active');
  ['tab-jam','tab-sblm','tab-atas'].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display=id===tabId?'':'none';});
}
function renderBBMRows(rows) {
  if(!rows.length)return'<div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada data</p></div>';
  return'<div class="table-outer"><table><thead><tr><th>Tanggal</th><th>Lambung</th><th>Jalur</th><th>No Polisi</th><th>Waktu</th><th>Nominal</th><th>SPBU</th><th>Halte</th></tr></thead><tbody>'+rows.map(function(r){return'<tr><td>'+r.tgl+'</td><td>'+r.lambung+'</td><td>'+r.jalur+'</td><td>'+r.nopol+'</td><td>'+(r.waktu||'-')+'</td><td>Rp '+Number(r.nominal).toLocaleString()+'</td><td>'+(r.spbu||'-')+'</td><td>'+(r.halte||'-')+'</td></tr>';}).join('')+'</tbody></table></div>';
}
function generateLapBBM() {
  var tglM=document.getElementById('lb-tgl-mulai').value,tglA=document.getElementById('lb-tgl-akhir').value,lambF=document.getElementById('lb-lamb').value;
  var data=DB.bbm.slice();if(tglM)data=data.filter(function(r){return String(r.tgl).substring(0,10)>=tglM;});if(tglA)data=data.filter(function(r){return String(r.tgl).substring(0,10)<=tglA;});if(lambF)data=data.filter(function(r){return String(r.lambung).trim()===lambF;});
  var el=document.getElementById('result-lap-bbm');
  if(!data.length){el.innerHTML='<div class="card"><div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada data</p></div></div>';return;}
  data=data.map(function(r){r.tgl=String(r.tgl).substring(0,10);r.lambung=String(r.lambung).trim();return r;});var lambs=[...new Set(data.map(function(r){return r.lambung;}))].sort(),dates=[...new Set(data.map(function(r){return r.tgl;}))].sort();
  var tot=data.reduce(function(s,r){return s+Number(r.nominal);},0);
  var html='<div class="card"><div class="card-header"><div class="card-title">Laporan BBM Harian</div></div><div class="table-outer"><table><thead><tr><th class="freeze-col">Lambung</th>'+dates.map(function(d){return'<th>'+d+'</th>';}).join('')+'<th>TOTAL</th></tr></thead><tbody>';
  lambs.forEach(function(lamb){var rowTot=0;html+='<tr><td class="freeze-col" style="position:sticky;left:0;background:#fff;z-index:2;"><strong>'+lamb+'</strong></td>';dates.forEach(function(d){var s=data.filter(function(r){return r.lambung===lamb&&r.tgl===d;}).reduce(function(a,r){return a+Number(r.nominal);},0);rowTot+=s;html+='<td>'+(s?'Rp '+s.toLocaleString():'-')+'</td>';});html+='<td><strong>Rp '+rowTot.toLocaleString()+'</strong></td></tr>';});
  html+='<tr style="background:var(--green-pale);border-top:2px solid var(--green-main);"><td class="freeze-col" style="position:sticky;left:0;background:var(--green-pale);z-index:2;"><strong style="color:var(--green-dark);">TOTAL</strong></td>';dates.forEach(function(d){var s=data.filter(function(r){return r.tgl===d;}).reduce(function(a,r){return a+Number(r.nominal);},0);html+='<td><strong style="color:var(--green-dark);">Rp '+s.toLocaleString()+'</strong></td>';});
  html+='<td><strong style="color:var(--green-dark);">Rp '+tot.toLocaleString()+'</strong></td></tr></tbody></table></div></div>';
  el.innerHTML=html;
  setTimeout(applyFreeze,10);
}
function generateLapOps() {
  var tglM=document.getElementById('lo-tgl-mulai').value,tglA=document.getElementById('lo-tgl-akhir').value,lambF=document.getElementById('lo-lamb').value;
  var data=DB.ops.slice();if(tglM)data=data.filter(function(r){return String(r.tgl).substring(0,10)>=tglM;});if(tglA)data=data.filter(function(r){return String(r.tgl).substring(0,10)<=tglA;});if(lambF)data=data.filter(function(r){return String(r.lambung).trim()===lambF;});
  var el=document.getElementById('result-lap-ops');
  if(!data.length){el.innerHTML='<div class="card"><div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada data</p></div></div>';return;}
  var lambs=[...new Set(data.map(function(r){return r.lambung;}))].sort();
  var rows=lambs.map(function(lamb){var items=data.filter(function(r){return r.lambung===lamb;});var jalur=items[0]?items[0].jalur:'-';var totalJam=items.reduce(function(s,r){return s+(Number(r.km_tempuh)||0);},0);var totalBBM=items.reduce(function(s,r){return s+(Number(r.bbm_rp)||0);},0);var totalRit=items.reduce(function(s,r){return s+(Number(r.rit)||0);},0);var liter=totalBBM/6800;var ratio=liter>0?(totalJam/liter).toFixed(2):'-';return{lamb:lamb,jalur:jalur,totalJam:totalJam,totalBBM:totalBBM,liter:liter.toFixed(2),ratio:ratio,totalRit:totalRit};});
  var gBBM=rows.reduce(function(s,r){return s+r.totalBBM;},0),gRit=rows.reduce(function(s,r){return s+r.totalRit;},0);
  el.innerHTML='<div class="card"><div class="card-header"><div class="card-title">Rekapitulasi Operasional</div></div><div class="report-summary"><div class="sum-card"><div class="val">'+rows.length+'</div><div class="lbl">Lambung</div></div><div class="sum-card"><div class="val">'+gRit+'</div><div class="lbl">Total Ritase</div></div><div class="sum-card"><div class="val">Rp '+gBBM.toLocaleString()+'</div><div class="lbl">Total BBM (Rp)</div></div><div class="sum-card"><div class="val">'+( gBBM/6800).toFixed(1)+' L</div><div class="lbl">Total BBM (L)</div></div></div><div class="table-outer"><table><thead><tr><th>Lambung</th><th>Jalur</th><th>Total Jam (mnt)</th><th>BBM (L)</th><th>Rasio</th><th>Total BBM (Rp)</th><th>Total Ritase</th></tr></thead><tbody>'+rows.map(function(r){return'<tr><td><strong>'+r.lamb+'</strong></td><td>'+r.jalur+'</td><td>'+r.totalJam+'</td><td>'+r.liter+'</td><td>'+r.ratio+'</td><td>Rp '+r.totalBBM.toLocaleString()+'</td><td>'+r.totalRit+'</td></tr>';}).join('')+'<tr style="background:var(--green-pale);border-top:2px solid var(--green-main);"><td colspan="2"><strong style="color:var(--green-dark);">TOTAL</strong></td><td><strong style="color:var(--green-dark);">'+rows.reduce(function(s,r){return s+r.totalJam;},0)+'</strong></td><td><strong style="color:var(--green-dark);">'+(gBBM/6800).toFixed(2)+'</strong></td><td>-</td><td><strong style="color:var(--green-dark);">Rp '+gBBM.toLocaleString()+'</strong></td><td><strong style="color:var(--green-dark);">'+gRit+'</strong></td></tr></tbody></table></div></div></div>';
}


// ============================================================
// LAPORAN GABUNGAN — BBM + Operasional per Bus per Periode
// ============================================================
function populateLapGabFilter() { populateLambFilter('lg-lamb'); }

function generateLapGabungan() {
  var tglM = document.getElementById('lg-tgl-mulai') ? document.getElementById('lg-tgl-mulai').value : '';
  var tglA = document.getElementById('lg-tgl-akhir') ? document.getElementById('lg-tgl-akhir').value : '';
  var lambF = document.getElementById('lg-lamb') ? document.getElementById('lg-lamb').value : '';
  var el = document.getElementById('result-lap-gabungan');
  if (!el) return;

  var bbmData = DB.bbm.slice();
  var opsData = DB.ops.slice();
  if (tglM) { bbmData = bbmData.filter(function(r){ return r.tgl >= tglM; }); opsData = opsData.filter(function(r){ return r.tgl >= tglM; }); }
  if (tglA) { bbmData = bbmData.filter(function(r){ return r.tgl <= tglA; }); opsData = opsData.filter(function(r){ return r.tgl <= tglA; }); }
  if (lambF) { bbmData = bbmData.filter(function(r){ return String(r.lambung).trim() === lambF; }); opsData = opsData.filter(function(r){ return String(r.lambung).trim() === lambF; }); }

  if (!bbmData.length && !opsData.length) {
    el.innerHTML = '<div class="card"><div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada data untuk periode ini</p></div></div>'; return;
  }

  // Kumpulkan semua lambung yang muncul di kedua tabel
  var lambSet = {};
  bbmData.forEach(function(r){ lambSet[String(r.lambung).trim()] = true; });
  opsData.forEach(function(r){ lambSet[String(r.lambung).trim()] = true; });
  var lambs = Object.keys(lambSet).sort(function(a,b){ return Number(a)-Number(b) || a.localeCompare(b); });

  var rows = lambs.map(function(lamb) {
    var bRows = bbmData.filter(function(r){ return String(r.lambung).trim() === lamb; });
    var oRows = opsData.filter(function(r){ return String(r.lambung).trim() === lamb; });
    var totalBBMRp = bRows.reduce(function(s,r){ return s + Number(r.nominal||0); }, 0);
    var totalLiter = totalBBMRp / 6800;
    var totalKm    = oRows.reduce(function(s,r){ return s + Number(r.km_tempuh||0); }, 0);
    var totalRit   = oRows.reduce(function(s,r){ return s + Number(r.rit||0); }, 0);
    var rasio      = totalLiter > 0 ? (totalKm / totalLiter).toFixed(2) : '-';
    var jalur      = (bRows[0] || oRows[0] || {}).jalur || '-';
    var nopol      = (bRows[0] || oRows[0] || {}).nopol || '-';
    // Status selesai = ada data di keduanya
    var status = (bRows.length > 0 && oRows.length > 0) ? 'selesai' : bRows.length > 0 ? 'no-ops' : 'no-bbm';
    var hariOps = [...new Set(oRows.map(function(r){ return r.tgl; }))].length;
    return { lamb, jalur, nopol, totalBBMRp, totalLiter: totalLiter.toFixed(2), totalKm, totalRit, rasio, status, hariOps, bCount: bRows.length, oCount: oRows.length };
  });

  // Summary cards
  var totalBus    = rows.length;
  var busSelesai  = rows.filter(function(r){ return r.status === 'selesai'; }).length;
  var grandBBM    = rows.reduce(function(s,r){ return s + r.totalBBMRp; }, 0);
  var grandKm     = rows.reduce(function(s,r){ return s + r.totalKm; }, 0);
  var grandRit    = rows.reduce(function(s,r){ return s + r.totalRit; }, 0);
  var grandLiter  = grandBBM / 6800;
  var grandRasio  = grandLiter > 0 ? (grandKm / grandLiter).toFixed(2) : '-';

  var statusBadge = function(s) {
    if (s === 'selesai') return '<span style="background:#d4edda;color:#155724;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;">✅ Lengkap</span>';
    if (s === 'no-ops')  return '<span style="background:#fff3cd;color:#856404;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;">⚠ Belum ada Ops</span>';
    return '<span style="background:#bee3f8;color:#2b6cb0;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;">⚠ Belum ada BBM</span>';
  };

  var rasioColor = function(r) {
    if (r === '-') return '';
    var v = Number(r);
    if (v >= 5)   return 'color:#155724;font-weight:700;';
    if (v >= 3.5) return 'color:#856404;font-weight:700;';
    return 'color:#721c24;font-weight:700;';
  };

  var html = '<div class="report-summary" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px;">'
    + '<div class="sum-card"><div class="val">'+totalBus+'</div><div class="lbl">Total Bus</div></div>'
    + '<div class="sum-card" style="background:#d4edda;"><div class="val" style="color:#155724;">'+busSelesai+'</div><div class="lbl">Data Lengkap</div></div>'
    + '<div class="sum-card"><div class="val">Rp '+grandBBM.toLocaleString('id-ID')+'</div><div class="lbl">Total BBM</div></div>'
    + '<div class="sum-card"><div class="val">'+grandLiter.toFixed(1)+' L</div><div class="lbl">Total Liter</div></div>'
    + '<div class="sum-card"><div class="val">'+grandKm.toLocaleString('id-ID')+' km</div><div class="lbl">Total KM</div></div>'
    + '<div class="sum-card"><div class="val">'+grandRit+'</div><div class="lbl">Total Rit</div></div>'
    + '<div class="sum-card"><div class="val">'+grandRasio+' km/L</div><div class="lbl">Rasio Rata-rata</div></div>'
    + '</div>';

  html += '<div class="card"><div class="card-header"><div class="card-title">Detail Per Bus</div>'
    + '<button class="btn btn-sm btn-outline" onclick="exportLapGabExcel()" style="margin-left:auto;"><i class="fas fa-file-excel"></i> Export Excel</button></div>'
    + '<div class="table-outer"><table><thead><tr>'
    + '<th>Lambung</th><th>Jalur</th><th>No Polisi</th><th>Hari Ops</th>'
    + '<th>BBM (Rp)</th><th>BBM (L)</th><th>KM Tempuh</th><th>Rit</th>'
    + '<th>Rasio km/L</th><th>Status</th>'
    + '</tr></thead><tbody>';

  rows.forEach(function(r) {
    html += '<tr>'
      + '<td><strong>'+r.lamb+'</strong></td>'
      + '<td>'+r.jalur+'</td>'
      + '<td>'+r.nopol+'</td>'
      + '<td style="text-align:center;">'+r.hariOps+'</td>'
      + '<td>Rp '+r.totalBBMRp.toLocaleString('id-ID')+'</td>'
      + '<td>'+r.totalLiter+' L</td>'
      + '<td>'+r.totalKm.toLocaleString('id-ID')+' km</td>'
      + '<td style="text-align:center;">'+r.totalRit+'</td>'
      + '<td style="text-align:center;'+rasioColor(r.rasio)+'">'+r.rasio+'</td>'
      + '<td>'+statusBadge(r.status)+'</td>'
      + '</tr>';
  });

  html += '<tr style="background:var(--green-pale);border-top:2px solid var(--green-main);">'
    + '<td colspan="3"><strong style="color:var(--green-dark);">TOTAL</strong></td>'
    + '<td></td>'
    + '<td><strong style="color:var(--green-dark);">Rp '+grandBBM.toLocaleString('id-ID')+'</strong></td>'
    + '<td><strong style="color:var(--green-dark);">'+grandLiter.toFixed(2)+' L</strong></td>'
    + '<td><strong style="color:var(--green-dark);">'+grandKm.toLocaleString('id-ID')+' km</strong></td>'
    + '<td style="text-align:center;"><strong style="color:var(--green-dark);">'+grandRit+'</strong></td>'
    + '<td style="text-align:center;"><strong style="color:var(--green-dark);">'+grandRasio+'</strong></td>'
    + '<td></td>'
    + '</tr>';

  html += '</tbody></table></div></div>';
  el.innerHTML = html;
  setTimeout(applyFreeze, 10);

  // Simpan ke window untuk export
  window._lapGabRows = rows;
  window._lapGabGrand = { grandBBM, grandLiter, grandKm, grandRit, grandRasio };
}

function exportLapGabExcel() {
  if (!window._lapGabRows) return toast('Generate laporan dulu!', true);
  var hdrs = ['Lambung','Jalur','No Polisi','Hari Ops','BBM (Rp)','BBM (L)','KM Tempuh','Rit','Rasio km/L','Status'];
  var aoa = [hdrs].concat(window._lapGabRows.map(function(r){
    return [r.lamb, r.jalur, r.nopol, r.hariOps, r.totalBBMRp, r.totalLiter, r.totalKm, r.totalRit, r.rasio,
      r.status === 'selesai' ? 'Lengkap' : r.status === 'no-ops' ? 'Belum ada Ops' : 'Belum ada BBM'];
  }));
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = hdrs.map(function(h){ return {wch: Math.max(h.length+4,14)}; });
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Gabungan');
  XLSX.writeFile(wb, 'LaporanGabungan_TransJogja.xlsx');
  toast('Export berhasil!');
}

// ============================================================
// LAPORAN HARIAN — Ringkasan per Tanggal
// ============================================================
function generateLapHarian() {
  var tglM = document.getElementById('lh-tgl-mulai') ? document.getElementById('lh-tgl-mulai').value : '';
  var tglA = document.getElementById('lh-tgl-akhir') ? document.getElementById('lh-tgl-akhir').value : '';
  var el = document.getElementById('result-lap-harian');
  if (!el) return;

  var bbmData = DB.bbm.slice();
  var opsData  = DB.ops.slice();
  if (tglM) { bbmData = bbmData.filter(function(r){ return r.tgl >= tglM; }); opsData = opsData.filter(function(r){ return r.tgl >= tglM; }); }
  if (tglA) { bbmData = bbmData.filter(function(r){ return r.tgl <= tglA; }); opsData = opsData.filter(function(r){ return r.tgl <= tglA; }); }

  var dateSet = {};
  bbmData.forEach(function(r){ dateSet[r.tgl] = true; });
  opsData.forEach(function(r){ dateSet[r.tgl] = true; });
  var dates = Object.keys(dateSet).sort().reverse(); // terbaru dulu

  if (!dates.length) {
    el.innerHTML = '<div class="card"><div class="empty-state"><i class="fas fa-calendar-times"></i><p>Tidak ada data</p></div></div>'; return;
  }

  var dayRows = dates.map(function(tgl) {
    var bRows = bbmData.filter(function(r){ return r.tgl === tgl; });
    var oRows = opsData.filter(function(r){ return r.tgl === tgl; });
    var totalBBMRp = bRows.reduce(function(s,r){ return s + Number(r.nominal||0); }, 0);
    var totalKm    = oRows.reduce(function(s,r){ return s + Number(r.km_tempuh||0); }, 0);
    var totalRit   = oRows.reduce(function(s,r){ return s + Number(r.rit||0); }, 0);
    var liter      = totalBBMRp / 6800;
    var rasio      = liter > 0 && totalKm > 0 ? (totalKm / liter).toFixed(2) : '-';
    // Bus yg ada data BBM & ops hari itu
    var bbmLambs = [...new Set(bRows.map(function(r){ return String(r.lambung).trim(); }))];
    var opsLambs = [...new Set(oRows.map(function(r){ return String(r.lambung).trim(); }))];
    var selesai  = bbmLambs.filter(function(l){ return opsLambs.includes(l); }).length;
    var pending  = bbmLambs.filter(function(l){ return !opsLambs.includes(l); }).length
                 + opsLambs.filter(function(l){ return !bbmLambs.includes(l); }).length;
    return { tgl, busBBM: bbmLambs.length, busOps: opsLambs.length, selesai, pending, totalBBMRp, liter: liter.toFixed(2), totalKm, totalRit, rasio };
  });

  var html = '<div class="card"><div class="card-header"><div class="card-title">Ringkasan Harian</div>'
    + '<button class="btn btn-sm btn-outline" onclick="exportLapHarianExcel()" style="margin-left:auto;"><i class="fas fa-file-excel"></i> Export</button></div>'
    + '<div class="table-outer"><table><thead><tr>'
    + '<th>Tanggal</th><th>Bus BBM</th><th>Bus Ops</th>'
    + '<th style="color:#155724;">✅ Lengkap</th><th style="color:#856404;">⚠ Pending</th>'
    + '<th>Total BBM (Rp)</th><th>Liter</th><th>KM Tempuh</th><th>Total Rit</th><th>Rasio km/L</th>'
    + '</tr></thead><tbody>';

  dayRows.forEach(function(r) {
    var pendBg = r.pending > 0 ? 'background:#fffbea;' : '';
    html += '<tr style="'+pendBg+'">'
      + '<td><strong>'+r.tgl+'</strong></td>'
      + '<td style="text-align:center;">'+r.busBBM+'</td>'
      + '<td style="text-align:center;">'+r.busOps+'</td>'
      + '<td style="text-align:center;color:#155724;font-weight:700;">'+r.selesai+'</td>'
      + '<td style="text-align:center;color:'+(r.pending>0?'#856404':'#155724')+';font-weight:700;">'+r.pending+'</td>'
      + '<td>Rp '+r.totalBBMRp.toLocaleString('id-ID')+'</td>'
      + '<td>'+r.liter+' L</td>'
      + '<td>'+r.totalKm.toLocaleString('id-ID')+' km</td>'
      + '<td style="text-align:center;">'+r.totalRit+'</td>'
      + '<td style="text-align:center;">'+r.rasio+'</td>'
      + '</tr>';
  });

  html += '</tbody></table></div></div>';
  el.innerHTML = html;
  window._lapHarianRows = dayRows;
}

function exportLapHarianExcel() {
  if (!window._lapHarianRows) return toast('Generate laporan dulu!', true);
  var hdrs = ['Tanggal','Bus BBM','Bus Ops','Lengkap','Pending','BBM (Rp)','Liter','KM','Rit','Rasio'];
  var aoa = [hdrs].concat(window._lapHarianRows.map(function(r){
    return [r.tgl, r.busBBM, r.busOps, r.selesai, r.pending, r.totalBBMRp, r.liter, r.totalKm, r.totalRit, r.rasio];
  }));
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = hdrs.map(function(){ return {wch: 14}; });
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Harian');
  XLSX.writeFile(wb, 'LaporanHarian_TransJogja.xlsx');
  toast('Export berhasil!');
}

// ============================================================
// ANALITIK EFISIENSI — Ranking & Highlight per Bus
// ============================================================
function generateLapEfisiensi() {
  var tglM = document.getElementById('le-tgl-mulai') ? document.getElementById('le-tgl-mulai').value : '';
  var tglA = document.getElementById('le-tgl-akhir') ? document.getElementById('le-tgl-akhir').value : '';
  var el = document.getElementById('result-lap-efisiensi');
  if (!el) return;

  var bbmData = DB.bbm.slice();
  var opsData  = DB.ops.slice();
  if (tglM) { bbmData = bbmData.filter(function(r){ return r.tgl >= tglM; }); opsData = opsData.filter(function(r){ return r.tgl >= tglM; }); }
  if (tglA) { bbmData = bbmData.filter(function(r){ return r.tgl <= tglA; }); opsData = opsData.filter(function(r){ return r.tgl <= tglA; }); }

  // Hanya bus yang punya kedua data (lengkap)
  var lambSet = {};
  opsData.forEach(function(r){ lambSet[String(r.lambung).trim()] = true; });
  var lambs = Object.keys(lambSet).filter(function(l){
    return bbmData.some(function(b){ return String(b.lambung).trim() === l; });
  }).sort(function(a,b){ return Number(a)-Number(b) || a.localeCompare(b); });

  if (!lambs.length) {
    el.innerHTML = '<div class="card"><div class="empty-state"><i class="fas fa-chart-bar"></i><p>Belum ada data lengkap (butuh BBM + Operasional)</p></div></div>'; return;
  }

  var rows = lambs.map(function(lamb) {
    var bRows = bbmData.filter(function(r){ return String(r.lambung).trim() === lamb; });
    var oRows = opsData.filter(function(r){ return String(r.lambung).trim() === lamb; });
    var totalBBMRp = bRows.reduce(function(s,r){ return s+Number(r.nominal||0); }, 0);
    var liter      = totalBBMRp / 6800;
    var totalKm    = oRows.reduce(function(s,r){ return s+Number(r.km_tempuh||0); }, 0);
    var totalRit   = oRows.reduce(function(s,r){ return s+Number(r.rit||0); }, 0);
    var rasio      = liter > 0 ? Number((totalKm / liter).toFixed(2)) : 0;
    var hariOps    = [...new Set(oRows.map(function(r){ return r.tgl; }))].length;
    var jalur      = (oRows[0]||bRows[0]||{}).jalur || '-';
    var kmPerHari  = hariOps > 0 ? (totalKm / hariOps).toFixed(1) : 0;
    var ritPerHari = hariOps > 0 ? (totalRit / hariOps).toFixed(1) : 0;
    return { lamb, jalur, rasio, totalKm, totalBBMRp, liter: liter.toFixed(2), totalRit, hariOps, kmPerHari, ritPerHari };
  }).filter(function(r){ return r.rasio > 0; });

  // Sort by rasio desc untuk ranking
  rows.sort(function(a,b){ return b.rasio - a.rasio; });

  var maxRasio = rows[0] ? rows[0].rasio : 1;
  var avgRasio = rows.length ? (rows.reduce(function(s,r){ return s+r.rasio; },0)/rows.length).toFixed(2) : '-';
  var top3     = rows.slice(0,3);
  var bot3     = rows.slice(-3).reverse();

  var html = '';

  // Panel highlight
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">';

  // Top 3
  html += '<div class="card" style="border-left:4px solid #38a169;">'
    + '<div class="card-header"><div class="card-title" style="color:#155724;"><i class="fas fa-trophy" style="color:#f6c90e;margin-right:6px;"></i>Efisiensi Terbaik</div></div>'
    + top3.map(function(r, i){
        var medals = ['🥇','🥈','🥉'];
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #e2e8f0;">'
          + '<span style="font-size:20px;">'+medals[i]+'</span>'
          + '<div style="flex:1;">'
          + '<div style="font-weight:700;">Lambung '+r.lamb+' <span style="font-size:11px;color:#718096;">('+r.jalur+')</span></div>'
          + '<div style="font-size:11px;color:#718096;">'+r.hariOps+' hari | '+r.totalKm+' km | '+r.totalRit+' rit</div>'
          + '</div>'
          + '<div style="font-size:18px;font-weight:800;color:#155724;">'+r.rasio+' <span style="font-size:11px;font-weight:400;">km/L</span></div>'
          + '</div>';
      }).join('')
    + '</div>';

  // Bottom 3
  html += '<div class="card" style="border-left:4px solid #e53e3e;">'
    + '<div class="card-header"><div class="card-title" style="color:#721c24;"><i class="fas fa-exclamation-triangle" style="color:#e53e3e;margin-right:6px;"></i>Perlu Perhatian</div></div>'
    + bot3.map(function(r, i){
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #e2e8f0;">'
          + '<span style="font-size:20px;">'+(i===0?'🔴':i===1?'🟠':'🟡')+'</span>'
          + '<div style="flex:1;">'
          + '<div style="font-weight:700;">Lambung '+r.lamb+' <span style="font-size:11px;color:#718096;">('+r.jalur+')</span></div>'
          + '<div style="font-size:11px;color:#718096;">'+r.hariOps+' hari | '+r.totalKm+' km | Rp '+r.totalBBMRp.toLocaleString('id-ID')+'</div>'
          + '</div>'
          + '<div style="font-size:18px;font-weight:800;color:#721c24;">'+r.rasio+' <span style="font-size:11px;font-weight:400;">km/L</span></div>'
          + '</div>';
      }).join('')
    + '</div>';

  html += '</div>';

  // Tabel lengkap dengan bar visual
  html += '<div class="card"><div class="card-header"><div class="card-title">Ranking Semua Bus</div>'
    + '<div style="margin-left:auto;display:flex;gap:8px;align-items:center;">'
    + '<span style="font-size:12px;color:#718096;">Rata-rata: <strong>'+avgRasio+' km/L</strong></span>'
    + '<button class="btn btn-sm btn-outline" onclick="exportLapEfisiensiExcel()"><i class="fas fa-file-excel"></i> Export</button>'
    + '</div></div>'
    + '<div class="table-outer"><table><thead><tr>'
    + '<th>#</th><th>Lambung</th><th>Jalur</th><th>Hari</th>'
    + '<th>KM Total</th><th>KM/Hari</th><th>BBM (L)</th><th>Rit Total</th><th>Rit/Hari</th>'
    + '<th>Rasio km/L</th><th>Efisiensi</th>'
    + '</tr></thead><tbody>';

  rows.forEach(function(r, i) {
    var pct = maxRasio > 0 ? (r.rasio / maxRasio * 100).toFixed(0) : 0;
    var barColor = r.rasio >= avgRasio ? '#38a169' : r.rasio >= avgRasio * 0.75 ? '#d97706' : '#e53e3e';
    var rank = i + 1;
    var rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    html += '<tr>'
      + '<td style="text-align:center;font-weight:700;">'+rankBadge+'</td>'
      + '<td><strong>'+r.lamb+'</strong></td>'
      + '<td>'+r.jalur+'</td>'
      + '<td style="text-align:center;">'+r.hariOps+'</td>'
      + '<td>'+r.totalKm.toLocaleString('id-ID')+' km</td>'
      + '<td>'+r.kmPerHari+' km</td>'
      + '<td>'+r.liter+' L</td>'
      + '<td style="text-align:center;">'+r.totalRit+'</td>'
      + '<td>'+r.ritPerHari+'</td>'
      + '<td style="text-align:center;font-weight:800;color:'+barColor+';">'+r.rasio+'</td>'
      + '<td style="min-width:100px;">'
      + '<div style="background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden;">'
      + '<div style="width:'+pct+'%;background:'+barColor+';height:8px;border-radius:4px;transition:width 0.4s;"></div>'
      + '</div>'
      + '<span style="font-size:10px;color:#718096;">'+pct+'%</span>'
      + '</td>'
      + '</tr>';
  });

  html += '</tbody></table></div></div>';
  el.innerHTML = html;
  window._lapEfRows = rows;
}

function exportLapEfisiensiExcel() {
  if (!window._lapEfRows) return toast('Generate laporan dulu!', true);
  var hdrs = ['Rank','Lambung','Jalur','Hari','KM Total','KM/Hari','BBM (L)','Rit Total','Rit/Hari','Rasio km/L'];
  var aoa = [hdrs].concat(window._lapEfRows.map(function(r,i){
    return [i+1, r.lamb, r.jalur, r.hariOps, r.totalKm, r.kmPerHari, r.liter, r.totalRit, r.ritPerHari, r.rasio];
  }));
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = hdrs.map(function(){ return {wch: 14}; });
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Efisiensi');
  XLSX.writeFile(wb, 'LaporanEfisiensi_TransJogja.xlsx');
  toast('Export berhasil!');
}

// ============================================================
// IMPORT / EXPORT / TEMPLATE
// ============================================================
function downloadTemplate(type) {
  var headers=[],sampleRows=[],filename='';
  if(type==='bus'){headers=['Lambung','No Polisi','Jalur','Tipe Bus','Karoseri','Warna Bus','Keterangan'];sampleRows=[['AB-001','AB 1234 CD','Koridor 1','Besar','Laksana','Hijau',''],['AB-002','AB 5678 EF','Koridor 2','Sedang','Adiputro','Putih','']];filename='Template_Bus.xlsx';}
  else if(type==='spbu'){headers=['Nama SPBU','ID SPBU','Alamat','No Hp','Status'];sampleRows=[['SPBU Jl. Magelang','34-151-01','Jl. Magelang No.10','081234567890','Aktif']];filename='Template_SPBU.xlsx';}
  else if(type==='bbm'){headers=['Tanggal','Lambung','Jalur','No Polisi','Waktu Pengisian','Nominal','SPBU','Halte Terakhir','Jam Halte Terakhir','Keterangan'];sampleRows=[['2026-03-09','AB-001','Koridor 1','AB 1234 CD','06:30','200000','SPBU Jl. Magelang','Halte Malioboro','06:15','']];filename='Template_BBM.xlsx';}
  else if(type==='ops'){headers=['Tanggal','Lambung','Jalur','No Polisi','Jam Mulai Pool','Jam Akhir Pool','Km Awal Pool','Km Akhir Pool','Km Awal Halte','Km Akhir Halte','RIT','Keterangan'];sampleRows=[['2026-03-09','AB-001','Koridor 1','AB 1234 CD','05:30','22:00','12500','12620','12510','12610','8','']];filename='Template_Operasional.xlsx';}
  var ws=XLSX.utils.aoa_to_sheet([headers].concat(sampleRows));
  ws['!cols']=headers.map(function(h){return{wch:Math.max(h.length+4,16)};});
  var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Template');XLSX.writeFile(wb,filename);
  toast('Template '+filename+' berhasil didownload!');
}
function excelDateToStr(val) {
  if (!val) return null;
  // Sudah string format YYYY-MM-DD
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) return val.substring(0,10);
  // Format DD/MM/YYYY atau MM/DD/YYYY
  if (typeof val === 'string' && val.includes('/')) {
    var p = val.split('/');
    if (p.length === 3) {
      // Asumsi DD/MM/YYYY
      return p[2].substring(0,4)+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');
    }
  }
  // Angka serial Excel (hari sejak 1 Jan 1900, dengan bug leap year 1900)
  if (typeof val === 'number') {
    var d = new Date(Math.round((val - 25569) * 86400 * 1000));
    var y = d.getUTCFullYear();
    var m = String(d.getUTCMonth()+1).padStart(2,'0');
    var dd = String(d.getUTCDate()).padStart(2,'0');
    return y+'-'+m+'-'+dd;
  }
  return String(val);
}

function excelTimeToStr(val) {
  if (!val) return null;
  // Jika sudah string format HH:MM atau HH:MM:SS
  if (typeof val === 'string') {
    var m = val.match(/^(\d{1,2}):(\d{2})/);
    if (m) return m[1].padStart(2,'0')+':'+m[2]+':00';
    return null;
  }
  // Jika angka desimal Excel (misal 0.8868 = 21:17)
  if (typeof val === 'number') {
    var totalMin = Math.round(val * 1440);
    var h = Math.floor(totalMin / 60) % 24;
    var mn = totalMin % 60;
    return String(h).padStart(2,'0')+':'+String(mn).padStart(2,'0')+':00';
  }
  return null;
}

async function importData(type, input) {
  var file=input.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=async function(e){
    try{
      // Pastikan data BBM sudah terload untuk autofill ke operasional
      if(type==='ops' && DB.bbm.length===0) await loadBBM();
      var wb=XLSX.read(e.target.result,{type:'binary'}),ws=wb.Sheets[wb.SheetNames[0]];
      var rows=XLSX.utils.sheet_to_json(ws,{defval:''});if(!rows.length)return toast('File kosong!',true);
      var records=[];
      // IDs generated by Supabase
      if(type==='bus')records=rows.filter(function(r){return r.Lambung||r.lambung;}).map(function(r){return{lambung:r.Lambung||r.lambung,nopol:r['No Polisi']||r.nopol||'',jalur:r.Jalur||r.jalur||'',tipe:r['Tipe Bus']||r.tipe||'',karoseri:r.Karoseri||r.karoseri||'',warna:r['Warna Bus']||r.warna||'',ket:r.Keterangan||r.ket||''};});
      else if(type==='spbu')records=rows.filter(function(r){return r['Nama SPBU']||r.nama;}).map(function(r){return{kode:r['ID SPBU']||r.kode||'',nama:r['Nama SPBU']||r.nama,alamat:r.Alamat||r.alamat||'',hp:r['No Hp']||r.hp||'',aktif:String(r.Status||'1').toLowerCase()==='aktif'||String(r.Status||'1')==='1'};});
      else if(type==='bbm'){
        var rawBBM=rows.filter(function(r){return r.Tanggal||r.tgl;}).map(function(r){return{tgl:excelDateToStr(r.Tanggal||r.tgl),lambung:String(r.Lambung||r.lambung||'').trim(),jalur:r.Jalur||r.jalur||'',nopol:r['No Polisi']||r.nopol||'',waktu:excelTimeToStr(r['Waktu Pengisian']||r.waktu),nominal:parseFloat(r.Nominal||r.nominal||0),spbu:r.SPBU||r.spbu||'',halte:r['Halte Terakhir']||r.halte||'',jam_halte:excelTimeToStr(r['Jam Halte Terakhir']),ket:r.Keterangan||r.ket||''};});
        var existingKeys={};
        DB.bbm.forEach(function(b){existingKeys[String(b.lambung).trim()+'|'+String(b.tgl).substring(0,10)+'|'+String(b.waktu||'')+'|'+Number(b.nominal)]=true;});
        var dupCount=0;
        records=rawBBM.filter(function(r){
          var key=String(r.lambung).trim()+'|'+String(r.tgl).substring(0,10)+'|'+String(r.waktu||'')+'|'+Number(r.nominal);
          if(existingKeys[key]){dupCount++;return false;}
          existingKeys[key]=true;
          return true;
        });
        if(dupCount>0)toast('\u26a0\ufe0f '+dupCount+' baris dilewati (duplikat: tgl+lambung+waktu+nominal).',false);
      } else if(type==='ops'){
        // Fetch fresh BBM dari Supabase untuk lookup akurat
        var bbmLookup = {};
        toast('⏳ Mengambil data BBM...');
        var bbmFetch = await fetchAll('bbm','tgl',false,'lambung',true);
        var bbmSource = (bbmFetch.data && bbmFetch.data.length) ? bbmFetch.data : DB.bbm;
        bbmSource.forEach(function(b){
          var key = b.tgl+'|'+String(b.lambung).trim();
          bbmLookup[key] = (bbmLookup[key]||0) + parseFloat(b.nominal||0);
        });
        records=rows.filter(function(r){return r.Tanggal||r.tgl;}).map(function(r){
          var tglStr=excelDateToStr(r.Tanggal||r.tgl);
          var lambStr=String(r.Lambung||r.lambung||'').trim();
          var key=tglStr+'|'+lambStr;
          // Ambil BBM dari DB jika ada, fallback ke kolom Excel
          var bbmV = bbmLookup[key] || parseFloat(r['BBM (Rp)']||0);
          var jm=excelTimeToStr(r['Jam Mulai Pool']),ja=excelTimeToStr(r['Jam Akhir Pool']);
          var kmAP=parseFloat(r['Km Awal Pool'])||0,kmKP=parseFloat(r['Km Akhir Pool'])||0;
          var kmAH=parseFloat(r['Km Awal Halte'])||0,kmKH=parseFloat(r['Km Akhir Halte'])||0;
          var km=null,rat=null;
          if(kmKP>0&&kmAP>0){km=parseFloat((kmKP-kmAP).toFixed(1));}
          else if(kmKH>0&&kmAH>0){km=parseFloat((kmKH-kmAH).toFixed(1));}
          if(km&&bbmV>0){rat=parseFloat((km/(bbmV/6800)).toFixed(2));}
          return{tgl:tglStr,lambung:lambStr,jalur:r.Jalur||'',nopol:r['No Polisi']||'',jam_mulai:jm,jam_akhir:ja,km_awal_pool:r['Km Awal Pool']||null,km_akhir_pool:r['Km Akhir Pool']||null,km_awal_halte:r['Km Awal Halte']||null,km_akhir_halte:r['Km Akhir Halte']||null,bbm_rp:bbmV,rit:parseInt(r.RIT||0),km_tempuh:km,ratio:rat,ket:r.Keterangan||''};
        });
      }
      if(!records.length)return toast('Tidak ada data valid!',true);
      // Hitung berapa baris ops yang dapat data BBM dari lookup
      var tbl = type==='bus'?'bus' : type==='spbu'?'spbu' : type==='bbm'?'bbm' : 'operasional';var inserted=0;
      for(var i=0;i<records.length;i+=100){
        var chunk=records.slice(i,i+100);
        var res=await db.from(tbl).upsert(chunk,{ignoreDuplicates:true});
        if(res.error){toast('Error import: '+res.error.message,true);return;}
        inserted+=chunk.length;
      }
      input.value='';
      if(type==='bus'){ markStale('bus'); await loadBus(true); }
      if(type==='spbu'){ markStale('spbu'); await loadSpbu(true); }
      if(type==='bbm'){ markStale('bbm','ops'); await loadBBM(true); }
      if(type==='ops'){ markStale('ops','bbm'); await loadOps(true); }
      updateDashboard();toast('✅ Import '+inserted+' data berhasil!');
    }catch(err){toast('Gagal import: '+err.message,true);}
  };
  reader.readAsBinaryString(file);
}
function exportExcel(type) {
  var data=[],fn='';
  if(type==='bus'){data=DB.bus.map(function(r){return{ID:r.id,Lambung:r.lambung,'No Polisi':r.nopol,Jalur:r.jalur,'Tipe Bus':r.tipe,Karoseri:r.karoseri,'Warna Bus':r.warna,Keterangan:r.ket};});fn='DataBus.xlsx';}
  if(type==='spbu'){data=DB.spbu.map(function(r){return{'Nama SPBU':r.nama,'ID SPBU':r.kode||'',Alamat:r.alamat,'No Hp':r.hp,Status:r.aktif?'Aktif':'Tidak Aktif'};});fn='DataSPBU.xlsx';}
  if(type==='bbm'){data=DB.bbm.map(function(r){return{ID:r.id,Tanggal:r.tgl,Lambung:r.lambung,Jalur:r.jalur,'No Polisi':r.nopol,Waktu:r.waktu,Nominal:r.nominal,SPBU:r.spbu,Halte:r.halte,Keterangan:r.ket};});fn='DataBBM.xlsx';}
  if(type==='ops'){data=DB.ops.map(function(r){return{ID:r.id,Tanggal:r.tgl,Lambung:r.lambung,Jalur:r.jalur,'No Polisi':r.nopol,'Jam Mulai':r.jam_mulai,'Jam Akhir':r.jam_akhir,'BBM(Rp)':r.bbm_rp,RIT:r.rit,'Km Tempuh':r.km_tempuh,Ratio:r.ratio,Keterangan:r.ket};});fn='DataOperasional.xlsx';}
  if(!data.length)return toast('Tidak ada data!',true);
  var ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Sheet1');XLSX.writeFile(wb,fn);toast('Export Excel berhasil!');
}
function exportExcelReport(type) {
  var data=[],fn='';
  if(type==='lap-bbm'){data=DB.bbm.map(function(r){return{Tanggal:r.tgl,Lambung:r.lambung,Nominal:r.nominal,SPBU:r.spbu};});fn='LaporanBBM.xlsx';}
  if(type==='lap-ops'){data=DB.ops.map(function(r){return{Tanggal:r.tgl,Lambung:r.lambung,'BBM(Rp)':r.bbm_rp,'Km Tempuh':r.km_tempuh,Ratio:r.ratio,RIT:r.rit};});fn='LaporanOperasional.xlsx';}
  if(type==='lap-waktu'){data=DB.bbm.map(function(r){return{Tanggal:r.tgl,Lambung:r.lambung,'Waktu Pengisian':r.waktu,Nominal:r.nominal,SPBU:r.spbu};});fn='LaporanWaktuBBM.xlsx';}
  if(!data.length)return toast('Tidak ada data!',true);
  var ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Laporan');XLSX.writeFile(wb,fn);toast('Export Excel berhasil!');
}
function exportPDF(type) {
  var jsPDF=window.jspdf.jsPDF,doc=new jsPDF();
  doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(26,92,42);
  doc.text('TransJogja — Laporan',14,18);doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(100);
  doc.text('Dicetak: '+new Date().toLocaleDateString('id-ID'),14,26);
  doc.setDrawColor(45,138,62);doc.setLineWidth(0.5);doc.line(14,30,196,30);
  var y=38,src=type==='lap-ops'?DB.ops:DB.bbm;
  var hdrs=type==='lap-ops'?['Tgl','Lambung','Jalur','Jam Mulai','Jam Akhir','BBM(Rp)','RIT','Rasio']:['Tanggal','Lambung','Waktu','Nominal','SPBU'];
  doc.setFillColor(26,92,42);doc.rect(14,y,182,7,'F');doc.setTextColor(255);doc.setFontSize(9);
  var cw=182/hdrs.length;hdrs.forEach(function(h,i){doc.text(h,15+i*cw,y+5);});y+=9;
  src.forEach(function(r,idx){
    if(y>270){doc.addPage();y=20;}
    doc.setFillColor(idx%2===0?245:255,idx%2===0?248:255,idx%2===0?245:255);doc.rect(14,y-1,182,7,'F');
    doc.setTextColor(60);doc.setFont('helvetica','normal');
    var vs=type==='lap-ops'?[r.tgl,r.lambung,r.jalur,r.jam_mulai||'-',r.jam_akhir||'-','Rp'+r.bbm_rp,String(r.rit||'-'),String(r.ratio||'-')]:[r.tgl,r.lambung,r.waktu||'-','Rp'+Number(r.nominal).toLocaleString(),r.spbu||'-'];
    vs.forEach(function(v,j){doc.text(String(v).substring(0,18),15+j*cw,y+5);});y+=8;
  });
  doc.save('Laporan_'+type+'_TransJogja.pdf');toast('Export PDF berhasil!');
}
function previewFoto(input,previewId) {
  var el=document.getElementById(previewId);
  if(input.files[0])el.innerHTML='<img src="'+URL.createObjectURL(input.files[0])+'" style="max-width:160px;max-height:90px;border-radius:8px;border:2px solid var(--green-light);">';
}
