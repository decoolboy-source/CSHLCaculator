// Nạp thẳng js/calc.js (module thuần JS, không phụ thuộc DOM) vào Node để test —
// tránh phải duplicate công thức tính toán ra 1 bản riêng (nếu duplicate, code test sẽ
// không còn phản ánh đúng công thức thực tế đang chạy trong app).
'use strict';
const fs = require('fs');
const path = require('path');

function loadCalc() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'calc.js'), 'utf8');

  // calc.js chỉ thao tác trên window.ColdStorageHeatLoad — không đụng DOM — nên chỉ cần
  // 1 object rỗng giả lập "window" là đủ để chạy độc lập trong Node.
  const sandboxWindow = {};
  const fn = new Function('window', code);
  fn(sandboxWindow);

  if (!sandboxWindow.ColdStorageHeatLoad || !sandboxWindow.ColdStorageHeatLoad.calc) {
    throw new Error('Nạp js/calc.js thất bại — window.ColdStorageHeatLoad.calc không tồn tại sau khi eval');
  }
  return sandboxWindow.ColdStorageHeatLoad.calc;
}

module.exports = { loadCalc };
