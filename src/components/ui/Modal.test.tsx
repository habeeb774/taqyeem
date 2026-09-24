import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  it('opens the native dialog when open is true', () => {
    render(
      <Modal open onClose={() => {}} title="تأكيد" titleId="confirm-title">
        محتوى
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-title');
  });

  it('does not render the dialog as open when open is false', () => {
    render(
      <Modal open={false} onClose={() => {}} title="تأكيد" titleId="confirm-title">
        محتوى
      </Modal>,
    );
    expect(screen.getByText('تأكيد').closest('dialog')).not.toHaveAttribute('open');
  });

  it('calls onClose when the native dialog close event fires (Escape)', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="تأكيد" titleId="confirm-title">
        محتوى
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement;
    dialog.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('links the visible heading to the dialog via aria-labelledby', () => {
    render(
      <Modal open onClose={() => {}} title="حذف الوظيفة" titleId="delete-title">
        هل أنت متأكد؟
      </Modal>,
    );
    expect(screen.getByRole('heading', { name: 'حذف الوظيفة' })).toHaveAttribute('id', 'delete-title');
  });
});
