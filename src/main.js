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

// ================= ฟอร์มแจ้งปัญหา =================

let reportMap = null;
let reportMarker = null;
let selectedLat = null;
let selectedLng = null;
let selectedImageFile = null;

document.getElementById('report-tab-home').onclick = () => { setTab('home'); showView('home-view'); };
document.getElementById('report-tab-report').onclick = () => { setTab('report'); showView('report-view'); };
document.getElementById('report-tab-history').onclick = () => { setTab('history'); showView('history-view'); };

document.getElementById('tab-report').onclick = () => {
  setTab('report');
  showView('report-view');
  initReportMap();
};

function initReportMap() {
  if (reportMap) {
    setTimeout(() => reportMap.invalidateSize(), 100);
    return;
  }
  reportMap = L.map('report-map').setView([13.7563, 100.5018], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(reportMap);

  reportMap.on('click', (e) => {
    setReportLocation(e.latlng.lat, e.latlng.lng);
  });
}

function setReportLocation(lat, lng) {
  selectedLat = lat;
  selectedLng = lng;

  if (reportMarker) reportMap.removeLayer(reportMarker);
  reportMarker = L.marker([lat, lng]).addTo(reportMap);
  reportMap.setView([lat, lng], 15);

  document.getElementById('report-location-label').innerHTML =
    `<i class="fa-solid fa-check-circle text-emerald-500 mr-1"></i> ปักหมุดแล้ว: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

document.getElementById('btn-use-current-location').onclick = () => {
  if (!navigator.geolocation) {
    showToast('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง', 'error');
    return;
  }
  showLoading('กำลังค้นหาตำแหน่งของคุณ...');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      hideLoading();
      setReportLocation(pos.coords.latitude, pos.coords.longitude);
    },
    (err) => {
      hideLoading();
      showToast('ไม่สามารถระบุตำแหน่งได้ กรุณาแตะบนแผนที่แทน', 'error');
    }
  );
};

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

document.getElementById('btn-submit-report').onclick = async () => {
  const title = document.getElementById('report-title').value.trim();
  const category = document.getElementById('report-category').value;
  const description = document.getElementById('report-description').value.trim();
  const errBox = document.getElementById('report-error');

  if (!selectedImageFile) {
    errBox.innerText = 'กรุณาถ่ายรูป/เลือกภาพประกอบก่อน';
    errBox.classList.remove('hidden');
    return;
  }
  if (!category) {
    errBox.innerText = 'กรุณาเลือกหมวดหมู่ปัญหา';
    errBox.classList.remove('hidden');
    return;
  }
  if (!title) {
    errBox.innerText = 'กรุณากรอกหัวข้อปัญหา';
    errBox.classList.remove('hidden');
    return;
  }
  if (selectedLat === null || selectedLng === null) {
    errBox.innerText = 'กรุณาปักหมุดสถานที่เกิดเหตุ';
    errBox.classList.remove('hidden');
    return;
  }
  if (!description) {
    errBox.innerText = 'กรุณากรอกรายละเอียดปัญหา';
    errBox.classList.remove('hidden');
    return;
  }
  errBox.classList.add('hidden');

  showLoading('กำลังอัปโหลดรูปภาพ...');
  try {
    // อัปโหลดรูปขึ้น Cloudinary ก่อน
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
        uid: currentUid, title, category, description,
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
    document.getElementById('report-category').value = '';
    document.getElementById('report-description').value = '';
    document.getElementById('report-image-preview').classList.add('hidden');
    document.getElementById('report-image-placeholder').classList.remove('hidden');
    document.getElementById('report-location-label').innerText = 'ยังไม่ได้ปักหมุด';
    selectedLat = null; selectedLng = null; selectedImageFile = null;
    if (reportMarker) { reportMap.removeLayer(reportMarker); reportMarker = null; }

  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', 'error');
  }
};

document.getElementById('btn-report-done').onclick = () => {
  setTab('history');
  showView('history-view');
  // เฟส 3 จะเติมฟังก์ชันโหลดประวัติตรงนี้
};