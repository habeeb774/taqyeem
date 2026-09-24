import type { ButtonHTMLAttributes } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  const classes = `dst-btn dst-btn--${variant} dst-btn--${size}${className ? ` ${className}` : ''}`;
  return <button className={classes} {...props} />;
}
