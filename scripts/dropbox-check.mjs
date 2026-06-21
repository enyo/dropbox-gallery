// Smoke-test Dropbox connectivity: refresh -> access token -> get_current_account.
//   node scripts/dropbox-check.mjs
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const env = Object.fromEntries(
	raw.split('\n').map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]])
);

const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
	method: 'POST',
	headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
	body: new URLSearchParams({
		grant_type: 'refresh_token',
		refresh_token: env.DROPBOX_REFRESH_TOKEN,
		client_id: env.DROPBOX_APP_KEY,
		client_secret: env.DROPBOX_APP_SECRET
	})
});
const tokenData = await tokenRes.json();
if (!tokenRes.ok) {
	console.error('❌ refresh failed:', tokenData);
	process.exit(1);
}
console.log('✅ refresh -> access token OK (expires in', tokenData.expires_in, 's)');

const acctRes = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
	method: 'POST',
	headers: { Authorization: `Bearer ${tokenData.access_token}` }
});
const acct = await acctRes.json();
if (!acctRes.ok) {
	console.error('❌ account call failed:', acct);
	process.exit(1);
}
console.log('✅ connected as:', acct.name?.display_name, '(' + acct.email + ')');
