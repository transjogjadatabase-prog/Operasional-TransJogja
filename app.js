// ============================================================
// SUPABASE CONFIG — ganti URL dan KEY dengan milik Anda
// ============================================================
const SUPABASE_URL      = 'https://rzmeitgcbcpctisxsxpq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6bWVpdGdjYmNwY3Rpc3hzeHBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMzU0NTIsImV4cCI6MjA4ODYxMTQ1Mn0.NJivuuKmq48in32Ruk5hcf5F3LbNa2jL8yjD8GVClj4';
var db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ STATE ============
let DB = { bus: [], spbu: [], bbm: [], ops: [], akun: [] };
let editIdx = { bus: -1, spbu: -1, bbm: -1, ops: -1, akun: -1 };

// ── Cache staleness — tandai data "kotor" agar loadXxx tidak fetch ulang
// tanpa perlu. Set true hanya saat ada mutasi (insert/update/delete).
let DB_STALE = { bus: true, spbu: true, bbm: true, ops: true };
// Flag loading sedang berjalan — cegah double-fetch paralel
let DB_LOADING = { bus: false, spbu: false, bbm: false, ops: false };
// Antrian promise subscriber: semua caller yang datang saat loading aktif
// akan resolved bersama saat fetch selesai
let DB_LOADING_PROMISE = { bus: null, spbu: null, bbm: null, ops: null };

/** Paksa reload berikutnya (panggil setelah mutasi data) */
function markStale(...tables) {
  tables.forEach(function(t){ DB_STALE[t] = true; });
}
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
  { key:'lap-gabungan',  label:'Laporan Gabungan' },
  { key:'lap-harian',    label:'Laporan Harian' },
  { key:'lap-efisiensi', label:'Analitik Efisiensi' },
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
  if (role === 'staf')  return { menus: ['dashboard','input-bbm','input-ops','lap-bbm','lap-ops','lap-bbm-waktu','lap-gabungan','lap-harian','lap-efisiensi'], actions: ['tambah','edit','export'] };
  return { menus: ['dashboard','lap-bbm','lap-ops','lap-gabungan','lap-harian','lap-efisiensi'], actions: ['export'] }; // guest
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
  'lap-gabungan':  'Laporan Gabungan BBM + Operasional',
  'lap-harian':    'Laporan Harian Armada',
  'lap-efisiensi': 'Analitik Efisiensi Armada',
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
  if (id === 'input-ops')     Promise.all([loadBBM(), loadOps()]).then(renderAntrian);
  if (id === 'lap-bbm-waktu') populateSpbuFilter();
  if (id === 'lap-bbm')       populateLambFilter('lb-lamb');
  if (id === 'lap-ops')       populateLambFilter('lo-lamb');
  // Untuk laporan: pakai cache kalau masih fresh, hanya re-render
  if (id === 'lap-gabungan')  {
    populateLambFilter('lg-lamb');
    if (DB_STALE.bbm || DB_STALE.ops || !DB.bbm.length || !DB.ops.length)
      Promise.all([loadBBM(), loadOps()]).then(generateLapGabungan);
    else generateLapGabungan();
  }
  if (id === 'lap-harian') {
    if (DB_STALE.bbm || DB_STALE.ops || !DB.bbm.length || !DB.ops.length)
      Promise.all([loadBBM(), loadOps()]).then(generateLapHarian);
    else generateLapHarian();
  }
  if (id === 'lap-efisiensi') {
    if (DB_STALE.bbm || DB_STALE.ops || !DB.bbm.length || !DB.ops.length)
      Promise.all([loadBBM(), loadOps()]).then(generateLapEfisiensi);
    else generateLapEfisiensi();
  }
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
  // Load data awal lalu tampilkan dashboard
  markStale('bus','spbu','bbm','ops');
  Promise.all([
    loadBus().catch(function(e){ console.error(e); }),
    loadSpbu().catch(function(e){ console.error(e); }),
    loadBBM().catch(function(e){ console.error(e); }),
    loadOps().catch(function(e){ console.error(e); })
  ]).then(function(){ goPage('dashboard'); });
}

