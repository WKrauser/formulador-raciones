import type { RequirementProfile } from '../lib/types';

/*
 * Perfiles de requerimientos incluidos.
 *
 * - Aves: NRC (1994) Nutrient Requirements of Poultry, 9a ed. revisada. Aminoácidos totales,
 *   EMAn, P no fítico (se asigna a "P disponible aves"). Base 90 % MS.
 * - Porcinos en crecimiento: NRC (2012) Nutrient Requirements of Swine, 11a ed. (NASEM),
 *   tabla de requerimientos dietéticos para cerdos en crecimiento ad libitum, base 90 % MS.
 *   Aminoácidos SID, EN, Ca total y P digestible (STTD).
 *
 * Los valores se transcribieron de reproducciones secundarias de las tablas y deben verificarse
 * contra la publicación oficial (National Academies Press) antes de su uso comercial. Por eso
 * se marcan con verified = false. Bovinos de leche (NASEM 2021) y de carne (NASEM 2016) se basan
 * en modelos dinámicos, no en tablas fijas: para ellos cree un perfil manual.
 */

const POULTRY_NOTE =
  'NRC (1994). Aminoácidos totales; el P no fítico se compara con "P disponible aves". Verifique con la publicación oficial.';
const SWINE_NOTE =
  'NRC/NASEM (2012). Aminoácidos SID; el P digestible (STTD) se compara con "P digestible porcino" de las tablas (FEDNA reporta digestibilidad total aparente). Verifique con la publicación oficial.';

type Row = [key: string, values: (number | null)[], kind?: 'min' | 'max'];

function build(
  idPrefix: string,
  base: Omit<RequirementProfile, 'id' | 'name' | 'stage' | 'constraints'>,
  stages: string[],
  rows: Row[],
  extra: (stageIdx: number) => RequirementProfile['constraints'] = () => [],
): RequirementProfile[] {
  return stages.map((stage, i) => ({
    ...base,
    id: `${idPrefix}-${i + 1}`,
    name: `${base.species} — ${stage}`,
    stage,
    constraints: [
      ...rows
        .filter(([, v]) => v[i] !== null && v[i] !== undefined)
        .map(([key, v, kind]) => (kind === 'max' ? { key, min: null, max: v[i] } : { key, min: v[i], max: null })),
      ...extra(i),
    ],
  }));
}

const broilers = build(
  'nrc94-broiler',
  { species: 'Pollos de engorde', source: 'NRC 1994', builtin: true, verified: false, note: POULTRY_NOTE },
  ['0–3 semanas', '3–6 semanas', '6–8 semanas'],
  [
    ['em_aves', [3200, 3200, 3200]],
    ['pb', [23, 20, 18]],
    ['arg', [1.25, 1.1, 1.0]],
    ['his', [0.35, 0.32, 0.27]],
    ['ile', [0.8, 0.73, 0.62]],
    ['leu', [1.2, 1.09, 0.93]],
    ['lys', [1.1, 1.0, 0.85]],
    ['met', [0.5, 0.38, 0.32]],
    ['mc', [0.9, 0.72, 0.6]],
    ['thr', [0.8, 0.74, 0.68]],
    ['trp', [0.2, 0.18, 0.16]],
    ['val', [0.9, 0.82, 0.7]],
    ['c18_2', [1.0, 1.0, 1.0]],
    ['ca', [1.0, 0.9, 0.8]],
    ['p_disp_av', [0.45, 0.35, 0.3]],
    ['na', [0.2, 0.15, 0.12]],
    ['cl', [0.2, 0.15, 0.12]],
    ['k', [0.3, 0.3, 0.3]],
    ['mg', [0.06, 0.06, 0.06]],
    ['colina', [1300, 1000, 750]],
  ],
);

const layers = build(
  'nrc94-layer',
  { species: 'Gallinas ponedoras (huevo blanco)', source: 'NRC 1994', builtin: true, verified: false, note: POULTRY_NOTE + ' Consumo de referencia 100 g/día.' },
  ['Postura, consumo 100 g/d'],
  [
    ['em_aves', [2900]],
    ['pb', [15]],
    ['arg', [0.7]],
    ['his', [0.17]],
    ['ile', [0.65]],
    ['leu', [0.82]],
    ['lys', [0.69]],
    ['met', [0.3]],
    ['mc', [0.58]],
    ['thr', [0.47]],
    ['trp', [0.16]],
    ['val', [0.7]],
    ['c18_2', [1.0]],
    ['ca', [3.25]],
    ['p_disp_av', [0.25]],
    ['na', [0.15]],
    ['cl', [0.13]],
    ['k', [0.15]],
    ['mg', [0.05]],
    ['colina', [1050]],
  ],
);

const swine = build(
  'nrc12-grower',
  { species: 'Cerdos en crecimiento', source: 'NRC/NASEM 2012', builtin: true, verified: false, note: SWINE_NOTE },
  ['5–7 kg', '7–11 kg', '11–25 kg', '25–50 kg', '50–75 kg', '75–100 kg', '100–135 kg'],
  [
    ['en_porc', [2448, 2448, 2412, 2475, 2475, 2475, 2475]],
    ['sid_lys', [1.5, 1.35, 1.23, 1.08, 0.94, 0.83, 0.71]],
    ['sid_met', [0.43, 0.39, 0.36, 0.31, 0.27, 0.24, 0.21]],
    ['sid_mc', [0.82, 0.74, 0.68, 0.6, 0.53, 0.47, 0.41]],
    ['sid_thr', [0.88, 0.79, 0.73, 0.65, 0.57, 0.51, 0.45]],
    ['sid_trp', [0.25, 0.22, 0.2, 0.18, 0.16, 0.14, 0.12]],
    ['sid_ile', [0.77, 0.69, 0.63, 0.55, 0.48, 0.42, 0.36]],
    ['sid_val', [0.95, 0.86, 0.78, 0.69, 0.61, 0.54, 0.46]],
    ['sid_arg', [0.68, 0.61, 0.56, 0.45, 0.38, 0.32, 0.25]],
    ['ca', [0.85, 0.8, 0.7, 0.66, 0.59, 0.52, 0.46]],
    ['p_dig_porc', [0.45, 0.4, 0.33, 0.31, 0.27, 0.24, 0.21]],
    ['na', [0.4, 0.35, 0.28, 0.1, 0.1, 0.1, 0.1]],
    ['cl', [0.5, 0.45, 0.32, 0.08, 0.08, 0.08, 0.08]],
  ],
);

export const BUILTIN_REQUIREMENTS: RequirementProfile[] = [...broilers, ...layers, ...swine];
