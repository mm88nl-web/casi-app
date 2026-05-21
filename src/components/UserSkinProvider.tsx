'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SKIN_ID, getSkinById, type Skin } from '@/lib/skins';

const STORAGE_KEY   = 'casi-skin-id';
const INK_KEY       = 'casi-ink-color';
const PAPER_KEY     = 'casi-paper-color';
const ACCENT2_KEY   = 'casi-accent2-color';
// Legacy key — read on mount as a fallback so streamers who set their accent
// before the rename keep their colour. Removed when the user picks anything.
const LEGACY_INK_KEY = 'casi-theme-color';

type UserSkinContextValue = {
  skinId: string;
  skin: Skin;
  setSkinId: (id: string) => void;
  /** Ink override — only applied when skinId === 'custom'. */
  inkColor: string | null;
  setInkColor: (color: string | null) => void;
  /** Paper override — only applied when skinId === 'custom'. */
  paperColor: string | null;
  setPaperColor: (color: string | null) => void;
  /** Accent2 override — only applied when skinId === 'custom'. */
  accent2Color: string | null;
  setAccent2Color: (color: string | null) => void;
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

function isPaperLight(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5;
}

function applySkinToRoot(
  skin: Skin,
  isCustom: boolean,
  inkOverride: string | null,
  paperOverride: string | null,
  accent2Override: string | null,
) {
  const root = document.documentElement;
  const validHex = (s: string | null): s is string => !!s && /^#[0-9A-Fa-f]{6}$/.test(s);

  // Overrides only apply when the Custom skin is active.
  const useInk     = isCustom && validHex(inkOverride);
  const usePaper   = isCustom && validHex(paperOverride);
  const useAccent2 = isCustom && validHex(accent2Override);

  const ink        = useInk     ? inkOverride!     : skin.ink;
  const inkRgb     = useInk     ? hexToRgbStr(inkOverride!)     : skin.accentRgb;
  const paper      = usePaper   ? paperOverride!   : skin.paper;
  const accent2    = useAccent2 ? accent2Override! : skin.accent2;
  const accent2Rgb = useAccent2 ? hexToRgbStr(accent2Override!) : skin.accent2Rgb;

  // v9 roots — globals.css derives the rest of the ladder via color-mix().
  root.style.setProperty('--ink',   ink);
  root.style.setProperty('--paper', paper);

  const lightMode = skin.isLight || (usePaper && isPaperLight(paper));
  if (lightMode) root.setAttribute('data-paper', 'light');
  else           root.removeAttribute('data-paper');

  // v7 alias layer — only the values that can't derive from --ink/--paper.
  root.style.setProperty('--casi-accent',      ink);
  root.style.setProperty('--casi-accent-rgb',  inkRgb);
  root.style.setProperty('--casi-accent2',     accent2);
  root.style.setProperty('--casi-accent2-rgb', accent2Rgb);
  root.style.setProperty('--casi-bg',          paper);
}

export function UserSkinProvider({ children }: { children: ReactNode }) {
  const [skinId,      setSkinIdState]      = useState<string>(DEFAULT_SKIN_ID);
  const [inkColor,    setInkColorState]    = useState<string | null>(null);
  const [paperColor,  setPaperColorState]  = useState<string | null>(null);
  const [accent2Color, setAccent2ColorState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedSkin = window.localStorage.getItem(STORAGE_KEY);
    if (storedSkin) setSkinIdState(storedSkin);
    const storedInk = window.localStorage.getItem(INK_KEY)
      ?? window.localStorage.getItem(LEGACY_INK_KEY);
    if (storedInk) setInkColorState(storedInk);
    const storedPaper = window.localStorage.getItem(PAPER_KEY);
    if (storedPaper) setPaperColorState(storedPaper);
    const storedAccent2 = window.localStorage.getItem(ACCENT2_KEY);
    if (storedAccent2) setAccent2ColorState(storedAccent2);
  }, []);

  useEffect(() => {
    applySkinToRoot(getSkinById(skinId), skinId === 'custom', inkColor, paperColor, accent2Color);
  }, [skinId, inkColor, paperColor, accent2Color]);

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

  const setAccent2Color = (color: string | null) => {
    setAccent2ColorState(color);
    try {
      if (color) window.localStorage.setItem(ACCENT2_KEY, color);
      else       window.localStorage.removeItem(ACCENT2_KEY);
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
    accent2Color,
    setAccent2Color,
  };

  return <UserSkinContext.Provider value={value}>{children}</UserSkinContext.Provider>;
}

export function useUserSkin(): UserSkinContextValue {
  const ctx = useContext(UserSkinContext);
  if (!ctx) throw new Error('useUserSkin must be used inside <UserSkinProvider>');
  return ctx;
}
