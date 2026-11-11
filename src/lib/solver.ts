import type { Constraint, FormulaItem, Ingredient, RatioConstraint, SolveResult } from './types';
import { NUTRIENT_MAP } from '../data/nutrients';

/** Interfaz mínima del solver HiGHS (paquete npm "highs"). */
export interface HighsLike {
  solve(problem: string, options?: Record<string, unknown>): {
    Status: string;
    ObjectiveValue: number;
    Columns: Record<string, { Primal: number; Dual: number }>;
    Rows: { Name: string; Primal: number; Dual: number }[];
  };
}

export interface SolveInput {
  items: FormulaItem[];
  ingredients: Record<string, Ingredient>;
  constraints: Constraint[];
  ratios?: RatioConstraint[];
}

const EPS = 1e-9;
const AA_KEYS = new Set(['lys', 'met', 'mc', 'thr', 'trp', 'ile', 'val', 'arg', 'leu', 'his', 'phe', 'glyeq']);

function num(v: number): string {
  // Formato seguro para el formato LP (sin notación científica extrema)
  if (Math.abs(v) < 1e-12) return '0';
  return Number(v.toPrecision(12)).toString();
}

function terms(coefs: number[], vars: string[]): string {
  let s = '';
  coefs.forEach((c, i) => {
    if (Math.abs(c) < 1e-12) return;
    s += (c < 0 ? ' - ' : ' + ') + num(Math.abs(c)) + ' ' + vars[i];
  });
  return s.trim().replace(/^\+ /, '');
}

interface Row {
  name: string;
  label: string;
  coefs: number[]; // sobre variables x (en %)
  sense: '>=' | '<=';
  rhs: number;
  kind: 'min' | 'max';
  key: string; // clave para precios sombra
  required: number; // valor requerido en unidades del nutriente
  scaleBack: number; // multiplica la actividad de fila para obtener el valor de la dieta
}

function value(ing: Ingredient | undefined, key: string): number {
  const v = ing?.n?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Construye filas: restricciones de nutrientes y relaciones. Variables x_i = % de inclusión. */
function buildRows(input: SolveInput): Row[] {
  const { items, ingredients, constraints, ratios = [] } = input;
  const rows: Row[] = [];
  constraints.forEach((c, ci) => {
    const coefs = items.map((it) => value(ingredients[it.ingId], c.key));
    const nu = NUTRIENT_MAP[c.key];
    const dm = c.basis === 'ms';
    const label = (nu ? nu.name : c.key) + (dm ? ' (MS)' : '');
    const key = dm ? `${c.key}@ms` : c.key;
    // Tal cual: sum(n_i x_i)/100 >= req.  Base MS: sum(n_i x_i) >= req · sum(ms_i x_i)/100  ->  sum((n_i - req·ms_i/100) x_i) >= 0
    const ms = items.map((it) => value(ingredients[it.ingId], 'ms'));
    const row = (req: number) => (dm ? coefs.map((a, i) => a - (req * ms[i]) / 100) : coefs);
    if (c.min !== null && c.min !== undefined && !Number.isNaN(c.min)) {
      rows.push({ name: `nmin${ci}`, label, coefs: row(c.min), sense: '>=', rhs: dm ? 0 : c.min * 100, kind: 'min', key, required: c.min, scaleBack: 0.01 });
    }
    if (c.max !== null && c.max !== undefined && !Number.isNaN(c.max)) {
      rows.push({ name: `nmax${ci}`, label, coefs: row(c.max), sense: '<=', rhs: dm ? 0 : c.max * 100, kind: 'max', key, required: c.max, scaleBack: 0.01 });
    }
  });
  ratios.forEach((r, ri) => {
    const a = items.map((it) => value(ingredients[it.ingId], r.num));
    const b = items.map((it) => value(ingredients[it.ingId], r.den));
    const label = `${NUTRIENT_MAP[r.num]?.name ?? r.num} : ${NUTRIENT_MAP[r.den]?.name ?? r.den}`;
    if (r.min !== null && r.min !== undefined) {
      rows.push({ name: `rmin${ri}`, label, coefs: a.map((x, i) => x - r.min! * b[i]), sense: '>=', rhs: 0, kind: 'min', key: `ratio:${ri}:min`, required: r.min, scaleBack: NaN });
    }
    if (r.max !== null && r.max !== undefined) {
      rows.push({ name: `rmax${ri}`, label, coefs: a.map((x, i) => x - r.max! * b[i]), sense: '<=', rhs: 0, kind: 'max', key: `ratio:${ri}:max`, required: r.max, scaleBack: NaN });
    }
  });
  return rows;
}

function bounds(it: FormulaItem): [number, number] {
  if (it.fixed !== null && it.fixed !== undefined && !Number.isNaN(it.fixed)) return [it.fixed, it.fixed];
  const lo = it.min ?? 0;
  const hi = it.max ?? 100;
  return [Math.max(0, lo), Math.min(100, hi)];
}

function buildLP(input: SolveInput, rows: Row[], elastic: boolean): { lp: string; scales: number[] } {
  const { items } = input;
  const vars = items.map((_, i) => `x${i}`);
  const maxPrice = Math.max(1e-9, ...items.map((i) => Math.abs(i.price)));
  const scales = rows.map((r) => {
    const m = Math.max(...r.coefs.map(Math.abs), Math.abs(r.rhs) / 100, 1e-12);
    return 1 / m;
  });
  // Objetivo: costo por 100 kg (precios normalizados para estabilidad numérica)
  let obj = terms(items.map((i) => i.price / maxPrice), vars) || '0 x0';
  if (elastic) {
    // En modo elástico se minimiza la violación ponderada; el costo queda como desempate.
    obj = terms(items.map((i) => (i.price / maxPrice) * 1e-4), vars) || '0 x0';
    rows.forEach((_, k) => {
      obj += ` + 1000 s${k}`;
    });
  }
  const lines: string[] = ['Minimize', ` obj: ${obj}`, 'Subject To', ` total: ${terms(items.map(() => 1), vars)} = 100`];
  rows.forEach((r, k) => {
    const sc = scales[k];
    let t = terms(r.coefs.map((c) => c * sc), vars);
    if (!t) t = '0 x0';
    if (elastic) t += r.sense === '>=' ? ` + s${k}` : ` - s${k}`;
    lines.push(` ${r.name}: ${t} ${r.sense} ${num(r.rhs * sc)}`);
  });
  lines.push('Bounds');
  items.forEach((it, i) => {
    const [lo, hi] = bounds(it);
    lines.push(` ${num(lo)} <= ${vars[i]} <= ${num(hi)}`);
  });
  if (elastic) rows.forEach((_, k) => lines.push(` s${k} >= 0`));
  lines.push('End');
  return { lp: lines.join('\n'), scales };
}

/** Valor de un nutriente de la mezcla expresado en base materia seca. */
export function dmValue(nutrients: Record<string, number>, key: string): number {
  const ms = nutrients.ms ?? 0;
  return ms > 0 ? ((nutrients[key] ?? 0) * 100) / ms : 0;
}

export function mixNutrients(inclusion: Record<string, number>, ingredients: Record<string, Ingredient>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, pct] of Object.entries(inclusion)) {
    const ing = ingredients[id];
    if (!ing) continue;
    for (const [k, v] of Object.entries(ing.n)) {
      if (typeof v !== 'number') continue;
      out[k] = (out[k] ?? 0) + (v * pct) / 100;
    }
  }
  return out;
}

