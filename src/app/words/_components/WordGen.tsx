'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

type Category = 'noun' | 'adjective' | 'verb' | 'any';
type WordBank = { noun: string[]; adjective: string[]; verb: string[] };
type Count = 1 | 2 | 3;

const FAVS_KEY = 'casi-wordgen-favs';
const MAX_FAVS = 50;

function loadFavs(): string[] {
  try {
    const f = JSON.parse(localStorage.getItem(FAVS_KEY) ?? '[]');
    return Array.isArray(f)
      ? f.filter((x): x is string => typeof x === 'string').slice(0, MAX_FAVS)
      : [];
  } catch { return []; }
}

let cached: WordBank | null = null;

async function loadWords(): Promise<WordBank> {
  if (cached) return cached;
  const res = await fetch('/words.json');
  cached = await res.json() as WordBank;
  return cached;
}

const CAT_LABELS: Record<Category, string> = {
  noun: 'nouns',
  adjective: 'adjectives',
  verb: 'verbs',
  any: 'any',
};

function pickWords(bank: WordBank, cat: Category, n: number): string[] {
  const pool =
    cat === 'any'
      ? [...bank.noun, ...bank.adjective, ...bank.verb]
      : bank[cat];
  const out: string[] = [];
  while (out.length < n) {
    const w = pool[0 | Math.random() * pool.length];
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export default function WordGen() {
  const [bank, setBank] = useState<WordBank | null>(null);
  const [cat, setCat] = useState<Category>('any');
  const [count, setCount] = useState<Count>(1);
  const [words, setWords] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [animKey, setAnimKey] = useState(0);
  const [favs, setFavs] = useState<string[]>([]);
  const [favsOpen, setFavsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const initialized = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadWords().then(b => {
      setFavs(loadFavs());
      setBank(b);
      setLoading(false);
      const first = pickWords(b, 'any', 1);
      setWords(first);
      setHistory(first);
    });
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const roll = useCallback((b: WordBank, c: Category, n: Count) => {
    const next = pickWords(b, c, n);
    setWords(next);
    setHistory(prev => [...next, ...prev.slice(0, 24)]);
    setAnimKey(k => k + 1);
  }, []);

  const generate = useCallback(() => {
    if (!bank) return;
    roll(bank, cat, count);
  }, [bank, cat, count, roll]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      const t = e.target as HTMLElement | null;
      if (t?.closest('button, a, input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      generate();
    }
  }, [generate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const changeCategory = (next: Category) => {
    setCat(next);
    if (bank) roll(bank, next, count);
  };

  const changeCount = (next: Count) => {
    setCount(next);
    if (bank) roll(bank, cat, next);
  };

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1500);
  }, []);

  const copyWord = useCallback((w: string) => {
    if (!navigator.clipboard) { flash('Copy not supported'); return; }
    navigator.clipboard.writeText(w).then(() => flash('Copied!'), () => flash('Copy failed'));
  }, [flash]);

  const toggleFav = useCallback((w: string) => {
    setFavs(prev => {
      const next = prev.includes(w)
        ? prev.filter(x => x !== w)
        : [w, ...prev].slice(0, MAX_FAVS);
      try { localStorage.setItem(FAVS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  const total = bank ? bank.noun.length + bank.adjective.length + bank.verb.length : 0;

  return (
    <div className="wg">
      <header className="hdr">
        <Link href="/" className="brand">casi<span className="dot">.</span></Link>
        <span className="tag">word generator</span>
        <button
          className={`fav-toggle${favsOpen ? ' open' : ''}`}
          onClick={() => setFavsOpen(o => !o)}
          aria-expanded={favsOpen}
        >
          <StarIcon filled={favs.length > 0} />
          saved{favs.length > 0 && ` (${favs.length})`}
        </button>
      </header>

      {favsOpen && (
        <aside className="favpanel" aria-label="Saved words">
          <div className="favhead">
            <span>Saved words</span>
            <button className="fp-close" onClick={() => setFavsOpen(false)} aria-label="Close saved words">✕</button>
          </div>
          {favs.length === 0 ? (
            <p className="fav-empty">Tap the star next to a word to save it here. Up to {MAX_FAVS} words, kept on this device.</p>
          ) : (
            <ul className="favlist">
              {favs.map(w => (
                <li key={w}>
                  <span className="fw">{w}</span>
                  <button className="fp-act" onClick={() => copyWord(w)} aria-label={`Copy ${w}`}><CopyIcon /></button>
                  <button className="fp-act" onClick={() => toggleFav(w)} aria-label={`Remove ${w} from saved words`}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      <main className="stage">
        {/* category pills */}
        <div className="cats" role="group" aria-label="Word category">
          {(['any', 'noun', 'adjective', 'verb'] as Category[]).map(c => (
            <button
              key={c}
              className={`cat-btn${cat === c ? ' active' : ''}`}
              onClick={() => changeCategory(c)}
            >
              {CAT_LABELS[c]}
            </button>
          ))}
        </div>

        {/* words-per-generate stepper */}
        <div className="counts" role="group" aria-label="Words per generate">
          {([1, 2, 3] as Count[]).map(n => (
            <button
              key={n}
              className={`cnt-btn${count === n ? ' active' : ''}`}
              onClick={() => changeCount(n)}
            >
              {n} word{n > 1 ? 's' : ''}
            </button>
          ))}
        </div>

        {/* word display */}
        <div className="word-wrap">
          <div className="glow" aria-hidden />
          {loading ? (
            <span className="loading">loading…</span>
          ) : (
            <div className="words" key={animKey} aria-live="polite" aria-atomic="true">
              {words.map((w, i) => (
                <span key={`${w}-${i}`} className="wline" style={{ animationDelay: `${i * 70}ms` }}>
                  <button
                    className={`word${words.length > 1 ? ' multi' : ''}`}
                    onClick={() => copyWord(w)}
                    title="Copy to clipboard"
                  >
                    {w}
                  </button>
                  <button
                    className={`fav-btn${favs.includes(w) ? ' on' : ''}`}
                    onClick={() => toggleFav(w)}
                    aria-pressed={favs.includes(w)}
                    aria-label={favs.includes(w) ? `Remove ${w} from saved words` : `Save ${w}`}
                  >
                    <StarIcon filled={favs.includes(w)} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* generate button */}
        <button
          className="gen-btn"
          onClick={generate}
          disabled={loading}
          aria-label="Generate next word (or press Space)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
          generate
          <span className="hint">space</span>
        </button>

        {bank && <div className="bank-n">{total.toLocaleString('en-US')} words</div>}

        {/* history */}
        {history.length > words.length && (
          <div className="hist" aria-label="Recent words">
            {history.slice(words.length, words.length + 7).map((w, i) => (
              <span key={`${w}-${i}`} className="hist-word" style={{ opacity: 1 - (i + 1) * 0.12 }}>
                {w}
              </span>
            ))}
          </div>
        )}
      </main>

      {/* ── SEO content layer ── */}
      <section className="info">
        <h1>Free random word generator — 55,000+ nouns, adjectives and verbs</h1>
        <p>
          Hit generate (or press Space) and get a random word instantly. Filter by nouns,
          adjectives, or verbs, pull up to three words at once, copy any word with a tap,
          and star the ones you want to keep. No ads, no sign-up — just words.
        </p>
        <details>
          <summary>What is this tool for?</summary>
          <p>
            Random words break creative deadlock. Rappers use them as freestyle prompts —
            one word per bar keeps you off your stock rhymes. Writers use them to escape
            a blank page: a random noun plus adjective is an instant story seed. Teams use
            them in brainstorms to force lateral connections a normal discussion never reaches.
          </p>
        </details>
        <details>
          <summary>Tips for rap, writing, and brainstorming</summary>
          <ul>
            <li><strong>Freestyle practice:</strong> generate one word, finish your current bar with it, generate again. Speed up as you improve.</li>
            <li><strong>Two-word mode:</strong> force both words into the same four bars — great for building flexible vocabulary.</li>
            <li><strong>Writing prompts:</strong> pull an adjective + noun pair and write the first paragraph it suggests, no editing.</li>
            <li><strong>Brainstorming:</strong> generate a random word and ask &quot;how does our problem relate to this?&quot; — forced association beats staring at a whiteboard.</li>
            <li><strong>Save the keepers:</strong> star words you want to come back to; they stay on your device between visits.</li>
          </ul>
        </details>
        <details>
          <summary>Frequently asked questions</summary>
          <p><strong>Can I use these words commercially?</strong> Yes. They are ordinary
            dictionary words — nobody owns them. Anything you write with them is entirely yours.</p>
          <p><strong>How many words are in the list?</strong> Around 55,000 English words
            across nouns, adjectives, and verbs. The exact count is shown under the
            generate button once the list loads.</p>
          <p><strong>What categories are available?</strong> Nouns, adjectives, and verbs —
            or &quot;any&quot;, which draws from all three at once. You can also generate
            1, 2, or 3 words per tap.</p>
        </details>
      </section>

      <footer className="foot">
        <span>for rap, writing, and brainstorming</span>
        <Link href="/" className="foot-link">casi.gg</Link>
        <Link href="/solitaire" className="foot-link">solitaire</Link>
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}

      <style jsx>{`
        :global(body) { background: #0c0d11; }

        .wg {
          --ink: #0dcfb0;
          --paper: #0c0d11;
          --H: var(--font-casi-display, 'Bricolage Grotesque', system-ui, sans-serif);
          --M: var(--font-casi-mono, 'JetBrains Mono', ui-monospace, monospace);

          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          background: var(--paper);
          color: #f3f5f4;
          font-family: var(--H);
        }

        .hdr {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 18px 28px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        .brand {
          font-family: var(--H);
          font-weight: 800;
          font-size: 22px;
          letter-spacing: -0.03em;
          color: #f3f5f4;
          text-decoration: none;
        }
        .brand .dot { color: var(--ink); }
        .tag {
          font-family: var(--M);
          font-size: 10px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          padding: 3px 8px;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 99px;
        }
        .fav-toggle {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-family: var(--M);
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          background: transparent;
          color: rgba(255,255,255,0.5);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 99px;
          padding: 6px 12px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .fav-toggle:hover, .fav-toggle.open {
          color: var(--ink);
          border-color: color-mix(in srgb, var(--ink) 50%, transparent);
        }
        .fav-toggle :global(svg) { width: 13px; height: 13px; }

        .favpanel {
          position: fixed;
          top: 66px;
          right: 16px;
          z-index: 40;
          width: min(320px, calc(100vw - 32px));
          max-height: 60vh;
          overflow-y: auto;
          background: color-mix(in srgb, var(--paper) 88%, white 5%);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 14px;
          padding: 14px 16px;
          box-shadow: 0 18px 44px rgba(0,0,0,0.5);
        }
        .favhead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-family: var(--M);
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
          margin-bottom: 8px;
        }
        .fp-close {
          background: none;
          border: none;
          color: rgba(255,255,255,0.45);
          font-size: 13px;
          cursor: pointer;
          padding: 2px 4px;
        }
        .fp-close:hover { color: #f3f5f4; }
        .fav-empty {
          font-size: 13px;
          line-height: 1.5;
          color: rgba(255,255,255,0.4);
          margin: 6px 0;
        }
        .favlist {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .favlist li {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .favlist li:first-child { border-top: none; }
        .fw {
          flex: 1;
          font-weight: 600;
          font-size: 15px;
          letter-spacing: -0.01em;
          overflow-wrap: anywhere;
        }
        .fp-act {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.55);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 7px;
          font-size: 11px;
          cursor: pointer;
        }
        .fp-act:hover { color: var(--ink); border-color: color-mix(in srgb, var(--ink) 45%, transparent); }
        .fp-act :global(svg) { width: 12px; height: 12px; }

        .stage {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          gap: 20px;
        }

        .cats {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .cat-btn {
          font-family: var(--M);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          background: transparent;
          color: rgba(255,255,255,0.4);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 99px;
          padding: 6px 14px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .cat-btn:hover { color: rgba(255,255,255,0.75); border-color: rgba(255,255,255,0.3); }
        .cat-btn.active {
          color: #0c0d11;
          background: var(--ink);
          border-color: var(--ink);
        }

        .counts {
          display: flex;
          gap: 6px;
        }
        .cnt-btn {
          font-family: var(--M);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          background: transparent;
          color: rgba(255,255,255,0.35);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 99px;
          padding: 4px 11px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .cnt-btn:hover { color: rgba(255,255,255,0.7); border-color: rgba(255,255,255,0.25); }
        .cnt-btn.active {
          color: var(--ink);
          border-color: color-mix(in srgb, var(--ink) 55%, transparent);
          background: color-mix(in srgb, var(--ink) 10%, transparent);
        }

        .word-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 140px;
          text-align: center;
          padding: 0 16px;
        }
        .glow {
          position: absolute;
          inset: -60px -120px;
          background: radial-gradient(closest-side,
            color-mix(in srgb, var(--ink) 11%, transparent), transparent 72%);
          pointer-events: none;
        }

        .words {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .wline {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          animation: pop 0.3s cubic-bezier(0.2, 0.9, 0.25, 1.3) both;
        }
        @keyframes pop {
          from { opacity: 0; transform: translateY(24px) scale(0.88); }
          to   { opacity: 1; transform: none; }
        }
        .word {
          font-family: var(--H);
          font-weight: 800;
          font-size: clamp(52px, 14vw, 120px);
          letter-spacing: -0.04em;
          line-height: 1.05;
          color: #f3f5f4;
          text-shadow: 0 0 60px color-mix(in srgb, var(--ink) 30%, transparent);
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          transition: color 0.15s;
          overflow-wrap: anywhere;
        }
        .word:hover { color: color-mix(in srgb, var(--ink) 30%, #f3f5f4); }
        .word.multi { font-size: clamp(34px, 9vw, 76px); }
        .fav-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: rgba(255,255,255,0.28);
          cursor: pointer;
          padding: 4px;
          transition: color 0.15s, transform 0.12s;
        }
        .fav-btn:hover { color: rgba(255,255,255,0.65); transform: scale(1.12); }
        .fav-btn.on { color: var(--ink); }
        .fav-btn :global(svg) { width: 20px; height: 20px; }

        .loading {
          font-family: var(--M);
          font-size: 14px;
          letter-spacing: 0.2em;
          color: rgba(255,255,255,0.25);
          text-transform: uppercase;
        }

        .gen-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--H);
          font-weight: 700;
          font-size: 17px;
          letter-spacing: -0.01em;
          background: var(--ink);
          color: #0c0d11;
          border: none;
          border-radius: 999px;
          padding: 14px 28px;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.12s;
        }
        .gen-btn:hover { opacity: 0.88; }
        .gen-btn:active { transform: scale(0.97); }
        .gen-btn:disabled { opacity: 0.4; cursor: default; }
        .gen-btn svg { width: 18px; height: 18px; }
        .hint {
          font-family: var(--M);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          opacity: 0.6;
          border: 1px solid rgba(12,13,17,0.35);
          border-radius: 4px;
          padding: 2px 5px;
          margin-left: 2px;
        }
        @media (hover: none) { .hint { display: none; } }

        .bank-n {
          font-family: var(--M);
          font-size: 10.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.25);
        }

        .hist {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 14px;
          justify-content: center;
          max-width: 600px;
        }
        .hist-word {
          font-family: var(--H);
          font-weight: 600;
          font-size: 15px;
          color: rgba(243,245,244,0.55);
          letter-spacing: -0.01em;
        }

        .toast {
          position: fixed;
          bottom: 28px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 60;
          font-family: var(--M);
          font-size: 12px;
          letter-spacing: 0.08em;
          background: color-mix(in srgb, var(--paper) 78%, white 9%);
          color: #f3f5f4;
          border: 1px solid color-mix(in srgb, var(--ink) 40%, transparent);
          border-radius: 99px;
          padding: 9px 18px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.45);
          animation: toastIn 0.18s ease-out;
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }

        .info {
          max-width: 660px;
          margin: 24px auto 0;
          padding: 0 24px 30px;
          color: rgba(243,245,244,0.6);
          font-size: 14.5px;
          line-height: 1.65;
        }
        .info h1 {
          font-family: var(--H);
          font-weight: 800;
          font-size: 19px;
          letter-spacing: -0.02em;
          color: rgba(243,245,244,0.85);
          margin: 0 0 10px;
        }
        .info details {
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 12px 0;
        }
        .info summary {
          font-family: var(--H);
          font-weight: 700;
          font-size: 14.5px;
          color: rgba(243,245,244,0.78);
          cursor: pointer;
        }
        .info ul { padding-left: 20px; margin: 10px 0; }
        .info li { margin: 5px 0; }
        .info p { margin: 10px 0; }
        .info strong { color: rgba(243,245,244,0.85); }

        .foot {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 18px;
          padding: 16px;
          font-family: var(--M);
          font-size: 11px;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.22);
          border-top: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .foot-link { color: color-mix(in srgb, var(--ink) 55%, transparent); text-decoration: none; }
        .foot-link:hover { color: var(--ink); }

        @media (prefers-reduced-motion: reduce) {
          .wline, .toast { animation: none; }
        }
      `}</style>
    </div>
  );
}
