<script lang="ts">
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { replaceState } from "$app/navigation";
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

  /** Attempts to reload a thumbnail after Dropbox throttled us, and the delay before each. */
  const THUMB_RETRY_DELAYS_MS = [1500, 5000];

  /**
   * When Dropbox throttles a cold gallery the thumb route answers 503, and a
   * failed <img> never re-requests on its own — the tile would just stay broken.
   * Ask again a couple of times, on a fresh URL so the browser cannot serve us
   * its own cached failure. Gives up quietly afterwards.
   */
  function retryThumb(event: Event) {
    const el = event.currentTarget as HTMLImageElement;
    const attempt = Number(el.dataset.retry ?? 0);
    if (attempt >= THUMB_RETRY_DELAYS_MS.length) return;

    el.dataset.retry = String(attempt + 1);
    const url = new URL(el.src, location.href);
    url.searchParams.set("retry", String(attempt + 1));
    setTimeout(() => (el.src = url.toString()), THUMB_RETRY_DELAYS_MS[attempt]);
  }

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
  // Phone widths fit a 300px column only once, so they're pinned to two columns
  // instead, and the gutter halves — two columns leave each photo small, and a full
  // gutter eats width the photos want. Keep in sync with the media query below.
  const PHONE_MAX = 560; // px viewport, the breakpoint
  const PHONE_COLUMNS = 2;
  const PHONE_GAP = GAP / 2;

  /**
   * Aspect ratios recovered from the thumbnails, for photos the server could not
   * measure. Keyed by image id.
   *
   * The server measures photos once and remembers them, so this is normally empty —
   * but a gallery whose cache is still filling would otherwise lay those photos out
   * at DEFAULT_ASPECT, which boxes a portrait photo into a landscape tile and, worse,
   * makes the lightbox stretch it. A Dropbox thumbnail is best-fit, so it carries the
   * original's ratio: once one loads, we know the truth and can correct.
   */
  let measured = $state<Record<string, number>>({});

  function aspectOf(img: Img): number {
    if (img.width && img.height) return img.width / img.height;
    return measured[img.id] ?? DEFAULT_ASPECT;
  }

  function measureFrom(img: Img, el: HTMLImageElement) {
    if (img.width && img.height) return; // server already knew
    if (measured[img.id] || !el.naturalWidth || !el.naturalHeight) return;
    measured = { ...measured, [img.id]: el.naturalWidth / el.naturalHeight };
  }

  // Aspect ratio per image — from the server where known, else from the thumbnail.
  const tiles = $derived(
    data.images.map((img) => ({ img, ar: aspectOf(img) })),
  );

  /** Fit an aspect ratio into the 2048×1536 thumbnail bounds (the lightbox image size). */
  function fitFull(aspect: number): [number, number] {
    const maxW = 2048;
    const maxH = 1536;
    return aspect >= maxW / maxH
      ? [maxW, Math.round(maxW / aspect)]
      : [Math.round(maxH * aspect), maxH];
  }

  // PhotoSwipe data source. The dimensions here are what the lightbox sizes a photo
  // to, so a wrong ratio here is a visibly stretched photo — they follow `tiles`,
  // corrections included.
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
  const shareDescription = "Hannah Mayr – Fotografie";

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

  /*
   * Whether the phone layout is in force — asked of the same breakpoint the style
   * block below uses, so the polyfill can never disagree with the CSS about which
   * layout the page is in.
   *
   * The grid's own width can't answer this any more, now that the side margins
   * shrink on a phone along with the gutter: a phone grid (560 - 2*7 = 546px) is
   * *wider* than the narrowest desktop one (561 - 2*14 = 533px), so there is no
   * width threshold that separates them.
   */
  const phone = new MediaQuery(`max-width: ${PHONE_MAX}px`);

  // Shortest-column placement => the first row fills left→right, then packs vertically.
  const layout = $derived.by(() => {
    const empty = {
      positions: [] as { x: number; y: number; w: number }[],
      height: 0,
    };
    if (!polyfill || !gridWidth) return empty;
    const gap = phone.current ? PHONE_GAP : GAP;
    const columns = phone.current
      ? PHONE_COLUMNS
      : Math.max(1, Math.floor((gridWidth + gap) / (TARGET_COLUMN + gap)));
    const colWidth = (gridWidth - (columns - 1) * gap) / columns;
    const colHeights = new Array(columns).fill(0);
    const positions = tiles.map(({ ar }) => {
      let c = 0;
      for (let j = 1; j < columns; j++)
        if (colHeights[j] < colHeights[c]) c = j;
      const pos = { x: c * (colWidth + gap), y: colHeights[c], w: colWidth };
      colHeights[c] += colWidth / ar + gap;
      return pos;
    });
    return { positions, height: Math.max(...colHeights, gap) - gap };
  });

  function tileStyle(i: number, ar: number): string {
    const base = `aspect-ratio:${ar}`;
    const p = polyfill ? layout.positions[i] : undefined;
    return p ? `${base};left:${p.x}px;top:${p.y}px;width:${p.w}px` : base;
  }

  let lightbox: { loadAndOpen: (i: number) => void } | null = $state(null);

  // Grid tiles, indexed the same as `items`/`tiles`, so the lightbox can keep the
  // background scrolled to whatever photo is on screen (see the `change` handler).
  let tileEls = $state<HTMLElement[]>([]);

  // PhotoSwipe fires `change` once on open, for the photo just clicked. That tile
  // is already in view, so we swallow that first event and only sync the
  // background on actual swipes/arrows within the lightbox.
  let skipNextLightboxChange = false;

  /*
   * Deep links to a photo. The open photo is mirrored into the URL fragment, so the
   * address bar always points at what the visitor is actually looking at — copy it,
   * reload it, or share it, and the gallery opens on that photo. Cleared again on
   * close, leaving the plain gallery URL behind.
   *
   * The fragment carries the *filename*, not the grid index: the folder is the
   * photographer's to reorder, and a shared link should survive a photo being added
   * ahead of the one it names. Filenames are unique within a Dropbox folder, so a
   * name identifies exactly one photo. Dropbox's own image id would be stable too,
   * but it's an opaque `id:AbC…` blob — ugly in a URL people are meant to send each
   * other, and it leaks storage internals.
   *
   * `replaceState`, not `pushState`: opening a photo is not a navigation the visitor
   * asked for, and a swipe through 40 photos should not bury the page they arrived on
   * under 40 back-button presses.
   */
  const hashFor = (img: Img) => `#${encodeURIComponent(img.name)}`;

  /** The grid index the current URL fragment names, or -1 for none/unknown. */
  function indexFromHash(): number {
    let name: string;
    try {
      name = decodeURIComponent(location.hash.slice(1));
    } catch {
      return -1; // malformed percent-encoding — someone hand-edited the URL
    }
    if (!name) return -1;
    return data.images.findIndex((img) => img.name === name);
  }

  /** True once a fragment present at load has been honoured, so we open it only once. */
  let openedFromHash = false;

  $effect(() => {
    // Read synchronously, before the first await: reads inside the async body below
    // aren't tracked, so this is what makes the effect re-run — rebuilding the lightbox
    // with or without its download button — when a client-side navigation lands on a
    // gallery whose download policy differs.
    const downloadsEnabled = data.downloadsEnabled;
    let lb: any;
    (async () => {
      const { default: PhotoSwipeLightbox } = await import(
        "photoswipe/lightbox"
      );
      lb = new PhotoSwipeLightbox({
        // Read untracked: `items` changes whenever a thumbnail load recovers an aspect
        // ratio, and depending on it here would destroy and rebuild the lightbox each
        // time — even with a photo open. Slides pick up those corrections through the
        // `itemData` filter below instead.
        dataSource: untrack(() => items),
        bgOpacity: 1, // full black backdrop, not semitransparent
        // Vertical breathing room so photos never tuck under the top bar.
        padding: { top: 72, bottom: 72, left: 0, right: 0 },
        pswpModule: () => import("photoswipe"),
      });
      // Every slide, and every neighbour PhotoSwipe preloads, takes its data from here,
      // so a ratio recovered after the lightbox was built still reaches it.
      lb.addFilter(
        "itemData",
        (itemData: Item, index: number) => items[index] ?? itemData,
      );
      // Last resort, for a photo that was never measured server-side and whose grid
      // thumbnail never loaded either (the visitor arrowed straight to it): the full
      // image has now decoded, so believe it over our guess and re-lay the slide out.
      // Without this the slide keeps the guessed ratio and renders the photo stretched.
      lb.on("loadComplete", ({ slide, content }: any) => {
        const el: HTMLImageElement | undefined = content?.element;
        if (!el?.naturalWidth || !el.naturalHeight) return;
        const ar = el.naturalWidth / el.naturalHeight;

        const img = data.images[slide.index];
        if (img) measureFrom(img, el); // also fixes the tile behind the lightbox
        if (Math.abs(slide.width / slide.height - ar) < 0.01) return;

        [slide.width, slide.height] = fitFull(ar);
        content.width = slide.width;
        content.height = slide.height;
        slide.resize();
      });
      // Downloads off: the button is never registered, so the lightbox chrome is just
      // the arrows and close — no disabled-looking control to explain.
      if (downloadsEnabled) {
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
      }
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
        root.addEventListener("click", wake);
        pswp.on("destroy", () => clearTimeout(timer));
        wake();
      });
      // Keep the (hidden) grid behind the lightbox scrolled to the photo being
      // viewed, so closing the lightbox leaves that photo in front of the user.
      // Fires on open and on every swipe/arrow change; `currIndex` matches the
      // tile index since `items` and `tiles` share an order.
      lb.on("change", () => {
        const img = data.images[lb.pswp.currIndex];
        if (img) replaceState(hashFor(img), {});

        if (skipNextLightboxChange) {
          skipNextLightboxChange = false;
          return;
        }
        tileEls[lb.pswp.currIndex]?.scrollIntoView({
          block: "center",
          behavior: "instant" as ScrollBehavior,
        });
      });
      // Back to the plain gallery URL. `close` fires only when a visitor closes the
      // lightbox — tearing it down on unmount fires `destroy` instead — so navigating
      // away with a photo open never rewrites the URL we're leaving for.
      lb.on("close", () => {
        replaceState(location.pathname + location.search, {});
      });
      lb.init();

      // A URL naming a photo opens straight into it. `change` then scrolls the grid to
      // that tile behind the lightbox, so closing leaves the visitor on the photo they
      // were sent rather than back at the top of the gallery. An unknown name (a photo
      // since renamed or removed) just leaves the gallery as it is.
      if (!openedFromHash) {
        openedFromHash = true;
        const i = indexFromHash();
        if (i >= 0) lb.loadAndOpen(i);
      }
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
      onerror={retryThumb}
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
  {#if data.downloadsEnabled && total > 0}
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
      <div class="tile" style={tileStyle(i, ar)} bind:this={tileEls[i]}>
        <button
          class="tile-open"
          type="button"
          onclick={() => {
            track("zoom", img.name);
            skipNextLightboxChange = true;
            lightbox?.loadAndOpen(i);
          }}
          aria-label={`Open ${img.name}`}
        >
          <img
            src={gridUrl(img)}
            alt={img.name}
            loading="lazy"
            onload={(e) =>
              measureFrom(img, e.currentTarget as HTMLImageElement)}
            onerror={retryThumb}
          />
        </button>
        <!-- Download the original without opening the lightbox; same beacon the
				     lightbox download fires. Sits above the open button, so a click here
				     never zooms. -->
        {#if data.downloadsEnabled}
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
        {/if}
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
    /* One gutter for the whole grid — between the photos and around them — so the
		   frame the photos sit in stays even. Halved on phones (see the breakpoint). */
    --tile-gap: var(--gap);

    margin: 0 var(--tile-gap) 320px;
    padding: 0 0 60px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    grid-template-rows: masonry;
    gap: var(--tile-gap);
  }
  /* Keep in sync with PHONE_MAX, PHONE_COLUMNS and PHONE_GAP. */
  @media (max-width: 560px) {
    .grid {
      --tile-gap: calc(var(--gap) / 2);

      grid-template-columns: repeat(2, 1fr);
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
    position: relative;
    break-inside: avoid;
    margin: 0 0 var(--tile-gap);
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
