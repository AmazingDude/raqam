import type { CSSProperties } from 'react';
export type IconName = 'book' | 'file' | 'review' | 'spark' | 'settings' | 'arrow' | 'upload' | 'download' | 'search' | 'close' | 'chevron' | 'check' | 'menu' | 'plus' | 'link' | 'reset';
const paths: Record<IconName, string> = {
  book: 'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4V4Zm9 3a3 3 0 0 1 3-3h4v15h-3a4 4 0 0 0-4 2',
  file: 'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h4',
  review: 'M9 4H5v16h14V4h-4M9 3h6v4H9V3Zm0 11 2 2 4-5',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v2m0 13v2m9-8h-2m-14 0H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0-1.42-1.42M7.06 7.06 5.64 5.64',
  arrow: 'M4 12h15m-6-6 6 6-6 6', upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4', search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm5.5-2 5 5',
  close: 'm6 6 12 12M6 18 18 6', chevron: 'm9 5 7 7-7 7', check: 'm5 12 4 4L19 6',
  menu: 'M4 6h16M4 12h16M4 18h16', plus: 'M12 5v14M5 12h14', link: 'm9 15 6-6M8 11l-2 2a4 4 0 0 0 5 5l2-2m-2-5 2-2a4 4 0 0 1 5 5l-2 2',
  reset: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
};
export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
export function Mark({ size = 28, style }: { size?: number; style?: CSSProperties } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" style={style}>
      <rect x="4" y="4" width="5.5" height="24" rx="2.75" fill="currentColor" />
      <path d="M9.5 4H19C23.4183 4 27 7.58172 27 12C27 16.4183 23.4183 20 19 20H9.5V14.5H18.5C19.8807 14.5 21 13.3807 21 12C21 10.6193 19.8807 9.5 18.5 9.5H9.5V4Z" fill="currentColor" />
      <path d="M15.5 16L26.5 28H20.5L11.5 18.5L15.5 16Z" fill="var(--good, #176444)" />
    </svg>
  );
}

