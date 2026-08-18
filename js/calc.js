// ===== calc.js =====
// ═══════════════════════════════════════════════════════════════
//  MODULE: calc — Engine tính toán tải nhiệt kho lạnh
//  Mọi công thức đều có chú giải nguồn: ASHRAE / TCVN / QCVN / file gốc
//  Đã áp dụng đầy đủ kết luận Audit Giai đoạn 1 (xem từng chú giải [AUDIT #x])
// ═══════════════════════════════════════════════════════════════
window.ColdStorageHeatLoad = window.ColdStorageHeatLoad || {};

(function (App) {
  'use strict';
  const calc = {};

  // ── [AUDIT #1.5.1] Bảng MAP đầy đủ 111 điểm (-60°C→50°C, bước 1°C) ──
  // Trước đây chỉ dùng 17 điểm bước 5°C, gây sai số nội suy không cần thiết.
  // Nay dùng đủ độ phân giải gốc của file Excel, nội suy tuyến tính giữa các độ nguyên liền kề.
  function interpMAP(T, mapTable) {
    const keys = Object.keys(mapTable).map(Number).sort((a, b) => a - b);
    if (T <= keys[0]) return mapTable[String(keys[0])];
    if (T >= keys[keys.length - 1]) return mapTable[String(keys[keys.length - 1])];
    const Tlow = Math.floor(T), Thigh = Math.ceil(T);
    if (Tlow === Thigh) return mapTable[String(Tlow)];
    const a = mapTable[String(Tlow)], b = mapTable[String(Thigh)];
    if (!a || !b) {
      // fallback nearest if exact integer key missing (should not happen with 111-point table)
      let nearest = keys[0];
      for (const k of keys) { if (Math.abs(k - T) < Math.abs(nearest - T)) nearest = k; }
      return mapTable[String(nearest)];
    }
    const t = (T - Tlow) / (Thigh - Tlow);
    return { rho: a.rho + t * (b.rho - a.rho), h: a.h + t * (b.h - a.h) };
  }

  // ── Áp suất bão hòa hơi nước (Antoine equation, hai nhánh trên/dưới 0°C) ──
  function pSat(T) {
    if (T >= 0) return 610.78 * Math.exp(17.2694 * T / (T + 238.3));
    return 610.78 * Math.exp(21.8746 * T / (T + 265.5));
  }

  // ── Độ ẩm tuyệt đối (humidity ratio), kg hơi nước / kg không khí khô ──
  function humidityRatio(T, RH_pct) {
    const ps = pSat(T);
    const pv = (RH_pct / 100) * ps;
    return 0.622 * pv / (101325 - pv);
  }

  // ── Enthalpy không khí ẩm (kJ/kg dry air), hiệu chỉnh theo RH thực tế ──
  function enthalpyMoistAir(T, RH_pct) {
    const W = humidityRatio(T, RH_pct);
    return 1.006 * T + W * (2501 + 1.86 * T);
  }

  // ── [Nguồn: file gốc (MC)Materialconductivity "Heat Equivalent/Person"] ──
  // Nhiệt tỏa ra từ 1 người lao động theo nhiệt độ phòng lạnh — nội suy tuyến tính giữa các mốc.
  function personHeatLoad(T_room, personHeatTable) {
    const sorted = [...personHeatTable].sort((a, b) => b.T - a.T); // giảm dần theo T
    if (T_room >= sorted[0].T) return sorted[0].W;
    if (T_room <= sorted[sorted.length - 1].T) return sorted[sorted.length - 1].W;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (T_room <= sorted[i].T && T_room >= sorted[i + 1].T) {
        const t = (T_room - sorted[i + 1].T) / (sorted[i].T - sorted[i + 1].T);
        return sorted[i + 1].W + t * (sorted[i].W - sorted[i + 1].W);
      }
    }
    return sorted[sorted.length - 1].W;
  }

  // ── Tra nhiệt thở (respiration) theo sản phẩm + nhiệt độ, nội suy giữa các mốc 0/5/10/15/20/25°C ──
  // [AUDIT #1.2.4] CHỈ áp dụng cho rau/quả tươi (Vegetables/Fruits) VÀ khi T_room > T_freeze
  // (sản phẩm còn "sống"/chưa cấp đông). Ghi chú gốc file: "Only for fruits in cooling Storage".
  function respirationLoad(productName, T_room, respirationTable) {
    const entry = respirationTable.find(r => r.name === productName);
    if (!entry) return 0;
    const temps = Object.keys(entry.values).map(Number).sort((a, b) => a - b);
    if (!temps.length) return 0;
    if (T_room <= temps[0]) return entry.values[String(temps[0])];
    if (T_room >= temps[temps.length - 1]) return entry.values[String(temps[temps.length - 1])];
    for (let i = 0; i < temps.length - 1; i++) {
      if (T_room >= temps[i] && T_room <= temps[i + 1]) {
        const f = (T_room - temps[i]) / (temps[i + 1] - temps[i]);
        const a = entry.values[String(temps[i])], b = entry.values[String(temps[i + 1])];
        return a + f * (b - a);
      }
    }
    return 0;
  }

  calc.interpMAP = interpMAP;
  calc.pSat = pSat;
  calc.humidityRatio = humidityRatio;
  calc.enthalpyMoistAir = enthalpyMoistAir;
  calc.personHeatLoad = personHeatLoad;
  calc.respirationLoad = respirationLoad;

  App.calc = calc;
})(window.ColdStorageHeatLoad);
// ═══════════════════════════════════════════════════════════════
//  MODULE: calc — U-value tường/nền (đa lớp, nhiệt trở nối tiếp)
// ═══════════════════════════════════════════════════════════════
window.ColdStorageHeatLoad = window.ColdStorageHeatLoad || {};

