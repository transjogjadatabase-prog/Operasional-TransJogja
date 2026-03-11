/* v20260311 */
/* ===== GOOGLE FONTS: Cormorant Garamond (display) + DM Sans (body) ===== */
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');

:root {
  --green-dark: #1a5c2a;
  --green-main: #2d8a3e;// ============================================================
// SUPABASE CONFIG — ganti URL dan KEY dengan milik Anda
// ============================================================
const SUPABASE_URL      = 'https://rzmeitgcbcpctisxsxpq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6bWVpdGdjYmNwY3Rpc3hzeHBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMzU0NTIsImV4cCI6MjA4ODYxMTQ1Mn0.NJivuuKmq48in32Ruk5hcf5F3LbNa2jL8yjD8GVClj4';
var db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ STATE ============
let DB = { bus: [], spbu: [], bbm: [], ops: [], akun: [] };
let editIdx = { bus: -1, spbu: -1, bbm: -1, ops: -1, akun: -1 };
let sidebarOpen = false;
let currentUser = null; // { id, nama, username, role, perms }

// Semua menu dan aksi yang bisa dikonfigurasi
const ALL_MENUS = [
  { key:'dashboard',     label:'Dashboard' },
  { key:'data-bus',      label:'Data Bus' },
  { key:'data-spbu',     label:'Data SPBU' },
  { key:'input-bbm',     label:'Input BBM' },
  { key:'input-ops',     label:'Input Operasional' },
  { key:'lap-bbm-waktu', label:'Laporan Waktu BBM' },
  { key:'lap-bbm',       label:'Laporan BBM' },
  { key:'lap-ops',       label:'Laporan Operasional' },
];
const ALL_ACTIONS = [
  { key:'tambah', label:'Tambah' },
  { key:'edit',   label:'Edit' },
  { key:'hapus',  label:'Hapus' },
  { key:'import', label:'Import' },
  { key:'export', label:'Export' },
];
// Default permissions per role
function defaultPerms(role) {
  if (role === 'admin') return { menus: ALL_MENUS.map(m=>m.key), actions: ALL_ACTIONS.map(a=>a.key) };
  if (role === 'staf')  return { menus: ['dashboard','input-bbm','input-ops','lap-bbm','lap-ops','lap-bbm-waktu'], actions: ['tambah','edit','export'] };
  return { menus: ['dashboard','lap-bbm','lap-ops'], actions: ['export'] }; // guest
}

// ============ SIDEBAR ============
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  applySidebarState();
}
function applySidebarState() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const main    = document.querySelector('.main');
  const icon    = document.getElementById('sidebar-icon');
  if (!sidebar) return;
  if (sidebarOpen) {
    sidebar.classList.add('open');
    main.classList.add('sidebar-open');
    if (window.innerWidth <= 900) overlay.classList.add('show');
    if (icon) icon.className = 'fas fa-times';
  } else {
    sidebar.classList.remove('open');
    main.classList.remove('sidebar-open');
    overlay.classList.remove('show');
    if (icon) icon.className = 'fas fa-bars';
  }
}
window.addEventListener('resize', function() {
  const desktop = window.innerWidth > 900;
  if (desktop && !sidebarOpen) { sidebarOpen = true; applySidebarState(); }
  if (!desktop && sidebarOpen) { sidebarOpen = false; applySidebarState(); }
});

// ============ NAVIGATION ============
const pageTitles = {
  'dashboard':     'Dashboard',
  'data-bus':      'Data Master — Bus',
  'data-spbu':     'Data Master — SPBU',
  'input-bbm':     'Input BBM',
  'input-ops':     'Input Operasional',
  'lap-bbm-waktu': 'Laporan Waktu Pengisian BBM',
  'lap-bbm':       'Laporan BBM',
  'lap-ops':       'Laporan Operasional',
  'kelola-akun':   'Kelola Akun'
};
function goPage(id) {
  // Cek izin akses halaman
  if (currentUser && currentUser.role !== 'admin' && !currentUser.perms.menus.includes(id)) {
    return toast('Anda tidak punya akses ke menu ini.', true);
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  window.scrollTo(0,0);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  var navBtn = document.querySelector('[data-page="' + id + '"]');
  if (navBtn) navBtn.classList.add('active');
  document.getElementById('page-title').textContent = pageTitles[id] || id;
  if (id === 'dashboard')     updateDashboard();
  if (id === 'data-bus')      loadBus();
  if (id === 'data-spbu')     loadSpbu();
  if (id === 'input-bbm')     loadBBM();
  if (id === 'input-ops')     loadOps();
  if (id === 'lap-bbm-waktu') populateSpbuFilter();
  if (id === 'lap-bbm')       populateLambFilter('lb-lamb');
  if (id === 'lap-ops')       populateLambFilter('lo-lamb');
  if (id === 'kelola-akun')   loadAkun();
  // Apply freeze ke tabel yang sudah ada di DOM
  setTimeout(applyFreeze, 50);
  // tutup sidebar di mobile setelah navigasi
  if (window.innerWidth <= 900 && sidebarOpen) { sidebarOpen = false; applySidebarState(); }
}

// ============================================================
// AUTH
// ============================================================
function canDo(action) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  return currentUser.perms.actions.includes(action);
}
function canAccess(menu) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  return currentUser.perms.menus.includes(menu);
}

async function doLogin() {
  var username = document.getElementById('login-username').value.trim().toLowerCase();
  var password = document.getElementById('login-password').value;
  var errEl    = document.getElementById('login-error');
  errEl.textContent = '';
  if (!username || !password) { errEl.textContent = 'Username dan password wajib diisi.'; return; }

  // Cek ke tabel akun di Supabase
  var r = await db.from('akun').select('*').eq('username', username).single();
  if (r.error || !r.data) { errEl.textContent = 'Username tidak ditemukan.'; return; }
  var user = r.data;
  // Password disimpan plaintext (bisa diganti bcrypt jika pakai edge function)
  if (user.password !== password) { errEl.textContent = 'Password salah.'; return; }

  currentUser = {
    id: user.id, nama: user.nama, username: user.username,
    role: user.role,
    perms: user.perms || defaultPerms(user.role)
  };
  // Simpan session di sessionStorage
  sessionStorage.setItem('tjUser', JSON.stringify(currentUser));
  applyUserSession();
}

function applyUserSession() {
  if (!currentUser) return;
  // Sembunyikan login
  document.getElementById('login-screen').style.display = 'none';
  // Update sidebar user info
  document.getElementById('sidebar-username').textContent = currentUser.nama;
  document.getElementById('sidebar-role').textContent = currentUser.role.charAt(0).toUpperCase()+currentUser.role.slice(1);
  document.getElementById('sidebar-avatar').textContent = currentUser.nama.charAt(0).toUpperCase();
  // Tampilkan menu Kelola Akun hanya untuk admin
  console.log('ROLE:', currentUser.role, '| IS ADMIN:', currentUser.role==='admin');
  document.getElementById('sidebar-akun').style.display = (currentUser.role||'').trim().toLowerCase()==='admin' ? '' : 'none';
  // Sembunyikan nav item yang tidak punya akses
  document.querySelectorAll('[data-page]').forEach(function(btn){
    var page = btn.getAttribute('data-page');
    if (page === 'kelola-akun') return;
    btn.style.display = canAccess(page) ? '' : 'none';
  });
  // Sembunyikan tombol aksi berdasarkan permission
  applyActionPerms();
  // Load data awal
  loadBus().catch(function(e){ console.error(e); });
  loadSpbu().catch(function(e){ console.error(e); });
  updateDashboard().catch(function(e){ console.error(e); });
}

function applyActionPerms() {
  // Tombol tambah/import/export berdasarkan izin
  var addBtns    = ['btn-tambah-bus','btn-tambah-spbu','btn-tambah-bbm','btn-tambah-ops','btn-tambah-akun'];
  var importBtns = document.querySelectorAll('[data-perm="import"]');
  var exportBtns = document.querySelectorAll('[data-perm="export"]');
  addBtns.forEach(function(id){
    var el=document.getElementById(id);
    if(el) el.style.display = canDo('tambah') ? '' : 'none';
  });
  importBtns.forEach(function(el){ el.style.display = canDo('import') ? '' : 'none'; });
  exportBtns.forEach(function(el){ el.style.display = canDo('export') ? '' : 'none'; });
}

function doLogout() {
  sessionStorage.clear();
  localStorage.clear();
  currentUser = null;
  // Reload halaman agar semua state bersih
  window.location.reload();
}

