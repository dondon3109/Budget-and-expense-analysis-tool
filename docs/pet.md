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
  Lilac, Peach) and can change it any time: on the web pet page, or in the mobile Settings pet
  card. It belongs to that pet and clears when it dies. A pet stored before colors existed has
  `color: null`; the pet page (web and mobile) asks its owner once to pick one, and "Keep original"
  saves `original` so the question never returns. All colors are free.
- Points per action and daily counts: check-in 10 ×1, transaction 10 ×3, subscription 15 ×2, debt
  payment 20 ×2, assistant reply 5 ×3, plus a +10 bonus on the third distinct action type. No day
  earns more than 100.
- Stages by points since hatch: Baby 0, Juvenile 350, Adult 1,000, Legend 5,500.
- Growing past Baby needs Pro (`petFreePointsCap`). Without it a pet stops at 349 points; activity
  still counts toward the daily caps and still heals it, and the next activity after Pro starts
  grows it. A pet that grew on Pro keeps its stage and points when Pro ends but earns nothing more
  until it returns. The Worker checks the entitlement when it credits activity, not when the
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
- `POST /api/app/pet/check-in`, sent by the phone app when it opens or returns to the foreground,
  and by the web app when it loads the pet and on returning to the tab after five minutes.

Activity is credited through the last whole second only, because `datetime('now')` rounds down.

## API

`GET /api/app/pet`, `POST /api/app/pet/check-in`, `PUT /api/app/pet/egg` (`{ species, name, color }`, 409 while a
pet is alive), `POST /api/app/pet/hatch` (409 `egg_not_ready` unless a ready egg is enabled),
`PUT /api/app/pet/color` (`{ color }`, 409 `no_pet` without an egg or pet),
`PUT /api/app/pet/settings` (`{ enabled }`). Every response is a `petViewSchema`.

## Pet page

