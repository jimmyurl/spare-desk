import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wrench } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { USERNAME_PATTERN, normalizeUsername, usernameToEmail } from "@/lib/username";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Sign in — Spares Desk";
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/dashboard" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = normalizeUsername(username);
    if (!USERNAME_PATTERN.test(name)) {
      return toast.error("Usernames are 3–30 characters: letters, numbers, dot, dash or underscore.");
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(name), password });
    setBusy(false);
    if (!error) qc.clear();
    if (error) toast.error(error.message === "Invalid login credentials" ? "Wrong username or password." : error.message);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 font-display text-lg font-bold text-sidebar-accent-foreground">
          <Wrench className="size-5 text-sidebar-primary" /> Spares Desk
        </div>
        <div>
          <h1 className="text-5xl font-extrabold leading-tight text-sidebar-accent-foreground">
            Every part sold,<br />every shilling counted.
          </h1>
          <p className="mt-4 max-w-md text-sidebar-foreground/70">
            Record sales at the counter, watch stock levels, and see daily profit at a glance.
          </p>
        </div>
        <div className="stripe-accent h-3 w-full rounded" />
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-bold">Sign in</h2>
            <p className="text-sm text-muted-foreground">to your shop dashboard</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" autoComplete="username" autoCapitalize="none" required value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw">Password</Label>
            <div className="relative">
              <Input id="pw" type={showPw ? "text" : "password"} className="pr-11" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                aria-pressed={showPw}
                title={showPw ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-xl leading-none"
              >
                {showPw ? "🐵" : "🙈"}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            Sign in
          </Button>
          <p className="text-center text-xs text-muted-foreground">Accounts are created by the shop admin.</p>
        </form>
      </div>
    </div>
  );
}
