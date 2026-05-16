/* ================================================================
   KAS KITA v3.0 — app.js
   Database : Google Sheets via Apps Script
   PDF      : iLovePDF API (JWT Auth)
   Fallback : jsPDF lokal
   © 2026 KAS KITA
================================================================ */

'use strict';

// ================================================================
// KONFIGURASI — sesuaikan di sini
// ================================================================
const CONFIG = {
  // Google Apps Script Web App URL
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxZRTsQH95TmzWcVOLszJRizwwmXZLkwtpOduz4WZSMsyRG4Vu9dWWq9H9z9O6yVGsM/exec',

  // iLovePDF API Keys
  ILP_PUBLIC_KEY: 'project_public_6d5baa10da2e6fd19b4167a1fc7ed3aa_6xLV19b7cef2e9d285248d9dd933edf15d0c7',
  ILP_SECRET_KEY: 'secret_key_0ea573c127b1ed27912f0bbf2fde65ca_YUN3Jec190601fe13b1e8d0cda5e61e9f7dbf',
  ILP_BASE: 'https://api.ilovepdf.com/v1',

  // Session key
  SESSION_KEY: 'kaskita_v3_session'
};

// ================================================================
// STATE
// ================================================================
let state = {
  currentPage : 'dashboard',
  currentUser : null,
  kasData     : [],
  pengeluaran : [],
  filteredKas : [],
  charts      : {},
  deleteTarget: null,
  deleteType  : null,
  dbOnline    : false,
  ilovepdfJWT : null,   // JWT token dari iLovePDF
  ilovepdfServer: null  // server yang diberikan iLovePDF
};

// ================================================================
// SHA-256
// ================================================================
async function sha256(msg) {
  const buf  = new TextEncoder().encode(msg);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ================================================================
// SESSION (localStorage - hanya untuk user yg login, data di Sheets)
// ================================================================
function getSession()  { try { return JSON.parse(localStorage.getItem(CONFIG.SESSION_KEY)); } catch { return null; } }
function setSession(s) { localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(s)); }
function clearSession(){ localStorage.removeItem(CONFIG.SESSION_KEY); }

// ================================================================
// TOAST
// ================================================================
function toast(msg, type='info') {
  const icons = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info', warning:'fa-triangle-exclamation' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="toast-icon fa-solid ${icons[type]||icons.info}"></i><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(),350); }, 3500);
  // Voice feedback ringan
  try {
    if (window.speechSynthesis && (type==='success'||type==='error')) {
      const u = new SpeechSynthesisUtterance(type==='success'?'Berhasil':'Gagal');
      u.volume=0.25; u.lang='id-ID'; u.rate=1.3;
      speechSynthesis.speak(u);
    }
  } catch {}
}

// ================================================================
// API OVERLAY
// ================================================================
function showOverlay(msg='Memuat...')  { document.getElementById('apiOverlayText').textContent=msg; document.getElementById('apiOverlay').classList.remove('hidden'); }
function hideOverlay()                  { document.getElementById('apiOverlay').classList.add('hidden'); }

// ================================================================
// RIPPLE
// ================================================================
document.addEventListener('click', e => {
  const btn = e.target.closest('.ripple');
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  const w = document.createElement('span');
  w.className = 'ripple-wave';
  const size = Math.max(btn.offsetWidth, btn.offsetHeight) * 2;
  Object.assign(w.style, { width:size+'px', height:size+'px', left:(e.clientX-r.left-size/2)+'px', top:(e.clientY-r.top-size/2)+'px' });
  btn.appendChild(w);
  setTimeout(()=>w.remove(), 600);
});

// ================================================================
// CLOCK
// ================================================================
function startClock() {
  const tick = ()=>{ const el=document.getElementById('topbarTime'); if(el) el.textContent=new Date().toLocaleTimeString('id-ID'); };
  tick(); setInterval(tick, 1000);
}

// ================================================================
// FORMAT HELPERS
// ================================================================
function rupiah(n) { return 'Rp '+(Number(n)||0).toLocaleString('id-ID'); }
function fmtDate(s) {
  if(!s) return '-';
  try { return new Date(s).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}); }
  catch { return s; }
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function monthLabel(d) {
  if(!d) return '';
  try { return new Date(d).toLocaleDateString('id-ID',{month:'long',year:'numeric'}); }
  catch { return ''; }
}
function genId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

// ================================================================
// GOOGLE SHEETS — API WRAPPER
// ================================================================

/**
 * GAS GET request
 * @param {string} table  - 'admin' | 'kas' | 'pengeluaran'
 * @param {object} params - extra query params
 */
async function gasGet(table, params={}) {
  const url = new URL(CONFIG.GAS_URL);
  url.searchParams.set('action', 'get');
  url.searchParams.set('table', table);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
  const res = await fetch(url.toString(), { method:'GET', redirect:'follow' });
  const json = await res.json();
  if (json.status !== 'ok') throw new Error(json.message||'GAS error');
  return json.data || [];
}

/**
 * GAS POST request (insert / delete)
 */
async function gasPost(payload) {
  const formData = new FormData();

  // ubah semua isi payload menjadi form-data
  Object.keys(payload).forEach(key => {
    formData.append(key, payload[key]);
  });

  const res = await fetch(CONFIG.GAS_URL, {
    method: 'POST',
    redirect: 'follow',
    body: formData
  });

  const json = await res.json();

  if (json.status !== 'ok') {
    throw new Error(json.message || 'GAS error');
  }

  return json;
}

