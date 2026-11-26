# Pet companion

A streak pet for signed-in users. On mobile it opens from the Pet entry under Tools in the Home workspace menu; on
the web it has its own page (`/app/pet`) in the sidebar. The rules live in
`packages/shared/src/pet.ts`; the API in `apps/api/src/db/pet.ts` and `src/routes/pet.ts`.

## Rules

- The user picks one of two eggs (pig or hippo) and names it (1 to
  20 characters, trimmed; `PET_NAME_MAX_LENGTH`). A pet stored as a retired species (hedgehog,
  hamster, penguin, or panda; `retiredPetSpecies`) is read back as a pig with its name, color,
  points, and stage, so no stored pet fails to load. The name is kept after death for the memorial
  and replaced by the next egg's. Pets stored before names existed go by their species label. An egg is ready
  after 7 consecutive Manila days with an app check-in; a missed day before then resets the count.
  A ready egg stays ready however many days pass, until the user taps it 10 times
  (`PET_HATCH_TAPS`) on the mobile or web pet page. The taps are counted on the device and only
  the last one calls the Worker, so leaving the page forgets a partial count. The health clock
  starts at that tap. Eggs never get sick or die.
- The user also picks the pet's color with the egg (`petColors`: Original, Pink, Mint, Sky,
  Lilac, Peach) and can change it or turn off their pet any time: on the web or mobile pet page,
  or in the mobile Settings pet card. It belongs to that pet and clears when it dies. A pet stored
  before colors existed has `color: null`; the pet page (web and mobile) asks its owner once to pick
  one, and "Keep original" saves `original` so the question never returns. All colors are free.
- Points per action and daily counts: check-in 10 ×1, transaction 10 ×3, subscription 15 ×2, debt
  payment 20 ×2, assistant reply 5 ×3, plus a +10 bonus on the third distinct action type. No day
  earns more than 100.
- Stages by points since hatch: Baby 0, Juvenile 350, Adult 1,000, Legend 5,500.
- Growing past Baby needs a paid plan, Budget or Pro (`petFreePointsCap`). Without one a pet stops
  at 349 points; activity still counts toward the daily caps and still heals it, and the next
  activity after a paid plan starts grows it. A pet that grew on a paid plan keeps its stage and
  points when the plan ends but earns nothing more until it returns. The Worker checks the entitlement when it credits activity, not when the
  activity happened. The pet view carries no plan field (installed apps parse it strictly), so
  each pet page reads the plan itself and shows `petGrowthLockedLine` only once it knows the plan
  is Free.
- Health is full for 24 hours after the last activity that earned a row, falls evenly to 0 at 72
  hours, and the pet dies then. The next activity heals it fully by eating one point per missing
  health point, never below the current stage's threshold. After death the user picks a new egg.
- Turning the pet off pauses its clock and credits nothing. Turning it back on restarts the
  24 hour clock.

## Where points come from

The Worker credits activity the workspace already records, so no feature route reports it: on
each read it replays rows created since `pets.processed_through`.

- Transactions: manual, non-zero, not a subscription renewal or opening balance, dated within a
  day of entry, and not a repeat (same account, amount, category, description) within ten minutes.
  A transaction with a debt link is a debt payment; other transfers do not count. Deleted rows
  still count, so deleting never refunds.
