import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  brandMark,
  nav,
  maxWidth = 1000,
}: {
  eyebrow?: string;
  title: string;
  brandMark?: ReactNode;
  nav?: ReactNode;
  maxWidth?: number;
}) {
  return (
    <header className="dst-page-header">
      <div className="dst-page-header__inner" style={{ maxWidth }}>
        <div className="dst-page-header__brand">
          {brandMark}
          <div>
            {eyebrow && <p className="dst-page-header__eyebrow">{eyebrow}</p>}
            <h1 className="dst-page-header__title">{title}</h1>
          </div>
        </div>
        {nav && <nav className="dst-page-header__nav">{nav}</nav>}
      </div>
    </header>
  );
}
