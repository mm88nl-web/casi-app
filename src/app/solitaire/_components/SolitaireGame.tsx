'use client';
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  type Card, type G, type Sel, type Dst, type Area,
  SUITS, SYM, lbl, isRed,
  freshGame, getMoving, tryMove, drawStock,
  canFound, canTab, allFaceUp, findAutoMove, findHint,
} from './gameLogic';

// ─── persistence ──────────────────────────────────────────────────────────────
const STATS_KEY = 'casi-solitaire-stats';
const DRAW_KEY = 'casi-solitaire-draw';

interface Stats {
  played: number; won: number; streak: number;
  bestStreak: number; bestTime: number | null; totalMoves: number;
}
const DEF_STATS: Stats = { played: 0, won: 0, streak: 0, bestStreak: 0, bestTime: null, totalMoves: 0 };

function loadStats(): Stats {
  try { return { ...DEF_STATS, ...JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}') }; }
  catch { return DEF_STATS; }
}

// Skins mirror src/lib/skins.ts ink/paper pairs (subset that reads well on cards)
const SKINS: Record<string, { ink: string; paper: string }> = {
  'casi-dark': { ink: '#0DCFB0', paper: '#0C0D11' },
  twitch: { ink: '#9146FF', paper: '#0E0E1A' },
  kick: { ink: '#53FC18', paper: '#0A1A0A' },
  youtube: { ink: '#FF0000', paper: '#0D0606' },
  cyber: { ink: '#06B6D4', paper: '#050A12' },
  mono: { ink: '#E8E8E8', paper: '#0A0A0A' },
  rose: { ink: '#F472B6', paper: '#0A0515' },
};

const parseDrop = (key: string): Dst | null => {
  const m = /^([tf])-(\d)$/.exec(key);
  return m ? { area: m[1] === 't' ? 'tableau' : 'foundation', col: +m[2] } : null;
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ─── keyboard pile navigation ─────────────────────────────────────────────────
type KbArea = 'stock' | 'waste' | 'foundation' | 'tableau';
interface KbPos { area: KbArea; col: number; idx: number; }

// Top-row order for Left/Right: stock, waste, then the four foundations
const topAt = (i: number): KbPos =>
  i === 0 ? { area: 'stock', col: 0, idx: 0 }
    : i === 1 ? { area: 'waste', col: 0, idx: 0 }
      : { area: 'foundation', col: i - 2, idx: 0 };
const topIndexOf = (p: KbPos) =>
  p.area === 'stock' ? 0 : p.area === 'waste' ? 1 : 2 + p.col;
// Grid columns: stock=0, waste=1, spacer=2, foundations=3..6
const topGridCol = (p: KbPos) =>
  p.area === 'stock' ? 0 : p.area === 'waste' ? 1 : 3 + p.col;
const topFromGridCol = (c: number): KbPos =>
  c <= 0 ? topAt(0) : c <= 2 ? topAt(1) : topAt(c - 1);

const cardName = (c: Card) => `${lbl(c.value)} of ${SYM[c.suit]}`;

function describePos(g: G, p: KbPos): string {
  if (p.area === 'stock') {
    return g.stock.length ? `Stock, ${g.stock.length} cards` : 'Empty stock — recycles the waste pile';
  }
  if (p.area === 'waste') {
    const c = g.waste[g.waste.length - 1];
    return c ? `Waste, ${cardName(c)}` : 'Empty waste pile';
  }
  if (p.area === 'foundation') {
    const pile = g.found[p.col];
    const c = pile[pile.length - 1];
    return c ? `Foundation ${p.col + 1}, ${cardName(c)}` : `Empty foundation ${p.col + 1}`;
  }
  const col = g.tab[p.col];
  if (!col.length) return `Empty column ${p.col + 1}`;
  const idx = Math.min(p.idx, col.length - 1);
  const c = col[idx];
  return c.faceUp
    ? `${cardName(c)}, column ${p.col + 1}, card ${idx + 1} of ${col.length}`
    : `Face-down card, column ${p.col + 1}`;
}

// ─── presentational card pieces ───────────────────────────────────────────────
function CardFace({ card, selected, flip }: { card: Card; selected: boolean; flip: boolean }) {
  return (
    <div
      className={`card cface${selected ? ' csel' : ''}${flip ? ' flipin' : ''}`}
      style={{ color: isRed(card.suit) ? '#c0392b' : '#1a1c2c' }}
      aria-label={`${lbl(card.value)} of ${SYM[card.suit]}${selected ? ', selected' : ''}`}
    >
      <span className="ctop">{lbl(card.value)}<br />{SYM[card.suit]}</span>
      <span className="cmid" aria-hidden>{SYM[card.suit]}</span>
      <span className="cbot">{lbl(card.value)}<br />{SYM[card.suit]}</span>
    </div>
  );
}
const CardBack = () => <div className="card cback" aria-hidden />;

// ─── main component ───────────────────────────────────────────────────────────
type Phase = 'play' | 'cascade' | 'modal';

interface DragState {
  pid: number; sel: Sel; ids: string[];
  startX: number; startY: number; active: boolean;
  ghost: HTMLDivElement | null; srcEls: HTMLElement[];
  grabX: number; grabY: number; lastHi: Element | null;
}

export default function SolitaireGame() {
  const [drawMode, setDrawMode] = useState<1 | 3>(1);
  const [g, setG] = useState<G>(() => freshGame(1));
  const [sel, setSel] = useState<Sel | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [kb, setKb] = useState<KbPos | null>(null);
  const [flipIds, setFlipIds] = useState<Set<string>>(() => new Set());
  const [hint, setHint] = useState<{ ids: string[]; dstKey: string | null } | null>(null);
  const [phase, setPhase] = useState<Phase>('play');
  const [stats, setStats] = useState<Stats>(DEF_STATS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skin, setSkin] = useState(SKINS['casi-dark']);
  const [autoOn, setAutoOn] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [metrics, setMetrics] = useState({ cw: 0, availH: 0 });
  const [dealKey, setDealKey] = useState(0);

  const solRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const tabRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  const historyRef = useRef<G[]>([]);
  const futureRef = useRef<G[]>([]);
  const kbRef = useRef(kb); kbRef.current = kb;
  const dragRef = useRef<DragState | null>(null);
  const lastTapRef = useRef<{ id: string; t: number } | null>(null);
  const gRef = useRef(g); gRef.current = g;
  const selRef = useRef(sel); selRef.current = sel;
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const autoRef = useRef(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebratedRef = useRef(false);
  const countedRef = useRef(false);
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useRef(false);

  const started = g.moves > 0;
  const dealing = !started && undoCount === 0;

  // ── client-only init: stats, draw mode, skin param, reduced motion ──
  useEffect(() => {
    setStats(loadStats());
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const d = localStorage.getItem(DRAW_KEY);
    if (d === '3') { setDrawMode(3); setG(freshGame(3)); }
    const k = new URLSearchParams(window.location.search).get('skin');
    if (k && SKINS[k]) setSkin(SKINS[k]);
  }, []);

  const updateStats = useCallback((fn: (s: Stats) => Stats) => {
    setStats(s => {
      const n = fn(s);
      try { localStorage.setItem(STATS_KEY, JSON.stringify(n)); } catch { /* private mode */ }
      return n;
    });
  }, []);

  // ── responsive metrics: card width + space below the tableau top ──
  const measure = useCallback(() => {
    const pile = solRef.current?.querySelector('.pile') as HTMLElement | null;
    const tr = tabRef.current;
    if (!pile || !tr) return;
    const cw = pile.offsetWidth;
    const absTop = tr.getBoundingClientRect().top + window.scrollY;
    const availH = window.innerHeight - absTop - 14;
    setMetrics(m =>
      Math.abs(m.cw - cw) > 0.5 || Math.abs(m.availH - availH) > 0.5 ? { cw, availH } : m
    );
  }, []);
  useLayoutEffect(measure);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // ── FLIP: animate any card whose on-screen position changed ──
  useLayoutEffect(() => {
    const refs = cardRefs.current;
    const prev = prevRects.current;
    const next = new Map<string, DOMRect>();
    refs.forEach((el, id) => {
      if (!el.isConnected) { refs.delete(id); return; }
      next.set(id, el.getBoundingClientRect());
    });
    if (!reducedMotion.current) {
      next.forEach((rect, id) => {
        const p = prev.get(id);
        if (!p) return;
        const dx = p.left - rect.left, dy = p.top - rect.top;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        const el = refs.get(id)!;
        el.style.zIndex = '60';
        const anim = el.animate(
          [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }],
          { duration: 230, easing: 'cubic-bezier(.25,.9,.3,1)' }
        );
        anim.onfinish = () => { el.style.zIndex = ''; };
      });
    }
    prevRects.current = next;
  });

  // ── timer ──
  useEffect(() => {
    if (!started || g.won || phase !== 'play') return;
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [started, g.won, phase]);

  // ── core state transition: history push + flip detection ──
  const commit = useCallback((next: G | null, mSel?: Sel, mDst?: Dst): boolean => {
    if (!next) return false;
    const cur = gRef.current;
    if (cur.moves === 0 && !countedRef.current) {
      countedRef.current = true;
      updateStats(s => ({ ...s, played: s.played + 1 }));
    }
    if (mSel && mDst) {
      const moving = getMoving(cur, mSel);
      if (moving?.length) {
        const name = cardName(moving[0]);
        const extra = moving.length > 1 ? ` and ${moving.length - 1} more` : '';
        if (mDst.area === 'foundation') {
          setAnnounce(`${name} placed on foundation.`);
        } else {
          const t = cur.tab[mDst.col][cur.tab[mDst.col].length - 1];
          setAnnounce(t
            ? `${name}${extra} moved to ${cardName(t)}, column ${mDst.col + 1}.`
            : `${name}${extra} moved to empty column ${mDst.col + 1}.`);
        }
      }
    }
    const prevUp = new Map<string, boolean>();
    [...cur.tab.flat(), ...cur.waste, ...cur.stock].forEach(c => prevUp.set(c.id, c.faceUp));
    const flipped: string[] = [];
    [...next.tab.flat(), ...next.waste].forEach(c => {
      if (c.faceUp && prevUp.get(c.id) === false) flipped.push(c.id);
    });
    if (flipped.length) {
      setFlipIds(new Set(flipped));
      if (flipTimer.current) clearTimeout(flipTimer.current);
      flipTimer.current = setTimeout(() => setFlipIds(new Set()), 450);
    }
    historyRef.current = [...historyRef.current.slice(-49), cur];
    setUndoCount(historyRef.current.length);
    futureRef.current = [];
    setRedoCount(0);
    setG(next);
    setSel(null);
    setHint(null);
    return true;
  }, [updateStats]);

  const undo = useCallback(() => {
    if (autoRef.current || phaseRef.current !== 'play') return;
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current = [...futureRef.current.slice(-49), gRef.current];
    setRedoCount(futureRef.current.length);
    setUndoCount(historyRef.current.length);
    setG(prev);
    setSel(null);
    setHint(null);
    setAnnounce('Move undone.');
  }, []);

  const redo = useCallback(() => {
    if (autoRef.current || phaseRef.current !== 'play') return;
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current = [...historyRef.current.slice(-49), gRef.current];
    setUndoCount(historyRef.current.length);
    setRedoCount(futureRef.current.length);
    setG(next);
    setSel(null);
    setHint(null);
    setAnnounce('Move redone.');
  }, []);

  const stopAuto = useCallback(() => {
    autoRef.current = false;
    setAutoOn(false);
    if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; }
  }, []);

  const restart = useCallback((draw?: 1 | 3) => {
    const d = draw ?? gRef.current.draw;
    if (gRef.current.moves > 0 && !gRef.current.won) {
      updateStats(s => ({ ...s, streak: 0 }));
    }
    stopAuto();
    prevRects.current = new Map();
    historyRef.current = [];
    futureRef.current = [];
    celebratedRef.current = false;
    countedRef.current = false;
    setUndoCount(0);
    setRedoCount(0);
    setG(freshGame(d));
    setSel(null);
    setHint(null);
    setFlipIds(new Set());
    setElapsed(0);
    setPhase('play');
    setDealKey(k => k + 1);
  }, [stopAuto, updateStats]);

  const changeDraw = useCallback((d: 1 | 3) => {
    setDrawMode(d);
    try { localStorage.setItem(DRAW_KEY, String(d)); } catch { /* ignore */ }
    setSettingsOpen(false);
    restart(d);
  }, [restart]);

  // ── win: stats + cascade ──
  useEffect(() => {
    if (!g.won || celebratedRef.current) return;
    celebratedRef.current = true;
    stopAuto();
    const time = elapsed;
    updateStats(s => {
      const streak = s.streak + 1;
      return {
        played: s.played,
        won: s.won + 1,
        streak,
        bestStreak: Math.max(s.bestStreak, streak),
        bestTime: s.bestTime === null ? time : Math.min(s.bestTime, time),
        totalMoves: s.totalMoves + g.moves,
      };
    });
    setAnnounce(`You won in ${g.moves} moves and ${fmt(time)}.`);
    setPhase(reducedMotion.current ? 'modal' : 'cascade');
  }, [g.won, g.moves, elapsed, stopAuto, updateStats]);

  // ── win cascade: classic bouncing cards, rAF physics on a body-level layer ──
  useEffect(() => {
    if (phase !== 'cascade') return;
    const sol = solRef.current;
    const layer = document.createElement('div');
    layer.className = 'casc-layer';
    document.body.appendChild(layer);

    const H = sol ? getComputedStyle(sol).getPropertyValue('--H') : 'sans-serif';
    const rects = [0, 1, 2, 3].map(i =>
      document.querySelector(`[data-drop="f-${i}"]`)?.getBoundingClientRect() ?? null
    );
    const cw = rects.find(Boolean)?.width ?? 64;
    const ch = cw * 1.4;

    const queue: { card: Card; x: number; y: number }[] = [];
    for (let layerIdx = 12; layerIdx >= 0; layerIdx--) {
      for (let p = 0; p < 4; p++) {
        const card = gRef.current.found[p][layerIdx];
        const r = rects[p];
        if (card && r) queue.push({ card, x: r.left, y: r.top });
      }
    }

    type Part = { el: HTMLElement; x: number; y: number; vx: number; vy: number; dead: boolean };
    const parts: Part[] = [];
    let spawned = 0;
    const spawnIv = setInterval(() => {
      if (spawned >= queue.length) { clearInterval(spawnIv); return; }
      const q = queue[spawned++];
      const el = document.createElement('div');
      el.className = 'card cface';
      el.style.cssText =
        `position:absolute;left:0;top:0;width:${cw}px;height:${ch}px;` +
        `color:${isRed(q.card.suit) ? '#c0392b' : '#1a1c2c'};--cw:${cw}px;--H:${H};will-change:transform;`;
      el.innerHTML =
        `<span class="ctop">${lbl(q.card.value)}<br>${SYM[q.card.suit]}</span>` +
        `<span class="cmid">${SYM[q.card.suit]}</span>` +
        `<span class="cbot">${lbl(q.card.value)}<br>${SYM[q.card.suit]}</span>`;
      layer.appendChild(el);
      parts.push({
        el, x: q.x, y: q.y,
        vx: (Math.random() * 5 + 2.5) * (Math.random() < 0.5 ? -1 : 1),
        vy: -(Math.random() * 7 + 1),
        dead: false,
      });
    }, 70);

    let raf = 0;
    const tick = () => {
      const floor = window.innerHeight - ch;
      parts.forEach(p => {
        if (p.dead) return;
        p.vy += 0.5; p.x += p.vx; p.y += p.vy;
        if (p.y > floor) { p.y = floor; p.vy *= -0.72; }
        if (p.x < -cw * 2 || p.x > window.innerWidth + cw) { p.dead = true; p.el.remove(); return; }
        p.el.style.transform = `translate(${p.x}px,${p.y}px)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const done = setTimeout(() => setPhase('modal'), 6500);
    const skip = () => setPhase('modal');
    layer.addEventListener('pointerdown', skip);

    return () => {
      clearInterval(spawnIv);
      cancelAnimationFrame(raf);
      clearTimeout(done);
      layer.remove();
    };
  }, [phase]);

  // ── stock + empty-pile taps ──
  const onStock = useCallback(() => {
    if (autoRef.current || phaseRef.current !== 'play') return;
    const cur = gRef.current;
    if (!commit(drawStock(cur))) return;
    if (cur.stock.length) {
      const n = Math.min(cur.draw, cur.stock.length);
      setAnnounce(`Drew ${cardName(cur.stock[cur.stock.length - n])}.`);
    } else {
      setAnnounce('Waste pile recycled into stock.');
    }
  }, [commit]);

  const onEmptyTap = useCallback((area: 'tableau' | 'foundation', col: number) => {
    const s = selRef.current;
    if (!s || autoRef.current) return;
    const dst: Dst = { area, col };
    commit(tryMove(gRef.current, s, dst), s, dst);
  }, [commit]);

  // ── tap-to-move (drag fallback) ──
  const handleTap = useCallback((tapSel: Sel, card: Card) => {
    const cur = gRef.current;
    const now = Date.now();
    const lt = lastTapRef.current;
    lastTapRef.current = { id: card.id, t: now };

    // double-tap top card → first fitting foundation
    if (lt && lt.id === card.id && now - lt.t < 350) {
      const isTop = tapSel.area !== 'tableau' || tapSel.idx === cur.tab[tapSel.col].length - 1;
      if (isTop) {
        const fi = cur.found.findIndex(p => canFound(card, p));
        const dst: Dst = { area: 'foundation', col: fi };
        if (fi >= 0 && commit(tryMove(cur, tapSel, dst), tapSel, dst)) {
          lastTapRef.current = null;
          return;
        }
      }
    }

    const s = selRef.current;
    if (s && s.area === tapSel.area && s.col === tapSel.col && s.idx === tapSel.idx) {
      setSel(null);
      return;
    }
    if (s) {
      if (tapSel.area !== 'waste') {
        const dstArea = tapSel.area === 'foundation' ? 'foundation' as const : 'tableau' as const;
        const dst: Dst = { area: dstArea, col: tapSel.col };
        if (commit(tryMove(cur, s, dst), s, dst)) return;
      }
      setSel(getMoving(cur, tapSel) ? tapSel : null);
      return;
    }
    if (getMoving(cur, tapSel)) setSel(tapSel);
  }, [commit]);

  // ── drag and drop (pointer events; tap when under threshold) ──
  const onCardDown = useCallback((e: React.PointerEvent, dSel: Sel) => {
    if (autoRef.current || phaseRef.current !== 'play') return;
    if (!getMoving(gRef.current, dSel)) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const moving = getMoving(gRef.current, dSel)!;
    dragRef.current = {
      pid: e.pointerId, sel: dSel, ids: moving.map(c => c.id),
      startX: e.clientX, startY: e.clientY, active: false,
      ghost: null, srcEls: [], grabX: 0, grabY: 0, lastHi: null,
    };
  }, []);

  const onCardMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId) return;

    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 7) return;
      d.srcEls = d.ids
        .map(id => cardRefs.current.get(id))
        .filter((el): el is HTMLElement => !!el && el.isConnected);
      if (!d.srcEls.length) { dragRef.current = null; return; }
      const r0 = d.srcEls[0].getBoundingClientRect();
      d.grabX = d.startX - r0.left;
      d.grabY = d.startY - r0.top;
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.style.setProperty('--cw', `${r0.width}px`);
      if (solRef.current) {
        ghost.style.setProperty('--H', getComputedStyle(solRef.current).getPropertyValue('--H'));
      }
      d.srcEls.forEach(el => {
        const r = el.getBoundingClientRect();
        const cl = el.cloneNode(true) as HTMLElement;
        cl.classList.remove('csel');
        cl.querySelector('.csel')?.classList.remove('csel');
        cl.style.cssText +=
          `;position:absolute;left:${r.left - r0.left}px;top:${r.top - r0.top}px;` +
          `width:${r.width}px;height:${r.height}px;margin:0;animation:none;`;
        ghost.appendChild(cl);
        el.classList.add('drag-src');
      });
      document.body.appendChild(ghost);
      d.ghost = ghost;
      d.active = true;
      solRef.current?.classList.add('dragging');
    }

    d.ghost!.style.transform = `translate(${e.clientX - d.grabX}px,${e.clientY - d.grabY}px)`;

    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]') ?? null;
    let valid: Element | null = null;
    if (hit) {
      const dst = parseDrop(hit.getAttribute('data-drop')!);
      const cur = gRef.current;
      const moving = getMoving(cur, d.sel);
      if (dst && moving) {
        const ok = dst.area === 'foundation'
          ? moving.length === 1 && canFound(moving[0], cur.found[dst.col])
          : canTab(moving[0], cur.tab[dst.col]);
        if (ok) valid = hit;
      }
    }
    if (d.lastHi && d.lastHi !== valid) d.lastHi.classList.remove('drop-hi');
    if (valid && valid !== d.lastHi) valid.classList.add('drop-hi');
    d.lastHi = valid;
  }, []);

  const endDrag = useCallback((e: React.PointerEvent, tapSel?: Sel, tapCard?: Card) => {
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId) return;
    dragRef.current = null;
    if (d.lastHi) d.lastHi.classList.remove('drop-hi');
    solRef.current?.classList.remove('dragging');

    if (!d.active) {
      if (tapSel && tapCard) handleTap(tapSel, tapCard);
      return;
    }

    const cleanup = () => {
      d.ghost?.remove();
      d.srcEls.forEach(el => el.classList.remove('drag-src'));
    };

    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
    const dst = hit ? parseDrop(hit.getAttribute('data-drop')!) : null;
    const next = dst ? tryMove(gRef.current, d.sel, dst) : null;

    if (next) {
      // FLIP should start from where the ghost was released, not the source pile
      Array.from(d.ghost!.children).forEach((cl, i) => {
        prevRects.current.set(d.ids[i], (cl as HTMLElement).getBoundingClientRect());
      });
      cleanup();
      commit(next, d.sel, dst!);
    } else {
      const ghost = d.ghost!;
      const back = d.srcEls[0].getBoundingClientRect();
      const anim = ghost.animate(
        [{ transform: ghost.style.transform }, { transform: `translate(${back.left}px,${back.top}px)` }],
        { duration: 190, easing: 'cubic-bezier(.3,.8,.4,1)' }
      );
      anim.onfinish = cleanup;
      setTimeout(cleanup, 400); // safety net if the animation is interrupted
    }
  }, [commit, handleTap]);

  const onCardCancel = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId) return;
    dragRef.current = null;
    if (d.lastHi) d.lastHi.classList.remove('drop-hi');
    solRef.current?.classList.remove('dragging');
    d.ghost?.remove();
    d.srcEls.forEach(el => el.classList.remove('drag-src'));
  }, []);

  const bindCard = useCallback((s: Sel, card: Card) => ({
    onPointerDown: (e: React.PointerEvent) => onCardDown(e, s),
    onPointerMove: onCardMove,
    onPointerUp: (e: React.PointerEvent) => endDrag(e, s, card),
    onPointerCancel: onCardCancel,
  }), [onCardDown, onCardMove, endDrag, onCardCancel]);

  // ── arrow-key pile navigation ──
  const kbMove = useCallback((key: string) => {
    const cur = gRef.current;
    const prev = kbRef.current;
    let p: KbPos = prev ?? { area: 'stock', col: 0, idx: 0 };
    if (prev) {
      if (p.area === 'tableau') {
        const col = cur.tab[p.col];
        const idx = Math.min(p.idx, Math.max(col.length - 1, 0));
        if (key === 'ArrowLeft') p = { area: 'tableau', col: (p.col + 6) % 7, idx: Infinity };
        else if (key === 'ArrowRight') p = { area: 'tableau', col: (p.col + 1) % 7, idx: Infinity };
        else if (key === 'ArrowDown') p = { ...p, idx: idx + 1 };
        else if (key === 'ArrowUp') {
          let ni = -1;
          for (let i = idx - 1; i >= 0; i--) if (col[i].faceUp) { ni = i; break; }
          p = ni >= 0 ? { ...p, idx: ni } : topFromGridCol(p.col);
        }
      } else {
        const i = topIndexOf(p);
        if (key === 'ArrowLeft') p = topAt((i + 5) % 6);
        else if (key === 'ArrowRight') p = topAt((i + 1) % 6);
        else if (key === 'ArrowDown') p = { area: 'tableau', col: Math.min(topGridCol(p), 6), idx: Infinity };
      }
    }
    if (p.area === 'tableau') {
      p = { ...p, idx: Math.min(p.idx, Math.max(cur.tab[p.col].length - 1, 0)) };
    }
    setKb(p);
    setAnnounce(describePos(cur, p));
  }, []);

  const kbActivate = useCallback(() => {
    const p = kbRef.current;
    if (!p) return;
    const cur = gRef.current;
    if (p.area === 'stock') { onStock(); return; }
    if (p.area === 'waste') {
      const c = cur.waste[cur.waste.length - 1];
      if (c) handleTap({ area: 'waste', col: 0, idx: cur.waste.length - 1 }, c);
      return;
    }
    if (p.area === 'foundation') {
      const pile = cur.found[p.col];
      if (!pile.length) { onEmptyTap('foundation', p.col); return; }
      handleTap({ area: 'foundation', col: p.col, idx: pile.length - 1 }, pile[pile.length - 1]);
      return;
    }
    const col = cur.tab[p.col];
    if (!col.length) { onEmptyTap('tableau', p.col); return; }
    const idx = Math.min(p.idx, col.length - 1);
    if (col[idx].faceUp) handleTap({ area: 'tableau', col: p.col, idx }, col[idx]);
  }, [onStock, onEmptyTap, handleTap]);

  const onBoardKey = useCallback((e: React.KeyboardEvent) => {
    if (autoRef.current || phaseRef.current !== 'play') return;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      boardRef.current?.focus();
      kbMove(e.key);
    } else if ((e.key === 'Enter' || e.key === ' ') && kbRef.current && e.target === e.currentTarget) {
      e.preventDefault();
      kbActivate();
    } else if (e.key === 'Escape') {
      setKb(null);
      setSel(null);
    }
  }, [kbMove, kbActivate]);

  const onBoardFocus = useCallback((e: React.FocusEvent) => {
    if (e.target !== e.currentTarget || kbRef.current) return;
    // keyboard-initiated focus only — a mouse click on the board shouldn't show the ring
    if (!(e.target as HTMLElement).matches(':focus-visible')) return;
    const p: KbPos = { area: 'stock', col: 0, idx: 0 };
    setKb(p);
    setAnnounce(`${describePos(gRef.current, p)}. Use arrow keys to move between piles.`);
  }, []);

  const onBoardBlur = useCallback((e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKb(null);
  }, []);

  // ── hint ──
  const showHint = useCallback(() => {
    if (autoRef.current || phaseRef.current !== 'play') return;
    const h = findHint(gRef.current);
    if (!h) { setAnnounce('No moves available — try undo or a new game.'); return; }
    setHint(h.kind === 'stock' ? { ids: [], dstKey: 'stock' } : { ids: h.ids, dstKey: h.dstKey });
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2600);
  }, []);

  // ── auto-complete ──
  const autoAvailable =
    phase === 'play' && started && !g.won && !autoOn && allFaceUp(g) &&
    (g.draw === 1 || (g.stock.length === 0 && g.waste.length === 0));

  const startAuto = useCallback(() => {
    if (autoRef.current) return;
    autoRef.current = true;
    setAutoOn(true);
    setSel(null);
    setHint(null);
    historyRef.current = [...historyRef.current.slice(-49), gRef.current];
    setUndoCount(historyRef.current.length);
    futureRef.current = [];
    setRedoCount(0);
    let steps = 0;
    const step = () => {
      const cur = gRef.current;
      if (cur.won || steps++ > 400) { stopAuto(); return; }
      const m = findAutoMove(cur);
      const next = m ? tryMove(cur, m.sel, m.dst) : drawStock(cur);
      if (!next) { stopAuto(); return; }
      setG(next);
      autoTimer.current = setTimeout(step, 120);
    };
    step();
  }, [stopAuto]);

  // ── keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'n') restart();
      else if (k === 'u') undo();
      else if (k === 'h') showHint();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, restart, showHint]);

  // cleanup stray timers on unmount
  useEffect(() => () => {
    stopAuto();
    if (flipTimer.current) clearTimeout(flipTimer.current);
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, [stopAuto]);

  // ── render helpers ──
  const refCb = (id: string) => (el: HTMLElement | null) => {
    if (el) cardRefs.current.set(id, el);
  };

  const isSeld = (area: Area, col: number, idx: number) =>
    !!sel && sel.area === area &&
    (area === 'waste' ? true : sel.col === col && (area === 'foundation' || idx >= sel.idx));

  const hintIds = new Set(hint?.ids ?? []);

  // Per-column fan offsets, compressed so long columns never leave the viewport
  const colOffsets = (col: Card[]) => {
    const { cw, availH } = metrics;
    if (cw <= 0) return null;
    const ch = cw * 1.4;
    const fuo = Math.max(cw * 0.42, 17);
    const fdo = Math.max(cw * 0.16, 7);
    let downs = 0, ups = 0;
    col.forEach((c, i) => { if (i === col.length - 1) return; if (c.faceUp) ups++; else downs++; });
    const sum = downs * fdo + ups * fuo;
    const k = sum > 0 && ch + sum > availH ? Math.max(0.3, (availH - ch) / sum) : 1;
    return { fuo: fuo * k, fdo: fdo * k, ch };
  };

  const wasteFan = g.waste.slice(-Math.min(g.draw === 3 ? 3 : 1, g.waste.length));

  const winIsBest = stats.bestTime !== null && elapsed <= stats.bestTime && g.won;

  return (
    <div
      ref={solRef}
      className="sol"
      style={{ ['--ink' as string]: skin.ink, ['--paper' as string]: skin.paper }}
    >
      <header className="hdr">
        <Link href="/" className="brand">casi<span className="dot">.</span></Link>
        <div className="mid">
          <span className="stat">{g.moves} moves</span>
          <span className="stat">{fmt(elapsed)}</span>
        </div>
        <div className="acts">
          <button className="ibtn" onClick={showHint} title="Hint (H)" aria-label="Show hint">?</button>
          <button className="ibtn" onClick={undo} disabled={undoCount === 0 || autoOn}
            title="Undo (U / Ctrl+Z)" aria-label={`Undo, ${undoCount} available`}>
            ↩{undoCount > 0 && <i className="badge">{undoCount}</i>}
          </button>
          <button className="ibtn" onClick={redo} disabled={redoCount === 0 || autoOn}
            title="Redo (Ctrl+Shift+Z)" aria-label={`Redo, ${redoCount} available`}>
            ↪{redoCount > 0 && <i className="badge">{redoCount}</i>}
          </button>
          <button className="ibtn" onClick={() => setSettingsOpen(true)} title="Stats & settings" aria-label="Stats and settings">⚙</button>
          <button className="btn-new" onClick={() => restart()} title="New game (N)">New</button>
        </div>
      </header>

      <div className="gamewrap">
        <div
          className="board"
          ref={boardRef}
          tabIndex={0}
          role="group"
          aria-label="Solitaire board. Use arrow keys to move between piles, Enter or Space to select and move cards."
          onKeyDown={onBoardKey}
          onFocus={onBoardFocus}
          onBlur={onBoardBlur}
        >
          {/* ── top row: stock · waste · spacer · foundations ── */}
          <div className="row7">
            <div
              className={`pile stock${dealing ? ' deal-fade' : ''}${hint?.dstKey === 'stock' ? ' hint-dst' : ''}${kb?.area === 'stock' ? ' kb-focus' : ''}`}
              onClick={onStock} role="button" tabIndex={0}
              aria-label={g.stock.length ? `Draw from stock, ${g.stock.length} cards left` : 'Recycle waste pile'}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onStock()}
            >
              {g.stock.length ? <CardBack /> : (
                <div className="card cempty"><span className="elbl">↺</span></div>
              )}
              {g.stock.length > 0 && <span className="stock-n">{g.stock.length}</span>}
            </div>

            <div className={`pile waste${kb?.area === 'waste' ? ' kb-focus' : ''}`}>
              {wasteFan.length === 0 ? <div className="card cempty" /> : wasteFan.map((c, i) => {
                const top = i === wasteFan.length - 1;
                const wIdx = g.waste.length - wasteFan.length + i;
                const s: Sel = { area: 'waste', col: 0, idx: wIdx };
                return (
                  <div
                    key={c.id}
                    ref={refCb(c.id)}
                    className={`wfan${hintIds.has(c.id) ? ' hint-pulse' : ''}`}
                    style={{
                      left: `${i * 26}%`, zIndex: i,
                      pointerEvents: top ? 'auto' : 'none',
                      touchAction: 'none',
                    }}
                    {...(top ? bindCard(s, c) : {})}
                  >
                    <CardFace card={c} selected={top && isSeld('waste', 0, wIdx)} flip={flipIds.has(c.id)} />
                  </div>
                );
              })}
            </div>

            <div className="pile spacer" aria-hidden />

            {g.found.map((pile, fi) => {
              const top = pile.length ? pile[pile.length - 1] : null;
              const s: Sel = { area: 'foundation', col: fi, idx: pile.length - 1 };
              return (
                <div
                  key={fi}
                  className={`pile fnd${hint?.dstKey === `f-${fi}` ? ' hint-dst' : ''}${kb?.area === 'foundation' && kb.col === fi ? ' kb-focus' : ''}`}
                  data-drop={`f-${fi}`}
                >
                  {top ? (
                    <div
                      ref={refCb(top.id)}
                      className={hintIds.has(top.id) ? 'hint-pulse' : undefined}
                      style={{ touchAction: 'none' }}
                      {...bindCard(s, top)}
                    >
                      <CardFace card={top} selected={isSeld('foundation', fi, pile.length - 1)} flip={false} />
                    </div>
                  ) : (
                    <div
                      className="card cempty" role="button" tabIndex={0}
                      aria-label={`Empty foundation ${fi + 1}`}
                      onClick={() => onEmptyTap('foundation', fi)}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onEmptyTap('foundation', fi)}
                    >
                      <span className="elbl">{SYM[SUITS[fi]]}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── tableau ── */}
          <div className="row7 tabrow" ref={tabRef}>
            {g.tab.map((col, ci) => {
              const off = colOffsets(col);
              const kbIdx = kb?.area === 'tableau' && kb.col === ci
                ? Math.min(kb.idx, Math.max(col.length - 1, 0))
                : -1;
              return (
                <div
                  key={ci}
                  className={`tabcol${hint?.dstKey === `t-${ci}` ? ' hint-dst' : ''}`}
                  data-drop={`t-${ci}`}
                >
                  {col.length === 0 ? (
                    <div
                      className={`card cempty${kbIdx === 0 ? ' kb-focus' : ''}`} role="button" tabIndex={0}
                      aria-label={`Empty column ${ci + 1}`}
                      onClick={() => onEmptyTap('tableau', ci)}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onEmptyTap('tableau', ci)}
                    />
                  ) : col.map((card, idx) => {
                    const s: Sel = { area: 'tableau', col: ci, idx };
                    const marginTop = idx === 0 ? 0
                      : off
                        ? (col[idx - 1].faceUp ? off.fuo : off.fdo) - off.ch
                        : col[idx - 1].faceUp
                          ? 'calc(var(--cw)*0.42 - var(--ch))'
                          : 'calc(var(--cw)*0.16 - var(--ch))';
                    return (
                      <div
                        key={`${dealKey}:${card.id}`}
                        ref={refCb(card.id)}
                        className={
                          `cardwrap${dealing ? ' deal' : ''}${hintIds.has(card.id) ? ' hint-pulse' : ''}${idx === kbIdx ? ' kb-focus' : ''}`
                        }
                        style={{
                          marginTop, zIndex: idx, position: 'relative',
                          animationDelay: dealing ? `${(idx * 7 + ci) * 24}ms` : undefined,
                          touchAction: 'none',
                        }}
                        {...(card.faceUp ? bindCard(s, card) : {})}
                      >
                        {card.faceUp
                          ? <CardFace card={card} selected={isSeld('tableau', ci, idx)} flip={flipIds.has(card.id)} />
                          : <CardBack />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {autoAvailable && (
          <button className="auto-btn" onClick={startAuto}>
            ✦ Auto-complete
          </button>
        )}
      </div>

      {/* ── SEO content layer ── */}
      <section className="info">
        <h1>Free Klondike Solitaire — no ads, no sign-up</h1>
        <p>
          The classic card game, exactly as you remember it: draw from the stock, build the
          tableau in alternating colors, and move all 52 cards to the foundations. No ads,
          no paywall, no account — just cards.
        </p>
        <details>
          <summary>How to play Klondike Solitaire</summary>
          <p>
            The game deals 28 cards into seven tableau columns; only the last card in each
            column starts face-up. The remaining 24 cards form the stock.
          </p>
          <ul>
            <li><strong>Foundations</strong> (top right) are built up by suit, from ace to king. Filling all four wins the game.</li>
            <li><strong>Tableau columns</strong> are built down in alternating colors — a red six goes on a black seven.</li>
            <li>Moving a face-up sequence off a face-down card flips that card over.</li>
            <li>Only a <strong>king</strong> (or a sequence starting with one) can move to an empty column.</li>
            <li>When the stock runs out, tap it again to recycle the waste pile.</li>
          </ul>
          <p>
            Drag cards where you want them, or tap a card and then tap its destination.
            Double-tap any eligible card to send it straight to its foundation.
          </p>
        </details>
        <details>
          <summary>Tips for winning more games</summary>
          <ul>
            <li>Always flip face-down cards when you can — exposing hidden cards beats hoarding moves.</li>
            <li>Empty columns are valuable; don&apos;t fill one with a king unless it unlocks something.</li>
            <li>Don&apos;t rush cards to the foundations — you may need that red five to park a black four.</li>
            <li>Prefer moves from the column with the most face-down cards underneath.</li>
            <li>Use undo freely; replaying a decision teaches you the deal.</li>
          </ul>
        </details>
        <details>
          <summary>Frequently asked questions</summary>
          <p><strong>Can every solitaire game be won?</strong> No — roughly 80% of Klondike
            deals are theoretically winnable, but in practice good players win far fewer
            because key cards stay hidden until late.</p>
          <p><strong>What is draw-3 mode?</strong> Three cards are drawn from the stock at
            once and only the top one is playable, which makes the game noticeably harder.
            Switch modes in the settings (⚙) — it starts a fresh deal.</p>
          <p><strong>Is this really free?</strong> Yes. No ads, no tracking pop-ups, no
            &quot;premium&quot; deck. It&apos;s a side project of <Link href="/">casi.gg</Link>.</p>
        </details>
        <details>
          <summary>Keyboard shortcuts</summary>
          <ul>
            <li><kbd>N</kbd> — new game</li>
            <li><kbd>U</kbd> or <kbd>Ctrl+Z</kbd> — undo</li>
            <li><kbd>Ctrl+Shift+Z</kbd> — redo</li>
            <li><kbd>H</kbd> — hint</li>
            <li><kbd>Tab</kbd> into the board, then <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> to move between piles and <kbd>Enter</kbd> to select or drop</li>
          </ul>
        </details>
      </section>

      <footer className="foot">
        <span>free to play · no ads</span>
        <Link href="/" className="foot-link">casi.gg</Link>
        <Link href="/words" className="foot-link">word generator</Link>
      </footer>

      {/* ── win modal ── */}
      {phase === 'modal' && (
        <div className="ov" role="dialog" aria-label="Game won">
          <div className="ovbox">
            <div className="ovhi">You won!</div>
            <div className="ovsub">
              {g.moves} moves · {fmt(elapsed)}
              {winIsBest && <span className="best"> — new best time!</span>}
            </div>
            <div className="ovstats">
              {stats.won}/{stats.played} won · streak {stats.streak}
            </div>
            <button className="btn-new btn-lg" onClick={() => restart()}>Play again</button>
          </div>
        </div>
      )}

      {/* ── settings / stats modal ── */}
      {settingsOpen && (
        <div className="ov" role="dialog" aria-label="Settings and statistics" onClick={() => setSettingsOpen(false)}>
          <div className="ovbox setbox" onClick={e => e.stopPropagation()}>
            <div className="sethead">
              <span className="setttl">Settings</span>
              <button className="ibtn" onClick={() => setSettingsOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="setsec">
              <div className="setlbl">Draw mode <em>(starts a new game)</em></div>
              <div className="seg">
                <button className={drawMode === 1 ? 'on' : ''} onClick={() => changeDraw(1)}>Draw 1</button>
                <button className={drawMode === 3 ? 'on' : ''} onClick={() => changeDraw(3)}>Draw 3</button>
              </div>
            </div>

            <div className="setsec">
              <div className="setlbl">Statistics</div>
              <div className="sgrid">
                <span>Played</span><b>{stats.played}</b>
                <span>Won</span><b>{stats.won}</b>
                <span>Win rate</span><b>{stats.played ? Math.round(stats.won / stats.played * 100) : 0}%</b>
                <span>Streak</span><b>{stats.streak}</b>
                <span>Best streak</span><b>{stats.bestStreak}</b>
                <span>Best time</span><b>{stats.bestTime !== null ? fmt(stats.bestTime) : '—'}</b>
              </div>
              <button
                className="reset"
                onClick={() => updateStats(() => DEF_STATS)}
              >
                Reset statistics
              </button>
            </div>
          </div>
        </div>
      )}

      <span className="sr" aria-live="polite">{announce}</span>

      <style jsx>{`
        .sol {
          --cw: min(calc((100vw - 2 * clamp(6px, 1.6vw, 18px) - 6 * clamp(3px, 0.9vw, 8px)) / 7), 92px);
          --ch: calc(var(--cw) * 1.4);
          --gap: clamp(3px, 0.9vw, 8px);
          --pad: clamp(6px, 1.6vw, 18px);
          --H: var(--font-casi-display, 'Bricolage Grotesque', system-ui, sans-serif);
          --M: var(--font-casi-mono, 'JetBrains Mono', ui-monospace, monospace);

          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          background: radial-gradient(1100px 540px at 50% -10%,
            color-mix(in srgb, var(--ink) 7%, transparent), transparent 60%), var(--paper);
          color: #f3f5f4;
          font-family: var(--H);
          overflow-x: hidden;
        }

        /* ── header ── */
        .hdr {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px var(--pad);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        .brand {
          font-family: var(--H); font-weight: 800; font-size: 21px;
          letter-spacing: -0.03em; color: #f3f5f4; text-decoration: none;
        }
        .brand .dot { color: var(--ink); }
        .mid { display: flex; gap: 14px; }
        .stat {
          font-family: var(--M); font-size: 11.5px; letter-spacing: 0.06em;
          color: rgba(243,245,244,0.45); white-space: nowrap;
        }
        .acts { display: flex; align-items: center; gap: 7px; }
        .ibtn {
          position: relative;
          width: 32px; height: 32px;
          display: inline-flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.05);
          color: rgba(243,245,244,0.8);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 9px;
          font-size: 14px; cursor: pointer;
        }
        .ibtn:hover:not(:disabled) { border-color: rgba(255,255,255,0.28); }
        .ibtn:disabled { opacity: 0.3; cursor: default; }
        .badge {
          position: absolute; top: -6px; right: -6px;
          font-family: var(--M); font-style: normal; font-size: 9px;
          background: var(--ink); color: var(--paper);
          border-radius: 99px; padding: 1px 4px; line-height: 1.3;
        }
        .btn-new {
          font-family: var(--H); font-weight: 700; font-size: 13px;
          background: var(--ink); color: var(--paper);
          border: none; border-radius: 999px; padding: 7px 15px; cursor: pointer;
        }
        .btn-new:hover { opacity: 0.88; }
        .btn-lg { font-size: 16px; padding: 12px 28px; }
        @media (max-width: 480px) {
          .mid { gap: 8px; }
          .stat { font-size: 10px; }
          .brand { font-size: 18px; }
        }

        /* ── layout ── */
        .gamewrap {
          min-height: calc(100dvh - 53px);
          display: flex;
          flex-direction: column;
        }
        .board {
          display: flex;
          flex-direction: column;
          gap: clamp(8px, 2vh, 18px);
          padding: clamp(8px, 2vh, 18px) var(--pad);
          align-items: center;
        }
        .row7 {
          display: grid;
          grid-template-columns: repeat(7, var(--cw));
          gap: var(--gap);
          justify-content: center;
          align-items: start;
        }
        .pile {
          width: var(--cw); height: var(--ch);
          position: relative;
        }
        .stock { cursor: pointer; }
        .stock-n {
          position: absolute; bottom: 4px; right: 5px;
          font-family: var(--M); font-size: 9px;
          color: color-mix(in srgb, var(--ink) 75%, white);
          pointer-events: none;
        }
        .waste { overflow: visible; }
        .wfan { position: absolute; top: 0; width: var(--cw); }
        .tabcol {
          width: var(--cw); min-height: var(--ch);
          border-radius: 6px;
        }
        .cardwrap { width: var(--cw); }

        /* ── cards (global: clones + cascade live outside this subtree) ── */
        :global(.card) {
          width: var(--cw); height: var(--ch);
          border-radius: 5px;
          user-select: none; -webkit-user-select: none;
          display: block; box-sizing: border-box;
        }
        :global(.cface) {
          background: #fdfdfa;
          border: 1px solid #cfd3d9;
          position: relative; cursor: pointer; outline: none;
        }
        :global(.cface.csel) {
          border-color: var(--ink, #0dcfb0);
          box-shadow: 0 0 0 2px var(--ink, #0dcfb0), 0 4px 16px color-mix(in srgb, var(--ink, #0dcfb0) 35%, transparent);
        }
        :global(.cface.flipin) {
          animation: flipIn 0.26s ease-out;
        }
        @keyframes flipIn {
          0% { transform: rotateY(88deg); }
          100% { transform: none; }
        }
        :global(.ctop) {
          position: absolute; top: 3px; left: 4px;
          font-size: calc(var(--cw) * 0.21);
          font-weight: 800; line-height: 1.12; text-align: center;
          font-family: var(--H); letter-spacing: -0.02em;
        }
        :global(.cbot) {
          position: absolute; bottom: 3px; right: 4px;
          font-size: calc(var(--cw) * 0.21);
          font-weight: 800; line-height: 1.12; text-align: center;
          transform: rotate(180deg);
          font-family: var(--H); letter-spacing: -0.02em;
        }
        :global(.cmid) {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          font-size: calc(var(--cw) * 0.46);
          line-height: 1; opacity: 0.88;
          pointer-events: none;
        }
        :global(.cback) {
          /* diamond crosshatch over a soft center glow, framed like a real card back */
          background:
            repeating-linear-gradient(45deg,
              color-mix(in srgb, var(--ink, #0dcfb0) 22%, transparent) 0 1.5px,
              transparent 1.5px 7px),
            repeating-linear-gradient(-45deg,
              color-mix(in srgb, var(--ink, #0dcfb0) 22%, transparent) 0 1.5px,
              transparent 1.5px 7px),
            radial-gradient(ellipse at 50% 50%,
              color-mix(in srgb, var(--ink, #0dcfb0) 14%, transparent), transparent 72%),
            color-mix(in srgb, var(--paper, #0c0d11) 80%, white 4%);
          border: 1.5px solid color-mix(in srgb, var(--ink, #0dcfb0) 30%, transparent);
          box-shadow:
            inset 0 0 0 2.5px color-mix(in srgb, var(--paper, #0c0d11) 88%, white 5%),
            inset 0 0 0 3.5px color-mix(in srgb, var(--ink, #0dcfb0) 28%, transparent);
        }
        :global(.cempty) {
          background: transparent;
          border: 2px dashed rgba(255,255,255,0.1);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }
        :global(.elbl) {
          font-size: calc(var(--cw) * 0.34);
          color: rgba(255,255,255,0.17); line-height: 1; pointer-events: none;
        }

        /* ── deal animation ── */
        .cardwrap.deal { animation: dealIn 0.34s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
        @keyframes dealIn {
          from { opacity: 0; transform: translate(-36vw, -30vh) rotate(-7deg); }
          to { opacity: 1; transform: none; }
        }
        .deal-fade { animation: fadeIn 0.5s 1s ease backwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .cardwrap.deal, .deal-fade { animation: none; }
          :global(.cface.flipin) { animation: none; }
          .dragging :global(.tabcol .cempty) {
            animation: none;
            box-shadow: 0 0 14px 2px color-mix(in srgb, var(--ink, #0dcfb0) 35%, transparent);
          }
        }

        /* ── drag, drop, hint feedback (classes applied imperatively → global) ── */
        :global(.drag-src) { opacity: 0 !important; }
        :global(.drag-ghost) {
          position: fixed; left: 0; top: 0; z-index: 1000;
          pointer-events: none;
          filter: drop-shadow(0 16px 26px rgba(0,0,0,0.55));
        }
        :global(.drop-hi) {
          border-radius: 6px;
          box-shadow: 0 0 0 2.5px var(--ink, #0dcfb0);
        }
        .dragging :global(.tabcol .cempty) {
          border-color: color-mix(in srgb, var(--ink, #0dcfb0) 60%, transparent);
          animation: dropPulse 1.1s ease-in-out infinite;
        }
        @keyframes dropPulse {
          0%, 100% { box-shadow: 0 0 0 0 transparent; }
          50% { box-shadow: 0 0 14px 2px color-mix(in srgb, var(--ink, #0dcfb0) 35%, transparent); }
        }
        .board:focus { outline: none; }
        :global(.kb-focus) {
          outline: 2px dashed color-mix(in srgb, var(--ink, #0dcfb0) 85%, white 10%);
          outline-offset: 2px;
          border-radius: 7px;
        }
        .hint-pulse, .hint-dst { animation: pulse 0.65s ease-in-out 3; border-radius: 6px; }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 transparent; }
          50% { box-shadow: 0 0 0 3px var(--ink); }
        }

        /* ── cascade layer (body-level) ── */
        :global(.casc-layer) {
          position: fixed; inset: 0; z-index: 90;
          overflow: hidden; cursor: pointer;
        }

        /* ── auto-complete ── */
        .auto-btn {
          position: fixed;
          bottom: 22px; left: 50%;
          transform: translateX(-50%);
          z-index: 50;
          font-family: var(--H); font-weight: 700; font-size: 15px;
          background: var(--ink); color: var(--paper);
          border: none; border-radius: 999px;
          padding: 12px 26px; cursor: pointer;
          box-shadow: 0 10px 30px color-mix(in srgb, var(--ink) 40%, transparent);
          animation: rise 0.3s ease-out;
        }
        @keyframes rise { from { opacity: 0; transform: translate(-50%, 12px); } }

        /* ── overlays ── */
        .ov {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.66);
          display: flex; align-items: center; justify-content: center;
          padding: 18px;
        }
        .ovbox {
          background: color-mix(in srgb, var(--paper) 86%, white 5%);
          border: 1px solid color-mix(in srgb, var(--ink) 30%, transparent);
          border-radius: 18px;
          padding: 34px 40px;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          text-align: center;
          max-width: 92vw;
        }
        .ovhi {
          font-family: var(--H); font-weight: 800; font-size: 36px;
          letter-spacing: -0.03em; color: var(--ink);
        }
        .ovsub {
          font-family: var(--M); font-size: 13px; letter-spacing: 0.05em;
          color: rgba(243,245,244,0.55);
        }
        .best { color: var(--ink); }
        .ovstats {
          font-family: var(--M); font-size: 11px;
          color: rgba(243,245,244,0.35); margin-bottom: 8px;
        }

        /* ── settings modal ── */
        .setbox { align-items: stretch; text-align: left; min-width: min(340px, 88vw); }
        .sethead {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 6px;
        }
        .setttl { font-family: var(--H); font-weight: 800; font-size: 20px; letter-spacing: -0.02em; }
        .setsec { padding: 12px 0; border-top: 1px solid rgba(255,255,255,0.08); }
        .setlbl {
          font-family: var(--M); font-size: 10px; letter-spacing: 0.18em;
          text-transform: uppercase; color: rgba(243,245,244,0.4);
          margin-bottom: 10px;
        }
        .setlbl em { text-transform: none; letter-spacing: 0; font-style: italic; }
        .seg { display: flex; gap: 8px; }
        .seg button {
          flex: 1;
          font-family: var(--H); font-weight: 700; font-size: 13px;
          background: rgba(255,255,255,0.05); color: rgba(243,245,244,0.7);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 10px; padding: 9px 0; cursor: pointer;
        }
        .seg button.on {
          background: var(--ink); color: var(--paper); border-color: var(--ink);
        }
        .sgrid {
          display: grid; grid-template-columns: 1fr auto;
          gap: 7px 18px;
          font-family: var(--M); font-size: 12.5px;
          color: rgba(243,245,244,0.55);
        }
        .sgrid b { color: #f3f5f4; font-weight: 600; text-align: right; }
        .reset {
          margin-top: 14px;
          font-family: var(--M); font-size: 11px;
          background: none; border: none;
          color: rgba(243,245,244,0.3);
          text-decoration: underline; cursor: pointer;
          padding: 0; align-self: flex-start;
        }
        .reset:hover { color: #e25555; }

        /* ── SEO content ── */
        .info {
          max-width: 660px;
          margin: 40px auto 0;
          padding: 0 var(--pad) 30px;
          color: rgba(243,245,244,0.6);
          font-size: 14.5px; line-height: 1.65;
        }
        .info h1 {
          font-family: var(--H); font-weight: 800; font-size: 19px;
          letter-spacing: -0.02em; color: rgba(243,245,244,0.85);
          margin: 0 0 10px;
        }
        .info details {
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 12px 0;
        }
        .info summary {
          font-family: var(--H); font-weight: 700; font-size: 14.5px;
          color: rgba(243,245,244,0.78); cursor: pointer;
        }
        .info ul { padding-left: 20px; margin: 10px 0; }
        .info li { margin: 5px 0; }
        .info p { margin: 10px 0; }
        .info strong { color: rgba(243,245,244,0.85); }
        .info :global(a) { color: var(--ink); text-decoration: none; }
        .info kbd {
          font-family: var(--M); font-size: 11px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 4px; padding: 1px 6px;
        }

        /* ── footer ── */
        .foot {
          display: flex; align-items: center; justify-content: center;
          gap: 18px; padding: 16px;
          font-family: var(--M); font-size: 11px; letter-spacing: 0.08em;
          color: rgba(255,255,255,0.25);
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .foot-link { color: color-mix(in srgb, var(--ink) 60%, transparent); text-decoration: none; }
        .foot-link:hover { color: var(--ink); }

        .sr {
          position: absolute; width: 1px; height: 1px;
          overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
