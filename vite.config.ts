// The Lovable wrapper provides the app plugins and keeps its preview configured.
// For Vercel builds, register Nitro's Vite plugin directly so it emits Vercel output.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

const isVercel = Boolean(process.env.VERCEL);

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },

  ...(isVercel
    ? {
        // Avoid the wrapper's default Cloudflare Nitro plugin in Vercel builds.
        nitro: false,
        vite: {
          plugins: [
            nitro({
              preset: "vercel",
              output: {
                dir: ".vercel/output",
                serverDir: ".vercel/output/functions/__server.func",
                publicDir: ".vercel/output/static",
              },
            }),
          ],
        },
      }
    : {
        // Preserve the existing Lovable preview target.
        nitro: { preset: "cloudflare" },
      }),
});
