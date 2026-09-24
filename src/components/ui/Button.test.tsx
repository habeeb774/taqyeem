import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders the primary variant and md size by default', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveClass('dst-btn', 'dst-btn--primary', 'dst-btn--md');
  });

  it('applies the requested variant and size classes', () => {
    render(
      <Button variant="danger" size="sm">
        Delete
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveClass('dst-btn--danger', 'dst-btn--sm');
  });

  it('merges a custom className instead of replacing the base classes', () => {
    render(<Button className="extra">Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('dst-btn', 'extra');
  });

  it('forwards click handlers and disabled state like a native button', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Submit
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Submit' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
