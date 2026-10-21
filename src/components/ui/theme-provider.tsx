'use client';
import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import { resolveTheme,THEME_STORAGE_KEY,type Theme } from '../../lib/client/theme.ts';

const AppearanceContext=createContext<{theme:Theme;toggle:()=>void}|null>(null);
export function ThemeProvider({children}:{children:ReactNode}) {
  const [theme,setTheme]=useState<Theme>('dark');
  useEffect(()=>{
    setTheme(resolveTheme(document.documentElement.dataset.theme));
    function onStorage(event:StorageEvent) {
      if(event.key!==THEME_STORAGE_KEY&&event.key!==null)return;
      const next=resolveTheme(event.newValue);
      document.documentElement.dataset.theme=next;
      setTheme(next);
    }
    window.addEventListener('storage',onStorage);
    return()=>window.removeEventListener('storage',onStorage);
  },[]);
  function toggle() {
    const next=theme==='dark'?'light':'dark';
    document.documentElement.dataset.theme=next;
    setTheme(next);
    try{window.localStorage.setItem(THEME_STORAGE_KEY,next);}catch{/* Appearance still works when storage is unavailable. */}
  }
  return <AppearanceContext.Provider value={{theme,toggle}}>{children}</AppearanceContext.Provider>;
}
export function ThemeToggle() {
  const appearance=useContext(AppearanceContext);
  if(!appearance)return null;
  const light=appearance.theme==='dark';
  return <button type="button" className="raqam-theme-toggle" aria-label={`Switch to ${light?'light':'dark'} theme`} onClick={appearance.toggle}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{light?<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>:<path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7Z"/>}</svg>
    <span>{light?'Light theme':'Dark theme'}</span>
  </button>;
}
