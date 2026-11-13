import { useEffect, useState } from 'react';
import { preferredScheme, type Scheme } from './theme';

export function useScheme(): Scheme {
  const [scheme, setScheme] = useState<Scheme>(() => preferredScheme());
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setScheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return scheme;
}
