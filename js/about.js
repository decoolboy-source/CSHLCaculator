// ===== about.js =====
// ═══════════════════════════════════════════════════════════════
//  MODULE: about — Giới thiệu công cụ, tiêu chuẩn, hướng dẫn sử dụng
// ═══════════════════════════════════════════════════════════════
window.CSHL_About = (function () {
  'use strict';
  const t = function (k) { return CSHL_I18N.t(k); };

  function render() {
    const wrap = document.getElementById('aboutContent');
    wrap.innerHTML =
      '<div class="settings-card">' +
      '<h3>' + t('aboutIntroTitle') + '</h3>' +
      '<p style="font-size:13px;color:var(--slate-300);line-height:1.7">' + t('aboutIntroText') + '</p></div>' +

      '<div class="settings-card"><h3>' + t('aboutStandardsTitle') + '</h3>' +
      '<ul style="font-size:12px;color:var(--slate-400);line-height:2;padding-left:18px;margin:0">' +
      '<li><strong>ASHRAE Refrigeration Handbook</strong> (2018/2022), Ch.23-24 — transmission, product, infiltration loads.</li>' +
      '<li><strong>Gosney & Olama (1975)</strong>, Inst. of Refrigeration Vol.72 — ' + t('aboutStdGosney') + '</li>' +
      '<li><strong>Minnesota Technical Reference Manual (TRM) / ASHRAE</strong> — ' + t('aboutStdMnTRM') + '</li>' +
      '<li><strong>FAO/IIR</strong> (Food and Agriculture Organization / International Institute of Refrigeration) — net/gross volume ratio.</li>' +
      '<li><strong>QCVN 02:2022/BXD</strong> — Vietnam National Technical Regulation on Natural Condition Data, Ministry of Construction. Table A.3 (temperature) + A.10 (humidity), 63 provinces.</li>' +
      '</ul></div>' +

      '<div class="settings-card"><h3>' + t('aboutWarehouseTitle') + '</h3>' +
      '<p style="font-size:12px;color:var(--slate-300);line-height:1.8">' + t('aboutWarehouseText') + '</p></div>' +

      '<div class="settings-card"><h3>' + t('aboutGuideTitle') + '</h3>' +
      '<ol style="font-size:12px;color:var(--slate-400);line-height:2;padding-left:18px;margin:0">' +
      '<li>' + t('aboutGuide1') + '</li>' +
      '<li>' + t('aboutGuide2') + '</li>' +
      '<li>' + t('aboutGuide3') + '</li>' +
      '<li>' + t('aboutGuide4') + '</li>' +
      '<li>' + t('aboutGuide5') + '</li>' +
      '<li>' + t('aboutGuide6') + '</li>' +
      '</ol></div>' +

      '<div class="settings-card"><h3>' + t('aboutNotesTitle') + '</h3>' +
      '<p style="font-size:11px;color:var(--amber);line-height:1.8">' + t('aboutNotesText') + '</p></div>' +

      '<div class="settings-card">' +
      '<h3>' + t('aboutVersionTitle') + '</h3>' +
      '<p style="font-size:11px;color:var(--slate-400);line-height:1.9">' + t('aboutVersionText') + '</p>' +
      '</div>';
  }

  return { render: render };
})();
