/** Extensions Dropbox (and most backends) can render thumbnails for. */
const THUMBNAILABLE = /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i;

/** Whether a filename is an image we can show in a gallery. */
export function isThumbnailableImage(name: string): boolean {
  return THUMBNAILABLE.test(name);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Natural-order comparison so IMG_2 sorts before IMG_10. */
export function byNaturalName<T extends { name: string }>(a: T, b: T): number {
  return collator.compare(a.name, b.name);
}
