---
version: 1
slug: "apps-web-src-pages-adminoverviewpage-tsx"
primary_target: "apps/web/src/pages/AdminOverviewPage.tsx"
related_targets: ["apps/web/src/pages/AdminOverviewPage.css"]
---

# Admin console surface brief

- Scope: `/app/admin`, the authenticated platform-administrator console; the sibling desks `/app/admin/reviews`, `/app/admin/provider-configs`, and `/app/support/reports?view=admin` stay where they are.
- Agent: the Zoption platform administrator, alone, usually arriving to check state or hand out a sponsored seat.
- Job: read every admin area's live state in one place, then either open the area that owns a page or work the sponsored Pro seats in place.
- Primary task: decide what needs attention now, and act on the seats without leaving the console.
- Proof: live counts per area (seats active, pending, open; reviews pending, published, landing slots; services without a credential and the active assistant model; new and open reports), the exact destination of each area, and explicit checking, unreadable, and non-administrator states.
- Constraints: platform-admin access is enforced by the server and only reflected here; the page never reads anyone's financial data; one extra query per area, all cached under the shared workspace query keys; no new visual world.

## Direction

The console is a rail of four areas at rest and one workbench in use. Each peg states what the area holds now, what it covers, and where it goes. The sponsored peg is tinted and its action points down, because it is the one whose tool is out on the floor; the other three leave the console through their peg.

The center is reserved for the sponsored Pro seats because that is the only admin tool without a page of its own. The workbench lists all five slots, the open ones included, so capacity is visible rather than counted. Sponsored seats moved here from Settings > Billing, which now carries a pointer.

## Direction contract

- THESIS: one rail of areas at rest and a single workbench in use, not a grid of settings cards.
- OWN-WORLD: Zoption paper surfaces, deep green actions, hairline rules, Newsreader headings, dense Manrope controls, IBM Plex Mono counts.
- STORY: read each area's state, open the three that own a page, work the sponsored seats on the floor.
- FIRST VIEWPORT: masthead with access truth and refresh, the four-peg rail with state and one action each, then the seats workbench below.
- FORM: grounded structure 5 of 7 for an operate surface, the rail with a reserved center; peg-rail staging; seed `36972255`.

## Implementation inventory

| Visible ingredient | Medium |
| --- | --- |
| Peg rail, flags, hairlines, held-peg tint, workbench marker | Semantic HTML and CSS |
| Area state figures and flags | Live query data from the four admin endpoints |
| Sponsored seat workbench, five slots | Shared `SponsoredProSeatsSettings` component with a self-contained section frame |
| Action arrows, attention lights | Existing Lucide icon library and CSS dot |
| Destructive and cancel buttons | Shared `button danger` / `button ghost` variants in foundation.css |
| Desktop four-column and mobile stacked rails | Responsive CSS |