// ============================================================
// KELOLA AKUN
// ============================================================
async function loadAkun() {
  var r = await db.from('akun').select('id,nama,username,role,perms,created_at').order('created_at');
  if (r.error) return toast('Gagal memuat akun: '+r.error.message, true);
  DB.akun = r.data;
  renderAkun();
  applyFreeze('tbl-akun');
}
function renderAkun() {
  var tbody = document.getElementById('tbody-akun');
  if (!tbody) return;
  if (!DB.akun.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-users"></i><p>Belum ada akun</p></div></td></tr>'; return; }
  tbody.innerHTML = DB.akun.map(function(r,i){
    var perms = r.perms || defaultPerms(r.role);
    var menuList = (perms.menus||[]).map(function(k){
      var m=ALL_MENUS.find(function(x){return x.key===k;});
      return m?m.label:'';
    }).filter(Boolean).join(', ') || '—';
    var roleBadge = '<span class="badge-role-'+r.role+'">'+r.role.charAt(0).toUpperCase()+r.role.slice(1)+'</span>';
    var isMe = currentUser && currentUser.id === r.id;
    return '<tr>'
      +'<td class="freeze-col" style="font-weight:700;color:var(--green-dark);text-align:center;">'+(i+1)+'</td>'
      +'<td><strong>'+r.nama+'</strong>'+(isMe?' <span style="font-size:10px;color:var(--green-main);">(Anda)</span>':'')+'</td>'
      +'<td><code style="background:var(--gray-100);padding:2px 8px;border-radius:6px;">'+r.username+'</code></td>'
      +'<td>'+roleBadge+'</td>'
      +'<td style="font-size:11.5px;color:var(--gray-600);max-width:200px;">'+menuList+'</td>'
      +'<td><div class="action-btns">'
      +(canDo('edit')?'<button class="btn btn-outline btn-sm" onclick="editAkun('+i+')"><i class="fas fa-edit"></i></button>':'')
      +(canDo('hapus')&&!isMe?'<button class="btn btn-danger btn-sm" onclick="delAkun('+i+')"><i class="fas fa-trash"></i></button>':'')
      +'</div></td></tr>';
  }).join('');
}
function renderPermGrid() {
  var role = document.getElementById('akun-role').value;
  var def  = defaultPerms(role);
  var grid = document.getElementById('perm-grid');
  var html = '<div class="perm-section-title" style="grid-column:1/-1">Menu yang Dapat Diakses</div>';
  ALL_MENUS.forEach(function(m){
    var chk = def.menus.includes(m.key) ? 'checked' : '';
    html += '<label class="perm-item"><input type="checkbox" class="perm-menu" value="'+m.key+'" '+chk+'> '+m.label+'</label>';
  });
  html += '<div class="perm-section-title" style="grid-column:1/-1">Aksi yang Diizinkan</div>';
  ALL_ACTIONS.forEach(function(a){
    var chk = def.actions.includes(a.key) ? 'checked' : '';
    html += '<label class="perm-item"><input type="checkbox" class="perm-action" value="'+a.key+'" '+chk+'> '+a.label+'</label>';
  });
  grid.innerHTML = html;
}
function getPermFromForm() {
  var menus = [], actions = [];
  document.querySelectorAll('.perm-menu:checked').forEach(function(el){ menus.push(el.value); });
  document.querySelectorAll('.perm-action:checked').forEach(function(el){ actions.push(el.value); });
  return { menus: menus, actions: actions };
}
async function saveAkun() {
  var nama     = document.getElementById('akun-nama').value.trim();
  var username = document.getElementById('akun-username').value.trim().toLowerCase();
  var password = document.getElementById('akun-password').value;
  var role     = document.getElementById('akun-role').value;
  if (!nama || !username) return toast('Nama dan username wajib diisi!', true);
  if (editIdx.akun < 0 && !password) return toast('Password wajib diisi untuk akun baru!', true);
  var perms = getPermFromForm();
  var row = { nama:nama, username:username, role:role, perms:perms };
  if (password) row.password = password;
  var res;
  if (editIdx.akun >= 0) {
    res = await db.from('akun').update(row).eq('id', DB.akun[editIdx.akun].id);
    if (!res.error) toast('Akun diperbarui!');
  } else {
    res = await db.from('akun').insert(row);
    if (!res.error) toast('Akun berhasil dibuat!');
  }
  if (res.error) return toast('Error: '+res.error.message, true);
  closeModal('modal-akun'); loadAkun();
}
function editAkun(i) {
  if (!canDo('edit')) return toast('Tidak ada izin edit.', true);
  editIdx.akun = i;
  var r = DB.akun[i];
  document.getElementById('akun-nama').value     = r.nama;
  document.getElementById('akun-username').value = r.username;
  document.getElementById('akun-password').value = '';
  document.getElementById('akun-role').value     = r.role;
  // Load perms dari data atau default
  var perms = r.perms || defaultPerms(r.role);
  renderPermGrid();
  // Override checkbox sesuai data tersimpan
  setTimeout(function(){
    document.querySelectorAll('.perm-menu').forEach(function(el){ el.checked = perms.menus.includes(el.value); });
    document.querySelectorAll('.perm-action').forEach(function(el){ el.checked = perms.actions.includes(el.value); });
  }, 50);
  document.getElementById('modal-akun-title').textContent = 'Edit Akun';
  document.getElementById('akun-password').placeholder = 'Kosongkan jika tidak diubah';
  openModal('modal-akun');
}
async function delAkun(i) {
  if (!canDo('hapus')) return toast('Tidak ada izin hapus.', true);
  if (!confirm('Hapus akun '+DB.akun[i].nama+'?')) return;
  var res = await db.from('akun').delete().eq('id', DB.akun[i].id);
  if (res.error) return toast('Gagal hapus: '+res.error.message, true);
  toast('Akun dihapus.'); loadAkun();
}

function setDateNow() {
  var el = document.getElementById('page-date');
  if (el) el.textContent = new Date().toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

// ============ MODALS ============
function openModal(id) {
  if (id === 'modal-bbm') { populateLambDropdowns(); populateSpbuDropdowns(); }
  if (id === 'modal-ops') { populateLambDropdowns(); }
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  var type = id.replace('modal-', '');
  if (editIdx[type] !== undefined) editIdx[type] = -1;
  clearForm(id);
}
function clearForm(modalId) {
  document.querySelectorAll('#' + modalId + ' input, #' + modalId + ' textarea, #' + modalId + ' select').forEach(function(el) {
    if (el.type === 'file') return;
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
}

// ============ TOAST ============
function toast(msg, isError) {
  var t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 3000);
}

function setLoading(tbodyId, colspan) {
  var el = document.getElementById(tbodyId);
  if (el) el.innerHTML = '<tr><td colspan="' + colspan + '" style="text-align:center;padding:32px;color:var(--gray-400);"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><br>Memuat data...</td></tr>';
}


// ============================================================
// APPLY FREEZE - sticky kolom pertama setelah render
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
async function fetchAll(table, orderCol, orderAsc) {
  var allData = [];
  var pageSize = 1000;
  var from = 0;
  while (true) {
    var r = await db.from(table).select('*')
      .order(orderCol, { ascending: orderAsc })
      .range(from, from + pageSize - 1);
    if (r.error) return { data: null, error: r.error };
    allData = allData.concat(r.data);
    if (r.data.length < pageSize) break; // sudah halaman terakhir
    from += pageSize;
  }
  return { data: allData, error: null };
}

// ============================================================
// BUS
// ============================================================
async function loadBus() {
  setLoading('tbody-bus', 10);
  var r = await fetchAll('bus', 'created_at', false);
  if (r.error) { toast('Gagal memuat data bus: ' + r.error.message, true); return; }
  DB.bus = r.data.map(function(d) { return { id:d.id, lambung:d.lambung, nopol:d.nopol, jalur:d.jalur, tipe:d.tipe, karoseri:d.karoseri, warna:d.warna, ket:d.ket, foto:d.foto_url }; });
  renderBus();
  applyFreeze('tbl-bus'); populateLambDropdowns();
}
async function saveBus() {
  var lambung = document.getElementById('bus-lambung').value.trim();
  var nopol   = document.getElementById('bus-nopol').value.trim();
  var jalur   = document.getElementById('bus-jalur').value.trim();
  if (!lambung || !nopol || !jalur) return toast('Lambung, No Polisi, dan Jalur wajib diisi!', true);
  var foto_url = editIdx.bus >= 0 ? DB.bus[editIdx.bus].foto : '';
  var fotoFile = document.getElementById('bus-foto-input').files[0];
  if (fotoFile) {
    var ext = fotoFile.name.split('.').pop();
    var path = 'bus/' + lambung + '_' + Date.now() + '.' + ext;
    var up = await db.storage.from('foto-bus').upload(path, fotoFile, { upsert: true });
    if (up.error) return toast('Gagal upload foto: ' + up.error.message, true);
    foto_url = db.storage.from('foto-bus').getPublicUrl(path).data.publicUrl;
  }
  var row = { lambung:lambung, nopol:nopol, jalur:jalur, tipe:document.getElementById('bus-tipe').value, karoseri:document.getElementById('bus-karoseri').value, warna:document.getElementById('bus-warna').value, ket:document.getElementById('bus-ket').value, foto_url:foto_url };
  var res;
  if (editIdx.bus >= 0) { res = await db.from('bus').update(row).eq('id', DB.bus[editIdx.bus].id); if (!res.error) toast('Data bus diperbarui!'); }
  else { res = await db.from('bus').insert(row); if (!res.error) toast('Data bus disimpan!'); }
  if (res.error) return toast('Error: ' + res.error.message, true);
  closeModal('modal-bus'); loadBus(); updateDashboard();
}
// ============================================================
// MULTI DELETE
// ============================================================
var selectedIds = { bus:[], spbu:[], bbm:[], ops:[] };

function toggleSelectAll(type, cb) {
  var checks = document.querySelectorAll('#tbody-' + type + ' .cb-row');
  checks.forEach(function(c) {
    c.checked = cb.checked;
    var row = c.closest('tr');
    if (cb.checked) row.classList.add('selected-row'); else row.classList.remove('selected-row');
  });
  updateBulkBar(type);
}
function onRowCheck(type, cb, id) {
  var row = cb.closest('tr');
  if (cb.checked) row.classList.add('selected-row'); else row.classList.remove('selected-row');
  updateBulkBar(type);
}
function updateBulkBar(type) {
  var checks = document.querySelectorAll('#tbody-' + type + ' .cb-row:checked');
  var bar = document.getElementById('bulk-bar-' + type);
  var cnt = document.getElementById('bulk-count-' + type);
  if (checks.length > 0) { bar.classList.add('show'); cnt.textContent = checks.length + ' data dipilih'; }
  else { bar.classList.remove('show'); }
  // sync select-all header checkbox
  var all = document.querySelectorAll('#tbody-' + type + ' .cb-row');
  var hdr = document.querySelector('#tbl-' + type + ' thead .cb-select');
  if (hdr) hdr.indeterminate = checks.length > 0 && checks.length < all.length;
  if (hdr) hdr.checked = all.length > 0 && checks.length === all.length;
}
function toggleDeleteMode(type) {
  var tbl  = document.getElementById('tbl-' + type);
  var btn  = document.getElementById('btn-delmode-' + type);
  var bar  = document.getElementById('bulk-bar-' + type);
  var isOn = tbl.classList.toggle('delete-mode');
  if (isOn) {
    btn.innerHTML = '<i class="fas fa-times"></i> Batal Hapus';
    btn.style.background = '#e53e3e';
    btn.style.color = '#fff';
  } else {
    btn.innerHTML = '<i class="fas fa-trash"></i> Hapus Data';
    btn.style.background = '';
    btn.style.color = '#e53e3e';
    clearSelect(type);
    bar.classList.remove('show');
  }
}

function clearSelect(type) {
  document.querySelectorAll('#tbody-' + type + ' .cb-row').forEach(function(c){ c.checked=false; c.closest('tr').classList.remove('selected-row'); });
  var hdr = document.querySelector('#tbl-' + type + ' thead .cb-select');
  if(hdr){ hdr.checked=false; hdr.indeterminate=false; }
  document.getElementById('bulk-bar-'+type).classList.remove('show');
}
function getCheckedIds(type) {
  var ids = [];
  document.querySelectorAll('#tbody-' + type + ' .cb-row:checked').forEach(function(c){ ids.push(c.value); });
  return ids;
}
async function bulkDelete(type) {
  var ids = getCheckedIds(type);
  if (!ids.length) return toast('Pilih data terlebih dahulu!', true);
  if (!confirm('Hapus ' + ids.length + ' data yang dipilih?')) return;
  var tbl = type === 'ops' ? 'operasional' : type;
  var res = await db.from(tbl).delete().in('id', ids);
  if (res.error) return toast('Gagal hapus: ' + res.error.message, true);
  toast('✅ ' + ids.length + ' data dihapus.');
  clearSelect(type);
  if(type==='bus')loadBus(); else if(type==='spbu')loadSpbu(); else if(type==='bbm')loadBBM(); else if(type==='ops')loadOps();
  updateDashboard();
}
async function deleteAll(type) {
  var DB_arr = type==='ops' ? DB.ops : DB[type];
  if (!DB_arr.length) return toast('Tidak ada data!', true);
  if (!confirm('⚠️ Hapus SEMUA ' + DB_arr.length + ' data ' + type.toUpperCase() + '? Tindakan ini tidak bisa dibatalkan!')) return;
  var tbl = type === 'ops' ? 'operasional' : type;
  var ids = DB_arr.map(function(r){ return r.id; });
  var res = await db.from(tbl).delete().in('id', ids);
  if (res.error) return toast('Gagal hapus: ' + res.error.message, true);
  toast('✅ Semua data ' + type.toUpperCase() + ' dihapus.');
  clearSelect(type);
  if(type==='bus')loadBus(); else if(type==='spbu')loadSpbu(); else if(type==='bbm')loadBBM(); else if(type==='ops')loadOps();
  updateDashboard();
}

function renderBus() {
  var tbody = document.getElementById('tbody-bus');
  if (!DB.bus.length) { tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><i class="fas fa-bus"></i><p>Belum ada data bus</p></div></td></tr>'; return; }
  tbody.innerHTML = DB.bus.map(function(r, i) {
    return '<tr>'
      +'<td class="freeze-col" style="font-weight:700;color:var(--green-dark);text-align:center;">'+(i+1)+'</td>'
      +'<td><strong>'+r.lambung+'</strong></td><td>'+r.nopol+'</td>'
      +'<td><span class="badge-status badge-aktif">'+r.jalur+'</span></td>'
      +'<td>'+(r.tipe||'-')+'</td><td>'+(r.karoseri||'-')+'</td><td>'+(r.warna||'-')+'</td><td>'+(r.ket||'-')+'</td>'
      +'<td>'+(r.foto?'<img src="'+r.foto+'" style="width:44px;height:32px;object-fit:cover;border-radius:6px;">':'—')+'</td>'
      +'<td><div class="action-btns"><button class="btn btn-outline btn-sm" onclick="editBus('+i+')"><i class="fas fa-edit"></i></button><button class="btn btn-danger btn-sm" onclick="delBus('+i+')"><i class="fas fa-trash"></i></button></div></td>'
      +'<td class="cb-th-hide" style="text-align:center;"><input type="checkbox" class="cb-select cb-row" value="'+r.id+'" onchange="onRowCheck(&quot;bus&quot;,this,&quot;'+r.id+'&quot;)"></td>'
      +'</tr>';
  }).join('');
}
function editBus(i) {
  editIdx.bus = i; var r = DB.bus[i];
  document.getElementById('bus-lambung').value = r.lambung; document.getElementById('bus-nopol').value = r.nopol;
  document.getElementById('bus-jalur').value = r.jalur; document.getElementById('bus-tipe').value = r.tipe||'';
  document.getElementById('bus-karoseri').value = r.karoseri||''; document.getElementById('bus-warna').value = r.warna||''; document.getElementById('bus-ket').value = r.ket||'';
  document.getElementById('modal-bus-title').textContent = 'Edit Data Bus'; openModal('modal-bus');
}
async function delBus(i) {
  if (!confirm('Hapus data bus ini?')) return;
  var res = await db.from('bus').delete().eq('id', DB.bus[i].id);
  if (res.error) return toast('Gagal hapus: ' + res.error.message, true);
  toast('Data bus dihapus.'); loadBus(); updateDashboard();
}

// ============================================================
// SPBU
// ============================================================
async function loadSpbu() {
  setLoading('tbody-spbu', 6);
  var r = await fetchAll('spbu', 'created_at', false);
  if (r.error) return toast('Gagal memuat SPBU: ' + r.error.message, true);
  DB.spbu = r.data.map(function(d) { return { id:d.id, kode:d.kode||'', nama:d.nama, alamat:d.alamat||'', hp:d.hp||'', aktif:d.aktif }; });
  renderSpbu();
  applyFreeze('tbl-spbu'); populateSpbuDropdowns();
}
async function saveSpbu() {
  var nama = document.getElementById('spbu-nama').value.trim();
  if (!nama) return toast('Nama SPBU wajib diisi!', true);
  var row = { kode:document.getElementById('spbu-kode').value.trim(), nama:nama, alamat:document.getElementById('spbu-alamat').value, hp:document.getElementById('spbu-hp').value, aktif:document.getElementById('spbu-status').value==='1' };
  var res;
  if (editIdx.spbu >= 0) { res = await db.from('spbu').update(row).eq('id', DB.spbu[editIdx.spbu].id); if (!res.error) toast('Data SPBU diperbarui!'); }
  else { res = await db.from('spbu').insert(row); if (!res.error) toast('Data SPBU disimpan!'); }
  if (res.error) return toast('Error: ' + res.error.message, true);
  closeModal('modal-spbu'); loadSpbu(); updateDashboard();
}
function renderSpbu() {
  var tbody = document.getElementById('tbody-spbu');
  if (!DB.spbu.length) { tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-gas-pump"></i><p>Belum ada data SPBU</p></div></td></tr>'; return; }
  tbody.innerHTML = DB.spbu.map(function(r, i) {
    return '<tr>'
      + '<td class="freeze-col" style="font-weight:700;color:var(--green-dark);text-align:center;">' + (i+1) + '</td>'
      + '<td><strong>' + r.nama + '</strong></td>'
      + '<td><span style="font-family:monospace;font-size:12px;background:var(--green-pale);color:var(--green-dark);padding:3px 10px;border-radius:6px;font-weight:700;">' + (r.kode||'—') + '</span></td>'
      + '<td>' + (r.alamat||'-') + '</td>'
      + '<td>' + (r.hp||'-') + '</td>'
      + '<td><span class="badge-status ' + (r.aktif?'badge-aktif':'badge-nonaktif') + '">' + (r.aktif?'Aktif':'Tidak Aktif') + '</span></td>'
      + '<td><div class="action-btns"><button class="btn btn-outline btn-sm" onclick="editSpbu(' + i + ')"><i class="fas fa-edit"></i></button><button class="btn btn-danger btn-sm" onclick="delSpbu(' + i + ')"><i class="fas fa-trash"></i></button></div></td>'
      + '<td class="cb-th-hide" style="text-align:center;"><input type="checkbox" class="cb-select cb-row" value="'+r.id+'" onchange="onRowCheck(&quot;spbu&quot;,this,&quot;'+r.id+'&quot;)"></td>'
      + '</tr>';
  }).join('');
}
function editSpbu(i) {
  editIdx.spbu = i; var r = DB.spbu[i];
  document.getElementById('spbu-nama').value = r.nama; document.getElementById('spbu-kode').value = r.kode||'';
  document.getElementById('spbu-alamat').value = r.alamat||''; document.getElementById('spbu-hp').value = r.hp||'';
  document.getElementById('spbu-status').value = r.aktif?'1':'0';
  document.getElementById('modal-spbu-title').textContent = 'Edit Data SPBU'; openModal('modal-spbu');
}
async function delSpbu(i) {
  if (!confirm('Hapus data SPBU ini?')) return;
  var res = await db.from('spbu').delete().eq('id', DB.spbu[i].id);
  if (res.error) return toast('Gagal hapus: ' + res.error.message, true);
  toast('Data SPBU dihapus.'); loadSpbu(); updateDashboard();
}

// ============================================================
// BBM
// ============================================================
function populateLambDropdowns() {
  ['bbm-lambung','ops-lambung'].forEach(function(id) {
    var sel = document.getElementById(id); if (!sel) return;
    var val = sel.value;
    sel.innerHTML = '<option value="">-- Pilih Lambung --</option>' + DB.bus.map(function(b) { return '<option value="' + b.lambung + '">' + b.lambung + ' — ' + b.nopol + '</option>'; }).join('');
    sel.value = val;
  });
}
function populateSpbuDropdowns() {
  var sel = document.getElementById('bbm-spbu'); if (!sel) return;
  var val = sel.value;
  sel.innerHTML = '<option value="">-- Pilih SPBU --</option>' + DB.spbu.filter(function(s){return s.aktif;}).map(function(s){return '<option value="' + s.nama + '">' + s.nama + '</option>';}).join('');
  sel.value = val;
}
function autofillBBM() {
  var bus = DB.bus.find(function(b){return b.lambung===document.getElementById('bbm-lambung').value;});
  document.getElementById('bbm-jalur').value = bus ? bus.jalur : '';
  document.getElementById('bbm-nopol').value = bus ? bus.nopol : '';
}
async function loadBBM() {
  setLoading('tbody-bbm', 12);
  var r = await fetchAll('bbm', 'tgl', false);
  if (r.error) return toast('Gagal memuat BBM: ' + r.error.message, true);
  DB.bbm = r.data.map(function(d){return{id:d.id,tgl:d.tgl,lambung:d.lambung,jalur:d.jalur,nopol:d.nopol,waktu:d.waktu,nominal:d.nominal,spbu:d.spbu,halte:d.halte,jamHalte:d.jam_halte,ket:d.ket};});
  renderBBM();
  applyFreeze('tbl-bbm');
}
async function saveBBM() {
  var tgl=document.getElementById('bbm-tgl').value, lamb=document.getElementById('bbm-lambung').value, nominal=document.getElementById('bbm-nominal').value;
  if (!tgl||!lamb||!nominal) return toast('Tanggal, Lambung, dan Nominal wajib diisi!',true);
  var jamHalteEl=document.getElementById('bbm-jam-halte');
  var row={tgl:tgl,lambung:lamb,jalur:document.getElementById('bbm-jalur').value,nopol:document.getElementById('bbm-nopol').value,waktu:document.getElementById('bbm-waktu').value||null,nominal:parseFloat(nominal),spbu:document.getElementById('bbm-spbu').value,halte:document.getElementById('bbm-halte').value,jam_halte:jamHalteEl?jamHalteEl.value||null:null,ket:document.getElementById('bbm-ket').value};
  var res;
  if (editIdx.bbm>=0){res=await db.from('bbm').update(row).eq('id',DB.bbm[editIdx.bbm].id);if(!res.error)toast('Data BBM diperbarui!');}
  else{res=await db.from('bbm').insert(row);if(!res.error)toast('Data BBM disimpan!');}
  if(res.error)return toast('Error: '+res.error.message,true);
  closeModal('modal-bbm'); loadBBM(); updateDashboard();
}
function renderBBM() {
  var tbody=document.getElementById('tbody-bbm');
  if(!DB.bbm.length){tbody.innerHTML='<tr><td colspan="12"><div class="empty-state"><i class="fas fa-fill-drip"></i><p>Belum ada data BBM</p></div></td></tr>';return;}
  tbody.innerHTML=DB.bbm.map(function(r,i){
    return '<tr>'
      +'<td class="freeze-col" style="font-weight:700;color:var(--green-dark);text-align:center;">'+(i+1)+'</td>'
      +'<td>'+r.tgl+'</td><td><strong>'+r.lambung+'</strong></td><td>'+r.jalur+'</td><td>'+r.nopol+'</td>'
      +'<td>'+(r.waktu||'-')+'</td><td>Rp '+Number(r.nominal).toLocaleString()+'</td>'
      +'<td>'+(r.spbu||'-')+'</td><td>'+(r.halte||'-')+'</td><td>'+(r.jamHalte||'-')+'</td><td>'+(r.ket||'-')+'</td>'
      +'<td><div class="action-btns"><button class="btn btn-outline btn-sm" onclick="editBBM('+i+')"><i class="fas fa-edit"></i></button><button class="btn btn-danger btn-sm" onclick="delBBM('+i+')"><i class="fas fa-trash"></i></button></div></td>'
      +'<td class="cb-th-hide" style="text-align:center;"><input type="checkbox" class="cb-select cb-row" value="'+r.id+'" onchange="onRowCheck(&quot;bbm&quot;,this,&quot;'+r.id+'&quot;)"></td>'
      +'</tr>';
  }).join('');
}
function editBBM(i) {
  editIdx.bbm=i;var r=DB.bbm[i];populateLambDropdowns();populateSpbuDropdowns();
  document.getElementById('bbm-tgl').value=r.tgl;document.getElementById('bbm-lambung').value=r.lambung;autofillBBM();
  document.getElementById('bbm-waktu').value=r.waktu||'';document.getElementById('bbm-nominal').value=r.nominal;
  document.getElementById('bbm-spbu').value=r.spbu||'';document.getElementById('bbm-halte').value=r.halte||'';
  if(document.getElementById('bbm-jam-halte'))document.getElementById('bbm-jam-halte').value=r.jamHalte||'';
  document.getElementById('bbm-ket').value=r.ket||'';
  document.getElementById('modal-bbm-title').textContent='Edit Data BBM';openModal('modal-bbm');
}
async function delBBM(i) {
  if(!confirm('Hapus data BBM ini?'))return;
  var res=await db.from('bbm').delete().eq('id',DB.bbm[i].id);
  if(res.error)return toast('Gagal hapus: '+res.error.message,true);
  toast('Data BBM dihapus.');loadBBM();updateDashboard();
}

// ============================================================
// OPERASIONAL
// ============================================================
function autofillOps() {
  var lambung = document.getElementById('ops-lambung').value;
  var tgl     = document.getElementById('ops-tgl').value;

  // 1. Autofill jalur & nopol dari data bus
  var bus = DB.bus.find(function(b){ return b.lambung === lambung; });
  document.getElementById('ops-jalur').value = bus ? bus.jalur : '';
  document.getElementById('ops-nopol').value = bus ? bus.nopol : '';

  // 2. Autofill BBM total dari data BBM hari itu + lambung sama
  if (lambung && tgl) {
    fillBBMFromData(tgl, lambung);
  }
}

function fillBBMFromData(tgl, lambung) {
  // Cari semua record BBM dengan tanggal & lambung yang sama
  var bbmRecords = DB.bbm.filter(function(r) {
    return r.tgl === tgl && r.lambung === lambung;
  });

  if (bbmRecords.length > 0) {
    // Total nominal BBM pada hari itu
    var totalBBM = bbmRecords.reduce(function(sum, r) {
      return sum + (parseFloat(r.nominal) || 0);
    }, 0);

    // Waktu pengisian pertama & terakhir
    var waktuList = bbmRecords
      .map(function(r){ return r.waktu; })
      .filter(Boolean)
      .sort();

    document.getElementById('ops-bbm').value = totalBBM;

    // Info notif berapa pengisian ditemukan
    var info = document.getElementById('ops-bbm-info');
    if (info) {
      info.textContent = '✓ ' + bbmRecords.length + ' pengisian BBM ditemukan — Total: Rp ' + totalBBM.toLocaleString();
      info.style.display = 'block';
    }

    // Recalculate ratio
    calcOps();
  } else {
    var info = document.getElementById('ops-bbm-info');
    if (info) {
      info.textContent = '';
      info.style.display = 'none';
    }
  }
}
function calcOps() {
  var kmAwalPool  = parseFloat(document.getElementById('ops-km-awal-pool').value)  || 0;
  var kmAkhirPool = parseFloat(document.getElementById('ops-km-akhir-pool').value) || 0;
  var kmAwalHalte  = parseFloat(document.getElementById('ops-km-awal-halte').value)  || 0;
  var kmAkhirHalte = parseFloat(document.getElementById('ops-km-akhir-halte').value) || 0;
  var bbm = parseFloat(document.getElementById('ops-bbm').value) || 0;

  // Km Tempuh = (Km Akhir Pool - Km Awal Pool) atau pakai halte jika pool tidak ada
  var kmTempuh = 0;
  if (kmAkhirPool > 0 && kmAwalPool > 0) {
    kmTempuh = kmAkhirPool - kmAwalPool;
  } else if (kmAkhirHalte > 0 && kmAwalHalte > 0) {
    kmTempuh = kmAkhirHalte - kmAwalHalte;
  }

  if (kmTempuh > 0) {
    document.getElementById('ops-km-tempuh').value = kmTempuh.toFixed(1);
    if (bbm > 0) {
      var liter = bbm / 6800;
      document.getElementById('ops-ratio').value = (kmTempuh / liter).toFixed(2);
    }
  } else {
    document.getElementById('ops-km-tempuh').value = '';
    document.getElementById('ops-ratio').value = '';
  }
}
async function loadOps() {
  setLoading('tbody-ops',17);
  var r=await fetchAll('operasional','tgl',false);
  if(r.error)return toast('Gagal memuat operasional: '+r.error.message,true);
  DB.ops=r.data.map(function(d){return{id:d.id,tgl:d.tgl,lambung:d.lambung,jalur:d.jalur,nopol:d.nopol,jamMulai:d.jam_mulai,jamAkhir:d.jam_akhir,kmAwalPool:d.km_awal_pool,kmAkhirPool:d.km_akhir_pool,kmAwalHalte:d.km_awal_halte,kmAkhirHalte:d.km_akhir_halte,bbm:d.bbm_rp,rit:d.rit,kmTempuh:d.km_tempuh,ratio:d.ratio,ket:d.ket};});
  renderOps();
  applyFreeze('tbl-ops');
}
async function saveOps() {
  var tgl=document.getElementById('ops-tgl').value,lamb=document.getElementById('ops-lambung').value;
  if(!tgl||!lamb)return toast('Tanggal dan Lambung wajib diisi!',true);
  var jm=document.getElementById('ops-jam-mulai').value,ja=document.getElementById('ops-jam-akhir').value;
  var bbmVal=parseFloat(document.getElementById('ops-bbm').value)||0;
  var kmTempuh=null,ratio=null;
  var kmAP=parseFloat(document.getElementById('ops-km-awal-pool').value)||0;
  var kmKP=parseFloat(document.getElementById('ops-km-akhir-pool').value)||0;
  var kmAH=parseFloat(document.getElementById('ops-km-awal-halte').value)||0;
  var kmKH=parseFloat(document.getElementById('ops-km-akhir-halte').value)||0;
  if(kmKP>0&&kmAP>0){kmTempuh=parseFloat((kmKP-kmAP).toFixed(1));}
  else if(kmKH>0&&kmAH>0){kmTempuh=parseFloat((kmKH-kmAH).toFixed(1));}
  if(kmTempuh&&bbmVal>0){ratio=parseFloat((kmTempuh/(bbmVal/6800)).toFixed(2));}
  var row={tgl:tgl,lambung:lamb,jalur:document.getElementById('ops-jalur').value,nopol:document.getElementById('ops-nopol').value,jam_mulai:jm||null,jam_akhir:ja||null,km_awal_pool:parseFloat(document.getElementById('ops-km-awal-pool').value)||null,km_akhir_pool:parseFloat(document.getElementById('ops-km-akhir-pool').value)||null,km_awal_halte:parseFloat(document.getElementById('ops-km-awal-halte').value)||null,km_akhir_halte:parseFloat(document.getElementById('ops-km-akhir-halte').value)||null,bbm_rp:bbmVal,rit:parseInt(document.getElementById('ops-rit').value)||0,km_tempuh:kmTempuh,ratio:ratio,ket:document.getElementById('ops-ket').value};
  var res;
  if(editIdx.ops>=0){res=await db.from('operasional').update(row).eq('id',DB.ops[editIdx.ops].id);if(!res.error)toast('Data operasional diperbarui!');}
  else{res=await db.from('operasional').insert(row);if(!res.error)toast('Data operasional disimpan!');}
  if(res.error)return toast('Error: '+res.error.message,true);
  closeModal('modal-ops');loadOps();updateDashboard();
}
function renderOps() {
  var tbody=document.getElementById('tbody-ops');
  if(!DB.ops.length){tbody.innerHTML='<tr><td colspan="17"><div class="empty-state"><i class="fas fa-clipboard-list"></i><p>Belum ada data operasional</p></div></td></tr>';return;}
  tbody.innerHTML=DB.ops.map(function(r,i){
    function fmtKm(v){ return v ? Number(v).toLocaleString('id-ID') : '-'; }
    return '<tr>'
      +'<td class="freeze-col" style="font-weight:700;color:var(--green-dark);text-align:center;">'+(i+1)+'</td>'
      +'<td>'+r.tgl+'</td>'
      +'<td><strong>'+r.lambung+'</strong></td>'
      +'<td>'+r.jalur+'</td>'
      +'<td>'+r.nopol+'</td>'
      +'<td>'+(r.jamMulai||'-')+'</td>'
      +'<td>'+(r.jamAkhir||'-')+'</td>'
      +'<td>'+fmtKm(r.kmAwalPool)+'</td>'
      +'<td>'+fmtKm(r.kmAkhirPool)+'</td>'
      +'<td>'+fmtKm(r.kmAwalHalte)+'</td>'
      +'<td>'+fmtKm(r.kmAkhirHalte)+'</td>'
      +'<td>Rp '+(r.bbm?Number(r.bbm).toLocaleString('id-ID'):'-')+'</td>'
      +'<td>'+(r.rit||'-')+'</td>'
      +'<td><strong>'+(r.kmTempuh ? Number(r.kmTempuh).toLocaleString('id-ID')+' Km' : '-')+'</strong></td>'
      +'<td>'+(r.ratio||'-')+'</td>'
      +'<td>'+(r.ket||'-')+'</td>'
      +'<td><div class="action-btns"><button class="btn btn-outline btn-sm" onclick="editOps('+i+')"><i class="fas fa-edit"></i></button><button class="btn btn-danger btn-sm" onclick="delOps('+i+')"><i class="fas fa-trash"></i></button></div></td>'
      +'<td class="cb-th-hide" style="text-align:center;"><input type="checkbox" class="cb-select cb-row" value="'+r.id+'" onchange="onRowCheck(&quot;ops&quot;,this,&quot;'+r.id+'&quot;)"></td>'
      +'</tr>';
  }).join('');
}
function editOps(i) {
  editIdx.ops=i;var r=DB.ops[i];populateLambDropdowns();
  document.getElementById('ops-tgl').value=r.tgl;document.getElementById('ops-lambung').value=r.lambung;autofillOps();
  document.getElementById('ops-jam-mulai').value=r.jamMulai||'';document.getElementById('ops-jam-akhir').value=r.jamAkhir||'';
  document.getElementById('ops-km-awal-pool').value=r.kmAwalPool||'';document.getElementById('ops-km-akhir-pool').value=r.kmAkhirPool||'';
  document.getElementById('ops-km-awal-halte').value=r.kmAwalHalte||'';document.getElementById('ops-km-akhir-halte').value=r.kmAkhirHalte||'';
  document.getElementById('ops-bbm').value=r.bbm||'';document.getElementById('ops-rit').value=r.rit||'';
  document.getElementById('ops-km-tempuh').value=r.kmTempuh||'';document.getElementById('ops-ratio').value=r.ratio||'';
  document.getElementById('ops-ket').value=r.ket||'';
  document.getElementById('modal-ops-title').textContent='Edit Data Operasional';openModal('modal-ops');
}
async function delOps(i) {
  if(!confirm('Hapus data operasional ini?'))return;
  var res=await db.from('operasional').delete().eq('id',DB.ops[i].id);
  if(res.error)return toast('Gagal hapus: '+res.error.message,true);
  toast('Data operasional dihapus.');loadOps();updateDashboard();
}

// ============================================================
// FILTER & LAPORAN
// ============================================================
function filterTable(tableId,keyword) {
  document.querySelectorAll('#'+tableId+' tbody tr').forEach(function(row){row.style.display=row.textContent.toLowerCase().includes(keyword.toLowerCase())?'':'none';});
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
  var data=DB.bbm.slice();if(tglM)data=data.filter(function(r){return r.tgl>=tglM;});if(tglA)data=data.filter(function(r){return r.tgl<=tglA;});if(lambF)data=data.filter(function(r){return r.lambung===lambF;});
  var el=document.getElementById('result-lap-bbm');
  if(!data.length){el.innerHTML='<div class="card"><div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada data</p></div></div>';return;}
  var lambs=[...new Set(data.map(function(r){return r.lambung;}))].sort(),dates=[...new Set(data.map(function(r){return r.tgl;}))].sort();
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
  var data=DB.ops.slice();if(tglM)data=data.filter(function(r){return r.tgl>=tglM;});if(tglA)data=data.filter(function(r){return r.tgl<=tglA;});if(lambF)data=data.filter(function(r){return r.lambung===lambF;});
  var el=document.getElementById('result-lap-ops');
  if(!data.length){el.innerHTML='<div class="card"><div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada data</p></div></div>';return;}
  var lambs=[...new Set(data.map(function(r){return r.lambung;}))].sort();
  var rows=lambs.map(function(lamb){var items=data.filter(function(r){return r.lambung===lamb;});var jalur=items[0]?items[0].jalur:'-';var totalJam=items.reduce(function(s,r){return s+(Number(r.kmTempuh)||0);},0);var totalBBM=items.reduce(function(s,r){return s+(Number(r.bbm)||0);},0);var totalRit=items.reduce(function(s,r){return s+(Number(r.rit)||0);},0);var liter=totalBBM/6800;var ratio=liter>0?(totalJam/liter).toFixed(2):'-';return{lamb:lamb,jalur:jalur,totalJam:totalJam,totalBBM:totalBBM,liter:liter.toFixed(2),ratio:ratio,totalRit:totalRit};});
  var gBBM=rows.reduce(function(s,r){return s+r.totalBBM;},0),gRit=rows.reduce(function(s,r){return s+r.totalRit;},0);
  el.innerHTML='<div class="card"><div class="card-header"><div class="card-title">Rekapitulasi Operasional</div></div><div class="report-summary"><div class="sum-card"><div class="val">'+rows.length+'</div><div class="lbl">Lambung</div></div><div class="sum-card"><div class="val">'+gRit+'</div><div class="lbl">Total Ritase</div></div><div class="sum-card"><div class="val">Rp '+gBBM.toLocaleString()+'</div><div class="lbl">Total BBM (Rp)</div></div><div class="sum-card"><div class="val">'+( gBBM/6800).toFixed(1)+' L</div><div class="lbl">Total BBM (L)</div></div></div><div class="table-outer"><table><thead><tr><th>Lambung</th><th>Jalur</th><th>Total Jam (mnt)</th><th>BBM (L)</th><th>Rasio</th><th>Total BBM (Rp)</th><th>Total Ritase</th></tr></thead><tbody>'+rows.map(function(r){return'<tr><td><strong>'+r.lamb+'</strong></td><td>'+r.jalur+'</td><td>'+r.totalJam+'</td><td>'+r.liter+'</td><td>'+r.ratio+'</td><td>Rp '+r.totalBBM.toLocaleString()+'</td><td>'+r.totalRit+'</td></tr>';}).join('')+'<tr style="background:var(--green-pale);border-top:2px solid var(--green-main);"><td colspan="2"><strong style="color:var(--green-dark);">TOTAL</strong></td><td><strong style="color:var(--green-dark);">'+rows.reduce(function(s,r){return s+r.totalJam;},0)+'</strong></td><td><strong style="color:var(--green-dark);">'+(gBBM/6800).toFixed(2)+'</strong></td><td>-</td><td><strong style="color:var(--green-dark);">Rp '+gBBM.toLocaleString()+'</strong></td><td><strong style="color:var(--green-dark);">'+gRit+'</strong></td></tr></tbody></table></div></div></div>';
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
      else if(type==='bbm')records=rows.filter(function(r){return r.Tanggal||r.tgl;}).map(function(r){return{tgl:excelDateToStr(r.Tanggal||r.tgl),lambung:r.Lambung||r.lambung||'',jalur:r.Jalur||r.jalur||'',nopol:r['No Polisi']||r.nopol||'',waktu:excelTimeToStr(r['Waktu Pengisian']||r.waktu),nominal:parseFloat(r.Nominal||r.nominal||0),spbu:r.SPBU||r.spbu||'',halte:r['Halte Terakhir']||r.halte||'',jam_halte:excelTimeToStr(r['Jam Halte Terakhir']),ket:r.Keterangan||r.ket||''};});
      else if(type==='ops'){
        // Fetch fresh BBM dari Supabase untuk lookup akurat
        var bbmLookup = {};
        toast('⏳ Mengambil data BBM...');
        var bbmFetch = await fetchAll('bbm','tgl',false);
        var bbmSource = (bbmFetch.data && bbmFetch.data.length) ? bbmFetch.data : DB.bbm;
        bbmSource.forEach(function(b){
          var key = b.tgl+'|'+String(b.lambung).trim();
          bbmLookup[key] = (bbmLookup[key]||0) + parseFloat(b.nominal||0);
        });
        var lookupCount = Object.keys(bbmLookup).length;
        console.log('BBM lookup entries:', lookupCount, 'dari', bbmSource.length, 'record');
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
      if(type==='ops'){
        var matched=records.filter(function(r){return r.bbm_rp>0;}).length;
        console.log('OPS rows with BBM filled:', matched, '/', records.length);
      }
      var tbl=type==='ops'?'operasional':type;var inserted=0;
      for(var i=0;i<records.length;i+=100){
        var chunk=records.slice(i,i+100);
        var res=await db.from(tbl).upsert(chunk,{ignoreDuplicates:true});
        if(res.error){toast('Error import: '+res.error.message,true);return;}
        inserted+=chunk.length;
      }
      input.value='';
      if(type==='bus')await loadBus();if(type==='spbu')await loadSpbu();if(type==='bbm')await loadBBM();if(type==='ops')await loadOps();
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
  if(type==='ops'){data=DB.ops.map(function(r){return{ID:r.id,Tanggal:r.tgl,Lambung:r.lambung,Jalur:r.jalur,'No Polisi':r.nopol,'Jam Mulai':r.jamMulai,'Jam Akhir':r.jamAkhir,'BBM(Rp)':r.bbm,RIT:r.rit,'Km Tempuh':r.kmTempuh,Ratio:r.ratio,Keterangan:r.ket};});fn='DataOperasional.xlsx';}
  if(!data.length)return toast('Tidak ada data!',true);
  var ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Sheet1');XLSX.writeFile(wb,fn);toast('Export Excel berhasil!');
}
function exportExcelReport(type) {
  var data=[],fn='';
  if(type==='lap-bbm'){data=DB.bbm.map(function(r){return{Tanggal:r.tgl,Lambung:r.lambung,Nominal:r.nominal,SPBU:r.spbu};});fn='LaporanBBM.xlsx';}
  if(type==='lap-ops'){data=DB.ops.map(function(r){return{Tanggal:r.tgl,Lambung:r.lambung,'BBM(Rp)':r.bbm,'Km Tempuh':r.kmTempuh,Ratio:r.ratio,RIT:r.rit};});fn='LaporanOperasional.xlsx';}
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
    var vs=type==='lap-ops'?[r.tgl,r.lambung,r.jalur,r.jamMulai||'-',r.jamAkhir||'-','Rp'+r.bbm,String(r.rit||'-'),String(r.ratio||'-')]:[r.tgl,r.lambung,r.waktu||'-','Rp'+Number(r.nominal).toLocaleString(),r.spbu||'-'];
    vs.forEach(function(v,j){doc.text(String(v).substring(0,18),15+j*cw,y+5);});y+=8;
  });
  doc.save('Laporan_'+type+'_TransJogja.pdf');toast('Export PDF berhasil!');
}
function previewFoto(input,previewId) {
  var el=document.getElementById(previewId);
  if(input.files[0])el.innerHTML='<img src="'+URL.createObjectURL(input.files[0])+'" style="max-width:160px;max-height:90px;border-radius:8px;border:2px solid var(--green-light);">';
}

// ============================================================
// DASHBOARD
// ============================================================
async function updateDashboard() {
  var results=await Promise.all([
    db.from('bus').select('id',{count:'exact',head:true}),
    db.from('spbu').select('id',{count:'exact',head:true}),
    db.from('bbm').select('id',{count:'exact',head:true}),
    db.from('operasional').select('id',{count:'exact',head:true})
  ]);
  document.getElementById('stat-bus').textContent=results[0].count||0;
  document.getElementById('stat-bbm').textContent=results[2].count||0;
  document.getElementById('stat-ops').textContent=results[3].count||0;
  document.getElementById('stat-spbu').textContent=results[1].count||0;
  document.getElementById('banner-bus').textContent=results[0].count||0;
  var aktif=await db.from('spbu').select('id',{count:'exact',head:true}).eq('aktif',true);
  document.getElementById('banner-spbu').textContent=aktif.count||0;
  var today=new Date().toISOString().split('T')[0];
  var todayOps=await db.from('operasional').select('id',{count:'exact',head:true}).eq('tgl',today);
  document.getElementById('banner-ops').textContent=todayOps.count||0;
  var days=[];for(var i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().split('T')[0]);}
  var bbm7=await db.from('bbm').select('tgl').gte('tgl',days[0]);
  var chart=document.getElementById('chart-bbm');
  if(bbm7.data&&bbm7.data.length){
    var cnts=days.map(function(d){return bbm7.data.filter(function(r){return r.tgl===d;}).length;});
    var mx=Math.max.apply(null,cnts.concat([1]));
    chart.innerHTML=cnts.map(function(c,i){return'<div class="bar-wrap"><div class="bar-val">'+c+'</div><div class="bar" style="height:'+Math.max((c/mx)*100,4)+'%"></div><div class="bar-label">'+days[i].slice(5)+'</div></div>';}).join('');
  } else {
    chart.innerHTML='<div style="display:flex;align-items:center;justify-content:center;width:100%;color:var(--gray-400);font-size:13px;">Belum ada data BBM</div>';
  }
  var acts=await Promise.all([
    db.from('bbm').select('lambung,nominal,created_at').order('created_at',{ascending:false}).limit(5),
    db.from('operasional').select('lambung,tgl,created_at').order('created_at',{ascending:false}).limit(5)
  ]);
  var actList=[].concat(
    (acts[0].data||[]).map(function(r){return{icon:'⛽',title:'BBM '+r.lambung,meta:'Rp '+Number(r.nominal).toLocaleString(),time:new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})};})
  ).concat(
    (acts[1].data||[]).map(function(r){return{icon:'📋',title:'Operasional '+r.lambung,meta:'Tgl '+r.tgl,time:new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})};})
  ).slice(0,8);
  var al=document.getElementById('activity-list');
  al.innerHTML=actList.length?actList.map(function(a){return'<div class="activity-item"><div class="activity-dot" style="background:var(--green-pale)">'+a.icon+'</div><div class="activity-info"><div class="title">'+a.title+'</div><div class="meta">'+a.meta+'</div></div><div class="activity-time">'+a.time+'</div></div>';}).join(''):'<div class="empty-state"><i class="fas fa-history"></i><p>Belum ada aktivitas</p></div>';
}
async function refreshData() {
  var page=document.querySelector('.page.active');
  var id=page?page.id.replace('page-',''):'';
  if(id==='data-bus')await loadBus();if(id==='data-spbu')await loadSpbu();
  if(id==='input-bbm')await loadBBM();if(id==='input-ops')await loadOps();
  await updateDashboard();toast('Data diperbarui!');
}

