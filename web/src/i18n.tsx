import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Idiomas de la interfaz. El español es el idioma principal y queda escrito tal cual en el código;
 * el inglés se obtiene de un diccionario español → inglés (`src/i18n/en/*.ts`).
 *
 * Uso: `const { t, lang, locale } = useT();  t('Texto en español')`.
 * Con variables: `t('Hola {name}', { name })` (las llaves se sustituyen después de traducir).
 * Fuera de React (helpers de formato): `translate(...)`, `getLocale()`.
 */
export type Lang = 'es' | 'en';
export const LANGS: Lang[] = ['es', 'en'];
const KEY = 'lealtad.lang';

function loadLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch { /* sin almacenamiento */ }
  return typeof navigator !== 'undefined' && /^en\b/i.test(navigator.language) ? 'en' : 'es';
}

let current: Lang = loadLang();
const missing = new Set<string>();

/** El diccionario inglés se descarga solo si alguien elige inglés (≈80 KB que el español no necesita). */
let EN: Record<string, string> | null = null;
let loadingEn: Promise<void> | null = null;
function loadEn(): Promise<void> {
  if (EN) return Promise.resolve();
  loadingEn ??= import('./i18n/en').then((m) => { EN = m.EN; });
  return loadingEn;
}
/** Se resuelve cuando el idioma guardado está listo; main.tsx espera esto para no mostrar un instante en español. */
export const i18nReady: Promise<void> = current === 'en' ? loadEn().catch(() => undefined) : Promise.resolve();

export const getLang = () => current;
export const getLocale = () => (current === 'en' ? 'en-US' : 'es-MX');

/** Traduce una cadena en español al idioma activo; si falta en el diccionario, deja el español. */
export function translate(es: string, vars?: Record<string, string | number>): string {
  let s = es;
  if (current === 'en') {
    const hit = EN?.[es];
    if (hit !== undefined) s = hit;
    else if (EN && import.meta.env.DEV && !missing.has(es)) { missing.add(es); console.warn(`[i18n] sin traducción: ${JSON.stringify(es)}`); }
  }
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

function apply(lang: Lang) {
  current = lang;
  document.documentElement.lang = lang === 'en' ? 'en' : 'es-MX';
  try { localStorage.setItem(KEY, lang); } catch { /* sin almacenamiento */ }
}

interface LangCtx { lang: Lang; locale: string; setLang: (l: Lang) => void; t: typeof translate }
const Ctx = createContext<LangCtx>({ lang: current, locale: getLocale(), setLang: () => {}, t: translate });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  const [, setLoaded] = useState(0);
  useEffect(() => { apply(lang); }, [lang]);
  // Al cambiar a inglés por primera vez, descargar el diccionario y volver a dibujar.
  useEffect(() => { if (lang === 'en' && !EN) void loadEn().then(() => setLoaded((n) => n + 1)); }, [lang]);
  if (current !== lang) current = lang; // para que el primer render ya use el idioma correcto
  const setLang = useCallback((l: Lang) => setLangState(l), []);
  // `t` cambia de identidad con el idioma para que los componentes memorizados se vuelvan a dibujar.
  const enReady = !!EN;
  const t = useCallback((es: string, vars?: Record<string, string | number>) => translate(es, vars), [lang, enReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = useMemo<LangCtx>(() => ({ lang, locale: lang === 'en' ? 'en-US' : 'es-MX', setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);

/** Botón ES | EN. */
export function LangToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useT();
  return (
    <div className={`lang-toggle${compact ? ' compact' : ''}`} role="group" aria-label={t('Idioma')}>
      {LANGS.map((l) => (
        <button key={l} type="button" className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}
          title={l === 'es' ? 'Español' : 'English'}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
