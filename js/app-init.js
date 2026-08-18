  document.addEventListener('DOMContentLoaded', function () {
    if (window.lucide) lucide.createIcons();
    // Giữ lại Promise của init() — không đổi hành vi cho người dùng thật, chỉ để công cụ
    // test/tooling bên ngoài có thể "await window.__cshlReady" biết CHÍNH XÁC lúc app (kể cả
    // seed IndexedDB) đã xong, thay vì đoán bằng polling (từng gây test bị flaky).
    window.__cshlReady = CSHL_UI.init();
  });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('Không đăng ký được Service Worker (bình thường nếu đang mở qua file:// hoặc http không có HTTPS):', err);
      });
    });
  }
