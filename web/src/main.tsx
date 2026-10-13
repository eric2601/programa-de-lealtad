import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { i18nReady, LangProvider } from './i18n';
import './styles.css';

void i18nReady.then(() => createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </React.StrictMode>,
));
