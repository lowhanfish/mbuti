import React from "react";

/** Kelas bersama untuk input, textarea, dan select agar tampilannya seragam. */
export const fieldClasses = (hasError: boolean) =>
  `w-full text-sm bg-surface/90 backdrop-blur text-ink placeholder:text-faint border rounded-xl outline-none transition-all duration-150 ${
    hasError
      ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-100"
      : "border-line focus:border-brand focus:ring-3 focus:ring-brand/20"
  }`;

export const fieldId = (id: string | undefined, label: string | undefined) =>
  id || (label ? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);

export function FieldShell({
  id,
  label,
  required,
  error,
  helperText,
  children,
}: {
  id?: string;
  label?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full text-left">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-muted flex items-center gap-1">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
      {helperText && !error && <span className="text-xs text-muted">{helperText}</span>}
    </div>
  );
}
