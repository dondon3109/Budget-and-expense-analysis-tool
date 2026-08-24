---
version: 1
slug: "apps-web-src-pages-admincustomerreviewspage-tsx"
primary_target: "src/pages/AdminCustomerReviewsPage.tsx"
related_targets: ["src/pages/AdminCustomerReviewsPage.css"]
---

# Admin customer reviews surface brief

- Scope: `/app/admin/reviews`, an authenticated platform-administrator operating surface.
- Job: review every consented customer submission, decide publication, and curate up to six landing-page reviews without changing customer wording.
- Primary task: keep the exact public lineup visible while moderating the source inbox.
- Proof: complete review text, rating, public name, submission/update dates, moderation status, and explicit landing order.
- Constraints: reuse Zoption's existing private-app visual system; server-enforced platform-admin access; no admin text editing; keyboard-operable ordering; mobile layout must not overflow or obscure the bottom navigation.

## Direction

The page is a curation desk. A numbered six-slot landing lineup leads, followed by a filterable inbox and immutable selected-review detail. Visibility and placement are separate: published makes a review eligible, while the lineup determines whether and where it appears. The generated north-star used during design exploration was intentionally not shipped; its extra product navigation and invented customer details were composition-only.

## Direction contract

- THESIS: landing-page trust is curated as a finite, visible lineup rather than buried in a generic admin table.
- OWN-WORLD: Zoption paper surfaces, deep green actions, quiet rules, Newsreader headings, and dense Manrope operational controls.
- STORY: see the live lineup, find a submission, inspect its immutable words, publish or hide it, then place or reorder it.
- FIRST VIEWPORT: title and landing preview action, six numbered lineup slots, then inbox and detail beginning together below.
- FORM: assigned grounded structure 6, a finite editorial tray above a source inbox and detail pane; seed `3e908755`.

## Implementation inventory

| Visible ingredient                                | Medium                                         |
| ------------------------------------------------- | ---------------------------------------------- |
| Numbered landing lineup and empty slots           | Semantic HTML and CSS                          |
| Stars, visibility, ordering, search, filter icons | Existing Lucide icon library                   |
| Review inbox and immutable detail                 | Semantic React controls and text               |
| Desktop two-pane and mobile stacked layouts       | Responsive CSS                                 |
| Generated composition                             | North-star only; not shipped as a raster asset |
