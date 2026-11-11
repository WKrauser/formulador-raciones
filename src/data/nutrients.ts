// Catálogo de nutrientes. Todos los valores se expresan "tal cual" (as fed).
export type NutrientGroup =
  | 'Análisis proximal'
  | 'Energía'
  | 'Minerales'
  | 'Microminerales y vitaminas'
  | 'Aminoácidos totales'
  | 'AA digestibles porcino (SID)'
  | 'AA digestibles aves'
  | 'Rumiantes'
  | 'Ácidos grasos';

export interface Nutrient {
  key: string;
  name: string;
  unit: string;
  group: NutrientGroup;
  decimals: number;
}

const n = (key: string, name: string, unit: string, group: NutrientGroup, decimals = 2): Nutrient => ({
  key,
  name,
  unit,
  group,
  decimals,
});

export const NUTRIENTS: Nutrient[] = [
  n('ms', 'Materia seca', '%', 'Análisis proximal'),
  n('pb', 'Proteína bruta', '%', 'Análisis proximal'),
  n('ee', 'Extracto etéreo (grasa)', '%', 'Análisis proximal'),
  n('fb', 'Fibra bruta', '%', 'Análisis proximal'),
  n('fnd', 'FND', '%', 'Análisis proximal'),
  n('fad', 'FAD', '%', 'Análisis proximal'),
  n('lad', 'Lignina (LAD)', '%', 'Análisis proximal'),
  n('almidon', 'Almidón', '%', 'Análisis proximal'),
  n('azucares', 'Azúcares', '%', 'Análisis proximal'),
  n('cenizas', 'Cenizas', '%', 'Análisis proximal'),

  n('em_aves', 'EMAn aves (adultas / gallo)', 'kcal/kg', 'Energía', 0),
  n('em_pollo', 'EMAn pollos (broiler / jóvenes)', 'kcal/kg', 'Energía', 0),
  n('ed_porc', 'ED porcino', 'kcal/kg', 'Energía', 0),
  n('em_porc', 'EM porcino', 'kcal/kg', 'Energía', 0),
  n('en_porc', 'EN porcino (crecimiento)', 'kcal/kg', 'Energía', 0),
  n('en_cerdas', 'EN cerdas adultas', 'kcal/kg', 'Energía', 0),
  n('em_rum', 'EM rumiantes', 'kcal/kg', 'Energía', 0),
  n('enl_rum', 'ENl rumiantes', 'kcal/kg', 'Energía', 0),
  n('enm_rum', 'ENm rumiantes', 'kcal/kg', 'Energía', 0),
  n('eng_rum', 'ENg rumiantes', 'kcal/kg', 'Energía', 0),
  n('tdn', 'NDT (TDN)', '%', 'Energía', 1),
  n('ed_conejo', 'ED conejos', 'kcal/kg', 'Energía', 0),
  n('ed_caballo', 'ED caballos', 'kcal/kg', 'Energía', 0),
  n('ed_salmon', 'ED salmónidos', 'kcal/kg', 'Energía', 0),

  n('ca', 'Calcio', '%', 'Minerales', 3),
  n('p', 'Fósforo total', '%', 'Minerales', 3),
  n('p_fit', 'Fósforo fítico', '%', 'Minerales', 3),
  n('p_nf', 'Fósforo no fítico', '%', 'Minerales', 3),
  n('p_disp_av', 'Fósforo disponible aves', '%', 'Minerales', 3),
  n('p_dig_av', 'Fósforo digestible aves', '%', 'Minerales', 3),
  n('p_dig_porc', 'Fósforo digestible porcino', '%', 'Minerales', 3),
  n('na', 'Sodio', '%', 'Minerales', 3),
  n('cl', 'Cloro', '%', 'Minerales', 3),
  n('k', 'Potasio', '%', 'Minerales', 3),
  n('mg', 'Magnesio', '%', 'Minerales', 3),
  n('s', 'Azufre', '%', 'Minerales', 3),
  n('beb', 'Balance electrolítico (Na+K−Cl)', 'mEq/kg', 'Minerales', 0),

  n('cu', 'Cobre', 'mg/kg', 'Microminerales y vitaminas', 1),
  n('fe', 'Hierro', 'mg/kg', 'Microminerales y vitaminas', 1),
  n('mn', 'Manganeso', 'mg/kg', 'Microminerales y vitaminas', 1),
  n('zn', 'Zinc', 'mg/kg', 'Microminerales y vitaminas', 1),
  n('se', 'Selenio', 'mg/kg', 'Microminerales y vitaminas', 3),
  n('i', 'Yodo', 'mg/kg', 'Microminerales y vitaminas', 3),
  n('co', 'Cobalto', 'mg/kg', 'Microminerales y vitaminas', 3),
  n('colina', 'Colina', 'mg/kg', 'Microminerales y vitaminas', 0),
  n('vit_e', 'Vitamina E', 'mg/kg', 'Microminerales y vitaminas', 1),
  n('biotina', 'Biotina', 'mg/kg', 'Microminerales y vitaminas', 3),

  n('lys', 'Lisina', '%', 'Aminoácidos totales', 3),
  n('met', 'Metionina', '%', 'Aminoácidos totales', 3),
  n('mc', 'Metionina + cistina', '%', 'Aminoácidos totales', 3),
  n('thr', 'Treonina', '%', 'Aminoácidos totales', 3),
  n('trp', 'Triptófano', '%', 'Aminoácidos totales', 3),
  n('ile', 'Isoleucina', '%', 'Aminoácidos totales', 3),
  n('val', 'Valina', '%', 'Aminoácidos totales', 3),
  n('arg', 'Arginina', '%', 'Aminoácidos totales', 3),
  n('leu', 'Leucina', '%', 'Aminoácidos totales', 3),
  n('his', 'Histidina', '%', 'Aminoácidos totales', 3),
  n('phe', 'Fenilalanina', '%', 'Aminoácidos totales', 3),
  n('glyeq', 'Glicina equivalente (Gly + 0.7143 Ser)', '%', 'Aminoácidos totales', 3),

  n('sid_lys', 'Lisina SID porcino', '%', 'AA digestibles porcino (SID)', 3),
  n('sid_met', 'Metionina SID porcino', '%', 'AA digestibles porcino (SID)', 3),
  n('sid_mc', 'Met + Cis SID porcino', '%', 'AA digestibles porcino (SID)', 3),
  n('sid_thr', 'Treonina SID porcino', '%', 'AA digestibles porcino (SID)', 3),
  n('sid_trp', 'Triptófano SID porcino', '%', 'AA digestibles porcino (SID)', 3),
  n('sid_ile', 'Isoleucina SID porcino', '%', 'AA digestibles porcino (SID)', 3),
  n('sid_val', 'Valina SID porcino', '%', 'AA digestibles porcino (SID)', 3),
  n('sid_arg', 'Arginina SID porcino', '%', 'AA digestibles porcino (SID)', 3),

  n('dav_lys', 'Lisina digestible aves', '%', 'AA digestibles aves', 3),
  n('dav_met', 'Metionina digestible aves', '%', 'AA digestibles aves', 3),
  n('dav_mc', 'Met + Cis digestible aves', '%', 'AA digestibles aves', 3),
  n('dav_thr', 'Treonina digestible aves', '%', 'AA digestibles aves', 3),
  n('dav_trp', 'Triptófano digestible aves', '%', 'AA digestibles aves', 3),
  n('dav_ile', 'Isoleucina digestible aves', '%', 'AA digestibles aves', 3),
  n('dav_val', 'Valina digestible aves', '%', 'AA digestibles aves', 3),
  n('dav_arg', 'Arginina digestible aves', '%', 'AA digestibles aves', 3),

  n('ufl', 'UFL', 'UF/kg', 'Rumiantes', 3),
  n('ufc', 'UFC / UFV', 'UF/kg', 'Rumiantes', 3),
  n('pdia', 'PDIA', '%', 'Rumiantes', 2),
  n('pdie', 'PDIE', '%', 'Rumiantes', 2),
  n('pdin', 'PDIN', '%', 'Rumiantes', 2),
  n('pdi', 'PDI (INRA 2018)', '%', 'Rumiantes', 2),
  n('pbd_rum', 'PB digestible rumiantes', '%', 'Rumiantes', 2),
  n('pdr', 'Proteína degradable en rumen (PDR)', '%', 'Rumiantes', 2),
  n('pndr', 'Proteína no degradable en rumen (PNDR)', '%', 'Rumiantes', 2),
  n('pm_ndt', 'PM estimada, límite energía (NDT)', 'g/kg', 'Rumiantes', 1),
  n('pm_pdr', 'PM estimada, límite PDR', 'g/kg', 'Rumiantes', 1),
  n('fnd_forraje', 'FDN de forraje', '%', 'Rumiantes', 2),
  n('ca_abs', 'Calcio absorbible', '%', 'Rumiantes', 3),
  n('p_abs', 'Fósforo absorbible', '%', 'Rumiantes', 3),

  n('c18_2', 'Ácido linoleico (C18:2)', '%', 'Ácidos grasos', 3),
  n('c18_3', 'Ácido linolénico (C18:3)', '%', 'Ácidos grasos', 3),
];

export const NUTRIENT_MAP: Record<string, Nutrient> = Object.fromEntries(NUTRIENTS.map((x) => [x.key, x]));

export const NUTRIENT_GROUPS: NutrientGroup[] = Array.from(new Set(NUTRIENTS.map((x) => x.group)));

export function fmt(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('es', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function nutrientLabel(key: string): string {
  const nu = NUTRIENT_MAP[key];
  return nu ? `${nu.name} (${nu.unit})` : key;
}
