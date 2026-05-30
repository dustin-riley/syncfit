"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Password input on the canonical `.password-field` design-system recipe: a
// positioning wrapper around a `.input` plus an in-field reveal toggle. The
// recipe reserves the right padding, positions and sizes the toggle, and fades
// it with a disabled input; this component owns only the reveal state, the
// type flip, the glyph swap, and the aria-pressed/aria-label sync. The input
// keeps every `.input` state (focus ring, [aria-invalid], :disabled) unchanged.
export function PasswordField({
  label,
  name,
  value,
  onChange,
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
  autoComplete?: "current-password" | "new-password";
  required?: boolean;
  /** Visual error state (red outline + aria-invalid). */
  error?: boolean;
  /** Persistent helper text shown under the input. */
  hint?: string;
  /** Extra element id to merge into aria-describedby (e.g. the form error). */
  describedById?: string;
}) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy =
    [hintId, describedById].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="caption mb-1 block">
        {label}
      </label>
      <div className="password-field">
        <input
          id={id}
          name={name}
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={error || undefined}
          aria-describedby={describedBy}
          className="input"
        />
        <button
          type="button"
          className="password-field__toggle"
          onClick={() => setReveal((r) => !r)}
          aria-pressed={reveal}
          aria-label={reveal ? "Hide password" : "Show password"}
        >
          {/* Sizing + stroke come from the recipe's `__toggle svg` rule. */}
          {reveal ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      {hint ? (
        <p id={hintId} className="caption mt-1 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
