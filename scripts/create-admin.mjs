// Create or update an admin user in the D1 `users` table.
//
//   pnpm admin:create            # writes to the LOCAL D1 (dev)
//   pnpm admin:create --remote   # writes to the PRODUCTION D1
//
// Interactively prompts for a username and (hidden) password, hashes it with the
// same PBKDF2 code the app uses, and upserts the row via wrangler. Re-running
// with an existing username rotates that user's password.
//
// Non-interactive (CI/scripts): pipe three lines — username, password, confirm:
//   printf 'alice\nsecret\nsecret\n' | pnpm admin:create

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';
import { hashPassword } from '../src/lib/server/password.ts';

const remote = process.argv.includes('--remote');
const interactive = input.isTTY && typeof input.setRawMode === 'function';

// Control codes handled during hidden input (avoids embedding raw control chars).
const CR = 13;
const LF = 10;
const EOT = 4; // Ctrl-D
const ETX = 3; // Ctrl-C
const BS = 8;
const DEL = 127;

/** Read a line from a real TTY without echoing it (for passwords). */
function readHiddenTty(prompt) {
	return new Promise((resolve) => {
		output.write(prompt);
		input.setRawMode(true);
		input.resume();
		let value = '';
		const onData = (buf) => {
			for (const ch of buf.toString('utf8')) {
				const code = ch.charCodeAt(0);
				if (code === CR || code === LF || code === EOT) {
					input.setRawMode(false);
					input.pause();
					input.removeListener('data', onData);
					output.write('\n');
					resolve(value);
					return;
				} else if (code === ETX) {
					input.setRawMode(false);
					output.write('\n');
					process.exit(130);
				} else if (code === BS || code === DEL) {
					value = value.slice(0, -1);
				} else {
					value += ch;
				}
			}
		};
		input.on('data', onData);
	});
}

async function readAllStdin() {
	const chunks = [];
	for await (const chunk of input) chunks.push(chunk);
	return Buffer.concat(chunks).toString('utf8');
}

let username, password, confirm;
if (interactive) {
	const rl = createInterface({ input, output });
	username = (await rl.question('Admin username: ')).trim();
	rl.close();
	password = await readHiddenTty('Admin password (hidden): ');
	confirm = await readHiddenTty('Confirm password (hidden): ');
} else {
	const lines = (await readAllStdin()).split(/\r?\n/);
	username = (lines[0] ?? '').trim();
	password = lines[1] ?? '';
	confirm = lines.length > 2 ? lines[2] : password;
}

if (!username || !password) {
	console.error('Username and password are both required.');
	process.exit(1);
}
if (password !== confirm) {
	console.error('Passwords do not match.');
	process.exit(1);
}

const passwordHash = await hashPassword(password);
const usernameSql = username.replace(/'/g, "''");
const sql =
	`INSERT INTO users (username, password_hash, created_at) ` +
	`VALUES ('${usernameSql}', '${passwordHash}', ${Date.now()}) ` +
	`ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash;`;

const target = remote ? '--remote' : '--local';
console.log(`Writing user "${username}" to the ${remote ? 'REMOTE' : 'local'} D1…`);
const res = spawnSync(
	'pnpm',
	['exec', 'wrangler', 'd1', 'execute', 'dropbox-gallery', target, '--command', sql],
	{ stdio: 'inherit' }
);

if (res.status === 0) {
	console.log(`\n✓ Admin "${username}" is ready. Sign in at /admin.`);
}
process.exit(res.status ?? 1);
