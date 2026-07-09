import { defineEnvVars } from '@sveltejs/kit/hooks';
import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Standard Schema for an optional string env var: missing/empty becomes ''.
 * Used for the Dropbox tokens, only one of which is needed at a time.
 */
const optionalString: StandardSchemaV1<string | undefined, string> = {
	'~standard': {
		version: 1,
		vendor: 'dropbox-gallery',
		validate: (value) => ({ value: typeof value === 'string' ? value : '' })
	}
};

// Variables without a schema are required, non-empty strings, validated at startup.
export const variables = defineEnvVars({
	DROPBOX_APP_KEY: { description: 'Dropbox app key (App Console → Settings).' },
	DROPBOX_APP_SECRET: { description: 'Dropbox app secret (App Console → Settings).' },
	DROPBOX_REFRESH_TOKEN: {
		schema: optionalString,
		description: 'Long-lived Dropbox refresh token (capture via `npm run auth`).'
	},
	DROPBOX_ACCESS_TOKEN: {
		schema: optionalString,
		description: 'Optional short-lived token for local testing before a refresh token exists.'
	},
	SESSION_SECRET: { description: 'HMAC secret for the admin session cookie.' }
});
