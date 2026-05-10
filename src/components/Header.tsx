'use client';
import { usePathname } from 'next/navigation';
import WalletNav from '@/components/WalletNav';

const CSS = `

  .hd {
    position: sticky; top: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    height: 52px; padding: 0 24px;
    background: #18181b;
    border-bottom: 1px solid #27272a;
  }

  .hd-logo {
    display: flex; align-items: center; gap: 8px;
    text-decoration: none; flex-shrink: 0;
  }
  .hd-wordmark {
    font-family: var(--font-casi-sans), sans-serif;
    font-size: 18px; font-weight: 800; letter-spacing: -1px;
    color: #F58220;
  }

  @media (max-width: 640px) {
    .hd { padding: 0 16px; height: 48px; }
  }
`;

function Logo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width={72} height={36}>
      <g stroke="#F58220" fill="#F58220" strokeWidth="16" strokeLinecap="round">
        <line x1="50" y1="60" x2="350" y2="60" />
        <line x1="20" y1="100" x2="380" y2="100" />
        <line x1="50" y1="140" x2="350" y2="140" />
      </g>
      <path fill="#F58220" stroke="none" d="M 90,100 C 130,30 270,30 310,100 C 270,170 130,170 90,100 Z" />
      <circle fill="#18181b" cx="200" cy="100" r="45" />
    </svg>
  );
}

export default function Header() {
  const pathname = usePathname();

  // Only render on /admin — overlay/obs have their own nav,
  // other pages (home, login, search, profile) have page-level headers.
  if (!pathname?.startsWith('/admin')) return null;

  return (
    <>
      <style>{CSS}</style>
      <header className="hd">
        <a href="/admin" className="hd-logo">
          <Logo />
          <span className="hd-wordmark">casi</span>
        </a>
        <WalletNav />
      </header>
    </>
  );
}
