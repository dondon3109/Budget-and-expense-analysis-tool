# Pet companion

A streak pet for signed-in users. On mobile it opens from the Pet entry in the Home view menu; on
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
- Points per action and daily counts: check-in 10 ×1, transaction 10 ×3, subscription 15 ×2, debt
  payment 20 ×2, assistant reply 5 ×3, plus a +10 bonus on the third distinct action type. No day
  earns more than 100.
- Stages by points since hatch: Baby 0, Juvenile 350, Adult 1,000, Legend 5,500.
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

`GET /api/app/pet`, `POST /api/app/pet/check-in`, `PUT /api/app/pet/egg` (`{ species, name }`, 409 while a
pet is alive), `POST /api/app/pet/hatch` (409 `egg_not_ready` unless a ready egg is enabled),
`PUT /api/app/pet/settings` (`{ enabled }`). Every response is a `petViewSchema`.

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

The pet pages on mobile and the web draw the same animated SVG layers
(`packages/shared/src/petArt/`, rendered by mobile `PetSprite.tsx` and web
`components/pet/PetSvg.tsx`). Each pair of taps on a ready egg spreads one more crack, and every
tap shakes it harder; the shell bursts only once the Worker accepts the hatch, and a failed hatch
settles the egg back to zero taps. The pop-up uses 31
pictures made with the Grok CLI's `image_gen` tool (`grok -p`): each species at every stage, plus a
shared tombstone. A sick pet's picture is shown greyed out rather than drawn separately. They live
in `apps/mobile/assets/pet/` and `apps/web/public/pet/` as 512px WebP files with the white background flood-filled to
transparent from the edges.

Every prompt ends with the same style: "soft flat vector illustration with clean dark brown outlines
and subtle cel shading, app mascot sticker look, centered, full body, facing the viewer, plain solid
white background, no ground, no text, no gradient background, square 1:1". The subject names the
species with its palette from the SVG art, and the stage reads as follows.

- Egg: the species' egg pattern (see `petArt/eggs.ts`), standing upright with a tiny smiling face.
- Baby: tiny and extra round, oversized head, big sparkly eyes, sitting, sweet small smile.
- Juvenile: small and playful, standing with a cheerful open smile.
- Adult: round heavy body, gentle closed-mouth smile, standing.
- Legend: fully grown, mature and dignified, larger, upright and proud with a calm smile; noble,
  not scary, with no accessories, glow, aura, or sparkles.
- Tombstone: a small rounded light grey stone, blank face, a tiny pink flower and grass tuft.

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
