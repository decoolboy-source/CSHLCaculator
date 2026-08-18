// ===== equipment.js va handoff.js da xoa =====
// Tram 2 gio la cong cu tinh toan + tham khao doc lap. Chon thiet bi that
// (dan lanh/tu dong/chiller) va gan Te thuc hien o Tram 3 (RefrigDesignNH3)
// - noi co catalog day du te/vEvap cho tung thiet bi, dung truc tiep de
// tinh V_surge, khong con di qua Tram 2 lam trung gian.
// ===== ai.js =====
// ═══════════════════════════════════════════════════════════════
//  MODULE: ai — Trợ lý AI (chat, dùng API key cá nhân)
// ═══════════════════════════════════════════════════════════════
window.CSHL_AI = (function () {
  'use strict';
  const App = window.ColdStorageHeatLoad;
  const t = function (k) { return CSHL_I18N.t(k); };
  const tf = function (k, v) { return CSHL_I18N.tf(k, v); };

  // ── Knowledge Base offline — trả lời cơ bản xoay quanh bảng tính, không cần API ──
  var KB_VI = [
    {k:['u-value','u value','hệ số truyền nhiệt','uwall','u_wall'], r:'U-value (hệ số truyền nhiệt tường/nền) tính từ độ dày và độ dẫn nhiệt panel cách nhiệt: U = 1/(Rsi+d/λ+Rso). Với panel PU/PIR công nghiệp dày 100-150mm, U thường trong khoảng 0.15-0.30 W/m²K — nếu ra ngoài dải này, kiểm tra lại độ dày/vật liệu đã chọn.'},
    {k:['sản phẩm','tải sản phẩm','above freeze','đóng băng','below freeze'], r:'Tải sản phẩm gồm 3 giai đoạn: (1) làm lạnh trên điểm đóng băng, (2) đóng băng (ẩn nhiệt), (3) làm lạnh dưới điểm đóng băng — mỗi giai đoạn dùng đúng Cp riêng (Cp_above/Cp_below khác nhau vì nước đã chuyển pha). Tổng 3 giai đoạn thường chiếm 20-40% tổng tải với kho cấp đông.'},
    {k:['xâm nhập','infiltration','cửa','air exchange'], r:'Tải xâm nhập không khí qua cửa/khe hở tính theo số lần trao đổi khí/ngày hoặc theo diện tích cửa mở × hệ số Gosney-Olama. Nếu tải này >40% tổng tải, thường do cửa mở quá nhiều lần/ngày hoặc thiếu màn khí — nên xem lại vận hành thực tế trước khi tăng công suất máy.'},
    {k:['hô hấp','respiration','q4','nội bộ'], r:'Tải hô hấp chỉ áp dụng cho rau quả tươi (sản phẩm sống), tính theo mW/kg tuỳ loại và tuỳ nhiệt độ bảo quản — sản phẩm đã cấp đông/chế biến thì tải hô hấp = 0.'},
    {k:['mật độ tải','w/m3','load density'], r:'Mật độ tải (W/m³) là tổng công suất chia thể tích kho — dùng để kiểm tra nhanh độ hợp lý: kho lạnh thường (0/+4°C) khoảng 5-15 W/m³, kho đông sâu (-18 đến -25°C) khoảng 15-40 W/m³. Ra ngoài dải này nên kiểm tra lại cách nhiệt hoặc tải xâm nhập.'},
    {k:['an toàn','safety factor','hệ số dự phòng'], r:'Hệ số an toàn thường áp dụng 5-20% trên tổng tải trước an toàn — bù cho sai số tính toán và biến động vận hành thực tế. Dưới 5% rủi ro thiếu công suất khi vận hành thực; trên 20% thường là lãng phí đầu tư thiết bị.'},
    {k:['coil','dàn lạnh','evapcoilvolume','thể tích coil'], r:'Thể tích coil dàn lạnh (L) lấy từ datasheet nhà sản xuất — dùng để tính lượng gas NH3 nạp hệ thống ở Trạm 3/4. Đây là số liệu bắt buộc trước khi xuất dữ liệu sang RefrigDesignNH3.'},
    {k:['tevap','nhiệt độ bay hơi'], r:'Tevap thiết kế của kho thường thấp hơn nhiệt độ phòng (T_room) khoảng 5-8°C — chênh lệch này ảnh hưởng trực tiếp diện tích trao đổi nhiệt dàn lạnh cần thiết. Chênh quá lớn (>10°C) làm giảm độ ẩm phòng quá mức, ảnh hưởng chất lượng sản phẩm.'},
    {k:['thiết bị','equipment','q_selected','gợi ý'], r:'Trạm 2 chỉ tính tải lý thuyết (Q_calc) để tham khảo — không còn chọn thiết bị thực tế tại đây. Việc chọn model/số lượng thiết bị dàn lạnh/tủ đông thực tế (đáp ứng yêu cầu khách hàng) và gán Te tương ứng thực hiện tại Trạm 3 (RefrigDesignNH3), nơi có catalog đầy đủ Te/thể tích coil cho từng thiết bị.'}
  ];
  var KB_EN = [
    {k:['u-value','u value','heat transfer'], r:'U-value is calculated from insulation thickness and conductivity: U = 1/(Rsi+d/λ+Rso). For 100-150mm industrial PU/PIR panels, U typically ranges 0.15-0.30 W/m²K.'},
    {k:['product','above freeze','below freeze'], r:'Product load has 3 phases: cooling above freezing, freezing (latent heat), cooling below freezing — each uses a different Cp since water changes phase. Combined, these typically account for 20-40% of total load in frozen storage.'},
    {k:['infiltration','door','air exchange'], r:'Infiltration load is calculated from air changes/day or door opening area × Gosney-Olama factor. If this exceeds 40% of total load, check actual door usage frequency or air curtain presence before increasing equipment capacity.'},
    {k:['respiration'], r:'Respiration load only applies to fresh produce (living product), calculated in mW/kg depending on type and storage temperature — processed/frozen products have zero respiration load.'},
    {k:['load density','w/m3'], r:'Load density (W/m³) = total capacity / room volume — a quick sanity check: chiller rooms (0/+4°C) ~5-15 W/m³, deep freeze (-18 to -25°C) ~15-40 W/m³.'},
    {k:['safety factor'], r:'Safety factor typically applies 5-20% on top of pre-safety total load, compensating for calculation error and real operating variance.'},
    {k:['coil','evaporator'], r:'Evaporator coil internal volume (L) comes from manufacturer datasheet — used to calculate NH3 gas charge at Station 3/4. This is a mandatory field before exporting to RefrigDesignNH3.'},
    {k:['tevap'], r:'Design Tevap is typically 5-8°C below room temperature — this gap directly affects the required evaporator heat transfer area.'},
    {k:['equipment','q_selected','suggest'], r:'Station 2 only computes theoretical load (Q_calc) for reference — equipment selection no longer happens here. Choosing the actual freezer/evaporator model/quantity (matching customer requirements) and assigning the corresponding Te is now done at Station 3 (RefrigDesignNH3), which has a full catalog with Te/coil volume per equipment.'}
  ];

  function appendMessage(role, text) {
    const wrap = document.getElementById('aiMessages');
    const div = document.createElement('div');
    div.className = 'ai-msg ' + role + ' fade-in';
    div.textContent = text;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
  }
  function appendTyping() {
    const wrap = document.getElementById('aiMessages');
    const div = document.createElement('div');
    div.className = 'ai-typing'; div.id = 'aiTypingIndicator';
    div.textContent = t('aiThinking');
    wrap.appendChild(div); wrap.scrollTop = wrap.scrollHeight;
  }
  function removeTyping() { const el = document.getElementById('aiTypingIndicator'); if (el) el.remove(); }

  // ── Render welcome message + suggestion chips dynamically (re-renders on language switch) ──
  function renderWelcomeAndChips() {
    const certifyBtn = document.getElementById('aiCertifyBtn');
    if (certifyBtn) certifyBtn.textContent = t('aiCertifyBtn');
    const messagesWrap = document.getElementById('aiMessages');
    if (messagesWrap) {
      const existing = messagesWrap.querySelector('.ai-msg.assistant.ai-welcome');
      if (existing) {
        existing.textContent = t('aiWelcomeMsg');
      } else {
        const div = document.createElement('div');
        div.className = 'ai-msg assistant ai-welcome';
        div.textContent = t('aiWelcomeMsg');
        messagesWrap.insertBefore(div, messagesWrap.firstChild);
      }
    }
    const chipsWrap = document.getElementById('aiChips');
    if (chipsWrap) {
      chipsWrap.innerHTML = '';
      [['aiAsk1', 'aiChip1'], ['aiAsk2', 'aiChip2'], ['aiAsk3', 'aiChip3']].forEach(function (pair) {
        const chip = document.createElement('div');
        chip.className = 'ai-chip';
        chip.textContent = t(pair[1]);
        chip.addEventListener('click', function () { ask(t(pair[0])); });
        chipsWrap.appendChild(chip);
      });
    }
  }

  function buildContext() {
    const r = CSHL_UI.lastResult, i = CSHL_UI.lastInput;
    if (!r) return t('aiNoCalcContext');
    return [
      'CURRENT COLD STORAGE DATA:',
      '- Shape: ' + (r.geom.shape === 'rect' ? 'Rectangle' : r.geom.shape === 'ushape' ? 'U-shape 8-side' : 'L-shape 6-side'),
      '- Area: ' + r.geom.area.toFixed(1) + ' m², Volume: ' + r.geom.volume.toFixed(1) + ' m³',
      '- Temperature: outdoor ' + i.T_amb + '°C/' + i.RH_amb + '%RH, room ' + i.T_room + '°C/' + i.RH_room + '%RH',
      '- Insulation: ' + i.panelMaterial + ' ' + i.panelThickness + 'mm, U_wall=' + r.U_wall.toFixed(4) + ' W/m²K',
      '- Product: ' + i.productName,
      '- Storage: ' + r.mass_total.toFixed(1) + ' ton stored, ' + r.mass_in.toFixed(1) + ' ton/day inbound',
      '- RESULTS: Q1 Transmission=' + r.Q_trans.toFixed(2) + 'kW, Q2 Product=' + r.Q_product.toFixed(2) + 'kW, Q3 Infiltration=' + r.Q_infiltration.toFixed(2) + 'kW, Q4 Internal=' + r.Q_internal.toFixed(2) + 'kW, Q5 Moisture=' + r.Q_moisture_total.toFixed(2) + 'kW',
      '- TOTAL CAPACITY: ' + r.Q_total_kW.toFixed(2) + ' kW (' + (r.Q_total_kW / 3.517).toFixed(1) + ' TR), density ' + r.Q_per_m3.toFixed(2) + ' W/m³',
      '- Diagnostics: ' + (r.diagnostics ? r.diagnostics.summary : '—')
    ].join('\n');
  }

  async function send() {
    const input = document.getElementById('aiInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await ask(text);
  }

  async function ask(text) {
    appendMessage('user', text);
    appendTyping();
    const lang = CSHL_I18N.getLang();
    const kb = lang === 'en' ? KB_EN : KB_VI;
    const low = text.toLowerCase();
    const match = kb.find(function (item) { return item.k.some(function (kw) { return low.indexOf(kw) >= 0; }); });
    const reply = match ? match.r : t('aiOfflineFallback');
    setTimeout(function () {
      removeTyping();
      appendMessage('assistant', reply);
    }, 350);
  }

  document.addEventListener('DOMContentLoaded', function () {
    const inputEl = document.getElementById('aiInput');
    if (inputEl) inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    renderWelcomeAndChips();
  });

  // ═══════════════════════════════════════════
  //  [Yêu cầu mới] Đăng kiểm viên AI chứng thực
  //  Khác với chat tư vấn tự do: AI đóng vai kỹ sư thẩm định độc lập, rà soát kết quả
  //  tính toán theo checklist kỹ thuật cố định, đưa ra kết luận có cấu trúc (ĐẠT/CẦN XEM LẠI),
  //  kèm timestamp — kết quả được lưu lại để gắn vào báo cáo xuất ra (PDF/Excel).
  //  LƯU Ý QUAN TRỌNG: đây là công cụ hỗ trợ rà soát, KHÔNG thay thế vai trò ký duyệt/thẩm định
  //  chính thức của kỹ sư có chứng chỉ hành nghề — cần ghi rõ trong kết quả hiển thị.
  // ═══════════════════════════════════════════
  async function requestCertification() {
    if (!CSHL_UI.lastResult) {
      appendMessage('assistant', '⚠ ' + t('aiNoCalcContext'));
      return;
    }
    const r = CSHL_UI.lastResult;
    const i = CSHL_UI.lastInput;
    const lang = CSHL_I18N.getLang();
    appendMessage('user', t('aiCertifyRequestLabel'));
    appendTyping();

    // ── Rà soát 8 tiêu chí bằng so sánh số liệu trực tiếp (không qua AI) ──
    // Cùng nội dung checklist trước đây, nay đánh giá quyết định (deterministic) — đáng tin cậy
    // và tái lập được 100%, không phụ thuộc suy luận của mô hình ngôn ngữ.
    const subtotal = r.Q_trans + r.Q_product + r.Q_infiltration + r.Q_internal + r.Q_moisture_total;
    const infilPct = subtotal > 0 ? (r.Q_infiltration / subtotal * 100) : 0;
    const productPct = subtotal > 0 ? (r.Q_product / subtotal * 100) : 0;
    const safetyPct = (r.safety || 0) * 100;
    const uOk = r.U_wall >= 0.08 && r.U_wall <= 0.45;
    const densityOk = r.Q_per_m3 >= 5 && r.Q_per_m3 <= 45;
    const geomOk = r.geom && r.geom.area > 0 && r.geom.volume > 0;
    const tDiffOk = Math.abs(i.T_room - i.T_amb) < 60; // chênh lệch bất thường nếu quá lớn
    const diagOk = !r.diagnostics || r.diagnostics.overallPass !== false;

    const itemsVI = [
      { pass: geomOk, label: 'Hình học & diện tích/thể tích hợp lý', detail: geomOk ? `Diện tích ${r.geom.area.toFixed(1)}m², thể tích ${r.geom.volume.toFixed(1)}m³` : 'Diện tích/thể tích bằng 0 hoặc âm — kiểm tra lại kích thước nhập' },
      { pass: uOk, label: 'U-value tường/nền trong dải hợp lý (0.08–0.45 W/m²K)', detail: `U_wall=${r.U_wall.toFixed(4)} W/m²K` + (uOk ? '' : ' — ngoài dải tham khảo, kiểm tra lại độ dày/vật liệu cách nhiệt') },
      { pass: tDiffOk, label: 'Chênh lệch T_room so với T_amb hợp lý', detail: `ΔT=${Math.abs(i.T_room - i.T_amb).toFixed(1)}°C` },
      { pass: productPct <= 60, label: 'Tải sản phẩm có tỷ trọng hợp lý so với tổng tải', detail: `${productPct.toFixed(1)}% tổng tải` + (productPct > 60 ? ' — tỷ trọng cao bất thường, kiểm tra lại khối lượng/thời gian đóng băng' : '') },
      { pass: infilPct <= 40, label: 'Tải xâm nhập không khí không chiếm tỷ trọng bất thường (>40%)', detail: `${infilPct.toFixed(1)}% tổng tải` + (infilPct > 40 ? ' — CAO, kiểm tra tần suất mở cửa/màn khí' : '') },
      { pass: densityOk, label: 'Mật độ tải W/m³ trong dải tham khảo công nghiệp (5–45 W/m³)', detail: `${r.Q_per_m3.toFixed(2)} W/m³` + (densityOk ? '' : ' — ngoài dải tham khảo') },
      { pass: safetyPct >= 3 && safetyPct <= 25, label: 'Hệ số an toàn trong khoảng khuyến cáo (3–25%)', detail: `${safetyPct.toFixed(0)}%` },
      { pass: diagOk, label: 'Không còn cảnh báo/lỗi từ module chẩn đoán PASS/FAIL', detail: diagOk ? 'Đạt' : 'Còn cảnh báo chưa giải quyết — xem tab Tính toán' }
    ];
    const itemsEN = [
      { pass: geomOk, label: 'Geometry & area/volume reasonable', detail: geomOk ? `Area ${r.geom.area.toFixed(1)}m², volume ${r.geom.volume.toFixed(1)}m³` : 'Area/volume is zero or negative — check input dimensions' },
      { pass: uOk, label: 'Wall/floor U-value within reasonable range (0.08-0.45 W/m²K)', detail: `U_wall=${r.U_wall.toFixed(4)} W/m²K` },
      { pass: tDiffOk, label: 'T_room vs T_amb difference is realistic', detail: `ΔT=${Math.abs(i.T_room - i.T_amb).toFixed(1)}°C` },
      { pass: productPct <= 60, label: 'Product load proportion is reasonable', detail: `${productPct.toFixed(1)}% of total` },
      { pass: infilPct <= 40, label: 'Infiltration load not unusually large (>40%)', detail: `${infilPct.toFixed(1)}% of total` },
      { pass: densityOk, label: 'Load density within industry reference range (5-45 W/m³)', detail: `${r.Q_per_m3.toFixed(2)} W/m³` },
      { pass: safetyPct >= 3 && safetyPct <= 25, label: 'Safety factor within recommended range (3-25%)', detail: `${safetyPct.toFixed(0)}%` },
      { pass: diagOk, label: 'No unresolved warnings from PASS/FAIL diagnostic module', detail: diagOk ? 'OK' : 'Unresolved warnings — check Calculation tab' }
    ];
    const items = lang === 'en' ? itemsEN : itemsVI;
    const overallPass = items.every(function (it) { return it.pass; });
    const timestamp = new Date().toISOString();

    setTimeout(function () {
      removeTyping();
      const replyLines = items.map(function (it, idx) {
        return (it.pass ? '✓' : '✗') + ' ' + (idx + 1) + '. ' + it.label + ' — ' + it.detail;
      });
      const verdictLine = lang === 'en'
        ? (overallPass ? 'VERDICT: PASS' : 'VERDICT: NEEDS REVIEW')
        : (overallPass ? 'KẾT LUẬN: ĐẠT' : 'KẾT LUẬN: CẦN XEM LẠI');
      const disclaimer = t('aiCertifyDisclaimer');
      const reply = replyLines.join('\n') + '\n\n' + verdictLine + '\n\n' + disclaimer +
        '\n\n' + (lang === 'en'
          ? '(Rule-based offline check — deterministic, not an AI language-model judgment. Full cross-station AI review will be available at Hub level.)'
          : '(Rà soát rule-based offline — so sánh số liệu trực tiếp, không phải suy luận của mô hình ngôn ngữ. AI đánh giá toàn diện nhiều trạm sẽ có ở Hub tổng.)');
      appendCertificationMessage(reply, overallPass, timestamp);
      CSHL_UI.lastResult.aiCertification = { text: reply, overallPass: overallPass, timestamp: timestamp, lang: lang };
    }, 400);
  }

  function appendCertificationMessage(text, overallPass, timestamp) {
    const wrap = document.getElementById('aiMessages');
    const div = document.createElement('div');
    div.className = 'ai-msg assistant ai-certification fade-in';
    const stampLabel = overallPass ? t('aiCertifyPassStamp') : t('aiCertifyReviewStamp');
    const stampColor = overallPass ? 'var(--emerald)' : 'var(--amber)';
    const header = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
      '<span style="font-family:var(--font-mono);font-weight:800;font-size:13px;color:' + stampColor + ';border:2px solid ' + stampColor + ';border-radius:6px;padding:3px 10px">' + stampLabel + '</span>' +
      '<span style="font-family:var(--font-mono);font-size:10px;color:var(--slate-500)">' + new Date(timestamp).toLocaleString(CSHL_I18N.getLang() === 'en' ? 'en-US' : 'vi-VN') + '</span></div>';
    div.innerHTML = header + '<div style="white-space:pre-wrap">' + escapeHtml(text) + '</div>' +
      '<div style="margin-top:8px;font-size:10px;color:var(--slate-500);font-style:italic">' + t('aiCertifyDisclaimer') + '</div>';
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  return { send: send, ask: ask, renderWelcomeAndChips: renderWelcomeAndChips, requestCertification: requestCertification };
})();
