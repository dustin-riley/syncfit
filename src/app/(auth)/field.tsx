"use client";

import { useId, type ReactNode } from "react";

export function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  autoComplete,
  required,
  error,
  hint,
  describedById,
  trailing,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  /** Visual error state (red border + aria-invalid). */
  error?: boolean;
  /** Persistent helper text shown under the input. */
  hint?: string;
  /** Extra element id to merge into aria-describedby (e.g. the form error). */
  describedById?: string;
  /** Optional control rendered inside the input box (e.g. show-password). */
  trailing?: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy =
    [hintId, describedById].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="ds-caption mb-1 block">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={error || undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-md bg-card px-3 py-2 text-foreground border ${
            trailing ? "pr-11" : ""
          } ${error ? "border-destructive" : "border-input"}`}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            {trailing}
          </div>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="ds-caption mt-1 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