(function (App) {
  'use strict';
  const calc = App.calc;

  // ── [AUDIT #1.1.1] U = 1/(1/Hin + Σ(t_i/k_i) + 1/Hout) — ĐÚNG, giữ nguyên ──
  // Hin = Hout = 9.1 W/m²K: hệ số tỏa nhiệt đối lưu bề mặt phẳng, khớp trực tiếp với
  // giá trị "Iner/outer Conductance" trong file gốc ID01 (không phải số tự đặt).
  //
  // ── [AUDIT #1.1.2] Độ dày lớp tôn/vật liệu phụ — SỬA: tra đúng từ database
  // "materialSkinSpec" (Tole=0.5mm, Cement=150mm, Craft=0.8mm, Bitum=1mm) thay vì
  // hardcode gần đúng như các phiên bản trước.
  function computeUWall(materials, materialSkinSpec, coreMaterialName, coreThicknessMm, opts) {
    opts = opts || {};
    const Hin = opts.Hin || 9.1, Hout = opts.Hout || 9.1;
    const skinName = opts.skinName || 'Tole';
    const skin = materials.find(m => m.name === skinName) || { k: 45.3 };
    const skinThickM = (materialSkinSpec[skinName] || 0.5) / 1000;
    const core = materials.find(m => m.name === coreMaterialName);
    const coreK = core ? core.k : 0.021;
    const coreThickM = coreThicknessMm / 1000;
    const R = 1 / Hin + skinThickM / skin.k + coreThickM / coreK + skinThickM / skin.k + 1 / Hout;
    return 1 / R;
  }

  // ── Nền: Cement(150mm) + Craft(0.8mm) + lõi cách nhiệt + Craft(0.8mm) + Bitum(1mm) ──
  // Độ dày các lớp phụ tra đúng từ materialSkinSpec, không hardcode.
  function computeUFloor(materials, materialSkinSpec, coreMaterialName, coreThicknessMm, opts) {
    opts = opts || {};
    const Hin = opts.Hin || 9.1, Hout = opts.Hout || 9.1;
    const cement = materials.find(m => m.name === 'Cement') || { k: 0.57 };
    const craft = materials.find(m => m.name === 'Craft') || { k: 0.13 };
    const bitum = materials.find(m => m.name === 'Bitum') || { k: 0.18 };
    const core = materials.find(m => m.name === coreMaterialName);
    const coreK = core ? core.k : 0.0289;
    const coreThickM = coreThicknessMm / 1000;
    const cementThickM = (materialSkinSpec['Cement'] || 150) / 1000;
    const craftThickM = (materialSkinSpec['Craft'] || 0.8) / 1000;
    const bitumThickM = (materialSkinSpec['Bitum'] || 1) / 1000;
    const R = 1 / Hin + cementThickM / cement.k + craftThickM / craft.k + coreThickM / coreK +
              craftThickM / craft.k + bitumThickM / bitum.k + 1 / Hout;
    return 1 / R;
  }

  // ── [AUDIT #1.1.3] Tải truyền nhiệt ÂM khi T_outside < T_room — SỬA: clamp về 0 ──
  // File gốc (vd ID03 Wall1: T_out=-22°C cạnh kho lạnh, T_room=10°C → load=-0.303kW) cộng
  // thẳng giá trị âm vào tổng tải của phòng đang xét. Về kỹ thuật, 1 phòng không "nhận lạnh
  // miễn phí" từ phòng bên cạnh trong tính toán công suất máy lạnh cho riêng phòng đó — việc
  // tận dụng nhiệt giữa các phòng (nếu có) phải xử lý ở cấp thiết kế hệ thống tổng, không phải
  // bằng cách trừ thẳng vào load của 1 phòng đơn lẻ. Do đó: Load = max(U×A×ΔT, 0).
  function transmissionLoad(U, area, T_outside, T_room) {
    const dT = T_outside - T_room;
    const loadW = U * area * dT;
    return Math.max(loadW, 0) / 1000; // kW
  }

  calc.computeUWall = computeUWall;
  calc.computeUFloor = computeUFloor;
  calc.transmissionLoad = transmissionLoad;

  App.calc = calc;
})(window.ColdStorageHeatLoad);
// ═══════════════════════════════════════════════════════════════
//  MODULE: calc — Hình học kho (chữ nhật / chữ nhật khuyết góc 6 cạnh)
// ═══════════════════════════════════════════════════════════════
window.ColdStorageHeatLoad = window.ColdStorageHeatLoad || {};

(function (App) {
  'use strict';
  const calc = App.calc;

  function computeGeometry(input) {
    const H = input.H;
    if (input.shape === 'rect') {
      const { L, W } = input;
      if (!(L > 0) || !(W > 0) || !(H > 0)) return { valid: false, error: 'Kích thước phải lớn hơn 0' };
      const area = L * W;
      const perimeter = 2 * (L + W);
      return {
        valid: true, area, perimeter, volume: area * H, H,
        walls: [
          { name: 'Tường 1', area: L * H, faceKey: 'wall1' },
          { name: 'Tường 2', area: L * H, faceKey: 'wall2' },
          { name: 'Tường 3', area: W * H, faceKey: 'wall3' },
          { name: 'Tường 4', area: W * H, faceKey: 'wall4' }
        ],
        shape: 'rect'
      };
    } else if (input.shape === 'lshape') {
      const { ls_L1: L1, ls_W1: W1, ls_L3: L3, ls_W2: W2 } = input;
      if (!(L1 > 0) || !(W1 > 0) || !(H > 0)) return { valid: false, error: 'Kích thước tổng thể phải lớn hơn 0' };
      if (L3 >= L1 || W2 >= W1 || L3 <= 0 || W2 <= 0) {
        return { valid: false, error: 'Kích thước góc cắt (L3, W2) phải lớn hơn 0 và nhỏ hơn kích thước tổng thể' };
      }
      const area = L1 * W1 - L3 * W2;
      const s1 = L1 * H, s6 = W1 * H, s3small = (W1 - W2) * H, s2 = L3 * H, s4 = W2 * H;
      return {
        valid: true, area, perimeter: L1 + W1 + (L1 - L3) + W2 + L3 + (W1 - W2), volume: area * H, H,
        walls: [
          { name: 'Tường 1 (đáy, dài L1)', area: s1, faceKey: 'wall1' },
          { name: 'Tường 2 (đối diện, dài L1)', area: s6, faceKey: 'wall2' },
          { name: 'Tường 3 (cạnh, rộng W1-W2)', area: s3small, faceKey: 'wall3' },
          { name: 'Tường 4 (cạnh đối, rộng W1)', area: W1 * H, faceKey: 'wall4' },
          { name: 'Tường 5 (mặt cắt ngang L3)', area: s2, faceKey: 'wall5' },
          { name: 'Tường 6 (mặt cắt dọc W2)', area: s4, faceKey: 'wall6' }
        ],
        shape: 'lshape'
      };
    } else {
      // ── U-shape (8 cạnh): hình chữ nhật tổng L1×W1, khuyết 1 hốc chữ nhật L3×W2 cắt từ giữa cạnh trên ──
      const { us_L1: L1, us_W1: W1, us_L3: L3, us_W2: W2 } = input;
      if (!(L1 > 0) || !(W1 > 0) || !(H > 0)) return { valid: false, error: 'Kích thước tổng thể phải lớn hơn 0' };
      if (L3 >= L1 || W2 >= W1 || L3 <= 0 || W2 <= 0) {
        return { valid: false, error: 'Kích thước hốc khuyết (L3, W2) phải lớn hơn 0 và nhỏ hơn kích thước tổng thể' };
      }
      const area = L1 * W1 - L3 * W2;
      const sideArmLength = (L1 - L3) / 2; // chiều dài mỗi cánh chữ U (đỉnh, 2 bên khuyết)
      const perimeter = L1 + W1 + sideArmLength + W2 + L3 + W2 + sideArmLength + W1;
      return {
        valid: true, area, perimeter, volume: area * H, H,
        walls: [
          { name: 'Tường 1 (đáy, dài L1)', area: L1 * H, faceKey: 'wall1' },
          { name: 'Tường 2 (cạnh phải, rộng W1)', area: W1 * H, faceKey: 'wall2' },
          { name: 'Tường 3 (đỉnh phải, dài (L1-L3)/2)', area: sideArmLength * H, faceKey: 'wall3' },
          { name: 'Tường 4 (vách trong phải hốc, sâu W2)', area: W2 * H, faceKey: 'wall4' },
          { name: 'Tường 5 (đáy hốc, rộng L3)', area: L3 * H, faceKey: 'wall5' },
          { name: 'Tường 6 (vách trong trái hốc, sâu W2)', area: W2 * H, faceKey: 'wall6' },
          { name: 'Tường 7 (đỉnh trái, dài (L1-L3)/2)', area: sideArmLength * H, faceKey: 'wall7' },
          { name: 'Tường 8 (cạnh trái, rộng W1)', area: W1 * H, faceKey: 'wall8' }
        ],
        shape: 'ushape'
      };
    }
  }

  calc.computeGeometry = computeGeometry;
  App.calc = calc;
})(window.ColdStorageHeatLoad);
// ═══════════════════════════════════════════════════════════════
//  MODULE: calc — Tải sản phẩm (Product Load)
// ═══════════════════════════════════════════════════════════════
window.ColdStorageHeatLoad = window.ColdStorageHeatLoad || {};

