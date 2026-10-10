import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { Icon, Mark } from '../ui/icon.tsx';
import { LandingPreview } from './landing-preview.tsx';
import s from './landing.module.css';

export async function Landing() {
  const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;
  const userId = clerkConfigured ? (await auth()).userId : null;

  return (
    <div className={s.root} data-raqam-ui id="top">
      <a href="#main" className={s.skip}>
        Skip to content
      </a>

      {/* Global Navigation Bar */}
      <div className={s.navWrapper}>
        <header className={s.navContainer}>
          <Link href="/" className={s.brand} aria-label="Raqam home">
            <span className={s.brandMark}><Mark /></span>
            <span>raqam</span>
            <span className={s.brandBadge}>Beta</span>
          </Link>

          <nav aria-label="Main navigation" className={s.navLinks}>
            <a href="#workflow" className={s.navLink}>Workflow</a>
            <a href="#features" className={s.navLink}>Features</a>
            <a href="#principles" className={s.navLink}>Integrity</a>
            <a href="#faq" className={s.navLink}>FAQ</a>
            <Link href="/demo" className={s.navLink} style={{ color: '#34d399' }}>Live Demo</Link>
          </nav>

          <div className={s.navActions}>
            {userId ? (
              <Link href="/workspace" className={s.primaryPill} id="nav-workspace-btn">
                <span>Open Workspace</span>
                <Icon name="arrow" size={15} />
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className={s.ghostPill} id="nav-signin-btn">
                  Sign In
                </Link>
                <Link href="/sign-up" className={s.primaryPill} id="nav-signup-btn">
                  <span>Sign Up</span>
                  <Icon name="arrow" size={15} />
                </Link>
              </>
            )}
          </div>
        </header>
      </div>

      <main id="main">
        {/* Hero Section */}
        <section className={s.hero}>
          <div className={s.heroContent}>
            <div className={s.heroBadge}>
              <span className={s.heroBadgeDot} />
              <span>Reviewed Financial Operations · English &amp; PKR</span>
            </div>

            <h1 className={s.heroTitle}>
              Bookkeeping you can actually trust.<br />
              <span className={s.heroTitleHighlight}>Every rupee connected to proof.</span>
            </h1>

            <p className={s.heroSubtitle}>
              Import bank transactions, scan receipt images, and let AI propose categories and matches.
              You maintain final review over every rupee. No fabricated math, no silent assumptions.
            </p>

            <div className={s.heroCtaGroup}>
              {userId ? (
                <Link href="/workspace" className={s.heroPrimaryBtn} id="hero-primary-workspace">
                  <span>Launch Workspace</span>
                  <Icon name="arrow" size={18} />
                </Link>
              ) : (
                <Link href="/sign-up" className={s.heroPrimaryBtn} id="hero-primary-signup">
                  <span>Get Started Free</span>
                  <Icon name="arrow" size={18} />
                </Link>
              )}

              <Link href="/demo" className={s.heroSecondaryBtn} id="hero-explore-demo">
                <Icon name="spark" size={17} />
                <span>Explore Interactive Demo</span>
              </Link>
            </div>

            {/* Interactive Preview Island */}
            <LandingPreview />
          </div>
        </section>

        {/* Section 3: The 3-Step Workflow */}
        <section className={s.sectionLight} id="workflow">
          <div className={s.sectionInner}>
            <div className={s.sectionHeader}>
              <span className={s.sectionEyebrow}>Systematic Workflow</span>
              <h2 className={s.sectionHeading}>
                From scattered transaction files<br />to an audit-ready cashbook.
              </h2>
              <p className={s.sectionLead}>
                A structured, disciplined three-stage cycle designed specifically for the pace of a growing service business.
              </p>
            </div>

            <div className={s.stepsGrid}>
              <article className={s.stepCard}>
                <span className={s.stepNumber}>01 / Bring your records</span>
                <h3 className={s.stepTitle}>Import without friction</h3>
                <p className={s.stepDescription}>
                  Drop bank statement files (CSV, TSV, or Excel XLS/XLSX) straight into Raqam.
                  Our parser isolates errors, validates encoding, and preserves raw source records immutably.
                </p>
              </article>

              <article className={s.stepCard}>
                <span className={s.stepNumber}>02 / Supervised AI Extraction</span>
                <h3 className={s.stepTitle}>AI proposes, you decide</h3>
                <p className={s.stepDescription}>
                  Vision OCR extracts dates, vendors, and totals from receipt snapshots.
                  Smart suggestions propose categories and 1-to-1 matches, leaving ambiguous items visible for human sign-off.
                </p>
              </article>

              <article className={s.stepCard}>
                <span className={s.stepNumber}>03 / Exact Financial Truth</span>
                <h3 className={s.stepTitle}>Deterministic totals &amp; export</h3>
                <p className={s.stepDescription}>
                  See real-time cash in, cash out, and net movements calculated with integer-paisa math.
                  Export reconciled books with full audit histories for your accountant in one click.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Section 4: Technology Deep Dives */}
        <section className={s.sectionCanvas} id="features">
          <div className={s.sectionInner}>
            <div className={s.sectionHeader}>
              <span className={s.sectionEyebrow}>Core Capabilities</span>
              <h2 className={s.sectionHeading}>
                Engineered for financial precision.<br />Zero shortcuts.
              </h2>
              <p className={s.sectionLead}>
                Built on strict principles where software never guesses a financial number or silently alters a ledger.
              </p>
            </div>

            <div className={s.featureGrid}>
              <div className={s.featureCard}>
                <div className={s.featureIconWrap}>
                  <Icon name="upload" size={22} />
                </div>
                <h3 className={s.featureTitle}>Multi-Format Bank Statement Ingest</h3>
                <p className={s.featureDesc}>
                  Whether your Pakistani bank provides standard CSV, TSV, or legacy Excel sheets, Raqam normalizes headers,
                  detects duplicate movements, and lets you correct malformed rows before atomic confirmation.
                </p>
                <div className={s.featureProof}>
                  <Icon name="check" size={14} />
                  <span>Supports CSV, TSV, XLS, and XLSX formats</span>
                </div>
              </div>

              <div className={s.featureCard}>
                <div className={s.featureIconWrap}>
                  <Icon name="file" size={22} />
                </div>
                <h3 className={s.featureTitle}>Grounded Receipt OCR &amp; Evidence</h3>
                <p className={s.featureDesc}>
                  Every uploaded receipt or bill is stored in private object storage. Our OCR extracts vendors,
                  amounts, and invoice numbers side-by-side with the image. Unreadable text is flagged—never faked as zero.
                </p>
                <div className={s.featureProof}>
                  <Icon name="check" size={14} />
                  <span>Side-by-side evidence inspection</span>
                </div>
              </div>

              <div className={s.featureCard}>
                <div className={s.featureIconWrap}>
                  <Icon name="link" size={22} />
                </div>
                <h3 className={s.featureTitle}>1-to-1 Match Reconciliation</h3>
                <p className={s.featureDesc}>
                  Prevent duplicate claims with strict one-to-one document matching. Competing match candidates
                  are surfaced with clear matching rationale, while atomic database locks prevent race conditions.
                </p>
                <div className={s.featureProof}>
                  <Icon name="check" size={14} />
                  <span>Enforced at database and RPC levels</span>
                </div>
              </div>

              <div className={s.featureCard}>
                <div className={s.featureIconWrap}>
                  <Icon name="spark" size={22} />
                </div>
                <h3 className={s.featureTitle}>Grounded Read-Only Assistant</h3>
                <p className={s.featureDesc}>
                  Ask queries about your business cashflow in natural language. Powered by scoped backend tools,
                  the assistant queries real database totals and cites exact records—with zero capability to write or alter records.
                </p>
                <div className={s.featureProof}>
                  <Icon name="check" size={14} />
                  <span>100% read-only, zero hallucinated math</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Integrity Principles Matrix */}
        <section className={s.matrixSection} id="principles">
          <div className={s.sectionInner}>
            <div className={s.sectionHeader}>
              <span className={s.sectionEyebrow} style={{ color: '#34d399' }}>Architectural Integrity</span>
              <h2 className={s.sectionHeading} style={{ color: '#ffffff' }}>
                How we protect your business records.
              </h2>
              <p className={s.sectionLead} style={{ color: '#9ba1ad' }}>
                Every architectural choice in Raqam puts data ownership, calculation accuracy, and security first.
              </p>
            </div>

            <div className={s.matrixGrid}>
              <div className={s.matrixCard}>
                <h3 className={s.matrixCardTitle}>Integer Paisa Math</h3>
                <p className={s.matrixCardDesc}>
                  No floating point rounding errors (`0.1 + 0.2 != 0.3`). All currency is stored and summed in exact 64-bit integer paisa.
                </p>
              </div>

              <div className={s.matrixCard}>
                <h3 className={s.matrixCardTitle}>True Tenant Isolation</h3>
                <p className={s.matrixCardDesc}>
                  Authenticated sessions with Clerk combined with Supabase Row-Level Security guarantee that no business can access another&apos;s records.
                </p>
              </div>

              <div className={s.matrixCard}>
                <h3 className={s.matrixCardTitle}>Full Immutable Audit Trail</h3>
                <p className={s.matrixCardDesc}>
                  When you edit a description or re-categorize an item, Raqam archives the prior state and records the actor and timestamp.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6: FAQ Accordion */}
        <section className={s.faqSection} id="faq">
          <div className={s.sectionInner}>
            <div className={s.sectionHeader}>
              <span className={s.sectionEyebrow}>Common Questions</span>
              <h2 className={s.sectionHeading}>
                Frequently Asked Questions
              </h2>
              <p className={s.sectionLead}>
                Everything you need to know about setting up and running your cashbook on Raqam.
              </p>
            </div>

            <div className={s.faqList}>
              <details className={s.faqItem} open>
                <summary className={s.faqSummary}>
                  <span>Does Raqam automatically modify my bank account or file taxes?</span>
                  <Icon name="chevron" size={16} />
                </summary>
                <div className={s.faqAnswer}>
                  No. Raqam is a read-supervised bookkeeping system. It operates entirely on the bank statements and receipts you import. AI algorithms propose categories and matches, but nothing is ever finalized without your explicit review.
                </div>
              </details>

              <details className={s.faqItem}>
                <summary className={s.faqSummary}>
                  <span>Which bank statement formats are supported in Pakistan?</span>
                  <Icon name="chevron" size={16} />
                </summary>
                <div className={s.faqAnswer}>
                  Raqam supports CSV, TSV, and Excel (.xlsx, .xls) files exported from all commercial banks in Pakistan (Meezan, HBL, Standard Chartered, Bank Alfalah, etc.), as well as digital wallets like Nayapay and Sadapay.
                </div>
              </details>

              <details className={s.faqItem}>
                <summary className={s.faqSummary}>
                  <span>Can I export my records for my accountant?</span>
                  <Icon name="chevron" size={16} />
                </summary>
                <div className={s.faqAnswer}>
                  Yes. You can export your full cashbook at any time with one click into standard CSV format, complete with verified review statuses, category codes, and linked receipt reference IDs.
                </div>
              </details>

              <details className={s.faqItem}>
                <summary className={s.faqSummary}>
                  <span>Can I test Raqam without entering any credit card or signing up?</span>
                  <Icon name="chevron" size={16} />
                </summary>
                <div className={s.faqAnswer}>
                  Absolutely. Click &ldquo;Explore Interactive Demo&rdquo; at the top of the page to open a sandboxed example workspace with synthetic Pakistani PKR transactions ready to inspect.
                </div>
              </details>
            </div>
          </div>
        </section>

        {/* Section 7: Final CTA */}
        <section className={s.finalCta}>
          <div className={s.finalCtaContent}>
            <h2 className={s.finalCtaTitle}>
              Make room for the actual work.
            </h2>
            <p className={s.finalCtaSubtitle}>
              Stop spending your weekends digging through bank PDFs and shoeboxes of receipts.
              Keep your cashbook clean and reviewed in minutes.
            </p>

            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/demo" className={s.heroPrimaryBtn} id="final-cta-demo">
                <span>Try Demo Workspace</span>
                <Icon name="arrow" size={18} />
              </Link>
              {userId ? (
                <Link href="/workspace" className={s.heroSecondaryBtn} id="final-cta-workspace">
                  <span>Open Your Workspace</span>
                </Link>
              ) : (
                <Link href="/sign-up" className={s.heroSecondaryBtn} id="final-cta-signup">
                  <span>Create Account</span>
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 700, color: '#ffffff' }}>raqam</span>
            <span>·</span>
            <span>Engineered by Edge Runners</span>
            <span>·</span>
            <span>English · PKR Financial Operations</span>
          </div>

          <div style={{ display: 'flex', gap: 20 }}>
            <a href="#top" className={s.footerLink}>Back to top</a>
            <Link href="/demo" className={s.footerLink}>Demo Workspace</Link>
            <Link href="/workspace" className={s.footerLink}>Workspace App</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
