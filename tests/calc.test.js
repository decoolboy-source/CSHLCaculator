'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCalc } = require('./load-calc');

const calc = loadCalc();

// Bảng MAP tối giản (rho/h theo nhiệt độ) chỉ đủ cho test — không phải bảng 111 điểm thật của app.
// interpMAP() giả định bảng có đủ mọi khóa nguyên liền kề trong khoảng cần tra (giống bảng thật
// 111 điểm -60..50°C bước 1°C của app) — nên fixture phải dựng đủ số nguyên trong dải test dùng,
// không phải bảng thưa vài điểm.
const FIXTURE_MAP = {};
for (let T = -60; T <= 50; T++) {
  FIXTURE_MAP[String(T)] = { rho: 1.29 - 0.003 * T, h: 8 + 0.5 * T };
}

// ─────────────────────────────────────────────────────────────────
// computeGeometry
// ─────────────────────────────────────────────────────────────────
test('computeGeometry: hình chữ nhật tính đúng diện tích/thể tích/chu vi', () => {
  const g = calc.computeGeometry({ shape: 'rect', L: 10, W: 5, H: 4 });
  assert.equal(g.valid, true);
  assert.equal(g.area, 50);
  assert.equal(g.volume, 200);
  assert.equal(g.perimeter, 30);
  assert.equal(g.walls.length, 4);
});

test('computeGeometry: kích thước <= 0 phải báo invalid, không throw', () => {
  const g = calc.computeGeometry({ shape: 'rect', L: 0, W: 5, H: 4 });
  assert.equal(g.valid, false);
  assert.ok(g.error);
});

test('computeGeometry: L-shape từ chối góc cắt lớn hơn/bằng kích thước tổng', () => {
  const g = calc.computeGeometry({ shape: 'lshape', ls_L1: 10, ls_W1: 10, ls_L3: 10, ls_W2: 3, H: 4 });
  assert.equal(g.valid, false);
});

test('computeGeometry: L-shape diện tích = tổng trừ góc cắt, có 6 tường', () => {
  const g = calc.computeGeometry({ shape: 'lshape', ls_L1: 10, ls_W1: 8, ls_L3: 3, ls_W2: 2, H: 4 });
  assert.equal(g.valid, true);
  assert.equal(g.area, 10 * 8 - 3 * 2);
  assert.equal(g.walls.length, 6);
});

test('computeGeometry: U-shape diện tích = tổng trừ hốc khuyết, có 8 tường', () => {
  const g = calc.computeGeometry({ shape: 'ushape', us_L1: 40, us_W1: 30, us_L3: 10, us_W2: 20, H: 6 });
  assert.equal(g.valid, true);
  assert.equal(g.area, 40 * 30 - 10 * 20);
  assert.equal(g.walls.length, 8);
});

// ─────────────────────────────────────────────────────────────────
// U-value tường/nền (nhiệt trở nối tiếp)
// ─────────────────────────────────────────────────────────────────
test('computeUWall: U = 1/R với R = 1/Hin + 2*(skin/k_skin) + core/k_core + 1/Hout', () => {
  const materials = [{ name: 'Tole', k: 45.3 }, { name: 'PU', k: 0.023 }];
  const materialSkinSpec = { Tole: 0.5 };
  const U = calc.computeUWall(materials, materialSkinSpec, 'PU', 100, { Hin: 9.1, Hout: 9.1, skinName: 'Tole' });
  const R = 1 / 9.1 + 0.0005 / 45.3 + 0.1 / 0.023 + 0.0005 / 45.3 + 1 / 9.1;
  assert.ok(Math.abs(U - 1 / R) < 1e-9);
});

test('computeUWall: core dày hơn -> U nhỏ hơn (cách nhiệt tốt hơn)', () => {
  const materials = [{ name: 'Tole', k: 45.3 }, { name: 'PU', k: 0.023 }];
  const materialSkinSpec = { Tole: 0.5 };
  const U100 = calc.computeUWall(materials, materialSkinSpec, 'PU', 100, {});
  const U150 = calc.computeUWall(materials, materialSkinSpec, 'PU', 150, {});
  assert.ok(U150 < U100);
});

// ─────────────────────────────────────────────────────────────────
// transmissionLoad — [AUDIT #1.1.3] không được âm
// ─────────────────────────────────────────────────────────────────
test('transmissionLoad: T ngoài nóng hơn T phòng -> tải dương, đúng công thức U*A*dT', () => {
  const load = calc.transmissionLoad(0.3, 100, 35, 5); // U=0.3, A=100, dT=30
  assert.ok(Math.abs(load - (0.3 * 100 * 30) / 1000) < 1e-9);
});