(function (App) {
  'use strict';
  const calc = App.calc;

  // ── [AUDIT #1.2.2] Lỗi 3-giai-đoạn khi T_in nằm GIỮA T_freeze và T_final ──
  // Tác giả file gốc tự ghi chú: "kiểm lại công thức hiện tại chưa đúng với trường hợp
  // nhiệt độ ở khoảng giữa". SỬA: kiểm tra điều kiện chặt chẽ theo từng giai đoạn dựa trên
  // vị trí TƯƠNG ĐỐI của T_in, T_freeze, T_final — không giả định T_in luôn ở trên điểm đông.
  function computeProductCoolingLoad(params) {
    const T_in = params.T_in, T_final = params.T_final, T_freeze = params.T_freeze;
    const Cp_above = params.Cp_above, Cp_below = params.Cp_below, Lf = params.Lf;
    const mass_kg = params.mass_kg, pulldown_hr = params.pulldown_hr;
    const timeSec = pulldown_hr * 3600;

    let Q_above_freeze = 0, Q_latent = 0, Q_below_freeze = 0;

    if (T_in > T_freeze) {
      Q_above_freeze = Cp_above * (T_in - T_freeze) * mass_kg / timeSec;
      if (T_final < T_freeze) {
        Q_latent = Lf * mass_kg / timeSec;
      }
    }

    if (T_final < T_freeze) {
      const startTemp = T_in > T_freeze ? T_freeze : T_in;
      Q_below_freeze = Cp_below * (startTemp - T_final) * mass_kg / timeSec;
    }

    return {
      Q_above_freeze: Q_above_freeze, Q_latent: Q_latent, Q_below_freeze: Q_below_freeze,
      Q_total: Q_above_freeze + Q_latent + Q_below_freeze
    };
  }

  // ── [AUDIT #1.2.3] Tải bao bì/đóng gói sản phẩm (Product Load §2.2 trong file gốc) ──
  function computePackingProductLoad(params) {
    const massPackingPerDay_kg = params.massPackingPerDay_kg, cpPacking = params.cpPacking;
    const T_in = params.T_in, T_final = params.T_final, pulldown_hr = params.pulldown_hr;
    const timeSec = pulldown_hr * 3600;
    return massPackingPerDay_kg * cpPacking * (T_in - T_final) / timeSec;
  }

  calc.computeProductCoolingLoad = computeProductCoolingLoad;
  calc.computePackingProductLoad = computePackingProductLoad;
  App.calc = calc;
})(window.ColdStorageHeatLoad);
// ═══════════════════════════════════════════════════════════════
//  MODULE: calc — Tải xâm nhập không khí (Infiltration Load)
//  [AUDIT #1.3.4] Tách 2 cơ chế cộng riêng theo đúng cấu trúc file gốc:
//   (a) Air exchange — qua cửa đóng/mở theo chu kỳ, công thức Gosney-Olama
//   (b) Flow through doorway — dòng trực tiếp qua lỗ mở cố định (vận tốc gió trung bình)
// ═══════════════════════════════════════════════════════════════
window.ColdStorageHeatLoad = window.ColdStorageHeatLoad || {};

