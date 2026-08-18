// ===== native.js =====
// ═══════════════════════════════════════════════════════════════
//  MODULE: CSHL_Native — cầu nối cho môi trường app native (Capacitor)
//  Khi CHƯA đóng gói (chạy trên trình duyệt): mọi hàm fallback về hành vi
//  web bình thường (download qua thẻ <a>, không có back-button vật lý...).
//  Khi ĐÃ đóng gói bằng Capacitor và có cài các plugin tương ứng
//  (@capacitor/filesystem, @capacitor/share, @capacitor/app): tự động dùng
//  API native. Không cần sửa lại code UI khi packaging — chỉ cần cài plugin.
// ═══════════════════════════════════════════════════════════════
window.CSHL_Native = (function () {
  'use strict';

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function plugin(name) {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onloadend = function () {
        const res = reader.result || '';
        const idx = res.indexOf(',');
        resolve(idx >= 0 ? res.slice(idx + 1) : res);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ── Lưu/chia sẻ 1 file (Blob) — dùng cho export Excel/HTML report ──
  // Trả về { ok, mode } — mode: 'native-share' | 'web-download'
  async function saveOrShareFile(blob, filename, mimeType) {
    if (isNative()) {
      const Filesystem = plugin('Filesystem');
      const Share = plugin('Share');
      if (Filesystem && Share) {
        try {
          const base64 = await blobToBase64(blob);
          const written = await Filesystem.writeFile({
            path: filename,
            data: base64,
            directory: 'CACHE'
          });
          await Share.share({ title: filename, url: written.uri });
          return { ok: true, mode: 'native-share' };
        } catch (err) {
          return { ok: false, mode: 'native-share', error: err };
        }
      }
      // Đang chạy native nhưng chưa cài @capacitor/filesystem + @capacitor/share
      return { ok: false, mode: 'native-missing-plugins' };
    }
    // ── Web fallback: download qua thẻ <a> như bình thường ──
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return { ok: true, mode: 'web-download' };
  }

  // ── Nút Back vật lý Android: đóng drawer/modal/overlay đang mở thay vì
  // thoát app ngay. handlers: mảng các function trả về true nếu đã "xử lý"
  // (đã đóng cái gì đó) — hàm sẽ dừng lại ở handler đầu tiên trả về true.
  let backHandlers = [];
  function registerBackHandler(fn) { backHandlers.unshift(fn); }
  function handleBackPress() {
    for (let i = 0; i < backHandlers.length; i++) {
      try { if (backHandlers[i]()) return true; } catch (e) { /* ignore */ }
    }
    return false;
  }
  function setupBackButton(exitConfirmFn) {
    const AppPlugin = plugin('App');
    if (AppPlugin && AppPlugin.addListener) {
      // Môi trường native đã có @capacitor/app
      AppPlugin.addListener('backButton', function () {
        if (handleBackPress()) return;
        if (typeof exitConfirmFn === 'function') exitConfirmFn();
      });
    } else if (isNative()) {
      // Native nhưng chưa cài @capacitor/app — vẫn lắng nghe popstate làm dự phòng
      window.addEventListener('popstate', function () { handleBackPress(); });
    }
    // Trên web: không có nút Back vật lý cần chặn, bỏ qua.
  }

  return {
    isNative: isNative,
    saveOrShareFile: saveOrShareFile,
    registerBackHandler: registerBackHandler,
    setupBackButton: setupBackButton
  };
})();
