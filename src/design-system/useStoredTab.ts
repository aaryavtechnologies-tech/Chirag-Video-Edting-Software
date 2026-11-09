import { useEffect, useState } from 'react';

export function useStoredTab<T extends string>(key: string, allowed: readonly T[], initial: T) {
  const [tab, setTab] = useState<T>(() => allowed.find((item) => item === localStorage.getItem(key)) ?? initial);
  useEffect(() => { localStorage.setItem(key, tab); }, [key, tab]);
  return [tab, setTab] as const;
}
