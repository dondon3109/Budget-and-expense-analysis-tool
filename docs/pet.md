# Pet companion

A streak pet for signed-in users, shown in the mobile app. The rules live in
`packages/shared/src/pet.ts`; the API in `apps/api/src/db/pet.ts` and `src/routes/pet.ts`.

## Rules

- The user picks one of six eggs (hedgehog, pig, hamster, penguin, panda, hippo). An egg hatches
  after 7 consecutive Manila days with an app check-in; a missed day resets the count. Eggs never
  get sick or die.
- Points per action and daily counts: check-in 10 ×1, transaction 10 ×3, subscription 15 ×2, debt
  payment 20 ×2, assistant reply 5 ×3, plus a +10 bonus on the third distinct action type. No day
  earns more than 100.
- Stages by points since hatch: Baby 0, Juvenile 350, Adult 1,000, Monster 5,500.
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
- `POST /api/app/pet/check-in`, sent by the app when it opens.

Activity is credited through the last whole second only, because `datetime('now')` rounds down.

## API

`GET /api/app/pet`, `POST /api/app/pet/check-in`, `PUT /api/app/pet/egg` (`{ species }`, 409 while a
pet is alive), `PUT /api/app/pet/settings` (`{ enabled }`). Every response is a `petViewSchema`.

## Notifications

The mobile app schedules local notifications from each pet view it receives
(`apps/mobile/src/features/pet/pet-notifications.ts`), so they follow activity synced from any
device once the app checks in again.

- A hatched pet is warned at 20, 24, 36, 48, 60 and 70 hours after its last activity, and told at
  72 hours that it passed away. An egg with a streak gets a reminder at 20:00 the next day and a
  note at 07:30 the morning after that, when the streak has already restarted.
- Alerts due between 22:00 and 07:00 Manila time wait until 07:30. A warning that would then land
  at or after the pet's death is dropped.
- They post on the Android channel "Pet alerts", which the user can mute on its own. They never ask
  for permission, so they use only the grant the daily reminder obtained.
- Turning the pet off cancels them, and every identity change cancels them. An offline launch
  keeps the last schedule. The notifications are only reminders: the Worker recomputes the pet from
  timestamps, so a missed one never changes the outcome.
