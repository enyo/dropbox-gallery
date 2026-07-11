/**
 * One-time Dropbox OAuth helper.
 * Captures a long-lived refresh token and writes it into .env.
 *
 *   node scripts/dropbox-auth.mjs
 *
 * Requires DROPBOX_APP_KEY and DROPBOX_APP_SECRET to already be in .env.
 *
 * ## Creating the Dropbox app
 *
 * 1. Go to https://www.dropbox.com/developers/apps and click "Create app".
 * 2. Choose an API: "Scoped access".
 * 3. Choose the type of access: "Full Dropbox". "App folder" does not work here —
 *    we resolve public share links via sharing/get_shared_link_metadata, and the
 *    paths it returns live outside any app folder, so a scoped app sees nothing.
 * 4. Name the app, then open its "Permissions" tab and enable the scopes below.
 *    Scopes must be submitted before you generate a token; a refresh token bakes
 *    in the scopes that were active when it was issued, so if you add a scope
 *    later you must re-run this script to mint a new one.
 * 5. On the "Settings" tab, copy the App key and App secret into .env as
 *    DROPBOX_APP_KEY and DROPBOX_APP_SECRET. No redirect URI is needed — this
 *    script omits redirect_uri, which makes Dropbox display a paste-able code.
 *
 * ## Required scopes
 *
 * - account_info.read   — users/get_current_account (scripts/dropbox-check.mjs)
 * - files.metadata.read — files/list_folder, files/list_folder/continue,
 *                         files/get_metadata (image dimensions)
 * - files.content.read  — files/get_thumbnail_v2, files/get_temporary_link
 * - sharing.read        — sharing/get_shared_link_metadata (resolves a share URL
 *                         to a folder path)
 *
 * All are read-only; the gallery never writes to Dropbox.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ENV_PATH = new URL("../.env", import.meta.url);

function readEnv() {
  const raw = readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return { raw, env };
}

function setEnvVar(raw, key, value) {
  const line = `${key}=${value}`;
  return raw.match(new RegExp(`^${key}=.*$`, "m"))
    ? raw.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : raw.trimEnd() + `\n${line}\n`;
}

const { raw, env } = readEnv();
const appKey = env.DROPBOX_APP_KEY;
const appSecret = env.DROPBOX_APP_SECRET;

if (!appKey || !appSecret) {
  console.error("Missing DROPBOX_APP_KEY / DROPBOX_APP_SECRET in .env");
  process.exit(1);
}

const authorizeUrl =
  "https://www.dropbox.com/oauth2/authorize?" +
  new URLSearchParams({
    client_id: appKey,
    response_type: "code",
    token_access_type: "offline", // <- this is what yields a refresh token
  });

console.log('\n1. Open this URL, click "Allow", and copy the code shown:\n');
console.log("   " + authorizeUrl + "\n");

const rl = createInterface({ input, output });
const code = (await rl.question("2. Paste the authorization code here: ")).trim();
rl.close();

const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: appKey,
    client_secret: appSecret,
  }),
});

const data = await res.json();
if (!res.ok || !data.refresh_token) {
  console.error("\nToken exchange failed:", data);
  process.exit(1);
}

writeFileSync(ENV_PATH, setEnvVar(raw, "DROPBOX_REFRESH_TOKEN", data.refresh_token));
console.log(
  "\n✅ Refresh token captured and written to .env. You can delete the access token line if present.",
);
