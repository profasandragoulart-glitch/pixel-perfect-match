import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Cofre" },
      { name: "description", content: "Acesse seu painel financeiro com agente de IA." },
      { property: "og:title", content: "Entrar — Cofre" },
      { property: "og:description", content: "Acesse seu painel financeiro com agente de IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/dashboard" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + "/dashboard" },
      });
      setMsg(error ? error.message : "Conta criada! Confira seu e-mail para confirmar o cadastro.");
    }
    setBusy(false);
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) setMsg(r.error.message);
  }

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <div className="bg-hero hidden flex-col justify-between p-10 text-primary-foreground md:flex">
        <Link to="/" className="font-display text-2xl font-bold">cofre<span className="text-accent">.</span></Link>
        <p className="font-display text-4xl font-semibold leading-tight">"Guarde hoje, decida em 72 horas."</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <h1 className="text-3xl font-bold">{mode === "in" ? "Bem-vindo de volta" : "Criar conta"}</h1>
          <Button type="button" variant="outline" className="w-full" onClick={google}>Continuar com Google</Button>
          <div className="text-center text-xs text-muted-foreground">ou</div>
          <Input type="email" required placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" required minLength={6} placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? "Entrar" : "Cadastrar"}</Button>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
          <button type="button" className="text-sm text-primary underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
