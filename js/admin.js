// ===== admin.js =====
// ═══════════════════════════════════════════════════════════════
//  MODULE: admin — Quản lý Database (CRUD + Import Excel/CSV/JSON)
// ═══════════════════════════════════════════════════════════════
window.CSHL_Admin = (function () {
  'use strict';
  const App = window.ColdStorageHeatLoad;
  const t = function (k) { return CSHL_I18N.t(k); };
  const esc = App.util.escapeHtml;
  const tf = function (k, v) { return CSHL_I18N.tf(k, v); };

  let currentCollection = 'products';
  let searchQuery = '';
  let editIndex = null;

  function COLLECTIONS_LIST() {
    return [
      { key: 'products', label: t('dbCollProducts'), icon: 'apple' },
      { key: 'materials', label: t('dbCollMaterials'), icon: 'layers' },
      { key: 'respiration', label: t('dbCollRespiration'), icon: 'wind' },
      { key: 'doorTypes', label: t('dbCollDoorTypes'), icon: 'door-open' },
      { key: 'panelSpecs', label: t('dbCollPanelSpecs'), icon: 'ruler' },
      { key: 'vehicles', label: t('dbCollVehicles'), icon: 'truck' },
      { key: 'climateProvinces', label: t('dbCollClimate'), icon: 'cloud' },
      { key: 'packingSpec', label: t('dbCollPacking'), icon: 'package' },
      { key: 'warehouseTypePresets', label: t('dbCollWarehousePresets'), icon: 'warehouse' },
      { key: 'rackLayoutConfig', label: t('dbCollRackLayout'), icon: 'ruler' }
    ];
  }

  async function render() {
    const sidebar = document.getElementById('dbSidebar');
    const collections = COLLECTIONS_LIST();
    const counts = {};
    for (const c of collections) counts[c.key] = await App.db.count(c.key);

    sidebar.innerHTML = '<div style="padding:0 20px 12px;font-family:var(--font-mono);font-size:10px;color:var(--slate-500);text-transform:uppercase;letter-spacing:.06em">' + t('dbSectionLabel') + '</div>' +
      collections.map(function (c) {
        return '<div class="db-sidebar-item ' + (c.key === currentCollection ? 'active' : '') + '" onclick="CSHL_Admin.switchCollection(\'' + c.key + '\')">' +
          '<span><i data-lucide="' + c.icon + '" style="width:14px;height:14px;margin-right:6px;vertical-align:-2px"></i>' + c.label + '</span><span class="db-count">' + counts[c.key] + '</span></div>';
      }).join('') +
      '<div style="padding:16px 20px 0;border-top:1px solid var(--slate-800);margin-top:12px">' +
      '<button class="add-btn" style="margin-bottom:8px" onclick="CSHL_Admin.exportJSON()"><i data-lucide="download" style="width:13px;height:13px;margin-right:4px;vertical-align:-2px"></i>' + t('dbExportBtn') + '</button>' +
      '<button class="add-btn" style="margin-bottom:8px" onclick="CSHL_Admin.importJSON()"><i data-lucide="upload" style="width:13px;height:13px;margin-right:4px;vertical-align:-2px"></i>' + t('dbImportBtn') + '</button>' +
      '<button class="add-btn" onclick="CSHL_Admin.importSpreadsheet()"><i data-lucide="file-spreadsheet" style="width:13px;height:13px;margin-right:4px;vertical-align:-2px"></i>' + t('dbImportSpreadsheetBtn') + '</button>' +
      '</div>';
    await renderContent();
    if (window.lucide) lucide.createIcons();
  }

  function switchCollection(key) {
    currentCollection = key; searchQuery = '';
    render();
  }

  async function renderContent() {
    const content = document.getElementById('dbContent');
    const data = await App.db.getAll(currentCollection);
    const filtered = searchQuery ? data.filter(function (d) { return JSON.stringify(d).toLowerCase().indexOf(searchQuery.toLowerCase()) >= 0; }) : data;
    const meta = COLLECTIONS_LIST().find(function (c) { return c.key === currentCollection; });

    content.innerHTML =
      '<div class="db-toolbar">' +
      '<input type="text" placeholder="' + tf('dbSearchPlaceholder', { label: meta.label }) + '" value="' + searchQuery + '" oninput="CSHL_Admin.search(this.value)">' +
      '<button class="icon-btn" onclick="CSHL_Admin.openModal(null)"><i data-lucide="plus"></i>' + t('dbAddNewBtn') + '</button>' +
      '<button class="icon-btn" style="margin-left:auto" onclick="CSHL_Admin.resetToDefaults()"><i data-lucide="rotate-ccw"></i>' + t('dbResetBtn') + '</button>' +
      '</div>' +
      '<div class="db-table-wrap"><div style="max-height:calc(100vh - 220px);overflow-y:auto">' + renderTable(filtered) + '</div></div>';
    if (window.lucide) lucide.createIcons();
  }

  function search(q) { searchQuery = q; renderContent(); }

  function renderTable(data) {
    const rowActions = function (i) {
      return '<td class="row-actions"><button onclick="CSHL_Admin.openModal(' + i + ')"><i data-lucide="pencil" style="width:13px;height:13px"></i></button>' +
        '<button class="del" onclick="CSHL_Admin.deleteRow(' + i + ')"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button></td>';
    };
    if (currentCollection === 'products') {
      return '<table class="db-table"><thead><tr><th>' + t('dbColName') + '</th><th>' + t('dbColGroup') + '</th><th>' + t('dbColFreezeT') + '</th><th>' + t('dbColCpAbove') + '</th><th>' + t('dbColCpBelow') + '</th><th>' + t('dbColLatent') + '</th><th>' + t('dbColSource') + '</th><th></th></tr></thead><tbody>' +
        data.map(function (p, i) { return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.group || '') + '</td><td class="num">' + (p.freezePoint != null ? esc(p.freezePoint) : '—') + '</td><td class="num">' + esc(p.cpAbove || '') + '</td><td class="num">' + esc(p.cpBelow || '') + '</td><td class="num">' + esc(p.latentHeat || '') + '</td><td style="font-size:10px">' + esc(p.source || t('dbSourceUnknown')) + '</td>' + rowActions(i) + '</tr>'; }).join('') +
        '</tbody></table>';
    }
    if (currentCollection === 'materials') {
      return '<table class="db-table"><thead><tr><th>' + t('dbColMaterialName') + '</th><th>' + t('dbColK') + '</th><th></th></tr></thead><tbody>' +
        data.map(function (m, i) { return '<tr><td>' + esc(m.name) + '</td><td class="num">' + esc(m.k) + '</td>' + rowActions(i) + '</tr>'; }).join('') +
        '</tbody></table>';
    }
    if (currentCollection === 'respiration') {
      return '<table class="db-table"><thead><tr><th>' + t('dbColProductResp') + '</th><th>' + t('dbColRespValues') + '</th><th></th></tr></thead><tbody>' +
        data.map(function (r, i) { return '<tr><td>' + esc(r.name) + '</td><td style="font-family:var(--font-mono);font-size:11px">' + Object.entries(r.values || {}).map(function (kv) { return esc(kv[0]) + '°C:' + esc(kv[1]); }).join(' · ') + '</td>' + rowActions(i) + '</tr>'; }).join('') +
        '</tbody></table>';
    }
    if (currentCollection === 'doorTypes') {
      return '<table class="db-table"><thead><tr><th>' + t('dbColDoorName') + '</th><th>' + t('dbColOpenMs') + '</th><th>' + t('dbColCloseMs') + '</th><th>' + t('dbColFactor') + '</th><th></th></tr></thead><tbody>' +
        data.map(function (d, i) { return '<tr><td>' + esc(d.name) + '</td><td class="num">' + esc(d.open_ms) + '</td><td class="num">' + esc(d.close_ms) + '</td><td class="num">' + esc(d.factor_s_per_m.toFixed(3)) + '</td>' + rowActions(i) + '</tr>'; }).join('') +
        '</tbody></table>';
    }
    if (currentCollection === 'panelSpecs') {
      return '<table class="db-table"><thead><tr><th>' + t('dbColPanelMaterial') + '</th><th>' + t('dbColThicknesses') + '</th><th></th></tr></thead><tbody>' +
        data.map(function (p, i) { return '<tr><td>' + esc(p.material) + '</td><td>' + esc((p.thicknesses || []).join(', ')) + '</td>' + rowActions(i) + '</tr>'; }).join('') +
        '</tbody></table>';
    }
    if (currentCollection === 'vehicles') {
      return '<table class="db-table"><thead><tr><th>' + t('dbColVehicleName') + '</th><th>' + t('dbColVehicleType') + '</th><th>' + t('dbColCapacity') + '</th><th>' + t('dbColCoefficient') + '</th><th>' + t('dbColPower') + '</th><th></th></tr></thead><tbody>' +
        data.map(function (v, i) { return '<tr><td>' + esc(v.name) + '</td><td>' + (v.type === 'internal' ? t('dbVehicleInternal') : t('dbVehicleDock')) + '</td><td class="num">' + esc(v.capacity_ton_per_hr) + '</td><td class="num">' + esc(v.coefficient) + '</td><td class="num">' + esc(v.power_kw) + '</td>' + rowActions(i) + '</tr>'; }).join('') +
        '</tbody></table>';
    }
    if (currentCollection === 'climateProvinces') {
      return '<table class="db-table"><thead><tr><th>' + t('dbColProvince') + '</th><th>' + t('dbColStation') + '</th><th>' + t('dbColTDesign') + '</th><th>' + t('dbColRHDesign') + '</th><th>' + t('dbColSource') + '</th><th></th></tr></thead><tbody>' +
        data.map(function (p, i) { return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.station) + '</td><td class="num">' + esc(p.T_design) + '</td><td class="num">' + esc(p.RH_design) + '</td><td style="font-size:10px">' + (p.borrowed_from ? tf('dbBorrowedFromTemplate', { province: esc(p.borrowed_from) }) : t('dbSourceQCVN')) + '</td>' + rowActions(i) + '</tr>'; }).join('') +
        '</tbody></table>';
    }
    if (currentCollection === 'packingSpec') {
      return '<table class="db-table"><thead><tr><th>' + t('dbColPanelMaterial') + '</th><th>' + t('dbColPctMass') + '</th><th>' + t('dbColCp') + '</th><th>' + t('dbColMassPerPallet') + '</th><th></th></tr></thead><tbody>' +
        data.map(function (p, i) { return '<tr><td>' + esc(p.material) + '</td><td class="num">' + esc((p.pctMassPerPallet * 100).toFixed(1)) + '%</td><td class="num">' + esc(p.cp) + '</td><td class="num">' + esc(p.massPerPallet) + '</td>' + rowActions(i) + '</tr>'; }).join('') +
        '</tbody></table>';
    }
    if (currentCollection === 'warehouseTypePresets') {
      return '<table class="db-table"><thead><tr><th>' + t('dbColWarehouseName') + '</th><th>' + t('dbColWarehouseH') + '</th><th>' + t('dbColWarehouseOpenings') + '</th><th></th></tr></thead><tbody>' +
        data.map(function (p, i) { return '<tr><td>' + esc(p.label_vi || p.name) + '</td><td class="num">' + esc(p.suggestedH) + ' m</td><td class="num">' + ((p.openings || []).length) + '</td>' + rowActions(i) + '</tr>'; }).join('') +
        '</tbody></table>';
    }
    if (currentCollection === 'rackLayoutConfig') {
      return '<table class="db-table"><thead><tr><th>' + t('dbColRackConfigName') + '</th><th>' + t('dbColRackAisle') + '</th><th>' + t('dbColRackLevelPitch') + '</th><th>' + t('dbColRackBayWidth') + '</th><th></th></tr></thead><tbody>' +
        data.map(function (p, i) { return '<tr><td>' + esc(p.name) + '</td><td class="num">' + esc(p.aisle) + ' m</td><td class="num">' + esc(p.levelPitch) + ' m</td><td class="num">' + esc(p.bayWidth) + ' m</td>' + rowActions(i) + '</tr>'; }).join('') +
        '</tbody></table>';
    }
    return '';
  }

  async function deleteRow(idx) {
    const ok = await App.Modal.confirm(t('modalDeleteConfirmTitle'), t('modalDeleteConfirmDesc'));
    if (!ok) return;
    const data = await App.db.getAll(currentCollection);
    const item = data[idx];
    const keyField = (currentCollection === 'projects' || currentCollection === 'calcHistory' || currentCollection === 'roomCalculations') ? 'id' : (currentCollection === 'panelSpecs' || currentCollection === 'packingSpec') ? 'material' : 'name';
    await App.db.delete(currentCollection, item[keyField]);
    render();
    CSHL_UI.renderInputPanel();
  }

  async function resetToDefaults() {
    const ok = await App.Modal.confirm(t('modalResetConfirmTitle'), t('modalResetConfirmDesc'));
    if (!ok) return;
    const dd = App.DEFAULT_DATA;
    const map = {
      products: dd.products, materials: dd.materials, respiration: dd.respiration,
      doorTypes: dd.doorTypes, panelSpecs: dd.panelSpecs, vehicles: dd.vehicles,
      climateProvinces: Object.keys(dd.climate63).map(function (k) { return Object.assign({ name: k }, dd.climate63[k]); }),
      packingSpec: dd.packingSpec, warehouseTypePresets: dd.warehouseTypePresets, rackLayoutConfig: dd.rackLayoutConfig
    };
    await App.db.resetToDefaults(currentCollection, map[currentCollection] || []);
    render();
    CSHL_UI.renderInputPanel();
  }
  // ── Modal nội bộ thêm/sửa bản ghi (KHÔNG dùng prompt()/confirm()) ──
  async function openModal(idx) {
    editIndex = idx;
    const data = await App.db.getAll(currentCollection);
    const item = idx !== null ? data[idx] : null;
    const overlay = document.getElementById('modalOverlay');
    const box = document.getElementById('modalBox');
    const meta = COLLECTIONS_LIST().find(function (c) { return c.key === currentCollection; });

    let formHtml = '';
    if (currentCollection === 'products') {
      formHtml =
        '<div class="field-grid-modal full"><div><label>' + t('fieldNameLabel') + '</label><input type="text" id="m_name" value="' + esc(item ? item.name : '') + '"></div></div>' +
        '<div class="field-grid-modal full"><div><label>' + t('fieldGroupLabel') + '</label><input type="text" id="m_group" value="' + esc(item ? (item.group || '') : '') + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldMoistureLabel') + '</label><input type="number" id="m_moisture" value="' + (item && item.moisture != null ? item.moisture : '') + '"></div>' +
        '<div><label>' + t('fieldProteinLabel') + '</label><input type="number" id="m_protein" value="' + (item && item.protein != null ? item.protein : '') + '"></div>' +
        '<div><label>' + t('fieldFatLabel') + '</label><input type="number" id="m_fat" value="' + (item && item.fat != null ? item.fat : '') + '"></div>' +
        '<div><label>' + t('fieldCarbLabel') + '</label><input type="number" id="m_carb" value="' + (item && item.carb != null ? item.carb : '') + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldFreezePointLabel') + '</label><input type="number" id="m_freezePoint" value="' + (item && item.freezePoint != null ? item.freezePoint : '') + '"></div>' +
        '<div><label>' + t('fieldLatentHeatLabel') + '</label><input type="number" id="m_latentHeat" value="' + (item && item.latentHeat != null ? item.latentHeat : '') + '"></div>' +
        '<div><label>' + t('fieldCpAboveLabel') + '</label><input type="number" id="m_cpAbove" value="' + (item && item.cpAbove != null ? item.cpAbove : '') + '"></div>' +
        '<div><label>' + t('fieldCpBelowLabel') + '</label><input type="number" id="m_cpBelow" value="' + (item && item.cpBelow != null ? item.cpBelow : '') + '"></div></div>' +
        '<div class="field-grid-modal full"><div><label>' + t('fieldSourceLabel') + '</label><input type="text" id="m_source" value="' + esc(item ? (item.source || '') : 'ASHRAE Refrigeration Handbook — Thermal Properties of Foods') + '"></div></div>';
    } else if (currentCollection === 'materials') {
      formHtml =
        '<div class="field-grid-modal full"><div><label>' + t('fieldMaterialNameLabel') + '</label><input type="text" id="m_name" value="' + esc(item ? item.name : '') + '"></div></div>' +
        '<div class="field-grid-modal full"><div><label>' + t('fieldKLabel') + '</label><input type="number" step="0.001" id="m_k" value="' + (item && item.k != null ? item.k : '') + '"></div></div>';
    } else if (currentCollection === 'respiration') {
      const v = (item && item.values) || {};
      formHtml =
        '<div class="field-grid-modal full"><div><label>' + t('fieldProductNameLabel') + '</label><input type="text" id="m_name" value="' + esc(item ? item.name : '') + '"></div></div>' +
        '<div class="field-grid-modal">' +
        ['0', '5', '10', '15', '20', '25'].map(function (temp) {
          return '<div><label>' + temp + '°C (mW/kg)</label><input type="number" id="m_t' + temp + '" value="' + (v[temp] != null ? v[temp] : '') + '"></div>';
        }).join('') + '</div>';
    } else if (currentCollection === 'doorTypes') {
      formHtml =
        '<div class="field-grid-modal full"><div><label>' + t('fieldDoorNameLabel') + '</label><input type="text" id="m_name" value="' + esc(item ? item.name : '') + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldOpenVelocityLabel') + '</label><input type="number" step="0.05" id="m_open_ms" value="' + (item ? item.open_ms : 0.2) + '"></div>' +
        '<div><label>' + t('fieldCloseVelocityLabel') + '</label><input type="number" step="0.05" id="m_close_ms" value="' + (item ? item.close_ms : 0.2) + '"></div>' +
        '<div><label>' + t('fieldFactorLabel') + '</label><input type="number" step="0.1" id="m_factor" value="' + (item ? item.factor_s_per_m : 5) + '"></div></div>';
    } else if (currentCollection === 'panelSpecs') {
      formHtml =
        '<div class="field-grid-modal full"><div><label>' + t('fieldPanelMaterialLabel') + '</label><input type="text" id="m_material" value="' + esc(item ? item.material : '') + '"></div></div>' +
        '<div class="field-grid-modal full"><div><label>' + t('fieldThicknessesLabel') + '</label><input type="text" id="m_thicknesses" value="' + esc(item ? (item.thicknesses || []).join(',') : '') + '"></div></div>';
    } else if (currentCollection === 'vehicles') {
      const vtype = (item && item.type) || 'internal';
      formHtml =
        '<div class="field-grid-modal full"><div><label>' + t('fieldVehicleNameLabel') + '</label><input type="text" id="m_name" value="' + esc(item ? item.name : '') + '"></div></div>' +
        '<div class="field-grid-modal full"><div><label>' + t('fieldVehicleTypeLabel') + '</label><select id="m_type">' +
        '<option value="internal"' + (vtype === 'internal' ? ' selected' : '') + '>' + t('dbVehicleInternal') + '</option>' +
        '<option value="dock"' + (vtype === 'dock' ? ' selected' : '') + '>' + t('dbVehicleDock') + '</option></select></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldCapacityLabel') + '</label><input type="number" step="0.1" id="m_capacity" value="' + (item ? item.capacity_ton_per_hr : 25) + '"></div>' +
        '<div><label>' + t('fieldCoefficientLabel') + '</label><input type="number" step="0.05" id="m_coefficient" value="' + (item ? item.coefficient : 0.7) + '"></div>' +
        '<div><label>' + t('fieldPowerLabel') + '</label><input type="number" step="0.1" id="m_power" value="' + (item ? item.power_kw : 13.1) + '"></div></div>';
    } else if (currentCollection === 'climateProvinces') {
      formHtml =
        '<div class="field-grid-modal full"><div><label>' + t('fieldProvinceLabel') + '</label><input type="text" id="m_name" value="' + esc(item ? item.name : '') + '"></div></div>' +
        '<div class="field-grid-modal full"><div><label>' + t('fieldStationLabel') + '</label><input type="text" id="m_station" value="' + esc(item ? item.station : '') + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldTDesignLabel') + '</label><input type="number" step="0.1" id="m_T_design" value="' + (item ? item.T_design : 35) + '"></div>' +
        '<div><label>' + t('fieldRHDesignLabel') + '</label><input type="number" step="0.1" id="m_RH_design" value="' + (item ? item.RH_design : 80) + '"></div></div>' +
        '<div class="moisture-note">' + t('fieldClimateEditNote') + '</div>';
    } else if (currentCollection === 'packingSpec') {
      formHtml =
        '<div class="field-grid-modal full"><div><label>' + t('fieldPackingMaterialLabel') + '</label><input type="text" id="m_material" value="' + esc(item ? item.material : '') + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldPctMassLabel') + '</label><input type="number" step="0.01" id="m_pct" value="' + (item ? item.pctMassPerPallet : 0.05) + '"></div>' +
        '<div><label>' + t('fieldCpLabel') + '</label><input type="number" step="0.1" id="m_cp" value="' + (item ? item.cp : 1.4) + '"></div>' +
        '<div><label>' + t('fieldMassPerPalletLabel') + '</label><input type="number" step="0.1" id="m_mass" value="' + (item ? item.massPerPallet : 0.5) + '"></div></div>';
    } else if (currentCollection === 'warehouseTypePresets') {
      formHtml =
        '<div class="field-grid-modal full"><div><label>' + t('fieldWarehouseKeyLabel') + '</label><input type="text" id="m_name" value="' + esc(item ? item.name : '') + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldWarehouseLabelViLabel') + '</label><input type="text" id="m_label_vi" value="' + esc(item ? item.label_vi : '') + '"></div>' +
        '<div><label>' + t('fieldWarehouseLabelEnLabel') + '</label><input type="text" id="m_label_en" value="' + esc(item ? item.label_en : '') + '"></div></div>' +
        '<div class="field-grid-modal full"><div><label>' + t('fieldWarehouseHeightLabel') + '</label><input type="number" step="0.5" id="m_suggestedH" value="' + (item ? item.suggestedH : 6) + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldWarehouseLengthLabel') + '</label><input type="number" step="0.5" id="m_suggestedL" value="' + (item ? item.suggestedL : 40) + '"></div>' +
        '<div><label>' + t('fieldWarehouseWidthLabel') + '</label><input type="number" step="0.5" id="m_suggestedW" value="' + (item ? item.suggestedW : 25) + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldWarehouseLevelsLabel') + '</label><input type="number" step="1" id="m_levels" value="' + (item && item.levels != null ? item.levels : '') + '"></div>' +
        '<div><label>' + t('fieldWarehouseDensityLabel') + '</label><input type="number" step="0.01" id="m_densityPerM2PerLevel" value="' + (item ? item.densityPerM2PerLevel : 0.4) + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldWarehouseEvapLabel') + '</label><input type="number" step="1" id="m_n_evap" value="' + (item ? item.n_evap : '') + '"></div>' +
        '<div><label>' + t('fieldWarehouseFanPerEvapLabel') + '</label><input type="number" step="1" id="m_fan_per_evap" value="' + (item ? item.fan_per_evap : '') + '"></div>' +
        '<div><label>' + t('fieldWarehouseKwFanLabel') + '</label><input type="number" step="0.01" id="m_kw_fan" value="' + (item ? item.kw_fan : '') + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldWarehousePeopleLabel') + '</label><input type="number" step="1" id="m_n_people" value="' + (item && item.n_people != null ? item.n_people : '') + '"></div></div>' +
        '<div class="field-grid-modal full"><div><label>' + t('fieldWarehouseVehicleAllowedLabel') + '</label><input type="text" id="m_internalVehicleAllowed" value="' + esc(item ? (item.internalVehicleAllowed || []).join(', ') : '') + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldWarehouseVehicleDefaultLabel') + '</label><input type="text" id="m_internalVehicleDefault" value="' + esc(item ? item.internalVehicleDefault : '') + '"></div>' +
        '<div><label>' + t('fieldWarehouseForkliftCountLabel') + '</label><input type="number" step="1" id="m_n_forklift_internal" value="' + (item && item.n_forklift_internal != null ? item.n_forklift_internal : '') + '"></div></div>' +
        '<div class="field-grid-modal full"><div><label>' + t('fieldWarehouseNoteLabel') + '</label><input type="text" id="m_note" value="' + esc(item ? (item.note || '') : '') + '"></div></div>' +
        '<div class="field-grid-modal full"><div><label>' + t('fieldWarehouseOpeningsLabel') + '</label>' +
        '<textarea id="m_openings" rows="8" style="font-family:var(--font-mono);font-size:11px;width:100%">' + esc(item ? JSON.stringify(item.openings || [], null, 2) : '[]') + '</textarea>' +
        '<div class="moisture-note">' + t('fieldWarehouseOpeningsHelp') + '</div></div>';
    } else if (currentCollection === 'rackLayoutConfig') {
      formHtml =
        '<div class="field-grid-modal full"><div><label>' + t('fieldRackConfigNameLabel') + '</label><input type="text" id="m_name" value="' + esc(item ? item.name : 'default') + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldRackPalletDepthLabel') + '</label><input type="number" step="0.01" id="m_palletDepth" value="' + (item ? item.palletDepth : 1.0) + '"></div>' +
        '<div><label>' + t('fieldRackBayWidthLabel') + '</label><input type="number" step="0.01" id="m_bayWidth" value="' + (item ? item.bayWidth : 2.39) + '"></div>' +
        '<div><label>' + t('fieldRackAisleLabel') + '</label><input type="number" step="0.05" id="m_aisle" value="' + (item ? item.aisle : 3.6) + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldRackWallClearanceLabel') + '</label><input type="number" step="0.005" id="m_wallClearance" value="' + (item ? item.wallClearance : 0.125) + '"></div>' +
        '<div><label>' + t('fieldRackFlueGapLabel') + '</label><input type="number" step="0.005" id="m_flueGap" value="' + (item ? item.flueGap : 0.125) + '"></div></div>' +
        '<div class="field-grid-modal">' +
        '<div><label>' + t('fieldRackLevelPitchLabel') + '</label><input type="number" step="0.05" id="m_levelPitch" value="' + (item ? item.levelPitch : 1.8) + '"></div>' +
        '<div><label>' + t('fieldRackBottomClearanceLabel') + '</label><input type="number" step="0.01" id="m_bottomClearance" value="' + (item ? item.bottomClearance : 0.25) + '"></div>' +
        '<div><label>' + t('fieldRackTopClearanceLabel') + '</label><input type="number" step="0.05" id="m_topClearance" value="' + (item ? item.topClearance : 2.3) + '"></div></div>' +
        '<div class="moisture-note">' + t('fieldRackConfigHelp') + '</div>';
    }

    box.innerHTML = '<h3>' + (idx !== null ? t('modalEditTitle') : t('modalAddTitle')) + ' — ' + meta.label + '</h3>' + formHtml +
      '<div class="modal-actions"><button class="btn-cancel" onclick="CSHL_Admin.closeModal()">' + t('btnCancel') + '</button>' +
      '<button class="btn-primary" onclick="CSHL_Admin.saveModal()">' + t('modalSaveBtn') + '</button></div>';
    overlay.classList.add('open');
  }

  function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

  async function saveModal() {
    const data = await App.db.getAll(currentCollection);
    let item = {};
    const val = function (id) { const el = document.getElementById(id); return el ? el.value : undefined; };
    const numVal = function (id) { const v = val(id); return (v === undefined || v === '') ? null : parseFloat(v); };

    if (currentCollection === 'products') {
      item = { name: val('m_name'), group: val('m_group'), moisture: numVal('m_moisture'), protein: numVal('m_protein'),
        fat: numVal('m_fat'), carb: numVal('m_carb'), freezePoint: numVal('m_freezePoint'), latentHeat: numVal('m_latentHeat'),
        cpAbove: numVal('m_cpAbove'), cpBelow: numVal('m_cpBelow'), source: val('m_source') };
    } else if (currentCollection === 'materials') {
      item = { name: val('m_name'), k: numVal('m_k') };
    } else if (currentCollection === 'respiration') {
      const values = {};
      ['0', '5', '10', '15', '20', '25'].forEach(function (temp) { const v = numVal('m_t' + temp); if (v != null) values[temp] = v; });
      item = { name: val('m_name'), values: values };
    } else if (currentCollection === 'doorTypes') {
      item = { name: val('m_name'), open_ms: numVal('m_open_ms'), close_ms: numVal('m_close_ms'), factor_s_per_m: numVal('m_factor') };
    } else if (currentCollection === 'panelSpecs') {
      item = { material: val('m_material'), thicknesses: (val('m_thicknesses') || '').split(',').map(function (s) { return parseFloat(s.trim()); }).filter(function (n) { return !isNaN(n); }) };
    } else if (currentCollection === 'vehicles') {
      item = { name: val('m_name'), type: val('m_type'), capacity_ton_per_hr: numVal('m_capacity'), coefficient: numVal('m_coefficient'), power_kw: numVal('m_power') };
    } else if (currentCollection === 'climateProvinces') {
      item = { name: val('m_name'), station: val('m_station'), T_design: numVal('m_T_design'), RH_design: numVal('m_RH_design') };
    } else if (currentCollection === 'packingSpec') {
      item = { material: val('m_material'), pctMassPerPallet: numVal('m_pct'), cp: numVal('m_cp'), massPerPallet: numVal('m_mass') };
    } else if (currentCollection === 'warehouseTypePresets') {
      let openings = [];
      try { openings = JSON.parse(val('m_openings') || '[]'); } catch (e) {
        await App.Modal.alert(t('modalImportErrorTitle'), tf('modalImportErrorDesc', { msg: e.message }));
        return;
      }
      item = {
        name: val('m_name'), label_vi: val('m_label_vi'), label_en: val('m_label_en'),
        suggestedH: numVal('m_suggestedH'), suggestedL: numVal('m_suggestedL'), suggestedW: numVal('m_suggestedW'),
        levels: document.getElementById('m_levels').value === '' ? null : numVal('m_levels'),
        densityPerM2PerLevel: numVal('m_densityPerM2PerLevel'),
        n_evap: numVal('m_n_evap'), fan_per_evap: numVal('m_fan_per_evap'), kw_fan: numVal('m_kw_fan'),
        n_people: numVal('m_n_people'),
        internalVehicleAllowed: val('m_internalVehicleAllowed').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
        internalVehicleDefault: val('m_internalVehicleDefault'), n_forklift_internal: numVal('m_n_forklift_internal'),
        note: val('m_note'), openings: openings
      };
    } else if (currentCollection === 'rackLayoutConfig') {
      item = {
        name: val('m_name'), palletDepth: numVal('m_palletDepth'), bayWidth: numVal('m_bayWidth'),
        aisle: numVal('m_aisle'), wallClearance: numVal('m_wallClearance'), flueGap: numVal('m_flueGap'),
        levelPitch: numVal('m_levelPitch'), bottomClearance: numVal('m_bottomClearance'), topClearance: numVal('m_topClearance')
      };
    }

    if (editIndex !== null) {
      const old = data[editIndex];
      const keyField = (currentCollection === 'projects' || currentCollection === 'calcHistory' || currentCollection === 'roomCalculations') ? 'id' : (currentCollection === 'panelSpecs' || currentCollection === 'packingSpec') ? 'material' : 'name';
      if (old[keyField] !== item[keyField]) await App.db.delete(currentCollection, old[keyField]);
    }
    await App.db.put(currentCollection, item);
    closeModal();
    render();
    CSHL_UI.renderInputPanel();
  }

  // ── Export/Import JSON ──
  async function exportJSON() {
    const all = await App.db.exportAll();
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'coldstorage_heatload_database.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const obj = JSON.parse(text);
        await App.db.importAll(obj);
        await App.Modal.alert(t('modalImportSuccessTitle'), t('modalImportSuccessDesc'));
        render();
        CSHL_UI.renderInputPanel();
      } catch (err) {
        await App.Modal.alert(t('modalImportErrorTitle'), tf('modalImportErrorDesc', { msg: err.message }));
      }
    };
    input.click();
  }

  // ── Import .xlsx/.csv (SheetJS) — đọc trực tiếp, parse, ghi thẳng vào IndexedDB ──
  function ensureSheetJS() {
    return new Promise(function (resolve, reject) {
      if (window.XLSX) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'vendor/xlsx.full.min.js';
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error(t('modalSheetJSErrorDesc'))); };
      document.head.appendChild(script);
    });
  }

  function importSpreadsheet() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.xlsx,.xls,.csv';
    input.onchange = async function (e) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await ensureSheetJS();
        const data = await file.arrayBuffer();
        const wb = window.XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
        if (!rows.length) { await App.Modal.alert(t('modalImportErrorTitle'), t('modalImportNoDataDesc')); return; }
        const mapped = mapSpreadsheetRows(rows);
        if (!mapped.length) { await App.Modal.alert(t('modalImportErrorTitle'), tf('modalImportNoMatchDesc', { coll: currentCollection })); return; }
        const ok = await App.Modal.confirm(t('modalImportConfirmTitle'), tf('modalImportConfirmDesc', { n: mapped.length, coll: currentCollection }));
        if (!ok) return;
        await App.db.putMany(currentCollection, mapped);
        await App.Modal.alert(t('modalImportSuccessTitle'), tf('modalImportFinalSuccessDesc', { n: mapped.length }));
        render();
        CSHL_UI.renderInputPanel();
      } catch (err) {
        await App.Modal.alert(t('modalImportErrorTitle'), tf('modalImportFileErrorDesc', { msg: err.message }));
      }
    };
    input.click();
  }

  // Map các tên cột linh hoạt (VN/EN) về đúng field của từng collection
  function mapSpreadsheetRows(rows) {
    const pick = function (row, keys) {
      for (const k of keys) { if (row[k] !== undefined && row[k] !== null) return row[k]; }
      return null;
    };
    if (currentCollection === 'products') {
      return rows.filter(function (r) { return pick(r, ['name', 'Tên', 'Tên sản phẩm']); }).map(function (r) {
        return {
          name: pick(r, ['name', 'Tên', 'Tên sản phẩm']),
          group: pick(r, ['group', 'Nhóm', 'Group']),
          moisture: pick(r, ['moisture', 'Độ ẩm']), protein: pick(r, ['protein', 'Protein']),
          fat: pick(r, ['fat', 'Chất béo']), carb: pick(r, ['carb', 'Carb']),
          freezePoint: pick(r, ['freezePoint', 'T đóng băng', 'Freeze Point']),
          latentHeat: pick(r, ['latentHeat', 'Nhiệt ẩn', 'Latent Heat']),
          cpAbove: pick(r, ['cpAbove', 'Cp trên', 'Cp Above']),
          cpBelow: pick(r, ['cpBelow', 'Cp dưới', 'Cp Below'])
        };
      });
    }
    if (currentCollection === 'materials') {
      return rows.filter(function (r) { return pick(r, ['name', 'Tên', 'Material']); }).map(function (r) {
        return { name: pick(r, ['name', 'Tên', 'Material']), k: pick(r, ['k', 'K']) };
      });
    }
    if (currentCollection === 'climateProvinces') {
      return rows.filter(function (r) { return pick(r, ['name', 'Tỉnh', 'Province']); }).map(function (r) {
        return {
          name: pick(r, ['name', 'Tỉnh', 'Province']), station: pick(r, ['station', 'Trạm', 'Station']),
          T_design: pick(r, ['T_design', 'T thiết kế']), RH_design: pick(r, ['RH_design', 'RH thiết kế'])
        };
      });
    }
    return rows.filter(function (r) { return pick(r, ['name', 'Tên']); });
  }

  return {
    render: render, switchCollection: switchCollection, search: search,
    deleteRow: deleteRow, resetToDefaults: resetToDefaults,
    openModal: openModal, closeModal: closeModal, saveModal: saveModal,
    exportJSON: exportJSON, importJSON: importJSON, importSpreadsheet: importSpreadsheet,
    get currentCollection() { return currentCollection; },
    get editIndex() { return editIndex; }, set editIndex(v) { editIndex = v; }
  };
})();
