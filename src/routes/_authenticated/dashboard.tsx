import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, LogOut, Send, Trash2, Landmark, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BUCKETS, CATEGORIES, brl, type Bucket } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Painel — Cofre" },
      { name: "description", content: "Seu orçamento 50/30/20, gastos e agente financeiro de IA." },
      { property: "og:title", content: "Painel — Cofre" },
      { property: "og:description", content: "Seu orçamento 50/30/20, gastos e agente financeiro de IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const BAR: Record<Bucket, string> = { necessidades: "bg-bucket-1", estilo: "bg-bucket-2", futuro: "bg-bucket-3" };

function useFinance() {
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const txs = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").order("occurred_on", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  return { profile, txs };
}

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile, txs } = useFinance();
  const income = Number(profile.data?.monthly_income ?? 5000);
  const totals = useMemo(() => {
    const t: Record<Bucket, number> = { necessidades: 0, estilo: 0, futuro: 0 };
    for (const x of txs.data ?? []) t[x.bucket as Bucket] += Number(x.amount);
    return t;
  }, [txs.data]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="bg-hero text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="font-display text-2xl font-bold">cofre<span className="text-accent">.</span></span>
          <Button variant="heroGhost" size="sm" onClick={signOut}><LogOut className="mr-1 h-4 w-4" />Sair</Button>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-10">
          <p className="text-sm opacity-70">Olá, {profile.data?.display_name ?? "você"} — renda líquida mensal</p>
          <p className="font-display text-5xl font-bold">{brl(income)}</p>
        </div>
      </header>

      <main className="mx-auto -mt-6 max-w-6xl px-6 pb-16">
        <Tabs defaultValue="painel">
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="painel">Painel</TabsTrigger>
            <TabsTrigger value="gastos">Gastos</TabsTrigger>
            <TabsTrigger value="simulador">Simulador</TabsTrigger>
            <TabsTrigger value="investir">Investir</TabsTrigger>
            <TabsTrigger value="ia">Agente IA</TabsTrigger>
          </TabsList>
          <TabsContent value="painel"><Overview income={income} totals={totals} reserve={Number(profile.data?.emergency_reserve ?? 0)} txs={txs.data ?? []} /></TabsContent>
          <TabsContent value="gastos"><Transactions txs={txs.data ?? []} /></TabsContent>
          <TabsContent value="simulador"><Simulator initial={income} /></TabsContent>
          <TabsContent value="investir"><Investments /></TabsContent>
          <TabsContent value="ia"><Chat /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border bg-card p-6 shadow-card ${className}`}>{children}</div>;
}

type Tx = { id: string; description: string; amount: number; bucket: string; category: string; occurred_on: string };

function Overview({ income, totals, reserve, txs }: { income: number; totals: Record<Bucket, number>; reserve: number; txs: Tx[] }) {
  const fixed = totals.necessidades;
  const target = fixed * 6;
  const subs = txs.filter((t) => t.category === "Assinaturas");
  const alerts = BUCKETS.filter((b) => b.key !== "futuro" && totals[b.key] / (income * b.pct) >= 0.8);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {BUCKETS.map((b) => {
        const cap = income * b.pct;
        const used = totals[b.key];
        const pct = Math.min(100, (used / cap) * 100);
        return (
          <Card key={b.key}>
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">{b.label}</h3>
              <span className="text-sm text-muted-foreground">{Math.round(b.pct * 100)}%</span>
            </div>
            <p className="mt-3 font-display text-3xl font-bold">{brl(used)}</p>
            <p className="text-sm text-muted-foreground">de {brl(cap)}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${BAR[b.key]}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{b.hint}</p>
          </Card>
        );
      })}
      <Card className="md:col-span-2">
        <h3 className="font-semibold">Alertas do agente</h3>
        <ul className="mt-4 space-y-3 text-sm">
          {alerts.map((b) => (
            <li key={b.key} className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
              Você já usou {Math.round((totals[b.key] / (income * b.pct)) * 100)}% do teto de {b.label.toLowerCase()}. Segure novas compras — tente a Regra dos 3 Dias.</li>
          ))}
          {subs.length > 0 && (
            <li className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
              {subs.length} assinaturas somam {brl(subs.reduce((s, t) => s + Number(t.amount), 0))}/mês. Cancele as que você pouco usa.</li>
          )}
          {alerts.length === 0 && subs.length === 0 && <li className="text-muted-foreground">Tudo dentro do orçamento. 👏</li>}
        </ul>
      </Card>
      <Card>
        <h3 className="font-semibold">Reserva de emergência</h3>
        <p className="mt-3 font-display text-3xl font-bold">{brl(reserve)}</p>
        <p className="text-sm text-muted-foreground">Meta (6 meses de fixos): {brl(target)}</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-bucket-3" style={{ width: `${target ? Math.min(100, (reserve / target) * 100) : 0}%` }} />
        </div>
      </Card>
    </div>
  );
}

function Transactions({ txs }: { txs: Tx[] }) {
  const qc = useQueryClient();
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [bucket, setBucket] = useState<Bucket>("necessidades");
  const [category, setCategory] = useState<string>(CATEGORIES.necessidades[0] ?? "Outros");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("transactions").insert({ user_id: u.user!.id, description: desc, amount: Number(amount), bucket, category });
    setDesc(""); setAmount("");
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }
  async function del(id: string) {
    await supabase.from("transactions").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }
  const sel = "h-9 rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Landmark className="h-4 w-4" /> Extrato de exemplo (Open Finance em modo demonstração)
        </div>
        <form onSubmit={add} className="grid gap-2 md:grid-cols-5">
          <Input required placeholder="Descrição" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Input required type="number" step="0.01" min="0" placeholder="Valor" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select className={sel} value={bucket} onChange={(e) => { const b = e.target.value as Bucket; setBucket(b); setCategory(CATEGORIES[b][0] ?? "Outros"); }}>
            {BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <select className={sel} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES[bucket].map((c) => <option key={c}>{c}</option>)}
          </select>
          <Button type="submit">Adicionar</Button>
        </form>
      </Card>
      <Card className="p-0">
        <ul className="divide-y">
          {txs.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-6 py-3 text-sm">
              <div>
                <p className="font-medium">{t.description}</p>
                <p className="text-xs text-muted-foreground">{new Date(t.occurred_on + "T12:00").toLocaleDateString("pt-BR")} · {t.category} · {BUCKETS.find((b) => b.key === t.bucket)?.label}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display font-semibold">{brl(Number(t.amount))}</span>
                <button aria-label="Excluir" onClick={() => del(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Simulator({ initial }: { initial: number }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  async function save() {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("profiles").update({ monthly_income: value }).eq("id", u.user!.id);
    qc.invalidateQueries({ queryKey: ["profile"] });
  }
  return (
    <Card>
      <h3 className="text-xl font-semibold">Simule sua renda líquida</h3>
      <p className="mt-4 font-display text-5xl font-bold">{brl(value)}</p>
      <input type="range" min={1500} max={30000} step={100} value={value} onChange={(e) => setValue(Number(e.target.value))} className="mt-6 w-full accent-primary" />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {BUCKETS.map((b) => (
          <div key={b.key} className="rounded-xl bg-muted p-4">
            <div className={`mb-3 h-1.5 w-10 rounded-full ${BAR[b.key]}`} />
            <p className="text-sm text-muted-foreground">{b.label} · {b.pct * 100}%</p>
            <p className="font-display text-2xl font-bold">{brl(value * b.pct)}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">Reserva ideal (3–6 meses de necessidades): {brl(value * 0.5 * 3)} a {brl(value * 0.5 * 6)}</p>
      <Button className="mt-6" onClick={save}>Usar como minha renda</Button>
    </Card>
  );
}

const INVEST = [
  { name: "Tesouro SELIC", yield: "100% da SELIC", guard: "Tesouro Nacional", liq: "Diária (D+1)", for: "Reserva de emergência", risk: "0/10" },
  { name: "Tesouro IPCA+", yield: "IPCA + taxa fixa", guard: "Tesouro Nacional", liq: "Diária (com marcação a mercado)", for: "Longo prazo, proteção da inflação", risk: "0/10" },
  { name: "CDB banco consolidado", yield: "100% a 110% do CDI", guard: "FGC até R$ 250 mil", liq: "Diária ou vencimento", for: "Objetivos de 1 a 3 anos", risk: "1/10" },
  { name: "LCI / LCA", yield: "85% a 95% do CDI, isento de IR", guard: "FGC até R$ 250 mil", liq: "Após 9 meses / vencimento", for: "Médio prazo", risk: "1/10" },
];

function Investments() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {INVEST.map((i) => (
          <Card key={i.name}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-semibold">{i.name}</h3>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">Risco {i.risk}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Rendimento</dt><dd className="font-medium">{i.yield}</dd></div>
              <div><dt className="text-muted-foreground">Garantia</dt><dd className="font-medium">{i.guard}</dd></div>
              <div><dt className="text-muted-foreground">Liquidez</dt><dd className="font-medium">{i.liq}</dd></div>
              <div><dt className="text-muted-foreground">Indicado para</dt><dd className="font-medium">{i.for}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">O FGC garante CDB, LCI e LCA até R$ 250.000 por CPF e por instituição. Conteúdo educativo, não é recomendação individual.</p>
    </div>
  );
}

type Msg = { role: "user" | "assistant"; content: string };

function Chat() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Oi! Sou seu Agente Financeiro. Já olhei seus gastos do mês — pergunte sobre orçamento, compras ou onde guardar dinheiro com segurança." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const suggestions = ["Sobrou R$ 400, devo comprar um tênis?", "O que é o FGC? É seguro?", "Onde corto gastos este mês?"];

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Erro ao falar com o assistente." }));
        throw new Error(err.error ?? "Erro ao falar com o assistente.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: acc }]);
        endRef.current?.scrollIntoView({ behavior: "smooth" });
      }
      if (!acc) setMessages([...next, { role: "assistant", content: "Não consegui responder agora. Tente novamente." }]);
    } catch (e) {
      setMessages([...next, { role: "assistant", content: `⚠️ ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex h-[70vh] flex-col p-0">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><Bot className="h-5 w-5" /></div>
        <div><p className="font-semibold">Agente Financeiro</p><p className="text-xs text-muted-foreground">Só renda fixa garantida · Regra 50/30/20</p></div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground" : "max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed"}>
              {m.content || <span className="animate-pulse text-muted-foreground">Analisando seus números…</span>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} disabled={busy} className="rounded-full border px-3 py-1 text-xs hover:bg-secondary">{s}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pergunte ao agente…" />
          <Button type="submit" size="icon" disabled={busy} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </Card>
  );
}
