'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function getCurrentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' ? 'dark' : 'light';
}

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // ignore
  }
}

export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    setThemeState(getCurrentTheme());
  }, []);

  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="btn fixed bottom-4 right-4 z-50"
      onClick={() => {
        setTheme(next);
        setThemeState(next);
      }}
      aria-label="Toggle theme"
      title={theme === 'dark' ? 'Switch to light mode (HP Ferrari)' : 'Switch to dark mode (Oracle Red Bull)'}
    >
      <span className="mono text-xs">{theme === 'dark' ? 'ORACLE RB' : 'HP FERRARI'}</span>
      <span className="mono text-xs muted">/</span>
      <span className="mono text-xs">{next.toUpperCase()}</span>
    </button>
  );
}
