import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, query, orderBy } from 'firebase/firestore';
import { initLineAuth } from './lineAuth.js';

function showToast(message, type = 'info', duration = 3200) {
  const container = document.getElementById('toast-container');
  const colors = { success: 'bg-emerald-500', error: 'bg-rose-500', info: 'bg-blue-500' };
  const toast = document.createElement('div');
  toast.className = `${colors[type] || colors.info} text-white rounded-2xl shadow-lg px-4 py-3.5 text-base font-bold`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
window.showToast = showToast;

function showView(id) {
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
window.showView = showView;

function showLoading(msg = 'กำลังประมวลผล...') {
  document.getElementById('loading-text').innerText = msg;
  const el = document.getElementById('loading-overlay');
  el.classList.remove('hidden'); el.classList.add('flex');
}
function hideLoading() {
  const el = document.getElementById('loading-overlay');
  el.classList.add('hidden'); el.classList.remove('flex');
}
window.showLoading = showLoading;
window.hideLoading = hideLoading;

let currentUid = null;
let allReportsData = [];

document.getElementById('btn-go-register').onclick = () => {
  window.location.href = 'https://goodday-member-system.vercel.app';
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    const snap = await getDoc(doc(db, 'users', currentUid));
    const data = snap.exists() ? snap.data() : null;

    if (!data || !data.profileComplete) {
      showView('not-member-view');
      return;
    }

    document.getElementById('header-name').innerText = data.name || 'ผู้ใช้งาน';
    showView('home-view');
    await loadHomeData();
  } else {
    currentUid = null;
    await initLineAuth();
  }
});

// --- แถบเมนูล่าง ---
function setTab(tab) {
  document.querySelectorAll('#tab-home, #tab-report, #tab-history').forEach(b => {
    b.classList.remove('theme-text'); b.classList.add('text-gray-400');
  });
  document.getElementById(`tab-${tab}`).classList.remove('text-gray-400');
  document.getElementById(`tab-${tab}`).classList.add('theme-text');
}
document.getElementById('tab-home').onclick = () => { setTab('home'); showView('home-view'); };
document.getElementById('tab-report').onclick = () => { setTab('report'); showView('report-view'); };
document.getElementById('tab-history').onclick = () => { setTab('history'); showView('history-view'); };

// --- โหลดข้อมูลหน้าหลัก ---
const categoryLabels = {
  road: 'ถนน/ทางเดิน', water: 'น้ำท่วม/ท่อระบายน้ำ', electric: 'ไฟฟ้า/แสงสว่าง',
  waste: 'ขยะ/ความสะอาด', safety: 'ความปลอดภัย', other: 'อื่นๆ'
};

async function loadHomeData() {
  const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  allReportsData = [];
  snap.forEach(d => allReportsData.push({ id: d.id, ...d.data() }));

  renderCategoryFilter();
  renderStats();
  renderRecentCards();
  renderStatusSummary();
  initMap();
}

function renderCategoryFilter() {
  const select = document.getElementById('home-category-filter');
  select.innerHTML = '<option value="all">ทุกหมวดหมู่</option>' +
    Object.entries(categoryLabels).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
}

function renderStats() {
  document.getElementById('stat-total').innerText = allReportsData.length;

  const rated = allReportsData.filter(r => r.rating);
  const avgRating = rated.length > 0 ? (rated.reduce((sum, r) => sum + r.rating, 0) / rated.length).toFixed(2) : '-';
  document.getElementById('stat-avg-rating').innerText = avgRating;

  const highRated = rated.filter(r => r.rating >= 4).length;
  const satisfaction = rated.length > 0 ? Math.round((highRated / rated.length) * 100) : 0;
  document.getElementById('stat-satisfaction').innerText = rated.length > 0 ? `${satisfaction}%` : '-%';
}

