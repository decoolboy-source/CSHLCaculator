// Trích xuất module "calc.js" (thuần JS, không phụ thuộc DOM) trực tiếp từ index.html
// và nạp vào Node để test — tránh phải duplicate công thức tính toán ra 1 bản riêng
// (nếu duplicate, code test sẽ không còn phản ánh đúng công thức thực tế đang chạy trong app).
'use strict';
const fs = require('fs');
const path = require('path');

function loadCalc() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const startMarker = '// ===== calc.js =====';
  const endMarker = '// ===== i18n.js =====';
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error('Không tìm thấy ranh giới module calc.js trong index.html — kiểm tra lại marker "// ===== calc.js =====" / "// ===== i18n.js ====="');
  }
  const code = html.slice(startIdx, endIdx);

  // calc.js chỉ thao tác trên window.ColdStorageHeatLoad — không đụng DOM — nên chỉ cần
  // 1 object rỗng giả lập "window" là đủ để chạy độc lập trong Node.
  const sandboxWindow = {};
  const fn = new Function('window', code);
  fn(sandboxWindow);

  if (!sandboxWindow.ColdStorageHeatLoad || !sandboxWindow.ColdStorageHeatLoad.calc) {
    throw new Error('Nạp calc.js thất bại — window.ColdStorageHeatLoad.calc không tồn tại sau khi eval');
  }
  return sandboxWindow.ColdStorageHeatLoad.calc;
}

module.exports = { loadCalc };
