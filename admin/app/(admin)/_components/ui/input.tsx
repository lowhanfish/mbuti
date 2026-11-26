"use client";

import React from "react";
import { FieldShell, fieldClasses, fieldId } from "./field";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  className = "",
  id,
  required,
  ...props
}: InputProps) {
  const inputId = fieldId(id, label);

  return (
    <FieldShell id={inputId} label={label} required={required} error={error} helperText={helperText}>
      <div className="relative flex items-center w-full">
        {leftIcon && (
          <span className="absolute left-3 z-10 text-faint pointer-events-none flex items-center">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={`${fieldClasses(Boolean(error))} h-10 px-3 py-2 ${leftIcon ? "pl-9" : ""} ${
            rightIcon ? "pr-9" : ""
          } ${className}`}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3 z-10 text-faint flex items-center">{rightIcon}</span>
        )}
      </div>
    </FieldShell>
  );
}
