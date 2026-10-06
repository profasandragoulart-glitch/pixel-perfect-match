import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const PLUGGY_BASE_URL = "https://api.pluggy.ai";

type PluggyItem = {
  id: string;
  status?: string;
  executionStatus?: string;
  clientUserId?: string | null;
  connector?: { name?: string };
  lastUpdatedAt?: string | null;
};

let cachedApiKey: { value: string; expiresAt: number } | null = null;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function getPluggyApiKey() {
  const clientId = process.env["PLUGGY_CLIENT_ID"];
  const clientSecret = process.env["PLUGGY_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new Error("Pluggy não configurado no ambiente do servidor.");

  if (cachedApiKey && cachedApiKey.expiresAt > Date.now() + 60_000) {
    return cachedApiKey.value;
  }

  const response = await fetch(`${PLUGGY_BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!response.ok) throw new Error("Não foi possível autenticar na Pluggy.");
  const data = (await response.json()) as { apiKey?: string };
  if (!data.apiKey) throw new Error("A Pluggy não retornou uma API key.");

  cachedApiKey = { value: data.apiKey, expiresAt: Date.now() + 110 * 60_000 };
  return data.apiKey;
}

async function getUserFromRequest(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;

  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const url = process.env["SUPABASE_URL"];
  if (!key || !url) throw new Error("Supabase não configurado no ambiente do servidor.");

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : { supabase, user: data.user };
}

export async function createPluggyConnectToken(request: Request) {
  const auth = await getUserFromRequest(request);
  if (!auth) return json(401, { error: "Faça login para conectar sua conta." });

  try {
    const apiKey = await getPluggyApiKey();
    const response = await fetch(`${PLUGGY_BASE_URL}/connect_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({
        options: {
          clientUserId: auth.user.id,
          avoidDuplicates: true,
        },
      }),
    });
    const data = (await response.json()) as { accessToken?: string; message?: string };
    if (!response.ok || !data.accessToken) {
      return json(502, { error: data.message ?? "Não foi possível criar o Connect Token." });
    }
    return json(200, { accessToken: data.accessToken });
  } catch (error) {
    console.error("[Open Finance] token:", error);
    return json(503, { error: "Open Finance ainda não está configurado no servidor." });
  }
}

