import type { ReactNode } from 'react';

export function Field({
  id,
  label,
  hint,
  error,
  full,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  full?: boolean;
  children: ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="dst-field" style={full ? { gridColumn: '1/-1' } : undefined}>
      <label className="dst-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="dst-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="dst-field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function describedBy(id: string, hint?: string, error?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
