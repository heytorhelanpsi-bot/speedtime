export type Theme = 'system' | 'light' | 'dark';
const KEY = 'speedtime.theme';

export function getTheme(): Theme {
  try {
    return (localStorage.getItem(KEY) as Theme) || 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getTheme() === 'system') applyTheme('system');
});
