<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// `values` is only present on validation-failure results from the mint action.
	const values = $derived(
		form && 'values' in form
			? (form.values as { link: string; title: string; expiry: string })
			: null
	);

	let copiedUrl = $state<string | null>(null);

	async function copy(url: string) {
		await navigator.clipboard.writeText(url);
		copiedUrl = url;
		setTimeout(() => (copiedUrl = null), 1500);
	}

	const fmtDate = (ms: number) =>
		new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

	type GalleryRow = {
		id: string;
		title: string;
		url: string;
		createdAt: number;
		expiresAt: number | null;
		revokedAt: number | null;
	};
	function galleryStatus(g: GalleryRow): 'live' | 'expired' | 'revoked' {
		if (g.revokedAt !== null) return 'revoked';
		if (g.expiresAt !== null && Date.now() > g.expiresAt) return 'expired';
		return 'live';
	}
</script>

<div class="wrap">
	<header>
		<h1>Gallery admin</h1>
		{#if data.isAdmin}
			<form method="POST" action="?/logout" use:enhance>
				<button class="link" type="submit">Log out</button>
			</form>
		{/if}
	</header>

	{#if !data.isAdmin}
		<form class="card" method="POST" action="?/login" use:enhance>
			<label for="password">Admin password</label>
			<input
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
			/>
			{#if form?.error}<p class="error">{form.error}</p>{/if}
			<button class="primary" type="submit">Sign in</button>
		</form>
	{:else}
		<form class="card" method="POST" action="?/mint" use:enhance>
			<label for="link">Dropbox folder link</label>
			<input
				id="link"
				name="link"
				type="url"
				placeholder="https://www.dropbox.com/scl/fo/…"
				value={values?.link ?? ''}
				required
			/>

			<label for="title"
				>Title <span class="hint">(optional — defaults to the folder name)</span></label
			>
			<input id="title" name="title" type="text" value={values?.title ?? ''} />

			<label for="expiry">Link expires</label>
			<select id="expiry" name="expiry" value={values?.expiry ?? '90'}>
				<option value="30">in 30 days</option>
				<option value="90">in 90 days</option>
				<option value="365">in 1 year</option>
				<option value="never">never</option>
			</select>

			{#if form?.error}<p class="error">{form.error}</p>{/if}
			<button class="primary" type="submit">Generate gallery link</button>
		</form>

		{#if form?.galleryUrl}
			{@const galleryUrl = form.galleryUrl}
			<div class="card result">
				<p class="result-title">Gallery link for “{form.title}”</p>
				<div class="result-row">
					<input type="text" readonly value={galleryUrl} />
					<button class="primary" type="button" onclick={() => copy(galleryUrl)}>
						{copiedUrl === galleryUrl ? 'Copied' : 'Copy'}
					</button>
				</div>
				<a class="open" href={galleryUrl} target="_blank" rel="noreferrer">Open gallery ↗</a>
			</div>
		{/if}

		{#if data.galleries.length}
			<section class="galleries">
				<h2>Your galleries</h2>
				<ul>
					{#each data.galleries as g (g.id)}
						{@const st = galleryStatus(g)}
						<li class:inactive={st !== 'live'}>
							<div class="g-main">
								<span class="g-title">{g.title}</span>
								<span class="g-meta">
									Created {fmtDate(g.createdAt)} ·
									{#if g.expiresAt === null}never expires{:else}expires {fmtDate(g.expiresAt)}{/if}
									{#if st !== 'live'}<span class="badge {st}">{st}</span>{/if}
								</span>
							</div>
							<div class="g-actions">
								<button class="link" type="button" onclick={() => copy(g.url)}>
									{copiedUrl === g.url ? 'Copied' : 'Copy link'}
								</button>
								{#if st === 'live'}
									<form
										method="POST"
										action="?/revoke"
										use:enhance={({ cancel }) => {
											if (!confirm(`Revoke “${g.title}”? Viewers will lose access.`)) cancel();
										}}
									>
										<input type="hidden" name="id" value={g.id} />
										<button class="danger" type="submit">Revoke</button>
									</form>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>

<style>
	.wrap {
		max-width: 560px;
		margin: 8vh auto 0;
		padding: 0 24px 80px;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 1.4em;
	}
	h1 {
		font-size: 1.6rem;
		margin: 0;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 22px;
		margin-bottom: 18px;
	}
	label {
		font-size: 0.9rem;
		color: var(--color-text-dim);
		margin-top: 6px;
	}
	.hint {
		font-weight: 400;
		opacity: 0.7;
	}
	input,
	select {
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
		color: var(--color-text);
		border-radius: 8px;
		padding: 0.6em 0.7em;
		width: 100%;
	}
	input:focus,
	select:focus {
		outline: 2px solid var(--color-accent);
		border-color: transparent;
	}
	button.primary {
		background: var(--color-accent);
		color: var(--color-accent-text);
		border: none;
		border-radius: 8px;
		padding: 0.65em 1.1em;
		font-weight: 600;
		margin-top: 12px;
	}
	button.link {
		background: none;
		border: none;
		color: var(--color-text-dim);
		text-decoration: underline;
		padding: 0;
	}
	.error {
		color: var(--color-danger);
		margin: 4px 0 0;
		font-size: 0.9rem;
	}
	.result-title {
		margin: 0 0 4px;
		font-weight: 600;
	}
	.result-row {
		display: flex;
		gap: 8px;
	}
	.result-row button {
		margin-top: 0;
		white-space: nowrap;
	}
	.open {
		margin-top: 10px;
		font-size: 0.9rem;
	}
	.galleries {
		margin-top: 28px;
	}
	.galleries h2 {
		font-size: 1.05rem;
		margin: 0 0 10px;
	}
	.galleries ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.galleries li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 12px 16px;
	}
	.galleries li.inactive {
		opacity: 0.6;
	}
	.g-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.g-title {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.g-meta {
		font-size: 0.82rem;
		color: var(--color-text-dim);
	}
	.badge {
		display: inline-block;
		margin-left: 4px;
		padding: 0 6px;
		border-radius: 999px;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		border: 1px solid var(--color-border);
	}
	.badge.revoked {
		color: var(--color-danger);
		border-color: var(--color-danger);
	}
	.g-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		white-space: nowrap;
	}
	button.danger {
		background: none;
		border: 1px solid var(--color-danger);
		color: var(--color-danger);
		border-radius: 8px;
		padding: 0.35em 0.8em;
		font-size: 0.85rem;
	}
</style>
