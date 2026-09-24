import type { HTMLAttributes } from 'react';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'success' | 'warning' | 'danger';
};

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  const classes = `dst-badge dst-badge--${variant}${className ? ` ${className}` : ''}`;
  return <span className={classes} {...props} />;
}
