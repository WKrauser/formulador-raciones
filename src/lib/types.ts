export type Source = 'FEDNA' | 'Feedtables' | 'Local';

export interface Ingredient {
  id: string;
  name: string;
  code?: string;
  source: Source;
  category: string;
  /** Composición tal cual: clave de nutriente -> valor */
  n: Record<string, number>;
  notes?: string;
  /** Para ingredientes locales: id del ingrediente de tablas del que se copió */
  basedOn?: string;
  updatedAt?: number;
}

/** Datos del usuario asociados a cualquier ingrediente (de tablas o local). */
export interface IngredientPrice {
  id: string;
  /** Precio por kg en la moneda configurada */
  price: number;
  available: boolean;
  updatedAt: number;
}

export interface Constraint {
  key: string;
  min: number | null;
  max: number | null;
}

/** Relación entre nutrientes: min <= num/den <= max */
export interface RatioConstraint {
  num: string;
  den: string;
  min: number | null;
  max: number | null;
}

export interface RequirementProfile {
  id: string;
  name: string;
  species: string;
  stage: string;
  source: string;
  builtin: boolean;
  verified: boolean;
  note?: string;
  constraints: Constraint[];
  ratios?: RatioConstraint[];
  updatedAt?: number;
}

export interface FormulaItem {
  ingId: string;
  /** Precio por kg usado en esta fórmula */
  price: number;
  /** Inclusión mínima y máxima en % (null = sin límite) */
  min: number | null;
  max: number | null;
  /** Inclusión fija en % (sobrescribe min/max) */
  fixed?: number | null;
}

export interface SolveResult {
  status: 'optimal' | 'infeasible' | 'error';
  message?: string;
  /** % de inclusión por ingrediente */
  inclusion: Record<string, number>;
  /** costo por kg */
  costPerKg: number;
  /** Composición resultante */
  nutrients: Record<string, number>;
  /** Precio sombra por restricción de nutriente (costo por kg por unidad de nutriente) */
  shadow: Record<string, number>;
  /** Costo reducido por ingrediente (por kg) */
  reduced: Record<string, number>;
  /** Restricciones violadas en el diagnóstico de infactibilidad */
  violations?: { label: string; required: number; achieved: number; kind: 'min' | 'max' }[];
  /** Ingredientes sin dato para nutrientes restringidos */
  missing?: { ingId: string; keys: string[] }[];
  /** Nutrientes restringidos sin dato en ningún ingrediente de la fórmula */
  noData?: string[];
}

export interface Formula {
  id: string;
  name: string;
  code?: string;
  species?: string;
  notes?: string;
  requirementId?: string;
  constraints: Constraint[];
  ratios: RatioConstraint[];
  items: FormulaItem[];
  /** Composición de los ingredientes en el momento de guardar (trazabilidad) */
  snapshot?: Record<string, Pick<Ingredient, 'name' | 'source' | 'category' | 'n'>>;
  result?: SolveResult;
  batchKg: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  id: 'settings';
  currency: string;
  priceUnit: 'kg' | 't' | 'qq';
  company: string;
  defaultBatchKg: number;
  /** Fuentes visibles en la biblioteca */
  sources: Source[];
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  currency: '$',
  priceUnit: 'kg',
  company: '',
  defaultBatchKg: 1000,
  sources: ['FEDNA', 'Feedtables', 'Local'],
};

/** kg por unidad de precio */
export const PRICE_UNIT_KG: Record<Settings['priceUnit'], number> = { kg: 1, t: 1000, qq: 46 };
export const PRICE_UNIT_LABEL: Record<Settings['priceUnit'], string> = {
  kg: 'por kg',
  t: 'por tonelada',
  qq: 'por quintal (46 kg)',
};
