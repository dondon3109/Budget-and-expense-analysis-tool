# Pet companion

A streak pet for signed-in users. On mobile it opens from the Pet entry under Tools in the Home workspace menu; on
the web it has its own page (`/app/pet`) in the sidebar. The rules live in
`packages/shared/src/pet.ts`; the API in `apps/api/src/db/pet.ts` and `src/routes/pet.ts`.

## Rules

- The user picks one of six eggs (hedgehog, pig, hamster, penguin, panda, hippo) and names it (1 to
  20 characters, trimmed; `PET_NAME_MAX_LENGTH`). The name is kept after death for the memorial
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
`PetPlayground.tsx`) show the same pieces: the pet in a spotlight (a flat disc, ground shadow, and
drifting sparkles) with a tap-to-pet hint, status chips (egg streak, or points, health, and today's
points), chunky meters, health and heal-cost hints (`petHealthHint`), a tombstone memorial card
after a pet passes away (`diedAt`), the Egg to Legend growth path (`petStageEmoji`), and the
earning rules as tiles (`petEarningRows`).

Clicking or tapping a hatched pet answers by mood (`petReaction.ts` in `@zoption/shared`): a
healthy pet hops and sends up hearts in its species' and stage's happy voice, and five taps within
two seconds make it dance with a shower of hearts, a slight celebratory pitch lift, and a staggered
sparkle jingle (then three seconds before the next dance). A sick pet wobbles with a 🤒 and a
fading one barely stirs with a 💤, both in that stage's sad voice, quieter and slightly slower when
fading. Every species and hatched stage (Baby, Juvenile, Adult, Legend) has its own happy and sad clip,
growing from baby peeps and yips to full adult calls (like a hippo bellow-roar or emperor penguin
trumpet) and resonant Legend calls with a subtle chime flourish.
`scripts/generate-pet-sounds.mjs` (backed by `scripts/pet-sounds/`) synthesizes all 49 loudness-matched
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

- Style: every rounded part is a radial gradient lit from the upper left (a bright spot, the base
  tone, a shaded edge, and a faint bounce light at the rim), with a glossy streak on the head and
  belly, blush cheeks, glossy eyes with two catchlights, no outlines, and a soft contact shadow on
  the ground. Shadows shade toward a warm plum rather than black. Eggs use the same lighting over
  their pattern, with a thin warm outline so the cracks still read.
- One chibi template: the stage sets the proportions (Baby sits with its feet forward and has the
  biggest head and eyes and an open smile; Juvenile stands with arms out and an open smile; Adult is
  rounder and heavier with a closed smile; Legend is the Adult in an outfit), and younger stages
  are scaled around the feet. The species adds its parts: hedgehog spines and cream face, pig
  floppy ears and snout, hamster round ears and cream muzzle, penguin white face, beak, flippers,
  and tuft, panda black ears, eye patches, arms, and feet, hippo wide head, muzzle, and nostrils.
- Legend outfits, all gold with no glow or sparkles: hedgehog in a red cape with a gold shield, pig
  in a top hat and purple sash holding a gold coin, hamster in a crown and purple cape holding a
  golden seed, penguin in a crown and blue cape with a golden fish scepter, panda in a straw hat and
  red cape holding a golden bamboo staff, hippo in a lotus crown and teal sash holding a golden
  lotus.
- Health looks: a sick pet goes pale and slightly green, with half-closed droopy eyes, a wavy
  mouth, a sweat drop, and a thermometer; a fading pet washes out toward grey, slumps lower and
  wider, and its eyes are flat lines.
- Motion (web `PetFigure.css`, mobile `PetPicture.tsx`, the same keyframes): a healthy pet hops
  every 2.6s with squash and stretch (squash before, stretch in the air, squash on landing, then
  settle) while its ground shadow shrinks and fades under it, and blinks (closed eyes for about
  130ms every 3.4s). A sick pet shivers and a fading one barely breathes. A tap's reaction plays on
  top. Reduced motion stills all of it.
- The figure is returned in parts (`shadow`, `body`, `eyes`, `blink`) so the shadow stays on the
  ground while the body moves and the eyes can swap for a blink.

### Colors

A pet color changes only the body (fur, skin, feathers), so cheeks, bellies, eyes, and Legend
outfits stay as drawn, and Pink is the same pink on every species, black panda patches included.
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
