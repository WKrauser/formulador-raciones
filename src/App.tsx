import { useEffect, useState } from 'react';
import { FormulasView } from './components/FormulasView';
import { FormulateView, newFormula } from './components/FormulateView';
import { IngredientsView } from './components/IngredientsView';
import { RequirementsView } from './components/RequirementsView';
import { SettingsView } from './components/SettingsView';
import type { Formula } from './lib/types';
import { useData } from './state';

type Tab = 'formular' | 'ingredientes' | 'requerimientos' | 'formulas' | 'ajustes';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'formular', label: 'Formular', icon: '⚖' },
  { id: 'ingredientes', label: 'Ingredientes', icon: '🌾' },
  { id: 'requerimientos', label: 'Requerimientos', icon: '📋' },
  { id: 'formulas', label: 'Fórmulas', icon: '🗂' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙' },
];
const DRAFT_KEY = 'formulador.draft';

function loadDraft(): Formula | null {
  try {
    const s = localStorage.getItem(DRAFT_KEY);
    return s ? (JSON.parse(s) as Formula) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const { ready, settings } = useData();
  const [tab, setTab] = useState<Tab>('formular');
  const [draft, setDraft] = useState<Formula>(() => loadDraft() ?? newFormula());
  const [draftKey, setDraftKey] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [draft]);

  if (!ready) return <div className="loading">Cargando…</div>;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">⚖</span>
          <div>
            <b>Formulador de raciones</b>
            <small>{settings.company || 'Costo mínimo · FEDNA 2019 · Feedtables · NRC'}</small>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <span className="ti">{t.icon}</span>
              <span className="tl">{t.label}</span>
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'formular' && <FormulateView key={draftKey} draft={draft} setDraft={setDraft} />}
        {tab === 'ingredientes' && <IngredientsView />}
        {tab === 'requerimientos' && <RequirementsView />}
        {tab === 'formulas' && (
          <FormulasView
            onOpen={(f) => {
              setDraft(f);
              setDraftKey((k) => k + 1);
              setTab('formular');
            }}
          />
        )}
        {tab === 'ajustes' && <SettingsView />}
      </main>
    </div>
  );
}
