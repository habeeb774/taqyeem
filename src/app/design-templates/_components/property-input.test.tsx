import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import PropertyInput from './property-input';

function Example() {
  const [value, setValue] = useState<string | number | null>(40);
  return <PropertyInput label="X" numeric value={value} onChange={setValue} min={0} max={900} />;
}

describe('design property editing', () => {
  it('preserves the input and focus through successive coordinate changes', () => {
    render(<Example />);
    const input = screen.getByRole('spinbutton', { name: 'X' });
    input.focus();
    for (const value of ['1', '12', '123']) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByRole('spinbutton', { name: 'X' })).toBe(input);
      expect(input).toHaveFocus();
      expect(input).toHaveValue(Number(value));
    }
  });

  it('allows typing and bounds an invalid number when editing ends', () => {
    render(<Example />);
    const input = screen.getByRole('spinbutton', { name: 'X' });
    fireEvent.change(input, { target: { value: '1700' } });
    expect(input).toHaveValue(1700);
    fireEvent.blur(input);
    expect(input).toHaveValue(900);
  });
});