function renderRecentCards() {
  const container = document.getElementById('recent-reports-scroll');
  const recent = allReportsData.slice(0, 10);

  if (recent.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-base py-4">ยังไม่มีเรื่องแจ้ง</p>';
    return;
  }

  container.innerHTML = recent.map(r => `
    <div class="min-w-[220px] w-[220px] bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden shrink-0">
      <img src="${r.imageUrl || ''}" class="w-full h-32 object-cover bg-gray-100">
      <div class="p-3">
        <span class="inline-block bg-pink-50 theme-text text-sm font-bold px-2 py-0.5 rounded-full mb-2">${categoryLabels[r.category] || r.category}</span>
        <h4 class="font-bold text-gray-800 text-base leading-tight mb-2 line-clamp-2">${r.title || r.description || ''}</h4>
        ${r.rating ? `<div class="text-amber-400 text-sm">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function renderStatusSummary() {
  const total = allReportsData.length;
  const pending = allReportsData.filter(r => r.status === 'pending').length;
  const inprogress = allReportsData.filter(r => r.status === 'inprogress').length;
  const resolved = allReportsData.filter(r => r.status === 'resolved').length;

  document.getElementById('status-pending-count').innerText = pending;
  document.getElementById('status-inprogress-count').innerText = inprogress;
  document.getElementById('status-resolved-count').innerText = resolved;

  const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;
  document.getElementById('status-pending-pct').innerText = `${pct(pending)}%`;
  document.getElementById('status-inprogress-pct').innerText = `${pct(inprogress)}%`;
  document.getElementById('status-resolved-pct').innerText = `${pct(resolved)}%`;

  const rated = allReportsData.filter(r => r.rating);
  const highRated = rated.filter(r => r.rating >= 4).length;
  const satisfactionPct = rated.length > 0 ? Math.round((highRated / rated.length) * 100) : 0;
  document.getElementById('status-satisfaction-count').innerText = rated.length > 0 ? `${satisfactionPct}%` : '-%';
  document.getElementById('status-satisfaction-sub').innerText = `(${rated.length} เรื่อง)`;

  document.getElementById('status-bar-pending').style.width = pct(pending) + '%';
  document.getElementById('status-bar-inprogress').style.width = pct(inprogress) + '%';
  document.getElementById('status-bar-resolved').style.width = pct(resolved) + '%';
  document.getElementById('status-total-label').innerText = `${total} เรื่อง`;
}

document.getElementById('home-search').oninput = () => { renderRecentCards(); refreshMapMarkers(); };
document.getElementById('home-category-filter').onchange = () => { renderRecentCards(); refreshMapMarkers(); };

function getFilteredReports() {
  const term = document.getElementById('home-search').value.trim().toLowerCase();
  const cat = document.getElementById('home-category-filter').value;
  return allReportsData.filter(r => {
    if (cat !== 'all' && r.category !== cat) return false;
    if (term && !(r.title || r.description || '').toLowerCase().includes(term)) return false;
    return r.location && r.location.lat && r.location.lng;
  });
}

// --- แผนที่ Leaflet ---
let leafletMap = null;
let markerLayer = null;
let heatLayer = null;
let clusterLayer = null;
let currentMapMode = 'marker';

function initMap() {
  if (!leafletMap) {
    leafletMap = L.map('home-map').setView([13.7563, 100.5018], 11); // ค่าเริ่มต้น: กรุงเทพฯ
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(leafletMap);
  }
  refreshMapMarkers();
}

function clearMapLayers() {
  if (markerLayer) { leafletMap.removeLayer(markerLayer); markerLayer = null; }
  if (heatLayer) { leafletMap.removeLayer(heatLayer); heatLayer = null; }
  if (clusterLayer) { leafletMap.removeLayer(clusterLayer); clusterLayer = null; }
}

function refreshMapMarkers() {
  if (!leafletMap) return;
  clearMapLayers();
  const filtered = getFilteredReports();

  if (currentMapMode === 'marker') {
    markerLayer = L.layerGroup();
    filtered.forEach(r => {
      L.marker([r.location.lat, r.location.lng])
        .bindPopup(`<b>${r.title || ''}</b><br>${categoryLabels[r.category] || ''}`)
        .addTo(markerLayer);
    });
    markerLayer.addTo(leafletMap);
  } else if (currentMapMode === 'heatmap') {
    const points = filtered.map(r => [r.location.lat, r.location.lng, 0.5]);
    heatLayer = L.heatLayer(points, { radius: 25 }).addTo(leafletMap);
  } else if (currentMapMode === 'cluster') {
    clusterLayer = L.markerClusterGroup();
    filtered.forEach(r => {
      clusterLayer.addLayer(L.marker([r.location.lat, r.location.lng]).bindPopup(r.title || ''));
    });
    leafletMap.addLayer(clusterLayer);
  }
}

function setMapMode(mode) {
  currentMapMode = mode;
  ['marker', 'heatmap', 'cluster'].forEach(m => {
    const btn = document.getElementById(`map-mode-${m}`);
    if (m === mode) {
      btn.className = 'flex-1 py-2.5 rounded-full text-base font-bold border-2 theme-pink text-white border-transparent';
    } else {
      btn.className = 'flex-1 py-2.5 rounded-full text-base font-bold border-2 bg-white text-gray-600 border-gray-200';
    }
  });
  refreshMapMarkers();
}
document.getElementById('map-mode-marker').onclick = () => setMapMode('marker');
document.getElementById('map-mode-heatmap').onclick = () => setMapMode('heatmap');
document.getElementById('map-mode-cluster').onclick = () => setMapMode('cluster');

// ================= ฟอร์มแจ้งปัญหา (ดีไซน์ใหม่) =================

const reportCategories = [
  { id: 'road', label: 'ถนน/ทางเดิน', icon: 'fa-road' },
  { id: 'water', label: 'น้ำท่วม/ท่อระบาย', icon: 'fa-droplet' },
  { id: 'electric', label: 'ไฟฟ้า/แสงสว่าง', icon: 'fa-lightbulb' },
  { id: 'waste', label: 'ขยะ/ความสะอาด', icon: 'fa-trash-can' },
  { id: 'safety', label: 'ความปลอดภัย', icon: 'fa-shield-halved' },
  { id: 'other', label: 'อื่นๆ', icon: 'fa-ellipsis' }
];
let selectedCategory = null;

function renderReportCategoryGrid() {
  document.getElementById('report-category-grid').innerHTML = reportCategories.map(c => `
    <button data-cat="${c.id}" class="report-cat-btn flex flex-col items-center gap-2 p-4 rounded-2xl border-2 ${selectedCategory === c.id ? 'theme-pink text-white border-transparent' : 'bg-gray-50 text-gray-600 border-gray-100'}">
      <i class="fa-solid ${c.icon} text-2xl"></i>
      <span class="text-sm font-bold text-center">${c.label}</span>
    </button>
  `).join('');

  document.querySelectorAll('.report-cat-btn').forEach(btn => {
    btn.onclick = () => {
      selectedCategory = btn.dataset.cat;
      renderReportCategoryGrid();
    };
  });
}

let reportMap = null;
let reportMarker = null;
let selectedLat = null;
let selectedLng = null;
let pendingLat = null;
let pendingLng = null;
let selectedImageFile = null;

document.getElementById('report-tab-home').onclick = () => { setTab('home'); showView('home-view'); };
document.getElementById('report-tab-report').onclick = () => { setTab('report'); showView('report-view'); };
document.getElementById('report-tab-history').onclick = () => { setTab('history'); showView('history-view'); };

document.getElementById('tab-report').onclick = () => {
  setTab('report');
  showView('report-view');
  renderReportCategoryGrid();
};

// --- ป็อปอัพแผนที่ปักหมุด ---
document.getElementById('btn-open-location-modal').onclick = () => {
  const modal = document.getElementById('location-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  setTimeout(() => {
    if (!reportMap) {
      reportMap = L.map('report-map').setView([13.7563, 100.5018], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(reportMap);
      reportMap.on('click', (e) => setPendingLocation(e.latlng.lat, e.latlng.lng));
    }
    reportMap.invalidateSize();
    if (selectedLat !== null) setPendingLocation(selectedLat, selectedLng);
  }, 150);
};

document.getElementById('btn-close-location-modal').onclick = () => {
  const modal = document.getElementById('location-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

function setPendingLocation(lat, lng) {
  pendingLat = lat;
  pendingLng = lng;

  if (reportMarker) reportMap.removeLayer(reportMarker);
  reportMarker = L.marker([lat, lng]).addTo(reportMap);
  reportMap.setView([lat, lng], 15);

  const confirmBtn = document.getElementById('btn-confirm-location');
  confirmBtn.disabled = false;
  confirmBtn.className = 'w-full theme-pink text-white py-3.5 rounded-xl font-black text-lg';
}

document.getElementById('btn-use-current-location').onclick = () => {
  if (!navigator.geolocation) {
    showToast('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง', 'error');
    return;
  }
  showLoading('กำลังค้นหาตำแหน่งของคุณ...');
  navigator.geolocation.getCurrentPosition(
    (pos) => { hideLoading(); setPendingLocation(pos.coords.latitude, pos.coords.longitude); },
    () => { hideLoading(); showToast('ไม่สามารถระบุตำแหน่งได้ กรุณาแตะบนแผนที่แทน', 'error'); }
  );
};

document.getElementById('btn-confirm-location').onclick = () => {
  if (pendingLat === null) return;
  selectedLat = pendingLat;
  selectedLng = pendingLng;

  document.getElementById('report-location-label').innerHTML =
    `<i class="fa-solid fa-check-circle text-emerald-500 mr-1"></i> ปักหมุดแล้ว: ${selectedLat.toFixed(5)}, ${selectedLng.toFixed(5)}`;
  document.getElementById('report-location-label').className = 'mt-3 bg-emerald-50 rounded-xl p-3 text-base text-emerald-700 font-bold text-center';

  document.getElementById('btn-close-location-modal').click();
};

// --- อัปโหลดรูป ---
document.getElementById('report-image-preview-box').onclick = () => {
  document.getElementById('report-image-input').click();
};

document.getElementById('report-image-input').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedImageFile = file;

  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('report-image-preview').src = ev.target.result;
    document.getElementById('report-image-preview').classList.remove('hidden');
    document.getElementById('report-image-placeholder').classList.add('hidden');
  };
  reader.readAsDataURL(file);
};

// --- ส่งฟอร์ม ---
document.getElementById('btn-submit-report').onclick = async () => {
  const title = document.getElementById('report-title').value.trim();
  const description = document.getElementById('report-description').value.trim();
  const errBox = document.getElementById('report-error');

  if (!selectedImageFile) {
    errBox.innerText = 'กรุณาถ่ายรูป/เลือกภาพประกอบก่อน';
    errBox.classList.remove('hidden'); return;
  }
  if (!selectedCategory) {
    errBox.innerText = 'กรุณาเลือกหมวดหมู่ปัญหา';
    errBox.classList.remove('hidden'); return;
  }
  if (selectedLat === null) {
    errBox.innerText = 'กรุณาปักหมุดสถานที่เกิดเหตุ';
    errBox.classList.remove('hidden'); return;
  }
  if (!title) {
    errBox.innerText = 'กรุณากรอกหัวข้อปัญหา';
    errBox.classList.remove('hidden'); return;
  }
  if (!description) {
    errBox.innerText = 'กรุณากรอกรายละเอียดปัญหา';
    errBox.classList.remove('hidden'); return;
  }
  errBox.classList.add('hidden');

  showLoading('กำลังอัปโหลดรูปภาพ...');
  try {
    const formData = new FormData();
    formData.append('file', selectedImageFile);
    formData.append('upload_preset', 'goodday_unsigned');

    const uploadRes = await fetch('https://api.cloudinary.com/v1_1/l1htg1ks/image/upload', {
      method: 'POST', body: formData
    });
    const uploadData = await uploadRes.json();

    if (!uploadData.secure_url) {
      hideLoading();
      showToast('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่', 'error');
      return;
    }

    showLoading('กำลังส่งเรื่องแจ้งปัญหา...');

    const res = await fetch('/api/create-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentUid, title, category: selectedCategory, description,
        imageUrl: uploadData.secure_url,
        lat: selectedLat, lng: selectedLng
      })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) {
      showToast(data.error || 'ส่งเรื่องไม่สำเร็จ', 'error');
      return;
    }

    document.getElementById('rs-code').innerText = data.reportCode;
    showView('report-success-view');

    // เคลียร์ฟอร์ม
    document.getElementById('report-title').value = '';
    document.getElementById('report-description').value = '';
    document.getElementById('report-image-preview').classList.add('hidden');
    document.getElementById('report-image-placeholder').classList.remove('hidden');
    document.getElementById('report-location-label').innerText = 'พิกัด GPS จะแสดงที่นี่...';
    document.getElementById('report-location-label').className = 'mt-3 bg-gray-50 rounded-xl p-3 text-base text-gray-400 text-center';
    selectedCategory = null; selectedLat = null; selectedLng = null; selectedImageFile = null;
    if (reportMarker) { reportMap.removeLayer(reportMarker); reportMarker = null; }
    renderReportCategoryGrid();

  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', 'error');
  }
};

