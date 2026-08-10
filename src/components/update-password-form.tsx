"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { updatePassword } from "@/app/actions/auth";
import { createClientSupabaseClient } from "@/lib/supabase/client";

type BrowserState = { error?: string; message?: string } | undefined;

export function UpdatePasswordForm() {
  const [serverState, serverAction, serverPending] = useActionState(updatePassword, undefined);
  const [browserState, setBrowserState] = useState<BrowserState>();
  const [mode, setMode] = useState<"checking" | "server" | "browser">("checking");
  const [browserPending, setBrowserPending] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState({ password: false, confirmation: false });
  const browserClient = useRef<ReturnType<typeof createClientSupabaseClient> | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const recoveryHash = typeof window !== "undefined" && window.location.hash.includes("type=recovery");
    let client: ReturnType<typeof createClientSupabaseClient> | null = null;
    try {
      client = createClientSupabaseClient();
      browserClient.current = client;
    } catch {
      void Promise.resolve().then(() => { if (active) setMode("server"); });
      return () => { active = false; };
    }

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (active && event === "PASSWORD_RECOVERY" && session) setMode("browser");
    });

    if (!recoveryHash) {
      void Promise.resolve().then(() => { if (active) setMode("server"); });
    } else {
      void client.auth.getSession().then(({ data: { session } }) => { if (active) setMode(session ? "browser" : "server"); });
    }

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submitBrowserRecovery(event: FormEvent<HTMLFormElement>) {
    if (mode !== "browser") return;
    event.preventDefault();
    if (password.length < 8) return setBrowserState({ error: "Use a password of at least 8 characters." });
    if (password !== confirmation) return setBrowserState({ error: "Passwords do not match." });
    const client = browserClient.current;
    if (!client) return setBrowserState({ error: "This reset link is no longer valid. Request a new one." });

    setBrowserPending(true);
    setBrowserState(undefined);
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      setBrowserState({ error: "The password could not be updated. Request a new reset link and try again." });
      setBrowserPending(false);
      return;
    }
    await client.auth.signOut();
    router.push("/login?password=updated");
  }

  const state = mode === "browser" ? browserState : serverState;
  const pending = mode === "browser" ? browserPending : serverPending;
  return <form action={serverAction} onSubmit={(event) => void submitBrowserRecovery(event)} className="mt-7 space-y-4">
    <PasswordControl id="recovery-new-password" name="password" label="New password" value={password} visible={visible.password} onChange={setPassword} onToggle={() => setVisible((current) => ({ ...current, password: !current.password }))} />
    <PasswordControl id="recovery-confirm-password" name="confirmation" label="Confirm password" value={confirmation} visible={visible.confirmation} onChange={setConfirmation} onToggle={() => setVisible((current) => ({ ...current, confirmation: !current.confirmation }))} />
    {state?.error ? <p role="alert" className="rounded-md border border-danger/20 bg-danger-soft p-3 text-xs leading-5 text-danger">{state.error}</p> : null}
    {state?.message ? <p role="status" className="rounded-md border border-success/20 bg-success-soft p-3 text-xs leading-5 text-success">{state.message}</p> : null}
    <button disabled={pending || mode === "checking"} className="flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary-strong disabled:opacity-60">{mode === "checking" ? "Preparing secure reset…" : pending ? "Updating password…" : "Update password"}</button>
  </form>;
}

function PasswordControl({ id, name, label, value, visible, onChange, onToggle }: { id: string; name: string; label: string; value: string; visible: boolean; onChange: (value: string) => void; onToggle: () => void }) {
  const entryLabel = name === "password" ? "new entry" : "confirmation entry";
  return <label htmlFor={id} className="block text-xs font-semibold text-muted-foreground">{label}<span className="mt-2 flex h-11 items-center gap-3 rounded-md border border-input bg-card px-3 focus-within:border-ring"><LockKeyhole size={16} className="text-muted-foreground" /><input id={id} name={name} type={visible ? "text" : "password"} required minLength={8} maxLength={72} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" /><button type="button" aria-label={visible ? `Conceal ${entryLabel}` : `Reveal ${entryLabel}`} aria-pressed={visible} onClick={onToggle} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-primary">{visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}</button></span></label>;
}
