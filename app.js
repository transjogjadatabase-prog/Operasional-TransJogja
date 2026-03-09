// ============================================================
// app.js — Operasional TransJogja (dengan Supabase)
// ============================================================
import { supabase } from './supabase.js';

// ============ STATE ============
let DB = { bus: [], spbu: [], bbm: [], ops: [] };
let editIdx = { bus: -1, spbu: -1, bbm: -1, ops: -1 };

// ============ NAVIGATION ============
const pageTitles = {
  'dashboard':     'Dashboard',
  'data-bus':      'Data Master — Bus',
  'data-spbu':     'Data Master — SPBU',
  'input-bbm':     'Input BBM',
  'input-ops':     'Input Operasional',
  'lap-bbm-waktu': 'Laporan Waktu Pengisian BBM',
  'lap-bbm':       'Laporan BBM',
  'lap-ops':       'Laporan Operasional'
};

function goPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelector(`[onclick="goPage('${id}')"]`).classList.add('active');
  document.getElementById('page-title').textContent = pageTitles[id] || id;
  if (id === 'dashboard')     updateDashboard();
  if (id === 'data-bus')      loadBus();
  if (id === 'data-spbu')     loadSpbu();
  if (id === 'input-bbm')     loadBBM();
  if (id === 'input-ops')     loadOps();
  if (id === 'lap-bbm-waktu') populateSpbuFilter();
  if (id === 'lap-bbm')       populateLambFilter('lb-lamb');
  if (id === 'lap-ops')       populateLambFilter('lo-lamb');
}

function setDateNow() {
  const now = new Date();
  document.getElementById('page-date').textContent =
    now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
// setDateNow called in init

// ============ SIDEBAR TOGGLE ============
let sidebarOpen = false;

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
    // Only show overlay on mobile
    if (window.innerWidth <= 900) {
      overlay.classList.add('show');
    }
    if (icon) icon.className = 'fas fa-times';
  } else {
    sidebar.classList.remove('open');
    main.classList.remove('sidebar-open');
    overlay.classList.remove('show');
    if (icon) icon.className = 'fas fa-bars';
  }
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 900) {
    // Desktop: always show sidebar, no overlay
    if (!sidebarOpen) { sidebarOpen = true; applySidebarState(); }
    document.getElementById('sidebar-overlay').classList.remove('show');
  } else {
    // Mobile: hide sidebar
    if (sidebarOpen) { sidebarOpen = false; applySidebarState(); }
  }
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 900 && !sidebarOpen) {
    sidebarOpen = true;
    applySidebarState();
  } else if (window.innerWidth <= 900 && sidebarOpen) {
    sidebarOpen = false;
    applySidebarState();
  }
});

