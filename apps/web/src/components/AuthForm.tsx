import { useState } from "react";
import { supabase } from "../lib/supabase";
import { PasswordInput } from "./PasswordInput";

interface AuthFormProps {
  onSuccess?: () => void;
  defaultMode?: "login" | "signup";
}

export function AuthForm({ onSuccess, defaultMode = "login" }: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "signup">(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: "https://fleetos-orpin-one.vercel.app" },
          });

    setBusy(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("Check your email to confirm your account, then sign in.");
    } else {
      setMessage("Signed in successfully.");
      onSuccess?.();
    }
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <label>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          placeholder="you@company.co.uk"
        />
      </label>

      <PasswordInput
        required
        minLength={8}
        value={password}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
        placeholder="At least 8 characters"
      />

      {message && <p className="form-message">{message}</p>}

      <button className="primary-button auth-submit" disabled={busy}>
        {busy
          ? "Please wait…"
          : mode === "login"
            ? "Sign in"
            : "Create account"}
      </button>

      <button
        type="button"
        className="switch-mode"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setMessage("");
        }}
      >
        {mode === "login"
          ? "New to FleetOS? Create an account"
          : "Already have an account? Sign in"}
      </button>
    </form>
  );
}