/*
 * Requerimientos de bovinos.
 *
 * Leche: NASEM (2021) Nutrient Requirements of Dairy Cattle, 8th rev. ed. Ecuaciones tomadas de la
 *   implementación abierta "nasem_dairy" (Fieguth, Innes y Cant, U. de Guelph; derivada del código R
 *   oficial distribuido con el software NASEM). Nombres de variables entre corchetes = nombres del modelo.
 * Carne: NRC (1996/2000) / NASEM (2016) Nutrient Requirements of Beef Cattle. Ecuaciones del capítulo
 *   "Prediction equations and computer models" (NRC 1996, corregido) y fe de erratas NASEM 2016.
 *
 * Todos los resultados por animal y día; las concentraciones se expresan en base materia seca (MS).
 */
import type { Constraint } from './types';

const exp = Math.exp;

// ---------------------------------------------------------------------------- utilidades
export function nrcNEm(me: number) {
  return 1.37 * me - 0.138 * me ** 2 + 0.0105 * me ** 3 - 1.12;
}
export function nrcNEg(me: number) {
  return 1.42 * me - 0.174 * me ** 2 + 0.0122 * me ** 3 - 1.65;
}

function bisect(f: (x: number) => number, lo: number, hi: number): number | null {
  let flo = f(lo);
  const fhi = f(hi);
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (Math.sign(flo) === Math.sign(fhi)) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface ReqLine {
  label: string;
  value: number;
  unit: string;
}

export interface CattleResult {
  dmi: number;
  dmiPredicted: number | null;
  lines: ReqLine[];
  constraints: Constraint[];
  warnings: string[];
}

// ---------------------------------------------------------------------------- LECHE (NASEM 2021)
export type DairyState = 'lactante' | 'seca' | 'novilla';

export interface DairyInput {
  state: DairyState;
  breed: 'Holstein' | 'Jersey';
  bw: number; // kg
  bwMature: number; // kg
  bcs: number; // 1–5
  multiparous: boolean;
  dim: number; // días en leche
  milk: number; // kg/d
  fat: number; // %
  tp: number; // proteína verdadera %
  lactose: number; // %
  gestDay: number; // días de gestación (0 = vacía)
  gestLength: number;
  calfBW: number; // kg
  frameGain: number; // kg/d (crecimiento estructural)
  reserveGain: number; // kg/d (cambio de reservas corporales)
  dietNDF: number; // % MS esperado (para PB endógena fecal)
  grazing: boolean;
  pastureSupplKg: number; // kg MS/d de suplemento en pastoreo
  distParlor: number; // m por viaje a la sala
  tripsParlor: number; // viajes/d
  topo: number; // m de desnivel diario
  dmi: number | null; // consumo fijado por el usuario
}

export const DAIRY_DEFAULT: DairyInput = {
  state: 'lactante',
  breed: 'Holstein',
  bw: 650,
  bwMature: 700,
  bcs: 3,
  multiparous: true,
  dim: 100,
  milk: 35,
  fat: 3.8,
  tp: 3.1,
  lactose: 4.85,
  gestDay: 0,
  gestLength: 280,
  calfBW: 44,
  frameGain: 0,
  reserveGain: 0,
  dietNDF: 30,
  grazing: false,
  pastureSupplKg: 0,
  distParlor: 0,
  tripsParlor: 0,
  topo: 0,
  dmi: null,
};

export interface DairyDetail {
  parity: number;
  dmiPred: number;
  dmi: number;
  neMilkPerKg: number;
  meMaint: number;
  meMilk: number;
  meGest: number;
  meGain: number;
  meTotal: number;
  mpMaint: number;
  mpMilk: number;
  mpGest: number;
  mpGain: number;
  mpTotal: number;
  caAbs: number;
  pAbs: number;
}

export function dairyDetail(x: DairyInput): DairyDetail {
  const lact = x.state === 'lactante';
  const heifer = x.state === 'novilla';
  const parity = heifer ? 0 : lact ? (x.multiparous ? 2 : 1) : 2; // [An_Parity_rl]
  const milk = lact ? x.milk : 0;
  const BW = x.bw;
  const BWm = x.bwMature;
  const GD = x.gestDay > 0 ? x.gestDay : 0;
  const GL = x.gestLength;
  const DIM = lact ? x.dim : 0;
  const MBW = BW ** 0.75;

  // Leche [Trg_NEmilk_Milk], Mcal/kg
  const neMilkPerKg = (9.29 * x.fat) / 100 + (5.85 * x.tp) / 100 + (3.95 * x.lactose) / 100;
  const neMilkOut = neMilkPerKg * milk;

  // Consumo [Dt_DMIn_Lact1], [Dt_DMIn_DryCow2], [Dt_DMIn_Heif_H1/HJ1]
  let dmiPred: number;
  if (lact) {
    dmiPred =
      (3.7 + 5.7 * (parity - 1) + 0.305 * neMilkOut + 0.022 * BW + (-0.689 - 1.87 * (parity - 1)) * x.bcs) *
      (1 - (0.212 + 0.136 * (parity - 1)) * exp(-0.053 * DIM));
  } else if (heifer) {
    dmiPred = x.breed === 'Jersey' ? 12.91 * (1 - exp(-0.00295 * BW)) : 15.36 * (1 - exp(-0.0022 * BW));
  } else {
    const adj = GD - GL < -21 ? 0 : (BW * (-0.756 * exp(0.154 * (GD - GL)))) / 100;
    dmiPred = (BW * 1.979) / 100 + adj;
  }
  const dmi = x.dmi && x.dmi > 0 ? x.dmi : dmiPred;

  // Útero grávido [Uter_Wt], [GrUter_Wt], [GrUter_BWgain]
  const uterPart = x.calfBW * 0.2311;
  const grUterPart = x.calfBW * 1.816;
  let uterWt = 0.204;
  if (GD > 0 && GD <= GL) uterWt = uterPart * exp(-(0.0242 - 3.53e-5 * GD) * (GL - GD));
  if (GD <= 0 && DIM > 0 && DIM < 100) uterWt = (uterPart - 0.204) * exp(-0.2 * DIM) + 0.204;
  if (parity > 0 && uterWt < 0.204) uterWt = 0.204;
  let grUterWt = uterWt;
  if (GD > 0 && GD <= GL) grUterWt = grUterPart * exp(-(0.0243 - 2.45e-5 * GD) * (GL - GD));
  if (grUterWt < uterWt) grUterWt = uterWt;
  let uterGain = 0;
  if (GD > 0 && GD <= GL) uterGain = (0.0242 - 3.53e-5 * GD) * uterWt;
  if (GD <= 0 && DIM > 0 && DIM < 100) uterGain = -0.2 * uterWt;
  let grUterGain = 0;
  if (GD > 0 && GD <= GL) grUterGain = (0.0243 - 2.45e-5 * GD) * grUterWt;
  if (GD <= 0 && DIM > 0 && DIM < 100) grUterGain = uterGain;

  // Peso vacío
  const gutFillBW = heifer ? 0.15 : 0.18;
  const bwNP = BW - grUterWt;
  const bwEmpty = BW - gutFillBW * bwNP;
  const bwMatureEmpty = BWm * (1 - 0.18);

  // Mantenimiento [An_NEmUse_NS] + actividad
  const neMaintNS = 0.1 * MBW;
  const neGraze = x.grazing ? (0.0075 * MBW * (600 - 12 * x.pastureSupplKg)) / 600 : 0;
  const neParlor = (0.00035 * x.distParlor) / 1000 * x.tripsParlor * BW;
  const neTopo = ((0.0067 * x.topo) / 1000) * BW;
  const kmMENE = heifer ? 0.63 : 0.66;
  const meMaint = (neMaintNS + neGraze + neParlor + neTopo) / kmMENE;

  // Crecimiento [Frm_*], [Rsrv_*]
  const frmGainEmpty = x.frameGain * (1 - gutFillBW);
  const rsrvGainEmpty = x.reserveGain;
  const fatGainFrm = 0.067 + (0.375 * BW) / BWm;
  const cpGainFrm = 0.201 - (0.081 * BW) / BWm;
  const frmFat = fatGainFrm * frmGainEmpty;
  const frmNP = cpGainFrm * 0.86 * frmGainEmpty;
  const frmCP = frmNP / 0.86;
  const frmME = (9.4 * frmFat + 5.55 * frmCP) / 0.4;
  const rsrvFat = 0.622 * rsrvGainEmpty;
  const rsrvCP = cpGainFrm * rsrvGainEmpty;
  const krMERE = milk > 0 && x.reserveGain > 0 ? 0.75 : x.reserveGain <= 0 ? 0.89 : 0.6;
  const rsrvME = (9.4 * rsrvFat + 5.55 * rsrvCP) / krMERE;
  const rsrvNP = 0.068 * 0.86 * rsrvGainEmpty;
  const meGain = frmME + rsrvME;

  // Gestación
  const gestRE = grUterGain * 0.95;
  const meGest = gestRE / (gestRE >= 0 ? 0.14 : 0.89);
  const gestNP = grUterGain * 0.123 * 1000 * 0.86;
  const mpGest = gestNP >= 0 ? gestNP / 0.33 : gestNP * 1.0;

  // Leche
  const meMilk = neMilkOut / 0.66;
  const meTotal = meMaint + meGain + meGest + meMilk;

  // Proteína metabolizable [An_MPuse_g_Trg]
  const kmMPNP = heifer ? 0.66 : 0.69;
  const feCPend = (12 + 0.12 * x.dietNDF) * dmi;
  const feMP = heifer ? feCPend / kmMPNP : (feCPend * 0.73) / kmMPNP;
  const scrfCP = 0.2 * BW ** 0.6;
  const scrfMP = heifer ? scrfCP / kmMPNP : (scrfCP * 0.86) / kmMPNP;
  const urMP = 0.053 * BW * 6.25;
  const mpMaint = feMP + scrfMP + urMP;
  let kg = 0.6 * 0.86;
  if (parity === 0 && bwEmpty / bwMatureEmpty > 0.12) kg = (0.64 - (0.3 * bwEmpty) / bwMatureEmpty) * 0.86;
  if (kg < 0.394 * 0.86) kg = 0.394 * 0.86 * 0.86;
  if (parity > 0) kg = 0.69;
  const mpGain = (frmNP * 1000) / kg + (rsrvNP * 1000) / kg;
  const mpMilk = (milk * 1000 * x.tp) / 100 / 0.69;
  const mpTotal = mpMaint + mpGain + mpGest + mpMilk;

  // Ca y P absorbibles [An_Ca_req], [An_P_req]
  const bodyGain = x.frameGain + x.reserveGain;
  const caMaint = 0.9 * dmi;
  const caGain = 9.83 * BWm ** 0.22 * BW ** -0.22 * bodyGain;
  const caGest = GD > 0 ? (0.0245 * exp((0.05581 - 7e-5 * GD) * GD) - 0.0245 * exp((0.05581 - 7e-5 * (GD - 1)) * (GD - 1))) * (BW / 715) : 0;
  const caMilk = milk > 0 ? (0.295 + 0.239 * x.tp) * milk : 0;
  const caAbs = caMaint + caGain + caGest + caMilk;
  const pMaint = 0.0006 * BW + (parity === 0 ? 0.8 : 1.0) * dmi;
  const pGain = (1.2 + 4.635 * BWm ** 0.22 * BW ** -0.22) * bodyGain;
  const pGest = GD > 0 ? (0.02743 * exp((0.05527 - 7.5e-5 * GD) * GD) - 0.02743 * exp((0.05527 - 7.5e-5 * (GD - 1)) * (GD - 1))) * (BW / 715) : 0;
  const pMilk = milk > 0 ? (0.48 + 0.13 * x.tp) * milk : 0;
  const pAbs = pMaint + pGain + pGest + pMilk;

  return { parity, dmiPred, dmi, neMilkPerKg, meMaint, meMilk, meGest, meGain, meTotal, mpMaint, mpMilk, mpGest, mpGain, mpTotal, caAbs, pAbs };
}

export function dairyRequirements(x: DairyInput): CattleResult {
  const d = dairyDetail(x);
  const warnings: string[] = [];
  if (x.state === 'novilla') warnings.push('Novillas: no se aplica el mínimo de PM por unidad de EM del modelo NASEM; revise la PM con su asesor.');
  const per = (v: number) => v / d.dmi;
  const lines: ReqLine[] = [
    { label: 'Consumo de MS previsto (NASEM)', value: d.dmiPred, unit: 'kg/d' },
    { label: 'Consumo de MS usado', value: d.dmi, unit: 'kg/d' },
    { label: 'EM mantenimiento (incl. actividad)', value: d.meMaint, unit: 'Mcal/d' },
    { label: 'EM leche', value: d.meMilk, unit: 'Mcal/d' },
    { label: 'EM gestación', value: d.meGest, unit: 'Mcal/d' },
    { label: 'EM crecimiento y reservas', value: d.meGain, unit: 'Mcal/d' },
    { label: 'EM total', value: d.meTotal, unit: 'Mcal/d' },
    { label: 'Equivalente ENl (EM × 0,66)', value: d.meTotal * 0.66, unit: 'Mcal/d' },
    { label: 'PM mantenimiento', value: d.mpMaint, unit: 'g/d' },
    { label: 'PM leche', value: d.mpMilk, unit: 'g/d' },
    { label: 'PM gestación', value: d.mpGest, unit: 'g/d' },
    { label: 'PM crecimiento y reservas', value: d.mpGain, unit: 'g/d' },
    { label: 'PM total', value: d.mpTotal, unit: 'g/d' },
    { label: 'Ca absorbible', value: d.caAbs, unit: 'g/d' },
    { label: 'P absorbible', value: d.pAbs, unit: 'g/d' },
    { label: 'Densidad de EM requerida', value: per(d.meTotal), unit: 'Mcal/kg MS' },
    { label: 'PM requerida', value: per(d.mpTotal), unit: 'g/kg MS' },
  ];
  const constraints: Constraint[] = [
    { key: 'em_rum', min: round(per(d.meTotal) * 1000, 0), max: null, basis: 'ms' },
    { key: 'pm_ndt', min: round(per(d.mpTotal), 1), max: null, basis: 'ms' },
    { key: 'pm_pdr', min: round(per(d.mpTotal), 1), max: null, basis: 'ms' },
    { key: 'ca_abs', min: round(per(d.caAbs) / 10, 3), max: null, basis: 'ms' },
    { key: 'p_abs', min: round(per(d.pAbs) / 10, 3), max: null, basis: 'ms' },
    { key: 'fnd', min: 25, max: null, basis: 'ms' },
    { key: 'fnd_forraje', min: 19, max: null, basis: 'ms' },
    { key: 'ee', min: null, max: 7, basis: 'ms' },
  ];
  return { dmi: d.dmi, dmiPredicted: d.dmiPred, lines, constraints, warnings };
}

// ---------------------------------------------------------------------------- CARNE (NRC 1996/2000, NASEM 2016)
export const BEEF_BREEDS: { label: string; be: number }[] = [
  { label: 'Bos taurus de carne (Angus, Hereford…)', be: 1.0 },
  { label: 'Cruza índico × taurino', be: 0.95 },
  { label: 'Bos indicus (Brahman, Nelore…)', be: 0.9 },
  { label: 'Razas lecheras o doble propósito', be: 1.2 },
];

export interface BeefGrowInput {
  bw: number; // peso vivo lleno, kg
  adg: number; // ganancia diaria (peso vivo), kg/d
  fsbw: number; // peso final en ayuno al punto de terminación deseado, kg
  srw: 478 | 462 | 435;
  sex: 'castrado' | 'hembra' | 'entero';
  be: number;
  cs: number; // condición corporal 1–9
  tempPrev: number; // °C
  calf: boolean; // ecuación de consumo de terneros (true) o añojos (false)
  dmi: number | null;
}

export const BEEF_GROW_DEFAULT: BeefGrowInput = {
  bw: 350,
  adg: 1.2,
  fsbw: 550,
  srw: 478,
  sex: 'castrado',
  be: 1.0,
  cs: 5,
  tempPrev: 20,
  calf: false,
  dmi: null,
};

export interface BeefGrowDetail {
  sbw: number;
  swg: number;
  eqsbw: number;
  nemReq: number;
  re: number;
  npg: number;
  mpMaint: number;
  mpGain: number;
  mp: number;
  ca: number;
  p: number;
}

export function beefGrowDetail(x: BeefGrowInput): BeefGrowDetail {
  const sbw = 0.96 * x.bw;
  const swg = 0.96 * x.adg;
  const comp = 0.8 + (x.cs - 1) * 0.05;
  const a2 = 0.0007 * (20 - x.tempPrev);
  const sex = x.sex === 'entero' ? 1.15 : 1;
  const nemReq = sbw ** 0.75 * (0.077 * x.be * sex * comp + a2);
  const eqsbw = (sbw * x.srw) / x.fsbw;
  const eqebw = 0.891 * eqsbw;
  const ebg = 0.956 * swg;
  const re = swg > 0 ? 0.0635 * eqebw ** 0.75 * ebg ** 1.097 : 0;
  const npg = swg > 0 ? swg * (268 - 29.4 * (re / swg)) : 0;
  const eff = eqsbw <= 300 ? 0.834 - eqsbw * 0.00114 : 0.492;
  const mpMaint = 3.8 * sbw ** 0.75;
  const mpGain = npg / eff;
  const ca = (0.0154 * sbw) / 0.5 + (npg * 0.071) / 0.5;
  const p = (0.016 * sbw) / 0.68 + (npg * 0.039) / 0.68;
  return { sbw, swg, eqsbw, nemReq, re, npg, mpMaint, mpGain, mp: mpMaint + mpGain, ca, p };
}

export function beefGrowRequirements(x: BeefGrowInput): CattleResult {
  const d = beefGrowDetail(x);
  const warnings: string[] = [];
  const need = (me: number) => d.nemReq / nrcNEm(me) + (d.re > 0 ? d.re / nrcNEg(me) : 0);
  const dmiPred = (nem: number) => {
    const div = nem < 1 ? 0.95 : nem;
    return (d.sbw ** 0.75 * (0.2435 * nem - 0.0466 * nem ** 2 - (x.calf ? 0.1128 : 0.0869))) / div;
  };
  let me: number | null;
  let dmi: number;
  let predicted: number | null = null;
  if (x.dmi && x.dmi > 0) {
    me = bisect((m) => x.dmi! - need(m), 1.75, 3.6);
    dmi = x.dmi;
  } else {
    me = bisect((m) => dmiPred(nrcNEm(m)) - need(m), 1.75, 3.6);
    dmi = me ? need(me) : dmiPred(nrcNEm(3.0));
    predicted = dmi;
  }
  if (!me) {
    warnings.push('La ganancia indicada no es alcanzable con el consumo dado ni con dietas de hasta 3,6 Mcal EM/kg MS. Reduzca la ganancia o aumente el consumo.');
    me = 3.6;
  }
  const nem = nrcNEm(me);
  const neg = nrcNEg(me);
  const lines: ReqLine[] = [
    { label: 'Peso vivo en ayuno (PVA = 0,96 × PV)', value: d.sbw, unit: 'kg' },
    { label: 'Ganancia en ayuno (0,96 × GDP)', value: d.swg, unit: 'kg/d' },
    { label: 'Peso equivalente (PVA × PCR / peso final)', value: d.eqsbw, unit: 'kg' },
    { label: 'ENm requerida', value: d.nemReq, unit: 'Mcal/d' },
    { label: 'ENg requerida (energía retenida)', value: d.re, unit: 'Mcal/d' },
    { label: 'Consumo de MS ' + (predicted ? 'previsto (NRC)' : 'indicado'), value: dmi, unit: 'kg/d' },
    { label: 'EM requerida en la dieta', value: me, unit: 'Mcal/kg MS' },
    { label: 'ENm requerida en la dieta', value: nem, unit: 'Mcal/kg MS' },
    { label: 'ENg requerida en la dieta', value: neg, unit: 'Mcal/kg MS' },
    { label: 'Proteína neta retenida', value: d.npg, unit: 'g/d' },
    { label: 'PM mantenimiento', value: d.mpMaint, unit: 'g/d' },
    { label: 'PM crecimiento', value: d.mpGain, unit: 'g/d' },
    { label: 'PM total', value: d.mp, unit: 'g/d' },
    { label: 'Ca requerido (dietético)', value: d.ca, unit: 'g/d' },
    { label: 'P requerido (dietético)', value: d.p, unit: 'g/d' },
  ];
  const constraints: Constraint[] = [
    { key: 'enm_rum', min: round(nem * 1000, 0), max: null, basis: 'ms' },
    { key: 'eng_rum', min: round(neg * 1000, 0), max: null, basis: 'ms' },
    { key: 'pm_ndt', min: round(d.mp / dmi, 1), max: null, basis: 'ms' },
    { key: 'pm_pdr', min: round(d.mp / dmi, 1), max: null, basis: 'ms' },
    { key: 'ca', min: round(d.ca / dmi / 10, 3), max: 2, basis: 'ms' },
    { key: 'p', min: round(d.p / dmi / 10, 3), max: 1, basis: 'ms' },
    // NRC 1996/2000, tabla 10-3 (recría y engorde)
    { key: 'na', min: 0.08, max: null, basis: 'ms' },
    { key: 'k', min: 0.6, max: null, basis: 'ms' },
    { key: 'mg', min: 0.1, max: null, basis: 'ms' },
  ];
  return { dmi, dmiPredicted: predicted, lines, constraints, warnings };
}

export interface BeefCowInput {
  bw: number; // peso vivo, kg
  cs: number; // 1–9
  be: number;
  lactating: boolean;
  milk: number; // kg/d
  fat: number; // %
  snf: number; // sólidos no grasos %
  protein: number; // %
  gestDay: number; // 0 = vacía
  calfBW: number; // kg
  tempPrev: number;
  dmi: number | null;
}

export const BEEF_COW_DEFAULT: BeefCowInput = {
  bw: 550,
  cs: 5,
  be: 1.0,
  lactating: true,
  milk: 8,
  fat: 4.0,
  snf: 8.3,
  protein: 3.4,
  gestDay: 0,
  calfBW: 38,
  tempPrev: 20,
  dmi: null,
};

export function beefCowRequirements(x: BeefCowInput): CattleResult {
  const sbw = 0.96 * x.bw;
  const comp = 0.8 + (x.cs - 1) * 0.05;
  const a2 = 0.0007 * (20 - x.tempPrev);
  const L = x.lactating ? 1.2 : 1;
  const nemMaint = sbw ** 0.75 * (0.077 * x.be * L * comp + a2);
  const milk = x.lactating ? x.milk : 0;
  const neMilk = (0.092 * x.fat + 0.049 * x.snf - 0.0569) * milk;
  const t = x.gestDay > 0 ? x.gestDay : 0;
  const nePreg = t > 0 ? (x.calfBW * (0.576 / 0.13) * (0.05855 - 0.0000996 * t) * exp((0.03233 - 0.0000275 * t) * t)) / 1000 : 0;
  const mpMaint = 3.8 * sbw ** 0.75;
  const mpMilk = ((milk * x.protein) / 100 / 0.65) * 1000;
  const ypn = t > 0 ? x.calfBW * (0.001669 - 0.00000211 * t) * exp((0.0278 - 0.0000176 * t) * t) * 6.25 : 0;
  const mpPreg = ypn / 0.65;
  const ca = (0.0154 * sbw) / 0.5 + (milk * 1.23) / 0.5 + (t > 190 ? (x.calfBW * 13.7) / 90 / 0.5 : 0);
  const p = (0.016 * sbw) / 0.68 + (milk * 0.95) / 0.68 + (t > 190 ? (x.calfBW * 7.6) / 90 / 0.68 : 0);
  const neTotal = nemMaint + neMilk + nePreg;
  const mp = mpMaint + mpMilk + mpPreg;
  const warnings: string[] = [];
  const dmiPred = (nem: number) => {
    const div = nem < 1 ? 0.95 : nem;
    return (sbw ** 0.75 * (0.04997 * nem ** 2 + (t > 0 ? 0.04631 : 0.0384))) / div + 0.2 * milk;
  };
  let nem: number | null;
  let dmi: number;
  let predicted: number | null = null;
  if (x.dmi && x.dmi > 0) {
    dmi = x.dmi;
    nem = neTotal / dmi;
  } else {
    nem = bisect((n) => dmiPred(n) - neTotal / n, 0.6, 2.6);
    if (!nem) {
      warnings.push('No se encontró una densidad energética que iguale consumo y requerimiento; indique el consumo.');
      nem = 1.6;
    }
    dmi = neTotal / nem;
    predicted = dmi;
  }
  const lines: ReqLine[] = [
    { label: 'Peso vivo en ayuno', value: sbw, unit: 'kg' },
    { label: 'ENm mantenimiento', value: nemMaint, unit: 'Mcal/d' },
    { label: 'EN leche', value: neMilk, unit: 'Mcal/d' },
    { label: 'ENm gestación', value: nePreg, unit: 'Mcal/d' },
    { label: 'ENm total', value: neTotal, unit: 'Mcal/d' },
    { label: 'Consumo de MS ' + (predicted ? 'previsto (NRC)' : 'indicado'), value: dmi, unit: 'kg/d' },
    { label: 'ENm requerida en la dieta', value: nem, unit: 'Mcal/kg MS' },
    { label: 'PM mantenimiento', value: mpMaint, unit: 'g/d' },
    { label: 'PM leche', value: mpMilk, unit: 'g/d' },
    { label: 'PM gestación', value: mpPreg, unit: 'g/d' },
    { label: 'PM total', value: mp, unit: 'g/d' },
    { label: 'Ca requerido (dietético)', value: ca, unit: 'g/d' },
    { label: 'P requerido (dietético)', value: p, unit: 'g/d' },
  ];
  const constraints: Constraint[] = [
    { key: 'enm_rum', min: round(nem * 1000, 0), max: null, basis: 'ms' },
    { key: 'pm_ndt', min: round(mp / dmi, 1), max: null, basis: 'ms' },
    { key: 'pm_pdr', min: round(mp / dmi, 1), max: null, basis: 'ms' },
    { key: 'ca', min: round(ca / dmi / 10, 3), max: 2, basis: 'ms' },
    { key: 'p', min: round(p / dmi / 10, 3), max: 1, basis: 'ms' },
    // NRC 1996/2000, tabla 10-3 (vacas en gestación / inicio de lactancia)
    { key: 'na', min: x.lactating ? 0.1 : 0.08, max: null, basis: 'ms' },
    { key: 'k', min: x.lactating ? 0.7 : 0.6, max: null, basis: 'ms' },
    { key: 'mg', min: x.lactating ? 0.2 : 0.12, max: null, basis: 'ms' },
  ];
  return { dmi, dmiPredicted: predicted, lines, constraints, warnings };
}

function round(v: number, d: number) {
  const k = 10 ** d;
  return Math.round(v * k) / k;
}