Web `pages/PetPage.tsx` and mobile `features/pet/PetScreen.tsx` (playful parts in
`PetPlayground.tsx`) show the same pieces: the pet in a spotlight (a flat disc, ground shadow, and
drifting sparkles), status chips (egg streak, or points, health, and today's points), chunky
meters, the Egg to Legend growth path (`petStageEmoji`), and the earning rules as tiles
(`petEarningRows`).

Clicking or tapping a hatched pet answers by mood (`petReaction.ts` in `@zoption/shared`): a
healthy pet hops and sends up hearts in its species' happy voice, and five taps within two seconds
make it dance with a shower of hearts, a higher voice, and a sparkle jingle (then three seconds
before the next dance). A sick pet wobbles with a 🤒 and a fading one barely stirs with a 💤, both
in the species' sad voice, quieter when fading. Each species has its own happy and sad clip, pitched
up for a baby and down for a legend; `scripts/generate-pet-sounds.mjs` synthesizes them from a
seeded model of each species' real call into `apps/mobile/assets/sounds/pet/` and
`apps/web/public/pet/sounds/`. The phone also buzzes, lightly or with a success pattern on a dance;
the web does not. The voice follows the Sound effects switch (mobile Preferences, or web Account
Settings for that browser). Reduced motion, from the system or the in-app switch, stills the motion
and the burst but keeps the voice. Petting is local only: it never reaches the Worker and
earns nothing.

New accounts are asked at the end of first-run setup whether they want a pet. A yes opens the egg
picker; a no turns the pet off (`PUT /api/app/pet/settings`).

## Pop-up

Mobile Home and every web workspace page open a pop-up with the pet's picture when its egg became
ready, it grew a stage, got sick, or died since
the device last showed it, or else on the day's first open (Manila date). One open shows at most one.
On mobile it decides only while Home is on screen, so a change seen on the pet page is announced on
returning to Home rather than over the pet page.
The rule is `petMoment` in `packages/shared/src/petMoment.ts` and the wording is `petCopy.ts`; each
device keeps what it last showed: mobile in SecureStore (`zoption-mobile-pet-seen-v1`, cleared on
every identity change, and only after first-run setup), the web in local storage per user
(`zoption:pet-seen:<userId>`).

## Art

Eggs are SVG shape data (`packages/shared/src/petArt/eggs.ts`, drawn by mobile `EggSprite.tsx`
and web `components/pet/PetSvg.tsx`), so cracks can spread with the streak and with each tap on a
ready egg. Every pair of taps adds a crack and every tap shakes it harder; the shell bursts in a
shared light (`hatchShineLayer`) only once the Worker accepts the hatch, and a failed hatch settles
the egg back to zero taps.

Hatched pets and the pop-up use pictures (mobile `PetPicture.tsx`, web `components/pet/PetPicture.tsx`):

- 31 base pictures made with the Grok CLI's `image_gen` tool (`grok -p`): each species' egg and
  four stages, plus a shared tombstone. The pop-up shows the egg picture; the pet page draws the
  SVG egg.
- Three looks of each hatched stage (72), made by editing the base picture so the character and
  framing carry over: `-blink` (eyes closed, mouth unchanged), `-sick` (droopy eyes, thermometer,
  sweat drop, paler), and `-fading` (lying flat, eyes nearly closed, washed out). Hedgehog, pig, and
  hamster used the Grok CLI's `image_edit`; penguin, panda, and hippo used Gemini's image model,
  through the Antigravity CLI's (`agy -p`) `image-generator` subagent or, for nine hippo looks, the
  Gemini Mac app, with the same prompts. The Legend pictures and their looks were remade in the
  Gemini Mac app with an outfit each (below).
- A healthy pet breathes and blinks: its `-blink` picture flashes on top for about 130ms every
  3.4s. A blink is cut with its base picture's own mask and crop, so the two line up pixel for
  pixel. A sick pet shows `-sick` and shivers; a fading pet shows `-fading` and barely breathes.
- All live in `apps/mobile/assets/pet/` and `apps/web/public/pet/` as 512px WebP with the white
  background flood-filled to transparent from the edges.

Every prompt ends with the same style: "soft flat vector illustration with clean dark brown outlines
and subtle cel shading, app mascot sticker look, centered, full body, facing the viewer, plain solid
white background, no ground, no text, no gradient background, square 1:1". The subject names the
species with its palette, and the stage reads as follows.

- Egg: the species' egg pattern (see `petArt/eggs.ts`), standing upright with a tiny smiling face.
- Baby: tiny and extra round, oversized head, big sparkly eyes, sitting, sweet small smile.
- Juvenile: small and playful, standing with a cheerful open smile.
- Adult: round heavy body, gentle closed-mouth smile, standing.
- Legend: fully grown, mature and dignified, upright and proud with a calm smile, dressed in a
  golden outfit of its own, with no glow, aura, or sparkles: hedgehog in silver armor with a red cape
  and gold shield, pig in a top hat, monocle, and vest holding a gold coin, hamster in a crown and
  ermine cloak holding a golden seed, penguin in a crown and ermine cape with a golden fish scepter,
  panda in a bamboo hat and red jacket holding a golden bamboo staff, hippo in a lotus crown and
  sash holding a golden lotus.
- Tombstone: a small rounded light grey stone, blank face, a tiny pink flower and grass tuft.

### Colors

A pet color changes only the body (fur, skin, feathers), so cheeks, bellies, eyes, outlines, and
Legend outfits stay as drawn, and Pink is the same pink on every species, black panda patches
included. Each body pixel's luminance picks a point between the color's dark and light ends
(`packages/shared/src/petArt/colors.ts`), so shading survives.

- Pictures: `scripts/generate-pet-masks.mjs` writes a 256px body mask per picture to
  `apps/web/public/pet/masks/` and `apps/mobile/assets/pet/masks/` (plus the mobile import map
  `pet-masks.ts`), picking body pixels by per-species hue, lightness, and saturation bands, with
  paler bands for sick and fading looks. Rerun it after a picture changes and look at the result.
  The web (`TintedPicture.tsx`) and mobile (`TintedPetImage.tsx`) draw the picture, then a copy cut
  to the mask and run through `petColorMatrix` as an sRGB `feColorMatrix`: CSS `mask-image` with
  an SVG filter on the web, a `react-native-svg` `Mask` and `Filter` on mobile.
- SVG eggs: `eggArt` tints the species' body fills with `tintPetHex`, the same math.

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
