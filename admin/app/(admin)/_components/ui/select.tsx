"use client";

import React from "react";
import { FieldShell, fieldClasses, fieldId } from "./field";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: SelectOption[];
}

export function Select({
  label,
  error,
  helperText,
  options,
  children,
  className = "",
  id,
  required,
  ...props
}: SelectProps) {
  const selectId = fieldId(id, label);

  return (
    <FieldShell id={selectId} label={label} required={required} error={error} helperText={helperText}>
      <div className="relative flex items-center w-full">
        <select
          id={selectId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={`${fieldClasses(Boolean(error))} h-10 px-3 pr-8 appearance-none cursor-pointer ${className}`}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <svg
          className="absolute right-3 w-3.5 h-3.5 text-faint pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </FieldShell>
  );
}
