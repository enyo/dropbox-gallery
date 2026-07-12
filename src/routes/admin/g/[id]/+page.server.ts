import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getGalleryStore, galleryPath } from "$lib/server/gallery/store";
import type { GalleryRecord } from "$lib/server/gallery/store";
import { getEventStore } from "$lib/server/gallery/events";

type GalleryStatus = "live" | "expired" | "revoked";

function statusOf(g: Pick<GalleryRecord, "expiresAt" | "revokedAt">): GalleryStatus {
  if (g.revokedAt !== null) return "revoked";
  if (g.expiresAt !== null && Date.now() > g.expiresAt) return "expired";
  return "live";
}

// `load` returns only the gallery metadata — a single indexed D1 lookup — so the page
// shell paints immediately. The photos (a live Dropbox listing) and the engagement
// activity stream in via the `./data.remote` queries behind skeleton loaders.
export const load: PageServerLoad = async ({ params, locals, platform, url }) => {
  if (!locals.isAdmin) throw redirect(303, "/admin");

  const store = getGalleryStore(platform);
  const record = await store.get(params.id);
  if (!record) throw error(404, "This gallery does not exist.");

  // Slugs newest-first; the first is the active one the gallery redirects to. The
  // public link uses the active slug when set, otherwise the raw capability id.
  const slugs = await store.slugsFor(record.id);
  const activeSlug = slugs[0] ?? null;

  return {
    username: locals.username ?? null,
    gallery: {
      id: record.id,
      title: record.title,
      url: `${url.origin}${galleryPath(record.id, activeSlug)}`,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
      coverImage: record.coverImage,
      coverExcluded: record.coverExcluded,
      downloadsEnabled: record.downloadsEnabled,
      status: statusOf(record),
      activeSlug,
      slugs,
    },
  };
};

export const actions: Actions = {
  update: async ({ request, params, locals, platform }) => {
    if (!locals.isAdmin) return fail(401, { error: "Not authenticated." });
    const data = await request.formData();
    const title = String(data.get("title") ?? "").trim();
    const never = data.get("never") != null;
    const date = String(data.get("expires") ?? "").trim();
    // An unchecked box posts nothing, so absence means "downloads off". The form always
    // renders the box, so a submission can always be read as the admin's intent.
    const downloadsEnabled = data.get("downloads") != null;

    if (!title) return fail(400, { error: "Title cannot be empty." });

    let expiresAt: number | null;
    if (never) {
      expiresAt = null;
    } else if (!date) {
      return fail(400, { error: "Pick an expiry date, or choose “never expires”." });
    } else {
      // Expire at the end of the chosen day (UTC) so the link stays live through it.
      const parsed = Date.parse(`${date}T23:59:59.999Z`);
      if (Number.isNaN(parsed)) return fail(400, { error: "That expiry date is not valid." });
      expiresAt = parsed;
    }

    const ok = await getGalleryStore(platform).update(params.id, {
      title,
      expiresAt,
      downloadsEnabled,
    });
    if (!ok) return fail(404, { error: "This gallery does not exist." });
    // `use:enhance` invalidates and re-runs `load`, so the page reflects the change.
    return { saved: true };
  },

  // Add a slug for this gallery, which becomes its active (redirected-to) slug. Old
  // slugs are kept so their links keep resolving. A slug already taken as another
  // gallery's active slug is rejected; a stale one may be claimed. See `addSlug`.
  setSlug: async ({ request, params, locals, platform }) => {
    if (!locals.isAdmin) return fail(401, { error: "Not authenticated." });
    const store = getGalleryStore(platform);
    const record = await store.get(params.id);
    if (!record) return fail(404, { error: "This gallery does not exist." });

    const data = await request.formData();
    const slug = String(data.get("slug") ?? "");
    const result = await store.addSlug(record.id, slug);
    if (!result.ok) {
      const slugError =
        result.reason === "taken"
          ? "That slug is already in use by another gallery."
          : "Use lowercase letters, numbers and hyphens — e.g. summer-2026.";
      return fail(400, { slugError });
    }
    return { slugSaved: true };
  },

  // Set the cover image by filename, or clear it (empty `name`) to fall back to
  // the first image. The name comes from the live Dropbox listing rendered on the
  // page, so it is trusted only as a label — a stale name simply falls back.
  setCover: async ({ request, params, locals, platform }) => {
    if (!locals.isAdmin) return fail(401, { error: "Not authenticated." });
    const data = await request.formData();
    const name = String(data.get("name") ?? "").trim();
    const ok = await getGalleryStore(platform).setCover(params.id, name || null);
    if (!ok) return fail(404, { error: "This gallery does not exist." });
    return { coverSaved: true };
  },

  // Toggle whether the resolved cover is dropped from the grid (hero-only).
  setCoverExclusion: async ({ request, params, locals, platform }) => {
    if (!locals.isAdmin) return fail(401, { error: "Not authenticated." });
    const data = await request.formData();
    const excluded = data.get("excluded") != null;
    const ok = await getGalleryStore(platform).setCoverExcluded(params.id, excluded);
    if (!ok) return fail(404, { error: "This gallery does not exist." });
    return { coverSaved: true };
  },

  delete: async ({ params, locals, platform }) => {
    if (!locals.isAdmin) return fail(401, { error: "Not authenticated." });
    await getGalleryStore(platform).delete(params.id);
    // The gallery id is gone for good, so its dangling counters are pure waste.
    await getEventStore(platform).deleteForGallery(params.id);
    throw redirect(303, "/admin");
  },
};
