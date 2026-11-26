import React from "react";

interface SlotProps {
  children: React.ReactNode;
  className?: string;
}

export function Table({ children, className = "" }: SlotProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={`w-full text-left text-sm border-collapse ${className}`}>{children}</table>
    </div>
  );
}

export function TableHeader({ children, className = "" }: SlotProps) {
  return (
    <thead className={`border-b border-rim bg-surface/40 text-xs font-semibold text-muted ${className}`}>
      {children}
    </thead>
  );
}

export function TableBody({ children, className = "" }: SlotProps) {
  return <tbody className={`divide-y divide-rim ${className}`}>{children}</tbody>;
}

export function TableRow({ children, className = "" }: SlotProps) {
  return <tr className={`hover:bg-surface/55 transition-colors duration-150 ${className}`}>{children}</tr>;
}

export function TableHead({ children, className = "" }: SlotProps) {
  return <th className={`py-3.5 px-4 font-semibold ${className}`}>{children}</th>;
}

export function TableCell({
  children,
  className = "",
  colSpan,
}: SlotProps & { colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`py-3.5 px-4 align-middle text-ink ${className}`}>
      {children}
    </td>
  );
}

export function TableEmpty({
  colSpan,
  message = "Tidak ada data yang ditemukan.",
}: {
  colSpan: number;
  message?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center py-12 text-faint text-sm">
        {message}
      </td>
    </tr>
  );
}
