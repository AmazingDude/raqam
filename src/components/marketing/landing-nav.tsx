'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Icon, Logo } from '../ui/icon.tsx';
import s from './landing.module.css';
import { ThemeToggle } from '../ui/theme-provider.tsx';

export function LandingNav({ signedIn }: { signedIn: boolean }) {
  const [open,setOpen]=useState(false);
  const menu=useRef<HTMLButtonElement>(null);
  function closeMenu() {setOpen(false);menu.current?.focus();}
  return <header className={s.header}>
    <Link href="/" className={s.brand} aria-label="Raqam home"><Logo/></Link>
    <nav className={s.desktopNav} aria-label="Main navigation"><a href="#workflow">How it works</a><a href="#features">Features</a><a href="#faq">FAQs</a><Link href="/demo">Explore example</Link></nav>
    <div className={s.navActions}><ThemeToggle/><Link href={signedIn?'/workspace':'/sign-in'} className={s.navLogin}>{signedIn?'Open workspace':'Log in'}<Icon name="arrow" size={16}/></Link><button ref={menu} type="button" className={s.menuButton} aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} aria-controls={open?'landing-mobile-nav':undefined} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(event.key==='Escape')closeMenu();}}><Icon name={open?'close':'menu'}/></button></div>
    {open&&<nav id="landing-mobile-nav" className={s.mobileNav} aria-label="Mobile navigation" onKeyDown={event=>{if(event.key==='Escape')closeMenu();}}><a href="#workflow" onClick={()=>setOpen(false)}>How it works</a><a href="#features" onClick={()=>setOpen(false)}>Features</a><a href="#faq" onClick={()=>setOpen(false)}>FAQs</a><Link href="/demo">Explore example</Link><Link href="/workspace">Open workspace</Link></nav>}
  </header>;
}
