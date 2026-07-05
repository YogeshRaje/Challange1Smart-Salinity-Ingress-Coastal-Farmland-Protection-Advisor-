/**
 * app.js — Main Application Logic
 * Navigation, view management, field assessment, crop guide, reclamation, irrigation
 */

const API_BASE = '/api';
let currentDistrict = 'kutch';
let trendChart = null;
let classChart = null;

// ─── NAVIGATION ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupDistrictTabs();
  loadDashboard('kutch');
  setupFieldAssessment();
  setupCropGuide();
  setupReclamation();
  setupIrrigation();
  initWebSocket();
});

function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`view-${view}`).classList.add('active');
    });
  });
}

function setupDistrictTabs() {
  document.querySelectorAll('.district-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.district-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentDistrict = tab.dataset.district;
      loadDashboard(currentDistrict);
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadDashboard(currentDistrict);
  });
}

// ─── DASHBOARD ────────────────────────────────────────────────
async function loadDashboard(district) {
  try {
    const [reading, trendData, allDistrictsData] = await Promise.all([
      fetch(`${API_BASE}/salinity/${district}`).then(r => r.json()),
      fetch(`${API_BASE}/salinity/${district}/trend`).then(r => r.json()),
      fetch(`${API_BASE}/salinity/all/current`).then(r => r.json())
    ]);

    updateKPIs(reading);
    renderTrendChart(trendData.data);
    renderClassChart(reading);
    renderAllDistrictsTable(allDistrictsData.districts);
    renderDistrictMapSvg(allDistrictsData.districts);
  } catch (e) {
    console.error('Dashboard load error:', e);
    showAlert('Could not load salinity data. Check if the server is running.', 'warning');
  }
}

function updateKPIs(reading) {
  const alertLevel = reading.tidal_ingress.alert_level;

  document.getElementById('soilEC').textContent = reading.soil.ec_surface_ds_m;
  document.getElementById('soilECsub').textContent = `Subsurface: ${reading.soil.ec_subsurface_ds_m} dS/m`;

  document.getElementById('gwEC').textContent = reading.groundwater.ec_ds_m;
  document.getElementById('gwECsub').textContent = `Depth: ${reading.groundwater.depth_m}m`;

  document.getElementById('soilPH').textContent = reading.soil.ph;
  document.getElementById('soilPHsub').textContent = reading.soil.ph > 8.5 ? '⚠ Highly alkaline' :
    reading.soil.ph > 7.5 ? 'Mildly alkaline' : 'Near neutral';

  document.getElementById('soilSAR').textContent = reading.soil.sodium_adsorption_ratio.toFixed(1);
  document.getElementById('soilSARsub').textContent = `ESP: ${reading.soil.exchangeable_sodium_pct}%`;

  const alertEl = document.getElementById('alertLevel');
  alertEl.textContent = alertLevel;
  alertEl.className = `kpi-value alert-value alert-${alertLevel}`;
  document.getElementById('alertLevelSub').textContent =
    `${reading.tidal_ingress.season} | Ingress: ${reading.tidal_ingress.distance_km}km`;

  // Show critical alert banner
  if (alertLevel === 'CRITICAL') {
    showAlert(`🚨 CRITICAL SALINITY ALERT: ${reading.district} — Soil EC ${reading.soil.ec_surface_ds_m} dS/m exceeds safe threshold!`, 'error');
  } else if (alertLevel === 'HIGH') {
    showAlert(`⚠ HIGH SALINITY WARNING: ${reading.district} — Immediate crop protection recommended`, 'warning');
  }
}

function renderTrendChart(data) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChart) trendChart.destroy();

  const labels = data.map(d => {
    const dt = new Date(d.date);
    return `${dt.getDate()}/${dt.getMonth() + 1}`;
  });

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Soil EC (dS/m)',
          data: data.map(d => d.soil_ec),
          borderColor: '#1a73e8',
          backgroundColor: 'rgba(26,115,232,0.08)',
          borderWidth: 2,
          pointRadius: 2,
          fill: true,
          tension: 0.4
        },
        {
          label: 'GW EC (dS/m)',
          data: data.map(d => d.gw_ec),
          borderColor: '#e65100',
          backgroundColor: 'rgba(230,81,0,0.05)',
          borderWidth: 2,
          pointRadius: 2,
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, maxTicksLimit: 10 }
        },
        y: {
          title: { display: true, text: 'EC (dS/m)', font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.04)' }
        }
      }
    }
  });
}

