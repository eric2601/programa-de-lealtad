import type { Session } from '../api';
import { Icon } from '../components/icons';
import { Picto, type PictoName } from '../components/Picto';
import { Spotlight, Stagger } from '../components/Motion';
import { useT } from '../i18n';

export type HomeTarget = 'bomba' | 'dashboard' | 'panel' | 'portal' | 'reportes';

/** Pantalla de inicio después de entrar: accesos grandes según el rol. */
export function Home({ session, onGo }: { session: Session; onGo: (t: HomeTarget) => void }) {
  const { t: tr } = useT();
  const manager = session.user.role !== 'attendant';
  const hour = new Date().getHours();
  const saludo = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const tiles: { key: HomeTarget; icon: PictoName; title: string; text: string; primary?: boolean }[] = [
    { key: 'bomba', icon: 'pump', title: 'Atender en la bomba', text: 'Busca al cliente por su celular, registra la carga y entrégale lo que ganó.', primary: !manager },
    ...(manager ? [
      { key: 'dashboard' as const, icon: 'chart' as const, title: 'Dashboard de hoy', text: 'Cargas, litros, beneficios y alertas de la estación en tiempo real.', primary: true },
      { key: 'panel' as const, icon: 'tag' as const, title: 'Panel del gerente', text: 'Campañas, promociones, clientes y resultados.' },
      { key: 'reportes' as const, icon: 'coins' as const, title: 'Reporte del mes', text: 'Litros identificados, puntos y conciliación por despachador.' },
    ] : []),
    { key: 'portal', icon: 'userStar', title: 'Portal del cliente', text: 'Lo que el cliente ve en su celular: puntos, premios y cupones.' },
  ];
  return (
    <Stagger className="home">
      <div className="step-title">
        <h2 className="hero-title">{tr(saludo)}, <em className="ac">{session.user.name.split(' ')[0]}</em>.</h2>
        <p>{session.station.name} · {session.tenant.name}. {tr('¿Qué quieres hacer?')}</p>
      </div>
      <div className="home-tiles">
        {tiles.map((t) => (
          <Spotlight key={t.key} className={`tile${t.primary ? ' primary' : ''}`} as="div">
            <button className="tile-btn" onClick={() => onGo(t.key)} style={{ all: 'unset', display: 'grid', gap: '.45rem', cursor: 'pointer', width: '100%', minHeight: 'inherit' }}>
              <span className="tile-ico"><Picto name={t.icon} size={30} /></span>
              <b>{tr(t.title)}</b>
              <span>{tr(t.text)}</span>
              <span className="tile-go"><Icon name="arrowRight" size={20} /></span>
            </button>
          </Spotlight>
        ))}
      </div>
    </Stagger>
  );
}
