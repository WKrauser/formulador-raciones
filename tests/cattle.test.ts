import { describe, it, expect, beforeAll } from 'vitest';
import loader from 'highs';
import data from '../src/data/ingredients.json';
import { beefCowRequirements, beefGrowDetail, beefGrowRequirements, dairyDetail, dairyRequirements, BEEF_GROW_DEFAULT, DAIRY_DEFAULT } from '../src/lib/cattle';
import { dmValue, solveFormula, type HighsLike } from '../src/lib/solver';
import type { Ingredient } from '../src/lib/types';

const byId = Object.fromEntries((data as unknown as { items: Ingredient[] }).items.map((i) => [i.id, i]));

// NASEM (2016) Nutrient Requirements of Beef Cattle, Tabla 20-1 (fe de erratas v2), peso adulto en ayuno 550 kg.
// La tabla está expresada por peso en ayuno (SBW) y ganancia; la app recibe peso vivo lleno: PV = SBW / 0.96.
const T201 = {
  nem: { 250: 4.8, 300: 5.6, 350: 6.2, 400: 6.9, 450: 7.5, 500: 8.1 } as Record<number, number>,
  mpm: { 250: 239, 300: 274, 350: 307, 400: 340, 450: 371, 500: 402 } as Record<number, number>,
  ca: { 250: 7.7, 300: 9.2, 350: 10.8, 400: 12.3, 450: 13.9, 500: 15.4 } as Record<number, number>,
  p: { 250: 5.9, 300: 7.1, 350: 8.2, 400: 9.4, 450: 10.6, 500: 11.8 } as Record<number, number>,
  // NEg (Mcal/d), MP ganancia (g/d), Ca y P de ganancia (g/d) para 0.8 y 1.6 kg/d
  neg08: { 250: 2.5, 300: 2.8, 350: 3.2, 400: 3.5, 450: 3.8, 500: 4.1 } as Record<number, number>,
  neg16: { 250: 5.3, 300: 6.1, 350: 6.8, 400: 7.5, 450: 8.2, 500: 8.9 } as Record<number, number>,
  mpg08: { 250: 242, 300: 244, 350: 246, 400: 226, 450: 207, 500: 188 } as Record<number, number>,
  mpg16: { 250: 467, 300: 467, 350: 466, 400: 423, 450: 381, 500: 341 } as Record<number, number>,
  cag08: { 250: 20.1, 300: 18.6, 350: 17.2, 400: 15.8, 450: 14.4, 500: 13.1 } as Record<number, number>,
  pg08: { 250: 8.1, 300: 7.5, 350: 6.9, 400: 6.4, 450: 5.8, 500: 5.3 } as Record<number, number>,
};

const grow = (sbw: number, swg: number) =>
  beefGrowDetail({ ...BEEF_GROW_DEFAULT, bw: sbw / 0.96, adg: swg / 0.96, fsbw: 550, srw: 478, be: 1, cs: 5, tempPrev: 20 });

describe('carne: NASEM 2016 tabla 20-1', () => {
  for (const sbw of [250, 300, 350, 400, 450, 500]) {
    it(`SBW ${sbw} kg`, () => {
      const m = grow(sbw, 0);
      expect(Math.abs(m.nemReq - T201.nem[sbw])).toBeLessThan(0.06);
      expect(Math.abs(m.mpMaint - T201.mpm[sbw])).toBeLessThan(1);
      expect(Math.abs(m.ca - T201.ca[sbw])).toBeLessThan(0.06);
      expect(Math.abs(m.p - T201.p[sbw])).toBeLessThan(0.06);
      const g8 = grow(sbw, 0.8);
      expect(Math.abs(g8.re - T201.neg08[sbw])).toBeLessThan(0.06);
      expect(Math.abs(g8.mpGain - T201.mpg08[sbw])).toBeLessThan(2.5);
      expect(Math.abs(g8.ca - T201.ca[sbw] - T201.cag08[sbw])).toBeLessThan(0.2);
      expect(Math.abs(g8.p - T201.p[sbw] - T201.pg08[sbw])).toBeLessThan(0.15);
      const g16 = grow(sbw, 1.6);
      // a 1.6 kg/d la tabla difiere hasta ~1 % (0.08 Mcal) del cálculo directo de la ecuación
      expect(Math.abs(g16.re - T201.neg16[sbw])).toBeLessThan(0.1);
      expect(Math.abs(g16.mpGain - T201.mpg16[sbw])).toBeLessThan(3);
    });
  }

  it('energía de la dieta coherente con el consumo', () => {
    const r = beefGrowRequirements({ ...BEEF_GROW_DEFAULT, bw: 350, adg: 1.4, dmi: 8.5 });
    const nem = r.constraints.find((c) => c.key === 'enm_rum')!.min! / 1000;
    const neg = r.constraints.find((c) => c.key === 'eng_rum')!.min! / 1000;
    const d = beefGrowDetail({ ...BEEF_GROW_DEFAULT, bw: 350, adg: 1.4 });
    // kg MS para mantenimiento + kg MS para ganancia = consumo indicado
    expect(d.nemReq / nem + d.re / neg).toBeCloseTo(8.5, 1);
  });

  it('vaca de cría: gestación y lactancia aumentan los requerimientos', () => {
    const dry = beefCowRequirements({ bw: 550, cs: 5, be: 1, lactating: false, milk: 0, fat: 4, snf: 8.3, protein: 3.4, gestDay: 0, calfBW: 38, tempPrev: 20, dmi: null });
    const lact = beefCowRequirements({ bw: 550, cs: 5, be: 1, lactating: true, milk: 8, fat: 4, snf: 8.3, protein: 3.4, gestDay: 0, calfBW: 38, tempPrev: 20, dmi: null });
    const preg = beefCowRequirements({ bw: 550, cs: 5, be: 1, lactating: false, milk: 0, fat: 4, snf: 8.3, protein: 3.4, gestDay: 260, calfBW: 38, tempPrev: 20, dmi: null });
    const ne = (r: typeof dry) => r.lines.find((l) => l.label === 'ENm total')!.value;
    // mantenimiento vaca seca 528 kg en ayuno: 0.077 × 528^0.75
    expect(ne(dry)).toBeCloseTo(0.077 * 528 ** 0.75, 3);
    expect(ne(lact)).toBeGreaterThan(ne(dry));
    expect(ne(preg)).toBeGreaterThan(ne(dry));
    expect(dry.dmi).toBeGreaterThan(7);
    expect(dry.dmi).toBeLessThan(13);
  });
});

