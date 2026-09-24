import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  brandMark,
  nav,
  maxWidth,
}: {
  eyebrow?: string;
  title: string;
  brandMark?: ReactNode;
  nav?: ReactNode;
  maxWidth?: number | null;
}) {
  return (
    <header className="dst-page-header">
      <div className="dst-page-header__inner" style={maxWidth ? { maxWidth } : undefined}>
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
