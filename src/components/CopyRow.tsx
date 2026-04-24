'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type CopyRowProps = {
  /** Optional caption above the copy row. Accepts JSX (e.g. leading badge). */
  label?: ReactNode;
  value: string;
  hint?: ReactNode;
  /** Button label styles. "solid" = accent fill (default), "ghost" = transparent. */
  variant?: 'solid' | 'ghost';
};

export default function CopyRow({ label, value, hint, variant = 'solid' }: CopyRowProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Insecure context or denied permission — user can select the displayed text manually.
    }
  };

  const solid = variant === 'solid';

  return (
    <div>
      {label ? (
        <div
          className="mb-1.5 block font-mono uppercase"
          style={{
            fontSize: '10px',
            letterSpacing: '0.15em',
            color: 'var(--casi-text-faint)',
          }}
        >
          {label}
        </div>
      ) : null}

      <div
        className="flex items-center gap-2.5"
        style={{
          background: 'var(--casi-bg)',
          border: '1px solid var(--casi-border-2)',
          borderRadius: '9px',
          padding: '10px 14px',
        }}
      >
        <span
          className="flex-1 truncate font-mono"
          style={{ fontSize: '12px', color: 'var(--casi-text-dim)', whiteSpace: 'nowrap' }}
          title={value}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="cursor-pointer whitespace-nowrap font-bold"
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            background: solid ? 'var(--casi-accent)' : 'transparent',
            color: solid ? '#050505' : 'var(--casi-accent)',
            fontFamily: 'var(--font-casi-sans)',
            fontWeight: 800,
            fontSize: '11px',
            border: solid ? 'none' : '1px solid rgba(var(--casi-accent-rgb), 0.3)',
          }}
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {hint ? (
        <div
          className="mt-1.5 font-mono uppercase"
          style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: 'var(--casi-text-faint)',
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}
