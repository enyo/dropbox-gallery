<script lang="ts">
	import 'photoswipe/style.css';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Img = {
		id: string;
		name: string;
		version: string;
		width?: number;
		height?: number;
	};
	const enc = (id: string) => encodeURIComponent(id);
	const gridUrl = (img: Img) => `/g/${data.id}/thumb/${enc(img.id)}?v=${img.version}`;
	const fullUrl = (img: Img) => `/g/${data.id}/thumb/${enc(img.id)}?size=full&v=${img.version}`;
	const originalUrl = (img: Img) => `/g/${data.id}/original/${enc(img.id)}`;

	const DEFAULT_ASPECT = 3 / 2;
	const TARGET_COLUMN = 300; // px, matches the native-masonry minmax below
	const GAP = 14; // keep in sync with --gap

	// Aspect ratio per image, known up front from server EXIF (no image load needed).
	const tiles = $derived(
		data.images.map((img) => ({
			img,
			ar: img.width && img.height ? img.width / img.height : DEFAULT_ASPECT
		}))
	);

	/** Fit an aspect ratio into the 2048×1536 thumbnail bounds (the lightbox image size). */
	function fitFull(aspect: number): [number, number] {
		const maxW = 2048;
		const maxH = 1536;
		return aspect >= maxW / maxH
			? [maxW, Math.round(maxW / aspect)]
			: [Math.round(maxH * aspect), maxH];
	}

	// PhotoSwipe data source — dimensions known up front, falls back to 3:2.
	type Item = {
		src: string;
		msrc: string;
		width: number;
		height: number;
		origUrl: string;
		name: string;
	};
	const items: Item[] = $derived(
		tiles.map(({ img, ar }) => {
			const [width, height] = fitFull(ar);
			return {
				src: fullUrl(img),
				msrc: gridUrl(img),
				width,
				height,
				origUrl: originalUrl(img),
				name: img.name
			};
		})
	);

	/**
	 * Fire-and-forget engagement beacon (opens, downloads). Uses `sendBeacon` so it
	 * survives the navigation a download triggers; failures are swallowed so
	 * tracking can never disturb the gallery. See `/g/[id]/track`.
	 */
	function track(type: 'zoom' | 'download' | 'download_all', name: string | undefined = undefined) {
		try {
			if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
			navigator.sendBeacon(`/g/${data.id}/track`, JSON.stringify({ type, name }));
		} catch {
			// best-effort only
		}
	}

	// Native CSS masonry handles layout via @supports in the style block. JS is only
	// a polyfill, enabled on mount when the browser lacks native masonry support.
	let polyfill = $state(false);
	let gridWidth = $state(0);

	$effect(() => {
		// Match exactly the syntaxes the style block implements, so detection and
		// rendering never disagree.
		const supportsNative =
			typeof CSS !== 'undefined' &&
			(CSS.supports('grid-template-rows', 'masonry') || CSS.supports('display', 'masonry'));
		polyfill = !supportsNative;
	});

	// Shortest-column placement => the first row fills left→right, then packs vertically.
	const layout = $derived.by(() => {
		const empty = { positions: [] as { x: number; y: number; w: number }[], height: 0 };
		if (!polyfill || !gridWidth) return empty;
		const columns = Math.max(1, Math.floor((gridWidth + GAP) / (TARGET_COLUMN + GAP)));
		const colWidth = (gridWidth - (columns - 1) * GAP) / columns;
		const colHeights = new Array(columns).fill(0);
		const positions = tiles.map(({ ar }) => {
			let c = 0;
			for (let j = 1; j < columns; j++) if (colHeights[j] < colHeights[c]) c = j;
			const pos = { x: c * (colWidth + GAP), y: colHeights[c], w: colWidth };
			colHeights[c] += colWidth / ar + GAP;
			return pos;
		});
		return { positions, height: Math.max(...colHeights, GAP) - GAP };
	});

	function tileStyle(i: number, ar: number): string {
		const base = `aspect-ratio:${ar}`;
		const p = polyfill ? layout.positions[i] : undefined;
		return p ? `${base};left:${p.x}px;top:${p.y}px;width:${p.w}px` : base;
	}

	let lightbox: { loadAndOpen: (i: number) => void } | null = $state(null);

	$effect(() => {
		let lb: any;
		(async () => {
			const { default: PhotoSwipeLightbox } = await import('photoswipe/lightbox');
			lb = new PhotoSwipeLightbox({
				dataSource: items,
				pswpModule: () => import('photoswipe')
			});
			lb.on('uiRegister', () => {
				lb.pswp.ui.registerElement({
					name: 'download',
					ariaLabel: 'Download original',
					order: 8,
					isButton: true,
					tagName: 'a',
					// Custom SVG so it sizes/aligns exactly like the built-in toolbar icons.
					html: {
						isCustomSVG: true,
						inner:
							'<path d="M20.5 14.3 17.1 17.7 17.1 10 14.9 10 14.9 17.7 11.5 14.3 10 15.8 16 21.8 22 15.8z M23 23H9v2h14z" id="pswp__icn-download" />',
						outlineID: 'pswp__icn-download'
					},
					onInit: (el: HTMLAnchorElement) => {
						el.setAttribute('download', '');
						el.setAttribute('target', '_blank');
						el.setAttribute('rel', 'noreferrer');
						lb.pswp.on('change', () => {
							el.href = items[lb.pswp.currIndex].origUrl;
						});
						el.addEventListener('click', () => track('download', items[lb.pswp.currIndex]?.name));
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
			<a class="download-all" href={`/g/${data.id}/download`} onclick={() => track('download_all')}
				>Download all</a
			>
		{/if}
	</div>
</header>

{#if data.images.length === 0}
	<p class="empty">No photos in this gallery yet.</p>
{:else}
	<div
		class="grid"
		class:js={polyfill}
		bind:clientWidth={gridWidth}
		style={polyfill ? `height:${layout.height}px` : ''}
	>
		{#each tiles as { img, ar }, i (img.id)}
			<button
				class="tile"
				type="button"
				onclick={() => {
					track('zoom', img.name);
					lightbox?.loadAndOpen(i);
				}}
				aria-label={`Open ${img.name}`}
				style={tileStyle(i, ar)}
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
		color: var(--color-text-dim);
		font-size: 0.95rem;
	}
	.download-all {
		color: var(--color-accent);
		text-decoration: none;
		font-weight: 600;
	}
	.empty {
		text-align: center;
		color: var(--color-text-dim);
		margin-top: 18vh;
	}

	/*
	 * Native CSS masonry is the default layout, applied straight from CSS wherever
	 * the browser supports it. The :not(.js) guard hands off to the JS polyfill
	 * only when native support is absent.
	 */
	.grid {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 0 24px 60px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		grid-template-rows: masonry;
		gap: var(--gap);

		&:has(.tile:hover) {
			.tile:not(:hover) {
				opacity: 0.8;
			}
		}
	}
	@supports (display: masonry) {
		.grid:not(.js) {
			display: masonry;
		}
	}

	/* JS polyfill: tiles absolutely positioned in row-major shortest-column order. */
	.grid.js {
		display: block;
		position: relative;
	}
	.grid.js .tile {
		position: absolute;
		width: auto;
		margin: 0;
	}

	.tile {
		break-inside: avoid;
		margin: 0 0 var(--gap);
		width: 100%;
		padding: 0;
		border: none;
		background: var(--color-surface);
		overflow: hidden;
		display: block;
		line-height: 0;
		transition:
			transform 0.12s ease,
			opacity 0.5s ease;
	}
	.tile img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
</style>