export async function savePluggyItem(request: Request) {
  const auth = await getUserFromRequest(request);
  if (!auth) return json(401, { error: "Faça login para salvar a conexão." });

  const body = (await request.json()) as { itemId?: string };
  const itemId = body.itemId?.trim();
  if (!itemId || itemId.length > 100) return json(400, { error: "Item inválido." });

  try {
    const apiKey = await getPluggyApiKey();
    const response = await fetch(`${PLUGGY_BASE_URL}/items/${encodeURIComponent(itemId)}`, {
      headers: { "X-API-KEY": apiKey },
    });
    const item = (await response.json()) as PluggyItem & { message?: string };
    if (!response.ok) return json(502, { error: item.message ?? "Não foi possível verificar a conexão." });

    if (item.clientUserId !== auth.user.id) {
      return json(403, { error: "A conexão não pertence a este usuário." });
    }

    const { error } = await auth.supabase.from("open_finance_connections").upsert(
      {
        user_id: auth.user.id,
        provider: "pluggy",
        item_id: item.id,
        institution_name: item.connector?.name ?? null,
        status: item.status ?? null,
        execution_status: item.executionStatus ?? null,
        last_updated_at: item.lastUpdatedAt ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,item_id" },
    );
    if (error) {
      console.error("[Open Finance] save:", error);
      return json(500, { error: "Não foi possível salvar a conexão no Cofre." });
    }

    return json(200, {
      id: item.id,
      institutionName: item.connector?.name ?? "Instituição financeira",
      status: item.status ?? "UNKNOWN",
    });
  } catch (error) {
    console.error("[Open Finance] item:", error);
    return json(503, { error: "Não foi possível validar a conexão com a Pluggy." });
  }
}


type PluggyAccount = {
  id: string;
  type?: string;
  subtype?: string;
  name?: string | null;
  number?: string | null;
  balance?: number | null;
  currencyCode?: string | null;
};

type PluggyTransaction = {
  id: string;
  accountId: string;
  description?: string | null;
  amount?: number | null;
  date?: string | null;
  type?: "CREDIT" | "DEBIT" | string | null;
  category?: string | null;
};

async function pluggyGet<T>(path: string, apiKey: string) {
  const response = await fetch(PLUGGY_BASE_URL + path, {
    headers: { "X-API-KEY": apiKey },
  });
  const data = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(data.message ?? "Falha ao consultar a Pluggy.");
  return data;
}

function categoryFromTransaction(transaction: PluggyTransaction) {
  const text = (transaction.category ?? "") + " " + (transaction.description ?? "");
  const normalized = text.toLowerCase();
  if (/mercado|supermercado|carrefour|assai|atacad/.test(normalized)) return { bucket: "necessidades", category: "Mercado" };
  if (/aluguel|condominio|energia|água|agua|internet|telefone|luz/.test(normalized)) return { bucket: "necessidades", category: "Contas" };
  if (/uber|99\b|combust|posto|estacionamento|gasolina/.test(normalized)) return { bucket: "necessidades", category: "Transporte" };
  if (/farmacia|farmácia|hospital|clinica|clínica|saude|saúde/.test(normalized)) return { bucket: "necessidades", category: "Saúde" };
  if (/ifood|delivery|restaurante|lanch|bar\b/.test(normalized)) return { bucket: "estilo", category: "Delivery" };
  if (/netflix|spotify|amazon prime|prime video|disney|streaming/.test(normalized)) return { bucket: "estilo", category: "Assinaturas" };
  if (/shopping|loja|roupa|vestuario|vestuário/.test(normalized)) return { bucket: "estilo", category: "Compras" };
  if (/cinema|show|viagem|hotel|lazer/.test(normalized)) return { bucket: "estilo", category: "Lazer" };
  return { bucket: "necessidades", category: "Outros" };
}

export async function syncPluggyItem(request: Request) {
  const auth = await getUserFromRequest(request);
  if (!auth) return json(401, { error: "Faça login para sincronizar suas contas." });

  try {
    const body = (await request.json()) as { itemId?: string };
    const itemId = body.itemId?.trim();
    if (!itemId) return json(400, { error: "Conexão inválida." });

    const { data: connection, error: connectionError } = await auth.supabase
      .from("open_finance_connections")
      .select("id,item_id")
      .eq("user_id", auth.user.id)
      .eq("provider", "pluggy")
      .eq("item_id", itemId)
      .maybeSingle();

    if (connectionError || !connection) return json(404, { error: "Conexão Open Finance não encontrada." });

    const apiKey = await getPluggyApiKey();
    const accountsData = await pluggyGet<{ results?: PluggyAccount[] }>(
      "/accounts?itemId=" + encodeURIComponent(itemId),
      apiKey,
    );
    const accounts = accountsData.results ?? [];
    let imported = 0;

    for (const account of accounts) {
      const accountResult = await auth.supabase.from("open_finance_accounts").upsert(
        {
          connection_id: connection.id,
          user_id: auth.user.id,
          provider: "pluggy",
          account_id: account.id,
          type: account.type ?? null,
          subtype: account.subtype ?? null,
          name: account.name ?? null,
          number: account.number ?? null,
          balance: account.balance ?? null,
          currency_code: account.currencyCode ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider,account_id" },
      );
      if (accountResult.error) throw accountResult.error;

      let next: string | null = "?accountId=" + encodeURIComponent(account.id);
      while (next) {
        const page = await pluggyGet<{ results?: PluggyTransaction[]; next?: string | null }>(
          "/v2/transactions" + next,
          apiKey,
        );
        const expenses = (page.results ?? []).filter(
          (transaction) => transaction.type === "DEBIT" && transaction.amount != null && transaction.date,
        );

        if (expenses.length) {
          const rows = expenses.map((transaction) => {
            const classification = categoryFromTransaction(transaction);
            return {
              user_id: auth.user.id,
              description: transaction.description?.trim() || "Transação bancária",
              amount: Math.abs(Number(transaction.amount)),
              bucket: classification.bucket,
              category: classification.category,
              occurred_on: transaction.date!.slice(0, 10),
              source: "open_finance",
              provider: "pluggy",
              provider_transaction_id: transaction.id,
              provider_account_id: account.id,
            };
          });
          const { error } = await auth.supabase
            .from("transactions")
            .upsert(rows, { onConflict: "provider,provider_transaction_id", ignoreDuplicates: false });
          if (error) throw error;
          imported += rows.length;
        }
        next = page.next ?? null;
      }
    }

    await auth.supabase
      .from("open_finance_connections")
      .update({ last_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", connection.id)
      .eq("user_id", auth.user.id);

    return json(200, { accounts: accounts.length, imported });
  } catch (error) {
    console.error("[Open Finance] sync:", error);
    return json(502, { error: "Não foi possível sincronizar os dados bancários agora." });
  }
}
