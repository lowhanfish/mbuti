"use client";

import React from "react";
import { FieldShell, fieldClasses, fieldId } from "./field";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Textarea({
  label,
  error,
  helperText,
  className = "",
  id,
  required,
  rows = 4,
  ...props
}: TextareaProps) {
  const textareaId = fieldId(id, label);

  return (
    <FieldShell id={textareaId} label={label} required={required} error={error} helperText={helperText}>
      <textarea
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`${fieldClasses(Boolean(error))} p-3 resize-y ${className}`}
        {...props}
      />
    </FieldShell>
  );
}
