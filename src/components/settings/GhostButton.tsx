'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'danger';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

export default function GhostButton({ variant = 'default', className, style, children, ...rest }: Props) {
  const danger = variant === 'danger';
  return (
    <button
      {...rest}
      className={`font-mono uppercase transition-colors${className ? ` ${className}` : ''}`}
      style={{
        padding: '8px 14px',
        borderRadius: 0,
        background: 'transparent',
        border: `1px solid ${danger ? 'rgba(239, 68, 68, 0.25)' : 'var(--casi-border-2)'}`,
        color: danger ? '#f87171' : 'var(--casi-text-dim)',
        fontSize: '11px',
        letterSpacing: '0.12em',
        cursor: 'pointer',
        alignSelf: 'flex-start',
        ...style,
      }}
      data-variant={variant}
    >
      {children}
    </button>
  );
}
