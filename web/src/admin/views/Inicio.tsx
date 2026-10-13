import { useAdmin, type Section } from '../AdminPanel';
import { NavIcon } from '../icons';
import { useT } from '../../i18n';

// Textos en español; se pasan por t() al dibujar.
const TILES: { section: Section; focus?: string; title: string; text: string; primary?: boolean }[] = [
  { section: 'dashboard', title: 'Ver cómo van las ventas', text: 'Ventas, litros, ticket promedio y qué tanto rinden las promociones.', primary: true },
  { section: 'promociones', focus: 'new:', title: 'Crear una promoción', text: 'Define qué tiene que hacer el cliente y qué recibe a cambio.' },
  { section: 'campanas', title: 'Ver campañas', text: 'Agrupa promociones con un objetivo y mide si funcionaron.' },
  { section: 'wallet', title: 'Buscar un cliente', text: 'Consulta su saldo de dinero virtual, cupones y movimientos por teléfono.' },
  { section: 'generador', title: 'Ideas de promociones', text: 'Dile el objetivo y el sistema te propone promociones listas para usar.' },
  { section: 'investigacion', title: 'Investigar competencia', text: 'Registra lo que hace la competencia y compara qué les funciona.' },
];

/** Pantalla de inicio del panel: accesos grandes a lo más frecuente. */
export function Inicio() {
  const { session, go } = useAdmin();
  const { t } = useT();
  return (
    <div className="admin-main">
      <div className="step-title">
        <h2>{t('Hola, {name}. ¿Qué quieres hacer hoy?', { name: session.user.name.split(' ')[0] })}</h2>
        <p>{t('Todo lo del programa de lealtad de {tenant} está aquí. Empieza por lo más común:', { tenant: session.tenant.name })}</p>
      </div>
      <div className="home-tiles">
        {TILES.map((tile) => (
          <button key={tile.title} className={`tile${tile.primary ? ' primary' : ''}`} onClick={() => go(tile.section, tile.focus ?? null)}>
            <span className="tile-ico"><NavIcon name={tile.section} /></span>
            <b>{t(tile.title)}</b>
            <span>{t(tile.text)}</span>
          </button>
        ))}
      </div>
      <p className="muted small">{t('¿Buscas algo más? En el menú también están Asociados (negocios aliados), Segmentos (grupos de clientes) y Notificaciones (mensajes automáticos).')}</p>
    </div>
  );
}
