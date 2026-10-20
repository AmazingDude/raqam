import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { Icon, Mark, Logo } from '../ui/icon.tsx';
import { LandingPreview } from './landing-preview.tsx';
import { LandingNav } from './landing-nav.tsx';
import s from './landing.module.css';

const questions = [
  ['What can I bring into Raqam?', 'Import CSV, TSV or Excel transaction files, or supported selectable-text PDF statements. Preview the parsed rows and resolve errors before confirming. Bank layouts vary; use the CSV template when a statement is not recognized.'],
  ['Does AI make decisions for me?', 'AI prepares receipt fields, categories and possible matches. You check the original source and explicitly accept, correct or reject each suggestion. Reviewing a receipt does not add another cash transaction.'],
  ['What do the cash totals tell me?', 'Cash in, cash out and net cash movement come from your imported transactions, calculated in exact paisa. Net cash movement is not profit or an account balance. Unresolved import rows stay separate.'],
  ['Can I share my cashbook with my accountant?', 'Export your cashbook as CSV with categories, review statuses and source references. Original records and review history remain available in your workspace.'],
  ['Can I look around before signing up?', 'Yes. Explore the example workspace without an account. Its records and suggestions are synthetic, and changes last only for that session. Your own workspace requires sign-in.'],
];

export async function Landing() {
  const configured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;
  const userId = configured ? (await auth()).userId : null;
  return <div className={s.root} data-raqam-ui id="top">
    <a href="#main" className={s.skip}>Skip to content</a>
    <div className={s.heroWrap}>
      <LandingNav signedIn={!!userId}/>
      <main id="main">
        <section className={s.hero} aria-labelledby="hero-title">
          <p className={s.heroBadge}><Icon name="book" size={15}/> A little order for your everyday books</p>
          <h1 id="hero-title">Less bookkeeping.<br/><span>More breathing room.</span></h1>
          <p className={s.heroCopy}>Bring your transactions and receipts together.<br className={s.desktopBreak}/> Let AI prepare the details. Keep the final say.</p>
          <div className={s.heroActions}>
            <Link href="/workspace" className={s.lightButton}>Open workspace <Icon name="arrow" size={17}/></Link>
            <Link href="/demo" className={s.darkButton}>Explore an example</Link>
          </div>
          <p className={s.heroNote}>Built for small businesses. English. PKR. Your review.</p>
          <div className={s.featureRail} aria-label="Your bookkeeping toolkit"><a href="#workflow"><Icon name="upload" size={17}/> Import</a><a href="#features"><Icon name="file" size={17}/> Receipts</a><a href="#features"><Icon name="review" size={17}/> Review</a><a href="#assistant"><Mark size={20}/> Ask Raqam</a><a href="#workflow"><Icon name="download" size={17}/> Export</a></div>
        </section>
        <div className={s.productWrap}><LandingPreview/></div>
        <div className={s.lightBody}>
          <section className={s.workflow} id="workflow" aria-labelledby="workflow-title">
            <div className={s.sectionIntro}><p className={s.eyebrow}>A calmer routine</p><h2 id="workflow-title">From scattered records<br/>to a clearer picture.</h2><p>One place to bring it together.<br/>Three steps to keep it moving.</p></div>
            <div className={s.steps}>{[
              {icon:'upload' as const,title:'Bring your records',text:'Import your transactions and upload your receipts. Preview what came through before anything joins your cashbook.',tag:'01',note:'CSV · Excel · supported PDFs'},
              {icon:'review' as const,title:'Give it your review',text:'Check suggested details against the source. Accept what is right, correct what is not, and leave uncertain items open.',tag:'02',note:'AI proposes. You decide.'},
              {icon:'download' as const,title:'See where you stand',text:'Follow cash in, cash out and what still needs attention. Export your records when it is time to share the books.',tag:'03',note:'Exact totals · CSV export'},
            ].map(step=><article className={s.step} key={step.tag}><div className={s.stepTop}><span className={s.stepIcon}><Icon name={step.icon} size={23}/></span><span>{step.tag}</span></div><h3>{step.title}</h3><p>{step.text}</p><div className={s.stepNote}>{step.note}</div></article>)}</div>
          </section>
          <section className={s.featureSection} id="features" aria-labelledby="features-title">
            <div className={s.featureVisual}><div className={s.visualTop}><Icon name="file" size={18}/><span>Source &amp; reviewed details</span><span className={s.exampleLabel}>Example</span></div><div className={s.paper}><div className={s.paperMark}>N</div><strong>Northstar Cloud</strong><span>Receipt NS-101</span><div className={s.paperLine}><span>Cloud subscription</span><span>8,500.00</span></div><div className={s.paperTotal}><span>Total · PKR</span><strong>8,500.00</strong></div><small>Synthetic receipt for illustration</small></div><div className={s.connectedRecord}><span className={s.checkCircle}><Icon name="check" size={16}/></span><div><strong>Details reviewed</strong><span>8 Oct 2026 · PKR 8,500.00</span></div><Icon name="link" size={19}/></div></div>
            <div className={s.featureCopy}><p className={s.eyebrow}>Keep the context</p><h2 id="features-title">The number is only<br/>half the story.</h2><p>A receipt here. A bank row there. Bring the original source beside the proposed details, so you can see what belongs together.</p><ul className={s.checkList}><li><Icon name="check" size={17}/> Check extracted fields against the original</li><li><Icon name="check" size={17}/> Keep uncertain details visible for review</li><li><Icon name="check" size={17}/> Confirm matches without counting cash twice</li></ul><Link href="/demo" className={s.textLink}>Explore document review <Icon name="arrow" size={17}/></Link></div>
          </section>
          <section className={s.featureSection} id="assistant" aria-labelledby="assistant-title">
            <div className={s.featureCopy}><p className={s.eyebrow}>A little help with the books</p><h2 id="assistant-title">Ask a question.<br/>Find the context.</h2><p>Ask Raqam about recorded cash activity and items waiting for review. Follow the references back to your records.</p><p className={s.quietNote}>The assistant reads your workspace. Changes stay in your hands.</p><Link href="/demo" className={s.textLink}>Meet your bookkeeping assistant <Icon name="arrow" size={17}/></Link></div>
            <div className={s.chatVisual}><div className={s.visualTop}><Mark size={22}/><span>Ask Raqam</span><span className={s.exampleLabel}>Sample answer</span></div><div className={s.userQuestion}>What needs my attention?</div><div className={s.sampleAnswer}><span className={s.assistantMark}><Mark/> raqam</span><p>Two example records are waiting for category review. Start with the Northstar Cloud subscription.</p><div className={s.answerSource}><Icon name="file" size={18}/><div><strong>Northstar Cloud</strong><span>8 Oct 2026 · PKR 8,500.00</span></div><span className={s.pending}>Needs review</span></div></div><p className={s.visualFoot}>Illustrative response using synthetic records. No live AI.</p></div>
          </section>
          <section className={s.principles} aria-label="Your records, handled with care"><div><Icon name="book" size={22}/><h3>Numbers with a foundation</h3><p>Cash totals are calculated in code, in exact paisa.</p></div><div><Icon name="review" size={22}/><h3>You keep the final say</h3><p>Suggestions and reviewed decisions stay distinct.</p></div><div><Icon name="file" size={22}/><h3>Context stays connected</h3><p>Original sources and review history stay available.</p></div></section>
          <section className={s.faqSection} id="faq" aria-labelledby="faq-title"><div><p className={s.eyebrow}>Good to know</p><h2 id="faq-title">A few things<br/>you might be wondering.</h2><p className={s.faqIntro}>A clearer start to your cashbook.</p></div><div className={s.faqList}>{questions.map(([question,answer])=><details className={s.faqItem} key={question}><summary>{question}<span className={s.faqPlus} aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
          <section className={s.finalCta}><div className={s.ctaMark}><Mark/></div><h2>Make room for<br/>the work you love.</h2><p>Your records, receipts and next steps.<br/>A little more together.</p><div className={s.heroActions}><Link href="/workspace" className={s.lightButton}>Open workspace <Icon name="arrow" size={17}/></Link><Link href="/demo" className={s.darkButton}>Explore an example</Link></div></section>
          <footer className={s.footer}><div><Link href="/" className={s.brand} aria-label="Raqam home"><Logo/></Link><p>Clearer books. A calmer business.</p></div><nav aria-label="Footer navigation"><a href="#workflow">How it works</a><Link href="/demo">Example workspace</Link><Link href="/workspace">Your workspace</Link><a href="#faq">FAQs</a></nav><div className={s.footerBottom}><span>© 2026 Raqam · Built by edge runners</span><span>English · PKR</span></div></footer>
        </div>
      </main>
    </div>
  </div>;
}
