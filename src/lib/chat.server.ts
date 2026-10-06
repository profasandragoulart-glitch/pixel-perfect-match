import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId, withRunIdHeader } from "./run-id.server";

const SYSTEM = `Você é o "Agente Financeiro AI", um especialista educativo e protetor do patrimônio do usuário.
Diretrizes:
1. Recomende estritamente a Regra 50/30/20 (50% necessidades, 30% estilo de vida, 20% futuro).
2. Jamais sugira investimentos de alto risco ou renda variável (ações, cripto, derivativos).
3. Recomende apenas Renda Fixa protegida pelo Tesouro Nacional ou FGC (Tesouro SELIC, Tesouro IPCA+, CDB, LCI/LCA). FGC cobre até R$ 250 mil por CPF por instituição.
4. Tom amigável, direto, com exemplos práticos e sem jargão sem explicação.
5. Use a Regra dos 3 Dias para compras por impulso, audite assinaturas pouco usadas e alerte quando uma categoria passar de 80% do teto.
6. Reserva de emergência ideal: 3 a 6 meses de gastos fixos, em liquidez diária.
7. Priorize o mês atual ao analisar gastos; não trate transações antigas como gasto deste mês.
8. Quando houver alerta acima de 80%, explique o impacto em reais e dê uma ação concreta.
9. Quando houver assinaturas, mostre o total mensal e sugira revisar as de menor uso.
10. Nunca invente dados ausentes. Se a pergunta exigir saldo bancário, dívida, patrimônio ou outro dado que não esteja no contexto, diga claramente que esse dado não está disponível.
11. Diferencie educação financeira de recomendação personalizada e deixe claro quando uma decisão depender de dados que faltam.`;

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });

export async function handleChat(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return json(401, "Faça login para usar o assistente.");

  const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
  const supabase = createClient<Database>(process.env['SUPABASE_URL']!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) return json(401, "Sessão inválida.");

  const body = (await request.json()) as { messages?: { role: "user" | "assistant"; content: string }[] };
  const messages: ModelMessage[] = (body.messages ?? [])
    .filter((m) => typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content.slice(0, 4000) }));
  if (!messages.length) return json(400, "Mensagem vazia.");

  const [{ data: profile }, { data: txs }] = await Promise.all([
    supabase.from("profiles").select("monthly_income, emergency_reserve").eq("id", userData.user.id).maybeSingle(),
    supabase.from("transactions").select("description, amount, bucket, category, occurred_on").order("occurred_on", { ascending: false }).limit(200),
  ]);

  const income = Number(profile?.monthly_income ?? 5000);
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthTxs = (txs ?? []).filter((t) => String(t.occurred_on).startsWith(monthKey));
  const totals = { necessidades: 0, estilo: 0, futuro: 0 };
  const categoryTotals: Record<string, number> = {};
  for (const t of monthTxs) {
    if (t.bucket in totals) totals[t.bucket as keyof typeof totals] += Number(t.amount);
    categoryTotals[t.category] = (categoryTotals[t.category] ?? 0) + Number(t.amount);
  }
  const limits = { necessidades: income * 0.5, estilo: income * 0.3, futuro: income * 0.2 };
  const usage = {
    necessidades: limits.necessidades ? totals.necessidades / limits.necessidades : 0,
    estilo: limits.estilo ? totals.estilo / limits.estilo : 0,
    futuro: limits.futuro ? totals.futuro / limits.futuro : 0,
  };
  const subscriptions = monthTxs.filter((t) => t.category === "Assinaturas");
  const topCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const fixed = totals.necessidades;
  const reserve = Number(profile?.emergency_reserve ?? 0);
  const reserveMonths = fixed > 0 ? reserve / fixed : 0;
  const alerts = (Object.keys(usage) as (keyof typeof usage)[])
    .filter((bucket) => usage[bucket] >= 0.8)
    .map((bucket) => `${bucket}: ${Math.round(usage[bucket] * 100)}% do teto`);
  const context = `\\n\\nDADOS FINANCEIROS ATUAIS DO USUÁRIO:\\nMês analisado: ${monthKey}
Renda líquida mensal: R$ ${income.toFixed(2)}
Reserva de emergência: R$ ${reserve.toFixed(2)} (${reserveMonths.toFixed(1)} meses dos gastos de necessidades atuais)
Tetos 50/30/20: necessidades R$ ${limits.necessidades.toFixed(2)}, estilo de vida R$ ${limits.estilo.toFixed(2)}, futuro R$ ${limits.futuro.toFixed(2)}
Gastos do mês: necessidades R$ ${totals.necessidades.toFixed(2)} (${Math.round(usage.necessidades * 100)}%), estilo de vida R$ ${totals.estilo.toFixed(2)} (${Math.round(usage.estilo * 100)}%), futuro R$ ${totals.futuro.toFixed(2)} (${Math.round(usage.futuro * 100)}%)
Alertas acima de 80% do teto: ${alerts.length ? alerts.join(", ") : "nenhum"}
Assinaturas no mês: ${subscriptions.length ? `${subscriptions.length} lançamentos, total R$ ${subscriptions.reduce((sum, t) => sum + Number(t.amount), 0).toFixed(2)}` : "nenhuma"}
Maiores categorias do mês: ${topCategories.length ? topCategories.map(([category, amount]) => `${category}: R$ ${amount.toFixed(2)}`).join("; ") : "nenhuma"}
Transações do mês: ${monthTxs.map((t) => `${t.occurred_on} ${t.description} (${t.category}/${t.bucket}) R$ ${Number(t.amount).toFixed(2)}`).join("; ") || "nenhuma"}`;

  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) return json(500, "Assistente não configurado.");
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system: SYSTEM + context,
    messages,
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  return withRunIdHeader(result.toTextStreamResponse(), runIdFetch);
}
