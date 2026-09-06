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
          className="mb-2 block"
          style={{
            fontFamily: 'var(--B)',
            fontWeight: 700,
            fontSize: '15px',
            letterSpacing: '-0.01em',
            color: 'var(--text)',
          }}
        >
          {label}
        </div>
      ) : null}

      <div
        className="flex items-center gap-2.5"
        style={{
          background: 'var(--surf-2)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-chip)',
          padding: '11px 14px',
        }}
      >
        <span
          className="flex-1 truncate"
          style={{ fontFamily: 'var(--M)', fontSize: '13px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}
          title={value}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="cursor-pointer whitespace-nowrap"
          style={{
            padding: '8px 14px',
            borderRadius: 'var(--radius-pill)',
            background: solid ? 'var(--ink)' : 'transparent',
            color: solid ? 'var(--on-ink)' : 'var(--ink)',
            fontFamily: 'var(--B)',
            fontWeight: 700,
            fontSize: '13px',
            border: solid ? 'none' : '1px solid var(--ink)',
          }}
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {hint ? (
        <div
          className="mt-1.5"
          style={{
            fontFamily: 'var(--S)',
            fontStyle: 'italic',
            fontSize: '13px',
            color: 'var(--text-3)',
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}
