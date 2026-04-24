'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SKIN_ID, getSkinById, type Skin } from '@/lib/skins';

const STORAGE_KEY = 'casi-skin-id';

type UserSkinContextValue = {
  skinId: string;
  skin: Skin;
  setSkinId: (id: string) => void;
};

const UserSkinContext = createContext<UserSkinContextValue | null>(null);

function applySkinToRoot(skin: Skin) {
  const root = document.documentElement;
  root.style.setProperty('--casi-accent',      skin.accent);
  root.style.setProperty('--casi-accent-rgb',  skin.accentRgb);
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

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored) setSkinIdState(stored);
  }, []);

  useEffect(() => {
    applySkinToRoot(getSkinById(skinId));
  }, [skinId]);

  const setSkinId = (id: string) => {
    setSkinIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // localStorage can throw in private-mode Safari; skin still applies for this session.
    }
  };

  const value: UserSkinContextValue = {
    skinId,
    skin: getSkinById(skinId),
    setSkinId,
  };

  return <UserSkinContext.Provider value={value}>{children}</UserSkinContext.Provider>;
}

export function useUserSkin(): UserSkinContextValue {
  const ctx = useContext(UserSkinContext);
  if (!ctx) throw new Error('useUserSkin must be used inside <UserSkinProvider>');
  return ctx;
}
