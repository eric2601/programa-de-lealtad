import { lazy, Suspense, useEffect, useState } from 'react';
import type { Session } from './api';
import { BrandMark, Icon, type IconName } from './components/icons';
import { LiveDot } from './components/Motion';
import { ThemeToggle } from './components/ThemeToggle';
import { LangToggle, useT } from './i18n';
import { Home } from './views/Home';
import { Isla } from './views/Isla';
import { Login } from './views/Login';
import { Skeleton } from './components/Visual';

// Se descargan al abrir su pestaña: un despachador nunca baja el panel del gerente ni los reportes,
// y un cliente que abre su portal no baja la bomba ni el panel.
const AdminPanel = lazy(() => import('./admin/AdminPanel').then((m) => ({ default: m.AdminPanel })));
const Portal = lazy(() => import('./views/Portal').then((m) => ({ default: m.Portal })));
const Reportes = lazy(() => import('./views/Reportes').then((m) => ({ default: m.Reportes })));
const Tablero = lazy(() => import('./views/Tablero').then((m) => ({ default: m.Tablero })));

type Tab = 'inicio' | 'dashboard' | 'bomba' | 'panel' | 'reportes' | 'portal';
const TABS: Tab[] = ['inicio', 'dashboard', 'bomba', 'panel', 'reportes', 'portal'];
// Las etiquetas están en español y se pasan por t() al dibujar.
const NAV: { key: Tab; label: string; icon: IconName; manager?: boolean }[] = [
  { key: 'inicio', label: 'Inicio', icon: 'home' },
  { key: 'bomba', label: 'Bomba', icon: 'fuel' },
  { key: 'dashboard', label: 'Dashboard', icon: 'chart', manager: true },
  { key: 'panel', label: 'Panel', icon: 'tag', manager: true },
  { key: 'reportes', label: 'Reportes', icon: 'list', manager: true },
  { key: 'portal', label: 'Cliente', icon: 'phone' },
];
const ROLE_LABEL: Record<Session['user']['role'], string> = { owner: 'Dueño', admin: 'Administrador', manager: 'Gerente', attendant: 'Despachador' };

function loadSession(): Session | null {
  try { const raw = localStorage.getItem('lealtad.session'); return raw ? (JSON.parse(raw) as Session) : null; } catch { return null; }
}
function tabFromHash(): Tab {
  const h = location.hash.replace('#', '');
  if (h === 'isla') return 'bomba';
  return (TABS as string[]).includes(h) ? (h as Tab) : 'inicio';
}

export function App() {
  const { t } = useT();
  const [session, setSession] = useState<Session | null>(loadSession);
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    try { session ? localStorage.setItem('lealtad.session', JSON.stringify(session)) : localStorage.removeItem('lealtad.session'); } catch { /* sin almacenamiento */ }
  }, [session]);
  useEffect(() => { location.hash = tab === 'inicio' ? '' : tab; }, [tab]);

  const manager = !!session && session.user.role !== 'attendant';
  const go = (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); };
  const logout = () => { setSession(null); setTab('inicio'); };
  const items = NAV.filter((n) => !n.manager || manager);
  const initials = session ? session.user.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() : '';
  const role = session ? t(ROLE_LABEL[session.user.role]) : '';

  return (
    <div className="shell">
      <a className="sr-only" href="#contenido">{t('Ir al contenido')}</a>
      <header className="topnav">
        <div className="brand">
          <BrandMark size={34} />
          <div><b>Lealtad</b><small>{session ? `${session.tenant.name} · ${session.station.name}` : t('Gasolineras')}</small></div>
        </div>
        <nav className="topnav-tabs" aria-label={t('Secciones')}>
          {items.map((n) => (
            <button key={n.key} className={tab === n.key ? 'on' : ''} aria-current={tab === n.key ? 'page' : undefined} onClick={() => go(n.key)}>
              <span className="nav-ico"><Icon name={n.icon} size={17} /></span><span className="nav-label">{t(n.label)}</span>
            </button>
          ))}
        </nav>
        <div className="topnav-right">
          {tab === 'dashboard' && <LiveDot />}
          {session && (
            <div className="user" title={`${session.user.name} · ${role}`}>
              <span className="avatar" aria-hidden="true">{initials}</span>
              <div className="user-text"><b>{session.user.name.split(' ')[0]}</b><small>{role} · {session.station.code}</small></div>
            </div>
          )}
          <LangToggle />
          <ThemeToggle />
          {session && <button className="icon-btn" onClick={logout} aria-label={t('Salir')} title={t('Salir')}><Icon name="logout" size={16} /></button>}
        </div>
      </header>
      <main id="contenido" className={`page${tab === 'panel' || tab === 'dashboard' ? ' page-wide' : ''}`}>
        <Suspense fallback={<Skeleton lines={4} />}>
        {tab === 'portal' && <Portal />}
        {tab !== 'portal' && !session && <Login onLogin={(s) => { setSession(s); go('inicio'); }} />}
        {tab === 'inicio' && session && <Home session={session} onGo={go} />}
        {tab === 'dashboard' && session && manager && <Tablero session={session} />}
        {tab === 'bomba' && session && <Isla session={session} onExpired={logout} />}
        {tab === 'panel' && session && manager && <AdminPanel session={session} onExpired={logout} />}
        {tab === 'reportes' && session && manager && <Reportes session={session} />}
        {(tab === 'dashboard' || tab === 'panel' || tab === 'reportes') && session && !manager && (
          <div className="card empty-state"><span className="empty-ico"><Icon name="lock" size={24} /></span><b>{t('Solo para gerentes')}</b><p className="muted">{t('Pide a tu gerente que entre con su NIP.')}</p><button className="btn" onClick={() => go('bomba')}>{t('Ir a la bomba')}</button></div>
        )}
        </Suspense>
      </main>
      <nav className="dock" aria-label={t('Navegación')}>
        {items.map((n) => (
          <button key={n.key} className={tab === n.key ? 'on' : ''} aria-current={tab === n.key ? 'page' : undefined} onClick={() => go(n.key)}>
            <Icon name={n.icon} size={20} />{t(n.label)}
          </button>
        ))}
      </nav>
    </div>
  );
}
