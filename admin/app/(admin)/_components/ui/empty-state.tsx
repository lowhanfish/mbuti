import React from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-3 px-6 py-12 ${className}`}>
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-brand-soft text-brand flex items-center justify-center">
          {icon}
        </div>
      )}
      <div className="space-y-1 max-w-md">
        <p className="text-base font-bold text-ink">{title}</p>
        {description && <p className="text-sm text-muted leading-relaxed">{description}</p>}
      </div>
      {action}
    </div>
  );
}
