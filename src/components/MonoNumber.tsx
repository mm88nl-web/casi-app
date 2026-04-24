import type { HTMLAttributes, ReactNode } from 'react';

type MonoNumberProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
};

export default function MonoNumber({ children, className, style, ...rest }: MonoNumberProps) {
  return (
    <span
      {...rest}
      className={`font-mono${className ? ` ${className}` : ''}`}
      style={{ fontVariantNumeric: 'tabular-nums', ...style }}
    >
      {children}
    </span>
  );
}
