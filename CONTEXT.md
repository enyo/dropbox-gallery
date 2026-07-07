# Dropbox Gallery

A single-tenant web app that turns folders in one Dropbox account into shareable, image galleries with lightbox viewing. One deployment serves one Dropbox account.

## Language

**Admin**:
The single operator who creates galleries. There is exactly one. Gated by the **Admin Password**.
_Avoid_: user (ambiguous — see **Viewer**)

**Admin Password**:
The secret that protects the admin page so that only the **Admin** can mint a **Gallery Link**. Not a per-gallery secret and never seen by a **Viewer**.
_Avoid_: gallery password, viewer password

**Viewer**:
Anyone who opens a **Gallery Link**. Unauthenticated — possession of the link is the only credential.
_Avoid_: user, guest

**Gallery**:
The displayed collection of images from one **Source Folder**.

**Source Folder**:
The Dropbox folder, in the single connected account, whose images a **Gallery** displays.

**Gallery Link**:
An unguessable capability URL (`/g/<id>`) that grants a **Viewer** access to exactly one **Gallery**. Possession is access — there is no viewer login or viewer password. The `<id>` is a random, opaque key into a persisted gallery record; it carries no readable data. Carries an optional expiry, set by the **Admin** at mint time (default 90 days, may be null for never), and can be **individually revoked** by the **Admin** at any time. Expiry and revocation are the containment mechanisms (both take effect once the edge cache lapses, not instantly).
_Avoid_: share link (collides with Dropbox's own "shared link" feature)

## Relationships

- A **Gallery** displays the images in exactly one **Source Folder**
- A **Gallery Link** grants access to exactly one **Gallery**
- The **Admin** mints **Gallery Links**; minting is gated by the **Admin Password**
- A **Viewer** needs only the **Gallery Link** — no password

## Example dialogue

> **Dev:** "When the **Admin** mints a **Gallery Link**, does the **Viewer** ever type a password?"
> **Operator:** "No. The password is the **Admin Password** — it just stops anyone but me from minting links. Once a **Gallery Link** exists, whoever holds it is in."
> **Dev:** "And if I want to cut off a link I shared?"
> **Operator:** "I revoke it from the admin page — each gallery is a row in the database now. Viewers lose access once the edge cache lapses. I can still set an expiry at mint time as well."
> **Dev:** "What does the **Gallery Link** point at?"
> **Operator:** "Exactly one **Source Folder** in my Dropbox. The **Gallery** is just the images in that folder, rendered with a lightbox."

## Flagged ambiguities

- "password" in the original spec was ambiguous between an admin gate and a viewer gate — resolved: it is the **Admin Password** (admin gate only). Viewers never enter a password.
