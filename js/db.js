// ===== db.js =====
// ═══════════════════════════════════════════════════════════════
//  NAMESPACE: window.ColdStorageHeatLoad
//  Toàn bộ biến/hàm của app nằm trong namespace này — KHÔNG khai báo
//  biến global trần, để tương thích khi nhúng vào Hub Shell cùng
//  nhiều app khác trong 1 trang.
// ═══════════════════════════════════════════════════════════════
window.ColdStorageHeatLoad = window.ColdStorageHeatLoad || {};

(function (App) {
  'use strict';

  // ── App-specific storage key prefix (tránh đụng độ giữa nhiều app trong Hub) ──
  const DB_NAME = 'coldstorage_heatload_db';
  const DB_VERSION = 4; // tăng version — thêm store rackLayoutConfig (hằng số bố trí kệ, sửa được qua Database)
  const LS_PREFIX = 'coldstorage_heatload_'; // chỉ dùng cho cờ cài đặt nhỏ (ngôn ngữ, đơn vị)

  const STORES = [
    'products', 'materials', 'respiration', 'doorTypes', 'panelSpecs',
    'vehicles', 'climateProvinces', 'personHeat', 'packingSpec',
    'projects', 'calcHistory', 'roomCalculations', 'warehouseTypePresets', 'rackLayoutConfig'
  ];

  // ═══════════════════════════════════════════
  //  IndexedDB wrapper (Module: db)
  // ═══════════════════════════════════════════
  const db = {
    _conn: null,

    async open() {
      if (this._conn) return this._conn;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const idb = e.target.result;
          STORES.forEach(storeName => {
            if (!idb.objectStoreNames.contains(storeName)) {
              const keyPath = (storeName === 'projects' || storeName === 'calcHistory' || storeName === 'roomCalculations') ? 'id' :
                               (storeName === 'panelSpecs' || storeName === 'packingSpec') ? 'material' : 'name';
              const opts = { keyPath, autoIncrement: keyPath === 'id' };
              idb.createObjectStore(storeName, opts);
            }
          });
        };
        req.onsuccess = (e) => { this._conn = e.target.result; resolve(this._conn); };
        req.onerror = (e) => reject(e.target.error);
      });
    },

    async getAll(storeName) {
      const conn = await this.open();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    },

    async get(storeName, key) {
      const conn = await this.open();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    },

    async put(storeName, value) {
      const conn = await this.open();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(value);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    },

    async putMany(storeName, values) {
      const conn = await this.open();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        values.forEach(v => store.put(v));
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    },

    async delete(storeName, key) {
      const conn = await this.open();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      });
    },

    async clear(storeName) {
      const conn = await this.open();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      });
    },

    async count(storeName) {
      const conn = await this.open();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    },

    // ── Seed default reference data on first run (only if store is empty) ──
    async seedIfEmpty(storeName, defaultData) {
      const count = await this.count(storeName);
      if (count === 0 && defaultData && defaultData.length) {
        await this.putMany(storeName, defaultData);
      }
    },

    async resetToDefaults(storeName, defaultData) {
      await this.clear(storeName);
      await this.putMany(storeName, defaultData);
    },

    // ── Bulk export/import for backup across machines/browsers ──
    async exportAll() {
      const result = {};
      for (const s of STORES) {
        result[s] = await this.getAll(s);
      }
      result._meta = { exportedAt: new Date().toISOString(), dbName: DB_NAME, dbVersion: DB_VERSION };
      return result;
    },

    async importAll(data) {
      for (const s of STORES) {
        if (Array.isArray(data[s])) {
          await this.clear(s);
          await this.putMany(s, data[s]);
        }
      }
    }
  };

  // ── Small settings flags only (NOT large data) — localStorage with app-specific prefix ──
  const settings = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(LS_PREFIX + key);
        return raw !== null ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch (e) { /* ignore quota errors */ }
    }
  };

  // ═══════════════════════════════════════════
  //  MODULE: Modal — thay thế prompt()/confirm() trình duyệt
  //  Theo yêu cầu brief: "tuyệt đối không dùng prompt()/confirm() của trình duyệt"
  // ═══════════════════════════════════════════
  // [Bảo mật] title/desc/defaultValue luôn được escape trước khi chèn vào innerHTML —
  // desc thường được ghép từ tf(...) với dữ liệu người dùng nhập (tên dự án/phòng/sản phẩm...),
  // không nên tin tưởng là an toàn dù app chạy hoàn toàn local (vd sau khi import file backup lạ).
  const Modal = {
    confirm(title, desc) {
      return new Promise((resolve) => {
        const overlay = document.getElementById('modalOverlay');
        const box = document.getElementById('modalBox');
        box.innerHTML = '<h3>' + App.util.escapeHtml(title) + '</h3><p class="modal-desc">' + App.util.escapeHtml(desc) + '</p>' +
          '<div class="modal-actions"><button class="btn-cancel" id="__modalCancelBtn">Hủy</button>' +
          '<button class="btn-danger" id="__modalConfirmBtn">Xác nhận</button></div>';
        overlay.classList.add('open');
        document.getElementById('__modalCancelBtn').onclick = () => { overlay.classList.remove('open'); resolve(false); };
        document.getElementById('__modalConfirmBtn').onclick = () => { overlay.classList.remove('open'); resolve(true); };
      });
    },
    alert(title, desc) {
      return new Promise((resolve) => {
        const overlay = document.getElementById('modalOverlay');
        const box = document.getElementById('modalBox');
        box.innerHTML = '<h3>' + App.util.escapeHtml(title) + '</h3><p class="modal-desc">' + App.util.escapeHtml(desc) + '</p>' +
          '<div class="modal-actions"><button class="btn-primary" id="__modalOkBtn">OK</button></div>';
        overlay.classList.add('open');
        document.getElementById('__modalOkBtn').onclick = () => { overlay.classList.remove('open'); resolve(true); };
      });
    },
    prompt(title, desc, defaultValue) {
      return new Promise((resolve) => {
        const overlay = document.getElementById('modalOverlay');
        const box = document.getElementById('modalBox');
        box.innerHTML = '<h3>' + App.util.escapeHtml(title) + '</h3><p class="modal-desc">' + App.util.escapeHtml(desc) + '</p>' +
          '<input type="text" id="__modalPromptInput" value="' + App.util.escapeHtml(defaultValue || '') + '" style="margin-bottom:8px">' +
          '<div class="modal-actions"><button class="btn-cancel" id="__modalPCancelBtn">Hủy</button>' +
          '<button class="btn-primary" id="__modalPOkBtn">OK</button></div>';
        overlay.classList.add('open');
        const input = document.getElementById('__modalPromptInput');
        input.focus(); input.select();
        document.getElementById('__modalPCancelBtn').onclick = () => { overlay.classList.remove('open'); resolve(null); };
        document.getElementById('__modalPOkBtn').onclick = () => { overlay.classList.remove('open'); resolve(input.value); };
      });
    }
  };

  App.db = db;
  App.settings = settings;
  App.Modal = Modal;
  App.DB_NAME = DB_NAME;
  App.STORES = STORES;

})(window.ColdStorageHeatLoad);
