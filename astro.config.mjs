// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  // Astro sessions are unused; without this the Cloudflare adapter auto-provisions a SESSION KV namespace on deploy.
  session: false,
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  // No astro:assets usage yet; "passthrough" avoids an implicit Cloudflare Images (IMAGES) binding on deploy.
  adapter: cloudflare({ imageService: "passthrough" }),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
