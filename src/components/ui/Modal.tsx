'use client';

import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';

export function Modal({
  open,
  onClose,
  title,
  titleId,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === ref.current) onClose();
  }

  return (
    <dialog
      ref={ref}
      className="dst-modal-backdrop"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={handleClick}
    >
      <div className="dst-modal">
        <h2 className="dst-modal__title" id={titleId}>
          {title}
        </h2>
        {children}
        {actions && <div className="dst-modal__actions">{actions}</div>}
      </div>
    </dialog>
  );
}