describe('leche: NASEM 2021', () => {
  it('vaca multípara 650 kg, 35 kg leche', () => {
    const d = dairyDetail({ ...DAIRY_DEFAULT });
    // ENl leche = 9.29·3.8% + 5.85·3.1% + 3.95·4.85% (Mcal/kg)
    expect(d.neMilkPerKg).toBeCloseTo(0.0929 * 3.8 + 0.0585 * 3.1 + 0.0395 * 4.85, 6);
    // EM mantenimiento = 0.10·PV^0.75 / 0.66
    expect(d.meMaint).toBeCloseTo((0.1 * 650 ** 0.75) / 0.66, 6);
    // consumo NASEM (ec. lactancia) para estos datos
    const neOut = d.neMilkPerKg * 35;
    const dmi = (3.7 + 5.7 + 0.305 * neOut + 0.022 * 650 + (-0.689 - 1.87) * 3) * (1 - 0.348 * Math.exp(-0.053 * 100));
    expect(d.dmiPred).toBeCloseTo(dmi, 6);
    // PM leche = 35 kg × 3.1 % × 1000 / 0.69
    expect(d.mpMilk).toBeCloseTo((35 * 31) / 0.69, 6);
    expect(d.mpTotal).toBeGreaterThan(2000);
    expect(d.mpTotal).toBeLessThan(2500);
    expect(d.meGest).toBe(0);
  });

  it('la gestación avanzada suma energía y proteína', () => {
    const open = dairyDetail({ ...DAIRY_DEFAULT, dim: 250, gestDay: 0 });
    const preg = dairyDetail({ ...DAIRY_DEFAULT, dim: 250, gestDay: 220 });
    expect(preg.meGest).toBeGreaterThan(1);
    expect(preg.mpGest).toBeGreaterThan(50);
    expect(preg.meTotal).toBeGreaterThan(open.meTotal);
  });

  it('vaca seca y novilla', () => {
    const dry = dairyRequirements({ ...DAIRY_DEFAULT, state: 'seca', gestDay: 250 });
    expect(dry.dmi).toBeCloseTo(650 * 0.01979, 1);
    const hf = dairyRequirements({ ...DAIRY_DEFAULT, state: 'novilla', bw: 350, frameGain: 0.8, gestDay: 0 });
    expect(hf.dmi).toBeCloseTo(15.36 * (1 - Math.exp(-0.0022 * 350)), 6);
  });
});

describe('formulación bovina en base MS', () => {
  let highs: HighsLike;
  beforeAll(async () => {
    highs = (await loader()) as unknown as HighsLike;
  });
  it('ración de vaca lechera con ensilado, heno y concentrados', () => {
    const req = dairyRequirements({ ...DAIRY_DEFAULT, milk: 30 });
    const prices: Record<string, number> = {
      'fedna:ensilado-de-maiz-30-35': 0.05,
      'nasem:legume-hay-mid-maturity': 0.22,
      'fedna:maiz-nacional': 0.28,
      'nasem:soybean-meal-solvent-48cp': 0.48,
      'nasem:canola-meal': 0.36,
      'nasem:limestone': 0.06,
      'nasem:calcium-phosphate-di': 0.8,
      'nasem:sodium-chloride-salt': 0.12,
    };
    for (const id of Object.keys(prices)) expect(byId[id], id).toBeTruthy();
    const res = solveFormula(highs, {
      items: Object.entries(prices).map(([ingId, price]) => ({ ingId, price, min: null, max: null })),
      ingredients: byId,
      constraints: req.constraints,
    });
    expect(res.status, res.message + JSON.stringify(res.violations)).toBe('optimal');
    for (const c of req.constraints) {
      const v = dmValue(res.nutrients, c.key);
      if (c.min !== null) expect(v, c.key).toBeGreaterThanOrEqual(c.min - 1e-6 * Math.max(1, c.min));
      if (c.max !== null) expect(v, c.key).toBeLessThanOrEqual(c.max + 1e-6 * Math.max(1, c.max));
    }
    const forage = (res.inclusion['fedna:ensilado-de-maiz-30-35'] ?? 0) + (res.inclusion['nasem:legume-hay-mid-maturity'] ?? 0);
    expect(forage).toBeGreaterThan(30);
    console.log(
      'dieta lechera (% TC):',
      Object.fromEntries(Object.entries(res.inclusion).filter(([, v]) => v > 0).map(([k, v]) => [k, +v.toFixed(2)])),
      'MS', res.nutrients.ms.toFixed(1),
      'costo/kg MS', (res.costPerKg / (res.nutrients.ms / 100)).toFixed(3),
    );
  });
});
