// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { D1Database } from '@cloudflare/workers-types';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** True when the request carries a valid admin session cookie. */
			isAdmin: boolean;
			/** The authenticated admin's username, when `isAdmin` is true. */
			username?: string;
		}
		// interface PageData {}
		// interface PageState {}
		/** Cloudflare bindings, provided at runtime and emulated locally by platformProxy. */
		interface Platform {
			env: {
				/** D1 database that persists galleries. */
				DB: D1Database;
			};
		}
	}
}

export {};
