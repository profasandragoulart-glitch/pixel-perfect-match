import { createFileRoute } from "@tanstack/react-router";
import { receivePluggyWebhook } from "@/lib/open-finance.server";

export const Route = createFileRoute("/api/open-finance/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => receivePluggyWebhook(request),
    },
  },
});
