import { Icon } from './icons';

/** Indicador de pasos (1 · 2 · 3). Los pasos ya completados se pueden tocar para regresar. */
export function Stepper({ steps, current, onGo }: { steps: string[]; current: number; onGo?: (step: number) => void }) {
  return (
    <ol className="stepper" aria-label="Pasos">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'on' : '';
        const clickable = !!onGo && n < current;
        return (
          <li key={label} className={state} aria-current={n === current ? 'step' : undefined}>
            <button type="button" disabled={!clickable} onClick={() => onGo?.(n)}>
              <span className="step-num" aria-hidden="true">{n < current ? <Icon name="check" size={14} strokeWidth={2.5} /> : n}</span>
              <span className="step-label">{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