function applyActionPerms() {
  // Tombol tambah/import/export berdasarkan izin
  var addBtns    = ['btn-tambah-bus','btn-tambah-spbu','btn-tambah-bbm','btn-tambah-ops','btn-tambah-akun'];
  var delBtns    = ['btn-delmode-bus','btn-delmode-spbu','btn-delmode-bbm','btn-delmode-ops'];
  var importBtns = document.querySelectorAll('[data-perm="import"]');
  var exportBtns = document.querySelectorAll('[data-perm="export"]');
  addBtns.forEach(function(id){
    var el=document.getElementById(id);
    if(el) el.style.display = canDo('tambah') ? '' : 'none';
  });
  delBtns.forEach(function(id){
    var el=document.getElementById(id);
    if(el) el.style.display = canDo('hapus') ? '' : 'none';
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
function openOpsManual() {
  editIdx.ops = -1;
  populateLambDropdowns();
  document.getElementById('ops-tgl').value='';
  document.getElementById('ops-lambung').value='';
  document.getElementById('ops-jalur').value='';
  document.getElementById('ops-nopol').value='';
  document.getElementById('ops-jam-mulai').value='';
  document.getElementById('ops-jam-akhir').value='';
  document.getElementById('ops-km-awal-pool').value='';
  document.getElementById('ops-km-akhir-pool').value='';
  document.getElementById('ops-km-awal-halte').value='';
  document.getElementById('ops-km-akhir-halte').value='';
  document.getElementById('ops-bbm').value='';
  document.getElementById('ops-rit').value='';
  document.getElementById('ops-km-tempuh').value='';
  document.getElementById('ops-ratio').value='';
  document.getElementById('ops-ket').value='';
  document.getElementById('modal-ops-title').textContent='Input Operasional';
  openModal('modal-ops');
}
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

// ── saveBBMCore: validasi + optimistic update, return false jika gagal ──
// Tidak mengandung network call — murni sync UI
function saveBBMCore() {
  var tgl=document.getElementById('bbm-tgl').value, lamb=document.getElementById('bbm-lambung').value, nominal=document.getElementById('bbm-nominal').value;
  if (!tgl||!lamb||!nominal) { toast('Tanggal, Lambung, dan Nominal wajib diisi!',true); return null; }
  var jamHalteEl=document.getElementById('bbm-jam-halte');
  var row={tgl:tgl,lambung:lamb,jalur:document.getElementById('bbm-jalur').value,nopol:document.getElementById('bbm-nopol').value,waktu:document.getElementById('bbm-waktu').value||null,nominal:parseFloat(nominal),spbu:document.getElementById('bbm-spbu').value,halte:document.getElementById('bbm-halte').value,jam_halte:jamHalteEl?jamHalteEl.value||null:null,ket:document.getElementById('bbm-ket').value};
  if (editIdx.bbm < 0) {
    var waktuVal = row.waktu||'';
    var dup = DB.bbm.find(function(b){ return String(b.lambung).trim()===String(lamb).trim()&&String(b.tgl).substring(0,10)===tgl&&String(b.waktu||'')===waktuVal&&Number(b.nominal)===parseFloat(nominal); });
    if (dup) { toast('⚠️ Data duplikat! Lambung '+lamb+' | '+tgl+' sudah ada.',true); return null; }
  }
  var isEdit = editIdx.bbm >= 0;
  var editId = isEdit ? DB.bbm[editIdx.bbm].id : null;
  // Optimistic local update
  if (isEdit) {
    Object.assign(DB.bbm[editIdx.bbm], {tgl:row.tgl,lambung:String(row.lambung).trim(),jalur:row.jalur,nopol:row.nopol,waktu:row.waktu,nominal:row.nominal,spbu:row.spbu,halte:row.halte,jamHalte:row.jam_halte,ket:row.ket});
  } else {
    DB.bbm.unshift({id:'_tmp_'+Date.now(),tgl:row.tgl,lambung:String(row.lambung).trim(),jalur:row.jalur,nopol:row.nopol,waktu:row.waktu,nominal:row.nominal,spbu:row.spbu,halte:row.halte,jamHalte:row.jam_halte,ket:row.ket});
  }
  DB_FILTER.bbm = null;
  return { row, isEdit, editId };
}

// ── Fire-and-forget network sync untuk BBM ──
function _bbmNetworkSync(row, isEdit, editId) {
  (async function() {
    var res = isEdit ? await db.from('bbm').update(row).eq('id',editId) : await db.from('bbm').insert(row);
    if (res && res.error) {
      if (!isEdit) DB.bbm.shift();
      toast('⚠ Gagal simpan: '+res.error.message, true);
    }
    markStale('bbm','ops');
    Promise.all([loadBBM(true), loadOps(true)]).then(function(){ renderAntrian(); updateDashboard(); });
  })();
}

function saveBBM() {
  var ctx = saveBBMCore(); if (!ctx) return;
  toast(ctx.isEdit ? 'Data BBM diperbarui!' : 'Data BBM disimpan!');
  closeModal('modal-bbm');
  renderBBM(); renderAntrian();
  _bbmNetworkSync(ctx.row, ctx.isEdit, ctx.editId); // fire-and-forget
}

// Simpan & langsung siap input lagi — modal tidak tutup lama
function saveBBMAndNext() {
  var tgl = document.getElementById('bbm-tgl').value;
  var ctx = saveBBMCore(); if (!ctx) return;
  toast(ctx.isEdit ? 'Data BBM diperbarui!' : 'Data BBM disimpan!');
  closeModal('modal-bbm');    // tutup & reset form
  renderBBM(); renderAntrian();
  _bbmNetworkSync(ctx.row, ctx.isEdit, ctx.editId); // fire-and-forget
  // Buka lagi SEKETIKA dengan tanggal dipertahankan
  editIdx.bbm = -1;
  populateLambDropdowns(); populateSpbuDropdowns();
  document.getElementById('bbm-tgl').value = tgl;
  openModal('modal-bbm');
  document.getElementById('bbm-lambung').focus();
}

// ── saveOpsCore: validasi + optimistic update ──
function saveOpsCore() {
  var tgl=document.getElementById('ops-tgl').value, lamb=document.getElementById('ops-lambung').value;
  if (!tgl||!lamb) { toast('Tanggal dan Lambung wajib diisi!',true); return null; }
  var jm=document.getElementById('ops-jam-mulai').value, ja=document.getElementById('ops-jam-akhir').value;
  var bbmVal=parseFloat(document.getElementById('ops-bbm').value)||0;
  var kmTempuh=null, ratio=null;
  var kmAP=parseFloat(document.getElementById('ops-km-awal-pool').value)||0, kmKP=parseFloat(document.getElementById('ops-km-akhir-pool').value)||0;
  var kmAH=parseFloat(document.getElementById('ops-km-awal-halte').value)||0, kmKH=parseFloat(document.getElementById('ops-km-akhir-halte').value)||0;
  if(kmKP>0&&kmAP>0){kmTempuh=parseFloat((kmKP-kmAP).toFixed(1));}
  else if(kmKH>0&&kmAH>0){kmTempuh=parseFloat((kmKH-kmAH).toFixed(1));}
  if(kmTempuh&&bbmVal>0){ratio=parseFloat((kmTempuh/(bbmVal/6800)).toFixed(2));}
  var row={tgl:tgl,lambung:lamb,jalur:document.getElementById('ops-jalur').value,nopol:document.getElementById('ops-nopol').value,jam_mulai:jm||null,jam_akhir:ja||null,km_awal_pool:parseFloat(document.getElementById('ops-km-awal-pool').value)||null,km_akhir_pool:parseFloat(document.getElementById('ops-km-akhir-pool').value)||null,km_awal_halte:parseFloat(document.getElementById('ops-km-awal-halte').value)||null,km_akhir_halte:parseFloat(document.getElementById('ops-km-akhir-halte').value)||null,bbm_rp:bbmVal,rit:parseInt(document.getElementById('ops-rit').value)||0,km_tempuh:kmTempuh,ratio:ratio,ket:document.getElementById('ops-ket').value};
  var isEdit = editIdx.ops >= 0;
  var editId = isEdit ? DB.ops[editIdx.ops].id : null;
  if (isEdit) {
    Object.assign(DB.ops[editIdx.ops], {tgl:row.tgl,lambung:String(row.lambung).trim(),jalur:row.jalur,nopol:row.nopol,jamMulai:row.jam_mulai,jamAkhir:row.jam_akhir,kmAwalPool:row.km_awal_pool,kmAkhirPool:row.km_akhir_pool,kmAwalHalte:row.km_awal_halte,kmAkhirHalte:row.km_akhir_halte,bbm:row.bbm_rp,rit:row.rit,kmTempuh:row.km_tempuh,ratio:row.ratio,ket:row.ket});
  } else {
    DB.ops.unshift({id:'_tmp_'+Date.now(),tgl:row.tgl,lambung:String(row.lambung).trim(),jalur:row.jalur,nopol:row.nopol,jamMulai:row.jam_mulai,jamAkhir:row.jam_akhir,kmAwalPool:row.km_awal_pool,kmAkhirPool:row.km_akhir_pool,kmAwalHalte:row.km_awal_halte,kmAkhirHalte:row.km_akhir_halte,bbm:row.bbm_rp,rit:row.rit,kmTempuh:row.km_tempuh,ratio:row.ratio,ket:row.ket});
  }
  DB_FILTER.ops = null;
  return { row, isEdit, editId };
}

function _opsNetworkSync(row, isEdit, editId) {
  (async function() {
    var res = isEdit ? await db.from('operasional').update(row).eq('id',editId) : await db.from('operasional').insert(row);
    if (res && res.error) {
      if (!isEdit) DB.ops.shift();
      toast('⚠ Gagal simpan: '+res.error.message, true);
    }
    markStale('ops','bbm');
    Promise.all([loadOps(true), loadBBM(true)]).then(function(){ renderAntrian(); updateDashboard(); });
  })();
}

function saveOpsAndNext() {
  var tgl = document.getElementById('ops-tgl').value;
  var ctx = saveOpsCore(); if (!ctx) return;
  toast(ctx.isEdit ? 'Data operasional diperbarui!' : 'Data operasional disimpan!');
  closeModal('modal-ops');
  renderOps(); renderAntrian();
  _opsNetworkSync(ctx.row, ctx.isEdit, ctx.editId);
  // Buka lagi SEKETIKA
  editIdx.ops = -1;
  populateLambDropdowns();
  document.getElementById('ops-tgl').value = tgl;
  document.getElementById('modal-ops-title').textContent = 'Tambah Data Operasional';
  openModal('modal-ops');
  document.getElementById('ops-lambung').focus();
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
async function loadBus(forceRefresh) {
  if (!forceRefresh && !DB_STALE.bus && DB.bus.length) { renderBus(); applyFreeze('tbl-bus'); populateLambDropdowns(); return; }
  if (DB_LOADING.bus && DB_LOADING_PROMISE.bus) return DB_LOADING_PROMISE.bus;
  DB_LOADING.bus = true;
  setLoading('tbody-bus', 10);
  DB_LOADING_PROMISE.bus = (async function() {
    var r = await fetchAll('bus', 'created_at', false);
    DB_LOADING.bus = false; DB_LOADING_PROMISE.bus = null;
    if (r.error) { toast('Gagal memuat data bus: ' + r.error.message, true); return; }
    DB.bus = r.data.map(function(d) { return { id:d.id, lambung:d.lambung, nopol:d.nopol, jalur:d.jalur, tipe:d.tipe, karoseri:d.karoseri, warna:d.warna, ket:d.ket, foto:d.foto_url }; });
    DB_STALE.bus = false;
    DB_FILTER.bus = null;
    renderBus(); applyFreeze('tbl-bus'); populateLambDropdowns();
  })();
  return DB_LOADING_PROMISE.bus;
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
  markStale('bus'); closeModal('modal-bus'); loadBus(true); updateDashboard();
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
  var cbTh = document.getElementById('cb-th-' + type);
  var isOn = tbl.classList.toggle('delete-mode');
  if (isOn) {
    btn.innerHTML = '<i class="fas fa-times"></i> Batal Hapus';
    btn.style.background = '#e53e3e';
    btn.style.color = '#fff';
    btn.style.borderColor = '#e53e3e';
    if (cbTh) cbTh.classList.add('show');
  } else {
    btn.innerHTML = '<i class="fas fa-trash"></i> Hapus Data';
    btn.style.background = '';
    btn.style.color = '#e53e3e';
    btn.style.borderColor = '#e53e3e';
    if (cbTh) cbTh.classList.remove('show');
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
async function deleteByIds(tblName, ids) {
  var errors = [];
  for (var i = 0; i < ids.length; i++) {
    try {
      var res = await db.from(tblName).delete().eq('id', ids[i]);
      if (res.error) errors.push(res.error.message);
    } catch(e) {
      errors.push(e.message || 'Network error');
    }
  }
  return errors;
}

async function bulkDelete(type) {
  var ids = getCheckedIds(type);
  if (!ids.length) return toast('Pilih data terlebih dahulu!', true);
  if (!confirm('Hapus ' + ids.length + ' data yang dipilih?')) return;
  var tbl = type === 'ops' ? 'operasional' : type;
  toast('⏳ Menghapus ' + ids.length + ' data...');
  var errors = await deleteByIds(tbl, ids);
  if (errors.length) return toast('Gagal hapus: ' + errors[0], true);
  toast('✅ ' + ids.length + ' data dihapus.');
  clearSelect(type);
  toggleDeleteMode(type); // matikan delete mode
  if(type==='bus'){ markStale('bus'); loadBus(true); }
  else if(type==='spbu'){ markStale('spbu'); loadSpbu(true); }
  else if(type==='bbm'){ markStale('bbm','ops'); Promise.all([loadBBM(true),loadOps(true)]).then(renderAntrian); }
  else if(type==='ops'){ markStale('ops','bbm'); Promise.all([loadOps(true),loadBBM(true)]).then(renderAntrian); }
  updateDashboard();
}

async function deleteAll(type) {
  var DB_arr = type==='ops' ? DB.ops : DB[type];
  if (!DB_arr.length) return toast('Tidak ada data!', true);
  if (!confirm('⚠️ Hapus SEMUA ' + DB_arr.length + ' data ' + type.toUpperCase() + '? Tindakan ini tidak bisa dibatalkan!')) return;
  var tbl = type === 'ops' ? 'operasional' : type;
  var ids = DB_arr.map(function(r){ return r.id; });
  toast('⏳ Menghapus ' + ids.length + ' data...');
  var errors = await deleteByIds(tbl, ids);
  if (errors.length) return toast('Gagal hapus: ' + errors[0], true);
  toast('✅ Semua data ' + type.toUpperCase() + ' dihapus.');
  clearSelect(type);
  toggleDeleteMode(type); // matikan delete mode
  if(type==='bus'){ markStale('bus'); loadBus(true); }
  else if(type==='spbu'){ markStale('spbu'); loadSpbu(true); }
  else if(type==='bbm'){ markStale('bbm','ops'); Promise.all([loadBBM(true),loadOps(true)]).then(renderAntrian); }
  else if(type==='ops'){ markStale('ops','bbm'); Promise.all([loadOps(true),loadBBM(true)]).then(renderAntrian); }
  updateDashboard();
}

function renderBus() {
  var tbody = document.getElementById('tbody-bus');
  var arr = DB_FILTER.bus !== null ? DB_FILTER.bus : DB.bus;
  if (!arr.length) { tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><i class="fas fa-bus"></i><p>Belum ada data bus</p></div></td></tr>'; return; }
  tbody.innerHTML = arr.map(function(r, i) {
    return '<tr>'
      +'<td class="freeze-col" style="font-weight:700;color:var(--green-dark);text-align:center;">'+(i+1)+'</td>'
      +'<td><strong>'+r.lambung+'</strong></td><td>'+r.nopol+'</td>'
      +'<td><span class="badge-status badge-aktif">'+r.jalur+'</span></td>'
      +'<td>'+(r.tipe||'-')+'</td><td>'+(r.karoseri||'-')+'</td><td>'+(r.warna||'-')+'</td><td>'+(r.ket||'-')+'</td>'
      +'<td>'+(r.foto?'<img src="'+r.foto+'" style="width:44px;height:32px;object-fit:cover;border-radius:6px;">':'—')+'</td>'
      +'<td><div class="action-btns"><button class="btn btn-outline btn-sm" onclick="editBusById(\''+r.id+'\')"><i class="fas fa-edit"></i></button><button class="btn btn-danger btn-sm" onclick="delBusById(\''+r.id+'\')"><i class="fas fa-trash"></i></button></div></td>'
      +'<td class="cb-th-hide" style="text-align:center;"><input type="checkbox" class="cb-select cb-row" value="'+r.id+'" onchange="onRowCheck(&quot;bus&quot;,this,&quot;'+r.id+'&quot;)"></td>'
      +'</tr>';
  }).join('');
}
function editBusById(id) {
  var i = DB.bus.findIndex(function(r){ return r.id == id; });
  if (i < 0) return toast('Data tidak ditemukan', true);
  editIdx.bus = i; var r = DB.bus[i];
  document.getElementById('bus-lambung').value = r.lambung; document.getElementById('bus-nopol').value = r.nopol;
  document.getElementById('bus-jalur').value = r.jalur; document.getElementById('bus-tipe').value = r.tipe||'';
  document.getElementById('bus-karoseri').value = r.karoseri||''; document.getElementById('bus-warna').value = r.warna||''; document.getElementById('bus-ket').value = r.ket||'';
  document.getElementById('modal-bus-title').textContent = 'Edit Data Bus'; openModal('modal-bus');
}
async function delBusById(id) {
  if (!confirm('Hapus data bus ini?')) return;
  try {
    var res = await db.from('bus').delete().eq('id', id);
    if (res.error) return toast('Gagal hapus: ' + res.error.message, true);
    toast('Data bus dihapus.'); markStale('bus'); loadBus(true); updateDashboard();
  } catch(e) { toast('Gagal hapus: ' + (e.message||'Network error'), true); }
}

// ============================================================
// SPBU
// ============================================================
async function loadSpbu(forceRefresh) {
  if (!forceRefresh && !DB_STALE.spbu && DB.spbu.length) { renderSpbu(); applyFreeze('tbl-spbu'); populateSpbuDropdowns(); return; }
  if (DB_LOADING.spbu && DB_LOADING_PROMISE.spbu) return DB_LOADING_PROMISE.spbu;
  DB_LOADING.spbu = true;
  setLoading('tbody-spbu', 6);
  DB_LOADING_PROMISE.spbu = (async function() {
    var r = await fetchAll('spbu', 'created_at', false);
    DB_LOADING.spbu = false; DB_LOADING_PROMISE.spbu = null;
    if (r.error) { toast('Gagal memuat SPBU: ' + r.error.message, true); return; }
    DB.spbu = r.data.map(function(d) { return { id:d.id, kode:d.kode||'', nama:d.nama, alamat:d.alamat||'', hp:d.hp||'', aktif:d.aktif }; });
    DB_STALE.spbu = false;
    DB_FILTER.spbu = null;
    renderSpbu(); applyFreeze('tbl-spbu'); populateSpbuDropdowns();
  })();
  return DB_LOADING_PROMISE.spbu;
}
async function saveSpbu() {
  var nama = document.getElementById('spbu-nama').value.trim();
  if (!nama) return toast('Nama SPBU wajib diisi!', true);
  var row = { kode:document.getElementById('spbu-kode').value.trim(), nama:nama, alamat:document.getElementById('spbu-alamat').value, hp:document.getElementById('spbu-hp').value, aktif:document.getElementById('spbu-status').value==='1' };
  var res;
  if (editIdx.spbu >= 0) { res = await db.from('spbu').update(row).eq('id', DB.spbu[editIdx.spbu].id); if (!res.error) toast('Data SPBU diperbarui!'); }
  else { res = await db.from('spbu').insert(row); if (!res.error) toast('Data SPBU disimpan!'); }
  if (res.error) return toast('Error: ' + res.error.message, true);
  markStale('spbu'); closeModal('modal-spbu'); loadSpbu(true); updateDashboard();
}
function renderSpbu() {
  var tbody = document.getElementById('tbody-spbu');
  var arr = DB_FILTER.spbu !== null ? DB_FILTER.spbu : DB.spbu;
  if (!arr.length) { tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-gas-pump"></i><p>Belum ada data SPBU</p></div></td></tr>'; return; }
  tbody.innerHTML = arr.map(function(r, i) {
    return '<tr>'
      + '<td class="freeze-col" style="font-weight:700;color:var(--green-dark);text-align:center;">' + (i+1) + '</td>'
      + '<td><strong>' + r.nama + '</strong></td>'
      + '<td><span style="font-family:monospace;font-size:12px;background:var(--green-pale);color:var(--green-dark);padding:3px 10px;border-radius:6px;font-weight:700;">' + (r.kode||'—') + '</span></td>'
      + '<td>' + (r.alamat||'-') + '</td>'
      + '<td>' + (r.hp||'-') + '</td>'
      + '<td><span class="badge-status ' + (r.aktif?'badge-aktif':'badge-nonaktif') + '">' + (r.aktif?'Aktif':'Tidak Aktif') + '</span></td>'
      + '<td><div class="action-btns"><button class="btn btn-outline btn-sm" onclick="editSpbuById(\''+r.id+'\')"><i class="fas fa-edit"></i></button><button class="btn btn-danger btn-sm" onclick="delSpbuById(\''+r.id+'\')"><i class="fas fa-trash"></i></button></div></td>'
      + '<td class="cb-th-hide" style="text-align:center;"><input type="checkbox" class="cb-select cb-row" value="'+r.id+'" onchange="onRowCheck(&quot;spbu&quot;,this,&quot;'+r.id+'&quot;)"></td>'
      + '</tr>';
  }).join('');
}
function editSpbuById(id) {
  var i = DB.spbu.findIndex(function(r){ return r.id == id; });
  if (i < 0) return toast('Data tidak ditemukan', true);
  editIdx.spbu = i; var r = DB.spbu[i];
  document.getElementById('spbu-nama').value = r.nama; document.getElementById('spbu-kode').value = r.kode||'';
  document.getElementById('spbu-alamat').value = r.alamat||''; document.getElementById('spbu-hp').value = r.hp||'';
  document.getElementById('spbu-status').value = r.aktif?'1':'0';
  document.getElementById('modal-spbu-title').textContent = 'Edit Data SPBU'; openModal('modal-spbu');
}
async function delSpbuById(id) {
  if (!confirm('Hapus data SPBU ini?')) return;
  try {
    var res = await db.from('spbu').delete().eq('id', id);
    if (res.error) return toast('Gagal hapus: ' + res.error.message, true);
    toast('Data SPBU dihapus.'); markStale('spbu'); loadSpbu(true); updateDashboard();
  } catch(e) { toast('Gagal hapus: ' + (e.message||'Network error'), true); }
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
async function loadBBM(forceRefresh) {
  // Jika data masih fresh dan tidak dipaksa refresh, pakai cache
  if (!forceRefresh && !DB_STALE.bbm && DB.bbm.length) {
    renderBBM(); renderAntrian(); return;
  }
  // Jika sedang ada fetch aktif, tunggu promise yang sama (jangan dobel fetch)
  if (DB_LOADING.bbm && DB_LOADING_PROMISE.bbm) return DB_LOADING_PROMISE.bbm;
  DB_LOADING.bbm = true;
  setLoading('tbody-bbm', 12);
  DB_LOADING_PROMISE.bbm = (async function() {
    var r = await fetchAll('bbm', 'tgl', false, 'lambung', true);
    DB_LOADING.bbm = false; DB_LOADING_PROMISE.bbm = null;
    if (r.error) { toast('Gagal memuat BBM: ' + r.error.message, true); return; }
    DB.bbm = r.data.map(function(d){
      return {id:String(d.id),tgl:String(d.tgl||'').substring(0,10),lambung:String(d.lambung||'').trim(),jalur:d.jalur,nopol:d.nopol,waktu:d.waktu,nominal:Number(d.nominal)||0,spbu:d.spbu,halte:d.halte,jamHalte:d.jam_halte,ket:d.ket};
    });
    DB_STALE.bbm = false;
    DB_FILTER.bbm = null;
    renderBBM(); renderAntrian(); applyFreeze('tbl-bbm');
  })();
  return DB_LOADING_PROMISE.bbm;
}
async function saveBBM() {
  var ctx = saveBBMCore(); if (!ctx) return;
  toast(ctx.isEdit ? 'Data BBM diperbarui!' : 'Data BBM disimpan!');
  closeModal('modal-bbm');
  renderBBM(); renderAntrian();
  _bbmNetworkSync(ctx.row, ctx.isEdit, ctx.editId);
}
function renderBBM() {
  var tbody=document.getElementById('tbody-bbm');
  var arr = (DB_FILTER.bbm !== null ? DB_FILTER.bbm : DB.bbm).slice();
  arr.sort(function(a,b){
    if(a.tgl > b.tgl) return -1; if(a.tgl < b.tgl) return 1;
    return Number(a.lambung)||a.lambung < Number(b.lambung)||b.lambung ? -1 : 1;
  });
  if(!arr.length){tbody.innerHTML='<tr><td colspan="13"><div class="empty-state"><i class="fas fa-fill-drip"></i><p>Belum ada data BBM</p></div></td></tr>';return;}
  // ── Matching murni tgl+lambung: BBM "Selesai" kalau ada Ops dengan tgl+lambung sama ──
  // Tidak bergantung bbm_id / status field — bebas urutan input
  var opsPasangan = {};
  DB.ops.forEach(function(o){ opsPasangan[o.tgl+'|'+String(o.lambung).trim()] = true; });
  tbody.innerHTML=arr.map(function(r,i){
    var key = r.tgl+'|'+String(r.lambung).trim();
    var isApproved = !!opsPasangan[key];
    var statusHtml = isApproved
      ? '<span class="badge-approved"><i class="fas fa-check-circle"></i> Selesai</span>'
      : '<span class="badge-pending"><i class="fas fa-clock"></i> Pending</span>';
    return '<tr>'
      +'<td class="freeze-col" style="font-weight:700;color:var(--green-dark);text-align:center;">'+(i+1)+'</td>'
      +'<td>'+r.tgl+'</td><td><strong>'+r.lambung+'</strong></td><td>'+r.jalur+'</td><td>'+r.nopol+'</td>'
      +'<td>'+(r.waktu||'-')+'</td><td>Rp '+Number(r.nominal).toLocaleString()+'</td>'
      +'<td>'+(r.spbu||'-')+'</td><td>'+(r.halte||'-')+'</td><td>'+(r.jamHalte||'-')+'</td><td>'+(r.ket||'-')+'</td>'
      +'<td style="text-align:center;">'+statusHtml+'</td>'
      +'<td><div class="action-btns"><button class="btn btn-outline btn-sm" onclick="editBBMById(\''+r.id+'\')"><i class="fas fa-edit"></i></button><button class="btn btn-danger btn-sm" onclick="delBBMById(\''+r.id+'\')"><i class="fas fa-trash"></i></button></div></td>'
      +'<td class="cb-th-hide" style="text-align:center;"><input type="checkbox" class="cb-select cb-row" value="'+r.id+'" onchange="onRowCheck(&quot;bbm&quot;,this,&quot;'+r.id+'&quot;)"></td>'
      +'</tr>';
  }).join('');
}
function editBBMById(id) {
  var i = DB.bbm.findIndex(function(r){ return r.id == id; });
  if (i < 0) return toast('Data tidak ditemukan', true);
  editIdx.bbm=i;var r=DB.bbm[i];populateLambDropdowns();populateSpbuDropdowns();
  document.getElementById('bbm-tgl').value=r.tgl;document.getElementById('bbm-lambung').value=r.lambung;autofillBBM();
  document.getElementById('bbm-waktu').value=r.waktu||'';document.getElementById('bbm-nominal').value=r.nominal;
  document.getElementById('bbm-spbu').value=r.spbu||'';document.getElementById('bbm-halte').value=r.halte||'';
  if(document.getElementById('bbm-jam-halte'))document.getElementById('bbm-jam-halte').value=r.jamHalte||'';
  document.getElementById('bbm-ket').value=r.ket||'';
  document.getElementById('modal-bbm-title').textContent='Edit Data BBM';openModal('modal-bbm');
}
async function delBBMById(id) {
  if(!confirm('Hapus data BBM ini?'))return;
  try {
    var res=await db.from('bbm').delete().eq('id',id);
    if(res.error)return toast('Gagal hapus: '+res.error.message,true);
    toast('Data BBM dihapus.');
    markStale('bbm','ops');
    Promise.all([loadBBM(true), loadOps(true)]).then(function(){ renderAntrian(); updateDashboard(); });
  } catch(e) { toast('Gagal hapus: '+(e.message||'Network error'),true); }
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
async function loadOps(forceRefresh) {
  if (!forceRefresh && !DB_STALE.ops && DB.ops.length) {
    renderOps(); renderAntrian(); return;
  }
  if (DB_LOADING.ops && DB_LOADING_PROMISE.ops) return DB_LOADING_PROMISE.ops;
  DB_LOADING.ops = true;
  setLoading('tbody-ops',17);
  DB_LOADING_PROMISE.ops = (async function() {
    var r = await fetchAll('operasional','tgl',false,'lambung',true);
    DB_LOADING.ops = false; DB_LOADING_PROMISE.ops = null;
    if(r.error){ toast('Gagal memuat operasional: '+r.error.message,true); return; }
    DB.ops=r.data.map(function(d){return{id:String(d.id),tgl:String(d.tgl||'').substring(0,10),lambung:String(d.lambung||'').trim(),jalur:d.jalur,nopol:d.nopol,jamMulai:d.jam_mulai,jamAkhir:d.jam_akhir,kmAwalPool:d.km_awal_pool,kmAkhirPool:d.km_akhir_pool,kmAwalHalte:d.km_awal_halte,kmAkhirHalte:d.km_akhir_halte,bbm:d.bbm_rp,rit:d.rit,kmTempuh:d.km_tempuh,ratio:d.ratio,ket:d.ket};});
    DB_STALE.ops = false;
    DB_FILTER.ops = null;
    renderOps(); renderAntrian(); applyFreeze('tbl-ops');
  })();
  return DB_LOADING_PROMISE.ops;
}
// ============================================================
// ANTRIAN BBM → OPS


// ============================================================
function renderAntrian() {
  var container = document.getElementById('antrian-container');
  if (!container) return;

  // ── Matching murni tgl+lambung ──────────────────────────────
  // BBM punya pasangan ops jika ada ops dengan tgl+lambung sama
  // Ops punya pasangan bbm jika ada bbm dengan tgl+lambung sama
  var opsKeys = {};
  DB.ops.forEach(function(o){ opsKeys[o.tgl+'|'+String(o.lambung).trim()] = true; });
  var bbmKeys = {};
  DB.bbm.forEach(function(b){ bbmKeys[b.tgl+'|'+String(b.lambung).trim()] = true; });

  // Panel A: BBM tanpa pasangan Ops → butuh diisi data operasional
  var bbmTanpaOps = DB.bbm.filter(function(b){
    return !opsKeys[b.tgl+'|'+String(b.lambung).trim()];
  });
  bbmTanpaOps.sort(function(a,b){ return a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : 0; });

  // Panel B: Ops tanpa pasangan BBM → butuh diisi data BBM
  var opsTanpaBBM = DB.ops.filter(function(o){
    return !bbmKeys[o.tgl+'|'+String(o.lambung).trim()];
  });
  opsTanpaBBM.sort(function(a,b){ return a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : 0; });

  var html = '';

  // ── Panel A: BBM menunggu Ops ──
  html += '<div style="margin-bottom:18px;">'
    + '<div style="font-weight:700;color:var(--green-dark);font-size:13px;margin-bottom:8px;">'
    + '<i class="fas fa-fill-drip" style="margin-right:6px;color:#e67e22;"></i>'
    + 'BBM Belum Ada Data Operasional <span style="background:#fff3cd;color:#856404;padding:2px 10px;border-radius:12px;font-size:11px;margin-left:6px;">'+bbmTanpaOps.length+'</span>'
    + '</div>';

  if (!bbmTanpaOps.length) {
    html += '<div style="padding:12px 16px;background:#f0fff4;border-radius:8px;color:#38a169;font-size:12px;font-weight:600;">'
      + '<i class="fas fa-check-circle" style="margin-right:6px;"></i>Semua BBM sudah ada data operasional</div>';
  } else {
    html += '<table id="tbl-antrian-bbm" style="font-size:12px;"><thead><tr>'
      + '<th style="width:36px;text-align:center;">No.</th>'
      + '<th>Tanggal</th><th>Lambung</th><th>Jalur</th><th>No Polisi</th>'
      + '<th>Waktu</th><th>Nominal BBM</th><th>SPBU</th><th>Aksi</th>'
      + '</tr></thead><tbody>';
    bbmTanpaOps.forEach(function(r, i) {
      html += '<tr style="background:#fffbea;">'
        + '<td style="text-align:center;font-weight:700;color:var(--green-dark);">'+(i+1)+'</td>'
        + '<td>'+r.tgl+'</td><td><strong>'+r.lambung+'</strong></td>'
        + '<td>'+(r.jalur||'-')+'</td><td>'+(r.nopol||'-')+'</td>'
        + '<td>'+(r.waktu||'-')+'</td>'
        + '<td>Rp '+Number(r.nominal).toLocaleString('id-ID')+'</td>'
        + '<td>'+(r.spbu||'-')+'</td>'
        + '<td><button class="btn btn-primary btn-sm" onclick="window._isiAntrian(this)" data-bbmid="'+r.id+'">'
        + '<i class="fas fa-clipboard-check"></i> Isi Ops</button></td>'
        + '</tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  // ── Panel B: Ops menunggu BBM ──
  html += '<div>'
    + '<div style="font-weight:700;color:var(--green-dark);font-size:13px;margin-bottom:8px;">'
    + '<i class="fas fa-clipboard-list" style="margin-right:6px;color:#3182ce;"></i>'
    + 'Operasional Belum Ada Data BBM <span style="background:#bee3f8;color:#2b6cb0;padding:2px 10px;border-radius:12px;font-size:11px;margin-left:6px;">'+opsTanpaBBM.length+'</span>'
    + '</div>';

  if (!opsTanpaBBM.length) {
    html += '<div style="padding:12px 16px;background:#ebf8ff;border-radius:8px;color:#3182ce;font-size:12px;font-weight:600;">'
      + '<i class="fas fa-check-circle" style="margin-right:6px;"></i>Semua Operasional sudah ada data BBM</div>';
  } else {
    html += '<table id="tbl-antrian-ops" style="font-size:12px;"><thead><tr>'
      + '<th style="width:36px;text-align:center;">No.</th>'
      + '<th>Tanggal</th><th>Lambung</th><th>Jalur</th><th>No Polisi</th>'
      + '<th>Jam Mulai</th><th>Jam Akhir</th><th>Aksi</th>'
      + '</tr></thead><tbody>';
    opsTanpaBBM.forEach(function(r, i) {
      html += '<tr style="background:#ebf8ff;">'
        + '<td style="text-align:center;font-weight:700;color:var(--green-dark);">'+(i+1)+'</td>'
        + '<td>'+r.tgl+'</td><td><strong>'+r.lambung+'</strong></td>'
        + '<td>'+(r.jalur||'-')+'</td><td>'+(r.nopol||'-')+'</td>'
        + '<td>'+(r.jamMulai||'-')+'</td><td>'+(r.jamAkhir||'-')+'</td>'
        + '<td><button class="btn btn-sm" style="background:#3182ce;color:#fff;border:none;" onclick="window._isiBBMAntrian(this)" data-tgl="'+r.tgl+'" data-lambung="'+r.lambung+'">'
        + '<i class="fas fa-fill-drip"></i> Isi BBM</button></td>'
        + '</tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  container.innerHTML = html;
}

window._isiAntrian = function(btn) {
  var bbmId = btn.getAttribute('data-bbmid');
  isiDariAntrian(bbmId);
};

// Panel B: dari Ops → buka modal BBM pre-filled tgl+lambung
window._isiBBMAntrian = function(btn) {
  var tgl     = btn.getAttribute('data-tgl');
  var lambung = btn.getAttribute('data-lambung');
  // Cari bus untuk autofill
  var bus = DB.bus.find(function(b){ return String(b.lambung).trim() === String(lambung).trim(); });
  populateLambDropdowns(); populateSpbuDropdowns();
  document.getElementById('bbm-tgl').value     = tgl;
  document.getElementById('bbm-lambung').value = lambung;
  if (bus) {
    document.getElementById('bbm-jalur').value = bus.jalur || '';
    document.getElementById('bbm-nopol').value = bus.nopol || '';
  }
  document.getElementById('modal-bbm-title').textContent = 'Input BBM — Lambung '+lambung+' ('+tgl+')';
  editIdx.bbm = -1;
  openModal('modal-bbm');
};

function isiDariAntrian(bbmId) {
  var bbmRec = DB.bbm.find(function(r){ return String(r.id) === String(bbmId); });
  if (!bbmRec) return toast('Data BBM tidak ditemukan!', true);
  editIdx.ops = -1;
  populateLambDropdowns();
  document.getElementById('ops-tgl').value     = bbmRec.tgl;
  document.getElementById('ops-lambung').value = bbmRec.lambung;
  autofillOps();
  // Total BBM hari itu untuk lambung yang sama
  var totalBBM = DB.bbm
    .filter(function(r){ return r.tgl === bbmRec.tgl && String(r.lambung).trim() === String(bbmRec.lambung).trim(); })
    .reduce(function(sum, r){ return sum + (parseFloat(r.nominal)||0); }, 0);
  document.getElementById('ops-bbm').value = totalBBM || bbmRec.nominal || '';
  // Info panel
  var info = document.getElementById('ops-bbm-info');
  if (info) {
    var bbmCount = DB.bbm.filter(function(r){ return r.tgl === bbmRec.tgl && String(r.lambung).trim() === String(bbmRec.lambung).trim(); }).length;
    info.textContent = '⛽ '+bbmCount+' pengisian BBM | Total: Rp '+totalBBM.toLocaleString('id-ID')+' | SPBU: '+(bbmRec.spbu||'-');
    info.style.cssText = 'display:block;background:#e6f4ea;color:#1a5c2a;border:1px solid #38a169;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:600;margin-top:4px;';
  }
  // Reset field lain
  ['ops-jam-mulai','ops-jam-akhir','ops-km-awal-pool','ops-km-akhir-pool',
   'ops-km-awal-halte','ops-km-akhir-halte','ops-rit','ops-km-tempuh','ops-ratio','ops-ket']
  .forEach(function(id){ document.getElementById(id).value = ''; });
  document.getElementById('modal-ops-title').textContent = 'Input Operasional — Lambung '+bbmRec.lambung+' ('+bbmRec.tgl+')';
  openModal('modal-ops');
}
function saveOps() {
  var ctx = saveOpsCore(); if (!ctx) return;
  toast(ctx.isEdit ? 'Data operasional diperbarui!' : 'Data operasional disimpan!');
  closeModal('modal-ops');
  renderOps(); renderAntrian();
  _opsNetworkSync(ctx.row, ctx.isEdit, ctx.editId);
}
function renderOps() {
  var tbody=document.getElementById('tbody-ops');
  var arr = (DB_FILTER.ops !== null ? DB_FILTER.ops : DB.ops).slice();
  arr.sort(function(a,b){
    if(a.tgl > b.tgl) return -1; if(a.tgl < b.tgl) return 1;
    return (Number(a.lambung)||0) - (Number(b.lambung)||0) || String(a.lambung).localeCompare(String(b.lambung));
  });
  if(!arr.length){tbody.innerHTML='<tr><td colspan="18"><div class="empty-state"><i class="fas fa-clipboard-list"></i><p>Belum ada data operasional</p></div></td></tr>';return;}
  // ── Matching murni tgl+lambung: Ops "Selesai" kalau ada BBM dengan tgl+lambung sama ──
  var bbmPasangan = {};
  DB.bbm.forEach(function(b){ bbmPasangan[b.tgl+'|'+String(b.lambung).trim()] = true; });
  tbody.innerHTML=arr.map(function(r,i){
    function fmtKm(v){ return v ? Number(v).toLocaleString('id-ID') : '-'; }
    var key = r.tgl+'|'+String(r.lambung).trim();
    var isSelesai = !!bbmPasangan[key];
    var statusHtml = isSelesai
      ? '<span class="badge-approved"><i class="fas fa-check-circle"></i> Selesai</span>'
      : '<span class="badge-manual"><i class="fas fa-pencil-alt"></i> Belum Ada BBM</span>';
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
      +'<td style="text-align:center;">'+statusHtml+'</td>'
      +'<td><div class="action-btns"><button class="btn btn-outline btn-sm" onclick="editOpsById(\''+r.id+'\')"><i class="fas fa-edit"></i></button><button class="btn btn-danger btn-sm" onclick="delOpsById(\''+r.id+'\')"><i class="fas fa-trash"></i></button></div></td>'
      +'<td class="cb-th-hide" style="text-align:center;"><input type="checkbox" class="cb-select cb-row" value="'+r.id+'" onchange="onRowCheck(&quot;ops&quot;,this,&quot;'+r.id+'&quot;)"></td>'
      +'</tr>';
  }).join('');
}
function editOpsById(id) {
  var i = DB.ops.findIndex(function(r){ return r.id == id; });
  if (i < 0) return toast('Data tidak ditemukan', true);
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
async function delOpsById(id) {
  if(!confirm('Hapus data operasional ini?'))return;
  try {
    var res=await db.from('operasional').delete().eq('id',id);
    if(res.error)return toast('Gagal hapus: '+res.error.message,true);
    toast('Data operasional dihapus.');
    markStale('ops','bbm');
    Promise.all([loadOps(true), loadBBM(true)]).then(function(){ renderAntrian(); updateDashboard(); });
  } catch(e) { toast('Gagal hapus: '+(e.message||'Network error'),true); }
}

// ============================================================
// FILTER & LAPORAN
// ============================================================
// State filter aktif per tabel - agar render/delete/edit pakai array yg benar
var DB_FILTER = { bus: null, spbu: null, bbm: null, ops: null, akun: null };

function filterTable(tableId, keyword) {
  var kw = keyword.trim().toLowerCase();

  var keyMap = { 'tbl-bus':'bus', 'tbl-spbu':'spbu', 'tbl-bbm':'bbm', 'tbl-ops':'ops', 'tbl-akun':'akun' };
  var renderMap = {
    'tbl-bus':  function(){ renderBus(); },
    'tbl-spbu': function(){ renderSpbu(); },
    'tbl-bbm':  function(){ renderBBM(); },
    'tbl-ops':  function(){ renderOps(); },
    'tbl-akun': function(){ renderAkun(); }
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
  var rows=lambs.map(function(lamb){var items=data.filter(function(r){return r.lambung===lamb;});var jalur=items[0]?items[0].jalur:'-';var totalJam=items.reduce(function(s,r){return s+(Number(r.kmTempuh)||0);},0);var totalBBM=items.reduce(function(s,r){return s+(Number(r.bbm)||0);},0);var totalRit=items.reduce(function(s,r){return s+(Number(r.rit)||0);},0);var liter=totalBBM/6800;var ratio=liter>0?(totalJam/liter).toFixed(2):'-';return{lamb:lamb,jalur:jalur,totalJam:totalJam,totalBBM:totalBBM,liter:liter.toFixed(2),ratio:ratio,totalRit:totalRit};});
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
    var totalKm    = oRows.reduce(function(s,r){ return s + Number(r.kmTempuh||0); }, 0);
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
    var totalKm    = oRows.reduce(function(s,r){ return s + Number(r.kmTempuh||0); }, 0);
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
    var totalKm    = oRows.reduce(function(s,r){ return s+Number(r.kmTempuh||0); }, 0);
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
      var tbl=type==='ops'?'operasional':type;var inserted=0;
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
  // Hitung antrian hari ini: BBM tanpa pasangan Ops (matching tgl+lambung)
  var opsKeys={};
  DB.ops.forEach(function(o){ if(o.tgl===today) opsKeys[String(o.lambung).trim()]=true; });
  var bbmPending = DB.bbm.filter(function(b){ return b.tgl===today && !opsKeys[String(b.lambung).trim()]; }).length;
  var elPending = document.getElementById('banner-pending');
  if(elPending) elPending.textContent = bbmPending;
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
  markStale('bus','spbu','bbm','ops');
  if(id==='data-bus')await loadBus(true); if(id==='data-spbu')await loadSpbu(true);
  if(id==='input-bbm')await loadBBM(true); if(id==='input-ops')await loadOps(true);
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
