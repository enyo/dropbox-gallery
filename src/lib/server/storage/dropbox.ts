import {
	DROPBOX_APP_KEY,
	DROPBOX_APP_SECRET,
	DROPBOX_REFRESH_TOKEN,
	DROPBOX_ACCESS_TOKEN
} from '$app/env/private';
import type { ThumbSize, ThumbResult, ResolvedFolder, ImageDimensions } from '../gallery/types';
import type { StorageProvider, StoredFile } from './types';

const RPC = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

const THUMB_SIZE: Record<ThumbSize, string> = { grid: 'w640h480', full: 'w2048h1536' };

export class DropboxApiError extends Error {
	constructor(
		readonly endpoint: string,
		readonly status: number,
		readonly detail: string
	) {
		super(`Dropbox ${endpoint} failed (${status}): ${detail}`);
		this.name = 'DropboxApiError';
	}

	/** True when the error is Dropbox reporting a missing path/file. */
	get isNotFound(): boolean {
		return this.detail.includes('not_found');
	}
}

interface DropboxEntry {
	'.tag': 'file' | 'folder' | 'deleted';
	id: string;
	name: string;
	content_hash?: string;
	rev?: string;
}

interface ListFolderResult {
	entries: DropboxEntry[];
	cursor: string;
	has_more: boolean;
}

interface SharedLinkMetadata {
	'.tag': 'file' | 'folder';
	name: string;
	path_lower?: string;
}

interface FileMetadataWithMedia {
	media_info?: {
		'.tag': 'pending' | 'metadata';
		metadata?: { '.tag': 'photo' | 'video'; dimensions?: { width: number; height: number } };
	};
}

/** In-memory access token, refreshed from the long-lived refresh token as needed. */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
	if (!DROPBOX_REFRESH_TOKEN) {
		// Fallback for local testing before a refresh token is captured.
		if (DROPBOX_ACCESS_TOKEN) return DROPBOX_ACCESS_TOKEN;
		throw new Error(
			'Dropbox not configured: set DROPBOX_REFRESH_TOKEN (or DROPBOX_ACCESS_TOKEN for local testing).'
		);
	}
	if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

	const res = await fetch(`https://api.dropboxapi.com/oauth2/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: DROPBOX_REFRESH_TOKEN,
			client_id: DROPBOX_APP_KEY,
			client_secret: DROPBOX_APP_SECRET
		})
	});
	if (!res.ok) throw new DropboxApiError('oauth2/token', res.status, await res.text());
	const data = (await res.json()) as { access_token: string; expires_in: number };
	// Refresh 5 minutes before actual expiry.
	cachedToken = {
		value: data.access_token,
		expiresAt: Date.now() + (data.expires_in - 300) * 1000
	};
	return cachedToken.value;
}

async function rpc<T>(endpoint: string, body: unknown): Promise<T> {
	const token = await getAccessToken();
	const res = await fetch(`${RPC}/${endpoint}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) throw new DropboxApiError(endpoint, res.status, await res.text());
	return (await res.json()) as T;
}

export class DropboxStorageProvider implements StorageProvider {
	async resolveFolder(shareUrl: string): Promise<ResolvedFolder> {
		const meta = await rpc<SharedLinkMetadata>('sharing/get_shared_link_metadata', {
			url: shareUrl
		});
		if (meta['.tag'] !== 'folder') throw new Error('That link points to a file, not a folder.');
		if (!meta.path_lower) {
			throw new Error(
				'Could not resolve the folder path. Make sure the Dropbox app has Full Dropbox access.'
			);
		}
		return { id: meta.path_lower, shareUrl, name: meta.name };
	}

	async listFiles(folderId: string): Promise<StoredFile[]> {
		let page = await rpc<ListFolderResult>('files/list_folder', { path: folderId });
		const entries: DropboxEntry[] = [...page.entries];
		while (page.has_more) {
			page = await rpc<ListFolderResult>('files/list_folder/continue', { cursor: page.cursor });
			entries.push(...page.entries);
		}
		return entries
			.filter((e) => e['.tag'] === 'file')
			.map((e) => ({ id: e.id, name: e.name, version: e.content_hash ?? e.rev ?? e.id }));
	}

	async getThumbnail(fileId: string, size: ThumbSize): Promise<ThumbResult> {
		const token = await getAccessToken();
		const res = await fetch(`${CONTENT}/files/get_thumbnail_v2`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Dropbox-API-Arg': JSON.stringify({
					resource: { '.tag': 'path', path: fileId },
					format: { '.tag': 'jpeg' },
					size: { '.tag': THUMB_SIZE[size] },
					mode: { '.tag': 'bestfit' }
				})
			}
		});
		if (!res.ok) throw new DropboxApiError('get_thumbnail_v2', res.status, await res.text());
		return { body: new Uint8Array(await res.arrayBuffer()), contentType: 'image/jpeg' };
	}

	async getOriginalUrl(fileId: string): Promise<string> {
		const data = await rpc<{ link: string }>('files/get_temporary_link', { path: fileId });
		return data.link;
	}

	async getImageDimensions(fileId: string): Promise<ImageDimensions | null> {
		const data = await rpc<FileMetadataWithMedia>('files/get_metadata', {
			path: fileId,
			include_media_info: true
		});
		const dims = data.media_info?.metadata?.dimensions;
		return dims ? { width: dims.width, height: dims.height } : null;
	}
}
