<script lang="ts">
	import { enhance } from '$app/forms';
	import { getPhotos, getActivity } from './data.remote';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const enc = (id: string) => encodeURIComponent(id);
	const thumbUrl = (img: { id: string; version: string }) =>
		`/admin/g/${data.gallery.id}/thumb/${enc(img.id)}?v=${img.version}`;

	type Photo = { id: string; name: string; version: string };

	// Resolve which photo is the cover: the one named by the stored cover, else the
	// first photo (the viewer's fallback). `isExplicit` distinguishes a deliberate
	// choice from that default. Call only with a non-empty photo list.
	function resolveCover(photos: Photo[], coverName: string | null) {
		const explicit = coverName ? photos.find((p) => p.name === coverName) : undefined;
		return { cover: explicit ?? photos[0], isExplicit: !!explicit };
	}

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

	// Photos (a live Dropbox listing — the slow part) and engagement activity (a D1
	// aggregation) load via remote functions instead of the page `load`, so the shell
	// paints immediately and each streams into its section below behind a skeleton.
	// Re-derived per gallery id so navigating between galleries refetches.
	const photosQuery = $derived(getPhotos(data.gallery.id));
	const activityQuery = $derived(getActivity(data.gallery.id));
</script>

<svelte:head>
	<title>{data.gallery.title} · admin</title>
</svelte:head>

