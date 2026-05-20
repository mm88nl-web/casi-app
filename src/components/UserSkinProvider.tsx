'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SKIN_ID, getSkinById, type Skin } from '@/lib/skins';

const STORAGE_KEY = 'casi-skin-id';
const INK_KEY     = 'casi-ink-color';
const PAPER_KEY   = 'casi-paper-color';
// Legacy key — read on mount as a fallback so streamers who set their accent
// before the rename keep their colour. Removed when the user picks anything.
const LEGACY_INK_KEY = 'casi-theme-color';

type UserSkinContextValue = {
  skinId: string;
  skin: Skin;
  setSkinId: (id: string) => void;
  /** Optional accent override that wins over `skin.ink`. Hex string or null. */
  inkColor: string | null;
  setInkColor: (color: string | null) => void;
  /** Optional paper override that wins over `skin.paper`. Hex string or null. */
  paperColor: string | null;
  setPaperColor: (color: string | null) => void;
};

const UserSkinContext = createContext<UserSkinContextValue | null>(null);

function hexToRgbStr(hex: string): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '255,255,255';
  return `${r},${g},${b}`;
}

// Detect whether a paper override is light enough to need data-paper="light"
// for the v9 derived ladder. Threshold copied from globals.css's own
// classifier — anything brighter than ~50% perceived luminance counts.
function isPaperLight(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5;
}

function applySkinToRoot(skin: Skin, inkOverride: string | null, paperOverride: string | null) {
  const root = document.documentElement;
  const useInk   = inkOverride   && /^#[0-9A-Fa-f]{6}$/.test(inkOverride);
  const usePaper = paperOverride && /^#[0-9A-Fa-f]{6}$/.test(paperOverride);
  const ink      = useInk   ? inkOverride!   : skin.ink;
  const inkRgb   = useInk   ? hexToRgbStr(inkOverride!) : skin.accentRgb;
  const paper    = usePaper ? paperOverride! : skin.paper;

  // v9 roots — globals.css derives the rest of the ladder via color-mix().
  root.style.setProperty('--ink',   ink);
  root.style.setProperty('--paper', paper);

  // Light/dark switch for derived tokens. Skin-level isLight wins; otherwise
  // a paper override that's actually bright trips the same flag.
  const lightMode = skin.isLight || (usePaper && isPaperLight(paper));
  if (lightMode) root.setAttribute('data-paper', 'light');
  else           root.removeAttribute('data-paper');

  // v7 alias layer — only the values that can't derive from --ink/--paper
  // via color-mix() in globals.css. Surface/border/text are intentionally
  // omitted so the globals.css derivations win over stale inline overrides.
  root.style.setProperty('--casi-accent',     ink);
  root.style.setProperty('--casi-accent-rgb', inkRgb);
  root.style.setProperty('--casi-accent2',     skin.accent2);
  root.style.setProperty('--casi-accent2-rgb', skin.accent2Rgb);
  root.style.setProperty('--casi-bg',          paper);
}

export function UserSkinProvider({ children }: { children: ReactNode }) {
  const [skinId, setSkinIdState]      = useState<string>(DEFAULT_SKIN_ID);
  const [inkColor, setInkColorState]  = useState<string | null>(null);
  const [paperColor, setPaperColorState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedSkin = window.localStorage.getItem(STORAGE_KEY);
    if (storedSkin) setSkinIdState(storedSkin);
    const storedInk = window.localStorage.getItem(INK_KEY)
      ?? window.localStorage.getItem(LEGACY_INK_KEY);
    if (storedInk) setInkColorState(storedInk);
    const storedPaper = window.localStorage.getItem(PAPER_KEY);
    if (storedPaper) setPaperColorState(storedPaper);
  }, []);

  useEffect(() => {
    applySkinToRoot(getSkinById(skinId), inkColor, paperColor);
  }, [skinId, inkColor, paperColor]);

  const setSkinId = (id: string) => {
    setSkinIdState(id);
    try { window.localStorage.setItem(STORAGE_KEY, id); } catch {}
  };

  const setInkColor = (color: string | null) => {
    setInkColorState(color);
    try {
      if (color) window.localStorage.setItem(INK_KEY, color);
      else       window.localStorage.removeItem(INK_KEY);
      window.localStorage.removeItem(LEGACY_INK_KEY);
    } catch {}
  };

  const setPaperColor = (color: string | null) => {
    setPaperColorState(color);
    try {
      if (color) window.localStorage.setItem(PAPER_KEY, color);
      else       window.localStorage.removeItem(PAPER_KEY);
    } catch {}
  };

  const value: UserSkinContextValue = {
    skinId,
    skin: getSkinById(skinId),
    setSkinId,
    inkColor,
    setInkColor,
    paperColor,
    setPaperColor,
  };

  return <UserSkinContext.Provider value={value}>{children}</UserSkinContext.Provider>;
}

export function useUserSkin(): UserSkinContextValue {
  const ctx = useContext(UserSkinContext);
  if (!ctx) throw new Error('useUserSkin must be used inside <UserSkinProvider>');
  return ctx;
}
