// ===== util.js =====
// ═══════════════════════════════════════════════════════════════
//  MODULE: util — Tiện ích dùng chung
//  [Bảo mật] escapeHtml: bắt buộc dùng khi chèn dữ liệu do người dùng nhập/import
//  (tên sản phẩm, vật liệu, dự án, phòng...) vào innerHTML — dữ liệu này có thể đến
//  từ file Excel/JSON backup import, không nên coi là an toàn tuyệt đối dù app chạy
//  hoàn toàn local (tránh XSS lưu trữ nếu người dùng mở file backup không rõ nguồn gốc).
// ═══════════════════════════════════════════════════════════════
window.ColdStorageHeatLoad = window.ColdStorageHeatLoad || {};
(function (App) {
  'use strict';
  App.util = App.util || {};
  App.util.escapeHtml = function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
})(window.ColdStorageHeatLoad);
