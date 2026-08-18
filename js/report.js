// ===== report.js =====
// ═══════════════════════════════════════════════════════════════
//  MODULE: report — Xuất báo cáo PDF (mộc PASS) + Excel
//  [Yêu cầu mới] Hỗ trợ xuất TOÀN BỘ dự án (nhiều phòng/kho đã lưu) cùng lúc,
//  không chỉ phòng đang xem hiện tại — tránh xuất báo cáo rời rạc từng kho.
// ═══════════════════════════════════════════════════════════════
window.CSHL_Report = (function () {
  'use strict';
  const App = window.ColdStorageHeatLoad;
  const t = function (k) { return CSHL_I18N.t(k); };
  const esc = App.util.escapeHtml;
  const tf = function (k, v) { return CSHL_I18N.tf(k, v); };

  const DIAG_LABEL_KEYS = {
    no_negative_inputs: 'diagNoNegative', room_colder_than_ambient: 'diagRoomColder',
    product_cooled_not_heated: 'diagProductCooled', u_value_walls_reasonable: 'diagUValue',
    vehicle_hours_within_day: 'diagVehicleHours', safety_factor_typical: 'diagSafetyFactor',
    rh_in_valid_range: 'diagRHRange', load_density_reasonable: 'diagLoadDensity'
  };
  function diagLabel(it) { return t(DIAG_LABEL_KEYS[it.id] || it.id); }
  function pct(v, subtotal) { return ((v / subtotal) * 100).toFixed(1) + '%'; }
  function shapeLabel(r) { return r.geom.shape === 'rect' ? t('reportShapeRect') : r.geom.shape === 'ushape' ? t('reportShapeU') : t('reportShapeL'); }

  // ── Đánh giá mức độ tin cậy thông số đầu vào — dựa trên việc có dùng preset/giá trị
  // ước lượng/dữ liệu mượn hay không. ──
  function computeConfidenceFlags(i) {
    const flags = [];
    if (i.warehouseType) {
      const label = t('warehouseType' + i.warehouseType.charAt(0).toUpperCase() + i.warehouseType.slice(1));
      flags.push(tf('reportConfidenceFlagWarehouse', { type: label }));
    }
    if (i.provinceBorrowedFrom) {
      flags.push(tf('reportConfidenceFlagProvince', { province: i.provinceBorrowedFrom }));
    }
    if (i.openings && i.openings.some(function (o) { return o.refType && o.refType.indexOf('Stack effect') >= 0; })) {
      flags.push(t('reportConfidenceFlagStack'));
    }
    let rackTooSmall = false;
    if (i.rackLayoutTooSmall) {
      flags.push(t('reportConfidenceFlagRackTooSmall'));
      rackTooSmall = true;
    }
    let level;
    if (rackTooSmall) level = t('reportConfidenceLow');
    else if (flags.length === 0) level = t('reportConfidenceHigh');
    else if (flags.length <= 2) level = t('reportConfidenceMedium');
    else level = t('reportConfidenceLow');
    return { flags: flags, level: level };
  }

  async function render() {
    const wrap = document.getElementById('reportContent');
    const r = CSHL_UI.lastResult;
    const proj = await CSHL_Projects.getCurrentProject();
    const projectRooms = proj ? await CSHL_Projects.getProjectRooms(proj.id) : [];
    const history = (await App.db.getAll('calcHistory')).slice(-10).reverse();
    const locale = CSHL_I18N.getLang() === 'en' ? 'en-US' : 'vi-VN';

    let diagSummary = '';
    if (r) {
      const diag = r.diagnostics;
      if (diag.errors.length > 0) diagSummary = tf('diagSummaryFail', { n: diag.errors.length });
      else if (diag.warnings.length > 0) diagSummary = tf('diagSummaryPassWarn', { n: diag.warnings.length });
      else diagSummary = tf('diagSummaryPass', { n: diag.items.length });
    }

    wrap.innerHTML =
      '<div class="settings-card"><h3>' + t('reportExportTitle') + '</h3>' +
      '<p style="font-size:12px;color:var(--slate-400);margin-bottom:14px">' + tf('reportExportDescTemplate', { name: esc(proj ? proj.name : '—') }) + '</p>' +
      (r ?
        '<div class="info-banner ok">' + tf('reportReadyTemplate', { kw: r.Q_total_kW.toFixed(2), diag: diagSummary }) + '</div>' :
        '<div class="info-banner info">' + t('reportNotReady') + '</div>') +
      '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
      '<button class="calc-btn" style="margin:0;flex:1;min-width:160px" onclick="CSHL_Report.exportPDF()"><i data-lucide="file-text" style="vertical-align:-3px;margin-right:6px"></i>' + t('reportPdfBtn') + '</button>' +
      '<button class="calc-btn btn-secondary" style="margin:0;flex:1;min-width:160px" onclick="CSHL_Report.exportExcel()"><i data-lucide="file-spreadsheet" style="vertical-align:-3px;margin-right:6px"></i>' + t('reportExcelBtn') + '</button>' +
      '</div></div>' +

      '<div class="settings-card"><h3>' + t('reportProjectExportTitle') + '</h3>' +
      (projectRooms.length ?
        '<div class="info-banner ok">' + tf('reportProjectReadyTemplate', { n: projectRooms.length }) + '</div>' +
        '<div style="font-size:12px;color:var(--slate-400);margin-bottom:14px">' +
        projectRooms.map(function (rm) { return '• ' + esc(rm.roomName) + ' (' + rm.result.Q_total_kW.toFixed(1) + ' kW)'; }).join('<br>') + '</div>' :
        '<div class="info-banner info">' + t('reportProjectEmptyDesc') + '</div>') +
      '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
      '<button class="calc-btn" style="margin:0;flex:1;min-width:160px" ' + (projectRooms.length ? '' : 'disabled') + ' onclick="CSHL_Report.exportProjectPDF()"><i data-lucide="files" style="vertical-align:-3px;margin-right:6px"></i>' + t('reportProjectPdfBtn') + '</button>' +
      '<button class="calc-btn btn-secondary" style="margin:0;flex:1;min-width:160px" ' + (projectRooms.length ? '' : 'disabled') + ' onclick="CSHL_Report.exportProjectExcel()"><i data-lucide="file-spreadsheet" style="vertical-align:-3px;margin-right:6px"></i>' + t('reportProjectExcelBtn') + '</button>' +
      '</div></div>' +

      '<div class="settings-card"><h3>' + t('reportHistoryTitle') + '</h3>' +
      (history.length ?
        '<table class="result-table"><thead><tr><th>' + t('reportColTime') + '</th><th>' + t('reportColRoom') + '</th><th>' + t('reportColPower') + '</th><th>' + t('reportColDensity') + '</th></tr></thead><tbody>' +
        history.map(function (h) { return '<tr><td>' + new Date(h.time).toLocaleString(locale) + '</td><td>' + esc(h.roomName) + '</td><td>' + h.Q_total_kW.toFixed(2) + '</td><td>' + h.Q_per_m3.toFixed(2) + '</td></tr>'; }).join('') + '</tbody></table>' :
        '<div style="font-size:12px;color:var(--slate-500)">' + t('reportNoHistory') + '</div>') +
      '</div>';
    if (window.lucide) lucide.createIcons();
  }

  function buildRoomSectionHtml(r, i, roomName, proj, isFirstPage) {
    const subtotal = r.Q_subtotal;
    const diag = r.diagnostics;
    const locale = CSHL_I18N.getLang() === 'en' ? 'en-US' : 'vi-VN';

    const stampHtml = '<div style="display:inline-block;border:3px solid ' + (diag.overallPass ? '#16c491' : '#f2496b') + ';color:' + (diag.overallPass ? '#16c491' : '#f2496b') + ';font-weight:800;font-size:22px;padding:8px 20px;border-radius:8px;transform:rotate(-4deg);font-family:monospace">' + (diag.overallPass ? t('diagPassLabel') : t('diagFailLabel')) + '</div>';

    let aiCertHtml = '';
    if (r.aiCertification) {
      const c = r.aiCertification;
      const certColor = c.overallPass ? '#16c491' : '#f59e0b';
      const certLabel = c.overallPass ? t('aiCertifyPassStamp') : t('aiCertifyReviewStamp');
      aiCertHtml = '<div style="margin-top:10px;display:inline-block;border:3px solid ' + certColor + ';color:' + certColor + ';font-weight:800;font-size:16px;padding:6px 16px;border-radius:8px;transform:rotate(-2deg);font-family:monospace">' + certLabel + '</div>' +
        '<div style="font-size:10px;color:#888;margin-top:4px">' + new Date(c.timestamp).toLocaleString(locale) + ' — ' + t('aiCertifyDisclaimer') + '</div>' +
        '<div style="margin-top:10px;padding:10px;background:#f8fafc;border:1px solid #ddd;border-radius:6px;font-size:11px;white-space:pre-wrap">' + c.text.replace(/</g, '&lt;') + '</div>';
    }

    const pageBreak = isFirstPage ? '' : 'page-break-before:always;';
    return '<div style="' + pageBreak + 'padding-top:' + (isFirstPage ? '0' : '20px') + '">' +
      '<h1>' + t('reportTitle') + ' — ' + esc(roomName) + '</h1>' +
      '<table><tr><td class="label">' + t('reportClient') + '</td><td>' + esc(proj.client || '—') + '</td><td class="label">' + t('reportProjectName') + '</td><td>' + esc(proj.name || '—') + '</td></tr>' +
      '<tr><td class="label">' + t('reportAddress') + '</td><td colspan="3">' + esc(proj.address || '—') + '</td></tr>' +
      '<tr><td class="label">' + t('reportEngineer') + '</td><td>' + esc(proj.engineer || '—') + '</td><td class="label">' + t('reportDate') + '</td><td>' + esc(proj.date || new Date().toLocaleDateString(locale)) + '</td></tr></table>' +
      stampHtml + aiCertHtml +
      (function () {
        const conf = computeConfidenceFlags(i);
        return '<div style="margin-top:14px;padding:10px 14px;background:#f8fafc;border:1px solid #ddd;border-radius:6px">' +
          '<div style="font-weight:700;font-size:12px;margin-bottom:4px">' + t('reportConfidenceTitle') + ': ' + conf.level + '</div>' +
          (conf.flags.length ? '<ul style="font-size:11px;color:#444;margin:6px 0 0;padding-left:18px;line-height:1.7">' + conf.flags.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>' : '') +
          '</div>' +
          '<p style="font-size:10px;color:#888;margin:8px 0 0;font-style:italic">' + t('reportExpMarkFootnote') + '</p>';
      })() +
      '<h2>' + t('reportSec1') + '</h2>' +
      '<table><tr><td>' + t('reportShape') + '</td><td>' + shapeLabel(r) + '</td></tr>' +
      '<tr><td>' + t('reportWarehouseType') + '</td><td>' + (i.warehouseType ? (t('warehouseType' + i.warehouseType.charAt(0).toUpperCase() + i.warehouseType.slice(1)) + ' *') : t('reportWarehouseTypeCustom')) + '</td></tr>' +
      '<tr><td>' + t('reportFloorArea') + '</td><td>' + r.geom.area.toFixed(2) + ' m²</td></tr>' +
      '<tr><td>' + t('reportVolume') + '</td><td>' + r.geom.volume.toFixed(2) + ' m³</td></tr></table>' +
      '<h2>' + t('reportSec2') + '</h2>' +
      '<table><tr><td>' + t('reportRegion') + '</td><td>' + (i.province || t('reportRegionManual')) + '</td></tr>' +
      '<tr><td>' + t('reportOutdoor') + '</td><td>' + i.T_amb + '°C, RH ' + i.RH_amb + '%</td></tr><tr><td>' + t('reportIndoor') + '</td><td>' + i.T_room + '°C, RH ' + i.RH_room + '%</td></tr></table>' +
      '<h2>' + t('reportSec3') + '</h2>' +
      '<table><tr><th>' + t('reportItem') + '</th><th class="right">kW</th><th class="right">%</th></tr>' +
      '<tr><td>' + t('reportQ1') + '</td><td class="right">' + r.Q_trans.toFixed(3) + '</td><td class="right">' + pct(r.Q_trans, subtotal) + '</td></tr>' +
      '<tr><td>' + t('reportQ2') + '</td><td class="right">' + r.Q_product.toFixed(3) + '</td><td class="right">' + pct(r.Q_product, subtotal) + '</td></tr>' +
      '<tr><td>' + t('reportQ3') + '</td><td class="right">' + r.Q_infiltration.toFixed(3) + '</td><td class="right">' + pct(r.Q_infiltration, subtotal) + '</td></tr>' +
      '<tr><td>' + t('reportQ4') + '</td><td class="right">' + r.Q_internal.toFixed(3) + '</td><td class="right">' + pct(r.Q_internal, subtotal) + '</td></tr>' +
      '<tr><td>' + t('reportQ5') + '</td><td class="right">' + r.Q_moisture_total.toFixed(3) + '</td><td class="right">' + pct(r.Q_moisture_total, subtotal) + '</td></tr>' +
      '<tr style="font-weight:700"><td>' + t('reportSubtotal') + '</td><td class="right">' + subtotal.toFixed(3) + '</td><td class="right">100%</td></tr>' +
      '<tr><td>' + t('reportSafetyFactor') + '</td><td class="right">' + (r.safety * 100).toFixed(0) + '%</td><td></td></tr>' +
      '<tr style="font-weight:800;background:#ecfdf5"><td>' + t('reportRequiredCapacity') + '</td><td class="right">' + r.Q_total_kW.toFixed(2) + ' kW</td><td class="right">' + (r.Q_total_kW / 3.517).toFixed(1) + ' TR</td></tr>' +
      '<tr><td>' + t('reportPowerDensityArea') + '</td><td class="right" colspan="2">' + (r.Q_total_kW * 1000 / r.geom.area).toFixed(1) + ' W/m²</td></tr>' +
      '<tr><td>' + t('reportPowerDensityVolume') + '</td><td class="right" colspan="2">' + (r.Q_total_kW * 1000 / r.geom.volume).toFixed(2) + ' W/m³</td></tr></table>' +
      '<h2>' + t('reportSecMaterial') + '</h2>' +
      '<table><tr><td>' + t('reportWallPanel') + '</td><td>' + (i.panelMaterial || '—') + ', ' + (i.panelThickness || '—') + ' mm</td></tr>' +
      '<tr><td>' + t('reportUValue') + ' (' + t('reportWallPanel') + ')</td><td>' + r.U_wall.toFixed(4) + ' W/m²K</td></tr>' +
      '<tr><td>' + t('reportFloorPanel') + '</td><td>' + (i.floorMaterial || '—') + ', ' + (i.floorThickness || '—') + ' mm</td></tr>' +
      '<tr><td>' + t('reportUValue') + ' (' + t('reportFloorPanel') + ')</td><td>' + r.U_floor.toFixed(4) + ' W/m²K</td></tr></table>' +
      '<h2>' + t('reportSecProduct') + '</h2>' +
      '<table><tr><td>' + t('reportProductName') + '</td><td>' + (i.productName || '—') + '</td></tr>' +
      '<tr><td>' + t('reportTinTfinal') + '</td><td>' + i.T_in + '°C → ' + i.T_final + '°C</td></tr>' +
      '<tr><td>' + t('reportPulldownTime') + '</td><td>' + i.pulldown + ' ' + (locale === 'en-US' ? 'hr' : 'giờ') + '</td></tr>' +
      '<tr><td>' + t('reportStorageMode') + '</td><td>' + (i.storageCapacityMode === 'pallet' ? (t('storagePallet') + ' — ' + (i.palletCount || 0) + ' × ' + (i.palletWeight || 0) + ' kg') : t('storageManual') + ' — ' + (i.mass_total_manual || 0) + ' kg') + '</td></tr>' +
      (i.storageCapacityMode === 'pallet' ? '<tr><td>' + t('reportPalletMethodLabel') + '</td><td>' + t('reportPalletMethod_' + (i.palletCountMethod || 'manual')) + '</td></tr>' : '') +
      '<tr><td>' + t('reportThroughputMode') + '</td><td>' + (i.throughputMode === 'dock' ? (t('throughputDock') + ' — ' + (i.nDocks || 0) + ' dock') : i.throughputMode === 'turnoverPct' ? (t('throughputPct') + ' — ' + (i.turnoverPct || 0) + '%') : (t('throughputManual') + ' — ' + (i.mass_in_manual || 0) + ' kg')) + '</td></tr>' +
      (i.lightingWm2 ? '<tr><td>' + t('lightingWm2Label') + ' *</td><td>' + i.lightingWm2 + ' W/m² (' + t('reportLightingMethod_' + (i.lightingMethod || 'manual')) + ') × ' + i.t_lights + ' ' + (locale === 'en-US' ? 'h/day' : 'giờ/ngày') + (i.syncLightingHours ? ' (' + t('reportLightingSynced') + ')' : '') + '</td></tr>' : '') +
      '</table>' +
      '<h2>' + t('reportSec4') + '</h2>' +
      '<table><tr><th>' + t('reportItem') + '</th><th>' + t('reportDiagResult') + '</th></tr>' +
      diag.items.map(function (it) { return '<tr><td>' + diagLabel(it) + '</td><td>' + (it.passed ? t('reportPass') : (it.severity === 'error' ? t('reportFail') : t('reportWarn'))) + '</td></tr>'; }).join('') +
      '</table>' +
      '<h2>' + t('reportSecStandards') + '</h2>' +
      '<p style="font-size:11px;font-weight:700;color:#222;margin:10px 0 4px">' + t('reportStdListTitle') + '</p>' +
      '<ul style="font-size:11px;color:#555;line-height:1.8;margin:0;padding-left:18px">' +
      t('reportStdList').split(';;').map(function (s) { return '<li>' + s + '</li>'; }).join('') +
      '</ul>' +
      '<p style="font-size:11px;font-weight:700;color:#8a5300;margin:14px 0 4px">' + t('reportExpListTitle') + '</p>' +
      '<ul style="font-size:11px;color:#555;line-height:1.8;margin:0;padding-left:18px">' +
      t('reportExpList').split(';;').map(function (s) { return '<li>' + s + '</li>'; }).join('') +
      '</ul>' +
      '<p style="margin-top:24px;font-size:10px;color:#888">' + tf('reportFooterTemplate', { date: new Date().toLocaleString(locale) }) + '</p>' +
      '</div>';
  }

  function wrapHtmlDocument(title, bodyHtml) {
    return '<html><head><meta charset="UTF-8"><title>' + title + '</title><style>' +
      'body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:13px;line-height:1.6}' +
      'h1{font-size:18px;border-bottom:2px solid #333;padding-bottom:8px}h2{font-size:14px;margin-top:20px;color:#0369a1}' +
      'table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}td,th{border:1px solid #ccc;padding:6px 10px;text-align:left}' +
      'th{background:#f1f5f9}.label{color:#666;font-size:11px}.right{text-align:right}' +
      '@media print{ .page-break{page-break-before:always} }' +
      '</style></head><body>' + bodyHtml + '</body></html>';
  }

  // ── Mở/chia sẻ báo cáo HTML (dùng để "in ra PDF") ──
  // Native (đã đóng gói + có @capacitor/filesystem + @capacitor/share): chia sẻ file .html
  // qua Share Sheet của hệ điều hành (người dùng có thể chọn "In" hoặc "Lưu vào Files/Drive").
  // Web: giữ nguyên hành vi cũ — mở cửa sổ mới và gọi print() trực tiếp.
  async function openOrShareHtmlReport(html, filename) {
    if (window.CSHL_Native && window.CSHL_Native.isNative()) {
      const blob = new Blob([html], { type: 'text/html' });
      const res = await window.CSHL_Native.saveOrShareFile(blob, filename, 'text/html');
      if (!res.ok && res.mode === 'native-missing-plugins') {
        await App.Modal.alert(t('nativeExportMissingTitle'), t('nativeExportMissingDesc'));
      }
      return;
    }
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(function () { win.print(); }, 300);
  }

  async function exportPDF() {
    if (!CSHL_UI.lastResult) { await App.Modal.alert(t('reportNoDataTitle'), t('reportNoDataDesc')); return; }
    const r = CSHL_UI.lastResult, i = CSHL_UI.lastInput;
    const proj = await CSHL_Projects.getCurrentProject();
    const roomName = document.getElementById('roomName') ? document.getElementById('roomName').value : 'Room';
    const html = wrapHtmlDocument(t('reportTitle') + ' - ' + roomName, buildRoomSectionHtml(r, i, roomName, proj, true));
    await openOrShareHtmlReport(html, 'Report_' + roomName.replace(/\s+/g, '_') + '.html');
  }

  function buildRoomSheetRows(r, i, roomName, proj) {
    const subtotal = r.Q_subtotal;
    const rows = [
      [t('excelTitle') + ' — ' + roomName],
      [t('reportClient'), proj.client || '', t('reportProjectName'), proj.name || ''],
      [t('reportAddress'), proj.address || ''],
      [t('reportEngineer'), proj.engineer || '', t('reportDate'), proj.date || ''],
      [],
      [t('reportColRoom'), roomName],
      [t('reportWarehouseType'), i.warehouseType ? (t('warehouseType' + i.warehouseType.charAt(0).toUpperCase() + i.warehouseType.slice(1)) + ' *') : t('reportWarehouseTypeCustom')],
      [t('reportFloorArea') + ' (m²)', r.geom.area.toFixed(2)], [t('reportVolume') + ' (m³)', r.geom.volume.toFixed(2)],
      [t('reportRegion'), i.province || t('reportRegionManual')],
      [t('T_amb'), i.T_amb], [t('RH_amb'), i.RH_amb], [t('T_room'), i.T_room], [t('RH_room'), i.RH_room],
      [],
      [t('reportConfidenceTitle'), computeConfidenceFlags(i).level],
      ...computeConfidenceFlags(i).flags.map(function (f) { return ['', f]; }),
      [t('reportExpMarkFootnote')],
      [],
      [t('reportItem').toUpperCase(), 'kW', '%'],
      [t('reportQ1'), r.Q_trans.toFixed(3), pct(r.Q_trans, subtotal)],
      [t('reportQ2'), r.Q_product.toFixed(3), pct(r.Q_product, subtotal)],
      [t('reportQ3'), r.Q_infiltration.toFixed(3), pct(r.Q_infiltration, subtotal)],
      [t('reportQ4'), r.Q_internal.toFixed(3), pct(r.Q_internal, subtotal)],
      [t('reportQ5'), r.Q_moisture_total.toFixed(3), pct(r.Q_moisture_total, subtotal)],
      [t('reportSubtotal'), subtotal.toFixed(3), '100%'],
      [t('reportSafetyFactor') + ' (%)', (r.safety * 100).toFixed(0)],
      [t('reportRequiredCapacity') + ' (kW)', r.Q_total_kW.toFixed(2)],
      [t('reportRequiredCapacity') + ' (TR)', (r.Q_total_kW / 3.517).toFixed(1)],
      [t('reportPowerDensityArea') + ' (W/m²)', (r.Q_total_kW * 1000 / r.geom.area).toFixed(1)],
      [t('reportPowerDensityVolume') + ' (W/m³)', (r.Q_total_kW * 1000 / r.geom.volume).toFixed(2)],
      [],
      [t('reportSecMaterial')],
      [t('reportWallPanel'), (i.panelMaterial || '—') + ' ' + (i.panelThickness || '—') + 'mm', t('reportUValue'), r.U_wall.toFixed(4) + ' W/m²K'],
      [t('reportFloorPanel'), (i.floorMaterial || '—') + ' ' + (i.floorThickness || '—') + 'mm', t('reportUValue'), r.U_floor.toFixed(4) + ' W/m²K'],
      [],
      [t('reportSecProduct')],
      [t('reportProductName'), i.productName || '—'],
      [t('reportTinTfinal'), i.T_in + '°C → ' + i.T_final + '°C'],
      [t('reportPulldownTime'), i.pulldown],
      [t('reportStorageMode'), i.storageCapacityMode === 'pallet' ? (t('storagePallet') + ' — ' + (i.palletCount || 0) + ' x ' + (i.palletWeight || 0) + 'kg') : (t('storageManual') + ' — ' + (i.mass_total_manual || 0) + 'kg')],
      ...(i.storageCapacityMode === 'pallet' ? [[t('reportPalletMethodLabel'), t('reportPalletMethod_' + (i.palletCountMethod || 'manual'))]] : []),
      [t('reportThroughputMode'), i.throughputMode === 'dock' ? (t('throughputDock') + ' — ' + (i.nDocks || 0) + ' dock') : i.throughputMode === 'turnoverPct' ? (t('throughputPct') + ' — ' + (i.turnoverPct || 0) + '%') : (t('throughputManual') + ' — ' + (i.mass_in_manual || 0) + 'kg')],
      ...(i.lightingWm2 ? [[t('lightingWm2Label') + ' *', i.lightingWm2 + ' W/m² (' + t('reportLightingMethod_' + (i.lightingMethod || 'manual')) + ') x ' + i.t_lights + 'h/day' + (i.syncLightingHours ? ' (' + t('reportLightingSynced') + ')' : '')]] : []),
      [],
      [t('excelWallDetail')],
      [t('colPosition'), t('colArea'), t('colU'), 'ΔT(K)', t('colLoad') + '(kW)']
    ];
    r.wallDetails.forEach(function (w) { rows.push([w.name, w.area.toFixed(1), w.U.toFixed(4), w.dT.toFixed(1), w.load.toFixed(3)]); });
    rows.push([]); rows.push([t('excelDiag')]);
    r.diagnostics.items.forEach(function (it) { rows.push([diagLabel(it), it.passed ? t('excelDoneLabel') : (it.severity === 'error' ? t('excelFailLabel') : t('excelWarnLabel'))]); });
    rows.push([]); rows.push([t('reportSecStandards')]);
    rows.push([t('reportStdListTitle')]);
    t('reportStdList').split(';;').forEach(function (s) { rows.push(['', s]); });
    rows.push([t('reportExpListTitle')]);
    t('reportExpList').split(';;').forEach(function (s) { rows.push(['', s]); });
    return rows;
  }

  async function ensureSheetJS() {
    if (window.XLSX) return;
    await new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'vendor/xlsx.full.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function safeSheetName(name, usedNames) {
    let safe = name.replace(/[\\/?*\[\]:]/g, '').slice(0, 28).trim() || 'Sheet';
    let final = safe, n = 2;
    while (usedNames.has(final)) { final = safe.slice(0, 25) + '_' + n; n++; }
    usedNames.add(final);
    return final;
  }

  async function exportExcel() {
    if (!CSHL_UI.lastResult) { await App.Modal.alert(t('reportNoDataTitle'), t('reportNoDataDesc')); return; }
    const r = CSHL_UI.lastResult, i = CSHL_UI.lastInput;
    const proj = await CSHL_Projects.getCurrentProject();
    const roomName = document.getElementById('roomName').value;
    try {
      await ensureSheetJS();
      const rows = buildRoomSheetRows(r, i, roomName, proj);
      const ws = window.XLSX.utils.aoa_to_sheet(rows);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, safeSheetName(roomName, new Set()));
      const buf = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const res = await window.CSHL_Native.saveOrShareFile(blob, 'Report_' + roomName.replace(/\s+/g, '_') + '.xlsx');
      if (!res.ok && res.mode === 'native-missing-plugins') {
        await App.Modal.alert(t('nativeExportMissingTitle'), t('nativeExportMissingDesc'));
      }
    } catch (err) {
      await App.Modal.alert(t('modalImportErrorTitle'), tf('reportExcelLibErrorDesc', { msg: err.message }));
    }
  }

  async function exportProjectPDF() {
    const proj = await CSHL_Projects.getCurrentProject();
    if (!proj) return;
    const rooms = await CSHL_Projects.getProjectRooms(proj.id);
    if (!rooms.length) { await App.Modal.alert(t('reportNoDataTitle'), t('reportProjectEmptyDesc')); return; }

    const totalKw = rooms.reduce(function (s, rm) { return s + rm.result.Q_total_kW; }, 0);
    const summaryHtml =
      '<div><h1>' + t('reportTitle') + ' — ' + esc(proj.name) + '</h1>' +
      '<h2>' + t('reportProjectSummarySheet') + '</h2>' +
      '<table><tr><th>' + t('reportColRoom') + '</th><th>' + t('reportShape') + '</th><th class="right">' + t('reportFloorArea') + '</th><th class="right">' + t('reportVolume') + '</th><th class="right">kW</th><th class="right">TR</th><th class="right">W/m²</th><th>' + t('reportDiagResult') + '</th></tr>' +
      rooms.map(function (rm) {
        const r = rm.result;
        const pass = r.diagnostics.overallPass;
        return '<tr><td>' + esc(rm.roomName) + '</td><td>' + shapeLabel(r) + '</td><td class="right">' + r.geom.area.toFixed(1) + '</td><td class="right">' + r.geom.volume.toFixed(1) + '</td><td class="right">' + r.Q_total_kW.toFixed(2) + '</td><td class="right">' + (r.Q_total_kW / 3.517).toFixed(1) + '</td><td class="right">' + (r.Q_total_kW * 1000 / r.geom.area).toFixed(1) + '</td><td>' + (pass ? t('reportPass') : t('reportFail')) + '</td></tr>';
      }).join('') +
      '<tr style="font-weight:800;background:#ecfdf5"><td colspan="4">' + t('reportProjectTotalLabel') + '</td><td class="right">' + totalKw.toFixed(2) + '</td><td class="right">' + (totalKw / 3.517).toFixed(1) + '</td><td></td><td></td></tr>' +
      '</table></div>';

    const sections = rooms.map(function (rm) {
      return buildRoomSectionHtml(rm.result, rm.input, rm.roomName, proj, false);
    }).join('');
    const html = wrapHtmlDocument(t('reportTitle') + ' — ' + esc(proj.name), summaryHtml + sections);
    await openOrShareHtmlReport(html, 'Project_' + proj.name.replace(/\s+/g, '_') + '.html');
  }

  async function exportProjectExcel() {
    const proj = await CSHL_Projects.getCurrentProject();
    if (!proj) return;
    const rooms = await CSHL_Projects.getProjectRooms(proj.id);
    if (!rooms.length) { await App.Modal.alert(t('reportNoDataTitle'), t('reportProjectEmptyDesc')); return; }

    try {
      await ensureSheetJS();
      const wb = window.XLSX.utils.book_new();
      const usedNames = new Set();

      const summaryRows = [
        [t('reportProjectSummarySheet') + ' — ' + proj.name],
        [t('reportClient'), proj.client || '', t('reportEngineer'), proj.engineer || ''],
        [],
        [t('reportColRoom'), t('reportShape'), t('reportFloorArea') + '(m²)', t('reportVolume') + '(m³)', t('reportRequiredCapacity') + '(kW)', t('reportRequiredCapacity') + '(TR)', 'W/m³']
      ];
      rooms.forEach(function (rm) {
        const r = rm.result;
        summaryRows.push([rm.roomName, shapeLabel(r), r.geom.area.toFixed(2), r.geom.volume.toFixed(2), r.Q_total_kW.toFixed(2), (r.Q_total_kW / 3.517).toFixed(1), r.Q_per_m3.toFixed(2)]);
      });
      const totalKw = rooms.reduce(function (s, rm) { return s + rm.result.Q_total_kW; }, 0);
      summaryRows.push([]);
      summaryRows.push([t('reportProjectTotalLabel'), '', '', '', totalKw.toFixed(2), (totalKw / 3.517).toFixed(1), '']);
      const summaryWs = window.XLSX.utils.aoa_to_sheet(summaryRows);
      window.XLSX.utils.book_append_sheet(wb, summaryWs, safeSheetName(t('reportProjectSummarySheet'), usedNames));

      rooms.forEach(function (rm) {
        const rows = buildRoomSheetRows(rm.result, rm.input, rm.roomName, proj);
        const ws = window.XLSX.utils.aoa_to_sheet(rows);
        window.XLSX.utils.book_append_sheet(wb, ws, safeSheetName(rm.roomName, usedNames));
      });

      const buf = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const res = await window.CSHL_Native.saveOrShareFile(blob, 'Project_' + proj.name.replace(/\s+/g, '_') + '.xlsx');
      if (!res.ok && res.mode === 'native-missing-plugins') {
        await App.Modal.alert(t('nativeExportMissingTitle'), t('nativeExportMissingDesc'));
      }
    } catch (err) {
      await App.Modal.alert(t('modalImportErrorTitle'), tf('reportExcelLibErrorDesc', { msg: err.message }));
    }
  }

  return {
    render: render, exportPDF: exportPDF, exportExcel: exportExcel,
    exportProjectPDF: exportProjectPDF, exportProjectExcel: exportProjectExcel
  };
})();
