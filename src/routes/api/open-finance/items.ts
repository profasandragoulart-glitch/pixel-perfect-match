import { createFileRoute } from "@tanstack/react-router";
import { savePluggyItem } from "@/lib/open-finance.server";

export const Route = createFileRoute("/api/open-finance/items")({
  server: {
    handlers: {
      POST: ({ request }) => savePluggyItem(request),
    },
  },
});
