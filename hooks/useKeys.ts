
import { useEffect, useRef } from 'react';

export function useKeys(onKeyPress?: (key: string) => void): React.RefObject<Set<string>> {
  const keys = useRef(new Set<string>());

  useEffect(() => {
    const down = (e: KeyboardEvent) => { 
      const key = e.key.toLowerCase();
      if (!keys.current.has(key) && onKeyPress) {
        onKeyPress(key);
      }
      keys.current.add(key);
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.key.toLowerCase()); };
    
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onKeyPress]);

  return keys;
}