import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '../components/ui/button';

const KEY = 'crypt-theme';

/** Dark (default) / light toggle, persisted per browser (Req 14.2). */
export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);

  return (
    <Button variant="ghost" size="icon" onClick={() => setDark((d) => !d)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
