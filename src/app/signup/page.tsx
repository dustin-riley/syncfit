"use client";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { useRouter } from "next/navigation";

export default function Signup() {
  const r = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  return (
    <main className="ds-container p-8 max-w-sm">
      <h1>Create account</h1>
      <form onSubmit={async (e) => { e.preventDefault();
        const { error } = await authClient.signUp.email({ email, password, name: email });
        if (error) setErr(error.message ?? "Signup failed"); else r.push("/"); }}>
        <input className="border rounded p-2 w-full my-2" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
        <input className="border rounded p-2 w-full my-2" type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} />
        <button className="ds-btn ds-btn-primary" type="submit">Sign up</button>
        {err && <p style={{color:"var(--ds-error)"}}>{err}</p>}
      </form>
      <p className="mt-3"><a href="/login">Have an account? Sign in</a></p>
    </main>
  );
}