{#snippet metricRow(zooms: number, downloads: number)}
	<span class="metrics">
		<span class="metric" class:zero={!zooms} title="Views">
			<svg viewBox="0 0 16 16" aria-hidden="true"
				><path
					d="M8 3C4.5 3 1.7 5.1 1 8c.7 2.9 3.5 5 7 5s6.3-2.1 7-5c-.7-2.9-3.5-5-7-5Zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7Zm0-1.7a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z"
				/></svg
			>{zooms}
		</span>
		<span class="metric" class:zero={!downloads} title="Downloads">
			<svg viewBox="0 0 16 16" aria-hidden="true"
				><path d="M8 1v7.4l2.3-2.3 1.1 1L8 11.6 3.6 7.1l1.1-1L7 8.4V1h1ZM3 13h10v1.5H3V13Z" /></svg
			>{downloads}
		</span>
	</span>
{/snippet}

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
		{#await photosQuery then { photos }}
			· {photos.length} photo{photos.length === 1 ? '' : 's'}{/await}
	</p>
	<div class="link-row">
		<input type="text" readonly value={data.gallery.url} />
		<button class="link" type="button" onclick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
		<a class="open" href={data.gallery.url} target="_blank" rel="noreferrer">Open ↗</a>
	</div>

	<section class="card">
		<h2>Link slug</h2>
		<p class="muted">
			An optional friendly name for the link. The id always keeps working; adding a slug keeps every
			earlier slug alive too and redirects them to the newest one.
		</p>
		<form method="POST" action="?/setSlug" use:enhance>
			<div class="slug-row">
				<span class="slug-prefix">/</span>
				<input
					name="slug"
					type="text"
					placeholder="summer-2026"
					autocapitalize="off"
					autocomplete="off"
					spellcheck="false"
				/>
				<button class="primary" type="submit">Save slug</button>
			</div>
			{#if form?.slugError}<p class="error">{form.slugError}</p>{/if}
			{#if form?.slugSaved}<p class="ok">Slug saved.</p>{/if}
		</form>
		{#if data.gallery.activeSlug}
			<p class="slug-current">
				Active slug: <code class="slug-chip">{data.gallery.activeSlug}</code>
			</p>
			{#if data.gallery.slugs.length > 1}
				<div class="slug-list">
					<span class="muted small">Also redirects here:</span>
					{#each data.gallery.slugs.slice(1) as s (s)}<code class="slug-chip">{s}</code>{/each}
				</div>
			{/if}
		{:else}
			<p class="slug-current muted">No slug yet — the link uses the id.</p>
		{/if}
	</section>

	<section class="card">
		<h2>Cover image</h2>
		{#await photosQuery}
			<div class="skeleton">
				<div class="cover-preview wrapper">
					<div class="cover-sk"></div>
					<div class="name-sk"></div>
				</div>
			</div>
		{:then { photos, photosError }}
			{#if photosError}
				<p class="muted">Couldn’t load photos — the source folder may be unavailable.</p>
			{:else if photos.length === 0}
				<p class="muted">Add photos to the folder to choose a cover.</p>
			{:else}
				{@const resolved = resolveCover(photos, data.gallery.coverImage)}
				<div class="cover-preview">
					<img class="cover-thumb" src={thumbUrl(resolved.cover)} alt={resolved.cover.name} />
					<div class="cover-info">
						<span class="cover-name">{resolved.cover.name}</span>
						<span class="muted small"
							>{resolved.isExplicit ? 'Chosen cover' : 'Default — first image'}</span
						>
					</div>
					{#if resolved.isExplicit}
						<form method="POST" action="?/setCover" use:enhance>
							<button class="link" type="submit">Remove</button>
						</form>
					{/if}
				</div>
				<form method="POST" action="?/setCoverExclusion" use:enhance>
					<label class="check">
						<input
							type="checkbox"
							name="excluded"
							checked={data.gallery.coverExcluded}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						/>
						Exclude the cover from the grid below
					</label>
				</form>
			{/if}
		{:catch}
			<p class="muted">Couldn’t load photos.</p>
		{/await}
	</section>

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

			<label for="downloads">Downloads</label>
			<label class="check">
				<input
					id="downloads"
					type="checkbox"
					name="downloads"
					checked={data.gallery.downloadsEnabled}
				/>
				Viewers may download photos
			</label>
			<p class="muted note">
				When off, the gallery shows no “Download all”, no download button on a thumbnail, and none
				in the lightbox — and the originals stop being served. Viewers can still see every photo.
			</p>

			{#if form?.error}<p class="error">{form.error}</p>{/if}
			{#if form?.saved}<p class="ok">Saved.</p>{/if}
			<button class="primary" type="submit">Save changes</button>
		</form>
	</section>

	<section class="card">
		<h2>Activity</h2>
		{#await activityQuery}
			<div class="skeleton">
				<div class="stats wrapper">
					<div class="stat-sk"></div>
					<div class="stat-sk"></div>
					<div class="stat-sk"></div>
				</div>
			</div>
		{:then activity}
			{#if activity.totalZooms + activity.totalDownloads + activity.downloadAll === 0}
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
				<p class="muted hint">Per-photo views and downloads are shown in the photo list below.</p>
			{/if}
		{:catch}
			<p class="muted">Couldn’t load activity.</p>
		{/await}
	</section>

	<section class="photos">
		<h2>Photos</h2>
		{#await Promise.all([photosQuery, activityQuery])}
			<div class="skeleton">
				<ul class="wrapper">
					{#each Array(5) as _, i (i)}
						<li class="wrapper">
							<div class="thumb-sk"></div>
							<div class="name-sk"></div>
						</li>
					{/each}
				</ul>
			</div>
		{:then [{ photos, photosError }, activity]}
			{@const statsByName = new Map(activity.perImage.map((s) => [s.name, s]))}
			{@const currentNames = new Set(photos.map((p) => p.name))}
			{@const removedStats = photosError
				? []
				: activity.perImage.filter((s) => !currentNames.has(s.name))}
			{@const coverName = photos.length
				? resolveCover(photos, data.gallery.coverImage).cover.name
				: null}
			{#if photosError}
				<p class="muted">Couldn’t load photos — the source folder may be unavailable.</p>
			{:else if photos.length === 0 && removedStats.length === 0}
				<p class="muted">This gallery has no photos.</p>
			{:else}
				<ul>
					{#each photos as photo (photo.id)}
						{@const s = statsByName.get(photo.name)}
						<li>
							<img class="thumb" src={thumbUrl(photo)} alt={photo.name} loading="lazy" />
							<span class="name">{photo.name}</span>
							{#if photo.name === coverName}
								<span class="cover-badge" title="Current cover image">Cover</span>
							{:else}
								<form method="POST" action="?/setCover" use:enhance>
									<input type="hidden" name="name" value={photo.name} />
									<button class="set-cover" type="submit">Set as cover</button>
								</form>
							{/if}
							{@render metricRow(s?.zooms ?? 0, s?.downloads ?? 0)}
						</li>
					{/each}
					{#each removedStats as s (s.name)}
						<li class="removed-row">
							<span class="thumb placeholder" aria-hidden="true"></span>
							<span class="name">{s.name}</span>
							<span class="gone" title="No longer in the Dropbox folder">removed</span>
							{@render metricRow(s.zooms, s.downloads)}
						</li>
					{/each}
				</ul>
			{/if}
		{:catch}
			<p class="muted">Couldn’t load photos — please try again.</p>
		{/await}
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
		max-width: 960px;
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

	/* Link-slug card: a `/` prefix, the slug input, and its save button on one row,
	   with the active slug and any older (redirecting) slugs listed below. */
	.slug-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.slug-prefix {
		color: var(--color-text-dim);
		font-family: ui-monospace, monospace;
	}
	.slug-row input {
		flex: 1;
		min-width: 160px;
	}
	.slug-row .primary {
		margin-top: 0;
	}
	.slug-current {
		font-size: 0.9rem;
		margin: 14px 0 0;
	}
	.slug-list {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
	}
	.slug-chip {
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 1px 7px;
		font-size: 0.85em;
		font-family: ui-monospace, monospace;
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
	/* Explanatory line under a checkbox, indented to sit under its label text. */
	.note {
		margin: 0 0 0 22px;
		font-size: 0.85rem;
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
		width: 80px;
		height: 80px;
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

	/* Cover-image card: current cover preview + the exclude toggle. */
	.cover-preview {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 6px;
	}
	.cover-thumb {
		width: 104px;
		height: 68px;
		object-fit: cover;
		border-radius: 8px;
		background: var(--color-surface-2);
		flex-shrink: 0;
	}
	.cover-info {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}
	.cover-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.small {
		font-size: 0.8rem;
		margin: 0;
	}
	.cover-sk {
		width: 104px;
		height: 68px;
		border-radius: 8px;
		flex-shrink: 0;
	}

	/* Per-photo cover control in the list: a badge for the current cover, else a
	 * "set as cover" button that stays quiet until the row is hovered. */
	.cover-badge {
		flex-shrink: 0;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		color: var(--color-accent);
		border: 1px solid var(--color-accent);
		border-radius: 999px;
		padding: 1px 8px;
	}
	.set-cover {
		flex-shrink: 0;
		background: none;
		border: 1px solid var(--color-border);
		color: var(--color-text-dim);
		border-radius: 999px;
		padding: 2px 10px;
		font-size: 0.78rem;
	}
	.set-cover:hover {
		color: var(--color-text);
		border-color: var(--color-text-dim);
	}
	@media (pointer: fine) {
		.photos li .set-cover {
			opacity: 0;
			transition: opacity 0.12s ease;
		}
		.photos li:hover .set-cover,
		.photos li:focus-within .set-cover {
			opacity: 1;
		}
	}

	/*
	 * Skeleton loaders shown while the photos/activity remote functions resolve.
	 * `.skeleton` is display:contents, so its `.wrapper` children keep the real
	 * layout while every non-wrapper descendant becomes a shimmering placeholder.
	 * Technique: https://www.matsimon.dev/blog/simple-skeleton-loaders
	 */
	.skeleton {
		display: contents;
		--_default-color: var(--color-border);
		--_shimmer-color: var(--color-bg);
	}
	.skeleton :not(.wrapper) {
		animation: skeleton-shimmer 2s ease-out infinite;
		background: linear-gradient(
			100deg,
			var(--_default-color),
			var(--_default-color) 50%,
			var(--_shimmer-color) 60%,
			var(--_default-color) 70%
		);
		background-size: 200% 100%;
		background-attachment: fixed;
	}
	@keyframes skeleton-shimmer {
		0% {
			background-position-x: 200%;
		}
		100% {
			background-position-x: 0%;
		}
	}
	.stat-sk {
		flex: 1 1 120px;
		height: 63px;
		border-radius: 8px;
	}
	.thumb-sk {
		width: 80px;
		height: 80px;
		border-radius: 6px;
		flex-shrink: 0;
	}
	.name-sk {
		height: 12px;
		width: min(45%, 240px);
		border-radius: 4px;
	}
	@media (prefers-reduced-motion: reduce) {
		.skeleton :not(.wrapper) {
			animation: none;
		}
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
