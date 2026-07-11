import { building } from "$app/env";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { defineEnvVars } from "@sveltejs/kit/hooks";
import z from "zod";

export const runtimeOnly = <T extends StandardSchemaV1>(schema: T): T =>
  building
    ? (z.transform(
        () => new Error("Tried to access runtime-only environment variable during build"),
      ) as StandardSchemaV1 as T)
    : schema;

// Variables without a schema are required, non-empty strings, validated at startup.
export const variables = defineEnvVars({
  DROPBOX_APP_KEY: {
    schema: runtimeOnly(z.string()),
    description: "Dropbox app key (App Console → Settings).",
  },
  DROPBOX_APP_SECRET: {
    schema: runtimeOnly(z.string()),
    description: "Dropbox app secret (App Console → Settings).",
  },
  DROPBOX_REFRESH_TOKEN: {
    schema: runtimeOnly(z.string()),
    description: "Long-lived Dropbox refresh token (capture via `npm run auth`).",
  },

  SESSION_SECRET: {
    schema: runtimeOnly(z.string()),
    description: "HMAC secret for the admin session cookie.",
  },
});
