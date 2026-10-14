// @lovable.dev/vite-tanstack-config already includes the TanStack Start,
// React, Tailwind, path aliases, and Nitro plugins. Avoid registering duplicate plugins.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL);

export default defineConfig({
  // Override the wrapper's default Cloudflare target only on Vercel.
  nitro: isVercel ? { preset: "vercel" } : { preset: "cloudflare" },

  tanstackStart: {
    // Keep the existing SSR error wrapper entry.
    server: { entry: "server" },
  },
});
