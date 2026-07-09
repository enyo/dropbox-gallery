<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const enc = (id: string) => encodeURIComponent(id);
	const thumbUrl = (img: { id: string; version: string }) =>
		`/admin/g/${data.gallery.id}/thumb/${enc(img.id)}?v=${img.version}`;

	const fmtDate = (ms: number) =>
		new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	const toDateInput = (ms: number) => new Date(ms).toISOString().slice(0, 10);

	// Editable expiry: a date field plus a "never" toggle. Kept in sync with the
	// persisted value — on first render, and again after a save reloads `data`.
	// When expiry is "never", the (disabled) date defaults 90 days out so
	// un-checking "never" lands on something sensible.
	let never = $state(true);
	let expiresDate = $state('');
	$effect(() => {
		never = data.gallery.expiresAt === null;
		expiresDate = toDateInput(data.gallery.expiresAt ?? Date.now() + 90 * 24 * 60 * 60 * 1000);
	});

	let copied = $state(false);
	async function copyLink() {
		await navigator.clipboard.writeText(data.gallery.url);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	// Engagement counters are keyed by filename, so they attach to the photo list by
	// name. A photo since renamed or deleted in Dropbox is no longer in the listing;
	// its counters are surfaced as "removed" rows so nothing is silently dropped —
	// unless the listing itself failed to load, in which case we can't tell.
	const activity = $derived(data.activity);
	const statsByName = $derived(new Map(activity.perImage.map((s) => [s.name, s])));
	const totalEvents = $derived(
		activity.totalZooms + activity.totalDownloads + activity.downloadAll
	);
	const currentNames = $derived(new Set(data.photos.map((p) => p.name)));
	const removedStats = $derived(
		data.photosError ? [] : activity.perImage.filter((s) => !currentNames.has(s.name))
	);
</script>

<svelte:head>
	<title>{data.gallery.title} · admin</title>
</svelte:head>

<div class="wrap">
	<header>
		<a class="back" href="/admin">← All galleries</a>
		<div class="account">
			{#if data.username}<span class="whoami">Signed in as {data.username}</span>{/if}
			<form method="POST" action="/admin?/logout" use:enhance>
				<button class="link" type="submit">Log out</button>
			</form>
		</div>
	</header>

	<div class="title-row">
		<h1>{data.gallery.title}</h1>
		{#if data.gallery.status !== 'live'}
			<span class="badge {data.gallery.status}">{data.gallery.status}</span>
		{/if}
	</div>
	<p class="sub">
		Created {fmtDate(data.gallery.createdAt)} ·
		{#if data.gallery.expiresAt === null}never expires{:else}expires {fmtDate(
				data.gallery.expiresAt
			)}{/if}
		· {data.photos.length} photo{data.photos.length === 1 ? '' : 's'}
	</p>
	<div class="link-row">
		<input type="text" readonly value={data.gallery.url} />
		<button class="link" type="button" onclick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
		<a class="open" href={data.gallery.url} target="_blank" rel="noreferrer">Open ↗</a>
	</div>

	<section class="card">
		<h2>Settings</h2>
		<form method="POST" action="?/update" use:enhance>
			<label for="title">Title</label>
			<input id="title" name="title" type="text" value={data.gallery.title} required />

			<label for="expires">Link expires</label>
			<div class="expiry">
				<input id="expires" name="expires" type="date" bind:value={expiresDate} disabled={never} />
				<label class="check">
					<input type="checkbox" name="never" bind:checked={never} />
					Never expires
				</label>
			</div>

			{#if form?.error}<p class="error">{form.error}</p>{/if}
			{#if form?.saved}<p class="ok">Saved.</p>{/if}
			<button class="primary" type="submit">Save changes</button>
		</form>
	</section>

	<section class="card">
		<h2>Activity</h2>
		{#if totalEvents === 0}
			<p class="muted">No views or downloads recorded yet.</p>
		{:else}
			<div class="stats">
				<div class="stat">
					<strong>{activity.totalZooms}</strong><span
						>image {activity.totalZooms === 1 ? 'view' : 'views'}</span
					>
				</div>
				<div class="stat">
					<strong>{activity.totalDownloads}</strong><span
						>image {activity.totalDownloads === 1 ? 'download' : 'downloads'}</span
					>
				</div>
				<div class="stat">
					<strong>{activity.downloadAll}</strong><span>“download all”</span>
				</div>
			</div>
		{/if}
	</section>

	<section class="photos">
		<h2>Photos</h2>
		{#if data.photosError}
			<p class="muted">Couldn’t load photos — the source folder may be unavailable.</p>
		{:else if data.photos.length === 0 && removedStats.length === 0}
			<p class="muted">This gallery has no photos.</p>
		{:else}
			<ul>
				{#each data.photos as photo (photo.id)}
					{@const s = statsByName.get(photo.name)}
					<li>
						<img class="thumb" src={thumbUrl(photo)} alt={photo.name} loading="lazy" />
						<span class="name">{photo.name}</span>
						<span class="metrics">
							<span class="metric" class:zero={!s?.zooms} title="Views">
								<svg viewBox="0 0 16 16" aria-hidden="true"
									><path
										d="M8 3C4.5 3 1.7 5.1 1 8c.7 2.9 3.5 5 7 5s6.3-2.1 7-5c-.7-2.9-3.5-5-7-5Zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7Zm0-1.7a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z"
									/></svg
								>{s?.zooms ?? 0}
							</span>
							<span class="metric" class:zero={!s?.downloads} title="Downloads">
								<svg viewBox="0 0 16 16" aria-hidden="true"
									><path
										d="M8 1v7.4l2.3-2.3 1.1 1L8 11.6 3.6 7.1l1.1-1L7 8.4V1h1ZM3 13h10v1.5H3V13Z"
									/></svg
								>{s?.downloads ?? 0}
							</span>
						</span>
					</li>
				{/each}
				{#each removedStats as s (s.name)}
					<li class="removed-row">
						<span class="thumb placeholder" aria-hidden="true"></span>
						<span class="name">{s.name}</span>
						<span class="gone" title="No longer in the Dropbox folder">removed</span>
						<span class="metrics">
							<span class="metric" class:zero={!s.zooms} title="Views">
								<svg viewBox="0 0 16 16" aria-hidden="true"
									><path
										d="M8 3C4.5 3 1.7 5.1 1 8c.7 2.9 3.5 5 7 5s6.3-2.1 7-5c-.7-2.9-3.5-5-7-5Zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7Zm0-1.7a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z"
									/></svg
								>{s.zooms}
							</span>
							<span class="metric" class:zero={!s.downloads} title="Downloads">
								<svg viewBox="0 0 16 16" aria-hidden="true"
									><path
										d="M8 1v7.4l2.3-2.3 1.1 1L8 11.6 3.6 7.1l1.1-1L7 8.4V1h1ZM3 13h10v1.5H3V13Z"
									/></svg
								>{s.downloads}
							</span>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="card danger-zone">
		<h2>Delete gallery</h2>
		<p class="muted">
			Permanently removes this gallery. The link stops working immediately (once the edge cache
			lapses). This cannot be undone.
		</p>
		<form
			method="POST"
			action="?/delete"
			use:enhance={({ cancel }) => {
				if (!confirm(`Delete “${data.gallery.title}”? This cannot be undone.`)) cancel();
			}}
		>
			<button class="danger" type="submit">Delete gallery</button>
		</form>
	</section>
</div>

<style>
	.wrap {
		max-width: 720px;
		margin: 6vh auto 0;
		padding: 0 24px 80px;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 1.6em;
	}
	.back {
		text-decoration: none;
		font-size: 0.9rem;
	}
	.account {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	.whoami {
		font-size: 0.85rem;
		color: var(--color-text-dim);
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	h1 {
		font-size: 1.6rem;
		margin: 0;
		overflow-wrap: anywhere;
	}
	.sub {
		color: var(--color-text-dim);
		font-size: 0.9rem;
		margin: 6px 0 14px;
	}
	.link-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 26px;
	}
	.link-row input {
		flex: 1;
	}
	.open {
		font-size: 0.9rem;
		white-space: nowrap;
	}
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 22px;
		margin-bottom: 22px;
	}
	.card h2,
	.photos h2 {
		font-size: 1.05rem;
		margin: 0 0 14px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	label {
		font-size: 0.9rem;
		color: var(--color-text-dim);
		margin-top: 6px;
	}
	input[type='text'],
	input[type='date'] {
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
		color: var(--color-text);
		border-radius: 8px;
		padding: 0.6em 0.7em;
		width: 100%;
	}
	input:focus {
		outline: 2px solid var(--color-accent);
		border-color: transparent;
	}
	.expiry {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	.expiry input[type='date'] {
		width: auto;
	}
	.expiry input[type='date']:disabled {
		opacity: 0.5;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 0;
		color: var(--color-text);
		font-size: 0.95rem;
	}
	.check input {
		width: auto;
	}
	button.primary {
		align-self: flex-start;
		background: var(--color-accent);
		color: var(--color-accent-text);
		border: none;
		border-radius: 8px;
		padding: 0.65em 1.1em;
		font-weight: 600;
		margin-top: 14px;
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
	.ok {
		color: var(--color-accent);
		margin: 4px 0 0;
		font-size: 0.9rem;
	}
	.muted {
		color: var(--color-text-dim);
		font-size: 0.9rem;
		margin: 0 0 14px;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}
	.stat {
		flex: 1 1 120px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 12px 14px;
	}
	.stat strong {
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1;
	}
	.stat span {
		color: var(--color-text-dim);
		font-size: 0.8rem;
	}
	.hint {
		margin: 14px 0 0;
	}
	.gone {
		flex-shrink: 0;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		color: var(--color-danger);
		border: 1px solid var(--color-danger);
		border-radius: 999px;
		padding: 0 6px;
	}
	.badge {
		display: inline-block;
		padding: 1px 8px;
		border-radius: 999px;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		border: 1px solid var(--color-border);
		color: var(--color-text-dim);
	}
	.badge.revoked,
	.badge.expired {
		color: var(--color-danger);
		border-color: var(--color-danger);
	}
	.photos ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.photos li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 8px;
		border-radius: 8px;
	}
	.photos li:hover {
		background: var(--color-surface);
	}
	.thumb {
		width: 48px;
		height: 48px;
		object-fit: cover;
		border-radius: 6px;
		background: var(--color-surface-2);
		flex-shrink: 0;
	}
	.thumb.placeholder {
		background: transparent;
		border: 1px dashed var(--color-border);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.removed-row .name {
		color: var(--color-text-dim);
	}
	.metrics {
		flex-shrink: 0;
		display: flex;
		gap: 14px;
		color: var(--color-text-dim);
		font-size: 0.85rem;
	}
	.metric {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-variant-numeric: tabular-nums;
	}
	.metric svg {
		width: 14px;
		height: 14px;
		fill: currentColor;
		opacity: 0.85;
	}
	/* Fade rows/metrics with no activity so the counts that matter stand out. */
	.metric.zero {
		opacity: 0.35;
	}
	.danger-zone {
		margin-top: 2rem;
		border-color: color-mix(in srgb, var(--color-danger) 40%, var(--color-border));
	}
	button.danger {
		align-self: flex-start;
		background: none;
		border: 1px solid var(--color-danger);
		color: var(--color-danger);
		border-radius: 8px;
		padding: 0.5em 1em;
		font-weight: 600;
	}
</style>