document.getElementById('btn-report-done').onclick = () => {
  setTab('history');
  showView('history-view');
};

// ================= ประวัติคำร้อง =================

let allMyReports = [];
let currentReportDetail = null;

document.getElementById('hist-tab-home').onclick = () => { setTab('home'); showView('home-view'); };
document.getElementById('hist-tab-report').onclick = () => { setTab('report'); showView('report-view'); renderReportCategoryGrid(); };
document.getElementById('hist-tab-history').onclick = () => { setTab('history'); showView('history-view'); loadMyReports(); };

document.getElementById('tab-history').onclick = () => {
  setTab('history');
  showView('history-view');
  loadMyReports();
};

const statusLabel = { pending: 'รอรับเรื่อง', inprogress: 'กำลังดำเนินการ', resolved: 'เสร็จสิ้น', cancelled: 'ยกเลิกแล้ว' };
const statusColor = {
  pending: 'bg-orange-50 text-orange-600',
  inprogress: 'bg-amber-50 text-amber-600',
  resolved: 'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-gray-100 text-gray-400'
};

async function loadMyReports() {
  const container = document.getElementById('history-list-container');
  container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">กำลังโหลด...</p>';

  const q = query(collection(db, 'users', currentUid, 'myReports'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  allMyReports = [];
  snap.forEach(d => allMyReports.push({ id: d.id, ...d.data() }));

  if (allMyReports.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">ยังไม่มีประวัติการแจ้งเหตุ</p>';
    return;
  }

  container.innerHTML = allMyReports.map(r => `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 cursor-pointer" onclick="openReportDetail('${r.id}')">
      <img src="${r.imageUrl || ''}" class="w-16 h-16 rounded-xl object-cover shrink-0 bg-gray-100">
      <div class="flex-1">
        <h4 class="font-black text-gray-800 text-base leading-tight mb-1">${r.title}</h4>
        <p class="text-sm text-gray-400">${r.reportCode}</p>
      </div>
      <span class="text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${statusColor[r.status] || ''}">${statusLabel[r.status] || r.status}</span>
    </div>
  `).join('');
}

function openReportDetail(reportId) {
  const r = allMyReports.find(x => x.id === reportId);
  if (!r) return;
  currentReportDetail = r;

  document.getElementById('rd-image').src = r.imageUrl || '';
  document.getElementById('rd-title').innerText = r.title;
  document.getElementById('rd-description').innerText = r.description || '';
  document.getElementById('rd-code').innerText = r.reportCode;
  document.getElementById('rd-map-link').href = r.mapLink || '#';
  document.getElementById('rd-category-badge').innerText = categoryLabels[r.category] || r.category;

  const badge = document.getElementById('rd-status-badge');
  badge.innerText = statusLabel[r.status] || r.status;
  badge.className = `text-sm font-bold px-3 py-1.5 rounded-full ${statusColor[r.status] || ''}`;

  // ปุ่มยกเลิก: โชว์เฉพาะสถานะ pending และยังไม่เกิน 7 วัน
  const cancelBtn = document.getElementById('btn-cancel-report');
  const daysPassed = r.createdAt ? (new Date() - r.createdAt.toDate()) / (1000 * 60 * 60 * 24) : 999;
  cancelBtn.classList.toggle('hidden', !(r.status === 'pending' && daysPassed <= 7));

  // กล่องให้คะแนน / แสดงคะแนนที่ให้แล้ว
  const ratingBox = document.getElementById('rd-rating-box');
  const ratedBox = document.getElementById('rd-rated-box');

  if (r.status === 'resolved' && !r.rating) {
    ratingBox.classList.remove('hidden');
    ratedBox.classList.add('hidden');
    selectedRdRating = 0;
    renderRdRatingStars();
    document.getElementById('rd-rating-comment').value = '';
  } else if (r.rating) {
    ratingBox.classList.add('hidden');
    ratedBox.classList.remove('hidden');
    document.getElementById('rd-rated-stars').innerText = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
  } else {
    ratingBox.classList.add('hidden');
    ratedBox.classList.add('hidden');
  }

  showView('report-detail-view');
}
window.openReportDetail = openReportDetail;

document.getElementById('btn-back-report-detail').onclick = () => showView('history-view');

document.getElementById('btn-cancel-report').onclick = async () => {
  if (!currentReportDetail) return;
  if (!confirm('ยืนยันยกเลิกคำร้องนี้หรือไม่?')) return;

  showLoading('กำลังยกเลิกคำร้อง...');
  try {
    const res = await fetch('/api/cancel-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: currentUid, reportId: currentReportDetail.id })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) { showToast(data.error || 'ยกเลิกไม่สำเร็จ', 'error'); return; }

    showToast('ยกเลิกคำร้องสำเร็จ', 'success');
    showView('history-view');
    await loadMyReports();
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
};

// --- ให้คะแนน ---
let selectedRdRating = 0;

function renderRdRatingStars() {
  document.getElementById('rd-rating-stars').innerHTML = [1, 2, 3, 4, 5].map(n => `
    <button data-star="${n}" class="rd-star-btn text-4xl ${n <= selectedRdRating ? 'text-amber-400' : 'text-gray-200'}">
      <i class="fa-solid fa-star"></i>
    </button>
  `).join('');

  document.querySelectorAll('.rd-star-btn').forEach(btn => {
    btn.onclick = () => { selectedRdRating = Number(btn.dataset.star); renderRdRatingStars(); };
  });
}

document.getElementById('btn-submit-rating').onclick = async () => {
  if (selectedRdRating === 0) {
    showToast('กรุณาเลือกจำนวนดาวก่อน', 'error');
    return;
  }

  showLoading('กำลังส่งคะแนน...');
  try {
    const res = await fetch('/api/submit-rating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentUid,
        reportId: currentReportDetail.id,
        rating: selectedRdRating,
        comment: document.getElementById('rd-rating-comment').value.trim()
      })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) { showToast(data.error || 'ส่งคะแนนไม่สำเร็จ', 'error'); return; }

    showToast('ขอบคุณสำหรับความคิดเห็น!', 'success');
    showView('history-view');
    await loadMyReports();
    await loadHomeData(); // รีเฟรชหน้าหลักให้เห็นคะแนนใหม่ด้วย
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
};