<script lang="ts">
  import "photoswipe/style.css";
  import "./lightbox.css";
  import downloadIcon from "./download.svg";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  type Img = {
    id: string;
    name: string;
    version: string;
    width?: number;
    height?: number;
  };
  const enc = (id: string) => encodeURIComponent(id);
  const gridUrl = (img: Img) =>
    `/${data.id}/thumb/${enc(img.id)}?v=${img.version}`;
  const fullUrl = (img: Img) =>
    `/${data.id}/thumb/${enc(img.id)}?size=full&v=${img.version}`;
  const originalUrl = (img: Img) => `/${data.id}/original/${enc(img.id)}`;

  // Total photos in the gallery, counting the cover even when it's excluded from
  // the grid — so the count and "download all" reflect the whole folder, not just
  // what the masonry shows.
  const total = $derived.by(() => {
    const c = data.cover;
    const coverInGrid = c ? data.images.some((img) => img.id === c.id) : false;
    return data.images.length + (c && !coverInGrid ? 1 : 0);
  });

  const DEFAULT_ASPECT = 3 / 2;
  const TARGET_COLUMN = 300; // px, matches the native-masonry minmax below
  const GAP = 14; // keep in sync with --gap

  // Aspect ratio per image, known up front from server EXIF (no image load needed).
  const tiles = $derived(
    data.images.map((img) => ({
      img,
      ar: img.width && img.height ? img.width / img.height : DEFAULT_ASPECT,
    })),
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
        name: img.name,
      };
    }),
  );

  // Social share card (Open Graph / Twitter). Crawlers don't run JS and need an
  // absolute, publicly reachable image URL, so the cover is emitted straight into
  // <svelte:head> at its served size — a `summary_large_image` card that shows the
  // cover photo big with the title beneath it. Falls back to a plain card (no image)
  // for an empty gallery.
  const share = $derived.by(() => {
    const c = data.cover;
    if (!c) return null;
    const ar = c.width && c.height ? c.width / c.height : DEFAULT_ASPECT;
    const [width, height] = fitFull(ar);
    return { url: `${data.origin}${fullUrl(c)}`, width, height };
  });
  const shareDescription = $derived(
    total > 0 ? `${total} photo${total === 1 ? "" : "s"}` : "",
  );

  /**
   * Fire-and-forget engagement beacon (opens, downloads). Uses `sendBeacon` so it
   * survives the navigation a download triggers; failures are swallowed so
   * tracking can never disturb the gallery. See `/[id]/track`.
   */
  function track(
    type: "zoom" | "download" | "download_all",
    name: string | undefined = undefined,
  ) {
    try {
      if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
      navigator.sendBeacon(`/${data.id}/track`, JSON.stringify({ type, name }));
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
      typeof CSS !== "undefined" &&
      (CSS.supports("grid-template-rows", "masonry") ||
        CSS.supports("display", "masonry"));
    polyfill = !supportsNative;
  });

  // Shortest-column placement => the first row fills left→right, then packs vertically.
  const layout = $derived.by(() => {
    const empty = {
      positions: [] as { x: number; y: number; w: number }[],
      height: 0,
    };
    if (!polyfill || !gridWidth) return empty;
    const columns = Math.max(
      1,
      Math.floor((gridWidth + GAP) / (TARGET_COLUMN + GAP)),
    );
    const colWidth = (gridWidth - (columns - 1) * GAP) / columns;
    const colHeights = new Array(columns).fill(0);
    const positions = tiles.map(({ ar }) => {
      let c = 0;
      for (let j = 1; j < columns; j++)
        if (colHeights[j] < colHeights[c]) c = j;
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
      const { default: PhotoSwipeLightbox } =
        await import("photoswipe/lightbox");
      lb = new PhotoSwipeLightbox({
        dataSource: items,
        bgOpacity: 1, // full black backdrop, not semitransparent
        // Vertical breathing room so photos never tuck under the top bar.
        padding: { top: 72, bottom: 72, left: 0, right: 0 },
        pswpModule: () => import("photoswipe"),
      });
      lb.on("uiRegister", () => {
        lb.pswp.ui.registerElement({
          name: "download",
          ariaLabel: "Download original",
          order: 8,
          isButton: true,
          tagName: "a",
          // Icon is drawn from download.svg as a CSS background, matching the
          // hairline arrows/close (see lightbox.css).
          html: "",
          onInit: (el: HTMLAnchorElement) => {
            el.setAttribute("download", "");
            el.setAttribute("target", "_blank");
            el.setAttribute("rel", "noreferrer");
            lb.pswp.on("change", () => {
              el.href = items[lb.pswp.currIndex].origUrl;
            });
            el.addEventListener("click", () =>
              track("download", items[lb.pswp.currIndex]?.name),
            );
          },
        });
      });
      // Fade the chrome out after a couple of idle seconds; any pointer
      // movement wakes it back up. Mirrors the reference lightbox.
      lb.on("afterInit", () => {
        const pswp = lb.pswp;
        const root: HTMLElement = pswp.element;
        let timer: ReturnType<typeof setTimeout>;
        const wake = () => {
          root.classList.remove("pswp--ui-idle");
          clearTimeout(timer);
          timer = setTimeout(() => root.classList.add("pswp--ui-idle"), 2500);
        };
        root.addEventListener("pointermove", wake);
        pswp.on("destroy", () => clearTimeout(timer));
        wake();
      });
      lb.init();
      lightbox = lb;
    })();
    return () => lb?.destroy();
  });