// ================================================================
// DB HEALTH CHECK
// ================================================================
async function checkDB() {
  setDbStatus('checking');
  try {
    await gasGet('admin', { limit:'1' });
    setDbStatus('online');
    state.dbOnline = true;
    return true;
  } catch (e) {
    setDbStatus('offline');
    state.dbOnline = false;
    return false;
  }
}

function setDbStatus(status) {
  const texts = { online:'Google Sheets Terhubung ✓', offline:'Database Offline ✗', checking:'Memeriksa koneksi...' };
  // Auth page
  const dot  = document.getElementById('dbDot');
  const txt  = document.getElementById('dbStatusText');
  if (dot) { dot.className = `db-dot ${status}`; }
  if (txt)   txt.textContent = texts[status]||status;
  // Sidebar
  const sdot  = document.getElementById('sidebarDbDot');
  const slbl  = document.getElementById('sidebarDbLabel');
  if (sdot) sdot.className = `db-dot-sm ${status}`;
  if (slbl) slbl.textContent = status==='online'?'Sheets ●':'Sheets ✗';
  // Topbar
  const tdot  = document.getElementById('topbarDbDot');
  const tlbl  = document.getElementById('topbarSyncLabel');
  if (tdot) tdot.className = `db-dot-sm ${status}`;
  if (tlbl) tlbl.textContent = status==='online'?'Terhubung':'Offline';
}

// ================================================================
// LOADING SCREEN
// ================================================================
window.addEventListener('load', () => {
  setTimeout(async () => {
    const ls = document.getElementById('loadingScreen');
    document.getElementById('loadingText').textContent = 'Menghubungkan ke Google Sheets...';
    await checkDB();
    await checkILovePDF();
    ls.classList.add('fade-out');
    setTimeout(() => { ls.style.display='none'; init(); }, 500);
  }, 1200);
});

// ================================================================
// INIT
// ================================================================
function init() {
  startParticles();
  startClock();
  const session = getSession();
  if (session?.user) {
    loginSuccess(session.user, false);
  } else {
    showAuth();
  }
}

// ================================================================
// AUTH UI
// ================================================================
function showAuth() {
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('appSection').classList.add('hidden');
}
function showApp() {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');
}
function switchAuthTab(tab) {
  document.getElementById('loginForm').classList.toggle('hidden', tab!=='login');
  document.getElementById('registerForm').classList.toggle('hidden', tab!=='register');
  document.getElementById('tabLogin').classList.toggle('active', tab==='login');
  document.getElementById('tabRegister').classList.toggle('active', tab==='register');
}
function togglePw(id, btn) {
  const i = document.getElementById(id);
  i.type = i.type==='password' ? 'text' : 'password';
  btn.innerHTML = i.type==='password' ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
}

// ================================================================
// LOGIN — verifikasi ke Google Sheets sheet "admin"
// ================================================================
async function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPw').value;
  if (!u||!p) return toast('Username dan password wajib diisi','warning');

  showOverlay('Memeriksa kredensial di Google Sheets...');
  try {
    const hash  = await sha256(p);
    const users = await gasGet('admin');
    const found = users.find(r => r.username===u && r.password===hash);
    if (found) {
      setSession({ user:u });
      hideOverlay();
      loginSuccess(u, true);
    } else {
      hideOverlay();
      toast('Username atau password salah','error');
      document.getElementById('loginPw').value='';
    }
  } catch (e) {
    hideOverlay();
    toast('Gagal terhubung ke database: '+e.message,'error');
  }
}

// ================================================================
// REGISTER — simpan ke Google Sheets sheet "admin"
// ================================================================
async function doRegister() {
  const u  = document.getElementById('regUser').value.trim();
  const p  = document.getElementById('regPw').value;
  const p2 = document.getElementById('regPwConfirm').value;
  if (!u||!p)       return toast('Semua field wajib diisi','warning');
  if (u.length < 3) return toast('Username minimal 3 karakter','warning');
  if (p.length < 6) return toast('Password minimal 6 karakter','warning');
  if (p !== p2)     return toast('Konfirmasi password tidak cocok','warning');

  showOverlay('Mendaftarkan akun ke Google Sheets...');
  try {
    const users = await gasGet('admin');
    if (users.find(r => r.username===u)) {
      hideOverlay();
      return toast('Username sudah terdaftar','error');
    }
    const hash = await sha256(p);
    await gasPost({
      action: 'insert',
      table: 'admin',
      id: genId(),
      username: u,
      password: hash,
      createdAt: new Date().toISOString()
    });
    hideOverlay();
    toast('Akun berhasil dibuat! Silakan login.','success');
    switchAuthTab('login');
    ['regUser','regPw','regPwConfirm'].forEach(id => document.getElementById(id).value='');
  } catch (e) {
    hideOverlay();
    toast('Gagal daftar: '+e.message,'error');
  }
}

// ================================================================
// LOGIN SUCCESS
// ================================================================
async function loginSuccess(username, isNew) {
  state.currentUser = username;
  const initial = username.charAt(0).toUpperCase();
  ['sidebarAvatar','topbarAvatar'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=initial;});
  ['sidebarUsername','topbarUser'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=username;});
  showApp();
  await loadAllData();
  navigate('dashboard', false);
  if (isNew) toast(`Selamat datang, ${username}! 👋`,'success');
  setDefaultDates();
}

