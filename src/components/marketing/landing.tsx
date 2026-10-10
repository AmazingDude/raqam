import Link from 'next/link';
import { Icon, Mark } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';
export function Landing() {
  return <div className={s.root} data-raqam-ui>
    <a href="#main" className={s.skip}>Skip to content</a>
    <div className={s.siteHeaderWrap}><header className={s.siteHeader}>
      <Link href="/" className={s.brand} aria-label="Raqam home"><Mark/>raqam</Link>
      <nav aria-label="Main navigation" className={s.siteNav}><a href="#how-it-works">How it works</a><Link href="/workspace" className={s.button}>Open workspace <Icon name="arrow" size={16}/></Link></nav>
    </header></div>
    <main id="main">
      <section className={s.hero}>
        <p className={s.heroLabel}>A calmer way to keep your books</p>
        <h1>A little clarity.<br/><span>For every transaction.</span></h1>
        <p className={s.heroCopy}>Turn scattered transactions and receipts into a cashbook you can review. Your records, your decisions, all in one place.</p>
        <div className={s.heroActions}><Link href="/workspace" className={s.button}>Open workspace <Icon name="arrow" size={17}/></Link><Link href="/demo" className={s.secondary}>Explore an example</Link></div>
        <div className={s.preview} aria-label="Synthetic cashbook and source evidence preview">
          <div className={s.previewBar}><span><strong>Sunday Studio</strong> / Cashbook</span><span className={s.badge}>Example workspace</span></div>
          <div className={s.previewBody}>
            <div className={s.previewBook}><h2>Good records. Clear decisions.</h2>
              <div className={s.miniTotals}><div><span>Cash in · PKR</span><strong>92,000.00</strong></div><div><span>Cash out · PKR</span><strong>27,500.00</strong></div><div><span>Net movement · PKR</span><strong>64,500.00</strong></div></div>
              <div className={s.miniRow}><div><strong>Brand identity · Aster Studio</strong><span className={s.muted}>10 Oct 2026 · Customer receipts</span></div><b>+64,000.00</b></div>
              <div className={s.miniRow}><div><strong>Northstar Cloud subscription</strong><span className={`${s.badge} ${s.pending}`}>Category proposed</span></div><b>−8,500.00</b></div>
              <div className={s.miniRow}><div><strong>October studio rent</strong><span className={s.muted}>7 Oct 2026 · Premises & utilities</span></div><b>−12,500.00</b></div>
            </div>
            <aside className={s.previewEvidence}><span className={s.muted}>Connected to its source</span><div className={s.receipt}><Icon name="file" size={21}/><h3>Northstar Cloud</h3><p className={s.small}>8 Oct 2026 / NS-101</p><div className={s.receiptLine}><span>Total · PKR</span><strong>8,500.00</strong></div><p className={`${s.small} ${s.muted}`} style={{marginTop:16}}>Synthetic receipt</p></div><span className={`${s.badge} ${s.pending}`}><Icon name="review" size={13}/> Ready for your review</span></aside>
          </div>
          <p className={s.previewCaption}>Synthetic example · totals cover all six example records · the preview shows three</p>
        </div>
      </section>
      <section className={s.process} id="how-it-works">
        <div className={s.sectionHeading}><h2>From a pile of records<br/>to a reviewed cashbook.</h2><p>A simple workflow for the business you’re busy running.</p></div>
        <div className={s.steps}>
          <article className={s.step}><span className={s.stepNumber}>01 / Bring your records</span><h3>Start with what you have.</h3><p>Import transactions using a clear CSV template. Keep receipt images beside the records they support.</p></article>
          <article className={s.step}><span className={s.stepNumber}>02 / Make it yours</span><h3>You get the final say.</h3><p>Review extracted fields, suggested categories and possible matches. Unclear details stay visible until you resolve them.</p></article>
          <article className={s.step}><span className={s.stepNumber}>03 / See it clearly</span><h3>Every number has a source.</h3><p>See recorded cash in, cash out and net movement. Export your cashbook with its review statuses and source references.</p></article>
        </div>
      </section>
      <section className={s.finalCta}><h2>Make room for the actual work.</h2><p>See how a small service business organizes its cash records.</p><Link href="/demo" className={s.button}>Explore the example <Icon name="arrow" size={18}/></Link></section>
    </main>
    <footer className={s.footer}><span>raqam / Built by edge runners</span><span>English · PKR · Reviewed bookkeeping</span><Link href="/workspace">Open workspace</Link></footer>
  </div>;
}
