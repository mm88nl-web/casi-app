'use client';

import { useEffect, useRef, useState } from 'react';

type CopyRowProps = {
  label?: string;
  value: string;
  hint?: string;
  /** Controls middle-truncation breakpoints (defaults tuned for the OBS URL pattern). */
  keepStart?: number;
  keepEnd?: number;
};

function middleTruncate(s: string, keepStart: number, keepEnd: number): string {
  if (s.length <= keepStart + keepEnd + 1) return s;
  return `${s.slice(0, keepStart)}…${s.slice(-keepEnd)}`;
}

export default function CopyRow({
  label,
  value,
  hint,
  keepStart = 28,
  keepEnd = 12,
}: CopyRowProps) {
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
      // Clipboard API refused (insecure context, perms). Fail quiet; user can select-and-copy the displayed text.
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '11px',
            letterSpacing: '0.15em',
            color: 'var(--casi-text-dim)',
          }}
        >
          {label}
        </span>
      ) : null}

      <div
        className="flex items-stretch gap-0 overflow-hidden"
        style={{
          border: '1px solid var(--casi-border)',
          borderRadius: '8px',
          background: 'var(--casi-surface-2)',
        }}
      >
        <div
          className="flex-1 truncate px-3 py-2 font-mono"
          style={{
            fontSize: '12px',
            color: 'var(--casi-text)',
            whiteSpace: 'nowrap',
          }}
          title={value}
        >
          {middleTruncate(value, keepStart, keepEnd)}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="font-mono uppercase transition-colors"
          style={{
            fontSize: '11px',
            letterSpacing: '0.12em',
            padding: '0 14px',
            borderLeft: '1px solid var(--casi-border)',
            background: copied ? 'rgba(var(--casi-accent-rgb), 0.14)' : 'transparent',
            color: copied ? 'var(--casi-accent)' : 'var(--casi-text-mid)',
            cursor: 'pointer',
          }}
          aria-label={copied ? 'Copied' : `Copy ${label ?? 'value'}`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {hint ? (
        <span style={{ fontSize: '12px', color: 'var(--casi-text-mid)' }}>{hint}</span>
      ) : null}
    </div>
  );
}