// ================================================================
// LOAD ALL DATA dari Google Sheets
// ================================================================
async function loadAllData() {
  try {
    const [kas, pe] = await Promise.all([
      gasGet('kas',         { owner: state.currentUser }),
      gasGet('pengeluaran', { owner: state.currentUser })
    ]);
    state.kasData     = kas;
    state.pengeluaran = pe;
    state.filteredKas = [...kas];
    populateFilterBulan();
    populateSiswaSelect();
  } catch (e) {
    toast('Gagal memuat data dari Sheets: '+e.message,'error');
  }
}

// ================================================================
// SYNC (manual refresh)
// ================================================================
console.log("APP.JS TERBACA");
async function syncData() {
  console.log("SYNCDATA DIPANGGIL");
  showOverlay('Sinkronisasi data dari Google Sheets...');
  try {
    await checkDB();
    await loadAllData();

    console.log("SYNC BERHASIL");
    jalankanClustering();

    if (state.currentPage) renderPage(state.currentPage);

    hideOverlay();
    toast('Data berhasil disinkronisasi dari Google Sheets','success');
  } catch(e) {
    hideOverlay();
    toast('Gagal sync: ' + e.message, 'error');
  }
}
// ================================================================
// LOGOUT
// ================================================================
function doLogout() {
  clearSession();
  state.currentUser=null; state.kasData=[]; state.pengeluaran=[]; state.filteredKas=[];
  Object.values(state.charts).forEach(c=>{try{c.destroy()}catch{}});
  state.charts={};
  showAuth();
  toast('Berhasil logout','info');
}

// ================================================================
// NAVIGATION
// ================================================================
function navigate(page, doAnim=true) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item[data-page], .bottom-nav-item[data-page]').forEach(n=>{
    n.classList.toggle('active', n.dataset.page===page);
  });
  const titles = { dashboard:'Dashboard', tambahKas:'Tambah Data Kas', pengeluaran:'Pengeluaran', laporan:'Laporan & Export PDF' };
  const el2 = document.getElementById('topbarTitle');
  if (el2) el2.textContent = titles[page]||page;
  closeSidebar();
  renderPage(page);
}