function renderClassChart(reading) {
  const ctx = document.getElementById('classChart').getContext('2d');
  if (classChart) classChart.destroy();

  const ec = reading.soil.ec_surface_ds_m;
  classChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Current EC', 'Safe Margin', 'Risk Zone'],
      datasets: [{
        data: [Math.min(ec, 16), Math.max(0, 4 - Math.min(ec, 4)), Math.max(0, 16 - ec)],
        backgroundColor: ['#1a73e8', '#e8f5e9', '#ffebee'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      cutout: '72%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
        tooltip: { enabled: true }
      }
    }
  });
}

function renderAllDistrictsTable(readings) {
  const tbody = document.getElementById('allDistrictsBody');
  tbody.innerHTML = readings.map(r => `
    <tr>
      <td><strong>${r.district}</strong><br><small>${r.taluka}</small></td>
      <td><strong>${r.soil.ec_surface_ds_m}</strong></td>
      <td>${r.groundwater.ec_ds_m}</td>
      <td>${r.soil.ph}</td>
      <td>${r.soil.sodium_adsorption_ratio}</td>
      <td><span class="badge badge-${r.tidal_ingress.alert_level}">${r.tidal_ingress.alert_level}</span></td>
    </tr>
  `).join('');
}

function renderDistrictMapSvg(readings) {
  const container = document.getElementById('districtMapSvg');
  const alertColors = { SAFE: '#4caf50', LOW: '#8bc34a', MODERATE: '#ffc107', HIGH: '#ff9800', CRITICAL: '#f44336' };

  const byDistrict = {};
  readings.forEach(r => { byDistrict[r.district.toLowerCase()] = r; });

  const getColor = d => alertColors[(byDistrict[d]?.tidal_ingress.alert_level) || 'SAFE'];
  const getEC = d => byDistrict[d]?.soil.ec_surface_ds_m || '--';

  container.innerHTML = `
    <svg viewBox="0 0 300 280" width="100%" style="max-height:280px">
      <text x="150" y="18" text-anchor="middle" font-size="12" font-weight="bold" fill="#0d2137">Gujarat Coastal Districts</text>

      <!-- Kutch (North-West) -->
      <polygon points="40,40 110,30 130,60 120,110 80,120 30,90" fill="${getColor('kutch')}" opacity="0.8" stroke="#fff" stroke-width="2"/>
      <text x="80" y="72" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff">Kutch</text>
      <text x="80" y="86" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.9)">${getEC('kutch')} dS/m</text>

      <!-- Jamnagar (West) -->
      <polygon points="110,100 160,90 170,130 155,155 120,150 105,130" fill="${getColor('jamnagar')}" opacity="0.8" stroke="#fff" stroke-width="2"/>
      <text x="138" y="122" text-anchor="middle" font-size="10" font-weight="bold" fill="#fff">Jamnagar</text>
      <text x="138" y="135" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.9)">${getEC('jamnagar')} dS/m</text>

      <!-- Bhavnagar (South-East) -->
      <polygon points="165,140 215,130 230,170 220,200 175,205 158,175" fill="${getColor('bhavnagar')}" opacity="0.8" stroke="#fff" stroke-width="2"/>
      <text x="194" y="167" text-anchor="middle" font-size="10" font-weight="bold" fill="#fff">Bhavnagar</text>
      <text x="194" y="180" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.9)">${getEC('bhavnagar')} dS/m</text>

      <!-- Arabian Sea label -->
      <text x="50" y="220" font-size="11" fill="#90caf9" font-style="italic">Arabian Sea</text>
      <path d="M 20 200 Q 80 230 150 215 Q 220 200 260 225" stroke="#90caf9" stroke-width="1.5" fill="none" stroke-dasharray="4,3"/>

      <!-- Legend -->
      <rect x="195" y="30" width="10" height="10" fill="#4caf50" rx="2"/>
      <text x="208" y="39" font-size="9" fill="#555">Safe</text>
      <rect x="195" y="46" width="10" height="10" fill="#ffc107" rx="2"/>
      <text x="208" y="55" font-size="9" fill="#555">Moderate</text>
      <rect x="195" y="62" width="10" height="10" fill="#ff9800" rx="2"/>
      <text x="208" y="71" font-size="9" fill="#555">High</text>
      <rect x="195" y="78" width="10" height="10" fill="#f44336" rx="2"/>
      <text x="208" y="87" font-size="9" fill="#555">Critical</text>
    </svg>
  `;
}