test('transmissionLoad: T ngoài LẠNH hơn T phòng -> clamp về 0, không được âm', () => {
  // Trường hợp thực tế: tường giáp phòng lạnh hơn (vd kho đông giáp kho mát) —
  // 1 phòng không được trừ ("ăn ké" lạnh) từ tải của phòng khác.
  const load = calc.transmissionLoad(0.3, 100, -22, 10);
  assert.equal(load, 0);
});

// ─────────────────────────────────────────────────────────────────
// computeProductCoolingLoad — 3 giai đoạn (trên điểm đông / ẩn nhiệt / dưới điểm đông)
// [AUDIT #1.2.2] phải đúng cả khi T_in nằm GIỮA T_freeze và T_final
// ─────────────────────────────────────────────────────────────────
test('computeProductCoolingLoad: chỉ làm lạnh trên điểm đông (T_final vẫn > T_freeze)', () => {
  const r = calc.computeProductCoolingLoad({
    T_in: 20, T_final: 5, T_freeze: -1, Cp_above: 3.5, Cp_below: 1.9, Lf: 280,
    mass_kg: 1000, pulldown_hr: 10
  });
  assert.ok(r.Q_above_freeze > 0);
  assert.equal(r.Q_latent, 0);
  assert.equal(r.Q_below_freeze, 0);
});

test('computeProductCoolingLoad: cấp đông đầy đủ (trên điểm đông + ẩn nhiệt + dưới điểm đông)', () => {
  const r = calc.computeProductCoolingLoad({
    T_in: 20, T_final: -18, T_freeze: -1, Cp_above: 3.5, Cp_below: 1.9, Lf: 280,
    mass_kg: 1000, pulldown_hr: 10
  });
  assert.ok(r.Q_above_freeze > 0);
  assert.ok(r.Q_latent > 0);
  assert.ok(r.Q_below_freeze > 0);
  const sum = r.Q_above_freeze + r.Q_latent + r.Q_below_freeze;
  assert.ok(Math.abs(sum - r.Q_total) < 1e-9);
});

test('computeProductCoolingLoad: T_in đã NẰM DƯỚI điểm đông (không có giai đoạn trên điểm đông/ẩn nhiệt)', () => {
  const r = calc.computeProductCoolingLoad({
    T_in: -5, T_final: -18, T_freeze: -1, Cp_above: 3.5, Cp_below: 1.9, Lf: 280,
    mass_kg: 1000, pulldown_hr: 10
  });
  assert.equal(r.Q_above_freeze, 0);
  assert.equal(r.Q_latent, 0);
  assert.ok(r.Q_below_freeze > 0);
});

test('computeProductCoolingLoad: T_in NẰM GIỮA T_freeze và T_final (case đã sửa theo AUDIT #1.2.2) — không lệch dấu, giai đoạn dưới điểm đông tính từ T_in chứ không phải từ T_freeze', () => {
  // T_in = -1 = đúng bằng T_freeze -> không có giai đoạn trên điểm đông/ẩn nhiệt,
  // chỉ hạ từ T_in xuống T_final.
  const r = calc.computeProductCoolingLoad({
    T_in: -1, T_final: -18, T_freeze: -1, Cp_above: 3.5, Cp_below: 1.9, Lf: 280,
    mass_kg: 1000, pulldown_hr: 10
  });
  assert.equal(r.Q_above_freeze, 0);
  assert.equal(r.Q_latent, 0);
  const expected = 1.9 * (-1 - (-18)) * 1000 / (10 * 3600);
  assert.ok(Math.abs(r.Q_below_freeze - expected) < 1e-9);
});

// ─────────────────────────────────────────────────────────────────
// Tải xâm nhập không khí (Gosney-Olama) — Df theo ASHRAE/Minnesota TRM
// ─────────────────────────────────────────────────────────────────
test('airExchangeLoad: Df = 0.8 khi |dT| > 11°C, Df = 1.1 khi |dT| <= 11°C', () => {
  const opening = { w: 2, h: 2.5, count: 1, openTimeSec: 20, cyclesPerDay: 50, protectionEff: 0 };
  const far = calc.airExchangeLoad(opening, -20, 90, 35, 60, FIXTURE_MAP); // dT = 55
  const near = calc.airExchangeLoad(opening, 8, 90, 15, 60, FIXTURE_MAP); // dT = 7
  assert.equal(far.Df, 0.8);
  assert.equal(near.Df, 1.1);
});

