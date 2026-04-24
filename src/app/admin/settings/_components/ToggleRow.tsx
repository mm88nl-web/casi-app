'use client';

import type { ReactNode } from 'react';
import Toggle from './Toggle';

type Props = {
  title: ReactNode;
  description?: ReactNode;
  on: boolean;
  onChange: (next: boolean) => void;
  first?: boolean;
};

export default function ToggleRow({ title, description, on, onChange, first }: Props) {
  return (
    <div
      className="flex items-center justify-between gap-4"
      style={{
        padding: '14px 0',
        borderTop: first ? 'none' : '1px solid var(--casi-border)',
      }}
    >
      <div>
        <div className="font-semibold" style={{ fontSize: '14px', color: 'var(--casi-text)' }}>
          {title}
        </div>
        {description ? (
          <div
            className="mt-[3px] max-w-[440px] leading-[1.5]"
            style={{ fontSize: '12px', color: 'var(--casi-text-dim)' }}
          >
            {description}
          </div>
        ) : null}
      </div>
      <Toggle on={on} onChange={onChange} label={typeof title === 'string' ? title : 'toggle'} />
    </div>
  );
}