// ============ MODALS ============
function openModal(id) {
  if (id === 'modal-bbm') { populateLambDropdowns(); populateSpbuDropdowns(); }
  if (id === 'modal-ops') { populateLambDropdowns(); }
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  const type = id.replace('modal-', '');
  if (editIdx[type] !== undefined) editIdx[type] = -1;
  clearForm(id);
}
// modal overlay listeners added in init
function clearForm(modalId) {
  document.querySelectorAll(`#${modalId} input, #${modalId} textarea, #${modalId} select`).forEach(el => {
    if (el.type === 'file') return;
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
}

// ============ TOAST ============
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function setLoading(tbodyId, colspan) {
  const el = document.getElementById(tbodyId);
  if (el) el.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;padding:32px;color:var(--gray-400);"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><br>Memuat data...</td></tr>`;
}

// ============================================================
// BUS
// ============================================================
async function loadBus() {
  setLoading('tbody-bus', 10);
  const { data, error } = await supabase.from('bus').select('*').order('created_at', { ascending: false });
  if (error) return toast('Gagal memuat data bus: ' + error.message, true);
  DB.bus = data.map(r => ({ id: r.id, lambung: r.lambung, nopol: r.nopol, jalur: r.jalur, tipe: r.tipe, karoseri: r.karoseri, warna: r.warna, ket: r.ket, foto: r.foto_url }));
  renderBus();
  populateLambDropdowns();
}

async function saveBus() {
  const lambung = document.getElementById('bus-lambung').value.trim();
  const nopol   = document.getElementById('bus-nopol').value.trim();
  const jalur   = document.getElementById('bus-jalur').value.trim();
  if (!lambung || !nopol || !jalur) return toast('Lambung, No Polisi, dan Jalur wajib diisi!', true);
  let foto_url = editIdx.bus >= 0 ? DB.bus[editIdx.bus].foto : '';
  const fotoFile = document.getElementById('bus-foto-input').files[0];
  if (fotoFile) {
    const ext  = fotoFile.name.split('.').pop();
    const path = `bus/${lambung}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('foto-bus').upload(path, fotoFile, { upsert: true });
    if (upErr) { toast('Gagal upload foto: ' + upErr.message, true); return; }
    const { data: urlData } = supabase.storage.from('foto-bus').getPublicUrl(path);
    foto_url = urlData.publicUrl;
  }
  const row = { lambung, nopol, jalur, tipe: document.getElementById('bus-tipe').value, karoseri: document.getElementById('bus-karoseri').value, warna: document.getElementById('bus-warna').value, ket: document.getElementById('bus-ket').value, foto_url };
  let error;
  if (editIdx.bus >= 0) { ({ error } = await supabase.from('bus').update(row).eq('id', DB.bus[editIdx.bus].id)); if (!error) toast('Data bus diperbarui!'); }
  else { row.id = 'B' + String(Date.now()).slice(-6); ({ error } = await supabase.from('bus').insert(row)); if (!error) toast('Data bus disimpan!'); }
  if (error) return toast('Error: ' + error.message, true);
  closeModal('modal-bus'); loadBus(); updateDashboard();
}

function renderBus() {
  const tbody = document.getElementById('tbody-bus');
  if (!DB.bus.length) { tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><i class="fas fa-bus"></i><p>Belum ada data bus</p></div></td></tr>`; return; }
  tbody.innerHTML = DB.bus.map((r, i) => `<tr>
    <td>${r.id}</td><td><strong>${r.lambung}</strong></td><td>${r.nopol}</td>
    <td><span class="badge-status badge-aktif">${r.jalur}</span></td>
    <td>${r.tipe||'-'}</td><td>${r.karoseri||'-'}</td><td>${r.warna||'-'}</td><td>${r.ket||'-'}</td>
    <td>${r.foto ? `<img src="${r.foto}" style="width:44px;height:32px;object-fit:cover;border-radius:6px;">` : '—'}</td>
    <td><div class="action-btns">
      <button class="btn btn-outline btn-sm" onclick="editBus(${i})"><i class="fas fa-edit"></i></button>
      <button class="btn btn-danger btn-sm" onclick="delBus(${i})"><i class="fas fa-trash"></i></button>
    </div></td></tr>`).join('');
}

function editBus(i) {
  editIdx.bus = i; const r = DB.bus[i];
  document.getElementById('bus-lambung').value = r.lambung; document.getElementById('bus-nopol').value = r.nopol;
  document.getElementById('bus-jalur').value = r.jalur; document.getElementById('bus-tipe').value = r.tipe||'';
  document.getElementById('bus-karoseri').value = r.karoseri||''; document.getElementById('bus-warna').value = r.warna||'';
  document.getElementById('bus-ket').value = r.ket||'';
  document.getElementById('modal-bus-title').textContent = 'Edit Data Bus'; openModal('modal-bus');
}
async function delBus(i) {
  if (!confirm('Hapus data bus ini?')) return;
  const { error } = await supabase.from('bus').delete().eq('id', DB.bus[i].id);
  if (error) return toast('Gagal hapus: ' + error.message, true);
  toast('Data bus dihapus.'); loadBus(); updateDashboard();
}

// ============================================================
// SPBU
// ============================================================
async function loadSpbu() {
  setLoading('tbody-spbu', 6);
  const { data, error } = await supabase.from('spbu').select('*').order('created_at', { ascending: false });
  if (error) return toast('Gagal memuat SPBU: ' + error.message, true);
  DB.spbu = data.map(r => ({ id: r.id, nama: r.nama, alamat: r.alamat, hp: r.hp, aktif: r.aktif }));
  renderSpbu(); populateSpbuDropdowns();
}

async function saveSpbu() {
  const nama = document.getElementById('spbu-nama').value.trim();
  if (!nama) return toast('Nama SPBU wajib diisi!', true);
  const row = { nama, alamat: document.getElementById('spbu-alamat').value, hp: document.getElementById('spbu-hp').value, aktif: document.getElementById('spbu-status').value === '1' };
  let error;
  if (editIdx.spbu >= 0) { ({ error } = await supabase.from('spbu').update(row).eq('id', DB.spbu[editIdx.spbu].id)); if (!error) toast('Data SPBU diperbarui!'); }
  else { row.id = 'S' + String(Date.now()).slice(-6); ({ error } = await supabase.from('spbu').insert(row)); if (!error) toast('Data SPBU disimpan!'); }
  if (error) return toast('Error: ' + error.message, true);
  closeModal('modal-spbu'); loadSpbu(); updateDashboard();
}

function renderSpbu() {
  const tbody = document.getElementById('tbody-spbu');
  if (!DB.spbu.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-gas-pump"></i><p>Belum ada data SPBU</p></div></td></tr>`; return; }
  tbody.innerHTML = DB.spbu.map((r, i) => `<tr>
    <td>${r.id}</td><td><strong>${r.nama}</strong></td><td>${r.alamat||'-'}</td><td>${r.hp||'-'}</td>
    <td><span class="badge-status ${r.aktif?'badge-aktif':'badge-nonaktif'}">${r.aktif?'Aktif':'Tidak Aktif'}</span></td>
    <td><div class="action-btns">
      <button class="btn btn-outline btn-sm" onclick="editSpbu(${i})"><i class="fas fa-edit"></i></button>
      <button class="btn btn-danger btn-sm" onclick="delSpbu(${i})"><i class="fas fa-trash"></i></button>
    </div></td></tr>`).join('');
}
function editSpbu(i) {
  editIdx.spbu = i; const r = DB.spbu[i];
  document.getElementById('spbu-nama').value = r.nama; document.getElementById('spbu-alamat').value = r.alamat||'';
  document.getElementById('spbu-hp').value = r.hp||''; document.getElementById('spbu-status').value = r.aktif?'1':'0';
  document.getElementById('modal-spbu-title').textContent = 'Edit Data SPBU'; openModal('modal-spbu');
}
async function delSpbu(i) {
  if (!confirm('Hapus data SPBU ini?')) return;
  const { error } = await supabase.from('spbu').delete().eq('id', DB.spbu[i].id);
  if (error) return toast('Gagal hapus: ' + error.message, true);
  toast('Data SPBU dihapus.'); loadSpbu(); updateDashboard();
}

// ============================================================
// BBM
// ============================================================
function populateLambDropdowns() {
  ['bbm-lambung','ops-lambung'].forEach(id => {
    const sel = document.getElementById(id); if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="">-- Pilih Lambung --</option>' + DB.bus.map(b => `<option value="${b.lambung}">${b.lambung} — ${b.nopol}</option>`).join('');
    sel.value = val;
  });
}
function populateSpbuDropdowns() {
  const sel = document.getElementById('bbm-spbu'); if (!sel) return;
  const val = sel.value;
  sel.innerHTML = '<option value="">-- Pilih SPBU --</option>' + DB.spbu.filter(s=>s.aktif).map(s=>`<option value="${s.nama}">${s.nama}</option>`).join('');
  sel.value = val;
}
function autofillBBM() {
  const bus = DB.bus.find(b => b.lambung === document.getElementById('bbm-lambung').value);
  document.getElementById('bbm-jalur').value = bus ? bus.jalur : '';
  document.getElementById('bbm-nopol').value = bus ? bus.nopol : '';
}

async function loadBBM() {
  setLoading('tbody-bbm', 12);
  const { data, error } = await supabase.from('bbm').select('*').order('tgl', { ascending: false });
  if (error) return toast('Gagal memuat BBM: ' + error.message, true);
  DB.bbm = data.map(r => ({ id: r.id, tgl: r.tgl, lambung: r.lambung, jalur: r.jalur, nopol: r.nopol, waktu: r.waktu, nominal: r.nominal, spbu: r.spbu, halte: r.halte, jamHalte: r.jam_halte, ket: r.ket }));
  renderBBM();
}
async function saveBBM() {
  const tgl = document.getElementById('bbm-tgl').value, lamb = document.getElementById('bbm-lambung').value, nominal = document.getElementById('bbm-nominal').value;
  if (!tgl || !lamb || !nominal) return toast('Tanggal, Lambung, dan Nominal wajib diisi!', true);
  const row = { tgl, lambung: lamb, jalur: document.getElementById('bbm-jalur').value, nopol: document.getElementById('bbm-nopol').value, waktu: document.getElementById('bbm-waktu').value||null, nominal: parseFloat(nominal), spbu: document.getElementById('bbm-spbu').value, halte: document.getElementById('bbm-halte').value, jam_halte: document.getElementById('bbm-jam-halte').value||null, ket: document.getElementById('bbm-ket').value };
  let error;
  if (editIdx.bbm >= 0) { ({ error } = await supabase.from('bbm').update(row).eq('id', DB.bbm[editIdx.bbm].id)); if (!error) toast('Data BBM diperbarui!'); }
  else { row.id = 'BBM'+String(Date.now()).slice(-6); ({ error } = await supabase.from('bbm').insert(row)); if (!error) toast('Data BBM disimpan!'); }
  if (error) return toast('Error: ' + error.message, true);
  closeModal('modal-bbm'); loadBBM(); updateDashboard();
}
function renderBBM() {
  const tbody = document.getElementById('tbody-bbm');
  if (!DB.bbm.length) { tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><i class="fas fa-fill-drip"></i><p>Belum ada data BBM</p></div></td></tr>`; return; }
  tbody.innerHTML = DB.bbm.map((r,i) => `<tr>
    <td>${r.id}</td><td>${r.tgl}</td><td><strong>${r.lambung}</strong></td><td>${r.jalur}</td><td>${r.nopol}</td>
    <td>${r.waktu||'-'}</td><td>Rp ${Number(r.nominal).toLocaleString()}</td><td>${r.spbu||'-'}</td>
    <td>${r.halte||'-'}</td><td>${r.jamHalte||'-'}</td><td>${r.ket||'-'}</td>
    <td><div class="action-btns">
      <button class="btn btn-outline btn-sm" onclick="editBBM(${i})"><i class="fas fa-edit"></i></button>
      <button class="btn btn-danger btn-sm" onclick="delBBM(${i})"><i class="fas fa-trash"></i></button>
    </div></td></tr>`).join('');
}
function editBBM(i) {
  editIdx.bbm = i; const r = DB.bbm[i];
  populateLambDropdowns(); populateSpbuDropdowns();
  document.getElementById('bbm-tgl').value = r.tgl; document.getElementById('bbm-lambung').value = r.lambung; autofillBBM();
  document.getElementById('bbm-waktu').value = r.waktu||''; document.getElementById('bbm-nominal').value = r.nominal;
  document.getElementById('bbm-spbu').value = r.spbu||''; document.getElementById('bbm-halte').value = r.halte||'';
  document.getElementById('bbm-jam-halte').value = r.jamHalte||''; document.getElementById('bbm-ket').value = r.ket||'';
  document.getElementById('modal-bbm-title').textContent = 'Edit Data BBM'; openModal('modal-bbm');
}
async function delBBM(i) {
  if (!confirm('Hapus data BBM ini?')) return;
  const { error } = await supabase.from('bbm').delete().eq('id', DB.bbm[i].id);
  if (error) return toast('Gagal hapus: ' + error.message, true);
  toast('Data BBM dihapus.'); loadBBM(); updateDashboard();
}

// ============================================================
// OPERASIONAL
// ============================================================
function autofillOps() {
  const bus = DB.bus.find(b => b.lambung === document.getElementById('ops-lambung').value);
  document.getElementById('ops-jalur').value = bus ? bus.jalur : '';
  document.getElementById('ops-nopol').value = bus ? bus.nopol : '';
}
function calcOps() {
  const jm = document.getElementById('ops-jam-mulai').value, ja = document.getElementById('ops-jam-akhir').value;
  const bbm = parseFloat(document.getElementById('ops-bbm').value)||0;
  if (jm && ja) {
    const [hm,mm]=jm.split(':').map(Number), [ha,ma]=ja.split(':').map(Number);
    let d=(ha*60+ma)-(hm*60+mm); if(d<0)d+=1440;
    document.getElementById('ops-km-tempuh').value = d+' menit';
    if (bbm>0) document.getElementById('ops-ratio').value = (d/(bbm/6800)).toFixed(2);
  }
}
async function loadOps() {
  setLoading('tbody-ops', 17);
  const { data, error } = await supabase.from('operasional').select('*').order('tgl', { ascending: false });
  if (error) return toast('Gagal memuat operasional: ' + error.message, true);
  DB.ops = data.map(r => ({ id: r.id, tgl: r.tgl, lambung: r.lambung, jalur: r.jalur, nopol: r.nopol, jamMulai: r.jam_mulai, jamAkhir: r.jam_akhir, kmAwalPool: r.km_awal_pool, kmAkhirPool: r.km_akhir_pool, kmAwalHalte: r.km_awal_halte, kmAkhirHalte: r.km_akhir_halte, bbm: r.bbm_rp, rit: r.rit, kmTempuh: r.km_tempuh, ratio: r.ratio, ket: r.ket }));
  renderOps();
}
async function saveOps() {
  const tgl = document.getElementById('ops-tgl').value, lamb = document.getElementById('ops-lambung').value;
  if (!tgl || !lamb) return toast('Tanggal dan Lambung wajib diisi!', true);
  const jm = document.getElementById('ops-jam-mulai').value, ja = document.getElementById('ops-jam-akhir').value;
  const bbmVal = parseFloat(document.getElementById('ops-bbm').value)||0;
  let kmTempuh = null, ratio = null;
  if (jm && ja) { const [hm,mm]=jm.split(':').map(Number),[ha,ma]=ja.split(':').map(Number); let d=(ha*60+ma)-(hm*60+mm); if(d<0)d+=1440; kmTempuh=d; if(bbmVal>0) ratio=parseFloat((d/(bbmVal/6800)).toFixed(2)); }
  const row = { tgl, lambung: lamb, jalur: document.getElementById('ops-jalur').value, nopol: document.getElementById('ops-nopol').value, jam_mulai: jm||null, jam_akhir: ja||null, km_awal_pool: parseFloat(document.getElementById('ops-km-awal-pool').value)||null, km_akhir_pool: parseFloat(document.getElementById('ops-km-akhir-pool').value)||null, km_awal_halte: parseFloat(document.getElementById('ops-km-awal-halte').value)||null, km_akhir_halte: parseFloat(document.getElementById('ops-km-akhir-halte').value)||null, bbm_rp: bbmVal, rit: parseInt(document.getElementById('ops-rit').value)||0, km_tempuh: kmTempuh, ratio, ket: document.getElementById('ops-ket').value };
  let error;
  if (editIdx.ops >= 0) { ({ error } = await supabase.from('operasional').update(row).eq('id', DB.ops[editIdx.ops].id)); if (!error) toast('Data operasional diperbarui!'); }
  else { row.id = 'OPS'+String(Date.now()).slice(-6); ({ error } = await supabase.from('operasional').insert(row)); if (!error) toast('Data operasional disimpan!'); }
  if (error) return toast('Error: ' + error.message, true);
  closeModal('modal-ops'); loadOps(); updateDashboard();
}
function renderOps() {
  const tbody = document.getElementById('tbody-ops');
  if (!DB.ops.length) { tbody.innerHTML = `<tr><td colspan="17"><div class="empty-state"><i class="fas fa-clipboard-list"></i><p>Belum ada data operasional</p></div></td></tr>`; return; }
  tbody.innerHTML = DB.ops.map((r,i) => `<tr>
    <td>${r.id}</td><td>${r.tgl}</td><td><strong>${r.lambung}</strong></td><td>${r.jalur}</td><td>${r.nopol}</td>
    <td>${r.jamMulai||'-'}</td><td>${r.jamAkhir||'-'}</td><td>${r.kmAwalPool||'-'}</td><td>${r.kmAkhirPool||'-'}</td>
    <td>${r.kmAwalHalte||'-'}</td><td>${r.kmAkhirHalte||'-'}</td>
    <td>Rp ${r.bbm?Number(r.bbm).toLocaleString():'-'}</td><td>${r.rit||'-'}</td>
    <td><strong>${r.kmTempuh||'-'}</strong></td><td>${r.ratio||'-'}</td><td>${r.ket||'-'}</td>
    <td><div class="action-btns">
      <button class="btn btn-outline btn-sm" onclick="editOps(${i})"><i class="fas fa-edit"></i></button>
      <button class="btn btn-danger btn-sm" onclick="delOps(${i})"><i class="fas fa-trash"></i></button>
    </div></td></tr>`).join('');
}
function editOps(i) {
  editIdx.ops = i; const r = DB.ops[i]; populateLambDropdowns();
  document.getElementById('ops-tgl').value=r.tgl; document.getElementById('ops-lambung').value=r.lambung; autofillOps();
  document.getElementById('ops-jam-mulai').value=r.jamMulai||''; document.getElementById('ops-jam-akhir').value=r.jamAkhir||'';
  document.getElementById('ops-km-awal-pool').value=r.kmAwalPool||''; document.getElementById('ops-km-akhir-pool').value=r.kmAkhirPool||'';
  document.getElementById('ops-km-awal-halte').value=r.kmAwalHalte||''; document.getElementById('ops-km-akhir-halte').value=r.kmAkhirHalte||'';
  document.getElementById('ops-bbm').value=r.bbm||''; document.getElementById('ops-rit').value=r.rit||'';
  document.getElementById('ops-km-tempuh').value=r.kmTempuh||''; document.getElementById('ops-ratio').value=r.ratio||'';
  document.getElementById('ops-ket').value=r.ket||'';
  document.getElementById('modal-ops-title').textContent='Edit Data Operasional'; openModal('modal-ops');
}
async function delOps(i) {
  if (!confirm('Hapus data operasional ini?')) return;
  const { error } = await supabase.from('operasional').delete().eq('id', DB.ops[i].id);
  if (error) return toast('Gagal hapus: ' + error.message, true);
  toast('Data operasional dihapus.'); loadOps(); updateDashboard();
}

// ============================================================
// FILTER & LAPORAN
// ============================================================
function filterTable(tableId, keyword) {
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(keyword.toLowerCase()) ? '' : 'none';
  });
}
function populateSpbuFilter() {
  const sel = document.getElementById('lw-spbu');
  sel.innerHTML = '<option value="">Semua SPBU</option>' + DB.spbu.map(s=>`<option value="${s.nama}">${s.nama}</option>`).join('');
}
function populateLambFilter(selId) {
  const sel = document.getElementById(selId);
  sel.innerHTML = '<option value="">Semua Lambung</option>' + DB.bus.map(b=>`<option value="${b.lambung}">${b.lambung}</option>`).join('');
}
function generateLapWaktu() {
  const tglMulai=document.getElementById('lw-tgl-mulai').value, tglAkhir=document.getElementById('lw-tgl-akhir').value;
  const jamMulai=document.getElementById('lw-jam-mulai').value||'05:00', jamAkhir=document.getElementById('lw-jam-akhir').value||'22:00';
  const spbuF=document.getElementById('lw-spbu').value;
  let data=DB.bbm;
  if(tglMulai)data=data.filter(r=>r.tgl>=tglMulai); if(tglAkhir)data=data.filter(r=>r.tgl<=tglAkhir);
  if(spbuF)data=data.filter(r=>r.spbu===spbuF);
  const jamOps=data.filter(r=>r.waktu&&r.waktu>=jamMulai&&r.waktu<=jamAkhir);
  const sblm=data.filter(r=>r.waktu&&r.waktu<jamMulai), atas=data.filter(r=>r.waktu&&r.waktu>jamAkhir);
  const el=document.getElementById('result-lap-waktu');
  if(!data.length){el.innerHTML=`<div class="card"><div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada data</p></div></div>`;return;}
  el.innerHTML=`<div class="report-summary">
    <div class="sum-card"><div class="val">${data.length}</div><div class="lbl">Total</div></div>
    <div class="sum-card"><div class="val">${jamOps.length}</div><div class="lbl">Jam Operasional</div></div>
    <div class="sum-card"><div class="val">${sblm.length}</div><div class="lbl">Sebelum</div></div>
    <div class="sum-card"><div class="val">${atas.length}</div><div class="lbl">Setelah</div></div>
  </div>
  <div class="card" id="lap-waktu-content">
    <div class="card-header"><div class="card-title">Detail Pengisian BBM</div></div>
    <div class="tabs">
      <button class="tab active" onclick="showWaktuTab(this,'tab-jam')">Jam Operasional (${jamOps.length})</button>
      <button class="tab" onclick="showWaktuTab(this,'tab-sblm')">Sebelum (${sblm.length})</button>
      <button class="tab" onclick="showWaktuTab(this,'tab-atas')">Setelah (${atas.length})</button>
    </div>
    <div id="tab-jam">${renderBBMRows(jamOps)}</div>
    <div id="tab-sblm" style="display:none">${renderBBMRows(sblm)}</div>
    <div id="tab-atas" style="display:none">${renderBBMRows(atas)}</div>
  </div>`;
}
function showWaktuTab(btn,tabId){
  btn.closest('.card').querySelectorAll('.tabs .tab').forEach(t=>t.classList.remove('active')); btn.classList.add('active');
  ['tab-jam','tab-sblm','tab-atas'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=id===tabId?'':'none';});
}
function renderBBMRows(rows){
  if(!rows.length)return`<div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada data</p></div>`;
  return`<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Lambung</th><th>Jalur</th><th>No Polisi</th><th>Waktu</th><th>Nominal</th><th>SPBU</th><th>Halte</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.tgl}</td><td>${r.lambung}</td><td>${r.jalur}</td><td>${r.nopol}</td><td>${r.waktu||'-'}</td><td>Rp ${Number(r.nominal).toLocaleString()}</td><td>${r.spbu||'-'}</td><td>${r.halte||'-'}</td></tr>`).join('')}</tbody></table></div>`;
}
function generateLapBBM(){
  const tglM=document.getElementById('lb-tgl-mulai').value,tglA=document.getElementById('lb-tgl-akhir').value,lambF=document.getElementById('lb-lamb').value;
  let data=DB.bbm; if(tglM)data=data.filter(r=>r.tgl>=tglM); if(tglA)data=data.filter(r=>r.tgl<=tglA); if(lambF)data=data.filter(r=>r.lambung===lambF);
  const el=document.getElementById('result-lap-bbm');
  if(!data.length){el.innerHTML=`<div class="card"><div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada data</p></div></div>`;return;}
  const lambs=[...new Set(data.map(r=>r.lambung))].sort(), dates=[...new Set(data.map(r=>r.tgl))].sort();
  const tot=data.reduce((s,r)=>s+Number(r.nominal),0);
  let html=`<div class="card" id="lap-bbm-content"><div class="card-header"><div class="card-title">Laporan BBM Harian</div></div>
    <div style="margin-bottom:14px;background:var(--green-pale);padding:12px 18px;border-radius:10px;display:flex;gap:32px;">
      <div><span style="font-size:12px;color:var(--green-main);">Total Pengisian</span><div style="font-size:22px;font-weight:800;color:var(--green-dark);font-family:'Syne',sans-serif;">${data.length}x</div></div>
      <div><span style="font-size:12px;color:var(--green-main);">Total Nominal</span><div style="font-size:22px;font-weight:800;color:var(--green-dark);font-family:'Syne',sans-serif;">Rp ${tot.toLocaleString()}</div></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Lambung</th>${dates.map(d=>`<th>${d}</th>`).join('')}<th style="background:#d4edda;color:#1a7a35;">TOTAL</th></tr></thead><tbody>`;
  lambs.forEach(lamb=>{
    let rowTot=0; html+=`<tr><td><strong>${lamb}</strong></td>`;
    dates.forEach(d=>{const s=data.filter(r=>r.lambung===lamb&&r.tgl===d).reduce((a,r)=>a+Number(r.nominal),0);rowTot+=s;html+=`<td>${s?'Rp '+s.toLocaleString():'-'}</td>`;});
    html+=`<td style="font-weight:700;color:var(--green-dark);">Rp ${rowTot.toLocaleString()}</td></tr>`;
  });
  html+=`<tr style="background:var(--green-pale);font-weight:700;"><td>TOTAL</td>`;
  dates.forEach(d=>{const s=data.filter(r=>r.tgl===d).reduce((a,r)=>a+Number(r.nominal),0);html+=`<td>Rp ${s.toLocaleString()}</td>`;});
  html+=`<td>Rp ${tot.toLocaleString()}</td></tr></tbody></table></div></div>`;
  el.innerHTML=html;
}
function generateLapOps(){
  const tglM=document.getElementById('lo-tgl-mulai').value,tglA=document.getElementById('lo-tgl-akhir').value,lambF=document.getElementById('lo-lamb').value;
  let data=DB.ops; if(tglM)data=data.filter(r=>r.tgl>=tglM); if(tglA)data=data.filter(r=>r.tgl<=tglA); if(lambF)data=data.filter(r=>r.lambung===lambF);
  const el=document.getElementById('result-lap-ops');
  if(!data.length){el.innerHTML=`<div class="card"><div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada data</p></div></div>`;return;}
  const lambs=[...new Set(data.map(r=>r.lambung))].sort();
  const rows=lambs.map(lamb=>{
    const items=data.filter(r=>r.lambung===lamb), jalur=items[0]?.jalur||'-';
    const totalJam=items.reduce((s,r)=>s+(Number(r.kmTempuh)||0),0), totalBBM=items.reduce((s,r)=>s+(Number(r.bbm)||0),0);
    const totalRit=items.reduce((s,r)=>s+(Number(r.rit)||0),0), liter=(totalBBM/6800), ratio=liter>0?(totalJam/liter).toFixed(2):'-';
    return{lamb,jalur,totalJam,totalBBM,liter:liter.toFixed(2),ratio,totalRit};
  });
  const gBBM=rows.reduce((s,r)=>s+r.totalBBM,0), gRit=rows.reduce((s,r)=>s+r.totalRit,0);
  el.innerHTML=`<div class="card" id="lap-ops-content">
    <div class="card-header"><div class="card-title">Rekapitulasi Operasional</div></div>
    <div class="report-summary" style="margin-bottom:18px;">
      <div class="sum-card"><div class="val">${rows.length}</div><div class="lbl">Lambung</div></div>
      <div class="sum-card"><div class="val">${gRit}</div><div class="lbl">Total Ritase</div></div>
      <div class="sum-card"><div class="val">Rp ${gBBM.toLocaleString()}</div><div class="lbl">Total BBM (Rp)</div></div>
      <div class="sum-card"><div class="val">${(gBBM/6800).toFixed(1)} L</div><div class="lbl">Total BBM (L)</div></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Lambung</th><th>Jalur</th><th>Total Jam (mnt)</th><th>BBM (L)</th><th>Rasio</th><th>Total BBM (Rp)</th><th>Total Ritase</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td><strong>${r.lamb}</strong></td><td>${r.jalur}</td><td>${r.totalJam}</td><td>${r.liter}</td><td>${r.ratio}</td><td>Rp ${r.totalBBM.toLocaleString()}</td><td>${r.totalRit}</td></tr>`).join('')}
    <tr style="background:var(--green-pale);font-weight:700;"><td colspan="2">TOTAL</td><td>${rows.reduce((s,r)=>s+r.totalJam,0)}</td><td>${(gBBM/6800).toFixed(2)}</td><td>-</td><td>Rp ${gBBM.toLocaleString()}</td><td>${gRit}</td></tr>
    </tbody></table></div></div>`;
}

// ============================================================
// IMPORT EXCEL
// ============================================================
async function importData(type, input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb=XLSX.read(e.target.result,{type:'binary'}), ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:''}); if(!rows.length)return toast('File kosong!',true);
      let records=[];
      if(type==='bus') records=rows.filter(r=>r.Lambung||r.lambung).map(r=>({id:'B'+String(Date.now()+Math.random()*999|0).slice(-6),lambung:r.Lambung||r.lambung,nopol:r['No Polisi']||r.nopol||'',jalur:r.Jalur||r.jalur||'',tipe:r['Tipe Bus']||r.tipe||'',karoseri:r.Karoseri||r.karoseri||'',warna:r['Warna Bus']||r.warna||'',ket:r.Keterangan||r.ket||''}));
      else if(type==='spbu') records=rows.filter(r=>r['Nama SPBU']||r.nama).map(r=>({id:'S'+String(Date.now()+Math.random()*999|0).slice(-6),nama:r['Nama SPBU']||r.nama,alamat:r.Alamat||r.alamat||'',hp:r['No Hp']||r.hp||'',aktif:String(r.Status||r.aktif||'1').toLowerCase()==='aktif'||String(r.Status||'1')==='1'}));
      else if(type==='bbm') records=rows.filter(r=>r.Tanggal||r.tgl).map(r=>({id:'BBM'+String(Date.now()+Math.random()*999|0).slice(-6),tgl:r.Tanggal||r.tgl,lambung:r.Lambung||r.lambung||'',jalur:r.Jalur||r.jalur||'',nopol:r['No Polisi']||r.nopol||'',waktu:r['Waktu Pengisian']||r.waktu||null,nominal:parseFloat(r.Nominal||r.nominal||0),spbu:r.SPBU||r.spbu||'',halte:r['Halte Terakhir']||r.halte||'',jam_halte:r['Jam Halte Terakhir']||r.jamHalte||null,ket:r.Keterangan||r.ket||''}));
      else if(type==='ops') records=rows.filter(r=>r.Tanggal||r.tgl).map(r=>{
        const bbmV=parseFloat(r['BBM (Rp)']||r.bbm||0),jm=r['Jam Mulai Pool']||r.jamMulai||null,ja=r['Jam Akhir Pool']||r.jamAkhir||null;
        let km=null,rat=null; if(jm&&ja){const[hm,mm]=jm.split(':').map(Number),[ha,ma]=ja.split(':').map(Number);let d=(ha*60+ma)-(hm*60+mm);if(d<0)d+=1440;km=d;if(bbmV>0)rat=parseFloat((d/(bbmV/6800)).toFixed(2));}
        return{id:'OPS'+String(Date.now()+Math.random()*999|0).slice(-6),tgl:r.Tanggal||r.tgl,lambung:r.Lambung||r.lambung||'',jalur:r.Jalur||r.jalur||'',nopol:r['No Polisi']||r.nopol||'',jam_mulai:jm,jam_akhir:ja,km_awal_pool:r['Km Awal Pool']||null,km_akhir_pool:r['Km Akhir Pool']||null,km_awal_halte:r['Km Awal Halte']||null,km_akhir_halte:r['Km Akhir Halte']||null,bbm_rp:bbmV,rit:parseInt(r.RIT||r.rit||0),km_tempuh:km,ratio:rat,ket:r.Keterangan||r.ket||''};
      });
      if(!records.length)return toast('Tidak ada data valid!',true);
      const tbl=type==='ops'?'operasional':type; let inserted=0;
      for(let i=0;i<records.length;i+=100){const{error}=await supabase.from(tbl).insert(records.slice(i,i+100));if(error){toast('Error: '+error.message,true);return;}inserted+=Math.min(100,records.length-i);}
      input.value='';
      if(type==='bus')await loadBus(); if(type==='spbu')await loadSpbu(); if(type==='bbm')await loadBBM(); if(type==='ops')await loadOps();
      updateDashboard(); toast(`✅ Import ${inserted} data berhasil!`);
    } catch(err){toast('Gagal import: '+err.message,true);}
  };
  reader.readAsBinaryString(file);
}

// ============================================================
// EXPORT
// ============================================================
function exportExcel(type){
  let data=[],fn='';
  if(type==='bus'){data=DB.bus.map(r=>({ID:r.id,Lambung:r.lambung,'No Polisi':r.nopol,Jalur:r.jalur,'Tipe Bus':r.tipe,Karoseri:r.karoseri,'Warna Bus':r.warna,Keterangan:r.ket}));fn='DataBus.xlsx';}
  if(type==='spbu'){data=DB.spbu.map(r=>({ID:r.id,'Nama SPBU':r.nama,Alamat:r.alamat,'No Hp':r.hp,Status:r.aktif?'Aktif':'Tidak Aktif'}));fn='DataSPBU.xlsx';}
  if(type==='bbm'){data=DB.bbm.map(r=>({ID:r.id,Tanggal:r.tgl,Lambung:r.lambung,Jalur:r.jalur,'No Polisi':r.nopol,'Waktu Pengisian':r.waktu,Nominal:r.nominal,SPBU:r.spbu,'Halte Terakhir':r.halte,Keterangan:r.ket}));fn='DataBBM.xlsx';}
  if(type==='ops'){data=DB.ops.map(r=>({ID:r.id,Tanggal:r.tgl,Lambung:r.lambung,Jalur:r.jalur,'No Polisi':r.nopol,'Jam Mulai Pool':r.jamMulai,'Jam Akhir Pool':r.jamAkhir,'BBM (Rp)':r.bbm,RIT:r.rit,'Km Tempuh':r.kmTempuh,Ratio:r.ratio,Keterangan:r.ket}));fn='DataOperasional.xlsx';}
  if(!data.length)return toast('Tidak ada data!',true);
  const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Sheet1'); XLSX.writeFile(wb,fn); toast('Export Excel berhasil!');
}
function exportExcelReport(type){
  let data=[],fn='';
  if(type==='lap-bbm'){data=DB.bbm.map(r=>({Tanggal:r.tgl,Lambung:r.lambung,Nominal:r.nominal,SPBU:r.spbu}));fn='LaporanBBM.xlsx';}
  if(type==='lap-ops'){data=DB.ops.map(r=>({Tanggal:r.tgl,Lambung:r.lambung,'BBM(Rp)':r.bbm,'Km Tempuh':r.kmTempuh,Ratio:r.ratio,RIT:r.rit}));fn='LaporanOperasional.xlsx';}
  if(type==='lap-waktu'){data=DB.bbm.map(r=>({Tanggal:r.tgl,Lambung:r.lambung,'Waktu Pengisian':r.waktu,Nominal:r.nominal,SPBU:r.spbu}));fn='LaporanWaktuBBM.xlsx';}
  if(!data.length)return toast('Tidak ada data!',true);
  const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Laporan'); XLSX.writeFile(wb,fn); toast('Export Excel berhasil!');
}
function exportPDF(type){
  const{jsPDF}=window.jspdf,doc=new jsPDF();
  doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(26,92,42);
  doc.text('TransJogja — Laporan',14,18);doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(100);
  doc.text('Dicetak: '+new Date().toLocaleDateString('id-ID'),14,26);
  doc.setDrawColor(45,138,62);doc.setLineWidth(0.5);doc.line(14,30,196,30);
  let y=38; const src=type==='lap-ops'?DB.ops:DB.bbm;
  const hdrs=type==='lap-ops'?['Tgl','Lambung','Jalur','Jam Mulai','Jam Akhir','Km Tempuh','BBM(Rp)','RIT','Ratio']:['Tanggal','Lambung','Waktu','Nominal','SPBU'];
  doc.setFillColor(26,92,42);doc.rect(14,y,182,7,'F');doc.setTextColor(255);doc.setFontSize(9);
  const cw=182/hdrs.length; hdrs.forEach((h,i)=>doc.text(h,15+i*cw,y+5)); y+=9;
  src.forEach((r,i)=>{
    if(y>270){doc.addPage();y=20;}
    doc.setFillColor(i%2===0?245:255,i%2===0?248:255,i%2===0?245:255);doc.rect(14,y-1,182,7,'F');
    doc.setTextColor(60);doc.setFont('helvetica','normal');
    const vs=type==='lap-ops'?[r.tgl,r.lambung,r.jalur,r.jamMulai||'-',r.jamAkhir||'-',String(r.kmTempuh||'-'),'Rp'+r.bbm,String(r.rit||'-'),String(r.ratio||'-')]:[r.tgl,r.lambung,r.waktu||'-','Rp'+Number(r.nominal).toLocaleString(),r.spbu||'-'];
    vs.forEach((v,j)=>doc.text(String(v).substring(0,18),15+j*cw,y+5)); y+=8;
  });
  doc.save(`Laporan_${type}_TransJogja.pdf`); toast('Export PDF berhasil!');
}

// ============================================================
// FOTO PREVIEW
// ============================================================
function previewFoto(input,previewId){
  const el=document.getElementById(previewId);
  if(input.files[0])el.innerHTML=`<img src="${URL.createObjectURL(input.files[0])}" style="max-width:160px;max-height:90px;border-radius:8px;border:2px solid var(--green-light);">`;
}

// ============================================================
// DASHBOARD
// ============================================================
async function updateDashboard(){
  const[rBus,rSpbu,rBbm,rOps]=await Promise.all([
    supabase.from('bus').select('id',{count:'exact',head:true}),
    supabase.from('spbu').select('id',{count:'exact',head:true}),
    supabase.from('bbm').select('id',{count:'exact',head:true}),
    supabase.from('operasional').select('id',{count:'exact',head:true})
  ]);
  document.getElementById('stat-bus').textContent=rBus.count||0;
  document.getElementById('stat-bbm').textContent=rBbm.count||0;
  document.getElementById('stat-ops').textContent=rOps.count||0;
  document.getElementById('stat-spbu').textContent=rSpbu.count||0;
  document.getElementById('banner-bus').textContent=rBus.count||0;
  const aktif=await supabase.from('spbu').select('id',{count:'exact',head:true}).eq('aktif',true);
  document.getElementById('banner-spbu').textContent=aktif.count||0;
  const today=new Date().toISOString().split('T')[0];
  const todayOps=await supabase.from('operasional').select('id',{count:'exact',head:true}).eq('tgl',today);
  document.getElementById('banner-ops').textContent=todayOps.count||0;
  const days=[]; for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().split('T')[0]);}
  const{data:bbm7}=await supabase.from('bbm').select('tgl').gte('tgl',days[0]);
  const chart=document.getElementById('chart-bbm');
  if(bbm7&&bbm7.length){
    const cnts=days.map(d=>bbm7.filter(r=>r.tgl===d).length),mx=Math.max(...cnts,1);
    chart.innerHTML=cnts.map((c,i)=>`<div class="bar-wrap"><div class="bar-val">${c}</div><div class="bar" style="height:${Math.max((c/mx)*100,4)}%"></div><div class="bar-label">${days[i].slice(5)}</div></div>`).join('');
  } else {
    chart.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;width:100%;color:var(--gray-400);font-size:13px;">Belum ada data BBM</div>`;
  }
  const[{data:rBBMact},{data:rOPSact}]=await Promise.all([
    supabase.from('bbm').select('lambung,nominal,created_at').order('created_at',{ascending:false}).limit(5),
    supabase.from('operasional').select('lambung,tgl,created_at').order('created_at',{ascending:false}).limit(5)
  ]);
  const acts=[...(rBBMact||[]).map(r=>({icon:'⛽',title:`BBM ${r.lambung}`,meta:`Rp ${Number(r.nominal).toLocaleString()}`,time:new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})})),...(rOPSact||[]).map(r=>({icon:'📋',title:`Operasional ${r.lambung}`,meta:`Tgl ${r.tgl}`,time:new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}))].slice(0,8);
  const al=document.getElementById('activity-list');
  al.innerHTML=acts.length?acts.map(a=>`<div class="activity-item"><div class="activity-dot" style="background:var(--green-pale)">${a.icon}</div><div class="activity-info"><div class="title">${a.title}</div><div class="meta">${a.meta}</div></div><div class="activity-time">${a.time}</div></div>`).join(''):`<div class="empty-state"><i class="fas fa-history"></i><p>Belum ada aktivitas</p></div>`;
}
async function refreshData(){
  const page=document.querySelector('.page.active')?.id?.replace('page-','');
  if(page==='data-bus')await loadBus(); if(page==='data-spbu')await loadSpbu();
  if(page==='input-bbm')await loadBBM(); if(page==='input-ops')await loadOps();
  await updateDashboard(); toast('Data diperbarui!');
}

// ============================================================
// INIT — runs after DOM is ready (type="module" defers automatically)
// ============================================================
(async () => {
  // Setup date
  setDateNow();

  // Setup modal overlay click-outside-to-close
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
  });

  // Sidebar: open on desktop, closed on mobile
  sidebarOpen = window.innerWidth > 900;
  applySidebarState();
  // On desktop, no overlay needed
  if (window.innerWidth > 900) {
    document.getElementById('sidebar-overlay').classList.remove('show');
  }

  // Load data
  await Promise.all([loadBus(), loadSpbu()]);
  await updateDashboard();
})();

Object.assign(window,{toggleSidebar,applySidebarState,downloadTemplate,goPage,openModal,closeModal,saveBus,editBus,delBus,saveSpbu,editSpbu,delSpbu,saveBBM,editBBM,delBBM,autofillBBM,saveOps,editOps,delOps,autofillOps,calcOps,filterTable,importData,exportExcel,exportExcelReport,exportPDF,generateLapWaktu,generateLapBBM,generateLapOps,showWaktuTab,populateSpbuFilter,populateLambFilter,previewFoto,refreshData});