// ============================================================
// INIT — script jalan setelah HTML selesai (defer)
// ============================================================
setDateNow();

// sidebar: buka di desktop, tutup di mobile
sidebarOpen = window.innerWidth > 900;
applySidebarState();

// modal: klik di luar untuk tutup
document.querySelectorAll('.modal-overlay').forEach(function(m) {
  m.addEventListener('click', function(e) { if (e.target === m) closeModal(m.id); });
});

// Render perm grid saat modal akun dibuka
var _maEl = document.getElementById('modal-akun');
if (_maEl) _maEl.addEventListener('transitionend', function(){
  if(this.classList.contains('open') && editIdx.akun < 0) renderPermGrid();
});

// Cek session login
var savedUser = sessionStorage.getItem('tjUser');
if (savedUser) {
  try {
    currentUser = JSON.parse(savedUser);
    applyUserSession();
  } catch(e) { sessionStorage.removeItem('tjUser'); }
}
// Jika tidak ada session, login screen tetap tampil
  --green-light: #4caf63;
  --green-pale: #e8f5eb;
  --yellow: #f5c518;
  --yellow-dark: #d4a800;
  --white: #ffffff;
  --gray-100: #f4f6f5;
  --gray-200: #e2e8e4;
  --gray-400: #8fa898;
  --gray-600: #4a6357;
  --gray-800: #1e3028;
  --shadow-sm: 0 2px 8px rgba(45,138,62,0.10);
  --shadow-md: 0 6px 24px rgba(45,138,62,0.13);
  --shadow-lg: 0 16px 48px rgba(45,138,62,0.16);
  --radius: 16px;
  --radius-sm: 10px;
  --sidebar-w: 260px;
  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body: 'DM Sans', sans-serif;
}