function renderPage(page) {
  if (page==='dashboard')   renderDashboard();
  if (page==='tambahKas')   renderTambahKas();
  if (page==='pengeluaran') renderPengeluaran();
  if (page==='laporan')     renderLaporan();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ================================================================
// FILTER HELPERS
// ================================================================
function populateFilterBulan() {
  const sel = document.getElementById('filterBulan');
  if (!sel) return;
  const months = [...new Set(state.kasData.map(r=>monthLabel(r.tanggal)).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Semua Bulan</option>' + months.map(m=>`<option value="${m}">${m}</option>`).join('');
}
function populateSiswaSelect() {
  const sel = document.getElementById('selectSiswa');
  if (!sel) return;
  const names = [...new Set(state.kasData.map(r=>r.nama).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">-- Pilih Siswa --</option>' + names.map(n=>`<option value="${n}">${n}</option>`).join('');
}
function applyFilter() {
  const b = document.getElementById('filterBulan').value;
  state.filteredKas = b ? state.kasData.filter(r=>monthLabel(r.tanggal)===b) : [...state.kasData];
  renderDashboard();
}
function setDefaultDates() {
  const t = new Date().toISOString().split('T')[0];
  ['fTanggal','pTanggal'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=t;});
}

// ================================================================
// ANIMATED COUNTER
// ================================================================
function animCount(el, target) {
  if (!el) return;
  const dur=900, t0=performance.now();
  const step = now => {
    const pct = Math.min((now-t0)/dur,1);
    const ease = 1-Math.pow(1-pct,3);
    el.textContent = 'Rp '+(Math.round(ease*target)).toLocaleString('id-ID');
    if(pct<1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function animNum(el, target) {
  if (!el) return;
  const dur=900, t0=performance.now();
  const step = now => {
    const pct = Math.min((now-t0)/dur,1);
    el.textContent = Math.round((1-Math.pow(1-pct,3))*target).toLocaleString('id-ID');
    if(pct<1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ================================================================
// RENDER DASHBOARD
// ================================================================
function renderDashboard() {
  const df = state.filteredKas;
  const pe = state.pengeluaran;
  const totalMasuk  = df.reduce((s,r)=>s+(Number(r.nominal)||0),0);
  const totalKeluar = pe.reduce((s,r)=>s+(Number(r.nominal)||0),0);
  const saldo       = totalMasuk - totalKeluar;
  const totalSiswa  = [...new Set(df.map(r=>r.nama).filter(Boolean))].length;

  animCount(document.getElementById('mcTotalKasVal'), totalMasuk);
  animNum(document.getElementById('mcSiswaVal'), totalSiswa);
  animCount(document.getElementById('mcKeluarVal'), totalKeluar);
  animCount(document.getElementById('mcSaldoVal'), saldo);

  const delta = document.getElementById('mcSaldoDelta');
  if (delta) {
    delta.className = `metric-delta ${saldo>=0?'positive':'negative'}`;
    delta.innerHTML = `<i class="fa-solid ${saldo>=0?'fa-arrow-trend-up':'fa-arrow-trend-down'}"></i> <span>${saldo>=0?'Surplus':'Defisit'}</span>`;
  }
  renderChartBulanan(df);
  renderChartStatus(df);
  renderKasTable(df);
}

// ================================================================
// CHARTS
// ================================================================
function renderChartBulanan(df) {
  const grouped={};
  df.forEach(r=>{ const l=monthLabel(r.tanggal)||'Lainnya'; grouped[l]=(grouped[l]||0)+(Number(r.nominal)||0); });
  const labels=Object.keys(grouped).sort(), data=labels.map(l=>grouped[l]);
  const ctx=document.getElementById('chartBulanan'); if(!ctx) return;
  if(state.charts.bulanan) state.charts.bulanan.destroy();
  state.charts.bulanan = new Chart(ctx,{
    type:'bar',
    data:{ labels, datasets:[{ label:'Pemasukan', data, backgroundColor:labels.map((_,i)=>`rgba(59,130,246,${0.5+(i%3)*.15})`), borderColor:'#3b82f6', borderWidth:2, borderRadius:6, borderSkipped:false }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>' Rp '+c.raw.toLocaleString('id-ID') } } },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#64748b',font:{size:11}} },
        y:{ grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#64748b',font:{size:11},callback:v=>'Rp '+(v/1000).toFixed(0)+'K'} }
      },
      animation:{duration:700,easing:'easeOutQuart'}
    }
  });
}

function renderChartStatus(df) {
  const tepat=df.filter(r=>r.status==='Tepat Waktu').length;
  const telat=df.filter(r=>r.status==='Telat').length;
  const ctx=document.getElementById('chartStatus'); if(!ctx) return;
  if(state.charts.status) state.charts.status.destroy();
  state.charts.status = new Chart(ctx,{
    type:'doughnut',
    data:{
      labels:['Tepat Waktu','Telat'],
      datasets:[{ data:[tepat,telat], backgroundColor:['rgba(16,185,129,.8)','rgba(245,158,11,.8)'], borderColor:['#10b981','#f59e0b'], borderWidth:2, hoverOffset:8 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'68%',
      plugins:{ legend:{position:'bottom',labels:{color:'#64748b',padding:16,font:{size:12}}}, tooltip:{callbacks:{label:c=>` ${c.label}: ${c.raw} siswa`}} },
      animation:{duration:700}
    }
  });
}

// ================================================================
// KAS TABLE
// ================================================================
function renderKasTable(df) {
  const tbody=document.getElementById('kasTableBody'); if(!tbody) return;
  if(!df.length) { tbody.innerHTML=`<tr><td colspan="9" class="empty-state-cell"><div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Belum ada data kas</p></div></td></tr>`; return; }
  tbody.innerHTML = df.map((r,i)=>`
    <tr style="animation:fadeUp .3s ease ${i*.025}s both">
      <td style="color:var(--txt-muted)">${i+1}</td>
      <td><strong>${esc(r.nama)}</strong></td>
      <td style="color:var(--txt-muted)">${fmtDate(r.tanggal)}</td>
      <td>${esc(r.kelas)}</td>
      <td>${esc(r.jurusan)}</td>
      <td>${stsBadge(r.status)}</td>
      <td style="color:var(--green);font-weight:600">${rupiah(r.nominal)}</td>
      <td style="color:var(--txt-muted)">${esc(r.keterangan||'-')}</td>
      <td><button class="btn-icon ripple" onclick="hapusKas('${r.id}')" title="Hapus"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`).join('');
}

function stsBadge(s) {
  if(s==='Tepat Waktu') return `<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> Tepat Waktu</span>`;
  return `<span class="badge badge-gold"><i class="fa-solid fa-clock"></i> Telat</span>`;
}

function searchTable() {
  const q = document.getElementById('searchKas').value.toLowerCase();
  renderKasTable(state.filteredKas.filter(r=>(r.nama||'').toLowerCase().includes(q)||(r.kelas||'').toLowerCase().includes(q)||(r.jurusan||'').toLowerCase().includes(q)));
}

// ================================================================
// TAMBAH KAS → Google Sheets
// ================================================================
function renderTambahKas() { renderRecentKas(); }

async function simpanKas() {
  const nama    = document.getElementById('fNama').value.trim();
  const tanggal = document.getElementById('fTanggal').value;
  const kelas   = document.getElementById('fKelas').value.trim();
  const jurusan = document.getElementById('fJurusan').value.trim();
  const status  = document.getElementById('fStatus').value;
  const nominal = Number(document.getElementById('fNominal').value);
  const ket     = document.getElementById('fKeterangan').value.trim();

  if(nama.length<3)      return toast('Nama minimal 3 karakter','warning');
  if(!tanggal)           return toast('Tanggal wajib diisi','warning');
  if(!kelas)             return toast('Kelas wajib diisi','warning');
  if(!jurusan)           return toast('Jurusan wajib diisi','warning');
  if(!nominal||nominal<=0)     return toast('Nominal harus lebih dari 0','warning');
  if(nominal>1000000)    return toast('Nominal maksimal Rp 1.000.000','warning');

  const record = { id:genId(), nama, tanggal, kelas, jurusan, status, nominal, keterangan:ket, owner:state.currentUser, createdAt:new Date().toISOString() };

  showOverlay('Menyimpan data kas ke Google Sheets...');
  try {
    await gasPost({
      action: 'insert',
      table: 'kas',
      ...record
    });
    state.kasData.unshift(record);
    state.filteredKas = [...state.kasData];
    populateFilterBulan();
    populateSiswaSelect();
    clearKasForm();
    renderRecentKas();
    hideOverlay();
    toast(`Data ${nama} berhasil disimpan ke Google Sheets!`,'success');
  } catch(e) {
    hideOverlay();
    toast('Gagal simpan: '+e.message,'error');
  }
}

function clearKasForm() {
  ['fNama','fKelas','fJurusan','fNominal','fKeterangan'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const s=document.getElementById('fStatus');if(s)s.value='Tepat Waktu';
  setDefaultDates();
}

function renderRecentKas() {
  const cont = document.getElementById('recentKasList'); if(!cont) return;
  const recent = [...state.kasData].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);
  if(!recent.length) { cont.innerHTML=`<div class="empty-state small"><i class="fa-solid fa-inbox"></i><p>Belum ada data</p></div>`; return; }
  cont.innerHTML = recent.map(r=>`
    <div class="recent-item">
      <div style="display:flex;justify-content:space-between">
        <div class="recent-item-name">${esc(r.nama)}</div>
        <div class="recent-item-nominal">${rupiah(r.nominal)}</div>
      </div>
      <div class="recent-item-meta">${esc(r.kelas)} · ${esc(r.jurusan)} · ${stsBadge(r.status)}</div>
    </div>`).join('');
}

// ================================================================
// HAPUS KAS
// ================================================================
function hapusKas(id)        { state.deleteTarget=id; state.deleteType='kas'; document.getElementById('modalHapus').classList.remove('hidden'); }
function hapusPengeluaran(id){ state.deleteTarget=id; state.deleteType='pengeluaran'; document.getElementById('modalHapus').classList.remove('hidden'); }
function closeModal()        { document.getElementById('modalHapus').classList.add('hidden'); state.deleteTarget=null; state.deleteType=null; }

async function confirmHapus() {
  const id   = state.deleteTarget;
  const type = state.deleteType;
  closeModal();
  showOverlay('Menghapus data dari Google Sheets...');
  try {
    await gasPost({
      action: 'delete',
      table: type,
      id: id
    });
    if(type==='kas') {
      state.kasData = state.kasData.filter(r=>r.id!==id);
      state.filteredKas = state.filteredKas.filter(r=>r.id!==id);
      populateFilterBulan(); populateSiswaSelect();
      renderDashboard();
    } else {
      state.pengeluaran = state.pengeluaran.filter(r=>r.id!==id);
      renderPengeluaran();
    }
    hideOverlay();
    toast('Data berhasil dihapus dari Sheets','info');
  } catch(e) {
    hideOverlay();
    toast('Gagal hapus: '+e.message,'error');
  }
}

// ================================================================
// PENGELUARAN → Google Sheets
// ================================================================
function renderPengeluaran() {
  const masuk  = state.kasData.reduce((s,r)=>s+(Number(r.nominal)||0),0);
  const keluar = state.pengeluaran.reduce((s,r)=>s+(Number(r.nominal)||0),0);
  animCount(document.getElementById('pTotalMasuk'), masuk);
  animCount(document.getElementById('pTotalKeluar'), keluar);
  animCount(document.getElementById('pSaldo'), masuk-keluar);

  const tbody = document.getElementById('pengeluaranBody'); if(!tbody) return;
  if(!state.pengeluaran.length) { tbody.innerHTML=`<tr><td colspan="5" class="empty-state-cell"><div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Belum ada pengeluaran</p></div></td></tr>`; return; }
  tbody.innerHTML = state.pengeluaran.map((r,i)=>`
    <tr style="animation:fadeUp .3s ease ${i*.03}s both">
      <td style="color:var(--txt-muted)">${i+1}</td>
      <td>${fmtDate(r.tanggal)}</td>
      <td>${esc(r.keterangan)}</td>
      <td style="color:var(--red);font-weight:600">${rupiah(r.nominal)}</td>
      <td><button class="btn-icon ripple" onclick="hapusPengeluaran('${r.id}')" title="Hapus"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`).join('');
}

async function simpanPengeluaran() {
  const tanggal = document.getElementById('pTanggal').value;
  const ket     = document.getElementById('pKeterangan').value.trim();
  const nominal = Number(document.getElementById('pNominal').value);
  if(!tanggal)        return toast('Tanggal wajib diisi','warning');
  if(!ket)            return toast('Keterangan wajib diisi','warning');
  if(!nominal||nominal<=0) return toast('Nominal harus lebih dari 0','warning');

  const record = { id:genId(), tanggal, keterangan:ket, nominal, owner:state.currentUser, createdAt:new Date().toISOString() };
  showOverlay('Menyimpan pengeluaran ke Google Sheets...');
  try {
    await gasPost({
      action: 'insert',
      table: 'pengeluaran',
      ...record
    });
    state.pengeluaran.unshift(record);
    document.getElementById('pKeterangan').value='';
    document.getElementById('pNominal').value='';
    setDefaultDates();
    renderPengeluaran();
    hideOverlay();
    toast('Pengeluaran berhasil disimpan ke Google Sheets!','success');
  } catch(e) {
    hideOverlay();
    toast('Gagal simpan: '+e.message,'error');
  }
}

// ================================================================
// LAPORAN PAGE
// ================================================================
function renderLaporan() {
  populateSiswaSelect();
  checkILovePDF();
}

function loadSiswaStats() {
  const nama = document.getElementById('selectSiswa').value;
  const area = document.getElementById('siswaStatsArea'); if(!area) return;
  if(!nama) { area.innerHTML=`<div class="empty-state small"><i class="fa-solid fa-user-magnifying-glass"></i><p>Pilih siswa</p></div>`; return; }
  const data  = state.kasData.filter(r=>r.nama===nama);
  const total = data.reduce((s,r)=>s+(Number(r.nominal)||0),0);
  const tepat = data.filter(r=>r.status==='Tepat Waktu').length;
  const telat  = data.filter(r=>r.status==='Telat').length;
  area.innerHTML = `
    <div class="siswa-stat-item"><span class="siswa-stat-label">Nama</span><span class="siswa-stat-val">${esc(nama)}</span></div>
    <div class="siswa-stat-item"><span class="siswa-stat-label">Kelas</span><span class="siswa-stat-val">${esc(data[0]?.kelas||'-')}</span></div>
    <div class="siswa-stat-item"><span class="siswa-stat-label">Jurusan</span><span class="siswa-stat-val">${esc(data[0]?.jurusan||'-')}</span></div>
    <div class="siswa-stat-item"><span class="siswa-stat-label">Total Bayar</span><span class="siswa-stat-val" style="color:var(--green)">${rupiah(total)}</span></div>
    <div class="siswa-stat-item"><span class="siswa-stat-label">Transaksi</span><span class="siswa-stat-val">${data.length}×</span></div>
    <div class="siswa-stat-item"><span class="siswa-stat-label">Tepat Waktu</span><span class="siswa-stat-val" style="color:var(--green)">${tepat}×</span></div>
    <div class="siswa-stat-item"><span class="siswa-stat-label">Telat</span><span class="siswa-stat-val" style="color:var(--gold)">${telat}×</span></div>`;
}

// ================================================================
// iLOVEPDF — CHECK STATUS
// ================================================================
async function checkILovePDF() {
  const badge = document.getElementById('ilovepdfStatusBadge'); if(!badge) return;
  badge.className='api-status-badge checking';
  badge.innerHTML=`<span class="status-dot-anim"></span> Memeriksa...`;
  try {
    const jwt = await ilpGetJWT();
    state.ilovepdfJWT = jwt.token;
    state.ilovepdfServer = jwt.token_type || 'api';
    badge.className='api-status-badge online';
    badge.innerHTML=`<span class="status-dot-anim"></span> iLovePDF Terhubung ✓`;
  } catch(e) {
    badge.className='api-status-badge offline';
    badge.innerHTML=`<span class="status-dot-anim"></span> Offline — ${e.message}`;
  }
}

// ================================================================
// iLOVEPDF — GET JWT TOKEN
// ================================================================
async function ilpGetJWT() {
  const res = await fetch(`${CONFIG.ILP_BASE}/auth`, {
    method  : 'POST',
    headers : { 'Content-Type':'application/json' },
    body    : JSON.stringify({ public_key: CONFIG.ILP_PUBLIC_KEY })
  });
  if(!res.ok) throw new Error(`Auth failed: ${res.status}`);
  return await res.json();
}

// ================================================================
// iLOVEPDF — EXPORT PDF via API
// Flow: auth → start task → upload → process → download
// ================================================================
async function exportPDFiLovePDF(type='kas') {
  // Show progress card
  const card = document.getElementById('pdfProgressCard'); if(card) card.style.display='block';
  setPdfStep(1,'active');
  setPdfStep(2,'pending');
  setPdfStep(3,'pending');
  setPdfStep(4,'pending');
  // Scroll to card
  card?.scrollIntoView({ behavior:'smooth', block:'start' });

  try {
    // STEP 1: Authenticate
    setPdfStep(1,'active');
    let jwtData;
    try {
      jwtData = await ilpGetJWT();
    } catch(e) {
      throw new Error('Auth iLovePDF gagal. Periksa koneksi internet. ('+e.message+')');
    }
    const token = jwtData.token;
    setPdfStep(1,'done'); setPdfStep(2,'active');

    // STEP 2: Buat PDF lokal (jsPDF) sebagai dokumen untuk diupload ke iLovePDF
    const pdfBlob = buildPDFBlob(type);

    // Start task: compress (atau word-to-pdf, dll)
    const taskRes = await fetch(`${CONFIG.ILP_BASE}/start/compress`, {
      method : 'GET',
      headers: { Authorization:`Bearer ${token}` }
    });
    if(!taskRes.ok) throw new Error('Gagal memulai task iLovePDF: '+taskRes.status);
    const taskData = await taskRes.json();
    const server  = taskData.server;
    const taskId  = taskData.task;

    // STEP 2: Upload file
    const formData = new FormData();
    const fname = type==='kas' ? 'LaporanKas.pdf' : 'LaporanPengeluaran.pdf';
    formData.append('task', taskId);
    formData.append('file', pdfBlob, fname);

    const uploadRes = await fetch(`https://${server}/v1/upload`, {
      method : 'POST',
      headers: { Authorization:`Bearer ${token}` },
      body   : formData
    });
    if(!uploadRes.ok) throw new Error('Upload gagal: '+uploadRes.status);
    const uploadData = await uploadRes.json();
    const serverFname = uploadData.server_filename;

    setPdfStep(2,'done'); setPdfStep(3,'active');

    // STEP 3: Process (compress)
    const processRes = await fetch(`https://${server}/v1/process`, {
      method : 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body   : JSON.stringify({
        task      : taskId,
        tool      : 'compress',
        files     : [{ server_filename: serverFname, filename: fname }],
        compression_level: 'recommended'
      })
    });
    if(!processRes.ok) throw new Error('Proses gagal: '+processRes.status);

    setPdfStep(3,'done'); setPdfStep(4,'active');

    // STEP 4: Download
    const dlRes = await fetch(`https://${server}/v1/download/${taskId}`, {
      headers: { Authorization:`Bearer ${token}` }
    });
    if(!dlRes.ok) throw new Error('Download gagal: '+dlRes.status);
    const dlBlob = await dlRes.blob();

    // Trigger download ke browser
    const url  = URL.createObjectURL(dlBlob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = type==='kas' ? `KasKita_iLovePDF_${Date.now()}.pdf` : `Pengeluaran_iLovePDF_${Date.now()}.pdf`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);

    setPdfStep(4,'done');
    toast('PDF berhasil diproses via iLovePDF dan diunduh!','success');

    setTimeout(()=>{ if(card) card.style.display='none'; }, 3000);

  } catch(e) {
    toast('iLovePDF Error: '+e.message+' — Coba PDF Lokal','error');
    if(card) card.style.display='none';
    // fallback otomatis ke lokal
    exportPDFLokal(type);
  }
}

// ================================================================
// PDF STEP HELPER
// ================================================================
function setPdfStep(n, status) {
  const el = document.getElementById(`pdfStep${n}`); if(!el) return;
  const dot = el.querySelector('.step-dot');
  el.className = `pdf-step ${status}`;
  if(dot) {
    dot.className = 'step-dot';
    if(status==='active') dot.classList.add('spin');
    if(status==='done')   dot.classList.add('done');
  }
}

// ================================================================
// BUILD PDF BLOB (jsPDF) — digunakan sebagai file yang diupload ke iLovePDF
// ================================================================
function buildPDFBlob(type='kas') {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: type==='kas'?'landscape':'portrait', unit:'mm', format:'a4' });

  // Header style
  doc.setFont('helvetica','bold');
  doc.setFontSize(20);
  doc.setTextColor(59,130,246);
  doc.text('KAS KITA', 14, 18);

  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(100,116,139);
  doc.text('Sistem Pengelolaan Kas Sekolah · Google Sheets Database', 14, 26);
  doc.text(`Pengguna: ${state.currentUser}   ·   Tanggal: ${new Date().toLocaleDateString('id-ID',{dateStyle:'full'})}`, 14, 32);

  if (type==='kas') {
    const totalMasuk = state.kasData.reduce((s,r)=>s+(Number(r.nominal)||0),0);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(16,185,129);
    doc.text(`Total Kas Masuk: Rp ${totalMasuk.toLocaleString('id-ID')}`, 14, 40);

    const head=[['No','Nama Siswa','Tanggal','Kelas','Jurusan','Status','Nominal','Keterangan']];
    const body=state.kasData.map((r,i)=>[i+1,r.nama,fmtDate(r.tanggal),r.kelas,r.jurusan,r.status,'Rp '+Number(r.nominal).toLocaleString('id-ID'),r.keterangan||'-']);
    doc.autoTable({ startY:46, head, body,
      headStyles:{fillColor:[8,14,29],textColor:[100,116,139],fontStyle:'bold',fontSize:8},
      bodyStyles:{textColor:[30,41,59],fontSize:8},
      alternateRowStyles:{fillColor:[245,247,250]},
      styles:{lineColor:[226,232,240],lineWidth:.3},
      columnStyles:{0:{halign:'center',cellWidth:10},6:{halign:'right'}}
    });
  } else {
    const totalKeluar = state.pengeluaran.reduce((s,r)=>s+(Number(r.nominal)||0),0);
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(244,63,94);
    doc.text(`Total Pengeluaran: Rp ${totalKeluar.toLocaleString('id-ID')}`, 14, 40);

    const head=[['No','Tanggal','Keterangan','Nominal']];
    const body=state.pengeluaran.map((r,i)=>[i+1,fmtDate(r.tanggal),r.keterangan,'Rp '+Number(r.nominal).toLocaleString('id-ID')]);
    doc.autoTable({ startY:46, head, body,
      headStyles:{fillColor:[8,14,29],textColor:[100,116,139],fontStyle:'bold'},
      bodyStyles:{textColor:[30,41,59]},
      alternateRowStyles:{fillColor:[245,247,250]},
      columnStyles:{0:{halign:'center',cellWidth:12},3:{halign:'right'}}
    });
  }

  return doc.output('blob');
}

// ================================================================
// PDF LOKAL — fallback tanpa iLovePDF
// ================================================================
function exportPDFLokal(type='kas') {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: type==='kas'?'landscape':'portrait', unit:'mm', format:'a4' });
    doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.setTextColor(59,130,246);
    doc.text('KAS KITA', 14, 18);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(100,116,139);
    doc.text('Laporan Lokal (Fallback) · '+new Date().toLocaleDateString('id-ID',{dateStyle:'full'}), 14, 26);

    if (type==='kas') {
      const totalMasuk=state.kasData.reduce((s,r)=>s+(Number(r.nominal)||0),0);
      doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(16,185,129);
      doc.text(`Total: Rp ${totalMasuk.toLocaleString('id-ID')}`, 14, 34);
      doc.autoTable({ startY:40,
        head:[['No','Nama','Tanggal','Kelas','Jurusan','Status','Nominal','Keterangan']],
        body:state.kasData.map((r,i)=>[i+1,r.nama,fmtDate(r.tanggal),r.kelas,r.jurusan,r.status,'Rp '+Number(r.nominal).toLocaleString('id-ID'),r.keterangan||'-']),
        headStyles:{fillColor:[59,130,246],textColor:[255,255,255]},
        alternateRowStyles:{fillColor:[245,247,250]},
        columnStyles:{0:{halign:'center'},6:{halign:'right'}}
      });
      doc.save(`LaporanKas_${Date.now()}.pdf`);
    } else {
      const totalKeluar=state.pengeluaran.reduce((s,r)=>s+(Number(r.nominal)||0),0);
      doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(244,63,94);
      doc.text(`Total: Rp ${totalKeluar.toLocaleString('id-ID')}`, 14, 34);
      doc.autoTable({ startY:40,
        head:[['No','Tanggal','Keterangan','Nominal']],
        body:state.pengeluaran.map((r,i)=>[i+1,fmtDate(r.tanggal),r.keterangan,'Rp '+Number(r.nominal).toLocaleString('id-ID')]),
        headStyles:{fillColor:[244,63,94],textColor:[255,255,255]},
        alternateRowStyles:{fillColor:[245,247,250]},
        columnStyles:{0:{halign:'center'},3:{halign:'right'}}
      });
      doc.save(`Pengeluaran_${Date.now()}.pdf`);
    }
    toast('PDF lokal berhasil diunduh!','success');
  } catch(e) {
    toast('Gagal buat PDF: '+e.message,'error');
  }
}

// ================================================================
// EXPORT EXCEL (SheetJS)
// ================================================================
function exportExcel() {
  if(!window.XLSX) return toast('SheetJS tidak tersedia','error');
  const wb = XLSX.utils.book_new();

  const kasRows = state.kasData.map((r,i)=>({ No:i+1, Nama:r.nama, Tanggal:r.tanggal, Kelas:r.kelas, Jurusan:r.jurusan, Status:r.status, Nominal:Number(r.nominal), Keterangan:r.keterangan||'' }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kasRows), 'Data Kas');

  const peRows = state.pengeluaran.map((r,i)=>({ No:i+1, Tanggal:r.tanggal, Keterangan:r.keterangan, Nominal:Number(r.nominal) }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(peRows), 'Pengeluaran');

  const masuk  = state.kasData.reduce((s,r)=>s+(Number(r.nominal)||0),0);
  const keluar = state.pengeluaran.reduce((s,r)=>s+(Number(r.nominal)||0),0);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { Keterangan:'Total Kas Masuk', Nominal:masuk },
    { Keterangan:'Total Pengeluaran', Nominal:keluar },
    { Keterangan:'Saldo Akhir', Nominal:masuk-keluar }
  ]), 'Ringkasan');

  XLSX.writeFile(wb, `KasKita_${state.currentUser}_${Date.now()}.xlsx`);
  toast('Excel berhasil diunduh!','success');
}

// ================================================================
// PARTICLE BACKGROUND
// ================================================================
function startParticles() {
  const canvas = document.getElementById('particles');
  const ctx    = canvas.getContext('2d');
  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;
  window.addEventListener('resize',()=>{ W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; });

  const pts = Array.from({length:55},()=>({ x:Math.random()*W, y:Math.random()*H, r:Math.random()*1.4+.3, vx:(Math.random()-.5)*.22, vy:(Math.random()-.5)*.22, a:Math.random()*.35+.08 }));

  (function draw(){
    ctx.clearRect(0,0,W,H);
    for(let i=0;i<pts.length;i++){
      for(let j=i+1;j<pts.length;j++){
        const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.sqrt(dx*dx+dy*dy);
        if(d<115){ ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.strokeStyle=`rgba(59,130,246,${(1-d/115)*.07})`; ctx.lineWidth=.5; ctx.stroke(); }
      }
    }
    pts.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; if(p.x<0)p.x=W; if(p.x>W)p.x=0; if(p.y<0)p.y=H; if(p.y>H)p.y=0; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=`rgba(59,130,246,${p.a})`; ctx.fill(); });
    requestAnimationFrame(draw);
  })();
}

// ================================================================
// KEYBOARD SHORTCUTS
// ================================================================
document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });

