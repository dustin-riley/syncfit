"use client";

import { useId } from "react";

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
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  /** Visual error state (red outline + aria-invalid). */
  error?: boolean;
  /** Persistent helper text shown under the input. */
  hint?: string;
  /** Extra element id to merge into aria-describedby (e.g. the form error). */
  describedById?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy =
    [hintId, describedById].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="caption mb-1 block">
        {label}
      </label>
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
        className="input w-full"
      />
      {hint ? (
        <p id={hintId} className="caption mt-1 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
