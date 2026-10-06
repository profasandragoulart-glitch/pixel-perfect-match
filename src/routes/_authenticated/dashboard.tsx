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
  const [activeTab, setActiveTab] = useState("painel");
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
          <div>
            <span className="font-display text-2xl font-bold">cofre<span className="text-accent">.</span></span>
            <p className="mt-1 text-xs opacity-60">Seu dinheiro, mais simples.</p>
          </div>
          <Button variant="heroGhost" size="sm" onClick={signOut}><LogOut className="mr-1 h-4 w-4" />Sair</Button>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-12 pt-2">
          <p className="text-sm opacity-70">Olá, {profile.data?.display_name ?? "você"} 👋</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] opacity-60">Renda líquida mensal</p>
              <p className="font-display text-4xl font-bold sm:text-5xl">{brl(income)}</p>
            </div>
            <p className="max-w-sm text-sm leading-relaxed opacity-70">Veja quanto você pode gastar, onde está gastando e qual é o próximo passo.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-6 max-w-6xl px-6 pb-16">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="painel">Painel</TabsTrigger>
            <TabsTrigger value="gastos">Gastos</TabsTrigger>
            <TabsTrigger value="simulador">Simulador</TabsTrigger>
            <TabsTrigger value="investir">Investir</TabsTrigger>
            <TabsTrigger value="ia">Agente IA</TabsTrigger>
          </TabsList>
          <TabsContent value="painel"><Overview income={income} totals={totals} reserve={Number(profile.data?.emergency_reserve ?? 0)} txs={txs.data ?? []} onTabChange={setActiveTab} /></TabsContent>
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

