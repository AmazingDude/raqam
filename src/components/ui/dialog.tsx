'use client';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './icon.tsx';
import s from './theme.module.css';
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => { ref.current?.close(); prior?.focus(); };
  }, []);
  return <dialog ref={ref} className={s.dialog} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className={s.dialogHeading}><h2 id="dialog-title">{title}</h2><button className={s.iconButton} aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></div>
    {children}
  </dialog>;
}