- Subscriptions with a positive amount and a name not used before.
- Completed assistant replies to a user message of at least 15 characters.
- `POST /api/app/pet/check-in`, sent by the phone app when it opens, returns to the foreground,
  or reconnects after being offline, and by the web app when it loads the pet and on returning to
  the tab after five minutes. Both apps also refresh a loaded pet right after personal
  transaction, subscription, debt-payment, or AI assistant activity (plus a short follow-up past
  the Worker's one-second `creditedThrough` boundary).

Activity is credited through the last whole second only, because `datetime('now')` rounds down.

## API

`GET /api/app/pet`, `POST /api/app/pet/check-in`, `PUT /api/app/pet/egg` (`{ species, name, color }`, 409 while a
pet is alive), `POST /api/app/pet/hatch` (409 `egg_not_ready` unless a ready egg is enabled),
`PUT /api/app/pet/color` (`{ color }`, 409 `no_pet` without an egg or pet),
`PUT /api/app/pet/settings` (`{ enabled }`). Every response is a `petViewSchema`.

## Pet page

Web `pages/PetPage.tsx` and mobile `features/pet/PetScreen.tsx` (playful parts in
`PetPlayground.tsx`) show the same pieces: the pet on stage with a tap-to-pet hint (web: the plain
card, so the figure and its own contact shadow are all that show; mobile: a spotlight of a flat
disc, ground shadow, and drifting sparkles), status chips (egg streak, or points, health, and today's
points), chunky meters, health and heal-cost hints (`petHealthHint`), a tombstone memorial card
after a pet passes away (`diedAt`), the Egg to Legend growth path (`petStageEmoji`), and the
earning rules as tiles (`petEarningRows`).

Clicking or tapping a hatched pet answers by mood (`petReaction.ts` in `@zoption/shared`): a
healthy pet hops and sends up hearts in its species' and stage's happy voice, and five taps within
two seconds make it dance with a shower of hearts, a slight celebratory pitch lift, and a staggered
sparkle jingle (then three seconds before the next dance). A sick pet wobbles with a 🤒 and a
fading one barely stirs with a 💤, both in that stage's sad voice, quieter and slightly slower when
fading. Every species and hatched stage (Baby, Juvenile, Adult, Legend) has its own happy and sad clip,
growing from baby squeaks and grunts to full adult calls (like a hippo bellow-roar or a pig's
oink) and resonant Legend calls with a subtle chime flourish.
`scripts/generate-pet-sounds.mjs` (backed by `scripts/pet-sounds/`) synthesizes all 17 loudness-matched
clips into `apps/mobile/assets/sounds/pet/` and `apps/web/public/pet/sounds/` and writes the mobile
static asset map (`apps/mobile/src/features/pet/pet-sound-assets.ts`). The phone also buzzes,
lightly or with a success pattern on a dance; the web does not. The voice follows the Sound effects
switch (mobile Preferences, or web Account Settings for that browser), and neither platform preloads
pet clips while Sound effects are off. Reduced motion, from the system or the in-app switch, stills
the motion and the burst but keeps the voice. Petting is local only: it never reaches the Worker
and earns nothing.

New accounts are asked during first-run setup whether they want a pet. A yes opens the egg
picker (on mobile, the next setup step, which can be skipped); a no turns the pet off
(`PUT /api/app/pet/settings`).

## Pop-up

Mobile Home and every web workspace page outside `/app/pet` (including family workspaces,
whose "See my pet" link opens `/app/pet` for the personal companion) open a pop-up with the pet's
picture when its egg became ready, it grew a stage, got sick, or died since the device last showed
it, or else on the day's first open (Manila date). One open shows at most one. On mobile it decides
only while Home is on screen, so a change seen on the pet page is announced on returning to Home
rather than over the pet page. It also waits behind the thank-you card and the
usage-analytics prompt ("Help improve Zoption"), so only one dialog is ever on screen.
The rule is `petMoment` in `packages/shared/src/petMoment.ts` and the wording is `petCopy.ts`; each
device keeps what it last showed: mobile in SecureStore (`zoption-mobile-pet-seen-v1`, cleared on
every identity change, and only after first-run setup), the web in local storage per user
(`zoption:pet-seen:<userId>`).

## Art

Eggs are SVG shape data (`packages/shared/src/petArt/eggs.ts`, drawn by mobile `EggSprite.tsx`
and web `components/pet/PetSvg.tsx`, through the same shape renderers as the figures: mobile
`PetArtSvg.tsx`, web `PetLayers`), so cracks can spread with the streak and with each tap on a
ready egg. Every pair of taps adds a crack and every tap shakes it harder; once the Worker accepts the hatch, the shell bursts in a
shared light (`hatchShineLayer`) alongside `playPetHatch` (sparkle plus baby happy chirp), and a
failed hatch settles the egg back to zero taps.

Hatched pets are soft vinyl-toy figures drawn from shape data in
`packages/shared/src/petArt/figures.ts` (`petFigureArt`), so the web (`components/pet/PetFigure.tsx`)
and mobile (`PetPicture.tsx`, `PetFigureView.tsx`) draw the same figure with no image files. The
tombstone (`tombstoneArt`) is drawn the same way; the pop-up shows the egg (with its streak cracks),
the figure, or the tombstone.

- Style: a desk-toy figure with a big round head on a tiny body, matte rather than shiny. Every
  rounded part is a soft radial gradient lit from the upper left (a bright spot, the base tone, a
  shaded edge, and a faint bounce light at the rim), with a faint sheen on the head and belly, soft
  shading under the chin, light blush, a small "w" mouth, no outlines, and a soft contact shadow on
  the ground. Eyes are large and glassy: dark at the top, warm brown low down, with a big window
  reflection and a small glint. Shadows shade toward a warm plum rather than black. Eggs use the
  same lighting over their pattern, with a thin warm outline so the cracks still read.
- One template: the stage sets the proportions (Baby sits, with the biggest head and eyes; Juvenile
  and Adult stand a little taller with slightly smaller eyes; Legend is the Adult in an outfit), and
  younger stages are scaled around the feet. Two stubby front legs stand under the body; only a
  Legend's prize-holding arms stick out at the sides. The species adds its parts: pig floppy ears
  and snout, hippo wide head, small round ears, muzzle, and nostrils.
- Legend outfits, all gold with no glow or sparkles: pig in a top hat and purple sash holding a
  gold coin, hippo in a lotus crown and teal sash holding a golden lotus.
- Health looks: a sick pet goes pale and slightly green, with half-closed droopy eyes, a wavy
  mouth, a sweat drop, and a thermometer; a fading pet washes out toward grey, slumps lower and
  wider, and its eyes are flat lines.
- Motion (web `PetFigure.css`, mobile `PetPicture.tsx`, the same keyframes): a healthy pet hops
  every 2.6s with squash and stretch (squash before, stretch in the air, squash on landing, then
  settle) while its ground shadow shrinks and fades under it, and blinks (closed eyes for about
  130ms every 3.4s). A sick pet shivers and a fading one barely breathes. A tap's reaction plays on
  top. Reduced motion stills all of it.
- Prototype, web only: a healthy Baby pig draws as a live 3D figure instead
  (`components/pet/PetFigure3D.tsx`, scene in `pet3d/pigScene.ts`, three.js). It is modeled on a
  soft clay toy: a big round head with full cheeks, wider than it is tall and domed on top, on a
  chubby round body nearly as wide as the head, widest at the hips and narrowing a little toward
  the neck (each an egg-like form,
  `egg` in `pigShape.ts`, so no outline has flat sides); broad, thin, soft ear flaps rising from
  the head's top corners and folding forward so their tips point down and out (many short petals
  along one smooth curve, so the fold is a soft bend and the thin flap never crumples); short, fat arms that hang down the front of the body
  and turn slightly in, each ending in a round pink hand with a small rose-brown hoof pointing
  down and in onto the belly well above the feet (so the hoof and sole colors never touch), split
  by a thin dark line where the toes part, tapering to a point up the hoof. Each arm is one tube along a gentle curve, with no elbow
  corner, and only its shoulder melts into the body: the rest meets it in a narrow crease, so the
  arms stand apart as limbs. The figure also has stubby legs stretched forward showing round rose-brown
  soles inside a pink rim; wide-set glossy dark-brown eyes with a lighter brown rim and one highlight, level with the
  top of a short, round coral snout with deep nostrils; a thin smile; and soft blush. The
  proportions (`SHAPE` in `pigShape.ts`) were fitted to a photo of the reference toy by matching
  its outline (about 96% overlap; most of the rest is the photo's floor shadow and a pixel of edge
  all round). The shape is one signed distance field (`pet3d/pigShape.ts`) whose parts melt into
  each other with narrow creases (neck, arms, and legs), meshed
  once per page into a single seamless surface (`pet3d/sdfMesh.ts`, surface nets with normals from
  the field's gradient, about 900ms on a laptop) and colored per vertex (snout, nostrils, blush)
  from the body color (`PIG_BODY`, tinted by the pet color). The mesh is then relaxed
  (`relaxMesh`): its grid steps are smoothed out without shrinking it, and its normals are
  averaged with their neighbors' twice, enough to hide the grid but not to blur the creases. The
  snout keeps its exact normals so the nostrils stay crisp. The hooves and soles are painted by the
  material instead: each vertex carries a smooth hoof field, and the shader cuts the hoof color
  where it crosses 0.5, antialiased over one pixel, so their edges stay as sharp as the toy's
  between vertices rather than fading across the triangles. The toe split and the crease lines
  are cut the same way: each vertex stores a distance that changes linearly across the line (the
  distance across the hoof; for a crease, how much nearer one of the two nearest parts is than the
  other, 0 on the seam), and the shader draws a crisp dark line where it is near 0. A soft shade
  either side of each crease line sets the arms, legs, ears, and head apart from what they meet,
  as on the toy; the line fades out over the shoulder, where the arm melts in, and the snout gets
  none. A thin dark groove runs round each hoof cap and sole where the color is cut, so they read
  as set into the pink. The material is matte with a
  light velvet sheen, and adds back some of its own color (more of its hue than its lightness) as
  scattered light, so the shadows stay a warm saturated pink; neutral tone mapping keeps its pastel
  saturation. Its lights wrap just past the side they face and fade out flat, so no light's edge
  draws a hard line across a curve such as the ear's fold, while the forms still shade firmly
  enough to read crisp. It is lit like a white studio
  product shot, with a strong key low from the right
  leaving the left side in warm shade, a glow rimming the right edge from behind (from the side it
  would shine through the body onto the inside of the left arm), a bounce from the floor that
  keeps the chin crease light, ambient occlusion (`GTAOPass`, blend at most 1, or the deepest
  creases turn grey-blue; a short radius and a tight denoise, so each crease shadow is a crisp
  line rather than a smudge) darkening the creases under the chin and around the ears, arms, and legs,
  and a contact shadow. The lighting and colors were fitted to the same photo. A faint light high
  above casts the short floor shadow (from the low key it would run off the canvas); the figure
  takes no shadow itself, because a shadow map speckles its curved surface. The mesh is
  skinned to a rig (head, ears, snout, arms, legs; weights blended across each crease so a bend
  stays soft) so it reads as alive: the ears, snout, and head ride damped springs that follow the body a beat late and wobble as they
  settle, and the mouth opens. It stays put when idle
  (breathing, a wandering head, swaying ears with an occasional flick, a nose twitch, a blink). A
  tap's reaction plays inside the scene from the same `PET_REACTION_MOTION` keys: the body hops
  and tilts while the legs lift and the arms flap (and paddle in a dance), the ears trail, the snout squishes on
  landing, and a happy tap opens the mouth and squints the eyes. The canvas itself never moves. `PetModel`
  picks the 3D or SVG figure for both the pet page and the pet pop-up, so the look never switches
  between them; while three.js loads the space stays empty instead of flashing the SVG. three.js
  loads lazily only for that pet, the pop-up and reduced motion render one still frame, and a
  browser without WebGL2 keeps the SVG figure.
- The figure is returned in parts (`shadow`, `body`, `eyes`, `blink`) so the shadow stays on the
  ground while the body moves and the eyes can swap for a blink.

### Colors

A pet color changes only the body (skin), so cheeks, bellies, eyes, and Legend
outfits stay as drawn, and Pink is the same pink on both species.
`tintPetHex` (`packages/shared/src/petArt/colors.ts`) maps a body color's luminance onto the
color's dark-to-light ramp, so shading survives: eggs tint their body fills, and figures tint the
species' base body color before deriving its shading (pig and hippo derive their snout, muzzle,
and belly from the tinted body too).

## Notifications

The mobile app schedules local notifications from each pet view it receives
(`apps/mobile/src/features/pet/pet-notifications.ts`), so they follow activity synced from any
device once the app checks in again.

- A hatched pet is warned at 24, 48 and 66 hours after its last activity, and told at 72 hours
  that it passed away. Reschedules also cancel the ids of the older seven-step schedule. An egg with a streak gets a reminder at 20:00 the next day and a
  note at 07:30 the morning after that, when the streak has already restarted. A ready egg instead
  gets one "ready to hatch" reminder at the next 20:00.
- Alerts due between 22:00 and 07:00 Manila time wait until 07:30. A warning that would then land
  at or after the pet's death is dropped.
- They post on the Android channel "Pet alerts", which the user can mute on its own. They never ask
  for permission, so they use only the grant the daily reminder obtained.
- Turning the pet off cancels them, and every identity change cancels them. An offline launch
  keeps the last schedule. The notifications are only reminders: the Worker recomputes the pet from
  timestamps, so a missed one never changes the outcome.
