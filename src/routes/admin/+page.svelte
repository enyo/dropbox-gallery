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

	let copied = $state(false);

	async function copy(url: string) {
		await navigator.clipboard.writeText(url);
		copied = true;
		setTimeout(() => (copied = false), 1500);
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
						{copied ? 'Copied' : 'Copy'}
					</button>
				</div>
				<a class="open" href={galleryUrl} target="_blank" rel="noreferrer">Open gallery ↗</a>
			</div>
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
</style>
