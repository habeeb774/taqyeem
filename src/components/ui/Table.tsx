import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={`dst-table${className ? ` ${className}` : ''}`} {...props}>
      {children}
    </table>
  );
}

export function TableRow({ ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} />;
}

export function TableHeadCell({ ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" {...props} />;
}

export function TableCell({ ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} />;
}