</script>

<svelte:head>
  <title>{data.title}</title>
  {#if shareDescription}
    <meta name="description" content={shareDescription} />
  {/if}

  <!-- Open Graph / Twitter share card -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content={data.title} />
  <meta property="og:url" content={`${data.origin}/${data.id}`} />
  <meta name="twitter:title" content={data.title} />
  {#if shareDescription}
    <meta property="og:description" content={shareDescription} />
    <meta name="twitter:description" content={shareDescription} />
  {/if}
  {#if share}
    <meta property="og:image" content={share.url} />
    <meta property="og:image:width" content={String(share.width)} />
    <meta property="og:image:height" content={String(share.height)} />
    <meta property="og:image:alt" content={data.title} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content={share.url} />
  {:else}
    <meta name="twitter:card" content="summary" />
  {/if}
</svelte:head>

{#if data.cover}
  <section class="cover">
    <img
      class="cover-img"
      src={fullUrl(data.cover)}
      alt={data.title}
      fetchpriority="high"
    />
    <div class="cover-scrim"></div>
    <h1 class="cover-title">{data.title}</h1>
  </section>
{:else}
  <header class="bar">
    <h1>{data.title}</h1>
  </header>
{/if}

<div class="toolbar">
  <span class="count">{total} photo{total === 1 ? "" : "s"}</span>
  {#if total > 0}
    <a
      class="download-all"
      href={`/${data.id}/download`}
      onclick={() => track("download_all")}>Download all</a
    >
  {/if}
</div>

{#if data.images.length === 0}
  {#if !data.cover}
    <p class="empty">No photos in this gallery yet.</p>
  {/if}
{:else}
  <div
    class="grid"
    class:js={polyfill}
    bind:clientWidth={gridWidth}
    style={polyfill ? `height:${layout.height}px` : ""}
  >
    {#each tiles as { img, ar }, i (img.id)}
      <div class="tile" style={tileStyle(i, ar)}>
        <button
          class="tile-open"
          type="button"
          onclick={() => {
            track("zoom", img.name);
            lightbox?.loadAndOpen(i);
          }}
          aria-label={`Open ${img.name}`}
        >
          <img src={gridUrl(img)} alt={img.name} loading="lazy" />
        </button>
        <!-- Download the original without opening the lightbox; same beacon the
				     lightbox download fires. Sits above the open button, so a click here
				     never zooms. -->
        <a
          class="tile-download"
          href={originalUrl(img)}
          download
          target="_blank"
          rel="noreferrer"
          aria-label={`Download ${img.name}`}
          onclick={() => track("download", img.name)}
        >
          <img src={downloadIcon} alt="" />
        </a>
      </div>
    {/each}
  </div>
{/if}

<footer>
  <span>Hannah Mayr &copy; {new Date().getFullYear()}</span>
  ·
  <a href="https://hannahmayr.com/agb">AGB</a>
  <a href="https://hannahmayr.com/impressum">Impressum</a>
  <a href="https://hannahmayr.com/datenschutz">Datenschutz</a>
</footer>

<style>
  /* Full-screen hero: the cover image fills the viewport with the title laid
	 * boldly over it, a gradient scrim keeping the text legible on any photo. */
  .cover {
    position: relative;
    width: 100%;
    height: 100svh;
    overflow: hidden;
    background: var(--color-surface);
  }
  .cover-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .cover-scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.35) 0%,
      rgba(0, 0, 0, 0) 30%,
      rgba(0, 0, 0, 0) 55%,
      rgba(0, 0, 0, 0.65) 100%
    );
  }
  .cover-title {
    position: absolute;
    left: 0;
    right: 0;
    bottom: max(6vh, 40px);
    margin: 0;
    padding: 0 24px;
    text-align: center;
    color: #fff;
    font-weight: 700;
    font-size: clamp(2.5rem, 8vw, 6rem);
    line-height: 1.05;
    letter-spacing: -0.02em;
    text-shadow: 0 2px 24px rgba(0, 0, 0, 0.4);
    overflow-wrap: anywhere;
  }

  /* Fallback header when the gallery has no cover (empty gallery). */
  .bar {
    max-width: var(--maxw);
    margin: 0 auto;
    padding: 28px 24px 18px;
  }
  .bar h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
  }

  /* Toolbar directly below the cover: photo count and the "download all" action. */
  .toolbar {
    margin: 0 auto;
    padding: 40px var(--gap);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 12px;
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
    margin: 0 var(--gap) 320px;
    padding: 0 0 60px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    grid-template-rows: masonry;
    gap: var(--gap);
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
    position: relative;
    break-inside: avoid;
    margin: 0 0 var(--gap);
    width: 100%;
    background: var(--color-surface);
    overflow: hidden;
    display: block;
    line-height: 0;
    transition:
      transform 0.12s ease,
      opacity 0.5s ease;
  }
  /* The image itself is the open-lightbox target, stretched to fill the tile
	   (whose height comes from its inline aspect-ratio). */
  .tile-open {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 0;
    border: none;
    background: none;
  }
  .tile-open img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* Download-original affordance: a faint dark disc bearing the same hairline
	   glyph as the lightbox, so the white icon reads over any photo. Revealed on
	   hover — see the pointer:fine rules below. */
  .tile-download {
    opacity: 0;
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    background: rgba(0, 0, 0, 0.3);
    transition:
      opacity 0.15s ease,
      transform 0.15s ease,
      background-color 0.15s ease;
  }
  .tile-download img {
    width: 30px;
    height: 30px;
    display: block;
  }
  .tile-download:hover {
    background: rgba(0, 0, 0, 0.5);
  }
  /* Hover-capable pointers: keep the disc hidden (and unclickable) until the
	   tile is hovered or focused. Touch devices, which never hover, always show it. */
  @media (pointer: fine) {
    .tile-download {
      transform: translateY(-4px);
      pointer-events: none;
    }
    .tile:hover .tile-download,
    .tile:focus-within .tile-download {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
  }

  footer {
    margin: 48px var(--gap);
    text-align: center;

    &,
    > * {
      font-size: 0.875rem;
      color: var(--color-text-dim);
    }
    a,
    span {
      text-decoration: none;
      margin: 0 6px;
    }
  }
</style>