export function solveFormula(highs: HighsLike, input: SolveInput): SolveResult {
  const res = solveInner(highs, input);
  const keys = new Set([...input.constraints.map((c) => c.key), ...(input.ratios ?? []).flatMap((r) => [r.num, r.den])]);
  const noData = [...keys].filter((k) => input.items.length > 0 && input.items.every((it) => typeof input.ingredients[it.ingId]?.n?.[k] !== 'number'));
  return noData.length ? { ...res, noData } : res;
}

function solveInner(highs: HighsLike, input: SolveInput): SolveResult {
  const empty: SolveResult = { status: 'error', inclusion: {}, costPerKg: 0, nutrients: {}, shadow: {}, reduced: {} };
  const { items, ingredients } = input;
  if (items.length === 0) return { ...empty, message: 'Agregue ingredientes a la fórmula.' };

  // Datos faltantes
  const keys = new Set([
    ...input.constraints.map((c) => c.key),
    ...(input.ratios ?? []).flatMap((r) => [r.num, r.den]),
    ...(input.constraints.some((c) => c.basis === 'ms') ? ['ms'] : []),
  ]);
  const isAA = (k: string) => AA_KEYS.has(k.replace(/^(sid|dav)_/, ''));
  const missing = items
    .map((it) => {
      const n = ingredients[it.ingId]?.n ?? {};
      // Un ingrediente sin proteína (aceites, minerales) no aporta aminoácidos: no es un dato faltante.
      const noProtein = typeof n.pb === 'number' && n.pb <= 0.5;
      return { ingId: it.ingId, keys: [...keys].filter((k) => typeof n[k] !== 'number' && !(noProtein && isAA(k))) };
    })
    .filter((m) => m.keys.length > 0);

  // Validación de límites de inclusión
  const b = items.map(bounds);
  const sumMin = b.reduce((s, [lo]) => s + lo, 0);
  const sumMax = b.reduce((s, [, hi]) => s + hi, 0);
  const badBound = items.find((_, i) => b[i][0] > b[i][1] + EPS);
  if (badBound) {
    return { ...empty, status: 'infeasible', missing, message: `El mínimo de "${ingredients[badBound.ingId]?.name}" es mayor que su máximo.` };
  }
  if (sumMin > 100 + 1e-6) {
    return { ...empty, status: 'infeasible', missing, message: `La suma de inclusiones mínimas/fijas es ${sumMin.toFixed(2)} % (> 100 %).` };
  }
  if (sumMax < 100 - 1e-6) {
    return { ...empty, status: 'infeasible', missing, message: `La suma de inclusiones máximas es ${sumMax.toFixed(2)} % (< 100 %). Agregue ingredientes o amplíe límites.` };
  }

  const rows = buildRows(input);
  const maxPrice = Math.max(1e-9, ...items.map((i) => Math.abs(i.price)));
  let res;
  const { lp, scales } = buildLP(input, rows, false);
  try {
    res = highs.solve(lp, { presolve: 'off' });
  } catch (e) {
    return { ...empty, missing, message: 'Error del solver: ' + (e as Error).message };
  }

  if (res.Status === 'Optimal') {
    const inclusion: Record<string, number> = {};
    const reduced: Record<string, number> = {};
    items.forEach((it, i) => {
      const col = res.Columns[`x${i}`];
      const v = col ? col.Primal : 0;
      inclusion[it.ingId] = Math.abs(v) < 1e-9 ? 0 : v;
      // costo reducido por kg de ingrediente (precio normalizado -> moneda)
      reduced[it.ingId] = col ? col.Dual * maxPrice : 0;
    });
    const shadow: Record<string, number> = {};
    res.Rows.forEach((r) => {
      const k = rows.findIndex((x) => x.name === r.Name);
      if (k < 0 || Math.abs(r.Dual) < 1e-12) return;
      const row = rows[k];
      // Dual en unidades: costo(norm)/100kg por unidad de fila escalada.
      // Variación del costo por kg de dieta al cambiar el requerimiento en 1 unidad del nutriente:
      const perUnit = r.Dual * scales[k] * maxPrice; // costo por 100 kg por unidad de (sum n_i x_i)
      const key = row.key.startsWith('ratio:') ? row.key : `${row.key}:${row.kind}`;
      shadow[key] = perUnit; // = costo por kg de dieta por unidad de nutriente (100 kg * 1/100)
    });
    const costPerKg = items.reduce((s, it) => s + (it.price * (inclusion[it.ingId] ?? 0)) / 100, 0);
    return {
      status: 'optimal',
      inclusion,
      costPerKg,
      nutrients: mixNutrients(inclusion, ingredients),
      shadow,
      reduced,
      missing,
    };
  }

  // Infactible: diagnóstico elástico
  if (/infeasible/i.test(res.Status)) {
    try {
      const el = buildLP(input, rows, true);
      const r2 = highs.solve(el.lp, { presolve: 'off' });
      const inclusion: Record<string, number> = {};
      items.forEach((it, i) => (inclusion[it.ingId] = r2.Columns[`x${i}`]?.Primal ?? 0));
      const nutrients = mixNutrients(inclusion, ingredients);
      const violations: NonNullable<SolveResult['violations']> = [];
      rows.forEach((row, k) => {
        const s = r2.Columns[`s${k}`]?.Primal ?? 0;
        if (s > 1e-7) {
          let achieved: number;
          if (row.key.startsWith('ratio:')) {
            const ri = Number(row.key.split(':')[1]);
            const rr = input.ratios![ri];
            achieved = (nutrients[rr.num] ?? 0) / Math.max(nutrients[rr.den] ?? 0, 1e-12);
          } else if (row.key.endsWith('@ms')) {
            achieved = dmValue(nutrients, row.key.slice(0, -3));
          } else achieved = nutrients[row.key] ?? 0;
          violations.push({ label: row.label, required: row.required, achieved, kind: row.kind });
        }
      });
      return {
        ...empty,
        status: 'infeasible',
        inclusion,
        nutrients,
        costPerKg: items.reduce((s, it) => s + (it.price * (inclusion[it.ingId] ?? 0)) / 100, 0),
        violations,
        missing,
        message: 'No existe una mezcla que cumpla todas las restricciones. Abajo se muestran las restricciones que no se alcanzan con la mezcla más cercana.',
      };
    } catch (e) {
      return { ...empty, status: 'infeasible', missing, message: 'Problema infactible. ' + (e as Error).message };
    }
  }
  return { ...empty, missing, message: `Estado del solver: ${res.Status}` };
}

let highsPromise: Promise<HighsLike> | null = null;

/** Carga perezosa del solver HiGHS (WebAssembly). */
export function getHighs(): Promise<HighsLike> {
  if (!highsPromise) {
    highsPromise = (async () => {
      const [{ default: loader }, { default: wasmUrl }] = await Promise.all([
        import('highs'),
        import('highs/runtime?url'),
      ]);
      return (await loader({ locateFile: () => wasmUrl })) as unknown as HighsLike;
    })();
  }
  return highsPromise;
}
