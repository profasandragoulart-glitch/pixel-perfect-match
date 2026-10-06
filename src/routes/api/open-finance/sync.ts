import { createFileRoute } from "@tanstack/react-router";
import { syncPluggyItem } from "@/lib/open-finance.server";

export const Route = createFileRoute("/api/open-finance/sync")({
  server: {
    handlers: {
      POST: ({ request }) => syncPluggyItem(request),
    },
  },
});
