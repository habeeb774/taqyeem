import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from './Field';
import { Input } from './Input';

describe('Field', () => {
  it('associates the label with the input via htmlFor/id', () => {
    render(
      <Field id="email" label="البريد الإلكتروني">
        <Input id="email" />
      </Field>,
    );
    expect(screen.getByLabelText('البريد الإلكتروني')).toBeInstanceOf(HTMLInputElement);
  });

  it('renders a hint when there is no error', () => {
    render(
      <Field id="phone" label="الجوال" hint="مثال: 05xxxxxxxx">
        <Input id="phone" />
      </Field>,
    );
    expect(screen.getByText('مثال: 05xxxxxxxx')).toBeInTheDocument();
  });

  it('shows the error instead of the hint, with an alert role', () => {
    render(
      <Field id="phone" label="الجوال" hint="مثال: 05xxxxxxxx" error="رقم الجوال مطلوب">
        <Input id="phone" />
      </Field>,
    );
    expect(screen.queryByText('مثال: 05xxxxxxxx')).not.toBeInTheDocument();
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('رقم الجوال مطلوب');
  });
});
