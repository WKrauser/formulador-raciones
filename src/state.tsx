import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, TABLE_INGREDIENTS } from './lib/db';
import { BUILTIN_REQUIREMENTS } from './data/requirements';
import {
  DEFAULT_SETTINGS,
  PRICE_UNIT_KG,
  type Ingredient,
  type IngredientPrice,
  type RequirementProfile,
  type Settings,
} from './lib/types';

interface AppData {
  settings: Settings;
  ingredients: Ingredient[];
  byId: Record<string, Ingredient>;
  prices: Record<string, IngredientPrice>;
  requirements: RequirementProfile[];
  /** Convierte precio por kg a la unidad configurada y viceversa */
  toUnit: (perKg: number) => number;
  fromUnit: (v: number) => number;
  ready: boolean;
}

const Ctx = createContext<AppData | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const settingsRow = useLiveQuery(() => db.settings.get('settings'), []);
  const local = useLiveQuery(() => db.ingredients.toArray(), []);
  const priceRows = useLiveQuery(() => db.prices.toArray(), []);
  const myReqs = useLiveQuery(() => db.requirements.toArray(), []);

  const value = useMemo<AppData>(() => {
    const settings = { ...DEFAULT_SETTINGS, ...(settingsRow ?? {}) };
    const ingredients = [...(local ?? []).sort((a, b) => a.name.localeCompare(b.name)), ...TABLE_INGREDIENTS];
    const byId = Object.fromEntries(ingredients.map((i) => [i.id, i]));
    const prices = Object.fromEntries((priceRows ?? []).map((p) => [p.id, p]));
    const requirements = [...(myReqs ?? []).sort((a, b) => a.name.localeCompare(b.name)), ...BUILTIN_REQUIREMENTS];
    const k = PRICE_UNIT_KG[settings.priceUnit];
    return {
      settings,
      ingredients,
      byId,
      prices,
      requirements,
      toUnit: (perKg) => perKg * k,
      fromUnit: (v) => v / k,
      ready: local !== undefined && priceRows !== undefined && myReqs !== undefined,
    };
  }, [settingsRow, local, priceRows, myReqs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('DataProvider ausente');
  return v;
}

export async function setPrice(id: string, perKg: number, available = true) {
  await db.prices.put({ id, price: perKg, available, updatedAt: Date.now() });
}
