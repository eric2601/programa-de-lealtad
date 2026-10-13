import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '../api';
import './admin.css';
import { useT } from '../i18n';
import { adminApi, errorText, type Catalog, type Station } from './api';
import { NavIcon } from './icons';
import { Asociados } from './views/Asociados';
import { Campanas } from './views/Campanas';
import { Dashboard } from './views/Dashboard';
import { Generador } from './views/Generador';
import { Inicio } from './views/Inicio';
import { Investigacion } from './views/Investigacion';
import { Notificaciones } from './views/Notificaciones';
import { Promociones } from './views/Promociones';
import { Segmentos } from './views/Segmentos';
import { Wallet } from './views/Wallet';

export type Section = 'inicio' | 'dashboard' | 'campanas' | 'promociones' | 'generador' | 'investigacion' | 'asociados' | 'segmentos' | 'wallet' | 'notificaciones';
/** Etiquetas en español; se traducen al dibujar con `t()`. */
const SECTIONS: { key: Section; label: string; short: string }[] = [
  { key: 'inicio', label: 'Inicio', short: 'Inicio' }, { key: 'dashboard', label: 'Ventas y resultados', short: 'Ventas' }, { key: 'campanas', label: 'Campañas', short: 'Campañas' },
  { key: 'promociones', label: 'Promociones', short: 'Promos' }, { key: 'generador', label: 'Ideas de promociones', short: 'Ideas' }, { key: 'investigacion', label: 'Competencia', short: 'Competencia' },
  { key: 'asociados', label: 'Asociados', short: 'Asociados' }, { key: 'segmentos', label: 'Segmentos', short: 'Segmentos' }, { key: 'wallet', label: 'Clientes y dinero virtual', short: 'Clientes' },
  { key: 'notificaciones', label: 'Notificaciones', short: 'Avisos' },
];

export interface AdminContextValue {
  session: Session; token: string; catalog: Catalog; stations: Station[];
  /** Navega a otra sección; opcionalmente abre un elemento (p. ej. una promoción o campaña). */
  go: (section: Section, focusId?: string | null) => void;
  /** Identificador pedido por otra sección (se consume una sola vez). */
  takeFocus: () => string | null;
}
const AdminContext = createContext<AdminContextValue | null>(null);
export function useAdmin(): AdminContextValue {
  const v = useContext(AdminContext);
  if (!v) throw new Error('useAdmin fuera de AdminPanel');
  return v;
}

const EMPTY_CATALOG: Catalog = { objectives: [], promoTypes: [], customerTypes: [], vehicleKinds: [], segments: [], paymentMethods: [], partnerTypes: [], researchTypes: [] };

export function AdminPanel({ session, onExpired }: { session: Session; onExpired: () => void }) {
  const { t } = useT();
  const [section, setSection] = useState<Section>('inicio');
  const [focus, setFocus] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([adminApi<Catalog>('/catalog', session.token), adminApi<Station[]>('/stations', session.token)])
      .then(([c, s]) => { if (alive) { setCatalog(c); setStations(s); } })
      .catch((e) => { if (!alive) return; if ((e as { status?: number }).status === 401) onExpired(); else setError(errorText(e)); });
    return () => { alive = false; };
  }, [session.token, onExpired]);

  const value: AdminContextValue = {
    session, token: session.token, catalog: catalog ?? EMPTY_CATALOG, stations,
    go: (s, id = null) => { setFocus(id); setSection(s); window.scrollTo({ top: 0 }); },
    takeFocus: () => { const f = focus; if (f) setFocus(null); return f; },
  };

  return (
    <AdminContext.Provider value={value}>
      <div className="admin">
        <nav className="admin-nav" aria-label={t('Secciones del panel')}>
          {SECTIONS.map((s) => (
            <button key={s.key} className={section === s.key ? 'on' : ''} aria-current={section === s.key ? 'page' : undefined} onClick={() => value.go(s.key)} title={t(s.label)}>
              <span className="nav-ico"><NavIcon name={s.key} /></span>
              <span className="nav-label">{t(s.label)}</span>
              <span className="nav-short">{t(s.short)}</span>
            </button>
          ))}
        </nav>
        <div className="admin-main">
          {error && <div className="alert error">{error}</div>}
          {section === 'inicio' && <Inicio />}
          {section === 'dashboard' && <Dashboard />}
          {section === 'campanas' && <Campanas />}
          {section === 'promociones' && <Promociones />}
          {section === 'generador' && <Generador />}
          {section === 'investigacion' && <Investigacion />}
          {section === 'asociados' && <Asociados />}
          {section === 'segmentos' && <Segmentos />}
          {section === 'wallet' && <Wallet />}
          {section === 'notificaciones' && <Notificaciones />}
        </div>
      </div>
    </AdminContext.Provider>
  );
}
