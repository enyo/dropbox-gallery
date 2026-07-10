import { defineConfig } from "vitest/config";
import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
        experimental: {
          // Async Svelte: lets components `await` remote functions and stream in
          // `{#await}` blocks. Required alongside kit's `remoteFunctions` below.
          async: true,
        },
      },
      adapter: adapter({
        // Emulate Cloudflare bindings (D1, etc.) during `vite dev` / `vite preview`,
        // sourced from wrangler.jsonc and persisted under .wrangler/state — the same
        // local SQLite that `wrangler d1 migrations apply --local` writes to.
        platformProxy: { persist: true },
      }),
      experimental: {
        // Declare env vars explicitly in src/env.ts; import typed values from $app/env/private.
        explicitEnvironmentVariables: true,
        // Enable `.remote.ts` query/form/command functions (see admin gallery page).
        remoteFunctions: true,
      },
    }),
  ],
  test: {
    expect: { requireAssertions: true },
    projects: [
      {
        extends: "./vite.config.ts",
        test: {
          name: "server",
          environment: "node",
          include: ["src/**/*.{test,spec}.{js,ts}"],
          exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"],
        },
      },
    ],
  },
});