* { margin:0; padding:0; box-sizing:border-box; }
body {
  font-family: var(--font-body);
  background: var(--gray-100);
  color: var(--gray-800);
  min-height: 100vh;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}

/* ========== SIDEBAR ========== */
.sidebar {
  width: var(--sidebar-w);
  background: linear-gradient(175deg, var(--green-dark) 0%, #0e3a1b 100%);
  min-height: 100vh;
  position: fixed; left:0; top:0; bottom:0;
  display: flex; flex-direction: column;
  box-shadow: 4px 0 24px rgba(0,0,0,0.18);
  z-index: 200;
  transition: transform 0.32s cubic-bezier(0.4,0,0.2,1);
  transform: translateX(-100%);
}
.sidebar.open {
  transform: translateX(0);
}

.sidebar-overlay {
  display: block;
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 150;
  backdrop-filter: blur(2px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}
.sidebar-overlay.show { opacity: 1; pointer-events: auto; }

.btn-toggle-sidebar {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: 9px;
  background: var(--gray-100); border: none; cursor: pointer;
  color: var(--gray-600); font-size: 16px;
  transition: all 0.2s; margin-right: 8px; flex-shrink: 0;
}
.btn-toggle-sidebar:hover { background: var(--green-pale); color: var(--green-main); }

.sidebar-logo {
  padding: 28px 24px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.09);
  display: flex; align-items: center; gap: 14px;
}
.logo-icon {
  width: 46px; height: 46px; min-width: 46px; min-height: 46px;
  background: transparent; border-radius: 12px;
  display: flex; align-items:center; justify-content:center;
  flex-shrink:0; aspect-ratio:1/1; overflow:hidden;
}
.logo-text { color: white; }
.logo-text .title {
  font-family: var(--font-display);
  font-size: 17px; font-weight: 700; line-height: 1.2;
  letter-spacing: 0.3px;
}
.logo-text .sub {
  font-size: 9.5px; color: rgba(255,255,255,0.5);
  letter-spacing: 2px; text-transform: uppercase; margin-top: 3px;
  font-family: var(--font-body); font-weight: 400;
}

.sidebar-nav { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent; }
.sidebar-nav::-webkit-scrollbar { width: 4px; }
.sidebar-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 4px; }
.sidebar-section { padding: 18px 12px 6px; }
.sidebar-section-label {
  font-size: 9.5px; letter-spacing: 1.8px; text-transform:uppercase;
  color: rgba(255,255,255,0.35); padding: 0 10px; margin-bottom: 6px;
  font-family: var(--font-body);
}
.nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: var(--radius-sm);
  color: rgba(255,255,255,0.65); font-size: 13.5px; font-weight: 500;
  cursor: pointer; transition: all 0.2s; margin-bottom: 2px;
  border: none; background:transparent; width:100%; text-align:left;
  font-family: var(--font-body);
}
.nav-item:hover { background: rgba(255,255,255,0.09); color:white; }
.nav-item.active { background: var(--green-light); color: white; box-shadow: 0 4px 14px rgba(76,175,99,0.4); }
.nav-item .icon { width:32px; height:32px; border-radius:8px; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
.nav-item.active .icon { background:rgba(255,255,255,0.22); }
.nav-item .badge { margin-left:auto; background:var(--yellow); color:var(--green-dark); font-size:10px; font-weight:700; padding:2px 7px; border-radius:20px; }

.sidebar-footer { margin-top:auto; padding:16px; border-top:1px solid rgba(255,255,255,0.09); }
.user-card { display:flex; align-items:center; gap:10px; padding:10px; border-radius:10px; background:rgba(255,255,255,0.07); }
.user-avatar { width:34px; height:34px; border-radius:50%; background:var(--yellow); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:var(--green-dark); flex-shrink:0; }
.user-info .name { font-size:12.5px; font-weight:600; color:white; font-family: var(--font-body); }
.user-info .role { font-size:10.5px; color:rgba(255,255,255,0.45); font-family: var(--font-body); }

/* ========== MAIN ========== */
.main {
  margin-left: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: margin-left 0.32s cubic-bezier(0.4,0,0.2,1);
  overflow-x: hidden;
}
.main.sidebar-open { 
  margin-left: var(--sidebar-w);
}

.topbar {
  background: white; padding: 16px 28px;
  display:flex; align-items:center; justify-content:space-between;
  border-bottom: 1px solid var(--gray-200); position:sticky; top:0; z-index:50;
  box-shadow: var(--shadow-sm);
}
.topbar-left {
  display: flex; align-items: center; gap: 4px;
}
.topbar-left h1 {
  font-family: var(--font-display);
  font-size: 22px; font-weight: 700; color: var(--green-dark);
  letter-spacing: 0.2px;
}
.topbar-left p { font-size:12px; color:var(--gray-400); margin-top:2px; display:block; margin-left:2px; }
.topbar-right { display:flex; align-items:center; gap:12px; }

.btn { padding:9px 18px; border-radius:var(--radius-sm); font-size:13px; font-weight:600; cursor:pointer; border:none; display:inline-flex; align-items:center; gap:7px; transition:all 0.2s; font-family: var(--font-body); }
.btn-primary { background:var(--green-main); color:white; box-shadow:0 4px 14px rgba(45,138,62,0.3); }
.btn-primary:hover { background:var(--green-dark); transform:translateY(-1px); }
.btn-yellow { background:var(--yellow); color:var(--green-dark); }
.btn-yellow:hover { background:var(--yellow-dark); }
.btn-outline { background:white; color:var(--green-main); border:1.5px solid var(--green-main); }
.btn-outline:hover { background:var(--green-pale); }
.btn-danger { background:#e74c3c; color:white; }
.btn-sm { padding:6px 12px; font-size:12px; }
.btn-icon { padding:9px; border-radius:var(--radius-sm); background:var(--gray-100); border:none; cursor:pointer; color:var(--gray-600); font-size:15px; transition:all 0.2s; }
.btn-icon:hover { background:var(--green-pale); color:var(--green-main); }

/* ========== CONTENT ========== */
.content { flex:1; padding:28px 32px; overflow-x:hidden; box-sizing:border-box; }
.page { display:none; }
.page.active { display:block; animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

/* ========== DASHBOARD ========== */
.stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; margin-bottom:28px; }
.stat-card {
  background:white; border-radius:var(--radius); padding:22px;
  box-shadow:var(--shadow-sm); border:1px solid var(--gray-200);
  position:relative; overflow:hidden; transition:transform 0.2s, box-shadow 0.2s;
}
.stat-card:hover { transform:translateY(-3px); box-shadow:var(--shadow-md); }
.stat-card .icon-wrap { width:48px; height:48px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; margin-bottom:14px; }
.stat-card .val {
  font-family: var(--font-display);
  font-size: 32px; font-weight: 700; color: var(--green-dark);
  letter-spacing: -0.5px; line-height: 1;
}
.stat-card .lbl { font-size:12.5px; color:var(--gray-400); margin-top:6px; font-weight:500; }
.stat-card .trend { font-size:11.5px; font-weight:600; margin-top:8px; display:flex; align-items:center; gap:4px; }
.trend-up { color:#27ae60; } .trend-down { color:#e74c3c; }
.stat-card::after { content:''; position:absolute; top:-20px; right:-20px; width:80px; height:80px; border-radius:50%; opacity:0.06; }
.stat-card:nth-child(1)::after { background:var(--green-main); }
.stat-card:nth-child(2)::after { background:#3498db; }
.stat-card:nth-child(3)::after { background:var(--yellow); }
.stat-card:nth-child(4)::after { background:#e74c3c; }

.dashboard-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.card { background:white; border-radius:var(--radius); padding:24px; box-shadow:var(--shadow-sm); border:1px solid var(--gray-200); min-width:0; }
.card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
.card-title { font-family: var(--font-display); font-size:17px; font-weight:700; color:var(--green-dark); letter-spacing:0.2px; }
.card-subtitle { font-size:12px; color:var(--gray-400); margin-top:2px; }

/* Simple bar chart */
.chart-bars { display:flex; align-items:flex-end; gap:10px; height:140px; padding-top:10px; }
.bar-wrap { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; }
.bar { width:100%; border-radius:6px 6px 0 0; background:linear-gradient(180deg,var(--green-light),var(--green-dark)); transition:height 0.5s cubic-bezier(0.34,1.56,0.64,1); min-height:4px; }
.bar-label { font-size:10px; color:var(--gray-400); font-weight:500; }
.bar-val { font-size:10px; font-weight:700; color:var(--green-dark); }

/* Activity list */
.activity-item { display:flex; align-items:center; gap:14px; padding:11px 0; border-bottom:1px solid var(--gray-100); }
.activity-item:last-child { border-bottom:none; }
.activity-dot { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
.activity-info { flex:1; }
.activity-info .title { font-size:13px; font-weight:600; }
.activity-info .meta { font-size:11.5px; color:var(--gray-400); margin-top:2px; }
.activity-time { font-size:11px; color:var(--gray-400); }

/* ========== TABLES ========== */
.table-toolbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:12px; }
.search-box { position:relative; }
.search-box input { padding:9px 14px 9px 38px; border:1.5px solid var(--gray-200); border-radius:var(--radius-sm); font-size:13px; color:var(--gray-800); background:white; width:240px; outline:none; font-family:var(--font-body); transition:border 0.2s; }
.search-box input:focus { border-color:var(--green-main); }
.search-box i { position:absolute; left:13px; top:50%; transform:translateY(-50%); color:var(--gray-400); font-size:13px; }
.table-actions { display:flex; gap:8px; flex-wrap:wrap; }


thead { background:var(--green-dark); }
tbody tr { transition:background 0.15s; border-bottom:1px solid var(--gray-100); }
tbody tr:hover { background:var(--green-pale); }
tbody td { padding:11px 14px; color:var(--gray-600); vertical-align:middle; }
tbody tr:last-child { border-bottom:none; }
.badge-status { padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; }
.badge-aktif { background:#d4edda; color:#1a7a35; }
.badge-nonaktif { background:#fde8e8; color:#c0392b; }
.action-btns { display:flex; gap:6px; }

/* ========== FORMS ========== */
.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.form-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; }
.form-group { display:flex; flex-direction:column; gap:6px; }
.form-group.full { grid-column:1/-1; }
label { font-size:12.5px; font-weight:600; color:var(--gray-600); font-family: var(--font-body); }
input[type=text],input[type=number],input[type=date],input[type=time],input[type=tel],select,textarea {
  padding:10px 14px; border:1.5px solid var(--gray-200); border-radius:var(--radius-sm);
  font-size:13.5px; color:var(--gray-800); background:white; outline:none;
  font-family: var(--font-body); transition:border 0.2s; width:100%;
}
input:focus,select:focus,textarea:focus { border-color:var(--green-main); box-shadow:0 0 0 3px rgba(45,138,62,0.08); }
textarea { resize:vertical; min-height:80px; }
.form-note { font-size:11.5px; color:var(--gray-400); }

/* Modal */
.modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1000; align-items:center; justify-content:center; padding:20px; }
.modal-overlay.open { display:flex; }
.modal { background:white; border-radius:20px; width:100%; max-width:640px; max-height:90vh; overflow-y:auto; box-shadow:0 24px 80px rgba(0,0,0,0.22); animation:modalIn 0.25s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes modalIn { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
.modal-header { padding:22px 24px 18px; border-bottom:1px solid var(--gray-100); display:flex; align-items:center; justify-content:space-between; }
.modal-header h3 {
  font-family: var(--font-display);
  font-size: 20px; font-weight: 700; color: var(--green-dark);
  letter-spacing: 0.2px;
}
.modal-body { padding:24px; }
.modal-footer { padding:16px 24px; border-top:1px solid var(--gray-100); display:flex; justify-content:flex-end; gap:10px; }
.close-btn { background:var(--gray-100); border:none; border-radius:8px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; color:var(--gray-600); }
.close-btn:hover { background:var(--gray-200); }

/* Section header */
.section-header { display:flex; align-items:center; gap:14px; margin-bottom:24px; }
.section-icon { width:44px; height:44px; border-radius:12px; background:var(--green-pale); display:flex; align-items:center; justify-content:center; font-size:20px; }
.section-header h2 {
  font-family: var(--font-display);
  font-size: 22px; font-weight: 700; color: var(--green-dark);
  letter-spacing: 0.2px;
}
.section-header p { font-size:12.5px; color:var(--gray-400); margin-top:2px; }

/* Report */
.filter-card { background:white; border-radius:var(--radius); padding:20px; margin-bottom:20px; box-shadow:var(--shadow-sm); border:1px solid var(--gray-200); }
.filter-card h4 { font-size:13px; font-weight:700; color:var(--green-dark); margin-bottom:14px; display:flex; align-items:center; gap:8px; font-family: var(--font-body); }
.filter-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; }
.report-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
.sum-card { background:var(--green-pale); border-radius:var(--radius-sm); padding:14px; text-align:center; border:1px solid rgba(45,138,62,0.15); }
.sum-card .val {
  font-family: var(--font-display);
  font-size: 22px; font-weight: 700; color: var(--green-dark);
  letter-spacing: -0.3px;
}
.sum-card .lbl { font-size:11px; color:var(--green-main); margin-top:4px; font-weight:600; }

/* Tabs */
.tabs { display:flex; gap:4px; margin-bottom:20px; background:var(--gray-100); padding:4px; border-radius:12px; width:fit-content; }
.tab { padding:8px 18px; border-radius:9px; font-size:13px; font-weight:600; cursor:pointer; color:var(--gray-400); transition:all 0.2s; border:none; background:transparent; font-family:var(--font-body); }
.tab.active { background:white; color:var(--green-dark); box-shadow:var(--shadow-sm); }

/* Toast */
.toast { position:fixed; bottom:24px; right:24px; background:var(--green-dark); color:white; padding:13px 20px; border-radius:12px; font-size:13.5px; font-weight:500; z-index:9999; display:flex; align-items:center; gap:10px; box-shadow:var(--shadow-lg); transform:translateY(60px); opacity:0; transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1); font-family:var(--font-body); }
.toast.show { transform:translateY(0); opacity:1; }
.toast.error { background:#c0392b; }

/* Upload zone */
.upload-zone { border:2px dashed var(--gray-200); border-radius:var(--radius-sm); padding:32px; text-align:center; cursor:pointer; transition:all 0.2s; }
.upload-zone:hover { border-color:var(--green-main); background:var(--green-pale); }
.upload-zone i { font-size:32px; color:var(--gray-400); margin-bottom:10px; }
.upload-zone p { font-size:13px; color:var(--gray-600); font-weight:500; }
.upload-zone span { font-size:12px; color:var(--gray-400); }

/* ========== BANNER ========== */
.page-banner {
  background: linear-gradient(135deg, var(--green-dark), var(--green-main));
  border-radius: var(--radius); padding:28px 32px; margin-bottom:28px;
  display:flex; align-items:center; justify-content:space-between;
  overflow:hidden; position:relative;
}
.page-banner::before { content:''; position:absolute; top:-30px; right:-30px; width:160px; height:160px; border-radius:50%; background:rgba(255,255,255,0.07); }
.page-banner::after { content:''; position:absolute; bottom:-40px; right:80px; width:100px; height:100px; border-radius:50%; background:rgba(255,255,255,0.05); }
.page-banner h2 {
  font-family: var(--font-display);
  font-size: 28px; font-weight: 700; color: white;
  letter-spacing: 0.4px; line-height: 1.2;
  text-shadow: 0 1px 6px rgba(0,0,0,0.15);
}
.page-banner p {
  font-size: 13.5px; color: rgba(255,255,255,0.75);
  margin-top: 7px; font-weight: 400; letter-spacing: 0.2px;
  font-family: var(--font-body);
}
.page-banner .stats-mini { display:flex; gap:24px; }
.stats-mini-item { text-align:center; }
.stats-mini-item .val {
  font-family: var(--font-display);
  font-size: 30px; font-weight: 700; color: var(--yellow);
  line-height: 1; letter-spacing: -0.5px;
}
.stats-mini-item .lbl { font-size:11px; color:rgba(255,255,255,0.65); margin-top:4px; letter-spacing:0.3px; font-weight:500; }

.empty-state { text-align:center; padding:48px; color:var(--gray-400); }
.empty-state i { font-size:48px; margin-bottom:12px; opacity:0.4; display:block; }
.empty-state p { font-size:14px; }

/* ========== RESPONSIVE ========== */
@media(max-width:900px) {
    .stats-grid { grid-template-columns:1fr 1fr; }
  .dashboard-grid { grid-template-columns:1fr; }
  .form-grid { grid-template-columns:1fr; }
  .report-summary { grid-template-columns:1fr 1fr; }
  .content { padding: 20px 16px; }
  .topbar { padding: 14px 16px; }
}


/* ========== LOGIN SCREEN ========== */
#login-screen {
  position:fixed; inset:0; background:linear-gradient(135deg,var(--green-dark) 0%,#0a2a12 100%);
  display:flex; align-items:center; justify-content:center; z-index:9999;
}
.login-box {
  background:#fff; border-radius:24px; padding:48px 40px; width:100%; max-width:400px;
  box-shadow:0 32px 80px rgba(0,0,0,0.3); text-align:center;
}
.login-logo { display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:28px; }
.login-logo img { width:56px; height:56px; object-fit:contain; border-radius:12px; }
.login-logo-text .title { font-family:var(--font-display); font-size:22px; font-weight:700; color:var(--green-dark); }
.login-logo-text .sub { font-size:11px; color:var(--gray-400); letter-spacing:1.5px; text-transform:uppercase; }
.login-box h2 { font-size:17px; color:var(--gray-600); margin-bottom:24px; font-weight:500; }
.login-box .form-group { margin-bottom:16px; text-align:left; }
.login-box label { font-size:12px; font-weight:600; color:var(--gray-600); margin-bottom:5px; display:block; }
.login-box input { width:100%; padding:11px 14px; border:1.5px solid var(--gray-200); border-radius:10px; font-size:14px; transition:border 0.2s; }
.login-box input:focus { outline:none; border-color:var(--green-main); }
.login-btn { width:100%; padding:13px; background:var(--green-dark); color:#fff; border:none; border-radius:12px; font-size:15px; font-weight:600; cursor:pointer; margin-top:8px; transition:background 0.2s; }
.login-btn:hover { background:var(--green-main); }
.login-error { color:#e53e3e; font-size:13px; margin-top:10px; min-height:18px; }

/* ========== ROLE BADGE ========== */
.badge-role-admin  { background:#ffeeba; color:#856404; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:700; }
.badge-role-staf   { background:#d4edda; color:#155724; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:700; }
.badge-role-guest  { background:#e2e3e5; color:#383d41; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:700; }

/* ========== PERMISSION TOGGLE ========== */
.perm-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
.perm-item { display:flex; align-items:center; gap:8px; background:var(--gray-100); border-radius:8px; padding:8px 10px; font-size:12px; }
.perm-item input[type=checkbox] { accent-color:var(--green-main); width:15px; height:15px; }
.perm-section-title { font-size:11px; font-weight:700; color:var(--gray-400); letter-spacing:1px; text-transform:uppercase; margin:12px 0 4px; }

/* ========== AKUN MENU SIDEBAR ========== */
.sidebar-footer .logout-btn {
  width:100%; padding:9px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15);
  color:rgba(255,255,255,0.7); border-radius:10px; font-size:13px; cursor:pointer; margin-top:8px;
  transition:background 0.2s;
}
.sidebar-footer .logout-btn:hover { background:rgba(255,255,255,0.16); color:#fff; }


/* ========== MULTI DELETE ========== */
.cb-select { accent-color:var(--green-main); width:15px; height:15px; cursor:pointer; }
.cb-row { display:none; }
.delete-mode .cb-row { display:inline-block; }
.cb-th-hide { display:none; }
.delete-mode .cb-th-hide { display:table-cell; }
.bulk-bar {
  display:none; align-items:center; gap:10px;
  background:var(--green-pale); border:1.5px solid var(--green-main);
  border-radius:10px; padding:8px 14px; margin-bottom:10px;
  font-size:13px; font-weight:600; color:var(--green-dark);
}
.bulk-bar.show { display:flex; }
.bulk-bar .sel-count { flex:1; }
.btn-bulk-del { background:#e53e3e; color:#fff; border:none; border-radius:8px; padding:6px 14px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px; }
.btn-bulk-del:hover { background:#c53030; }
.btn-bulk-cancel { background:transparent; color:var(--gray-600); border:1.5px solid var(--gray-200); border-radius:8px; padding:6px 12px; font-size:12px; cursor:pointer; }
thead .cb-th { width:36px; text-align:center; }
tr.selected-row { background:#f0faf2 !important; }





/* ===== TABLE ===== */
table { font-size:13px; border-collapse:collapse; width:100%; }
thead th { 
  padding:13px 14px; text-align:left; 
  font-weight:600; font-size:12px; letter-spacing:0.5px; 
  font-family:var(--font-body);
  background:var(--green-dark); color:white;
  white-space:nowrap;
}
tbody td { 
  padding:12px 14px; border-bottom:1px solid var(--gray-200); 
  vertical-align:middle; white-space:nowrap;
}
tbody tr:nth-child(even) { background:#f9fafb; }
tbody tr:hover { background:#f0faf2; }

/* ===== TABLE CONTAINER ===== */
.table-outer {
  width: 100%;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 520px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--gray-200);
  scrollbar-width: thin;
  scrollbar-color: var(--green-main) #e8f5e9;
}
.table-outer::-webkit-scrollbar { height:8px; width:8px; }
.table-outer::-webkit-scrollbar-track { background:#e8f5e9; }
.table-outer::-webkit-scrollbar-thumb { background:var(--green-main); border-radius:4px; }
.table-outer table { width:max-content; min-width:100%; }

/* Freeze header atas */
.table-outer thead th {
  position: sticky;
  top: 0;
  z-index: 3;
}

/* Freeze kolom kiri */
.col-freeze {
  position: sticky !important;
  left: 0 !important;
  z-index: 2;
  background: #fff;
  box-shadow: 3px 0 5px -2px rgba(0,0,0,0.10);
}
.col-freeze-head {
  position: sticky !important;
  left: 0 !important;
  z-index: 5 !important;
  background: var(--green-dark) !important;
}
tbody tr:nth-child(even) .col-freeze { background:#f9fafb; }
tbody tr:hover .col-freeze { background:#f0faf2 !important; }
