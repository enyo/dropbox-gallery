<script lang="ts">
	import 'photoswipe/style.css';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Img = { id: string; version: string; width?: number; height?: number };
	const enc = (id: string) => encodeURIComponent(id);
	const gridUrl = (img: Img) => `/g/${data.token}/thumb/${enc(img.id)}?v=${img.version}`;
	const fullUrl = (img: Img) => `/g/${data.token}/thumb/${enc(img.id)}?size=full&v=${img.version}`;
	const originalUrl = (img: Img) => `/g/${data.token}/original/${enc(img.id)}`;

	/** Fit an aspect ratio into the 2048×1536 thumbnail bounds (the lightbox image size). */
	function fitFull(aspect: number): [number, number] {
		const maxW = 2048;
		const maxH = 1536;
		return aspect >= maxW / maxH ? [maxW, Math.round(maxW / aspect)] : [Math.round(maxH * aspect), maxH];
	}

	// PhotoSwipe data source. Dimensions come from the server (EXIF), so they're known
	// up front — no waiting on image load. Falls back to 3:2 when EXIF is missing.
	const DEFAULT_ASPECT = 3 / 2;
	type Item = { src: string; msrc: string; width: number; height: number; origUrl: string };
	const items: Item[] = $derived(
		data.images.map((img) => {
			const aspect = img.width && img.height ? img.width / img.height : DEFAULT_ASPECT;
			const [width, height] = fitFull(aspect);
			return { src: fullUrl(img), msrc: gridUrl(img), width, height, origUrl: originalUrl(img) };
		})
	);

	let lightbox: { loadAndOpen: (i: number) => void } | null = $state(null);

	$effect(() => {
		let lb: any;
		(async () => {
			const { default: PhotoSwipeLightbox } = await import('photoswipe/lightbox');
			lb = new PhotoSwipeLightbox({ dataSource: items, pswpModule: () => import('photoswipe') });
			lb.on('uiRegister', () => {
				lb.pswp.ui.registerElement({
					name: 'download',
					ariaLabel: 'Download original',
					order: 8,
					isButton: true,
					tagName: 'a',
					html: 'Download',
					onInit: (el: HTMLAnchorElement) => {
						el.setAttribute('download', '');
						el.setAttribute('target', '_blank');
						el.setAttribute('rel', 'noreferrer');
						lb.pswp.on('change', () => {
							el.href = items[lb.pswp.currIndex].origUrl;
						});
					}
				});
			});
			lb.init();
			lightbox = lb;
		})();
		return () => lb?.destroy();
	});
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

<header class="bar">
	<h1>{data.title}</h1>
	<div class="meta">
		<span>{data.images.length} photo{data.images.length === 1 ? '' : 's'}</span>
		{#if data.images.length > 0}
			<a class="download-all" href={`/g/${data.token}/download`}>Download all</a>
		{/if}
	</div>
</header>

{#if data.images.length === 0}
	<p class="empty">No photos in this gallery yet.</p>
{:else}
	<div class="grid">
		{#each data.images as img, i (img.id)}
			<button
				class="tile"
				type="button"
				onclick={() => lightbox?.loadAndOpen(i)}
				aria-label={`Open ${img.name}`}
				style={img.width && img.height ? `aspect-ratio: ${img.width} / ${img.height}` : ''}
			>
				<img src={gridUrl(img)} alt={img.name} loading="lazy" />
			</button>
		{/each}
	</div>
{/if}

<style>
	.bar {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 28px 24px 18px;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 16px;
		color: var(--text-dim);
		font-size: 0.95rem;
	}
	.download-all {
		color: var(--accent);
		text-decoration: none;
		font-weight: 600;
	}
	.empty {
		text-align: center;
		color: var(--text-dim);
		margin-top: 18vh;
	}
	.grid {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 0 24px 60px;
		column-width: 300px;
		column-gap: var(--gap);
	}
	.tile {
		break-inside: avoid;
		margin: 0 0 var(--gap);
		padding: 0;
		border: none;
		background: var(--surface);
		border-radius: var(--radius);
		overflow: hidden;
		display: block;
		width: 100%;
		line-height: 0;
		transition: transform 0.12s ease;
	}
	.tile:hover {
		transform: translateY(-2px);
	}
	.tile img {
		width: 100%;
		height: auto;
		display: block;
	}
</style>
