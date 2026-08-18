// ===== ui.js =====
// ═══════════════════════════════════════════════════════════════
//  MODULE: ui — Điều phối giao diện chính
// ═══════════════════════════════════════════════════════════════
window.CSHL_UI = (function () {
  'use strict';
  const App = window.ColdStorageHeatLoad;
  const t = function (k) { return CSHL_I18N.t(k); };
  const tf = function (k, v) { return CSHL_I18N.tf(k, v); };
  const esc = App.util.escapeHtml;

  let currentShape = 'rect';
  let openingsList = [];
  let lastProvinceBorrowedFrom = null;
  let openingIdCounter = 1;
  let lastResult = null, lastInput = null;
  let unitsConfig = { temp: 'C', power: 'kW', density: 'W/m3' };
  let currentProduct = null;
  let currentProjectId = null;

  async function init() {
    const dd = App.DEFAULT_DATA;
    await App.db.seedIfEmpty('products', dd.products);
    await App.db.seedIfEmpty('materials', dd.materials);
    await App.db.seedIfEmpty('respiration', dd.respiration);
    await App.db.seedIfEmpty('doorTypes', dd.doorTypes);
    await App.db.seedIfEmpty('panelSpecs', dd.panelSpecs);
    await App.db.seedIfEmpty('vehicles', dd.vehicles);
    await App.db.seedIfEmpty('climateProvinces', Object.keys(dd.climate63).map(function (k) {
      return Object.assign({ name: k }, dd.climate63[k]);
    }));
    await App.db.seedIfEmpty('personHeat', dd.personHeat.map(function (p, i) { return Object.assign({ name: 'p' + i }, p); }));
    await App.db.seedIfEmpty('packingSpec', dd.packingSpec);
    await App.db.seedIfEmpty('warehouseTypePresets', dd.warehouseTypePresets);
    await App.db.seedIfEmpty('rackLayoutConfig', dd.rackLayoutConfig);

    unitsConfig = App.settings.get('units', { temp: 'C', power: 'kW', density: 'W/m3' });
    CSHL_I18N.init();

    const projects = await App.db.getAll('projects');
    if (!projects.length) {
      const id = await App.db.put('projects', {
        name: CSHL_I18N.getLang() === 'en' ? 'Default Project' : 'Dự án mặc định',
        client: '', address: '', engineer: '', date: '', createdAt: new Date().toISOString()
      });
      currentProjectId = id;
    } else {
      currentProjectId = App.settings.get('currentProjectId', projects[0].id);
    }

    await renderInputPanel();
    if (window.lucide) lucide.createIcons();
    if (window.CSHL_Projects) await CSHL_Projects.render();

    // ── Nút Back vật lý (Android): đóng modal/drawer trước, thoát app chỉ khi
    // không còn gì để đóng và người dùng xác nhận. Không ảnh hưởng gì trên web. ──
    if (window.CSHL_Native) {
      window.CSHL_Native.registerBackHandler(function () {
        const modalOv = document.getElementById('modalOverlay');
        if (modalOv && modalOv.classList.contains('open')) { modalOv.classList.remove('open'); return true; }
        return false;
      });
      window.CSHL_Native.registerBackHandler(function () {
        const sb = document.getElementById('appSidebar');
        if (sb && sb.classList.contains('open')) { toggleSidebar(false); return true; }
        return false;
      });
      window.CSHL_Native.setupBackButton(function () {
        App.Modal.confirm(t('exitConfirmTitle'), t('exitConfirmDesc')).then(function (ok) {
          if (!ok) return;
          const AppPlugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
          if (AppPlugin && AppPlugin.exitApp) AppPlugin.exitApp();
        });
      });
    }
  }

  // ── Fix lỗi 'zoom' khi chuyển tab trên mobile: nếu 1 input đang focus (đặc biệt
  // input số/text trong bảng nhập liệu) và tab bị ẩn đi ngay mà không blur trước,
  // 1 số trình duyệt mobile (Safari/Chrome Android) giữ nguyên mức zoom đã phóng to
  // theo input đó. Blur input + ép viewport tính lại scale=1 để tránh kẹt zoom. ──
  function resetMobileZoomAfterTabSwitch() {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute('content');
    meta.setAttribute('content', original + ', maximum-scale=1.0');
    setTimeout(function () { meta.setAttribute('content', original); }, 60);
  }

  function switchTab(tab) {
    resetMobileZoomAfterTabSwitch();
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    document.querySelectorAll('.tab-page').forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + tab); });
    const homeBtn = document.querySelector('.header-home-btn');
    if (homeBtn) homeBtn.classList.toggle('active', tab === 'calc');
    if (tab === 'admin') CSHL_Admin.render();
    if (tab === 'settings') renderSettingsTab();
    if (tab === 'report') CSHL_Report.render();
    if (tab === 'about') CSHL_About.render();
    if (tab === 'projects') CSHL_Projects.render();
    if (tab === 'ai') { CSHL_AI.renderWelcomeAndChips(); }
    if (window.innerWidth <= 900) toggleSidebar(false);
    window.scrollTo(0, 0);
    if (window.lucide) lucide.createIcons();
  }

  // ── Đóng/mở sidebar điều hướng (drawer trên mobile) — trước đây hàm này điều
  // khiển bảng nhập liệu (#inputPanel); giờ #inputPanel hiển thị tĩnh trong nội
  // dung chính, nên hàm này chuyển sang điều khiển #appSidebar (menu các tab). ──
  function toggleSidebar(force) {
    const sb = document.getElementById('appSidebar');
    const ov = document.getElementById('cshlOverlay');
    if (!sb || !ov) return;
    const show = force !== undefined ? force : !sb.classList.contains('open');
    sb.classList.toggle('open', show);
    ov.classList.toggle('show', show);
  }

  function normalizeSearch(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  }
  const comboRegistry = {};
  function registerCombo(id, items, opts) {
    comboRegistry[id] = Object.assign({ items: items, labelFn: function (x) { return x.name; }, metaFn: function () { return ''; }, groupFn: function () { return null; }, onSelect: function () {}, groupFilterId: null }, opts);
  }
  function comboRenderList(id, filtered) {
    const dd = document.getElementById('dd_' + id);
    if (!dd) return;
    const reg = comboRegistry[id];
    if (!filtered.length) { dd.innerHTML = '<div class="combo-item" style="color:var(--slate-500)">' + t('notFoundAddNew') + '</div>'; return; }
    dd.innerHTML = filtered.slice(0, 100).map(function (item, i) {
      const grp = reg.groupFn(item);
      return '<div class="combo-item" onclick=\'CSHL_UI.comboSelect("' + id + '", ' + i + ')\'>' +
        '<span>' + esc(reg.labelFn(item)) + '</span>' +
        '<span class="ci-meta">' + (grp ? '<span class="combo-group-tag">' + esc(grp) + '</span> ' : '') + esc(reg.metaFn(item)) + '</span>' +
        '</div>';
    }).join('');
    if (filtered.length > 100) dd.innerHTML += '<div class="combo-item" style="color:var(--slate-500);font-style:italic">' + tf('searchMoreHint', { n: filtered.length - 100 }) + '</div>';
    dd._filtered = filtered;
  }
  function comboFilter(id) {
    const el = document.getElementById(id);
    const q = normalizeSearch(el.value);
    const reg = comboRegistry[id];
    let pool = reg.items;
    if (reg.groupFilterId) {
      const gEl = document.getElementById(reg.groupFilterId);
      if (gEl && gEl.value) pool = pool.filter(function (it) { return reg.groupFn(it) === gEl.value; });
    }
    const filtered = q ? pool.filter(function (it) { return normalizeSearch(reg.labelFn(it)).includes(q); }) : pool;
    comboRenderList(id, filtered);
    document.getElementById('dd_' + id).classList.add('open');
  }
  function comboOpen(id) { comboFilter(id); }
  // ── Đổi bộ lọc nhóm sản phẩm: xoá ô tìm theo tên đang gõ dở, lọc lại theo nhóm mới chọn ──
  function onProductGroupChange() {
    const input = document.getElementById('productCombo');
    if (input) input.value = '';
    comboFilter('productCombo');
  }
  function comboSelect(id, idx) {
    const dd = document.getElementById('dd_' + id);
    const item = dd._filtered[idx];
    const reg = comboRegistry[id];
    document.getElementById(id).value = reg.labelFn(item);
    dd.classList.remove('open');
    reg.onSelect(item);
  }
  document.addEventListener('click', function (e) {
    document.querySelectorAll('.combo-dropdown.open').forEach(function (dd) {
      const wrap = dd.parentElement;
      if (wrap && !wrap.contains(e.target)) dd.classList.remove('open');
    });
  });
  function buildCombo(id, placeholderKey) {
    return '<div class="combo-wrap">' +
      '<input type="text" id="' + id + '" placeholder="' + t(placeholderKey) + '" autocomplete="off" ' +
      'oninput="CSHL_UI.comboFilter(\'' + id + '\')" onfocus="CSHL_UI.comboOpen(\'' + id + '\')">' +
      '<div class="combo-dropdown" id="dd_' + id + '"></div></div>';
  }

  // ── Shape selection ──
  function setShape(s) {
    currentShape = s;
    document.getElementById('shapeRect').classList.toggle('active', s === 'rect');
    document.getElementById('shapeLshape').classList.toggle('active', s === 'lshape');
    document.getElementById('shapeUshape').classList.toggle('active', s === 'ushape');
    document.getElementById('dimsRect').classList.toggle('active', s === 'rect');
    document.getElementById('dimsLshape').classList.toggle('active', s === 'lshape');
    document.getElementById('dimsUshape').classList.toggle('active', s === 'ushape');
    // Nếu đang có 1 loại kho (preset) được áp dụng, áp lại đúng kích thước cho hình vừa đổi sang —
    // trước đây chỉ áp kích thước lúc CHỌN preset nên đổi hình sau đó sẽ bị bỏ trống (đã sửa).
    if (typeof activeWarehousePreset !== 'undefined' && activeWarehousePreset) {
      applyPresetGeometryForShape(activeWarehousePreset, s);
    } else {
      updateGeomSummary();
      rebuildWallOverrides();
    }
    renderStorageModeSelector();
  }

  function readGeometryInput() {
    const H = parseFloat(document.getElementById('H').value) || 0;
    if (currentShape === 'rect') {
      return { shape: 'rect', H: H, L: parseFloat(document.getElementById('L').value) || 0, W: parseFloat(document.getElementById('W').value) || 0 };
    }
    if (currentShape === 'lshape') {
      return {
        shape: 'lshape', H: H,
        ls_L1: parseFloat(document.getElementById('ls_L1').value) || 0,
        ls_W1: parseFloat(document.getElementById('ls_W1').value) || 0,
        ls_L3: parseFloat(document.getElementById('ls_L3').value) || 0,
        ls_W2: parseFloat(document.getElementById('ls_W2').value) || 0
      };
    }
    return {
      shape: 'ushape', H: H,
      us_L1: parseFloat(document.getElementById('us_L1').value) || 0,
      us_W1: parseFloat(document.getElementById('us_W1').value) || 0,
      us_L3: parseFloat(document.getElementById('us_L3').value) || 0,
      us_W2: parseFloat(document.getElementById('us_W2').value) || 0
    };
  }

  function updateGeomSummary() {
    const g = App.calc.computeGeometry(readGeometryInput());
    const el = document.getElementById('geomSummary');
    const validBanner = document.getElementById('lshapeValid');
    const validBannerU = document.getElementById('ushapeValid');
    if (!g.valid) {
      if (el) el.textContent = '';
      if (currentShape === 'lshape' && validBanner) { validBanner.style.display = 'block'; validBanner.textContent = t('lshapeErrorPrefix') + g.error; }
      if (currentShape === 'ushape' && validBannerU) { validBannerU.style.display = 'block'; validBannerU.textContent = t('lshapeErrorPrefix') + g.error; }
      return;
    }
    if (validBanner) validBanner.style.display = 'none';
    if (validBannerU) validBannerU.style.display = 'none';
    if (el) el.innerHTML = tf('geomSummaryTemplate', { area: g.area.toFixed(1), volume: g.volume.toFixed(1), perimeter: g.perimeter.toFixed(1) });
    if (currentShape === 'lshape') updateLshapeDiagram(g);
    if (currentShape === 'ushape') updateUshapeDiagram(g);
  }

  // ── [YÊU CẦU MỚI] Sơ đồ hình ảnh kho 6 cạnh (L-shape) — SVG vẽ động theo đúng tỷ lệ kích thước nhập ──
  function updateLshapeDiagram(g) {
    const svgWrap = document.getElementById('lshapeDiagramSvg');
    if (!svgWrap || g.shape !== 'lshape') return;
    const L1 = parseFloat(document.getElementById('ls_L1').value) || 1;
    const W1 = parseFloat(document.getElementById('ls_W1').value) || 1;
    const L3 = parseFloat(document.getElementById('ls_L3').value) || 0;
    const W2 = parseFloat(document.getElementById('ls_W2').value) || 0;
    if (L3 >= L1 || W2 >= W1 || L3 <= 0 || W2 <= 0) { svgWrap.innerHTML = ''; return; }

    // Scale to fit a 280x200 viewbox with padding, preserving aspect ratio
    const pad = 30;
    const maxW = 280 - pad * 2, maxH = 180 - pad * 2;
    const scale = Math.min(maxW / L1, maxH / W1);
    const sx = function (v) { return pad + v * scale; };
    const sy = function (v) { return pad + v * scale; };

    // Polygon: outer rectangle L1xW1 with a cutout L3xW2 removed from top-right corner
    // Points (in real-world coords, origin top-left, y-down): (0,0) (L1,0) (L1,W2) (L1-L3,W2) (L1-L3,W1) (0,W1)
    const pts = [
      [0, 0], [L1, 0], [L1, W2], [L1 - L3, W2], [L1 - L3, W1], [0, W1]
    ].map(function (p) { return sx(p[0]) + ',' + sy(p[1]); }).join(' ');

    svgWrap.innerHTML =
      '<svg viewBox="0 0 280 200" style="width:100%;max-width:280px;display:block;margin:0 auto">' +
      '<polygon points="' + pts + '" fill="rgba(6,182,212,0.10)" stroke="#06b6d4" stroke-width="2" stroke-linejoin="round"/>' +
      // Dimension labels
      '<text x="' + (sx(L1 / 2)) + '" y="' + (sy(0) - 8) + '" fill="#94a3b8" font-size="10" text-anchor="middle" font-family="monospace">L1=' + L1 + 'm</text>' +
      '<text x="' + (sx(0) - 6) + '" y="' + (sy(W1 / 2)) + '" fill="#94a3b8" font-size="10" text-anchor="end" font-family="monospace" transform="rotate(-90 ' + (sx(0) - 6) + ' ' + sy(W1 / 2) + ')">W1=' + W1 + 'm</text>' +
      '<text x="' + (sx(L1 - L3 / 2)) + '" y="' + (sy(W2 / 2) + 4) + '" fill="#06b6d4" font-size="9" text-anchor="middle" font-family="monospace">L3=' + L3 + 'm</text>' +
      '<text x="' + (sx(L1 - L3) - 6) + '" y="' + (sy(W2 / 2) + 4) + '" fill="#06b6d4" font-size="9" text-anchor="end" font-family="monospace">W2=' + W2 + 'm</text>' +
      // corner markers
      '<circle cx="' + sx(0) + '" cy="' + sy(0) + '" r="2.5" fill="#16c491"/>' +
      '<circle cx="' + sx(L1) + '" cy="' + sy(0) + '" r="2.5" fill="#16c491"/>' +
      '<circle cx="' + sx(L1) + '" cy="' + sy(W2) + '" r="2.5" fill="#f59e0b"/>' +
      '<circle cx="' + sx(L1 - L3) + '" cy="' + sy(W2) + '" r="2.5" fill="#f59e0b"/>' +
      '<circle cx="' + sx(L1 - L3) + '" cy="' + sy(W1) + '" r="2.5" fill="#16c491"/>' +
      '<circle cx="' + sx(0) + '" cy="' + sy(W1) + '" r="2.5" fill="#16c491"/>' +
      '</svg>';
  }

  // ── Sơ đồ hình ảnh kho 8 cạnh (U-shape) — SVG vẽ động theo đúng tỷ lệ kích thước nhập ──
  function updateUshapeDiagram(g) {
    const svgWrap = document.getElementById('ushapeDiagramSvg');
    if (!svgWrap || g.shape !== 'ushape') return;
    const L1 = parseFloat(document.getElementById('us_L1').value) || 1;
    const W1 = parseFloat(document.getElementById('us_W1').value) || 1;
    const L3 = parseFloat(document.getElementById('us_L3').value) || 0;
    const W2 = parseFloat(document.getElementById('us_W2').value) || 0;
    if (L3 >= L1 || W2 >= W1 || L3 <= 0 || W2 <= 0) { svgWrap.innerHTML = ''; return; }

    const pad = 30;
    const maxW = 280 - pad * 2, maxH = 180 - pad * 2;
    const scale = Math.min(maxW / L1, maxH / W1);
    const sx = function (v) { return pad + v * scale; };
    const sy = function (v) { return pad + v * scale; };

    // Hốc khuyết cắt từ giữa cạnh trên (y=0 phía trên trong tọa độ màn hình), đối xứng theo trục giữa L1
    const mid = L1 / 2;
    const xL = mid - L3 / 2, xR = mid + L3 / 2;
    const pts = [
      [0, W1], [L1, W1], [L1, 0], [xR, 0], [xR, W2], [xL, W2], [xL, 0], [0, 0]
    ].map(function (p) { return sx(p[0]) + ',' + sy(p[1]); }).join(' ');

    svgWrap.innerHTML =
      '<svg viewBox="0 0 280 200" style="width:100%;max-width:280px;display:block;margin:0 auto">' +
      '<polygon points="' + pts + '" fill="rgba(6,182,212,0.10)" stroke="#06b6d4" stroke-width="2" stroke-linejoin="round"/>' +
      '<text x="' + (sx(L1 / 2)) + '" y="' + (sy(W1) + 16) + '" fill="#94a3b8" font-size="10" text-anchor="middle" font-family="monospace">L1=' + L1 + 'm</text>' +
      '<text x="' + (sx(0) - 6) + '" y="' + (sy(W1 / 2)) + '" fill="#94a3b8" font-size="10" text-anchor="end" font-family="monospace" transform="rotate(-90 ' + (sx(0) - 6) + ' ' + sy(W1 / 2) + ')">W1=' + W1 + 'm</text>' +
      '<text x="' + (sx(mid)) + '" y="' + (sy(0) - 6) + '" fill="#06b6d4" font-size="9" text-anchor="middle" font-family="monospace">L3=' + L3 + 'm</text>' +
      '<text x="' + (sx(xR) + 6) + '" y="' + (sy(W2 / 2) + 4) + '" fill="#06b6d4" font-size="9" text-anchor="start" font-family="monospace">W2=' + W2 + 'm</text>' +
      '<circle cx="' + sx(0) + '" cy="' + sy(W1) + '" r="2.5" fill="#16c491"/>' +
      '<circle cx="' + sx(L1) + '" cy="' + sy(W1) + '" r="2.5" fill="#16c491"/>' +
      '<circle cx="' + sx(L1) + '" cy="' + sy(0) + '" r="2.5" fill="#16c491"/>' +
      '<circle cx="' + sx(xR) + '" cy="' + sy(0) + '" r="2.5" fill="#f59e0b"/>' +
      '<circle cx="' + sx(xR) + '" cy="' + sy(W2) + '" r="2.5" fill="#f59e0b"/>' +
      '<circle cx="' + sx(xL) + '" cy="' + sy(W2) + '" r="2.5" fill="#f59e0b"/>' +
      '<circle cx="' + sx(xL) + '" cy="' + sy(0) + '" r="2.5" fill="#f59e0b"/>' +
      '<circle cx="' + sx(0) + '" cy="' + sy(0) + '" r="2.5" fill="#16c491"/>' +
      '</svg>';
  }

  function rebuildWallOverrides() {
    const g = App.calc.computeGeometry(readGeometryInput());
    const container = document.getElementById('wallTempOverrides');
    if (!container) return;
    if (!g.valid) { container.innerHTML = ''; return; }
    container.innerHTML = '<div class="sub-label" style="margin-top:0">' + t('wallTempOverridesLabel') + '</div>' +
      g.walls.map(function (w) {
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
          '<label style="flex:1;font-size:11px;color:var(--slate-500)">' + w.name + ' (' + w.area.toFixed(0) + ' m²)</label>' +
          '<input type="number" style="width:84px" id="extTemp_' + w.faceKey + '" placeholder="' + t('extTempPlaceholder') + '" step="0.5" oninput="CSHL_UI.scheduleAutoCalc()">' +
          '</div>';
      }).join('');
  }

  // ── Climate (63 provinces, QCVN 02:2022/BXD) ──
  async function renderClimateSection() {
    const provinces = await App.db.getAll('climateProvinces');
    const wrap = document.getElementById('climateProvinceWrap');
    if (!wrap) return;
    provinces.sort(function (a, b) { return a.name.localeCompare(b.name); });
    wrap.innerHTML = '<div class="field-full"><label>' + t('provinceSelectLabel') + '</label>' +
      '<select id="provinceSelect" onchange="CSHL_UI.onProvinceSelect()">' +
      provinces.map(function (p) { return '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>'; }).join('') +
      '</select></div>';
    onProvinceSelect(provinces[0] ? provinces[0].name : null);
  }
  async function onProvinceSelect(forcedName) {
    const sel = document.getElementById('provinceSelect');
    const name = forcedName || (sel ? sel.value : null);
    if (!name) return;
    const provinces = await App.db.getAll('climateProvinces');
    const p = provinces.find(function (x) { return x.name === name; });
    if (!p) return;
    document.getElementById('T_amb').value = p.T_design;
    document.getElementById('RH_amb').value = p.RH_design;
    lastProvinceBorrowedFrom = p.borrowed_from || null;
    const banner = document.getElementById('climateInfoBanner');
    if (banner) {
      banner.style.display = 'block';
      banner.className = 'info-banner info';
      let html = tf('climateBannerTemplate', { station: esc(p.station), T: esc(p.T_design), RH: esc(p.RH_design) });
      if (p.borrowed_from) html += tf('climateBorrowedTemplate', { province: esc(p.borrowed_from) });
      banner.innerHTML = html;
    }
    scheduleAutoCalc();
  }
  function onClimateModeChange() {
    const mode = document.getElementById('climateMode').value;
    document.getElementById('climateProvinceWrap2').style.display = mode === 'province' ? 'block' : 'none';
    const banner = document.getElementById('climateInfoBanner');
    if (mode === 'manual' && banner) banner.style.display = 'none';
    if (mode === 'province') renderClimateSection();
  }
  // ── Product selection ──
  async function onProductSelect(p) {
    currentProduct = p;
    document.getElementById('T_freeze').value = p.freezePoint != null ? p.freezePoint : -1;
    document.getElementById('latentHeat').value = p.latentHeat != null ? p.latentHeat : 0;
    document.getElementById('Cp_above').value = p.cpAbove != null ? p.cpAbove : 3.5;
    document.getElementById('Cp_below').value = p.cpBelow != null ? p.cpBelow : 1.9;
    const banner = document.getElementById('productInfoBanner');
    banner.style.display = 'block';
    banner.innerHTML = tf('productInfoTemplate', { name: esc(p.name), group: esc(p.group), moisture: esc(p.moisture), protein: esc(p.protein), fat: esc(p.fat) });
    updateRespirationNote();
    const storageModeSel = document.getElementById('storageCapacityMode');
    if (storageModeSel && storageModeSel.value === 'lowceiling') renderStorageModeFields();
    scheduleAutoCalc();
  }

  function updateRespirationNote() {
    const note = document.getElementById('respirationNote');
    if (!note || !currentProduct) return;
    const T_room = parseFloat(document.getElementById('T_room').value);
    const T_freeze = parseFloat(document.getElementById('T_freeze').value);
    const isLiving = currentProduct.group === 'Vegetables' || currentProduct.group === 'Fruits';
    const applies = isLiving && T_room > T_freeze;
    if (applies) {
      note.className = 'info-banner';
      note.innerHTML = tf('respApplies', { T: T_room, Tf: T_freeze });
    } else if (isLiving) {
      note.className = 'info-banner info';
      note.innerHTML = tf('respFrozen', { T: T_room, Tf: T_freeze });
    } else {
      note.className = 'info-banner info';
      note.innerHTML = tf('respNotApplicable', { group: esc(currentProduct.group) });
    }
  }

  async function onPanelMaterialChange() {
    const panels = await App.db.getAll('panelSpecs');
    const matSel = document.getElementById('panelMaterial');
    const spec = panels.find(function (p) { return p.material === matSel.value; });
    const thickSel = document.getElementById('panelThickness');
    const options = spec ? spec.thicknesses : [50, 75, 100, 125, 150, 180, 200];
    thickSel.innerHTML = options.map(function (th) { return '<option value="' + th + '"' + (th === 150 ? ' selected' : '') + '>' + th + ' mm</option>'; }).join('');
    scheduleAutoCalc();
  }

  // ── Storage capacity mode ──
  function renderStorageModeSelector() {
    const wrap = document.getElementById('storageModeWrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="field-full"><label>' + t('storageModeLabel') + '</label>' +
      '<select id="storageCapacityMode" onchange="CSHL_UI.renderStorageModeFields()">' +
      '<option value="pallet">' + t('storagePallet') + '</option>' +
      '<option value="manual">' + t('storageManual') + '</option></select></div>';
    renderStorageModeFields();
  }
  function renderStorageModeFields() {
    const modeSel = document.getElementById('storageCapacityMode');
    if (!modeSel) return;
    const fieldsWrap = document.getElementById('storageModeFields');
    const mode = modeSel.value;
    if (mode === 'lowceiling') {
      const prevMethodEl = document.getElementById('lowCeilingMethod');
      const selectedMethod = prevMethodEl ? prevMethodEl.value : 'pct45';
      fieldsWrap.innerHTML = '<div class="field-full"><label>' + t('fillMethodLabel') + '</label>' +
        '<select id="lowCeilingMethod" onchange="CSHL_UI.renderStorageModeFields()">' +
        '<option value="pct45"' + (selectedMethod === 'pct45' ? ' selected' : '') + '>' + t('fillSimple') + '</option>' +
        '<option value="ashrae"' + (selectedMethod === 'ashrae' ? ' selected' : '') + '>' + t('fillFAO') + '</option>' +
        '</select></div>' +
        (selectedMethod === 'ashrae' ? '<div class="field-full"><label>' + t('fillRatioLabel') + ' <span style="color:var(--slate-500)">' + t('fillRatioNote') + '</span></label>' +
          '<input type="number" id="ashraeFillPct" value="65" step="1" min="50" max="80" oninput="CSHL_UI.scheduleAutoCalc()"></div>' : '') +
        '<div class="field-full"><label>' + t('bulkDensityLabel') + '</label>' +
        '<input type="number" id="productBulkDensity" value="' + (currentProduct ? App.calc.getDefaultBulkDensity(currentProduct.group) : 350) + '" step="10" min="50" oninput="CSHL_UI.scheduleAutoCalc()">' +
        '<div class="moisture-note">' + tf('bulkDensityNoteTemplate', { group: currentProduct ? currentProduct.group : '—' }) + '</div></div>';
    } else if (mode === 'pallet') {
      fieldsWrap.innerHTML = '<div class="grid-2">' +
        '<div><div class="flabel">' + t('palletWeightLabel') + '</div><input type="number" id="palletWeight" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="10" min="100" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
        '<div><div class="flabel">' + t('palletCountLabel') + '</div><input type="number" id="palletCount" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="1" min="0" oninput="CSHL_UI.markPalletManual();CSHL_UI.scheduleAutoCalc()"></div></div>' +
        '<div id="rackLayoutTools"></div>';
      updateRackLayoutTools();
    } else {
      fieldsWrap.innerHTML = '<div class="field-full"><label>' + t('totalMassManualLabel') + '</label>' +
        '<input type="number" id="mass_total_manual" value="2528" step="10" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>';
    }
    scheduleAutoCalc();
  }
  function renderThroughputFields() {
    const mode = document.getElementById('throughputMode').value;
    const wrap = document.getElementById('throughputFields');
    if (mode === 'dock') {
      wrap.innerHTML = '<div class="grid-3" style="margin-top:8px">' +
        '<div><div class="flabel">' + t('nDocksLabel') + '</div><input type="number" id="nDocks" value="2" step="1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
        '<div><div class="flabel">' + t('tripsPerDockLabel') + '</div><input type="number" id="maxTripsPerDock" value="2" step="1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
        '<div><div class="flabel">' + t('tonPerTripLabel') + '</div><input type="number" id="tonPerTrip" value="25" step="1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div></div>';
    } else if (mode === 'turnoverPct') {
      wrap.innerHTML = '<div class="field-full" style="margin-top:8px"><label>' + t('turnoverPctLabel') + '</label>' +
        '<input type="number" id="turnoverPct" value="5" step="0.5" min="0" max="100" oninput="CSHL_UI.scheduleAutoCalc()"></div>';
    } else {
      wrap.innerHTML = '<div class="field-full" style="margin-top:8px"><label>' + t('massInManualLabel') + '</label>' +
        '<input type="number" id="mass_in_manual" value="50" step="1" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>';
    }
    scheduleAutoCalc();
  }
  function renderVaporModeFields() {
    const mode = document.getElementById('vaporInfiltrationMode').value;
    const wrap = document.getElementById('vaporModeFields');
    if (mode === 'joint') {
      wrap.innerHTML = '<div class="grid-2" style="margin-top:8px">' +
        '<div><div class="flabel">' + t('panelWidthLabel') + '</div><input type="number" id="panelWidthM" value="1.1" step="0.1" min="0.5" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
        '<div><div class="flabel">' + t('jointLengthLabel') + '</div><input type="number" id="jointLengthOverride" value="" step="1" min="0" placeholder="' + t('jointLengthPlaceholder') + '" oninput="CSHL_UI.scheduleAutoCalc()"></div></div>' +
        '<div><div class="flabel">' + t('jointLeakageLabel') + '</div><input type="number" id="jointLeakagePerM" value="0.15" step="0.01" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
        '<div class="moisture-note">' + t('jointLeakageNote') + '</div>';
    } else if (mode === 'panel_body') {
      wrap.innerHTML = '<div class="moisture-note">' + t('panelBodyNote') + '</div>';
    } else {
      wrap.innerHTML = '<div class="grid-2" style="margin-top:8px">' +
        '<div><div class="flabel">' + t('vaporAreaLabel') + '</div><input type="number" id="vapor_area" value="" step="1" min="0" placeholder="auto" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
        '<div><div class="flabel">' + t('permeanceLabel') + '</div><input type="number" id="vapor_perm" value="0.5" step="0.1" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div></div>';
    }
    scheduleAutoCalc();
  }

  // ── Openings (doors/vents) ──
  async function addOpening() {
    const doorTypes = await App.db.getAll('doorTypes');
    const id = openingIdCounter++;
    const first = doorTypes[0];
    openingsList.push({
      id: id, refType: first ? first.name : '', kind: 'door',
      w: 2.4, h: 4.5, count: 1, mechanism: 'air_exchange',
      openTimeSec: (first ? first.factor_s_per_m : 1) * 2.4, cyclesPerDay: 100, protectionEff: 0.5,
      hoursOpenPerDay: 24, avgVelocity: 1.2
    });
    renderOpeningsList();
  }
  async function renderOpeningsList() {
    const container = document.getElementById('openingsContainer');
    const doorTypes = await App.db.getAll('doorTypes');
    if (!openingsList.length) { container.innerHTML = '<div style="font-size:12px;color:var(--slate-500)">' + t('noOpeningsYet') + '</div>'; return; }
    container.innerHTML = openingsList.map(function (op) {
      const isVent = op.kind === 'vent';
      return '<div class="opening-row" data-id="' + op.id + '">' +
        '<button class="remove-btn" onclick="CSHL_UI.removeOpening(' + op.id + ')">✕</button>' +
        '<span class="opening-type-badge ' + (isVent ? 'badge-vent' : 'badge-door') + '">' + (isVent ? t('openingTypeVent') : t('openingTypeDoor')) + '</span>' +
        '<div class="grid-2" style="margin-bottom:6px">' +
        '<div style="grid-column:1/-1"><div class="flabel">' + t('openingTypeSelectLabel') + '</div>' +
        '<select onchange="CSHL_UI.onOpeningTypeChange(' + op.id + ', this.value)">' +
        doorTypes.map(function (d) { return '<option value="' + esc(d.name) + '"' + (d.name === op.refType ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') +
        '</select></div>' +
        '<div><div class="flabel">' + t('openingHeightLabel') + '</div><input type="number" step="0.1" value="' + op.h + '" onchange="CSHL_UI.updateOpeningField(' + op.id + ",'h',this.value)\"></div>" +
        '<div><div class="flabel">' + t('openingWidthLabel') + '</div><input type="number" step="0.1" value="' + op.w + '" onchange="CSHL_UI.updateOpeningField(' + op.id + ",'w',this.value)\"></div>" +
        '<div><div class="flabel">' + t('openingCountLabel') + '</div><input type="number" step="1" min="1" value="' + op.count + '" onchange="CSHL_UI.updateOpeningField(' + op.id + ",'count',this.value)\"></div>" +
        '</div>' +
        '<div class="grid-2" style="margin-bottom:6px">' +
        '<div><div class="flabel">' + t('mechanismLabel') + '</div><select onchange="CSHL_UI.updateOpeningField(' + op.id + ",'mechanism',this.value)\">" +
        '<option value="air_exchange"' + (op.mechanism === 'air_exchange' ? ' selected' : '') + '>' + t('mechanismAirExchange') + '</option>' +
        '<option value="flow"' + (op.mechanism === 'flow' ? ' selected' : '') + '>' + t('mechanismFlow') + '</option>' +
        '</select></div>' +
        (op.mechanism === 'air_exchange' ?
          '<div><div class="flabel">' + t('cyclesPerDayLabel') + '</div><input type="number" step="5" value="' + op.cyclesPerDay + '" onchange="CSHL_UI.updateOpeningField(' + op.id + ",'cyclesPerDay',this.value)\"></div>" +
          '<div><div class="flabel">' + t('openTimeSecLabel') + '</div><input type="number" step="0.25" value="' + op.openTimeSec + '" onchange="CSHL_UI.updateOpeningField(' + op.id + ",'openTimeSec',this.value)\"></div>" +
          '<div><div class="flabel">' + t('protectionEffLabel') + '</div><input type="number" step="0.05" min="0" max="1" value="' + op.protectionEff + '" onchange="CSHL_UI.updateOpeningField(' + op.id + ",'protectionEff',this.value)\"></div>" :
          '<div><div class="flabel">' + t('avgVelocityLabel') + '</div><input type="number" step="0.1" value="' + op.avgVelocity + '" onchange="CSHL_UI.updateOpeningField(' + op.id + ",'avgVelocity',this.value)\"></div>" +
          '<div><div class="flabel">' + t('hoursOpenLabel') + '</div><input type="number" step="1" min="0" max="24" value="' + op.hoursOpenPerDay + '" onchange="CSHL_UI.updateOpeningField(' + op.id + ",'hoursOpenPerDay',this.value)\"></div>") +
        '</div>' +
        (op.mechanism === 'flow' ? '<div class="moisture-note">' + t('empiricalRefNote') + '</div>' : '') +
        '</div>';
    }).join('');
  }
  async function onOpeningTypeChange(id, refName) {
    const doorTypes = await App.db.getAll('doorTypes');
    const spec = doorTypes.find(function (d) { return d.name === refName; });
    const op = openingsList.find(function (o) { return o.id === id; });
    if (!op || !spec) return;
    op.refType = refName;
    op.kind = (refName.indexOf('thông gió') >= 0 || refName.toLowerCase().indexOf('vent') >= 0) ? 'vent' : 'door';
    renderOpeningsList();
    scheduleAutoCalc();
  }
  function updateOpeningField(id, field, value) {
    const op = openingsList.find(function (o) { return o.id === id; });
    if (!op) return;
    const numFields = ['w', 'h', 'count', 'openTimeSec', 'cyclesPerDay', 'protectionEff', 'hoursOpenPerDay', 'avgVelocity'];
    op[field] = numFields.indexOf(field) >= 0 ? parseFloat(value) : value;
    if (field === 'mechanism') renderOpeningsList();
    scheduleAutoCalc();
  }
  function removeOpening(id) {
    openingsList = openingsList.filter(function (o) { return o.id !== id; });
    renderOpeningsList();
    scheduleAutoCalc();
  }

  // ── Tỷ lệ góc khuyết mặc định của app (dùng làm cơ sở co giãn theo diện tích mục tiêu
  // của từng preset loại kho) — diện tích gốc = 1000 m² cho cả 2 hình. ──
  const LSHAPE_BASE = { L1: 40, W1: 30, L3: 10, W2: 20, area: 1000 };
  const USHAPE_BASE = { L1: 40, W1: 30, L3: 20, W2: 10, area: 1000 };
  let activeWarehousePreset = null; // preset đang áp dụng (object) — dùng để re-áp khi đổi hình dạng

  // ── Áp kích thước cho ĐÚNG hình đang chọn, theo diện tích mục tiêu của preset.
  // Tách riêng để gọi lại được từ setShape() khi người dùng đổi hình SAU khi đã chọn loại kho —
  // trước đây chỉ áp lúc chọn preset nên đổi hình sau đó sẽ để trống, đây là lỗi đã sửa. ──
  function applyPresetGeometryForShape(preset, shape) {
    const targetArea = preset.suggestedL * preset.suggestedW;
    if (shape === 'rect') {
      document.getElementById('L').value = preset.suggestedL;
      document.getElementById('W').value = preset.suggestedW;
    } else if (shape === 'lshape') {
      const k = Math.sqrt(targetArea / LSHAPE_BASE.area);
      document.getElementById('ls_L1').value = (LSHAPE_BASE.L1 * k).toFixed(1);
      document.getElementById('ls_W1').value = (LSHAPE_BASE.W1 * k).toFixed(1);
      document.getElementById('ls_L3').value = (LSHAPE_BASE.L3 * k).toFixed(1);
      document.getElementById('ls_W2').value = (LSHAPE_BASE.W2 * k).toFixed(1);
    } else if (shape === 'ushape') {
      const k = Math.sqrt(targetArea / USHAPE_BASE.area);
      document.getElementById('us_L1').value = (USHAPE_BASE.L1 * k).toFixed(1);
      document.getElementById('us_W1').value = (USHAPE_BASE.W1 * k).toFixed(1);
      document.getElementById('us_L3').value = (USHAPE_BASE.L3 * k).toFixed(1);
      document.getElementById('us_W2').value = (USHAPE_BASE.W2 * k).toFixed(1);
    }
    updateGeomSummary();
    rebuildWallOverrides();
  }

  let rackOrientation = 'L_along'; // 'L_along': L dọc theo dãy kệ, W cắt ngang lối đi | 'W_along': ngược lại
  let lastPalletMethod = 'manual'; // 'rackLayout' | 'density' | 'manual' — dùng để ghi chú trong báo cáo
  let lastLightingMethod = 'manual'; // 'autoHeight' | 'manual' — dùng để ghi chú trong báo cáo
  let lastRackLayoutTooSmall = false; // true nếu lần tính rack-layout gần nhất phát hiện phòng quá nhỏ so với module kệ

  // ── Công cụ bố trí kệ: cho phép chọn linh động trục nào là "dọc theo dãy kệ" và trục nào là
  // "cắt ngang qua lối đi" — thay vì mặc định cứng 1 chiều, vì thực tế quy hoạch kho thường chọn
  // hướng linh hoạt theo hình dạng mặt bằng để tối ưu, hạn chế phần dư thừa lối đi.
  // Chỉ áp dụng khi đang chọn preset Kho cao/ASRS VÀ đang ở hình chữ nhật (rack layout chi tiết
  // chưa hỗ trợ hình 6/8 cạnh). Tự tính lại mỗi khi đổi L/W/H hoặc đổi hướng. ──
  async function updateRackLayoutTools() {
    const wrap = document.getElementById('rackLayoutTools');
    if (!wrap) return;
    const eligible = currentShape === 'rect' && activeWarehousePreset &&
      (activeWarehousePreset.name === 'rack' || activeWarehousePreset.name === 'asrs');
    if (!eligible) { wrap.innerHTML = ''; return; }

    let cfg = App.calc.DEFAULT_RACK_LAYOUT;
    try {
      const configs = await App.db.getAll('rackLayoutConfig');
      const found = configs.find(function (c) { return c.name === 'default'; });
      if (found) cfg = found;
    } catch (e) { /* dùng mặc định nếu chưa có Database */ }

    const L = parseFloat(document.getElementById('L').value) || 0;
    const W = parseFloat(document.getElementById('W').value) || 0;
    const H = parseFloat(document.getElementById('H').value) || 0;
    const along = rackOrientation === 'L_along' ? L : W;
    const across = rackOrientation === 'L_along' ? W : L;
    const layout = App.calc.computeAutoPalletCapacity(along, across, H, cfg);

    const tooSmall = layout.rows < 2 || layout.baysPerRow < 2 || layout.levels < 1 || layout.total === 0;

    wrap.innerHTML =
      '<div class="field-full"><label>' + t('rackOrientationLabel') + '</label>' +
      '<select id="rackOrientationSelect" onchange="CSHL_UI.onRackOrientationChange(this.value)">' +
      '<option value="L_along"' + (rackOrientation === 'L_along' ? ' selected' : '') + '>' + t('rackOrientationLAlong') + '</option>' +
      '<option value="W_along"' + (rackOrientation === 'W_along' ? ' selected' : '') + '>' + t('rackOrientationWAlong') + '</option>' +
      '</select></div>' +
      '<div class="moisture-note">' + tf('rackLayoutInfoTemplate', { rows: layout.rows, bays: layout.baysPerRow, levels: layout.levels, total: layout.total }) + '</div>' +
      '<div class="moisture-note">' + t('empiricalRefNote') + '</div>' +
      (tooSmall ? '<div class="info-banner warn" style="font-size:11px;margin-top:6px">' + t('rackLayoutTooSmallWarning') + '</div>' : '');

    const pcEl = document.getElementById('palletCount');
    if (pcEl) { pcEl.value = layout.total; lastPalletMethod = 'rackLayout'; }
    lastRackLayoutTooSmall = tooSmall;
  }

  function onRackOrientationChange(v) {
    rackOrientation = v;
    updateRackLayoutTools();
    scheduleAutoCalc();
  }
  function markPalletManual() { lastPalletMethod = 'manual'; }
  function markLightingManual() { lastLightingMethod = 'manual'; }

  // ── Tự tính lại mật độ chiếu sáng theo chiều cao (piecewise linear — xem calc.js) mỗi khi
  // H thay đổi, TRỪ KHI người dùng đã tự sửa tay mật độ (lastLightingMethod === 'manual') —
  // giống cơ chế đã áp dụng cho sức chứa pallet theo bố trí kệ. ──
  function updateLightingDensityFromHeight() {
    const hEl = document.getElementById('H');
    const lwEl = document.getElementById('lightingWm2');
    const hintEl = document.getElementById('lightingAutoHint');
    if (!hEl || !lwEl) return;
    const H = parseFloat(hEl.value);
    if (!H || H <= 0) { if (hintEl) hintEl.textContent = ''; return; }
    if (lastLightingMethod !== 'manual') {
      const density = App.calc.computeLightingDensityByHeight(H);
      lwEl.value = density.toFixed(2);
      lastLightingMethod = 'autoHeight';
    }
    if (hintEl) hintEl.textContent = tf('lightingAutoHintText', { h: H.toFixed(1) });
  }
  // Nếu người dùng tự gõ tay giờ chiếu sáng, tự bỏ tick "đồng bộ" — tránh app âm thầm ghi đè
  // lại giá trị họ vừa sửa ở lần tính tiếp theo.
  function onTLightsManualChange() {
    const syncEl = document.getElementById('syncLightingHours');
    if (syncEl) syncEl.checked = false;
  }

  // ── Áp dụng preset cấu hình TOÀN DIỆN theo loại kho (mục "Loại kho"): hình học, sức chứa
  // (theo mật độ pallet/m²/tầng), dàn lạnh/quạt, số người, xe nâng, và cửa/lỗ mở.
  // Với mục có isStackEffect (rò rỉ vỏ bao che do chênh áp cột khí — dùng cho kho ASRS rất cao):
  // tái sử dụng ĐÚNG công thức Gosney-Olama đã có (airExchangeLoad), chỉ khác là H = chiều cao
  // TOÀN kho (không phải chiều cao 1 cánh cửa) và diện tích = ước tính rò rỉ (0.05% tổng diện
  // tích tường+mái) — đây là giá trị THAM KHẢO, không phải hệ số ASHRAE chính thức cho mục này.
  async function onWarehousePresetChange(key) {
    const sel = document.getElementById('warehouseTypePreset');
    const note = document.getElementById('warehousePresetNote');
    if (!key) {
      activeWarehousePreset = null;
      updateRackLayoutTools();
      if (note) { note.className = 'info-banner info'; note.textContent = t('warehouseTypeChooseHint'); }
      return;
    }
    const ok = await App.Modal.confirm(t('warehousePresetConfirmTitle'), t('warehousePresetConfirmDesc'));
    if (!ok) { sel.value = ''; return; }

    const presets = await App.db.getAll('warehouseTypePresets');
    const preset = presets.find(function (p) { return p.name === key; });
    if (!preset) return;
    activeWarehousePreset = preset;

    // ── 1) Chiều cao + diện tích sàn (áp đúng theo hình đang chọn: chữ nhật/6 cạnh/8 cạnh) ──
    const hEl = document.getElementById('H');
    if (hEl) hEl.value = preset.suggestedH;
    const targetArea = preset.suggestedL * preset.suggestedW;
    applyPresetGeometryForShape(preset, currentShape);

    // ── 2) Sức chứa: dùng công thức nội suy chính xác theo bố trí kệ đôi (rack/ASRS, hình chữ
    // nhật, có dropdown chọn hướng bố trí — xem updateRackLayoutTools) — nếu không áp dụng được
    // (kho chất tay không có kệ, hành lang không lưu trữ, hoặc đang ở hình 6/8 cạnh chưa hỗ trợ
    // bố trí kệ chi tiết), dùng lại công thức mật độ cũ. ──
    const modeSel = document.getElementById('storageCapacityMode');
    if (modeSel) { modeSel.value = 'pallet'; renderStorageModeFields(); } // gọi updateRackLayoutTools() nếu đủ điều kiện
    const useRackLayout = (key === 'rack' || key === 'asrs') && currentShape === 'rect';
    if (!useRackLayout) {
      const palletCount = Math.round(targetArea * preset.densityPerM2PerLevel * (preset.levels || 1));
      const pcEl = document.getElementById('palletCount'); if (pcEl) pcEl.value = palletCount;
      lastPalletMethod = 'density';
    }
    const pwEl = document.getElementById('palletWeight'); if (pwEl) pwEl.value = pwEl.value || 750;

    // ── 3) Dàn lạnh / quạt / số người / chiếu sáng (theo mật độ W/m² kinh nghiệm thực tế) ──
    if (preset.n_evap !== undefined) { const el = document.getElementById('n_evap'); if (el) el.value = preset.n_evap; }
    if (preset.fan_per_evap !== undefined) { const el = document.getElementById('fan_per_evap'); if (el) el.value = preset.fan_per_evap; }
    if (preset.kw_fan !== undefined) { const el = document.getElementById('kw_fan'); if (el) el.value = preset.kw_fan; }
    if (preset.n_people !== undefined) { const el = document.getElementById('n_people'); if (el) el.value = preset.n_people; }
    // Mật độ chiếu sáng: tính tự động theo chiều cao vừa áp (piecewise, xem calc.js) — reset về
    // chế độ auto dù trước đó người dùng có từng sửa tay, vì đây là hành động chọn preset mới rõ ràng.
    lastLightingMethod = 'autoHeight';
    updateLightingDensityFromHeight();

    // ── 4) Lọc + đặt mặc định xe nâng nội bộ theo loại kho (vd: ASRS chỉ có robot, không có forklift) ──
    if (preset.internalVehicleAllowed) {
      const vehicles = await App.db.getAll('vehicles');
      const vSel = document.getElementById('internalVehicleType');
      if (vSel) {
        vSel.innerHTML = vehicles
          .filter(function (v) { return v.type === 'internal' && preset.internalVehicleAllowed.indexOf(v.name) >= 0; })
          .map(function (v) { return '<option value="' + esc(v.name) + '">' + esc(v.name) + '</option>'; })
          .join('');
        if (preset.internalVehicleDefault) vSel.value = preset.internalVehicleDefault;
      }
    }
    if (preset.n_forklift_internal !== undefined) {
      const el = document.getElementById('n_forklift_internal'); if (el) el.value = preset.n_forklift_internal;
    }

    // ── 5) Cửa / lỗ mở — tính lại diện tích rò rỉ cho mục stack-effect dựa trên hình học vừa set ──
    let envelopeArea = 0;
    try {
      const geomInput = readGeometryInput();
      const g = App.calc.computeGeometry(geomInput);
      if (g.valid) envelopeArea = g.walls.reduce(function (s, w) { return s + w.area; }, 0) + g.area;
    } catch (e) { envelopeArea = 0; }

    openingsList = preset.openings.map(function (o, idx) {
      let w = o.w, h = o.h;
      if (o.isStackEffect) {
        h = preset.suggestedH;
        const leakArea = Math.max(envelopeArea, 0) * 0.0005; // 0.05% tổng diện tích bao che — THAM KHẢO
        w = h > 0 ? leakArea / h : 0.1;
      }
      w = Math.round(w * 100) / 100; // làm tròn chiều rộng cửa 2 chữ số thập phân
      return {
        id: idx + 1, refType: o.doorType, kind: 'door',
        w: w, h: h, count: o.count, mechanism: o.mechanism,
        cyclesPerDay: o.cyclesPerDay, openTimeSec: o.openTimeSec, protectionEff: o.protectionEff,
        hoursOpenPerDay: 24, avgVelocity: 1.2
      };
    });
    openingIdCounter = openingsList.length + 1;

    if (note) { note.className = 'info-banner warn'; note.textContent = t('warehousePresetAppliedNote'); }

    await renderOpeningsList();
    if (window.lucide) lucide.createIcons();
    scheduleAutoCalc();
  }

  // ── Auto-calc debounce (real-time, không cần nút reload) ──
  let autoCalcTimer = null;
  function scheduleAutoCalc() {
    clearTimeout(autoCalcTimer);
    autoCalcTimer = setTimeout(function () { calculate(); }, 350);
  }
  // ── Main input panel render ──
  // ── Biến các đầu mục lớn (.panel-section / .result-section) thành accordion gấp gọn được.
  // Header luôn là phần tử ĐẦU TIÊN trong mỗi section (section-label hoặc result-section-header);
  // hàm này gom mọi phần còn lại vào 1 wrapper "-body" rồi gắn sự kiện click vào header để toggle.
  // Mặc định mọi section GẤP GỌN khi khởi tạo — bấm vào tiêu đề để mở ra.
  // stateStore (tuỳ chọn): object lưu trạng thái mở/đóng theo text tiêu đề, dùng cho results-panel
  // vì panel này bị render lại toàn bộ (innerHTML) mỗi lần auto-calc — nếu không lưu state riêng,
  // section đang mở xem sẽ tự đóng lại mỗi 350ms khi người dùng gõ tiếp.
  // defaultExpandedIndexes (tuỳ chọn, chỉ áp dụng khi KHÔNG có stateStore): mảng chỉ số section
  // (0-based, theo thứ tự xuất hiện) sẽ mở sẵn thay vì gấp gọn — dùng cho input-panel để mở sẵn
  // đúng 2 mục là điểm bắt đầu thực sự của luồng làm việc (Thông tin dự án, Loại kho), tránh
  // người dùng mới mở app lên thấy toàn bộ gấp gọn không biết bắt đầu từ đâu. ──
  function enhanceCollapsibleSections(rootEl, sectionSelector, headerSelector, bodyClass, stateStore, defaultExpandedIndexes) {
    if (!rootEl) return;
    rootEl.querySelectorAll(sectionSelector).forEach(function (section, idx) {
      const header = section.querySelector(headerSelector);
      if (!header || header.dataset.collapsibleInit === '1') return;
      if (header.parentElement !== section) return; // chỉ xử lý header trực tiếp của chính section này
      header.dataset.collapsibleInit = '1';

      const body = document.createElement('div');
      body.className = bodyClass;
      const rest = [];
      let node = header.nextSibling;
      while (node) { rest.push(node); node = node.nextSibling; }
      rest.forEach(function (n) { body.appendChild(n); });
      section.appendChild(body);

      const key = header.textContent.trim();
      const forceExpanded = !stateStore && defaultExpandedIndexes && defaultExpandedIndexes.indexOf(idx) >= 0;
      const isCollapsed = stateStore ? (stateStore[key] !== false) : !forceExpanded;
      if (isCollapsed) section.classList.add('collapsed');
      if (stateStore && !(key in stateStore)) stateStore[key] = true;

      header.classList.add('collapsible-header');
      const chevron = document.createElement('i');
      chevron.setAttribute('data-lucide', 'chevron-down');
      chevron.className = 'collapse-chevron';
      header.appendChild(chevron);
      header.addEventListener('click', function () {
        const nowCollapsed = section.classList.toggle('collapsed');
        if (stateStore) stateStore[key] = nowCollapsed;
      });
    });
    if (window.lucide) lucide.createIcons();
  }
  const resultSectionCollapseState = {};

  async function renderInputPanel() {
    const materials = await App.db.getAll('materials');
    const vehicles = await App.db.getAll('vehicles');
    const panel = document.getElementById('inputPanel');

    panel.innerHTML =
      '<div class="panel-group">' +
      '<div class="panel-section"><div class="section-label"><i data-lucide="folder-open"></i>' + t('secProject') + '</div>' +
      '<div class="field-full"><label>' + t('roomNameLabel') + '</label><input type="text" id="roomName" value="' + (CSHL_I18N.getLang() === 'en' ? 'Cold Room 1' : 'Kho lạnh 1') + '" oninput="CSHL_UI.scheduleAutoCalc()"></div></div>' +

      '<div class="panel-section"><div class="section-label"><i data-lucide="warehouse"></i>' + t('secWarehouseType') + '</div>' +
      '<div class="field-full"><label>' + t('warehouseTypeLabel') + '</label>' +
      '<select id="warehouseTypePreset" onchange="CSHL_UI.onWarehousePresetChange(this.value)">' +
      '<option value="">' + t('warehouseTypeCustom') + '</option>' +
      '<option value="bulk">' + t('warehouseTypeBulk') + '</option>' +
      '<option value="rack">' + t('warehouseTypeRack') + '</option>' +
      '<option value="asrs">' + t('warehouseTypeAsrs') + '</option>' +
      '<option value="corridor">' + t('warehouseTypeCorridor') + '</option>' +
      '</select></div>' +
      '<div id="warehousePresetNote" class="info-banner info" style="display:block;font-size:11px">' + t('warehouseTypeChooseHint') + '</div></div>' +

      '<div class="panel-section"><div class="section-label"><i data-lucide="cloud-sun"></i>' + t('secClimate') + '</div>' +
      '<div class="field-full"><label>' + t('climateSourceLabel') + '</label>' +
      '<select id="climateMode" onchange="CSHL_UI.onClimateModeChange()">' +
      '<option value="province">' + t('climateProvince') + '</option>' +
      '<option value="manual">' + t('climateManual') + '</option></select></div>' +
      '<div id="climateProvinceWrap2"><div id="climateProvinceWrap"></div></div>' +
      '<div id="climateInfoBanner" class="info-banner info" style="display:none"></div></div>' +
      '</div>' +

      '<div class="panel-group">' +
      '<div class="panel-group-title"><i data-lucide="ruler"></i>Hình học · Nhiệt độ thiết kế · Cách nhiệt</div>' +
      '<div class="panel-section"><div class="section-label"><i data-lucide="ruler"></i>' + t('secGeom') + '</div>' +
      '<div class="shape-grid">' +
      '<div class="shape-btn active" id="shapeRect" onclick="CSHL_UI.setShape(\'rect\')"><i data-lucide="square" class="icon-shape"></i><span>' + t('shapeRect') + '</span></div>' +
      '<div class="shape-btn" id="shapeLshape" onclick="CSHL_UI.setShape(\'lshape\')"><i data-lucide="shapes" class="icon-shape"></i><span>' + t('shapeLshape') + '</span></div>' +
      '<div class="shape-btn" id="shapeUshape" onclick="CSHL_UI.setShape(\'ushape\')"><i data-lucide="shapes" class="icon-shape"></i><span>' + t('shapeUshape') + '</span></div>' +
      '</div>' +
      '<div class="dims-rect active" id="dimsRect"><div class="grid-2" style="margin-bottom:8px">' +
      '<div><div class="flabel">' + t('lengthL') + '</div><input type="number" id="L" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('widthW') + '</div><input type="number" id="W" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div></div></div>' +
      '<div class="dims-lshape" id="dimsLshape">' +
      '<div id="lshapeDiagramSvg" style="margin-bottom:10px"></div>' +
      '<div class="grid-2" style="margin-bottom:8px">' +
      '<div><div class="flabel">' + t('ls_L1') + '</div><input type="number" id="ls_L1" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('ls_W1') + '</div><input type="number" id="ls_W1" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('ls_L3') + '</div><input type="number" id="ls_L3" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.1" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('ls_W2') + '</div><input type="number" id="ls_W2" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.1" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div></div>' +
      '<div id="lshapeValid" class="info-banner" style="display:none"></div></div>' +
      '<div class="dims-lshape" id="dimsUshape">' +
      '<div id="ushapeDiagramSvg" style="margin-bottom:10px"></div>' +
      '<div class="grid-2" style="margin-bottom:8px">' +
      '<div><div class="flabel">' + t('us_L1') + '</div><input type="number" id="us_L1" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('us_W1') + '</div><input type="number" id="us_W1" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('us_L3') + '</div><input type="number" id="us_L3" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.1" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('us_W2') + '</div><input type="number" id="us_W2" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.1" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div></div>' +
      '<div id="ushapeValid" class="info-banner" style="display:none"></div></div>' +
      '<div><div class="flabel">' + t('heightH') + '</div><input type="number" id="H" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div id="geomSummary" style="margin-top:8px;font-family:var(--font-mono);font-size:11px;color:var(--slate-500)"></div></div>' +

      '<div class="panel-section"><div class="section-label"><i data-lucide="thermometer"></i>' + t('secTemp') + '</div>' +
      '<div class="grid-2">' +
      '<div><div class="flabel">' + t('T_amb') + '</div><input type="number" id="T_amb" value="35" step="0.5" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('RH_amb') + '</div><input type="number" id="RH_amb" value="85" step="1" min="0" max="100" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('T_room') + '</div><input type="number" id="T_room" value="-25" step="0.5" oninput="CSHL_UI.updateRespirationNote();CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('RH_room') + '</div><input type="number" id="RH_room" value="90" step="1" min="0" max="100" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('T_roof') + '</div><input type="number" id="T_roof" value="45" step="0.5" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('T_floor') + '</div><input type="number" id="T_floor" value="30" step="0.5" oninput="CSHL_UI.scheduleAutoCalc()"></div></div>' +
      '<div id="wallTempOverrides" style="margin-top:10px"></div></div>' +

      '<div class="panel-section"><div class="section-label"><i data-lucide="layers"></i>' + t('secInsulation') + '</div>' +
      '<div class="sub-label">' + t('subWallCeiling') + '</div>' +
      '<div class="grid-2" style="margin-bottom:8px">' +
      '<div><div class="flabel">' + t('coreMaterialLabel') + '</div><select id="panelMaterial" onchange="CSHL_UI.onPanelMaterialChange()">' +
      materials.filter(function (m) { return ['Tole', 'Cement', 'Craft', 'Bitum', 'Sus 304', 'None'].indexOf(m.name) === -1; })
        .map(function (m) { return '<option value="' + esc(m.name) + '"' + (m.name === 'Polyisocyanurate (PIR)' ? ' selected' : '') + '>' + esc(m.name) + ' (k=' + esc(m.k) + ')</option>'; }).join('') +
      '</select></div><div><div class="flabel">' + t('thicknessLabel') + '</div><select id="panelThickness" onchange="CSHL_UI.scheduleAutoCalc()"></select></div></div>' +
      '<div class="sub-label">' + t('subFloor') + '</div><div class="grid-2">' +
      '<div><div class="flabel">' + t('floorCoreMaterialLabel') + '</div><select id="floorMaterial" onchange="CSHL_UI.scheduleAutoCalc()">' +
      '<option value="Extruded Polystyrene (XPS)" selected>XPS (k=0.0289)</option>' +
      '<option value="Polyisocyanurate (PIR)">PIR (k=0.021)</option>' +
      '<option value="Polyurethane (PU)">PU (k=0.023)</option></select></div>' +
      '<div><div class="flabel">' + t('floorThicknessLabel') + '</div><input type="number" id="floorThickness" value="150" step="10" min="50" oninput="CSHL_UI.scheduleAutoCalc()"></div></div>' +
      '<div style="margin-top:8px"><div class="flabel">' + t('safetyFactorLabel') + '</div><input type="number" id="safety" value="10" step="1" min="0" max="30" oninput="CSHL_UI.scheduleAutoCalc()"></div></div>' +
      '</div>' +

      '<div class="panel-group">' +
      '<div class="panel-group-title"><i data-lucide="package"></i>Sản phẩm · Vận hành kho</div>' +
      '<div class="panel-section"><div class="section-label"><i data-lucide="package"></i>' + t('secProduct') + '</div>' +
      '<div class="field-full"><label>' + t('productGroupLabel') + '</label>' +
      '<select id="productGroupFilter" onchange="CSHL_UI.onProductGroupChange()"><option value="">' + t('productGroupAll') + '</option></select></div>' +
      '<div class="field-full"><label>' + t('productLabel') + '</label>' + buildCombo('productCombo', 'productSearchPlaceholder') + '</div>' +
      '<div id="productInfoBanner" class="info-banner info" style="display:none"></div>' +
      '<div class="grid-2" style="margin-bottom:8px">' +
      '<div><div class="flabel">' + t('T_inLabel') + '</div><input type="number" id="T_in" value="-15" step="0.5" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('T_finalLabel') + '</div><input type="number" id="T_final" value="-25" step="0.5" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('T_freezeLabel') + '</div><input type="number" id="T_freeze" value="" step="0.1" readonly style="background:var(--slate-850);color:var(--slate-400);cursor:not-allowed"></div>' +
      '<div><div class="flabel">' + t('latentHeatLabel') + '</div><input type="number" id="latentHeat" value="" step="1" readonly style="background:var(--slate-850);color:var(--slate-400);cursor:not-allowed"></div>' +
      '<div><div class="flabel">' + t('cpAboveLabel') + '</div><input type="number" id="Cp_above" value="" step="0.01" readonly style="background:var(--slate-850);color:var(--slate-400);cursor:not-allowed"></div>' +
      '<div><div class="flabel">' + t('cpBelowLabel') + '</div><input type="number" id="Cp_below" value="" step="0.01" readonly style="background:var(--slate-850);color:var(--slate-400);cursor:not-allowed"></div></div>' +
      '<div class="moisture-note" style="margin-bottom:8px">' + t('productParamsSourceNote') + '</div>' +
      '<div><div class="flabel">' + t('pulldownLabel') + '</div><input type="number" id="pulldown" value="18" step="1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div class="info-banner ok" id="respirationNote" style="margin-top:8px;font-size:11px"></div></div>' +

      '<div class="panel-section"><div class="section-label"><i data-lucide="boxes"></i>' + t('secStorage') + '</div>' +
      '<div id="storageModeWrap"></div><div id="storageModeFields" style="margin-top:8px"></div></div>' +

      '<div class="panel-section"><div class="section-label"><i data-lucide="truck"></i>' + t('secThroughput') + '</div>' +
      '<div class="field-full"><label>' + t('throughputModeLabel') + '</label><select id="throughputMode" onchange="CSHL_UI.renderThroughputFields()">' +
      '<option value="dock">' + t('throughputDock') + '</option>' +
      '<option value="turnoverPct">' + t('throughputPct') + '</option>' +
      '<option value="manual">' + t('throughputManual') + '</option></select></div><div id="throughputFields"></div></div>' +
      '</div>' +

      '<div class="panel-group">' +
      '<div class="panel-group-title"><i data-lucide="zap"></i>Tải nhiệt phụ</div>' +
      '<div class="panel-section"><div class="section-label"><i data-lucide="door-open"></i>' + t('secOpenings') + '</div>' +
      '<div id="openingsContainer"></div><button class="add-btn" onclick="CSHL_UI.addOpening()">+ ' + t('addOpeningBtn') + '</button></div>' +

      '<div class="panel-section"><div class="section-label"><i data-lucide="users"></i>' + t('secInternal') + '</div>' +
      '<div class="grid-2" style="margin-bottom:8px">' +
      '<div><div class="flabel">' + t('nPeopleLabel') + '</div><input type="number" id="n_people" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="1" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('tPeopleLabel') + '</div><input type="number" id="t_people" value="8" step="0.1" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('lightingWm2Label') + '</div><input type="number" id="lightingWm2" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.1" min="0" oninput="CSHL_UI.markLightingManual();CSHL_UI.scheduleAutoCalc()">' +
      '<div id="lightingAutoHint" class="moisture-note" style="margin-top:4px"></div></div>' +
      '<div style="grid-column:1/-1"><div class="flabel">' + t('tLightsLabel') + '</div>' +
      '<input type="number" id="t_lights" value="5.9" step="0.1" min="0" oninput="CSHL_UI.onTLightsManualChange();CSHL_UI.scheduleAutoCalc()">' +
      '<label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:var(--slate-400);cursor:pointer">' +
      '<input type="checkbox" id="syncLightingHours" checked style="width:auto" onchange="CSHL_UI.scheduleAutoCalc()">' + t('syncLightingHoursLabel') + '</label></div>' +
      '<div class="sub-label">' + t('subInternalVehicle') + '</div>' +
      '<div class="grid-2" style="margin-bottom:6px">' +
      '<div><div class="flabel">' + t('vehicleTypeLabel') + '</div><select id="internalVehicleType" onchange="CSHL_UI.scheduleAutoCalc()">' +
      vehicles.filter(function (v) { return v.type === 'internal'; }).map(function (v) { return '<option value="' + esc(v.name) + '">' + esc(v.name) + '</option>'; }).join('') +
      '</select></div><div><div class="flabel">' + t('vehicleCountLabel') + '</div><input type="number" id="n_forklift_internal" value="1" step="1" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div></div>' +
      '<div class="sub-label">' + t('subDockVehicle') + '</div>' +
      '<div class="grid-2">' +
      '<div><div class="flabel">' + t('vehicleTypeLabel') + '</div><select id="dockVehicleType" onchange="CSHL_UI.scheduleAutoCalc()">' +
      vehicles.filter(function (v) { return v.type === 'dock'; }).map(function (v) { return '<option value="' + esc(v.name) + '">' + esc(v.name) + '</option>'; }).join('') +
      '</select></div><div><div class="flabel">' + t('vehicleCountLabel') + '</div><input type="number" id="n_forklift_dock" value="1" step="1" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div></div>' +
      '<div class="moisture-note">' + t('empiricalRefNote') + '</div>' +
      '<div style="margin-top:8px"><label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--slate-400)"><input type="checkbox" id="includePackingInternalLoad" checked onchange="CSHL_UI.scheduleAutoCalc()" style="width:auto;min-height:auto">' + t('includePackingCheckbox') + '</label></div></div>' +
      '</div>' +

      '<div class="panel-group">' +
      '<div class="panel-group-title"><i data-lucide="wind"></i>Dàn lạnh · Độ ẩm · Vận hành</div>' +
      '<div class="panel-section"><div class="section-label"><i data-lucide="wind"></i>' + t('secEvap') + '</div>' +
      '<div class="grid-2">' +
      '<div><div class="flabel">' + t('nEvapLabel') + '</div><input type="number" id="n_evap" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('fanPerEvapLabel') + '</div><input type="number" id="fan_per_evap" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="1" min="1" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('kwFanLabel') + '</div><input type="number" id="kw_fan" value="" placeholder="' + t('blankFieldPlaceholder') + '" step="0.05" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('tFanLabel') + '</div><input type="number" id="t_fan" value="23" step="0.5" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('defrostTimesLabel') + '</div><input type="number" id="defrost_times" value="2" step="1" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('defrostDurationLabel') + '</div><input type="number" id="defrost_duration" value="25" step="5" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('heaterPerEvapLabel') + '</div><input type="number" id="heater_per_evap" value="2" step="1" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('kwHeaterLabel') + '</div><input type="number" id="kw_heater" value="0.25" step="0.05" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div></div></div>' +

      '<div class="panel-section"><div class="section-label"><i data-lucide="droplets"></i>' + t('secMoisture') + '</div>' +
      '<div class="info-banner info" style="font-size:11px">' + t('moistureInfoBanner') + '</div>' +
      '<div class="field-full"><label>' + t('vaporModeLabel') + '</label>' +
      '<select id="vaporInfiltrationMode" onchange="CSHL_UI.renderVaporModeFields()">' +
      '<option value="joint">' + t('vaporJoint') + '</option>' +
      '<option value="panel_body">' + t('vaporPanelBody') + '</option>' +
      '<option value="manual">' + t('vaporManual') + '</option></select></div>' +
      '<div id="vaporModeFields"></div>' +
      '<div class="grid-2" style="margin-top:8px">' +
      '<div><div class="flabel">' + t('airExchangeLabel') + '</div><input type="number" id="air_exchange" value="1" step="0.5" min="0" oninput="CSHL_UI.scheduleAutoCalc()"></div>' +
      '<div><div class="flabel">' + t('airExchangePctLabel') + '</div><input type="number" id="air_exchange_pct" value="100" step="5" min="0" max="100" oninput="CSHL_UI.scheduleAutoCalc()"></div></div></div>' +

      '<div class="panel-section"><div class="section-label"><i data-lucide="clock"></i>' + t('secOperation') + '</div>' +
      '<div><div class="flabel">' + t('runtimeLabel') + '</div><input type="number" id="runtime" value="24" step="1" min="1" max="24" oninput="CSHL_UI.scheduleAutoCalc()"></div></div>' +
      '</div>';

    ['L', 'W', 'H', 'ls_L1', 'ls_W1', 'ls_L3', 'ls_W2'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', function () {
        updateGeomSummary(); rebuildWallOverrides();
        if (id === 'H') { renderStorageModeSelector(); updateLightingDensityFromHeight(); } else updateRackLayoutTools();
      });
    });

    const products = await App.db.getAll('products');
    const productGroups = Array.from(new Set(products.map(function (p) { return p.group; }).filter(Boolean))).sort();
    const groupSel = document.getElementById('productGroupFilter');
    if (groupSel) {
      groupSel.innerHTML = '<option value="">' + t('productGroupAll') + '</option>' +
        productGroups.map(function (g) { return '<option value="' + esc(g) + '">' + esc(g) + '</option>'; }).join('');
    }
    registerCombo('productCombo', products, {
      labelFn: function (x) { return x.name; },
      metaFn: function (x) { return t('freezePointAbbr') + '=' + (x.freezePoint != null ? x.freezePoint : '—') + '°C'; },
      groupFn: function (x) { return x.group; },
      groupFilterId: 'productGroupFilter',
      onSelect: onProductSelect
    });
    // [Yêu cầu] Để trống loại sản phẩm theo mặc định — kỹ sư chọn tay theo từng dự án thực tế,
    // tránh trường hợp số liệu mặc định "Passion Juice" bị bỏ sót khi đổi sản phẩm thật.

    await onPanelMaterialChange();
    await renderClimateSection();
    renderStorageModeSelector();
    renderThroughputFields();
    renderVaporModeFields();
    updateGeomSummary();
    rebuildWallOverrides();
    renderOpeningsList();
    if (window.lucide) lucide.createIcons();
    enhanceCollapsibleSections(panel, '.panel-section', '.section-label', 'panel-section-body', null, [0, 1]);
    scheduleAutoCalc();
  }

  // ── Gather all inputs ──
  function gatherInputs() {
    const geomInput = readGeometryInput();
    const num = function (id) { return parseFloat(document.getElementById(id).value); };
    const numOr = function (id, def) { const el = document.getElementById(id); if (!el || el.value === '') return def; return parseFloat(el.value); };

    const g = App.calc.computeGeometry(geomInput);
    const extOverrides = {};
    if (g.valid) g.walls.forEach(function (w) {
      const el = document.getElementById('extTemp_' + w.faceKey);
      if (el && el.value !== '') extOverrides['extTemp_' + w.faceKey] = parseFloat(el.value);
    });

    const storageMode = document.getElementById('storageCapacityMode').value;
    const storageFields = { storageCapacityMode: storageMode, productGroupForDensity: currentProduct ? currentProduct.group : null };
    if (storageMode === 'lowceiling') {
      storageFields.lowCeilingMethod = document.getElementById('lowCeilingMethod') ? document.getElementById('lowCeilingMethod').value : 'pct45';
      storageFields.ashraeFillPct = document.getElementById('ashraeFillPct') ? parseFloat(document.getElementById('ashraeFillPct').value) / 100 : 0.65;
      storageFields.productBulkDensity = numOr('productBulkDensity', 350);
    } else if (storageMode === 'pallet') {
      storageFields.palletWeight = numOr('palletWeight', 750);
      storageFields.palletCount = numOr('palletCount', 0);
    } else {
      storageFields.mass_total_manual = numOr('mass_total_manual', 0);
    }

    const throughputMode = document.getElementById('throughputMode').value;
    const throughputFields = { throughputMode: throughputMode };
    if (throughputMode === 'dock') {
      throughputFields.nDocks = numOr('nDocks', 1);
      throughputFields.maxTripsPerDock = numOr('maxTripsPerDock', 2);
      throughputFields.tonPerTrip = numOr('tonPerTrip', 25);
    } else if (throughputMode === 'turnoverPct') {
      throughputFields.turnoverPct = numOr('turnoverPct', 5);
    } else {
      throughputFields.mass_in_manual = numOr('mass_in_manual', 0);
    }

    return Object.assign({}, geomInput, extOverrides, storageFields, throughputFields, {
      T_amb: num('T_amb'), RH_amb: num('RH_amb'), T_room: num('T_room'), RH_room: num('RH_room'),
      T_roof: num('T_roof'), T_floor: num('T_floor'), safety: num('safety'),
      climateMode: document.getElementById('climateMode') ? document.getElementById('climateMode').value : 'manual',
      province: (document.getElementById('climateMode') && document.getElementById('climateMode').value === 'province' && document.getElementById('provinceSelect')) ? document.getElementById('provinceSelect').value : null,
      provinceBorrowedFrom: (document.getElementById('climateMode') && document.getElementById('climateMode').value === 'province') ? lastProvinceBorrowedFrom : null,
      warehouseType: document.getElementById('warehouseTypePreset') ? document.getElementById('warehouseTypePreset').value : '',
      palletCountMethod: lastPalletMethod,
      rackLayoutTooSmall: lastRackLayoutTooSmall,
      panelMaterial: document.getElementById('panelMaterial').value,
      panelThickness: parseFloat(document.getElementById('panelThickness').value),
      floorMaterial: document.getElementById('floorMaterial').value,
      floorThickness: num('floorThickness'),
      productName: document.getElementById('productCombo').value,
      T_in: num('T_in'), T_final: num('T_final'),
      T_freeze: numOr('T_freeze', null), latentHeat: numOr('latentHeat', null),
      Cp_above: numOr('Cp_above', null), Cp_below: numOr('Cp_below', null),
      pulldown: num('pulldown'),
      respirationOverride: null,
      openings: openingsList.map(function (o) {
        return { kind: o.kind, w: o.w, h: o.h, count: o.count, mechanism: o.mechanism,
          openTimeSec: o.openTimeSec, cyclesPerDay: o.cyclesPerDay, protectionEff: o.protectionEff,
          hoursOpenPerDay: o.hoursOpenPerDay, avgVelocity: o.avgVelocity, refType: o.refType };
      }),
      n_people: num('n_people'), t_people: num('t_people'),
      internalVehicleType: document.getElementById('internalVehicleType').value,
      n_forklift_internal: num('n_forklift_internal'),
      dockVehicleType: document.getElementById('dockVehicleType').value,
      n_forklift_dock: num('n_forklift_dock'),
      includePackingInternalLoad: document.getElementById('includePackingInternalLoad').checked,
      palletWeight: numOr('palletWeight', 750),
      lightingWm2: num('lightingWm2'), lightingMethod: lastLightingMethod, t_lights: num('t_lights'),
      syncLightingHours: document.getElementById('syncLightingHours') ? document.getElementById('syncLightingHours').checked : false,
      n_evap: num('n_evap'), fan_per_evap: num('fan_per_evap'), kw_fan: num('kw_fan'), t_fan: num('t_fan'),
      defrost_times: num('defrost_times'), defrost_duration: num('defrost_duration'),
      heater_per_evap: num('heater_per_evap'), kw_heater: num('kw_heater'),
      vaporInfiltrationMode: document.getElementById('vaporInfiltrationMode').value,
      panelWidthM: numOr('panelWidthM', 1.1), jointLengthOverride: numOr('jointLengthOverride', null),
      jointLeakagePerM: numOr('jointLeakagePerM', 0.15),
      vapor_area: numOr('vapor_area', 0), vapor_perm: numOr('vapor_perm', 0),
      air_exchange: num('air_exchange'), air_exchange_pct: num('air_exchange_pct'),
      runtime: num('runtime')
    });
  }

  function pct(v, subtotal) { return ((v / subtotal) * 100).toFixed(1) + '%'; }
  function convPower(kW) {
    switch (unitsConfig.power) {
      case 'W': return { v: kW * 1000, u: 'W' };
      case 'BTU/h': return { v: kW * 3412.14, u: 'BTU/h' };
      case 'TR': return { v: kW / 3.517, u: 'TR' };
      default: return { v: kW, u: 'kW' };
    }
  }
  function convDensity(WperM3) {
    if (unitsConfig.density === 'kcal/h.m3') return { v: WperM3 * 0.86, u: 'kcal/h.m³' };
    return { v: WperM3, u: 'W/m³' };
  }

  // ── Calculate (real-time, gọi từ debounce hoặc nút bấm) ──
  // ── [Yêu cầu mới] Nạp lại input đã lưu từ 1 bảng tính trong dự án vào form — ngược lại gatherInputs() ──
  async function loadInputIntoForm(saved, roomName) {
    if (roomName != null && document.getElementById('roomName')) document.getElementById('roomName').value = roomName;
    // 1. Hình dạng trước tiên (để render đúng khối input theo shape)
    setShape(saved.shape);
    await new Promise(function (resolve) { setTimeout(resolve, 0); }); // đợi 1 tick cho DOM toggle xong

    if (saved.shape === 'rect') {
      document.getElementById('L').value = saved.L;
      document.getElementById('W').value = saved.W;
    } else if (saved.shape === 'lshape') {
      document.getElementById('ls_L1').value = saved.ls_L1; document.getElementById('ls_W1').value = saved.ls_W1;
      document.getElementById('ls_L3').value = saved.ls_L3; document.getElementById('ls_W2').value = saved.ls_W2;
    } else {
      document.getElementById('us_L1').value = saved.us_L1; document.getElementById('us_W1').value = saved.us_W1;
      document.getElementById('us_L3').value = saved.us_L3; document.getElementById('us_W2').value = saved.us_W2;
    }
    document.getElementById('H').value = saved.H;
    updateGeomSummary();
    rebuildWallOverrides();
    Object.keys(saved).forEach(function (k) {
      if (k.indexOf('extTemp_') === 0) { const el = document.getElementById(k); if (el) el.value = saved[k]; }
    });

    document.getElementById('T_amb').value = saved.T_amb;
    document.getElementById('RH_amb').value = saved.RH_amb;
    document.getElementById('T_room').value = saved.T_room;
    document.getElementById('RH_room').value = saved.RH_room;
    document.getElementById('T_roof').value = saved.T_roof;
    document.getElementById('T_floor').value = saved.T_floor;
    document.getElementById('safety').value = saved.safety;

    document.getElementById('panelMaterial').value = saved.panelMaterial;
    await onPanelMaterialChange();
    document.getElementById('panelThickness').value = saved.panelThickness;
    document.getElementById('floorMaterial').value = saved.floorMaterial;
    document.getElementById('floorThickness').value = saved.floorThickness;

    if (saved.productName) {
      const products = await App.db.getAll('products');
      const p = products.find(function (x) { return x.name === saved.productName; });
      document.getElementById('productCombo').value = saved.productName;
      if (p) await onProductSelect(p);
    } else {
      document.getElementById('productCombo').value = '';
      currentProduct = null;
      document.getElementById('productInfoBanner').style.display = 'none';
    }
    document.getElementById('T_in').value = saved.T_in;
    document.getElementById('T_final').value = saved.T_final;
    document.getElementById('pulldown').value = saved.pulldown;

    document.getElementById('storageCapacityMode').value = saved.storageCapacityMode;
    renderStorageModeFields();
    if (saved.storageCapacityMode === 'lowceiling') {
      if (document.getElementById('lowCeilingMethod')) document.getElementById('lowCeilingMethod').value = saved.lowCeilingMethod;
      renderStorageModeFields();
      if (document.getElementById('ashraeFillPct') && saved.ashraeFillPct != null) document.getElementById('ashraeFillPct').value = saved.ashraeFillPct * 100;
      if (document.getElementById('productBulkDensity')) document.getElementById('productBulkDensity').value = saved.productBulkDensity;
    } else if (saved.storageCapacityMode === 'pallet') {
      document.getElementById('palletWeight').value = saved.palletWeight;
      document.getElementById('palletCount').value = saved.palletCount;
    } else {
      document.getElementById('mass_total_manual').value = saved.mass_total_manual;
    }

    document.getElementById('throughputMode').value = saved.throughputMode;
    renderThroughputFields();
    if (saved.throughputMode === 'dock') {
      document.getElementById('nDocks').value = saved.nDocks;
      document.getElementById('maxTripsPerDock').value = saved.maxTripsPerDock;
      document.getElementById('tonPerTrip').value = saved.tonPerTrip;
    } else if (saved.throughputMode === 'turnoverPct') {
      document.getElementById('turnoverPct').value = saved.turnoverPct;
    } else {
      document.getElementById('mass_in_manual').value = saved.mass_in_manual;
    }

    openingsList = (saved.openings || []).map(function (o, idx) {
      return Object.assign({ id: idx + 1, kind: o.kind }, o);
    });
    openingIdCounter = openingsList.length + 1;
    renderOpeningsList();

    document.getElementById('n_people').value = saved.n_people;
    document.getElementById('t_people').value = saved.t_people;
    document.getElementById('internalVehicleType').value = saved.internalVehicleType;
    document.getElementById('n_forklift_internal').value = saved.n_forklift_internal;
    document.getElementById('dockVehicleType').value = saved.dockVehicleType;
    document.getElementById('n_forklift_dock').value = saved.n_forklift_dock;
    document.getElementById('includePackingInternalLoad').checked = saved.includePackingInternalLoad;
    document.getElementById('lightingWm2').value = saved.lightingWm2 != null ? saved.lightingWm2 : '';
    document.getElementById('t_lights').value = saved.t_lights;
    if (document.getElementById('syncLightingHours')) document.getElementById('syncLightingHours').checked = saved.syncLightingHours !== false;
    document.getElementById('n_evap').value = saved.n_evap;
    document.getElementById('fan_per_evap').value = saved.fan_per_evap;
    document.getElementById('kw_fan').value = saved.kw_fan;
    document.getElementById('t_fan').value = saved.t_fan;
    document.getElementById('defrost_times').value = saved.defrost_times;
    document.getElementById('defrost_duration').value = saved.defrost_duration;
    document.getElementById('heater_per_evap').value = saved.heater_per_evap;
    document.getElementById('kw_heater').value = saved.kw_heater;

    document.getElementById('vaporInfiltrationMode').value = saved.vaporInfiltrationMode;
    renderVaporModeFields();
    if (saved.vaporInfiltrationMode === 'joint') {
      document.getElementById('panelWidthM').value = saved.panelWidthM;
      if (saved.jointLengthOverride != null) document.getElementById('jointLengthOverride').value = saved.jointLengthOverride;
      document.getElementById('jointLeakagePerM').value = saved.jointLeakagePerM;
    } else if (saved.vaporInfiltrationMode === 'manual') {
      document.getElementById('vapor_area').value = saved.vapor_area;
      document.getElementById('vapor_perm').value = saved.vapor_perm;
    }
    document.getElementById('air_exchange').value = saved.air_exchange;
    document.getElementById('air_exchange_pct').value = saved.air_exchange_pct;
    document.getElementById('runtime').value = saved.runtime;

    await calculate();
  }

  async function calculate(_resyncGuard) {
    let input;
    try { input = gatherInputs(); } catch (e) { return; }
    const db = {
      materials: await App.db.getAll('materials'), materialSkinSpec: App.DEFAULT_DATA.materialSkinSpec,
      products: await App.db.getAll('products'), respiration: await App.db.getAll('respiration'),
      personHeat: App.DEFAULT_DATA.personHeat, packingSpec: await App.db.getAll('packingSpec'),
      mapFull: App.DEFAULT_DATA.mapFull, vehicles: await App.db.getAll('vehicles')
    };
    const result = App.calc.runCalculation(input, db);
    if (!result.valid) {
      document.getElementById('placeholder').style.display = 'flex';
      document.getElementById('placeholder').querySelector('p').textContent = '⚠ ' + result.error;
      document.getElementById('resultsContent').style.display = 'none';
      return;
    }

    // ── Đồng bộ giờ chiếu sáng theo giờ hoạt động (nếu bật checkbox) — lấy giá trị LỚN HƠN
    // giữa xe nâng nội bộ và dock, vì kho còn xe nào hoạt động thì vẫn cần chiếu sáng.
    // Guard _resyncGuard tránh đệ quy vô hạn — chỉ tính lại tối đa 1 lần/lượt gọi thủ công. ──
    const syncEl = document.getElementById('syncLightingHours');
    if (syncEl && syncEl.checked && !_resyncGuard) {
      const targetHours = Math.max(result.t_forklift_internal || 0, result.t_forklift_dock || 0);
      const tLightsEl = document.getElementById('t_lights');
      if (tLightsEl && Math.abs(parseFloat(tLightsEl.value || 0) - targetHours) > 0.05) {
        tLightsEl.value = targetHours.toFixed(1);
        return calculate(true);
      }
    }

    lastResult = result; lastInput = input;
    const diag = App.calc.runDiagnostics(input, result);
    result.diagnostics = diag;

    await App.db.put('calcHistory', {
      time: new Date().toISOString(), roomName: document.getElementById('roomName').value,
      Q_total_kW: result.Q_total_kW, Q_per_m3: result.Q_per_m3, projectId: currentProjectId
    });

    renderResults(result, input);
  }
  const DIAG_LABEL_KEYS = {
    no_negative_inputs: 'diagNoNegative', room_colder_than_ambient: 'diagRoomColder',
    product_cooled_not_heated: 'diagProductCooled', u_value_walls_reasonable: 'diagUValue',
    vehicle_hours_within_day: 'diagVehicleHours', safety_factor_typical: 'diagSafetyFactor',
    rh_in_valid_range: 'diagRHRange', load_density_reasonable: 'diagLoadDensity'
  };

  function renderResults(r, input) {
    const roomName = document.getElementById('roomName').value;
    const subtotal = r.Q_subtotal;
    const totalConv = convPower(r.Q_total_kW);
    const densConv = convDensity(r.Q_per_m3);
    const diag = r.diagnostics;

    const wallRows = r.wallDetails.map(function (w) {
      return '<tr><td>' + w.name + '</td><td>' + w.area.toFixed(1) + '</td><td>' + w.U.toFixed(4) + '</td><td>' + w.T_ext.toFixed(1) + '°C / ΔT=' + w.dT.toFixed(1) + 'K</td><td>' + convPower(w.load).v.toFixed(3) + '</td></tr>';
    }).join('');

    const openingRows = r.openingResults.map(function (o) {
      return '<tr><td>' + (o.refType || '—') + ' ×' + o.count + '</td><td>' + (o.method || '—') + '</td><td>' + (o.Qv ? o.Qv.toFixed(4) + ' m³/s' : '—') + '</td><td>' + convPower(o.load).v.toFixed(3) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" style="color:var(--slate-500)">' + t('noOpeningsInResult') + '</td></tr>';

    const diagItemsHtml = diag.items.map(function (it) {
      const cls = it.passed ? 'pass' : (it.severity === 'error' ? 'err' : 'warn');
      const icon = it.passed ? 'check-circle' : (it.severity === 'error' ? 'x-circle' : 'alert-triangle');
      const label = t(DIAG_LABEL_KEYS[it.id] || it.id);
      return '<div class="diag-item ' + cls + '"><i data-lucide="' + icon + '"></i><span>' + label + '</span></div>';
    }).join('');

    const respNote = r.respirationApplies ? t('respNoteApplies') : t('respNoteNotApplicable');
    const moistureLabel = r.moistWall.mode === 'joint' ? t('rowMoistureJoint') : t('rowMoisturePanel');

    const html =
      '<div class="results-header"><h2>' + esc(roomName) + '</h2><div class="run-indicator active">' + t('realtimeIndicator') + '</div></div>' +

      '<div class="diag-stamp-wrap">' +
      '<div class="diag-stamp ' + (diag.overallPass ? 'pass' : 'fail') + '">' + (diag.overallPass ? t('diagPassLabel') : t('diagFailLabel')) + '</div>' +
      '<div class="diag-list">' + diagItemsHtml + '</div></div>' +

      '<div class="banner info" style="margin-bottom:12px;font-size:10.5px">📎 Đây là tab tính toán tham khảo (lý thuyết). Sau khi có Q_calc, sang tab <strong>"Chọn thiết bị"</strong> để chọn thiết bị thực tế trên thị trường — đó mới là số liệu chính thức chuyển sang Trạm 3.</div>' +

      /* ── Phần tính toán lý thuyết: nay là nội dung CHÍNH của tab này ── */
      '<details class="calc-detail-collapse" id="calcDetailBlock" open>' +
      '<summary class="calc-detail-summary"><i data-lucide="function-square" style="width:13px;height:13px"></i> Cơ sở tính toán lý thuyết (tham khảo — bấm để xem chi tiết)</summary>' +
      '<div class="calc-detail-body">' +

      '<div class="info-banner ' + (r.Q_per_m3 < 15 ? 'ok' : (r.Q_per_m3 < 30 ? 'info' : '')) + '">' +
      (r.Q_per_m3 < 15 ? t('loadDensityOk') : r.Q_per_m3 < 30 ? t('loadDensityMed') : t('loadDensityHigh')) +
      ' · U_wall=' + r.U_wall.toFixed(4) + ' W/m²K · U_floor=' + r.U_floor.toFixed(4) + ' W/m²K</div>' +

      '<div class="summary-grid">' +
      '<div class="summary-card total"><div class="card-label">' + t('cardTotal') + '</div><div class="card-value">' + totalConv.v.toFixed(1) + '<small>' + totalConv.u + '</small></div><div class="card-pct">' + densConv.v.toFixed(1) + ' ' + densConv.u + '</div></div>' +
      '<div class="summary-card trans"><div class="card-label">' + t('cardTrans') + '</div><div class="card-value">' + convPower(r.Q_trans).v.toFixed(2) + '<small>' + totalConv.u + '</small></div><div class="card-pct">' + pct(r.Q_trans, subtotal) + '</div></div>' +
      '<div class="summary-card product"><div class="card-label">' + t('cardProduct') + '</div><div class="card-value">' + convPower(r.Q_product).v.toFixed(2) + '<small>' + totalConv.u + '</small></div><div class="card-pct">' + pct(r.Q_product, subtotal) + '</div></div>' +
      '<div class="summary-card infil"><div class="card-label">' + t('cardInfil') + '</div><div class="card-value">' + convPower(r.Q_infiltration).v.toFixed(2) + '<small>' + totalConv.u + '</small></div><div class="card-pct">' + pct(r.Q_infiltration, subtotal) + '</div></div>' +
      '<div class="summary-card internal"><div class="card-label">' + t('cardInternal') + '</div><div class="card-value">' + convPower(r.Q_internal).v.toFixed(2) + '<small>' + totalConv.u + '</small></div><div class="card-pct">' + pct(r.Q_internal, subtotal) + '</div></div>' +
      '<div class="summary-card humid"><div class="card-label">' + t('cardHumid') + '</div><div class="card-value">' + convPower(r.Q_moisture_total).v.toFixed(2) + '<small>' + totalConv.u + '</small></div><div class="card-pct">' + pct(r.Q_moisture_total, subtotal) + '</div></div>' +
      '</div>' +

      '<div class="result-section"><div class="result-section-header"><div class="result-section-title">' + t('secStorageResultTitle') + '</div></div>' +
      '<table class="result-table"><tbody>' +
      '<tr><td>' + t('storageMethodLabel') + '</td><td>' + r.storageCapacity.method + '</td></tr>' +
      '<tr><td>' + t('detailLabel') + '</td><td>' + r.storageCapacity.detail + '</td></tr>' +
      '<tr><td><strong>' + t('totalStorageMassLabel') + '</strong></td><td><strong>' + r.mass_total.toFixed(1) + ' ' + (CSHL_I18N.getLang() === 'en' ? 'ton' : 'tấn') + '</strong></td></tr>' +
      '<tr><td>' + t('throughputMethodLabel') + '</td><td>' + r.throughput.method + '</td></tr>' +
      '<tr><td><strong>' + t('massInPerDayLabel') + '</strong></td><td><strong>' + r.mass_in.toFixed(1) + ' ' + (CSHL_I18N.getLang() === 'en' ? 'ton/day' : 'tấn/ngày') + '</strong></td></tr>' +
      '</tbody></table></div>' +

      '<div class="result-section"><div class="result-section-header"><div class="result-section-title"><span class="dot dot-trans"></span>' + t('sec1Title') + '</div><div class="result-section-total">' + convPower(r.Q_trans).v.toFixed(3) + ' ' + totalConv.u + '</div></div>' +
      '<div class="overflow-x-auto"><table class="result-table"><thead><tr><th>' + t('colPosition') + '</th><th>' + t('colArea') + '</th><th>' + t('colU') + '</th><th>' + t('colTOutDelta') + '</th><th>' + t('colLoad') + '</th></tr></thead><tbody>' + wallRows + '</tbody></table></div></div>' +

      '<div class="result-section"><div class="result-section-header"><div class="result-section-title"><span class="dot dot-prod"></span>' + t('sec2Title') + '</div><div class="result-section-total">' + convPower(r.Q_product).v.toFixed(3) + ' ' + totalConv.u + '</div></div>' +
      '<div class="overflow-x-auto"><table class="result-table"><thead><tr><th>' + t('colItem') + '</th><th>' + t('colParam') + '</th><th>' + t('colLoad') + '</th></tr></thead><tbody>' +
      '<tr><td>' + tf('rowCoolToFreeze', { Tf: r.T_freeze }) + '</td><td>Cp=' + r.Cp_above + '</td><td>' + convPower(r.Q_above_freeze).v.toFixed(3) + '</td></tr>' +
      '<tr><td>' + t('rowFreezing') + '</td><td>Lf=' + r.Lf + ' kJ/kg</td><td>' + convPower(r.Q_latent).v.toFixed(3) + '</td></tr>' +
      '<tr><td>' + t('rowCoolBelowFreeze') + '</td><td>Cp=' + r.Cp_below + '</td><td>' + convPower(r.Q_below_freeze).v.toFixed(3) + '</td></tr>' +
      '<tr><td>' + tf('rowRespiration', { note: respNote }) + '</td><td>' + r.respPerKg.toFixed(2) + ' mW/kg</td><td>' + convPower(r.Q_respiration).v.toFixed(3) + '</td></tr>' +
      '<tr><td>' + t('rowPackingProduct') + '</td><td>' + t('packingProductDetail') + '</td><td>' + convPower(r.Q_packing_product).v.toFixed(3) + '</td></tr>' +
      '</tbody></table></div></div>' +

      '<div class="result-section"><div class="result-section-header"><div class="result-section-title"><span class="dot dot-infil"></span>' + t('sec3Title') + '</div><div class="result-section-total">' + convPower(r.Q_infiltration).v.toFixed(3) + ' ' + totalConv.u + '</div></div>' +
      '<div class="overflow-x-auto"><table class="result-table"><thead><tr><th>' + t('colType') + '</th><th>' + t('colMethod') + '</th><th>' + t('colFlowRate') + '</th><th>' + t('colLoad') + '</th></tr></thead><tbody>' + openingRows + '</tbody></table></div></div>' +

      '<div class="result-section"><div class="result-section-header"><div class="result-section-title"><span class="dot dot-int"></span>' + t('sec4Title') + '</div><div class="result-section-total">' + convPower(r.Q_internal).v.toFixed(3) + ' ' + totalConv.u + '</div></div>' +
      '<div class="overflow-x-auto"><table class="result-table"><thead><tr><th>' + t('colItem') + '</th><th>' + t('detailLabel') + '</th><th>' + t('colLoad') + '</th></tr></thead><tbody>' +
      '<tr><td>' + t('rowPeople') + '</td><td>—</td><td>' + convPower(r.Q_people).v.toFixed(3) + '</td></tr>' +
      '<tr><td>' + t('rowInternalVehicle') + '</td><td>' + r.t_forklift_internal.toFixed(2) + 'h/day</td><td>' + convPower(r.Q_forklift_internal).v.toFixed(3) + '</td></tr>' +
      '<tr><td>' + t('rowDockVehicle') + '</td><td>' + r.t_forklift_dock.toFixed(2) + 'h/day</td><td>' + convPower(r.Q_forklift_dock).v.toFixed(3) + '</td></tr>' +
      '<tr><td>' + t('rowLighting') + '</td><td>—</td><td>' + convPower(r.Q_lights).v.toFixed(3) + '</td></tr>' +
      '<tr><td>' + t('rowEvapFan') + '</td><td>—</td><td>' + convPower(r.Q_fans).v.toFixed(3) + '</td></tr>' +
      '<tr><td>' + t('rowDefrost') + '</td><td>—</td><td>' + convPower(r.Q_defrost).v.toFixed(3) + '</td></tr>' +
      '<tr><td>' + t('rowPackingInternal') + '</td><td>' + t('packingInternalDetail') + '</td><td>' + convPower(r.Q_packing_internal).v.toFixed(3) + '</td></tr>' +
      '</tbody></table></div></div>' +

      '<div class="result-section"><div class="result-section-header"><div class="result-section-title"><span class="dot dot-humid"></span>' + t('sec5Title') + '</div><div class="result-section-total">' + convPower(r.Q_moisture_total).v.toFixed(3) + ' ' + totalConv.u + '</div></div>' +
      '<div class="overflow-x-auto"><table class="result-table"><thead><tr><th>' + t('colItem') + '</th><th>' + t('detailLabel') + '</th><th>' + t('colLoad') + '</th></tr></thead><tbody>' +
      '<tr><td>' + moistureLabel + '</td><td>ΔP=' + r.moistWall.dp_vapor.toFixed(0) + 'Pa</td><td>' + convPower(r.moistWall.Q).v.toFixed(4) + '</td></tr>' +
      '<tr><td>' + t('rowMoistureExchange') + '</td><td>ΔW=' + ((r.moistExch.W_amb - r.moistExch.W_room) * 1000).toFixed(2) + 'g/kg</td><td>' + convPower(r.moistExch.Q).v.toFixed(3) + '</td></tr>' +
      '</tbody></table></div></div>' +

      '<div class="result-section"><div class="result-section-header"><div class="result-section-title">' + t('secSummaryTitle') + '</div></div>' +
      '<div class="overflow-x-auto"><table class="result-table"><thead><tr><th>' + t('colItem') + '</th><th>' + totalConv.u + '</th><th>%</th></tr></thead><tbody>' +
      '<tr><td>' + t('summaryQ1') + '</td><td>' + convPower(r.Q_trans).v.toFixed(3) + '</td><td>' + pct(r.Q_trans, subtotal) + '</td></tr>' +
      '<tr><td>' + t('summaryQ2') + '</td><td>' + convPower(r.Q_product).v.toFixed(3) + '</td><td>' + pct(r.Q_product, subtotal) + '</td></tr>' +
      '<tr><td>' + t('summaryQ3') + '</td><td>' + convPower(r.Q_infiltration).v.toFixed(3) + '</td><td>' + pct(r.Q_infiltration, subtotal) + '</td></tr>' +
      '<tr><td>' + t('summaryQ4') + '</td><td>' + convPower(r.Q_internal).v.toFixed(3) + '</td><td>' + pct(r.Q_internal, subtotal) + '</td></tr>' +
      '<tr><td>' + t('summaryQ5') + '</td><td>' + convPower(r.Q_moisture_total).v.toFixed(3) + '</td><td>' + pct(r.Q_moisture_total, subtotal) + '</td></tr>' +
      '<tr style="font-weight:700"><td>' + t('summarySubtotal') + '</td><td>' + convPower(subtotal).v.toFixed(3) + '</td><td>100%</td></tr>' +
      '<tr><td>' + tf('summarySafety', { pct: (r.safety * 100).toFixed(0) }) + '</td><td>' + convPower(subtotal * r.safety).v.toFixed(3) + '</td><td>+' + (r.safety * 100).toFixed(0) + '%</td></tr>' +
      '<tr style="font-weight:800;color:var(--emerald)"><td>' + t('summaryRequired') + '</td><td>' + totalConv.v.toFixed(2) + '</td><td>—</td></tr>' +
      '<tr><td>' + t('summaryVolume') + '</td><td colspan="2">' + r.geom.volume.toFixed(1) + ' m³ → <strong>' + densConv.v.toFixed(2) + ' ' + densConv.u + '</strong></td></tr>' +
      '</tbody></table></div></div>' +

      '</div></details>';

    document.getElementById('placeholder').style.display = 'none';
    document.getElementById('resultsContent').style.display = 'block';
    document.getElementById('resultsContent').innerHTML = html;
    if (window.lucide) lucide.createIcons();
    enhanceCollapsibleSections(document.getElementById('resultsContent'), '.result-section', '.result-section-header', 'result-section-body', resultSectionCollapseState);
  }

  function renderSettingsTab() {
    const wrap = document.getElementById('settingsContent');
    wrap.innerHTML =
      '<div class="settings-card"><h3>' + t('settingsLangTitle') + '</h3>' +
      '<div class="unit-row"><select id="langSelect" onchange="CSHL_I18N.setLanguage(this.value)">' +
      '<option value="vi">Tiếng Việt</option><option value="en">English</option></select></div></div>' +

      '<div class="settings-card"><h3>' + t('settingsUnitsTitle') + '</h3>' +
      '<div class="unit-row"><label>' + t('unitSystemLabel') + '</label><select id="unitSystem" onchange="CSHL_UI.onUnitSystemChange()">' +
      '<option value="SI">' + t('unitSystemSI') + '</option><option value="IP">' + t('unitSystemIP') + '</option></select></div>' +
      '<div class="unit-row"><label>' + t('unitPowerLabel') + '</label><select id="unitPower" onchange="CSHL_UI.saveUnitSettings()">' +
      '<option value="kW">kW</option><option value="W">W</option><option value="BTU/h">BTU/h</option><option value="TR">TR</option></select></div>' +
      '<div class="unit-row"><label>' + t('unitDensityLabel') + '</label><select id="unitDensity" onchange="CSHL_UI.saveUnitSettings()">' +
      '<option value="W/m3">W/m³</option><option value="kcal/h.m3">kcal/h.m³</option></select></div></div>' +

      '<div class="settings-card"><h3>' + t('settingsConvTitle') + '</h3>' +
      '<p style="font-size:11px;color:var(--slate-500);line-height:1.8">' +
      '1 kW = 3412.14 BTU/h = 0.2843 TR<br>1 TR = 3.517 kW = 12,000 BTU/h<br>1 W/m³ = 0.86 kcal/h.m³<br>' +
      '1 m = 3.2808 ft · °F = °C×9/5+32</p></div>' +

      '<div class="settings-card"><h3>' + t('settingsBackupTitle') + '</h3>' +
      '<p style="font-size:11px;color:var(--slate-400);line-height:1.8;margin-bottom:12px">' + t('settingsBackupDesc') + '</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn-primary" style="display:inline-flex;align-items:center;gap:6px" onclick="CSHL_UI.backupExportAll()"><i data-lucide="download"></i> ' + t('btnBackupExport') + '</button>' +
      '<button class="btn-cancel" style="display:inline-flex;align-items:center;gap:6px" onclick="document.getElementById(\'backupFileInput\').click()"><i data-lucide="upload"></i> ' + t('btnBackupImport') + '</button>' +
      '</div>' +
      '<input type="file" id="backupFileInput" accept="application/json,.json" style="display:none" onchange="CSHL_UI.backupImportAll(this)">' +
      '</div>';

    const cfg = App.settings.get('units', { temp: 'C', power: 'kW', density: 'W/m3' });
    document.getElementById('unitPower').value = cfg.power || 'kW';
    document.getElementById('unitDensity').value = cfg.density || 'W/m3';
    document.getElementById('langSelect').value = CSHL_I18N.getLang();
  }
  function onUnitSystemChange() {
    const sys = document.getElementById('unitSystem').value;
    if (sys === 'IP') { document.getElementById('unitPower').value = 'BTU/h'; }
    else { document.getElementById('unitPower').value = 'kW'; }
    saveUnitSettings();
  }
  function saveUnitSettings() {
    unitsConfig = {
      power: document.getElementById('unitPower').value,
      density: document.getElementById('unitDensity').value
    };
    App.settings.set('units', unitsConfig);
    if (lastResult) renderResults(lastResult, lastInput);
  }

  async function backupExportAll() {
    const data = await App.db.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const stamp = new Date().toISOString().slice(0, 10);
    const res = await window.CSHL_Native.saveOrShareFile(blob, 'CSHL_Backup_' + stamp + '.json', 'application/json');
    if (!res.ok && res.mode === 'native-missing-plugins') {
      await App.Modal.alert(t('nativeExportMissingTitle'), t('nativeExportMissingDesc'));
      return;
    }
    await App.Modal.alert(t('backupDoneTitle'), t('backupExportDoneDesc'));
  }

  async function backupImportAll(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const ok = await App.Modal.confirm(t('backupConfirmTitle'), t('backupConfirmDesc'));
      if (!ok) { inputEl.value = ''; return; }
      await App.db.importAll(data);
      await App.Modal.alert(t('backupDoneTitle'), t('backupImportDoneDesc'));
      window.location.reload();
    } catch (err) {
      await App.Modal.alert(t('backupErrorTitle'), tf('backupErrorDesc', { msg: err.message }));
    } finally {
      inputEl.value = '';
    }
  }

  // ── Handoff field validator — cập nhật badge PASS/FAIL realtime ──
  return {
    init: init, switchTab: switchTab, toggleSidebar: toggleSidebar,
    registerCombo: registerCombo, comboFilter: comboFilter, comboOpen: comboOpen, comboSelect: comboSelect, buildCombo: buildCombo,
    setShape: setShape, readGeometryInput: readGeometryInput, updateGeomSummary: updateGeomSummary, rebuildWallOverrides: rebuildWallOverrides,
    onProvinceSelect: onProvinceSelect, onClimateModeChange: onClimateModeChange,
    getLastResult: function () { return lastResult; },
    onProductSelect: onProductSelect, updateRespirationNote: updateRespirationNote, onPanelMaterialChange: onPanelMaterialChange,
    renderStorageModeSelector: renderStorageModeSelector, renderStorageModeFields: renderStorageModeFields,
    renderThroughputFields: renderThroughputFields, renderVaporModeFields: renderVaporModeFields,
    addOpening: addOpening, renderOpeningsList: renderOpeningsList, onOpeningTypeChange: onOpeningTypeChange,
    updateOpeningField: updateOpeningField, removeOpening: removeOpening, scheduleAutoCalc: scheduleAutoCalc,
    onWarehousePresetChange: onWarehousePresetChange, onProductGroupChange: onProductGroupChange,
    onRackOrientationChange: onRackOrientationChange, markPalletManual: markPalletManual, onTLightsManualChange: onTLightsManualChange,
    markLightingManual: markLightingManual,
    renderInputPanel: renderInputPanel, gatherInputs: gatherInputs, calculate: calculate, renderResults: renderResults, loadInputIntoForm: loadInputIntoForm,
    convPower: convPower, convDensity: convDensity, renderSettingsTab: renderSettingsTab,
    onUnitSystemChange: onUnitSystemChange, saveUnitSettings: saveUnitSettings,
    backupExportAll: backupExportAll, backupImportAll: backupImportAll,
    get currentShape() { return currentShape; }, set currentShape(v) { currentShape = v; },
    get openingsList() { return openingsList; }, set openingsList(v) { openingsList = v; },
    get openingIdCounter() { return openingIdCounter; }, set openingIdCounter(v) { openingIdCounter = v; },
    get lastResult() { return lastResult; }, set lastResult(v) { lastResult = v; },
    get lastInput() { return lastInput; }, set lastInput(v) { lastInput = v; },
    get unitsConfig() { return unitsConfig; }, set unitsConfig(v) { unitsConfig = v; },
    get currentProduct() { return currentProduct; }, set currentProduct(v) { currentProduct = v; },
    get currentProjectId() { return currentProjectId; }, set currentProjectId(v) { currentProjectId = v; }
  };
})();