// ─── FIELD ASSESSMENT ─────────────────────────────────────────
function setupFieldAssessment() {
  document.getElementById('assessmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('assessBtn');
    const district = document.getElementById('fa-district').value;
    const taluka = document.getElementById('fa-taluka').value;
    const area = document.getElementById('fa-area').value;
    const ec = document.getElementById('fa-ec').value;
    const crop = document.getElementById('fa-crop').value;
    const water = document.getElementById('fa-water').value;
    const description = document.getElementById('fa-description').value;

    const query = [
      `I am a farmer in ${district} district${taluka ? ', ' + taluka + ' taluka' : ''}.`,
      area ? `My field is ${area} hectares.` : '',
      ec ? `My soil EC is ${ec} dS/m.` : '',
      crop ? `I currently grow ${crop}.` : '',
      `My water source is ${water}.`,
      description ? description : 'Please give me a complete salinity assessment and recommendations.'
    ].filter(Boolean).join(' ');

    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Analyzing with AI...';

    const resultCard = document.getElementById('assessmentResult');
    resultCard.innerHTML = `<div class="result-placeholder"><div class="thinking-dots"><span></span><span></span><span></span></div><p style="margin-top:16px">Our multi-agent AI system is analyzing your field data...</p></div>`;

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.message || data.error);

      resultCard.innerHTML = `
        <div class="ai-result">
          <h4>🤖 AI Assessment — ${district.charAt(0).toUpperCase() + district.slice(1)} District</h4>
          <div style="margin-bottom:12px">
            ${(data.agents_used || []).map(a => `<span class="agent-tag">${getAgentIcon(a)} ${a}</span>`).join('')}
            <span style="font-size:11px;color:#999;margin-left:8px">${data.processing_time_ms}ms</span>
          </div>
          <div class="ai-result-content">${escapeHtml(data.answer)}</div>
          <div class="message-meta" style="margin-top:12px">Session: ${data.session_id?.slice(-8)} · ${new Date(data.timestamp).toLocaleTimeString()}</div>
        </div>
      `;
    } catch (error) {
      resultCard.innerHTML = `<div class="ai-result" style="border-left-color:#f44336;background:#ffebee">
        <h4>⚠ Error</h4>
        <p>${error.message}</p>
        <p style="margin-top:8px;font-size:12px;color:#666">Ensure the server is running and IBM watsonx.ai credentials are configured in .env</p>
      </div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>🤖 Get AI Assessment</span>';
    }
  });
}

// ─── CROP GUIDE ──────────────────────────────────────────────
function setupCropGuide() {
  const slider = document.getElementById('ecSlider');
  const sliderValue = document.getElementById('ecSliderValue');

  slider.addEventListener('input', () => {
    sliderValue.textContent = parseFloat(slider.value).toFixed(1);
    loadCropCards(parseFloat(slider.value));
  });

  loadCropCards(6.0);

  document.getElementById('getCropRecommBtn').addEventListener('click', async () => {
    const ec = parseFloat(slider.value);
    const district = document.getElementById('cropDistrict').value;
    const btn = document.getElementById('getCropRecommBtn');
    const resultBox = document.getElementById('cropAIResult');

    btn.disabled = true;
    btn.textContent = 'Getting AI recommendations...';
    resultBox.classList.remove('hidden');
    resultBox.textContent = 'Analyzing with AI Crop Recommendation Agent...';

    try {
      const resp = await fetch(`${API_BASE}/crops/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ec_level: ec, district })
      });
      const data = await resp.json();
      resultBox.innerHTML = `<strong>🌾 AI Crop Recommendations (EC ${ec} dS/m, ${district})</strong>\n\n${escapeHtml(data.recommendations || data.answer || 'No recommendations available')}`;
    } catch (e) {
      resultBox.textContent = `Error: ${e.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Get AI Recommendations';
    }
  });
}

function loadCropCards(ec) {
  const cropData = getSaltTolerantCrops(ec);
  const container = document.getElementById('cropGrid');

  if (cropData.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#999;padding:40px">
      <div style="font-size:48px;margin-bottom:16px">⚠️</div>
      <p>EC ${ec} dS/m is extremely high. Only halophytes like Salicornia can survive.<br>Consider urgent land reclamation.</p>
    </div>`;
    return;
  }

  container.innerHTML = cropData.map(crop => `
    <div class="crop-card ${crop.suitability}">
      <div class="crop-card-header">
        <div class="crop-name">${crop.name}</div>
        <span class="crop-category" style="background:${getCropCatColor(crop.category)};color:#fff">${crop.category}</span>
      </div>
      <div class="crop-tolerance">EC Tolerance: <strong>${crop.tolerance_ece} dS/m</strong></div>
      <div class="crop-tolerance">Suitability: <strong class="alert-${crop.alertClass}">${crop.suitabilityLabel}</strong></div>
      <div class="crop-seasons">
        ${crop.season.split('/').map(s => `<span class="season-tag">${s.trim()}</span>`).join('')}
      </div>
      <div class="crop-varieties">Varieties: ${crop.varieties.join(', ')}</div>
    </div>
  `).join('');
}