function Overview({ income, totals, reserve, txs, onTabChange }: { income: number; totals: Record<Bucket, number>; reserve: number; txs: Tx[]; onTabChange: (tab: string) => void }) {
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const monthTxs = txs.filter((t) => t.occurred_on?.slice(0, 7) === monthKey);
  const monthTotals = monthTxs.reduce<Record<Bucket, number>>(
    (acc, t) => {
      if (t.bucket in acc) acc[t.bucket as Bucket] += Number(t.amount);
      return acc;
    },
    { necessidades: 0, estilo: 0, futuro: 0 },
  );
  const fixed = monthTotals.necessidades;
  const target = fixed * 6;
  const subs = monthTxs.filter((t) => t.category === "Assinaturas");
  const spent = monthTotals.necessidades + monthTotals.estilo + monthTotals.futuro;
  const available = Math.max(0, income - spent);
  const alerts = BUCKETS.filter((b) => b.key !== "futuro" && monthTotals[b.key] / Math.max(income * b.pct, 1) >= 0.8);
  const latest = monthTxs.slice(0, 4);
  const usage = spent / Math.max(income, 1);
  const health = usage >= 1 ? "Atenção" : alerts.length > 0 ? "Observe seus gastos" : "Você está bem este mês";
  const healthTone = usage >= 1 || alerts.length > 0 ? "bg-warning/10 text-warning" : "bg-bucket-3/10 text-bucket-3";
  const nextAction = usage >= 1
    ? "Pause gastos não essenciais até reorganizar o orçamento."
    : alerts.length > 0
      ? "Revise as categorias que estão perto do limite antes de continuar gastando."
      : reserve < target
        ? "Priorize sua reserva de emergência com uma pequena transferência este mês."
        : "Mantenha o ritmo e registre os próximos gastos para acompanhar seu mês.";

  return (
    <div className="space-y-4">
      <Card className="border-primary/10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Sua saúde financeira</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl font-bold">{health}</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${healthTone}`}>Mês atual</span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">O painel considera apenas os lançamentos deste mês para evitar misturar meses diferentes.</p>
          </div>
          <div className="rounded-xl bg-muted/60 px-4 py-3 md:min-w-[230px]">
            <p className="text-xs text-muted-foreground">Próximo passo</p>
            <p className="mt-1 text-sm font-medium leading-relaxed">{nextAction}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="relative overflow-hidden border-primary/10 bg-primary text-primary-foreground lg:col-span-5">
          <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-white/10" />
          <p className="text-sm opacity-70">Disponível para gastar</p>
          <p className="mt-2 font-display text-4xl font-bold">{brl(available)}</p>
          <p className="mt-2 max-w-xs text-sm opacity-70">Renda menos os lançamentos registrados até agora.</p>
          <div className="mt-6 flex items-center justify-between border-t border-white/15 pt-4 text-sm">
            <span>Gastos no mês</span>
            <span className="font-semibold">{brl(spent)}</span>
          </div>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          <Card>
            <p className="text-sm text-muted-foreground">Gastos registrados</p>
            <p className="mt-2 font-display text-3xl font-bold">{brl(spent)}</p>
            <p className="mt-1 text-xs text-muted-foreground">de {brl(income)} da renda</p>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">Reserva de emergência</p>
            <p className="mt-2 font-display text-3xl font-bold">{brl(reserve)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Meta: 6 meses de necessidades</p>
          </Card>
          <Card className="sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">Regra 50 / 30 / 20</p>
                <p className="text-sm text-muted-foreground">Seu dinheiro dividido em três prioridades.</p>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{spent > income ? "Acima da renda" : Math.round((spent / Math.max(income, 1)) * 100) + "% usado"}</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {BUCKETS.map((b) => {
                const cap = income * b.pct;
                const used = monthTotals[b.key];
                const pct = Math.min(100, (used / Math.max(cap, 1)) * 100);
                return (
                  <div key={b.key} className="rounded-xl bg-muted/60 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{b.label}</span>
                      <span className="text-muted-foreground">{Math.round(b.pct * 100)}%</span>
                    </div>
                    <p className="mt-2 font-display text-xl font-bold">{brl(used)}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                      <div className={"h-full " + BAR[b.key]} style={{ width: pct + "%" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">O que merece sua atenção</h3>
              <p className="mt-1 text-sm text-muted-foreground">Alertas simples para você agir hoje.</p>
            </div>
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <ul className="mt-5 space-y-3 text-sm">
            {alerts.map((b) => (
              <li key={b.key} className="flex gap-3 rounded-xl bg-warning/10 p-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                <span>Você já usou {Math.round((monthTotals[b.key] / (income * b.pct)) * 100)}% do teto de {b.label.toLowerCase()}. Evite novas compras por enquanto.</span>
              </li>
            ))}
            {subs.length > 0 && (
              <li className="flex gap-3 rounded-xl bg-warning/10 p-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                <span>{subs.length} assinatura{subs.length > 1 ? "s" : ""} somam {brl(subs.reduce((s, t) => s + Number(t.amount), 0))}/mês. Vale revisar o que você realmente usa.</span>
              </li>
            )}
            {alerts.length === 0 && subs.length === 0 && (
              <li className="flex flex-col gap-3 rounded-xl bg-bucket-3/10 p-3 sm:flex-row sm:items-center"><span className="flex-1 text-sm text-muted-foreground">Tudo dentro do orçamento. 👏 Continue assim.</span><Button variant="outline" size="sm" onClick={() => onTabChange("simulador")}>Planejar próximo passo</Button></li>
            )}
          </ul>
        </Card>

        <Card className="lg:col-span-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Últimos lançamentos</h3>
              <p className="mt-1 text-sm text-muted-foreground">Seu movimento mais recente.</p>
            </div>
            <span className="text-xs text-muted-foreground">{monthTxs.length} este mês</span>
          </div>
          <div className="mt-4 divide-y">
            {latest.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhum lançamento ainda.</p>}
            {latest.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.description}</p>
                  <p className="text-xs text-muted-foreground">{t.category}</p>
                </div>
                <span className="shrink-0 font-display text-sm font-semibold">{brl(Number(t.amount))}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col justify-between">
          <div><Landmark className="h-5 w-5 text-primary" /><h3 className="mt-3 font-semibold">Contas conectadas</h3><p className="mt-1 text-sm text-muted-foreground">Centralize seus bancos com Open Finance.</p></div>
          <p className="mt-5 text-sm font-medium">Veja a sincronização na seção abaixo.</p>
        </Card>
        <Card className="flex flex-col justify-between">
          <div><span className="text-lg">🎯</span><h3 className="mt-3 font-semibold">Planeje seu salário</h3><p className="mt-1 text-sm text-muted-foreground">Simule sua renda e distribua o dinheiro.</p></div>
          <Button variant="outline" className="mt-5 w-full" onClick={() => onTabChange("simulador")}>Planejar salário →</Button>
        </Card>
        <Card className="flex flex-col justify-between">
          <div><Bot className="h-5 w-5 text-primary" /><h3 className="mt-3 font-semibold">Converse com a IA</h3><p className="mt-1 text-sm text-muted-foreground">Pergunte onde cortar gastos ou como organizar o próximo mês.</p></div>
          <Button variant="outline" className="mt-5 w-full" onClick={() => onTabChange("ia")}>Perguntar à IA →</Button>
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold">Reserva de emergência</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="font-display text-3xl font-bold">{brl(reserve)}</p><p className="text-sm text-muted-foreground">Meta: {brl(target)} (6 meses de necessidades)</p></div>
          <span className="text-sm font-medium">{target ? Math.round(Math.min(100, (reserve / target) * 100)) : 0}% da meta</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-bucket-3" style={{ width: (target ? Math.min(100, (reserve / target) * 100) : 0) + "%" }} /></div>
      </Card>

      <OpenFinanceCard />
    </div>
  );
}
function OpenFinanceCard() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connections = useQuery({
    queryKey: ["open-finance-connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("open_finance_connections")
        .select("id, institution_name, status, execution_status, item_id, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function syncBank(itemId: string) {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre novamente.");

      const response = await fetch("/api/open-finance/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ itemId }),
      });
      const data = (await response.json()) as { error?: string; imported?: number };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar sua conta.");
      setMessage(`Conta atualizada: ${data.imported ?? 0} transações conferidas.`);
      qc.invalidateQueries({ queryKey: ["open-finance-connections"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar sua conta.");
    } finally {
      setLoading(false);
    }
  }

  async function connectBank() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre novamente.");

      const tokenResponse = await fetch("/api/open-finance/connect-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const tokenData = (await tokenResponse.json()) as { accessToken?: string; error?: string };
      if (!tokenResponse.ok || !tokenData.accessToken) throw new Error(tokenData.error ?? "Não foi possível iniciar a conexão.");

      const widget = await loadPluggyWidget(tokenData.accessToken);
      widget.init({
        onSuccess: async ({ item }: { item: { id: string } }) => {
          const saveResponse = await fetch("/api/open-finance/items", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ itemId: item.id }),
          });
          const saveData = (await saveResponse.json()) as { error?: string; institutionName?: string };
          if (!saveResponse.ok) {
            setError(saveData.error ?? "A conexão foi concluída, mas não foi salva.");
            return;
          }
          const syncResponse = await fetch("/api/open-finance/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ itemId: item.id }),
          });
          const syncData = (await syncResponse.json()) as { error?: string; accounts?: number; imported?: number };
          if (!syncResponse.ok) {
            setMessage(`${saveData.institutionName ?? "Conta"} conectada. A sincronização inicial ainda precisa ser concluída.`);
            setError(syncData.error ?? "Não foi possível importar as transações agora.");
          } else {
            setMessage(`${saveData.institutionName ?? "Conta"} conectada: ${syncData.imported ?? 0} transações importadas.`);
          }
          qc.invalidateQueries({ queryKey: ["open-finance-connections"] });
          qc.invalidateQueries({ queryKey: ["transactions"] });
        },
        onError: ({ message }: { message?: string }) => {
          setError(message ?? "Não foi possível concluir a conexão.");
        },
        onClose: () => setLoading(false),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar o Open Finance.");
      setLoading(false);
    }
  }

  return (
    <Card className="md:col-span-3">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Conecte seu banco</h3>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Conecte uma conta pelo Open Finance para trazer seus lançamentos automaticamente e reduzir o trabalho manual.
            Suas credenciais bancárias são tratadas pelo Connect Widget da Pluggy.
          </p>
          {message && <p className="mt-2 text-sm text-bucket-3">{message}</p>}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          {connections.data?.map((connection) => (
            <div key={connection.id} className="mt-3 flex flex-col gap-2 rounded-xl border bg-muted/30 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{connection.institution_name ?? "Instituição financeira"}</p>
                <p className="text-muted-foreground">
                  {connection.status === "UPDATED" ? "Conectada" : connection.status ?? "Verificando"} · última atualização {new Date(connection.updated_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={loading} onClick={() => syncBank(connection.item_id)}>
                Atualizar agora
              </Button>
            </div>
          ))}
        </div>
        <Button onClick={connectBank} disabled={loading} className="shrink-0">
          {loading ? "Conectando..." : connections.data?.length ? "Conectar outra conta" : "Conectar minha conta"}
        </Button>
      </div>
    </Card>
  );
}

async function loadPluggyWidget(connectToken: string) {

  await new Promise<void>((resolve, reject) => {
    const current = document.querySelector('script[data-pluggy-connect="true"]');
    if (current) {
      current.addEventListener("load", () => resolve(), { once: true });
      current.addEventListener("error", () => reject(new Error("Não foi possível carregar o Connect Widget.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.pluggy.ai/pluggy-connect/v2.3.1/pluggy-connect.js";
    script.async = true;
    script.dataset.pluggyConnect = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Não foi possível carregar o Connect Widget."));
    document.head.appendChild(script);
  });

  const PluggyConnect = (window as unknown as { PluggyConnect?: PluggyConnectConstructor }).PluggyConnect;
  if (!PluggyConnect) throw new Error("Connect Widget indisponível.");
  return new PluggyConnect({
    connectToken,
  });
}

type PluggyConnectConstructor = new (options: {
  connectToken: string;
  includeSandbox?: boolean;
  onSuccess?: (data: { item: { id: string } }) => void | Promise<void>;
  onError?: (error: { message?: string }) => void;
  onClose?: () => void;
}) => { init: () => void };

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
