export type Theme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'raqam-theme';
export function resolveTheme(value:unknown):Theme { return value==='light'?'light':'dark'; }
// Static, local-only preference initialization before first paint. Never interpolates user data.
export const themeInitScript = `(()=>{let theme='dark';try{if(localStorage.getItem('raqam-theme')==='light')theme='light'}catch{}document.documentElement.dataset.theme=theme})()`;
