"use client";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { useRouter } from "next/navigation";

export default function Login() {
  const r = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  return (
    <main className="ds-container p-8 max-w-sm">
      <h1>Sign in</h1>
      <form onSubmit={async (e) => { e.preventDefault();
        const { error } = await authClient.signIn.email({ email, password });
        if (error) setErr(error.message ?? "Sign in failed"); else r.push("/"); }}>
        <input className="border rounded p-2 w-full my-2" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
        <input className="border rounded p-2 w-full my-2" type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} />
        <button className="ds-btn ds-btn-primary" type="submit">Sign in</button>
        {err && <p style={{color:"var(--ds-error)"}}>{err}</p>}
      </form>
    </main>
  );
}