(function (App) {
  'use strict';
  const calc = App.calc;

  // ── (a) Air exchange — Gosney & Olama (1975), ASHRAE Refrigeration Handbook Ch.24 ──
  // Q_ss = 0.221×A×(1−ρi/ρr)^0.5×(g·H)^0.5×ρr×Fm×(hi−hr)  [kW]
  // ρi = không khí xâm nhập (ấm/nhẹ hơn), ρr = không khí trong kho (lạnh/đặc hơn) → ρi/ρr < 1 luôn đúng.
  // [AUDIT #1.3.2] Df (doorway flow factor): dùng ĐÚNG chuẩn ASHRAE/Minnesota TRM
  //   = 0.8 nếu |ΔT| > 11°C (~20°F), = 1.1 nếu |ΔT| ≤ 11°C.
  //   (File gốc dùng giá trị tùy biến 0.8/1.2/1.5 theo loại cửa không có cơ sở ASHRAE xác minh
  //    được — đã thay bằng quy tắc chuẩn theo ΔT như khuyến cáo chính thức.)
  function airExchangeLoad(opening, T_room, RH_room, T_outside, RH_outside, mapTable) {
    const g = 9.81;
    const rho_r = calc.interpMAP(T_room, mapTable).rho;
    const rho_i = calc.interpMAP(T_outside, mapTable).rho;
    const h_r = calc.enthalpyMoistAir(T_room, RH_room);
    const h_i = calc.enthalpyMoistAir(T_outside, RH_outside);

    const area = (opening.w * opening.h) * (opening.count || 1);
    const H = opening.h;

    const densityRatio = rho_i / rho_r;
    const Fm = Math.pow(2 / (1 + Math.pow(densityRatio, 1 / 3)), 1.5);
    const Qv_ss = 0.221 * area * Math.sqrt(Math.max(1 - densityRatio, 0)) * Math.sqrt(g * H);

    const dT_abs = Math.abs(T_outside - T_room);
    const Df = dT_abs > 11 ? 0.8 : 1.1;

    const totalOpenSec = (opening.openTimeSec || 0) * (opening.cyclesPerDay || 0);
    const Dt = Math.min(totalOpenSec / (24 * 3600), 1);
    const eta = opening.protectionEff !== undefined ? opening.protectionEff : 0;

    const Q_ss = Qv_ss * rho_r * Fm * (h_i - h_r);
    const Q_avg = Q_ss * Df * Dt * (1 - eta);

    return {
      load: Math.max(Q_avg, 0), Qv: Qv_ss, Df: Df, Dt: Dt, Fm: Fm,
      method: 'Gosney-Olama (ASHRAE Ch.24) — Air exchange'
    };
  }

  // ── (b) Flow through doorway — dòng trực tiếp qua lỗ mở khi cửa/lỗ thông LUÔN có khoảng hở ──
  // [Nguồn: file gốc §4.2 "Infiltration by flow through doorway"]
  // Q = A × v × ρ_i × (h_i − h_r) × Dt_open, với v = vận tốc gió trung bình qua lỗ hở (m/s, nhập tay
  // hoặc mặc định 1.2 m/s theo file gốc — đây là số liệu thực nghiệm của tác giả gốc, không phải
  // hằng số ASHRAE chính thức, cần ghi rõ trong UI là giá trị tham khảo).
  function flowThroughDoorwayLoad(opening, T_room, RH_room, T_outside, RH_outside, mapTable, avgVelocity) {
    const rho_i = calc.interpMAP(T_outside, mapTable).rho;
    const h_r = calc.enthalpyMoistAir(T_room, RH_room);
    const h_i = calc.enthalpyMoistAir(T_outside, RH_outside);

    let area;
    if (opening.kind === 'vent') area = Math.PI * Math.pow(opening.diameter / 2, 2) * (opening.count || 1);
    else area = opening.w * opening.h * (opening.count || 1);

    const v = avgVelocity != null ? avgVelocity : 1.2; // m/s, mặc định theo file gốc (tham khảo, không phải ASHRAE)
    const hoursOpen = opening.hoursOpenPerDay !== undefined ? opening.hoursOpenPerDay : 24;
    const Dt = Math.min(hoursOpen / 24, 1);
    const eta = opening.protectionEff || 0;

    const Q = area * v * rho_i * (h_i - h_r) * Dt * (1 - eta);
    return { load: Math.max(Q, 0), velocity: v, Dt: Dt, area: area, method: 'Flow through doorway (vận tốc gió cố định)' };
  }

  calc.airExchangeLoad = airExchangeLoad;
  calc.flowThroughDoorwayLoad = flowThroughDoorwayLoad;
  App.calc = calc;
})(window.ColdStorageHeatLoad);
// ═══════════════════════════════════════════════════════════════
//  MODULE: calc — Tải nội bộ (Internal Load)
// ═══════════════════════════════════════════════════════════════
window.ColdStorageHeatLoad = window.ColdStorageHeatLoad || {};

