'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SKIN_ID, getSkinById, type Skin } from '@/lib/skins';

const STORAGE_KEY = 'casi-skin-id';
const THEME_COLOR_KEY = 'casi-theme-color';

type UserSkinContextValue = {
  skinId: string;
  skin: Skin;
  setSkinId: (id: string) => void;
  /** Optional accent override that wins over `skin.accent`. Hex string or null. */
  themeColor: string | null;
  setThemeColor: (color: string | null) => void;
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

function applySkinToRoot(skin: Skin, themeColor: string | null) {
  const root = document.documentElement;
  // theme_color (when set) overrides accent only — skin still drives surfaces.
  // Same priority as <SkinProvider>: a custom hex always wins for --casi-accent.
  if (themeColor && /^#[0-9A-Fa-f]{6}$/.test(themeColor)) {
    root.style.setProperty('--casi-accent',     themeColor);
    root.style.setProperty('--casi-accent-rgb', hexToRgbStr(themeColor));
  } else {
    root.style.setProperty('--casi-accent',     skin.accent);
    root.style.setProperty('--casi-accent-rgb', skin.accentRgb);
  }
  root.style.setProperty('--casi-accent2',     skin.accent2);
  root.style.setProperty('--casi-accent2-rgb', skin.accent2Rgb);
  root.style.setProperty('--casi-bg',          skin.bg);
  root.style.setProperty('--casi-surface',     skin.surface);
  root.style.setProperty('--casi-border',      skin.border);
  root.style.setProperty('--casi-text',        skin.text);
  root.style.setProperty('--casi-text-muted',  skin.textMuted);
}

export function UserSkinProvider({ children }: { children: ReactNode }) {
  const [skinId, setSkinIdState] = useState<string>(DEFAULT_SKIN_ID);
  const [themeColor, setThemeColorState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedSkin = window.localStorage.getItem(STORAGE_KEY);
    if (storedSkin) setSkinIdState(storedSkin);
    const storedColor = window.localStorage.getItem(THEME_COLOR_KEY);
    if (storedColor) setThemeColorState(storedColor);
  }, []);

  useEffect(() => {
    applySkinToRoot(getSkinById(skinId), themeColor);
  }, [skinId, themeColor]);

  const setSkinId = (id: string) => {
    setSkinIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // localStorage can throw in private-mode Safari; skin still applies for this session.
    }
  };

  const setThemeColor = (color: string | null) => {
    setThemeColorState(color);
    try {
      if (color) window.localStorage.setItem(THEME_COLOR_KEY, color);
      else window.localStorage.removeItem(THEME_COLOR_KEY);
    } catch {
      // Same Safari edge case — accent applies for the session anyway.
    }
  };

  const value: UserSkinContextValue = {
    skinId,
    skin: getSkinById(skinId),
    setSkinId,
    themeColor,
    setThemeColor,
  };

  return <UserSkinContext.Provider value={value}>{children}</UserSkinContext.Provider>;
}

export function useUserSkin(): UserSkinContextValue {
  const ctx = useContext(UserSkinContext);
  if (!ctx) throw new Error('useUserSkin must be used inside <UserSkinProvider>');
  return ctx;
}
