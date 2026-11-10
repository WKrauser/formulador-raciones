import Dexie, { type Table } from 'dexie';
import raw from '../data/ingredients.json';
import { BUILTIN_REQUIREMENTS } from '../data/requirements';
import {
  DEFAULT_SETTINGS,
  type Formula,
  type Ingredient,
  type IngredientPrice,
  type RequirementProfile,
  type Settings,
} from './types';

class FormuladorDB extends Dexie {
  ingredients!: Table<Ingredient, string>; // solo ingredientes locales
  prices!: Table<IngredientPrice, string>;
  requirements!: Table<RequirementProfile, string>; // solo perfiles del usuario
  formulas!: Table<Formula, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('formulador-raciones');
    this.version(1).stores({
      ingredients: 'id, name, category, updatedAt',
      prices: 'id',
      requirements: 'id, name, species',
      formulas: 'id, name, updatedAt',
      settings: 'id',
    });
  }
}

export const db = new FormuladorDB();

export const TABLE_INGREDIENTS: Ingredient[] = (raw as unknown as { items: Ingredient[] }).items;
export const DATA_SOURCES_NOTE = (raw as unknown as { generated: string }).generated;

export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await db.settings.get('settings')) ?? {}) };
}

export async function allIngredients(): Promise<Ingredient[]> {
  const local = await db.ingredients.toArray();
  return [...local, ...TABLE_INGREDIENTS];
}

export async function allRequirements(): Promise<RequirementProfile[]> {
  const mine = await db.requirements.toArray();
  return [...mine.sort((a, b) => a.name.localeCompare(b.name)), ...BUILTIN_REQUIREMENTS];
}

export interface Backup {
  app: 'formulador-raciones';
  version: 1;
  exportedAt: string;
  ingredients: Ingredient[];
  prices: IngredientPrice[];
  requirements: RequirementProfile[];
  formulas: Formula[];
  settings?: Settings;
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'formulador-raciones',
    version: 1,
    exportedAt: new Date().toISOString(),
    ingredients: await db.ingredients.toArray(),
    prices: await db.prices.toArray(),
    requirements: await db.requirements.toArray(),
    formulas: await db.formulas.toArray(),
    settings: await db.settings.get('settings'),
  };
}

/** Importa un respaldo. Los registros con el mismo id se reemplazan. */
export async function importBackup(b: Backup): Promise<string> {
  if (b?.app !== 'formulador-raciones') throw new Error('El archivo no es un respaldo de esta aplicación.');
  await db.transaction('rw', [db.ingredients, db.prices, db.requirements, db.formulas, db.settings], async () => {
    await db.ingredients.bulkPut(b.ingredients ?? []);
    await db.prices.bulkPut(b.prices ?? []);
    await db.requirements.bulkPut(b.requirements ?? []);
    await db.formulas.bulkPut(b.formulas ?? []);
    if (b.settings) await db.settings.put(b.settings);
  });
  return `${b.ingredients?.length ?? 0} ingredientes locales, ${b.prices?.length ?? 0} precios, ${
    b.requirements?.length ?? 0
  } requerimientos y ${b.formulas?.length ?? 0} fórmulas importados.`;
}
