import { Icon } from './icons';
import { useT } from '../i18n';

/** Teclado numérico en pantalla para tabletas: dígitos, borrar y limpiar. Botones de 52 px o más. */
export function Keypad({ onDigit, onDelete, onClear, disabled, compact }: { onDigit: (d: string) => void; onDelete: () => void; onClear?: () => void; disabled?: boolean; compact?: boolean }) {
  const { t } = useT();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <div className={`keypad${compact ? ' compact' : ''}`} role="group" aria-label={t('Teclado numérico')}>
      {keys.map((k) => <button key={k} type="button" disabled={disabled} onClick={() => onDigit(k)}>{k}</button>)}
      <button type="button" className="key-alt" disabled={disabled || !onClear} onClick={onClear} aria-label={t('Limpiar todo')}>{t('Limpiar')}</button>
      <button type="button" disabled={disabled} onClick={() => onDigit('0')}>0</button>
      <button type="button" className="key-alt" disabled={disabled} onClick={onDelete} aria-label={t('Borrar último dígito')}><Icon name="backspace" size={18} /> {t('Borrar')}</button>
    </div>
  );
}
