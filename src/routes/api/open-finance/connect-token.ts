import { createFileRoute } from "@tanstack/react-router";
import { createPluggyConnectToken } from "@/lib/open-finance.server";

export const Route = createFileRoute("/api/open-finance/connect-token")({
  server: {
    handlers: {
      POST: ({ request }) => createPluggyConnectToken(request),
    },
  },
});