test('airExchangeLoad: tải luôn >= 0 (không âm) kể cả input bất thường', () => {
  const opening = { w: 2, h: 2.5, count: 1, openTimeSec: 20, cyclesPerDay: 50, protectionEff: 0 };
  const res = calc.airExchangeLoad(opening, 25, 60, 10, 60, FIXTURE_MAP); // phòng nóng hơn ngoài trời (bất thường)
  assert.ok(res.load >= 0);
});

// ─────────────────────────────────────────────────────────────────
// Ẩn nhiệt hơi nước — cộng thêm ẩn nhiệt đông đặc khi T_room < 0°C
// ─────────────────────────────────────────────────────────────────
test('latentHeatMoisture: T_room < 0°C phải CỘNG THÊM ẩn nhiệt đông đặc (333.55 kJ/kg) vào L_vap(T)', () => {
  const L_vap_at_minus5 = 2501 - 2.361 * -5;
  const expectedBelow = L_vap_at_minus5 + 333.55;
  const expectedAbove = 2501 - 2.361 * 5; // T>=0: không cộng ẩn nhiệt đông đặc

  assert.ok(Math.abs(calc.latentHeatMoisture(-5) - expectedBelow) < 1e-9);
  assert.ok(Math.abs(calc.latentHeatMoisture(5) - expectedAbove) < 1e-9);
});

// ─────────────────────────────────────────────────────────────────
// Dung tích chứa — 2 phương pháp (chất tay theo % thể tích vs chất pallet)
// ─────────────────────────────────────────────────────────────────
test('computeStorageCapacity: kho thấp (H<=5.5m) dùng % thể tích × mật độ khối', () => {
  const geom = { volume: 1000, H: 5 };
  const r = calc.computeStorageCapacity({ storageCapacityMode: 'auto', lowCeilingMethod: 'pct45', productBulkDensity: 400 }, geom);
  assert.ok(Math.abs(r.mass_total_ton - (1000 * 0.45 * 400) / 1000) < 1e-9);
});

test('computeStorageCapacity: kho cao (H>5.5m) dùng số pallet × trọng lượng/pallet', () => {
  const geom = { volume: 5000, H: 10 };
  const r = calc.computeStorageCapacity({ storageCapacityMode: 'auto', palletCount: 200, palletWeight: 800 }, geom);
  assert.equal(r.mass_total_ton, (200 * 800) / 1000);
});

// ─────────────────────────────────────────────────────────────────
// Bố trí kệ pallet tự động
// ─────────────────────────────────────────────────────────────────
test('computeAutoLevels: không đủ chiều cao thông thuỷ (bottom+top clearance) -> 0 tầng, không âm', () => {
  const levels = calc.computeAutoLevels(2, calc.DEFAULT_RACK_LAYOUT);
  assert.equal(levels, 0);
});

test('computeAutoPalletCapacity: tổng sức chứa = rows * bays * levels', () => {
  const r = calc.computeAutoPalletCapacity(40, 12, 10, calc.DEFAULT_RACK_LAYOUT);
  assert.equal(r.total, r.rows * r.baysPerRow * r.levels);
  assert.ok(r.total > 0);
});

// ─────────────────────────────────────────────────────────────────
// Chẩn đoán PASS/FAIL tự động
// ─────────────────────────────────────────────────────────────────
test('runDiagnostics: phòng NÓNG hơn ngoài trời phải bị gắn cờ lỗi (error), overallPass=false', () => {
  const input = { H: 4, T_in: 10, pulldown: 10, T_room: 20, T_amb: 5, T_final: 5, RH_amb: 70, RH_room: 85, safety: 10, t_fan: 10, t_lights: 10, t_people: 8 };
  const result = { mass_in: 5, U_wall: 0.25, U_floor: 0.3, t_forklift_internal: 2, t_forklift_dock: 1, Q_per_m3: 20 };
  const diag = calc.runDiagnostics(input, result);
  assert.equal(diag.overallPass, false);
  const item = diag.items.find((i) => i.id === 'room_colder_than_ambient');
  assert.equal(item.passed, false);
});

test('runDiagnostics: input hợp lý toàn bộ -> overallPass=true', () => {
  const input = { H: 4, T_in: 10, pulldown: 10, T_room: -18, T_amb: 35, T_final: -18, RH_amb: 80, RH_room: 90, safety: 10, t_fan: 10, t_lights: 10, t_people: 8 };
  const result = { mass_in: 5, U_wall: 0.25, U_floor: 0.3, t_forklift_internal: 2, t_forklift_dock: 1, Q_per_m3: 20 };
  const diag = calc.runDiagnostics(input, result);
  assert.equal(diag.overallPass, true);
  assert.equal(diag.errors.length, 0);
});
