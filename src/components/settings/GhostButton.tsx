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
      className={`transition-colors${className ? ` ${className}` : ''}`}
      style={{
        padding: '10px 16px',
        borderRadius: 'var(--radius-pill)',
        background: 'transparent',
        border: `1px solid ${danger ? 'rgba(239, 68, 68, 0.3)' : 'var(--line-2)'}`,
        color: danger ? '#dc4a3a' : 'var(--text-2)',
        fontFamily: 'var(--B)',
        fontWeight: 600,
        fontSize: '14px',
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
