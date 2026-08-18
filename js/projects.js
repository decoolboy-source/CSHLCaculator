// ===== projects.js =====
// ═══════════════════════════════════════════════════════════════
//  MODULE: projects — Quản lý đa dự án (tạo/đổi tên/xóa/chuyển)
//  Theo brief: dùng Modal nội bộ, KHÔNG dùng prompt()/confirm() trình duyệt.
// ═══════════════════════════════════════════════════════════════
window.CSHL_Projects = (function () {
  'use strict';
  const App = window.ColdStorageHeatLoad;
  const t = function (k) { return CSHL_I18N.t(k); };
  const tf = function (k, v) { return CSHL_I18N.tf(k, v); };
  const esc = App.util.escapeHtml;

  async function render() {
    const projects = await App.db.getAll('projects');
    const currentId = CSHL_UI.currentProjectId;
    const current = projects.find(function (p) { return p.id === currentId; }) || projects[0];

    const infoEl = document.getElementById('currentProjectInfo');
    if (infoEl && current) {
      infoEl.innerHTML = tf('projCurrentInfoTemplate', { name: esc(current.name), client: esc(current.client || '—'), engineer: esc(current.engineer || '—') });
      document.getElementById('projClient').value = current.client || '';
      document.getElementById('projName').value = current.name || '';
      document.getElementById('projAddress').value = current.address || '';
      document.getElementById('projEngineer').value = current.engineer || '';
      document.getElementById('projDate').value = current.date || '';
    }

    const listEl = document.getElementById('projectsList');
    if (listEl) {
      listEl.innerHTML = projects.map(function (p) {
        return '<div class="db-sidebar-item ' + (p.id === currentId ? 'active' : '') + '" style="border-radius:8px;margin-bottom:4px" onclick="CSHL_Projects.switchTo(' + p.id + ')">' +
          '<span>' + esc(p.name) + '</span>' + (p.id === currentId ? '<span class="db-count">' + t('projCurrentTag') + '</span>' : '') + '</div>';
      }).join('');
    }
    await renderRoomList();
    if (window.lucide) lucide.createIcons();
  }

  async function switchTo(id) {
    CSHL_UI.currentProjectId = id;
    App.settings.set('currentProjectId', id);
    await render();
    await App.Modal.alert(t('projSwitchedTitle'), t('projSwitchedDesc'));
  }

  async function openCreateModal() {
    const overlay = document.getElementById('modalOverlay');
    const box = document.getElementById('modalBox');
    box.innerHTML = '<h3>' + t('projCreateModalTitle') + '</h3>' +
      '<div class="field-grid-modal full"><div><label>' + t('projCreateNameLabel') + '</label><input type="text" id="newProjName" placeholder="' + t('projCreateNamePH') + '"></div></div>' +
      '<div class="modal-actions"><button class="btn-cancel" onclick="CSHL_Admin.closeModal()">' + t('btnCancel') + '</button>' +
      '<button class="btn-primary" id="__createProjBtn">' + t('projCreateBtnConfirm') + '</button></div>';
    overlay.classList.add('open');
    document.getElementById('__createProjBtn').onclick = async function () {
      const name = document.getElementById('newProjName').value.trim();
      if (!name) return;
      const id = await App.db.put('projects', { name: name, client: '', address: '', engineer: '', date: '', createdAt: new Date().toISOString() });
      overlay.classList.remove('open');
      CSHL_UI.currentProjectId = id;
      App.settings.set('currentProjectId', id);
      render();
    };
  }

  async function openRenameModal() {
    const projects = await App.db.getAll('projects');
    const current = projects.find(function (p) { return p.id === CSHL_UI.currentProjectId; });
    if (!current) return;
    const newName = await App.Modal.prompt(t('projRenameModalTitle'), tf('projRenameModalDesc', { name: current.name }), current.name);
    if (newName === null || !newName.trim()) return;
    current.name = newName.trim();
    await App.db.put('projects', current);
    render();
  }

  async function openDeleteModal() {
    const projects = await App.db.getAll('projects');
    if (projects.length <= 1) {
      await App.Modal.alert(t('projCannotDeleteTitle'), t('projCannotDeleteDesc'));
      return;
    }
    const current = projects.find(function (p) { return p.id === CSHL_UI.currentProjectId; });
    const ok = await App.Modal.confirm(t('projDeleteModalTitle'), tf('projDeleteModalDesc', { name: current.name }));
    if (!ok) return;
    // Xóa cascade toàn bộ bảng tính (room calculations) thuộc dự án này, tránh dữ liệu rác trong IndexedDB
    const allRooms = await App.db.getAll('roomCalculations');
    const roomsToDelete = allRooms.filter(function (rm) { return rm.projectId === current.id; });
    for (const rm of roomsToDelete) { await App.db.delete('roomCalculations', rm.id); }
    await App.db.delete('projects', current.id);
    const remaining = await App.db.getAll('projects');
    CSHL_UI.currentProjectId = remaining[0].id;
    App.settings.set('currentProjectId', remaining[0].id);
    render();
  }

  async function saveProjectInfo() {
    const projects = await App.db.getAll('projects');
    const current = projects.find(function (p) { return p.id === CSHL_UI.currentProjectId; });
    if (!current) return;
    current.client = document.getElementById('projClient').value;
    current.name = document.getElementById('projName').value;
    current.address = document.getElementById('projAddress').value;
    current.engineer = document.getElementById('projEngineer').value;
    current.date = document.getElementById('projDate').value;
    await App.db.put('projects', current);
    await App.Modal.alert(t('projSavedTitle'), t('projSavedDesc'));
    render();
  }

  async function getCurrentProject() {
    const projects = await App.db.getAll('projects');
    return projects.find(function (p) { return p.id === CSHL_UI.currentProjectId; }) || projects[0];
  }

  // ═══════════════════════════════════════════
  //  [Yêu cầu mới] Lưu nhiều bảng tính (phòng/kho) vào 1 dự án — không làm đơn lẻ.
  //  Mỗi lần tính xong 1 kho, kỹ sư bấm "Lưu vào dự án" để gắn kết quả + input đầy đủ
  //  vào projectId hiện tại. Tab Báo cáo sẽ xuất được TẤT CẢ các phòng đã lưu cùng lúc
  //  (PDF nhiều trang / Excel nhiều sheet) — đúng theo quy trình thiết kế dự án thực tế
  //  (1 dự án thường có nhiều phòng/kho khác nhau: kho đông, kho mát, sảnh đệm...).
  // ═══════════════════════════════════════════
  async function saveCurrentRoomToProject() {
    if (!CSHL_UI.lastResult || !CSHL_UI.lastInput) {
      await App.Modal.alert(t('roomSaveNoDataTitle'), t('roomSaveNoDataDesc'));
      return false;
    }
    const roomName = document.getElementById('roomName') ? document.getElementById('roomName').value : 'Room';
    const projectId = CSHL_UI.currentProjectId;
    const existing = await App.db.getAll('roomCalculations');
    const sameNameInProject = existing.find(function (rm) { return rm.projectId === projectId && rm.roomName === roomName; });

    const record = {
      projectId: projectId, roomName: roomName,
      input: CSHL_UI.lastInput, result: CSHL_UI.lastResult,
      savedAt: new Date().toISOString()
    };
    if (sameNameInProject) {
      const ok = await App.Modal.confirm(t('roomOverwriteTitle'), tf('roomOverwriteDesc', { name: roomName }));
      if (!ok) return false;
      record.id = sameNameInProject.id;
    }
    await App.db.put('roomCalculations', record);
    await renderRoomList();
    await App.Modal.alert(t('roomSavedTitle'), tf('roomSavedDesc', { name: roomName }));
    return true;
  }

  // ── Tính nhanh trạng thái 1 phòng đã lưu (Q_calc/Q_selected/gate) — không cần load vào form ──
  function _roomQuickStats(rm) {
    const res = rm.result || {};
    return { Q_calc: res.Q_total_kW || 0 };
  }

  async function renderRoomList() {
    const listEl = document.getElementById('projectRoomsList');
    if (!listEl) return;
    const projectId = CSHL_UI.currentProjectId;
    const allRooms = await App.db.getAll('roomCalculations');
    const rooms = allRooms.filter(function (rm) { return rm.projectId === projectId; }).sort(function (a, b) { return new Date(b.savedAt) - new Date(a.savedAt); });

    if (!rooms.length) {
      listEl.innerHTML = '<div style="font-size:12px;color:var(--slate-500)">' + t('roomNoneYet') + '</div>';
      return;
    }

    // Tổng dự án — chỉ còn Q lý thuyết (tham khảo). Trạm 2 giờ là công cụ tính
    // toán/tham khảo độc lập — không còn theo dõi thiết bị/Tevap/gate ở đây nữa,
    // việc đó thuộc về Trạm 3 (nơi chọn thiết bị thật + gán Te theo catalog).
    let sumQCalc = 0;
    const stats = rooms.map(function (rm) { return { rm: rm, s: _roomQuickStats(rm) }; });
    stats.forEach(function (x) { sumQCalc += x.s.Q_calc; });

    const summaryHtml = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">' +
      '<div style="background:var(--slate-800);border:1px solid var(--slate-700);border-radius:8px;padding:8px 10px;text-align:center"><div style="font-size:9px;color:var(--slate-500)">Số phòng/kho</div><div style="font-size:16px;font-weight:800;color:#2dd4e8">' + rooms.length + '</div></div>' +
      '<div style="background:var(--slate-800);border:1px solid var(--slate-700);border-radius:8px;padding:8px 10px;text-align:center"><div style="font-size:9px;color:var(--slate-500)">∑ Q lý thuyết (tham khảo)</div><div style="font-size:16px;font-weight:800;color:var(--slate-200)">' + sumQCalc.toFixed(0) + ' kW</div></div>' +
      '</div>';

    const cardsHtml = stats.map(function (x) {
      const rm = x.rm, s = x.s;
      const locale = CSHL_I18N.getLang() === 'en' ? 'en-US' : 'vi-VN';
      return '<div style="background:var(--slate-850,#161d29);border:1px solid var(--slate-700);border-radius:10px;padding:10px 12px;margin-bottom:8px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">' +
        '<div style="font-weight:700;font-size:12px;color:var(--slate-100);cursor:pointer" onclick="CSHL_Projects.loadRoom(' + rm.id + ')">' + esc(rm.roomName) + '</div>' +
        '<strong style="font-size:13px;color:#2dd4e8;font-family:var(--font-mono)">' + s.Q_calc.toFixed(1) + ' kW</strong>' +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between">' +
        '<span style="font-size:9px;color:var(--slate-500)">' + new Date(rm.savedAt).toLocaleString(locale) + '</span>' +
        '<span class="row-actions"><button onclick="CSHL_Projects.loadRoom(' + rm.id + ')" title="Mở để chỉnh sửa" style="margin-right:4px"><i data-lucide="pencil" style="width:13px;height:13px"></i></button>' +
        '<button onclick="CSHL_Projects.deleteRoom(' + rm.id + ')" title="Xoá"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button></span>' +
        '</div></div>';
    }).join('');

    listEl.innerHTML = summaryHtml + cardsHtml;
    if (window.lucide) lucide.createIcons();
  }

  async function loadRoom(id) {
    const room = await App.db.get('roomCalculations', id);
    if (!room) return;
    // Nạp lại input đã lưu vào form tính toán, rồi tính lại để đồng bộ đúng kiến trúc hiện tại
    // (an toàn hơn là chỉ hiển thị result tĩnh — nếu database vật liệu/sản phẩm đã thay đổi
    // sau khi lưu, kết quả tính lại sẽ phản ánh đúng dữ liệu hiện tại, đồng thời báo cho người dùng).
    CSHL_UI.switchTab('calc');
    await CSHL_UI.loadInputIntoForm(room.input, room.roomName);
    await App.Modal.alert(t('roomLoadedTitle'), tf('roomLoadedDesc', { name: room.roomName }));
  }

  async function deleteRoom(id) {
    const room = await App.db.get('roomCalculations', id);
    if (!room) return;
    const ok = await App.Modal.confirm(t('roomDeleteTitle'), tf('roomDeleteDesc', { name: room.roomName }));
    if (!ok) return;
    await App.db.delete('roomCalculations', id);
    await renderRoomList();
  }

  async function getProjectRooms(projectId) {
    const allRooms = await App.db.getAll('roomCalculations');
    return allRooms.filter(function (rm) { return rm.projectId === projectId; }).sort(function (a, b) { return new Date(a.savedAt) - new Date(b.savedAt); });
  }

  return {
    render: render, switchTo: switchTo, openCreateModal: openCreateModal,
    openRenameModal: openRenameModal, openDeleteModal: openDeleteModal,
    saveProjectInfo: saveProjectInfo, getCurrentProject: getCurrentProject,
    saveCurrentRoomToProject: saveCurrentRoomToProject, renderRoomList: renderRoomList,
    loadRoom: loadRoom, deleteRoom: deleteRoom, getProjectRooms: getProjectRooms
  };
})();
