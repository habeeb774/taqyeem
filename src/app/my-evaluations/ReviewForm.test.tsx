import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requestReview: vi.fn() }));
vi.mock('./actions', () => ({ requestReview: mocks.requestReview }));
import { ReviewForm } from './ReviewForm';

describe('review request form', () => {
  it('keeps the employee note after a failed request', async () => {
    mocks.requestReview.mockResolvedValueOnce({ success: false, message: 'تعذر إرسال الطلب. أعد المحاولة.' });
    const { container } = render(<ReviewForm evaluationId="evaluation" />);
    const input = screen.getByLabelText('سبب طلب المراجعة');
    fireEvent.change(input, { target: { value: 'أريد مراجعة هذه الدرجة' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('أعد المحاولة'));
    expect(input).toHaveValue('أريد مراجعة هذه الدرجة');
    expect(screen.getByRole('button')).toBeEnabled();
  });
  it('disables submission while sending and confirms success', async () => {
    let complete!: (result: { success: boolean; message: string }) => void;
    mocks.requestReview.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const { container } = render(<ReviewForm evaluationId="evaluation" />);
    fireEvent.change(screen.getByLabelText('سبب طلب المراجعة'), { target: { value: 'سبب واضح للمراجعة' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('جارٍ إرسال الطلب'));
    expect(screen.getByRole('button')).toBeDisabled();
    complete({ success: true, message: 'تم إرسال طلب المراجعة' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('تم إرسال'));
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