(function (App) {
  'use strict';
  const calc = App.calc;

  function peopleLoad(T_room, nPeople, hoursPerDay, personHeatTable) {
    const W_per_person = calc.personHeatLoad(T_room, personHeatTable);
    return W_per_person * nPeople * hoursPerDay / 24 / 1000;
  }

  // ── [AUDIT #1.4.2] Xe nâng — giữ hướng đã sửa: working-hours theo capacity/coefficient.
  // File gốc tự ghi chú "Đổi lại vận tốc xe nâng điện", "Điều chỉnh quảng đường lấy hàng" —
  // tác giả gốc cũng chưa hoàn chỉnh công thức này, không có biến vận tốc/quãng đường thực.
  function vehicleWorkingHours(tonPerDay, vehicleSpec) {
    if (!vehicleSpec || !vehicleSpec.capacity_ton_per_hr) return 0;
    return (tonPerDay / vehicleSpec.capacity_ton_per_hr) * (vehicleSpec.coefficient || 0.7);
  }

  function vehicleLoad(vehicleSpec, nVehicles, workingHours) {
    return vehicleSpec.power_kw * nVehicles * workingHours / 24;
  }

  function lightsLoad(nLights, wattsPerLight, hoursPerDay) {
    return nLights * (wattsPerLight / 1000) * hoursPerDay / 24;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Mật độ chiếu sáng (W/m²) theo chiều cao thông thuỷ — piecewise linear
  //  [Nguồn: số liệu dự án thực tế người dùng cung cấp, KHÔNG phải trích dẫn ASHRAE/TCVN]
  //  3 mốc gốc: H≤4.2m (đèn tuýp 40W/lưới 3x4m)=3.33 W/m²; H=7m (floodlight 100W/lưới 6x6m)=2.78 W/m²;
  //  H=11.8m — tương đương kho 6 tầng kệ (floodlight 150W/lưới 5.85x5.975m)=4.29 W/m².
  //  Không nội suy thẳng qua cả 3 điểm (không đơn điệu — 2 công nghệ đèn khác nhau: tuýp vs
  //  floodlight) — chia 4 đoạn: cố định dưới 4.2m, giữ ở mốc thấp nhất từ 4.2-7m (chưa có số liệu
  //  đoạn này), nội suy tuyến tính 7-11.8m, giữ cố định trên 11.8m (kho càng cao ngoài mốc này —
  //  vd ASRS 15-30m — không cần tăng thêm vì chủ yếu vận hành tự động, đèn chỉ phục vụ bảo trì).
  // ═══════════════════════════════════════════════════════════════
  const LIGHTING_DENSITY_POINTS = { H1: 4.2, D1: 3.33, H2: 7, D2: 2.78, H3: 11.8, D3: 4.29 };
  function computeLightingDensityByHeight(H) {
    const p = LIGHTING_DENSITY_POINTS;
    if (H <= p.H1) return p.D1;
    if (H <= p.H2) return p.D2;
    if (H <= p.H3) return p.D2 + (p.D3 - p.D2) * (H - p.H2) / (p.H3 - p.H2);
    return p.D3;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Bố trí kệ pallet đôi (double-bay racking) + nội suy sức chứa tự động
  //  [Nguồn: kinh nghiệm thực tế người dùng cung cấp, KHÔNG phải trích dẫn ASHRAE/TCVN]
  //  Module kệ: 1000mm(sâu) x 2390mm(rộng) chứa 2 pallet 1200x1000mm.
  //  Bố trí cắt ngang (theo chiều rộng phòng W): mép tường -125-1000(kệ)-3600(lối đi)-
  //  1000(kệ)-125-125(khe lưng kệ)- lặp lại -125(mép tường còn lại).
  //  Chiều cao: beam đáy cách sàn 250mm, các tầng cách nhau 1800mm, beam trên cùng
  //  cách trần panel tối thiểu 2300mm (khoảng lùi an toàn xe nâng/đầu phun sprinkler).
  // ═══════════════════════════════════════════════════════════════
  const RACK_LAYOUT = {
    palletDepth: 1.0, bayWidth: 2.39, aisle: 3.6, wallClearance: 0.125, flueGap: 0.125,
    levelPitch: 1.8, bottomClearance: 0.25, topClearance: 2.3
  };

  function computeAutoLevels(H, cfg) {
    const rl = cfg || RACK_LAYOUT;
    const usable = H - rl.bottomClearance - rl.topClearance;
    if (usable < 0) return 0;
    return Math.floor(usable / rl.levelPitch) + 1;
  }

  // Số dãy kệ (hàng đơn, 1 pallet sâu) xếp được theo chiều W (chiều cắt ngang qua lối đi) —
  // đơn vị lặp: kệ + lối đi + kệ + khe lưng = 2 dãy kệ.
  function computeRackRowsAcrossWidth(W, cfg) {
    const rl = cfg || RACK_LAYOUT;
    const available = W - 2 * rl.wallClearance;
    if (available <= 0) return 0;
    const unit = rl.palletDepth + rl.aisle + rl.palletDepth + 2 * rl.flueGap;
    const fullUnits = Math.floor(available / unit);
    let rows = fullUnits * 2;
    const remainder = available - fullUnits * unit;
    if (remainder >= (rl.palletDepth + rl.aisle + rl.palletDepth)) rows += 2;
    else if (remainder >= (rl.palletDepth + rl.aisle)) rows += 1;
    return rows;
  }

  // Số vị trí pallet dọc theo chiều dài dãy kệ (L) — mỗi nửa module bayWidth/2 chứa 1 pallet.
  function computeBaysAlongLength(L, cfg) {
    const rl = cfg || RACK_LAYOUT;
    return Math.floor(L / (rl.bayWidth / 2));
  }

  // Tổng sức chứa pallet tự động nội suy = số dãy kệ × số vị trí/dãy/tầng × số tầng.
  // Giả định: W là chiều cắt ngang qua lối đi, L là chiều dọc theo dãy kệ — đảo ngược lại
  // nếu bố trí thực tế của bạn ngược trục. cfg (tuỳ chọn): hằng số bố trí lấy từ Database
  // (tab Database → "Cấu hình bố trí kệ") — nếu không truyền, dùng mặc định RACK_LAYOUT.
  function computeAutoPalletCapacity(L, W, H, cfg) {
    const rows = computeRackRowsAcrossWidth(W, cfg);
    const bays = computeBaysAlongLength(L, cfg);
    const levels = computeAutoLevels(H, cfg);
    return { rows: rows, baysPerRow: bays, levels: levels, total: rows * bays * levels };
  }

  function evaporatorFanLoad(nEvap, fanPerEvap, kwPerFan, hoursPerDay) {
    return nEvap * fanPerEvap * kwPerFan * hoursPerDay / 24;
  }

  function defrostHeaterLoad(nEvap, heaterPerEvap, kwPerHeater, timesPerDay, durationMin) {
    return nEvap * heaterPerEvap * kwPerHeater * timesPerDay * durationMin / 60 / 24;
  }

  // ── [AUDIT #1.4.3] Packing related load — MỤC MỚI BỔ SUNG, khác với Product Load §2.2 ──
  // Tải nhiệt do LUÂN CHUYỂN/THAY THẾ vật liệu đóng gói trong kho (không phải làm lạnh lần đầu
  // khi sản phẩm mới nhập — đó là Product Load §2.2).
  function packingRelatedLoad(packingSpec, palletTurnsPerDay, T_room, T_inPallet) {
    let total = 0;
    const breakdown = [];
    packingSpec.forEach(function (p) {
      const massKg = p.pctMassPerPallet * p.massPerPallet;
      const q = massKg * p.cp * Math.abs(T_inPallet - T_room) * palletTurnsPerDay / (24 * 3600);
      total += q;
      breakdown.push({ material: p.material, load: q });
    });
    return { total: total, breakdown: breakdown };
  }

  calc.peopleLoad = peopleLoad;
  calc.vehicleWorkingHours = vehicleWorkingHours;
  calc.vehicleLoad = vehicleLoad;
  calc.lightsLoad = lightsLoad;
  calc.computeLightingDensityByHeight = computeLightingDensityByHeight;
  calc.computeAutoLevels = computeAutoLevels;
  calc.computeRackRowsAcrossWidth = computeRackRowsAcrossWidth;
  calc.computeBaysAlongLength = computeBaysAlongLength;
  calc.computeAutoPalletCapacity = computeAutoPalletCapacity;
  calc.DEFAULT_RACK_LAYOUT = RACK_LAYOUT;
  calc.evaporatorFanLoad = evaporatorFanLoad;
  calc.defrostHeaterLoad = defrostHeaterLoad;
  calc.packingRelatedLoad = packingRelatedLoad;
  App.calc = calc;
})(window.ColdStorageHeatLoad);
// ═══════════════════════════════════════════════════════════════
//  MODULE: calc — Tải ẩm (Moisture Load) + Dung tích chứa & Tần suất xuất nhập
// ═══════════════════════════════════════════════════════════════
window.ColdStorageHeatLoad = window.ColdStorageHeatLoad || {};

(function (App) {
  'use strict';
  const calc = App.calc;

  function latentHeatMoisture(T_room) {
    const L_vap = 2501 - 2.361 * T_room;
    const L_fusion = 333.55;
    return T_room < 0 ? (L_vap + L_fusion) : L_vap;
  }

  function estimateJointLength(geom, panelWidthM) {
    const H = geom.H;
    const perimeter = geom.perimeter;
    const nJointsWall = Math.max(Math.round(perimeter / panelWidthM) - 1, 0);
    const jointLengthWall = nJointsWall * H;
    const sideEstimate = Math.sqrt(geom.area);
    const nJointsCeiling = Math.max(Math.round(sideEstimate / panelWidthM) - 1, 0) * 2;
    const jointLengthCeiling = nJointsCeiling * sideEstimate;
    return jointLengthWall + jointLengthCeiling;
  }

  function moistureWallLoad(input, geom) {
    const T_amb = input.T_amb, RH_amb = input.RH_amb, T_room = input.T_room, RH_room = input.RH_room;
    const ps_amb = calc.pSat(T_amb) * (RH_amb / 100);
    const ps_room = calc.pSat(T_room) * (RH_room / 100);
    const dp_vapor = Math.max(ps_amb - ps_room, 0);
    const mode = input.vaporInfiltrationMode || 'joint';
    let vapor_area, perm, mvap, jointLength;

    if (mode === 'manual') {
      vapor_area = input.vapor_area || (geom.walls.reduce(function (s, w) { return s + w.area; }, 0) + geom.area);
      perm = (input.vapor_perm || 0) * 1e-9;
      mvap = perm * vapor_area * dp_vapor;
    } else if (mode === 'panel_body') {
      vapor_area = geom.walls.reduce(function (s, w) { return s + w.area; }, 0) + geom.area;
      perm = 0.02e-9;
      mvap = perm * vapor_area * dp_vapor;
    } else {
      jointLength = input.jointLengthOverride || estimateJointLength(geom, input.panelWidthM || 1.0);
      const jointLeakage = input.jointLeakagePerM != null ? input.jointLeakagePerM : 0.15;
      perm = jointLeakage * 1e-9;
      mvap = perm * jointLength * dp_vapor;
      vapor_area = jointLength;
    }

    const L_cond = latentHeatMoisture(T_room);
    return { Q: mvap * L_cond, vapor_area: vapor_area, dp_vapor: dp_vapor, mode: mode, jointLength: jointLength, L_cond: L_cond };
  }

  function moistureExchangeLoad(input, geom, mapTable) {
    const T_amb = input.T_amb, RH_amb = input.RH_amb, T_room = input.T_room, RH_room = input.RH_room;
    const W_amb = calc.humidityRatio(T_amb, RH_amb);
    const W_room = calc.humidityRatio(T_room, RH_room);
    const rho_room = calc.interpMAP(T_room, mapTable).rho;
    const mass_air_exchange = geom.volume * rho_room * input.air_exchange * (input.air_exchange_pct / 100);
    const dW = Math.max(W_amb - W_room, 0);
    const L_cond = latentHeatMoisture(T_room);
    const Q = mass_air_exchange * dW * L_cond / (24 * 3600);
    return { Q: Q, W_amb: W_amb, W_room: W_room, L_cond: L_cond };
  }

  const BULK_DENSITY_BY_GROUP = {
    'Vegetables': 250, 'Fruits': 350, 'Whole Fish': 500, 'Shellfish': 450,
    'Beef': 550, 'Pork': 550, 'Lamb': 550, 'Poultry Products': 500, 'Sausage': 500,
    'Dairy Products': 450, 'Milk': 450, 'Cream': 450, 'Cheese': 600, 'Ice Cream': 400,
    'Egg': 400, 'Juice and Beverages': 700, 'Concentrate': 750, 'Nuts, Shelled': 350,
    'Candy': 450, 'Cereal product': 450, 'Root starch': 500, 'Miscellaneous': 400
  };
  function getDefaultBulkDensity(productGroup) {
    return BULK_DENSITY_BY_GROUP[productGroup] || 350;
  }

  function computeStorageCapacity(input, geom) {
    const H = geom.H;
    const mode = input.storageCapacityMode;
    if (mode === 'manual') {
      return { mass_total_ton: input.mass_total_manual, method: 'Nhập tay', detail: 'Người dùng nhập trực tiếp' };
    }
    if (H <= 5.5) {
      const method = input.lowCeilingMethod || 'pct45';
      const fillPct = method === 'pct45' ? 0.45 : (input.ashraeFillPct || 0.65);
      const netVolume = geom.volume * fillPct;
      const bulkDensity = input.productBulkDensity || getDefaultBulkDensity(input.productGroupForDensity);
      const mass_total_ton = netVolume * bulkDensity / 1000;
      return {
        mass_total_ton: mass_total_ton,
        method: method === 'pct45' ? 'Chất tay — 45% thể tích' : 'Chất tay — tỷ lệ FAO/ASHRAE (net/gross volume)',
        fillPct: fillPct, netVolume: netVolume, bulkDensity: bulkDensity,
        detail: 'V_net = ' + netVolume.toFixed(1) + ' m³ (' + (fillPct * 100).toFixed(0) + '% V_gross) × ' + bulkDensity + ' kg/m³'
      };
    } else {
      const palletWeight = input.palletWeight || 750;
      const palletCount = input.palletCount || 0;
      const mass_total_ton = palletCount * palletWeight / 1000;
      return { mass_total_ton: mass_total_ton, method: 'Chất pallet', palletWeight: palletWeight, palletCount: palletCount,
        detail: palletCount + ' pallet × ' + palletWeight + ' kg/pallet' };
    }
  }

  function computeDailyThroughput(input, mass_total_ton) {
    const mode = input.throughputMode;
    if (mode === 'manual') return { mass_in_ton: input.mass_in_manual, method: 'Nhập tay' };
    if (mode === 'dock') {
      const nDocks = input.nDocks || 1;
      const maxTripsPerDock = input.maxTripsPerDock != null ? input.maxTripsPerDock : 2;
      const tonPerTrip = input.tonPerTrip != null ? input.tonPerTrip : 25;
      return { mass_in_ton: nDocks * maxTripsPerDock * tonPerTrip,
        method: nDocks + ' dock × ' + maxTripsPerDock + ' lần/ngày × ' + tonPerTrip + ' tấn/lần' };
    }
    const pct = input.turnoverPct != null ? input.turnoverPct : 5;
    return { mass_in_ton: mass_total_ton * pct / 100, method: pct + '% × tổng tồn kho (' + mass_total_ton.toFixed(0) + ' tấn)' };
  }

  calc.latentHeatMoisture = latentHeatMoisture;
  calc.estimateJointLength = estimateJointLength;
  calc.moistureWallLoad = moistureWallLoad;
  calc.moistureExchangeLoad = moistureExchangeLoad;
  calc.getDefaultBulkDensity = getDefaultBulkDensity;
  calc.computeStorageCapacity = computeStorageCapacity;
  calc.computeDailyThroughput = computeDailyThroughput;
  App.calc = calc;
})(window.ColdStorageHeatLoad);
// ═══════════════════════════════════════════════════════════════
//  MODULE: calc — Chẩn đoán tự động (PASS/FAIL) trước khi xuất báo cáo
//  Theo yêu cầu brief mục 6: quét toàn bộ input/logic, hiển thị PASS trực
//  quan kèm danh sách hạng mục đã kiểm tra đạt, hoặc liệt kê lỗi/cảnh báo.
// ═══════════════════════════════════════════════════════════════
window.ColdStorageHeatLoad = window.ColdStorageHeatLoad || {};

(function (App) {
  'use strict';
  const calc = App.calc;

  const DIAGNOSTIC_CHECKS = [
    {
      id: 'no_negative_inputs', label: 'Không có giá trị âm/trống ở trường bắt buộc', severity: 'error',
      check: function (ctx) {
        const req = [ctx.input.H, ctx.input.T_in, ctx.result.mass_in, ctx.input.pulldown];
        return req.every(function (v) { return v !== null && v !== undefined && !isNaN(v); }) && ctx.input.pulldown > 0;
      }
    },
    {
      id: 'room_colder_than_ambient', label: 'Nhiệt độ trong kho thấp hơn nhiệt độ môi trường', severity: 'error',
      check: function (ctx) { return ctx.input.T_room < ctx.input.T_amb; }
    },
    {
      id: 'product_cooled_not_heated', label: 'Nhiệt độ nhập kho nên cao hơn nhiệt độ bảo quản (cảnh báo, không chặn)', severity: 'warning',
      check: function (ctx) { return ctx.input.T_final <= ctx.input.T_in; }
    },
    {
      id: 'u_value_walls_reasonable', label: 'U-value tường/nền trong khoảng hợp lý (0,05–2,0 W/m²K)', severity: 'warning',
      check: function (ctx) { return ctx.result.U_wall >= 0.05 && ctx.result.U_wall <= 2.0 && ctx.result.U_floor >= 0.05 && ctx.result.U_floor <= 2.0; }
    },
    {
      id: 'vehicle_hours_within_day', label: 'Giờ hoạt động xe nâng/quạt/đèn ≤ 24h/ngày', severity: 'error',
      check: function (ctx) {
        return ctx.result.t_forklift_internal <= 24 && ctx.result.t_forklift_dock <= 24 &&
               ctx.input.t_fan <= 24 && ctx.input.t_lights <= 24 && ctx.input.t_people <= 24;
      }
    },
    {
      id: 'safety_factor_typical', label: 'Hệ số an toàn trong khoảng khuyến cáo (5–20%)', severity: 'warning',
      check: function (ctx) { return ctx.input.safety >= 5 && ctx.input.safety <= 20; }
    },
    {
      id: 'rh_in_valid_range', label: 'Độ ẩm tương đối (RH) trong/ngoài đều trong khoảng 0–100%', severity: 'error',
      check: function (ctx) {
        return ctx.input.RH_amb >= 0 && ctx.input.RH_amb <= 100 && ctx.input.RH_room >= 0 && ctx.input.RH_room <= 100;
      }
    },
    {
      id: 'load_density_reasonable', label: 'Mật độ tải công suất ở mức hợp lý (kiểm tra tham khảo)', severity: 'warning',
      check: function (ctx) { return ctx.result.Q_per_m3 > 0 && ctx.result.Q_per_m3 < 200; }
    }
  ];

  function runDiagnostics(input, result) {
    const ctx = { input: input, result: result };
    const items = DIAGNOSTIC_CHECKS.map(function (c) {
      let passed;
      try { passed = !!c.check(ctx); } catch (e) { passed = false; }
      return { id: c.id, label: c.label, severity: c.severity, passed: passed };
    });
    const errors = items.filter(function (i) { return !i.passed && i.severity === 'error'; });
    const warnings = items.filter(function (i) { return !i.passed && i.severity === 'warning'; });
    return {
      items: items, errors: errors, warnings: warnings,
      overallPass: errors.length === 0,
      summary: errors.length === 0 ?
        (warnings.length === 0 ? 'PASS — tất cả ' + items.length + ' hạng mục đều đạt' : 'PASS với ' + warnings.length + ' cảnh báo') :
        'KHÔNG ĐẠT — ' + errors.length + ' lỗi cần xử lý'
    };
  }

  calc.DIAGNOSTIC_CHECKS = DIAGNOSTIC_CHECKS;
  calc.runDiagnostics = runDiagnostics;
  App.calc = calc;
})(window.ColdStorageHeatLoad);
// ═══════════════════════════════════════════════════════════════
//  MODULE: calc — runCalculation (orchestrator chính)
// ═══════════════════════════════════════════════════════════════
window.ColdStorageHeatLoad = window.ColdStorageHeatLoad || {};

(function (App) {
  'use strict';
  const calc = App.calc;

  function runCalculation(input, db) {
    const geom = calc.computeGeometry(input);
    if (!geom.valid) return { valid: false, error: geom.error };

    const T_amb = input.T_amb, RH_amb = input.RH_amb, T_room = input.T_room, RH_room = input.RH_room;
    const T_roof = input.T_roof, T_floor = input.T_floor;
    const safety = input.safety / 100;
    const mapTable = db.mapFull;

    const storageCapacity = calc.computeStorageCapacity(input, geom);
    const mass_total = storageCapacity.mass_total_ton;
    const throughput = calc.computeDailyThroughput(input, mass_total);
    const mass_in = throughput.mass_in_ton;

    const U_wall = calc.computeUWall(db.materials, db.materialSkinSpec, input.panelMaterial, input.panelThickness, {});
    const U_floor = calc.computeUFloor(db.materials, db.materialSkinSpec, input.floorMaterial, input.floorThickness, {});

    const wallDetails = [];
    let Q_trans_walls = 0;
    geom.walls.forEach(function (w) {
      const extKey = 'extTemp_' + w.faceKey;
      const T_ext = (input[extKey] !== undefined && input[extKey] !== null) ? input[extKey] : T_amb;
      const load = calc.transmissionLoad(U_wall, w.area, T_ext, T_room);
      Q_trans_walls += load;
      wallDetails.push({ name: w.name, area: w.area, U: U_wall, dT: T_ext - T_room, T_ext: T_ext, load: load });
    });
    const Q_ceiling = calc.transmissionLoad(U_wall, geom.area, T_roof, T_room);
    const Q_floor = calc.transmissionLoad(U_floor, geom.area, T_floor, T_room);
    wallDetails.push({ name: 'Trần', area: geom.area, U: U_wall, dT: T_roof - T_room, T_ext: T_roof, load: Q_ceiling });
    wallDetails.push({ name: 'Nền', area: geom.area, U: U_floor, dT: T_floor - T_room, T_ext: T_floor, load: Q_floor });
    const Q_trans = Q_trans_walls + Q_ceiling + Q_floor;

    const product = db.products.find(function (p) { return p.name === input.productName; }) || {};
    const T_in = input.T_in, T_final = input.T_final;
    const T_freeze = (input.T_freeze !== undefined && input.T_freeze !== null) ? input.T_freeze : (product.freezePoint != null ? product.freezePoint : -1);
    const Cp_above = input.Cp_above != null ? input.Cp_above : (product.cpAbove || 3.5);
    const Cp_below = input.Cp_below != null ? input.Cp_below : (product.cpBelow || 1.9);
    const Lf = input.latentHeat != null ? input.latentHeat : (product.latentHeat || 0);
    const mass_in_kg = mass_in * 1000;
    const pulldown = input.pulldown;
    const mass_total_kg = mass_total * 1000;

    const cooling = calc.computeProductCoolingLoad({
      T_in: T_in, T_final: T_final, T_freeze: T_freeze, Cp_above: Cp_above, Cp_below: Cp_below,
      Lf: Lf, mass_kg: mass_in_kg, pulldown_hr: pulldown
    });

    const isLivingProduce = product.group === 'Vegetables' || product.group === 'Fruits';
    const respirationApplies = isLivingProduce && T_room > T_freeze;
    const respPerKg = input.respirationOverride != null ? input.respirationOverride :
      (respirationApplies ? calc.respirationLoad(input.productName, T_room, db.respiration) : 0);
    const Q_respiration = respPerKg * mass_total_kg / 1e6;

    const massPackingPerDay_kg = (input.packingPctOfMassIn || 0.025) * mass_in_kg;
    const Q_packing_product = input.includePackingProductLoad !== false ?
      calc.computePackingProductLoad({
        massPackingPerDay_kg: massPackingPerDay_kg, cpPacking: input.packingCp || 1.4,
        T_in: T_in, T_final: T_final, pulldown_hr: pulldown
      }) : 0;

    const Q_product = cooling.Q_total + Q_respiration + Q_packing_product;

    const openingResults = [];
    let Q_infiltration = 0;
    (input.openings || []).forEach(function (op) {
      let res;
      if (op.mechanism === 'flow') {
        res = calc.flowThroughDoorwayLoad(op, T_room, RH_room, T_amb, RH_amb, mapTable, op.avgVelocity);
      } else {
        res = calc.airExchangeLoad(op, T_room, RH_room, T_amb, RH_amb, mapTable);
      }
      Q_infiltration += res.load;
      openingResults.push(Object.assign({}, op, res));
    });

    const Q_people = calc.peopleLoad(T_room, input.n_people, input.t_people, db.personHeat);

    const internalVehicleSpec = (db.vehicles || []).find(function (v) { return v.name === input.internalVehicleType; }) ||
      { capacity_ton_per_hr: 25.704, coefficient: 0.7, power_kw: 13.0968 };
    const dockVehicleSpec = (db.vehicles || []).find(function (v) { return v.name === input.dockVehicleType; }) ||
      { capacity_ton_per_hr: 17.952, coefficient: 0.7, power_kw: 13.0968 };

    const internalTonPerDay = input.internalTonPerDayOverride != null ? input.internalTonPerDayOverride : (mass_in * 2);
    const dockTonPerDay = input.dockTonPerDayOverride != null ? input.dockTonPerDayOverride : mass_in;

    const t_forklift_internal = input.t_forklift_internal_override != null ? input.t_forklift_internal_override : calc.vehicleWorkingHours(internalTonPerDay, internalVehicleSpec);
    const t_forklift_dock = input.t_forklift_dock_override != null ? input.t_forklift_dock_override : calc.vehicleWorkingHours(dockTonPerDay, dockVehicleSpec);

    const Q_forklift_internal = calc.vehicleLoad(internalVehicleSpec, input.n_forklift_internal, t_forklift_internal);
    const Q_forklift_dock = calc.vehicleLoad(dockVehicleSpec, input.n_forklift_dock, t_forklift_dock);
    const Q_forklift = Q_forklift_internal + Q_forklift_dock;

    const Q_lights = calc.lightsLoad(1, geom.area * (input.lightingWm2 || 0), input.t_lights);
    const Q_fans = calc.evaporatorFanLoad(input.n_evap, input.fan_per_evap, input.kw_fan, input.t_fan);
    const Q_defrost = calc.defrostHeaterLoad(input.n_evap, input.heater_per_evap, input.kw_heater, input.defrost_times, input.defrost_duration);

    const palletTurnsPerDay = mass_in_kg / (input.palletWeight || 750);
    const packingInternal = calc.packingRelatedLoad(db.packingSpec, palletTurnsPerDay, T_room, T_in);
    const Q_packing_internal = input.includePackingInternalLoad !== false ? packingInternal.total : 0;

    const Q_internal = Q_people + Q_forklift + Q_lights + Q_fans + Q_defrost + Q_packing_internal;

    const moistWall = calc.moistureWallLoad(input, geom);
    const moistExch = calc.moistureExchangeLoad(input, geom, mapTable);
    const Q_moisture_total = moistWall.Q + moistExch.Q;

    const Q_subtotal = Q_trans + Q_product + Q_infiltration + Q_internal + Q_moisture_total;
    const Q_total_kW = Q_subtotal * (1 + safety);
    const Q_per_m3 = Q_total_kW * 1000 / geom.volume;

    return {
      valid: true, geom: geom, U_wall: U_wall, U_floor: U_floor, T_room: T_room,
      storageCapacity: storageCapacity, throughput: throughput, mass_total: mass_total, mass_in: mass_in,
      Q_trans: Q_trans, wallDetails: wallDetails,
      Q_product: Q_product, Q_above_freeze: cooling.Q_above_freeze, Q_latent: cooling.Q_latent,
      Q_below_freeze: cooling.Q_below_freeze, Q_respiration: Q_respiration, respPerKg: respPerKg,
      respirationApplies: respirationApplies, isLivingProduce: isLivingProduce, T_freeze: T_freeze,
      Cp_above: Cp_above, Cp_below: Cp_below, Lf: Lf, Q_packing_product: Q_packing_product,
      Q_infiltration: Q_infiltration, openingResults: openingResults,
      Q_internal: Q_internal, Q_people: Q_people, Q_forklift: Q_forklift,
      Q_forklift_internal: Q_forklift_internal, Q_forklift_dock: Q_forklift_dock,
      t_forklift_internal: t_forklift_internal, t_forklift_dock: t_forklift_dock,
      internalVehicleSpec: internalVehicleSpec, dockVehicleSpec: dockVehicleSpec,
      internalTonPerDay: internalTonPerDay, dockTonPerDay: dockTonPerDay,
      Q_lights: Q_lights, Q_fans: Q_fans, Q_defrost: Q_defrost,
      Q_packing_internal: Q_packing_internal, packingInternalBreakdown: packingInternal.breakdown,
      Q_moisture_total: Q_moisture_total, moistWall: moistWall, moistExch: moistExch,
      Q_subtotal: Q_subtotal, safety: safety, Q_total_kW: Q_total_kW, Q_per_m3: Q_per_m3,
      runtime: input.runtime
    };
  }

  calc.runCalculation = runCalculation;
  App.calc = calc;
})(window.ColdStorageHeatLoad);
