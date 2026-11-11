# Formulador de raciones a costo mínimo

Aplicación para formular raciones para animales a **costo mínimo** (programación lineal). Funciona en
**Windows** (Electron), **Android** (Capacitor) y en cualquier navegador como **PWA** instalable y sin conexión.
Es una sola base de código React + TypeScript.

## Funciones

- **Biblioteca de ingredientes**: 956 materias primas con su composición tal cual (vista opcional en base MS).
  - **FEDNA 2019** (4ª ed., hoja oficial v.15.01.2021): 293 ingredientes.
  - **FEDNA forrajes y subproductos húmedos**: 55 variantes de ensilados (maíz, cebada, trigo, triticale, girasol, colza), henos y pastos por rango de MS o calidad (VRF), y subproductos húmedos.
  - **NASEM 2021**: biblioteca de 284 alimentos del modelo de vacuno lechero (forrajes, ensilados, pasturas, concentrados, minerales).
  - **Feedtables INRAE-CIRAD-AFZ** (feedtables.com): 324 ingredientes, todas las fichas publicadas.
  - **Ingredientes locales**: se crean desde cero, se duplican desde una tabla para ajustarlos con un análisis de laboratorio, o se importan por CSV.
- **Precios manuales** por ingrediente, por kg, tonelada o quintal, con la moneda que se configure. Se pueden importar y exportar por CSV.
- **Requerimientos**:
  - **Bovinos de leche — NASEM 2021**: calculador para vacas en lactancia, secas y novillas (consumo, EM, PM, Ca y P absorbibles; gestación, crecimiento, reservas, pastoreo y actividad).
  - **Bovinos de carne — NRC 2000 / NASEM 2016**: recría y engorde (ENm, ENg, PM, Ca, P; tipo racial, sexo, punto de terminación; densidad energética resuelta a partir del consumo) y vaca de cría (mantenimiento, lactancia y gestación). Validado contra la tabla 20-1 de NASEM 2016.
  - Las restricciones de bovinos se expresan en **base materia seca** y la fórmula muestra kg tal cual y de MS por animal y día; la hoja de mezclado se calcula por número de animales (unifeed).
  - NRC 1994 para pollos de engorde (3 fases) y ponedoras.
  - NRC/NASEM 2012 para cerdos en crecimiento (7 fases, AA SID, EN, STTD P).
  - Perfiles **manuales** para cualquier especie, por ejemplo bovinos de leche (NASEM 2021), bovinos de carne (NASEM 2016), peces o equinos.
  - Mínimos y máximos por nutriente, más **relaciones** entre nutrientes (por ejemplo Ca:P).
- **Formulación a costo mínimo** con el solver HiGHS (WebAssembly):
  - Límites mínimo, máximo y fijo de inclusión por ingrediente.
  - **Precios sombra** de cada nutriente.
  - **Análisis de precio**: el precio al que entraría un ingrediente y el costo de forzar uno por su mínimo.
  - **Diagnóstico de infactibilidad**: indica qué restricciones no se pueden cumplir y el mejor valor alcanzable.
  - Avisos de nutrientes sin dato en los ingredientes.
- **Informes**:
  - **Hoja de mezclado**: orden de carga (macro → premezcla de micro → líquidos), kg por bachada, acumulado y total por lote, casillas de verificación, columna de peso real y firmas.
  - Informe nutricional y de costos.
  - Exportación a CSV, que Excel abre directamente.
- **Fórmulas guardadas** con versión, copia de la composición de los ingredientes (trazabilidad), duplicado y eliminación.
- **Respaldo JSON** para mover los datos entre Windows y Android.

Los datos del usuario se guardan en el dispositivo (IndexedDB).

## Uso en desarrollo

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

## Compilar

| Plataforma | Comando | Resultado |
|---|---|---|
| Web / PWA | `npm run build` | `dist/` (publicable en cualquier hosting estático) |
| Windows instalador + portable | `npm run dist:win` (en Windows) | `release/*.exe` |
| Windows ZIP portable | `npm run dist:win:zip` (en cualquier SO) | `release/*.zip` |
| Android | `npm run android:sync` y luego `npm run android:open` (Android Studio) | APK/AAB |

El flujo `.github/workflows/build.yml` compila automáticamente el instalador `.exe` (runner Windows) y el APK de Android
al subir el repositorio a GitHub. Los descarga desde la pestaña *Actions* → *Artifacts*.
En cada push a `main` también publica la versión web en **GitHub Pages** (`https://<usuario>.github.io/<repositorio>/`);
en Android ábrala con Chrome y use *Agregar a pantalla de inicio* para instalarla.

## Actualizar las tablas

```bash
python3 tools/scrape_ft.py tools/sources/feedtables_raw.json
```

```bash
python3 tools/build_data.py
```

`build_data.py` lee `tools/sources/fedna2019.xlsx` (descargado de fundacionfedna.org) y genera `src/data/ingredients.json`.
Convenciones: todo **tal cual**; %, mg/kg (ppm) y kcal/kg. AA y minerales de Feedtables se convierten de g/kg a %.

Equivalencias entre tablas:

| Nutriente en la app | FEDNA | Feedtables |
|---|---|---|
| EMAn aves | EMA aves adultas | AMEn cockerel |
| EMAn pollos | EMA pollitos | AMEn broiler |
| EN porcino | EN porcino | NE growing pig |
| AA digestibles aves | digestible fecal real | ileal standardized poultry |
| P digestible porcino | total aparente | sin fitasa |

## Notas importantes

- Los requerimientos NRC incluidos están marcados **“verificar”**. Se transcribieron de reproducciones secundarias de las tablas y no de la publicación oficial (National Academies Press). Compárelos con ella antes de usarlos comercialmente.
- Bovinos: la PM aportada por la dieta se estima por ingrediente con el método NRC 2001 (proteína microbiana = 0,13 × NDT limitada por 0,85 × PDR; PM = 0,64 × PB microbiana + 0,80 × PNDR), no con el submodelo ruminal completo de NASEM 2021. La EM de los ingredientes viene de cada tabla (FEDNA y NASEM con base NRC; Feedtables INRA 2018). Las restricciones de FDN ≥ 25 %, FDN de forraje ≥ 19 % y grasa ≤ 7 % en leche son guías prácticas editables.
- La biblioteca y las ecuaciones de NASEM son propiedad intelectual de NASEM: el uso comercial requiere su autorización.
- FEDNA no reporta histidina, leucina ni fenilalanina. Si los restringe, use ingredientes de Feedtables o quite la restricción; la app lo advierte.
- Los datos de las tablas pertenecen a FEDNA e INRAE-CIRAD-AFZ. Antes de redistribuir la app comercialmente, verifique las condiciones de uso de cada fuente.