// Enter on login / register
document.addEventListener('DOMContentLoaded', () => {
  const lp = document.getElementById('loginPw');
  if(lp) lp.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });

  const rp = document.getElementById('regPwConfirm');
  if(rp) rp.addEventListener('keydown', e=>{ if(e.key==='Enter') doRegister(); });

  // Jalankan sinkronisasi data saat halaman selesai dimuat
  syncData();
});
function jalankanClustering() {
  console.log("CLUSTERING BERJALAN");

  const rekap = {};

  // Kelompokkan data per siswa
  state.kasData.forEach(item => {
    const nama = item.nama;

    if (!rekap[nama]) {
      rekap[nama] = {
        nama: nama,
        telat: 0,
        nominal: 0,
        frekuensi: 0
      };
    }

    // Hitung jika status bukan "Tepat Waktu"
    if (item.status !== "Tepat Waktu") {
      rekap[nama].telat += 1;
    }

    // Jumlahkan nominal
    rekap[nama].nominal += Number(item.nominal);

    // Hitung frekuensi bayar
    rekap[nama].frekuensi += 1;
  });

  // Ubah object menjadi array
  const dataSiswa = Object.values(rekap);

  console.log("DATA UNTUK CLUSTERING:");
  console.table(dataSiswa);

  prosesClustering(dataSiswa);
}
