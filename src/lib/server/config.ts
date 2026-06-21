import { env } from '$env/dynamic/private';

/** Read a required env var, throwing a clear error if it is missing. */
function required(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
}

export const adminPassword = () => required('ADMIN_PASSWORD');
export const gallerySigningSecret = () => required('GALLERY_SIGNING_SECRET');
export const sessionSecret = () => required('SESSION_SECRET');

export const dropbox = {
	appKey: () => required('DROPBOX_APP_KEY'),
	appSecret: () => required('DROPBOX_APP_SECRET'),
	refreshToken: () => env.DROPBOX_REFRESH_TOKEN ?? '',
	/** Optional short-lived token for local testing before a refresh token exists. */
	accessToken: () => env.DROPBOX_ACCESS_TOKEN ?? ''
};
