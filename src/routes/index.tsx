import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Gauge, ShieldCheck, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cofre — Finanças com Agente de IA e Regra 50/30/20" },
      { name: "description", content: "Organize seu salário com a regra 50/30/20, controle tetos de gastos e invista sem risco com ajuda de um agente de IA." },
      { property: "og:title", content: "Cofre — Finanças com Agente de IA" },
      { property: "og:description", content: "Regra 50/30/20, tetos de gastos e renda fixa segura, guiados por IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Bot, title: "Assistente IA", text: "Dicas personalizadas e alertas antes do mês acabar." },
  { icon: Gauge, title: "Teto de gastos", text: "Limites automáticos por categoria com aviso aos 80%." },
  { icon: Calculator, title: "Planejador 50/30/20", text: "Simule qualquer salário e veja a divisão ideal." },
  { icon: ShieldCheck, title: "Renda fixa segura", text: "Tesouro SELIC, CDB e LCI/LCA garantidos." },
];

function Index() {
  return (
    <main className="min-h-screen">
      <section className="bg-hero text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-8">
          <nav className="flex items-center justify-between">
            <span className="font-display text-2xl font-bold">cofre<span className="text-accent">.</span></span>
            <Button asChild variant="heroGhost" size="sm"><Link to="/auth">Entrar</Link></Button>
          </nav>
          <div className="mt-24 max-w-3xl">
            <p className="text-sm uppercase tracking-[0.2em] text-accent">50 · 30 · 20</p>
            <h1 className="mt-4 text-5xl font-bold leading-[1.05] md:text-7xl">
              Seu salário, dividido com calma. Seu futuro, sem risco.
            </h1>
            <p className="mt-6 max-w-xl text-lg opacity-80">
              Um painel financeiro com agente de IA que lê seus gastos, avisa antes de estourar o orçamento e indica só investimentos garantidos.
            </p>
            <div className="mt-10 flex gap-3">
              <Button asChild variant="hero" size="lg"><Link to="/auth">Começar grátis</Link></Button>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-16 md:grid-cols-4">
        {features.map((f) => (
          <div key={f.title} className="rounded-2xl border bg-card p-6 shadow-card">
            <f.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