function getSaltTolerantCrops(ec) {
  const allCrops = [
    { name: 'Barley (જૌ)', tolerance_ece: 8, category: 'Cereal', season: 'Rabi', varieties: ['K-508', 'Amber'] },
    { name: 'Cotton (કપાસ)', tolerance_ece: 7.7, category: 'Cash', season: 'Kharif', varieties: ['Suraj', 'Savar'] },
    { name: 'Sorghum (Jowar)', tolerance_ece: 6.8, category: 'Cereal', season: 'Kharif', varieties: ['CSV-216'] },
    { name: 'Wheat (ઘઉં)', tolerance_ece: 6.0, category: 'Cereal', season: 'Rabi', varieties: ['KRL-1-4', 'KRL-19'] },
    { name: 'Safflower', tolerance_ece: 6.5, category: 'Oilseed', season: 'Rabi', varieties: ['A-1', 'Bhima'] },
    { name: 'Beetroot', tolerance_ece: 7.0, category: 'Vegetable', season: 'Rabi', varieties: ['Detroit Dark Red'] },
    { name: 'Spinach (Palak)', tolerance_ece: 7.6, category: 'Vegetable', season: 'Rabi', varieties: ['All Green'] },
    { name: 'Groundnut (Mungfali)', tolerance_ece: 3.2, category: 'Oilseed', season: 'Kharif', varieties: ['GG-20', 'GJG-31'] },
    { name: 'Sesame (Til)', tolerance_ece: 5.0, category: 'Oilseed', season: 'Kharif', varieties: ['GT-3'] },
    { name: 'Rhodes Grass', tolerance_ece: 11, category: 'Fodder', season: 'Perennial', varieties: ['Katambora'] },
    { name: 'Para Grass', tolerance_ece: 8.2, category: 'Fodder', season: 'Perennial', varieties: ['Common'] },
    { name: 'Date Palm (Khajur)', tolerance_ece: 18, category: 'Fruit', season: 'Perennial', varieties: ['Khadrawi', 'Medjool'] },
    { name: 'Coconut (Nariyal)', tolerance_ece: 10, category: 'Fruit', season: 'Perennial', varieties: ['ECT', 'WCT Hybrid'] },
    { name: 'Salicornia', tolerance_ece: 40, category: 'Halophyte', season: 'Kharif', varieties: ['Cultivated'] },
    { name: 'Seabuckthorn', tolerance_ece: 25, category: 'Halophyte', season: 'Perennial', varieties: ['Habago'] }
  ];

  return allCrops
    .filter(c => c.tolerance_ece >= ec * 0.5)
    .map(c => {
      let suitability, suitabilityLabel, alertClass;
      if (ec <= c.tolerance_ece * 0.5) {
        suitability = 'highly-suitable'; suitabilityLabel = '✓ Highly Suitable'; alertClass = 'SAFE';
      } else if (ec <= c.tolerance_ece * 0.8) {
        suitability = 'suitable'; suitabilityLabel = '~ Suitable'; alertClass = 'LOW';
      } else {
        suitability = 'marginal'; suitabilityLabel = '⚠ Marginal'; alertClass = 'MODERATE';
      }
      return { ...c, suitability, suitabilityLabel, alertClass };
    })
    .sort((a, b) => {
      const order = { 'highly-suitable': 0, 'suitable': 1, 'marginal': 2 };
      return order[a.suitability] - order[b.suitability];
    });
}

