export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type Bucket = "necessidades" | "estilo" | "futuro";

export const BUCKETS: { key: Bucket; label: string; pct: number; hint: string }[] = [
  { key: "necessidades", label: "Necessidades", pct: 0.5, hint: "Aluguel, contas, mercado, transporte, saúde" },
  { key: "estilo", label: "Estilo de vida", pct: 0.3, hint: "Lazer, restaurantes, assinaturas, compras" },
  { key: "futuro", label: "Futuro & reserva", pct: 0.2, hint: "Reserva de emergência e renda fixa" },
];

export const CATEGORIES: Record<Bucket, string[]> = {
  necessidades: ["Moradia", "Contas", "Mercado", "Transporte", "Saúde", "Outros"],
  estilo: ["Lazer", "Delivery", "Assinaturas", "Compras", "Outros"],
  futuro: ["Reserva", "Investimento"],
};
