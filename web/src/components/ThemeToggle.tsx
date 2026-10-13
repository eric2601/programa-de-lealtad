import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { useT } from '../i18n';

type Theme = 'dark' | 'light';
const KEY = 'lealtad.theme';

function loadTheme(): Theme {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

/** Aplica el tema al <html> (data-theme) y lo recuerda en este dispositivo. El tema claro es el predeterminado. */
export function applyTheme(theme: Theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0F151D' : '#F4F6F8');
}

export function ThemeToggle() {
  const { t } = useT();
  const [theme, setTheme] = useState<Theme>(loadTheme);
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* sin almacenamiento */ }
  }, [theme]);
  const dark = theme === 'dark';
  return (
    <button type="button" className="theme-toggle" onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={t(dark ? 'Cambiar a modo día' : 'Cambiar a modo noche')} title={t(dark ? 'Modo día' : 'Modo noche')}>
      <Icon name={dark ? 'sun' : 'moon'} size={17} />
    </button>
  );
}