// ─── RECLAMATION ─────────────────────────────────────────────
function setupReclamation() {
  const ecInput = document.getElementById('rec-ec');
  const areaInput = document.getElementById('rec-area');

  function updatePreview() {
    const ec = parseFloat(ecInput.value) || 10;
    const area = parseFloat(areaInput.value) || 1;
    const severity = ec > 16 ? 'high' : ec > 8 ? 'medium' : 'low';
    const gypsumRate = { low: 2500, medium: 5000, high: 10000 }[severity];
    const gypsumQty = gypsumRate * area;
    const cost = gypsumQty * 3.5;
    const weeks = ec > 8 ? 20 : 12;

    document.getElementById('amendmentPreview').innerHTML = `
      <div style="font-weight:700;color:#0d2137;margin-bottom:10px">📊 Amendment Preview</div>
      <div class="amend-row"><span class="amend-label">Severity Level</span><span class="amend-value">${severity.toUpperCase()}</span></div>
      <div class="amend-row"><span class="amend-label">Gypsum Required</span><span class="amend-value">${gypsumQty.toLocaleString()} kg</span></div>
      <div class="amend-row"><span class="amend-label">Estimated Cost</span><span class="amend-value">₹${cost.toLocaleString()}</span></div>
      <div class="amend-row"><span class="amend-label">Recovery Time</span><span class="amend-value">~${weeks} weeks</span></div>
      <div class="amend-row"><span class="amend-label">Leaching Water Needed</span><span class="amend-value">${(600 * area).toLocaleString()} mm·ha</span></div>
    `;
  }

  ecInput.addEventListener('input', updatePreview);
  areaInput.addEventListener('input', updatePreview);
  updatePreview();

  document.getElementById('reclamationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const district = document.getElementById('rec-district').value;
    const area = document.getElementById('rec-area').value;
    const ec = document.getElementById('rec-ec').value;

    const resultCard = document.getElementById('reclamationResult');
    resultCard.innerHTML = `<div class="result-placeholder"><div class="thinking-dots"><span></span><span></span><span></span></div><p style="margin-top:16px">Land Reclamation Agent is generating your plan...</p></div>`;

    try {
      const resp = await fetch(`${API_BASE}/reclamation/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ district, area_ha: area, ec_level: ec })
      });
      const data = await resp.json();

      resultCard.innerHTML = `
        <div class="ai-result">
          <h4>🌿 Reclamation Plan — ${district} (${area} ha, EC ${ec} dS/m)</h4>
          <div class="ai-result-content">${escapeHtml(data.reclamation_plan || data.answer || JSON.stringify(data))}</div>
        </div>`;
    } catch (err) {
      resultCard.innerHTML = `<div class="ai-result" style="border-left-color:#f44336;background:#ffebee"><h4>Error</h4><p>${err.message}</p></div>`;
    }
  });
}

// ─── IRRIGATION ──────────────────────────────────────────────
function setupIrrigation() {
  const ecInput = document.getElementById('irr-ec');

  function updateWaterQuality() {
    const ec = parseFloat(ecInput.value) || 0;
    const pct = Math.min((ec / 12) * 100, 100);
    const quality = ec < 2 ? 'Excellent' : ec < 4 ? 'Good' : ec < 6 ? 'Marginal' : ec < 10 ? 'Poor' : 'Very Poor';
    document.getElementById('waterQualityIndicator').innerHTML = `
      <div class="wq-marker" style="left:${pct}%"></div>
      <div style="font-size:11px;margin-top:10px;color:#666">Quality: <strong>${quality}</strong></div>`;
  }

  ecInput.addEventListener('input', updateWaterQuality);
  updateWaterQuality();

  document.getElementById('irrigationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const crop = document.getElementById('irr-crop').value;
    const district = document.getElementById('irr-district').value;
    const water_ec = document.getElementById('irr-ec').value;

    const resultCard = document.getElementById('irrigationResult');
    resultCard.innerHTML = `<div class="result-placeholder"><div class="thinking-dots"><span></span><span></span><span></span></div><p style="margin-top:16px">Irrigation Advisory Agent is generating schedule...</p></div>`;

    try {
      const resp = await fetch(`${API_BASE}/irrigation/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crop, district, water_ec })
      });
      const data = await resp.json();

      resultCard.innerHTML = `
        <div class="ai-result">
          <h4>💧 Irrigation Schedule — ${crop} in ${district} (Water EC: ${water_ec} dS/m)</h4>
          <div class="ai-result-content">${escapeHtml(data.weekly_plan || data.answer || JSON.stringify(data))}</div>
        </div>`;
    } catch (err) {
      resultCard.innerHTML = `<div class="ai-result" style="border-left-color:#f44336;background:#ffebee"><h4>Error</h4><p>${err.message}</p></div>`;
    }
  });
}

