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
Responda em português do Brasil, em texto curto com markdown simples. Use os dados financeiros do usuário abaixo.`;

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });

export async function handleChat(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return json(401, "Faça login para usar o assistente.");

  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const supabase = createClient<Database>(process.env.SUPABASE_URL!, key, {
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
    supabase.from("transactions").select("description, amount, bucket, category, occurred_on").order("occurred_on", { ascending: false }).limit(100),
  ]);
  const income = Number(profile?.monthly_income ?? 5000);
  const totals = { necessidades: 0, estilo: 0, futuro: 0 } as Record<string, number>;
  for (const t of txs ?? []) totals[t.bucket] = (totals[t.bucket] ?? 0) + Number(t.amount);
  const context = `\n\nDADOS DO USUÁRIO:\nRenda líquida mensal: R$ ${income.toFixed(2)}
Reserva de emergência atual: R$ ${Number(profile?.emergency_reserve ?? 0).toFixed(2)}
Tetos: necessidades R$ ${(income * 0.5).toFixed(2)}, estilo de vida R$ ${(income * 0.3).toFixed(2)}, futuro R$ ${(income * 0.2).toFixed(2)}
Gasto no mês: necessidades R$ ${totals.necessidades.toFixed(2)}, estilo de vida R$ ${totals.estilo.toFixed(2)}, futuro R$ ${totals.futuro.toFixed(2)}
Transações: ${(txs ?? []).map((t) => `${t.occurred_on} ${t.description} (${t.category}/${t.bucket}) R$ ${Number(t.amount).toFixed(2)}`).join("; ")}`;

  const apiKey = process.env.LOVABLE_API_KEY;
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
