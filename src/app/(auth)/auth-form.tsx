"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { authClient } from "@/auth/client";
import { Field } from "./field";

type Mode = "signin" | "signup";

const COPY: Record<
  Mode,
  {
    heading: string;
    submit: string;
    submitting: string;
    fallback: string;
    passwordAutoComplete: "current-password" | "new-password";
    hint?: string;
    link: { href: string; text: string };
  }
> = {
  signin: {
    heading: "Sign in",
    submit: "Sign in",
    submitting: "Signing in…",
    fallback: "Couldn't sign in. Check your email and password.",
    passwordAutoComplete: "current-password",
    link: { href: "/signup", text: "Create an account" },
  },
  signup: {
    heading: "Create account",
    submit: "Create account",
    submitting: "Creating account…",
    fallback: "Couldn't create your account.",
    passwordAutoComplete: "new-password",
    hint: "At least 8 characters.",
    link: { href: "/login", text: "Have an account? Sign in" },
  },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const c = COPY[mode];
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Static id is safe: only one AuthForm renders per page (login/signup are
  // separate routes), so there is no collision risk vs. useId().
  const errorId = "auth-error";
  const describedById = error ? errorId : undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { error: authError } =
        mode === "signin"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: email });
      if (authError) {
        setError(authError.message ?? c.fallback);
        setSubmitting(false);
        return;
      }
      router.push("/");
    } catch {
      setError(c.fallback);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2 className="mb-4">{c.heading}</h2>

      <Field
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
        describedById={describedById}
      />

      <Field
        label="Password"
        name="password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={setPassword}
        autoComplete={c.passwordAutoComplete}
        required
        hint={c.hint}
        describedById={describedById}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="ds-btn ds-btn-ghost p-1"
          >
            {showPassword ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        }
      />

      {error ? (
        <p id={errorId} role="alert" className="mb-3 text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="ds-btn ds-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? c.submitting : c.submit}
      </button>

      <p className="ds-caption mt-4">
        <Link href={c.link.href}>{c.link.text}</Link>
      </p>
    </form>
  );
}
