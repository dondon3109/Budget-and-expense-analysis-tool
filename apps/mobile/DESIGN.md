# Mobile design system

## Direction

Zoption mobile is calm, compact, and money-first. It shares the web app's palette and heading face (a cool mineral ground, near-black ink actions, and the emerald and mint of the Z mark) in native Android and iOS patterns without reproducing the website screen for screen. Financial values and task state outrank decoration.

## Themes

- Light uses a cool green-grey canvas, white raised surfaces, near-black ink text, near-black primary actions, and emerald brand accents.
- Dark uses a near-black green-tinted canvas, raised dark surfaces, and mint primary actions and accents.
- Coffee uses oat surfaces, roasted-brown text and primary actions, and the same emerald brand accents.
- Primary buttons and the active tab pill use the `solid` tokens; `brand` stays for links, selection, and brand-tinted chips.
- Semantic income, expense, budget, info, warning, and danger colors are centralized in `src/ui/tokens.ts`; feature code does not introduce competing palettes.

## Typography and money

- Screen titles, dialog and empty-state titles, and native header titles use Bricolage Grotesque (`fonts` in `src/ui/tokens.ts`), embedded at build time by the `expo-font` config plugin from `assets/fonts`. Body text and money stay on the system face, which preserves native rendering and true tabular figures. All text keeps Dynamic Type scaling.
- Display, title, headline, body, callout, label, and caption roles provide a small type hierarchy.
- `MoneyValue` uses tabular numerals and an explicit screen-reader label such as “42,850 Philippine pesos.”
- Headings stay compact; dense financial screens should not use oversized decorative hero text.

## Layout and interaction

- Spacing follows the 4, 8, 12, 16, 24, 32, and 48 point scale.
- Touch targets are at least 44 points on iOS and 48 density-independent pixels on Android.
- Screens respect safe areas, automatic content insets, keyboard behavior, and a readable maximum width.
- Native stacks, tabs, sheets, dialogs, and back behavior may differ by platform when convention improves clarity.
- Motion must respect the operating system reduced-motion setting. Persistent decorative motion is not part of the system.

## Components

Foundation components live under `src/ui/components`: Button, Card, FormField, MoneyValue, TransactionRow, EmptyState, ErrorState, SyncStatus, OfflineBanner, BottomSheet, ConfirmationDialog, Skeleton, and ChartCard. NativeWind is an implementation utility inside these components, not the design authority.

## State language

- Local durable writes may be shown immediately, but pending work is labeled pending until Worker acknowledgement.
- Offline, retrying, failed, and conflicted states remain distinct.
- Synthetic preview data is labeled as synthetic and never presented as an authenticated balance.
- Destructive actions require explicit language and confirmation; disabled controls retain readable contrast and an accessible disabled state.

## Accessibility floor

Use semantic roles and labels, meaningful focus order, scalable text, sufficient contrast in every theme, non-color status cues, readable chart alternatives, and no horizontal overflow. New reusable components need focused accessibility behavior tests before feature adoption.