// ─── WEBSOCKET ────────────────────────────────────────────────
function initWebSocket() {
  const wsUrl = `ws://${window.location.host}/ws`;
  let ws;
  let reconnectTimeout = null;

  function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setWSStatus('connected', 'Live Data');
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'salinity_update') {
        // Update current district KPIs silently if data changed significantly
        const districtUpdate = msg.data.find(d => d.district === currentDistrict);
        if (districtUpdate && districtUpdate.alert_level === 'CRITICAL') {
          showAlert(`🚨 CRITICAL ALERT: ${districtUpdate.district} EC ${districtUpdate.soil_ec} dS/m`, 'error');
        }
      }
    };

    ws.onclose = () => {
      setWSStatus('error', 'Reconnecting...');
      reconnectTimeout = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      setWSStatus('error', 'No connection');
    };
  }

  connect();
}

function setWSStatus(state, label) {
  const dot = document.getElementById('wsStatus');
  const lbl = document.getElementById('wsLabel');
  dot.className = `status-dot ${state}`;
  lbl.textContent = label;
}

// ─── UTILITIES ────────────────────────────────────────────────
function showAlert(msg, type = 'error') {
  const banner = document.getElementById('alertBanner');
  banner.textContent = msg;
  banner.className = `alert-banner ${type === 'warning' ? 'warning' : type === 'info' ? 'info' : ''}`;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 6000);
}

function getAgentIcon(name) {
  const icons = {
    'OrchestratorAgent': '🎯',
    'SalinityMonitor': '📊',
    'CropRecommendation': '🌾',
    'LandReclamation': '🌿',
    'IrrigationAdvisory': '💧'
  };
  return icons[name] || '🤖';
}

function getCropCatColor(cat) {
  const colors = {
    Cereal: '#1565c0', Cash: '#6a1b9a', Oilseed: '#e65100',
    Vegetable: '#2e7d32', Fruit: '#ad1457', Fodder: '#4e342e',
    Halophyte: '#00695c'
  };
  return colors[cat] || '#607d8b';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
