# Live Patients screen vs. Clinical Ink prototype — gap list

Comparison basis: live app screenshots (Sunday, Sep 13, 6:55 AM, Dr. Neha Kapoor account), desktop and mobile, against `design/prototype/index.html`, artboards 2 and 4.

## What landed correctly

Worth naming, because it tells you which files were actually converted and which weren't.

- Global header: "Add patient" secondary, "Schedule session" solid primary. Correct.
- Header date string: "Sunday, Sep 13 · 6:55 AM", single clock icon, weekday in, year out. Correct.
- Sidebar: `.logo-tile` "TN", nav sizing, active item as `--selected` + accent text with no glow, footer without the chevron. Correct.

So `Sidebar.jsx` and `WorkspaceHeader.jsx` converted. Nothing inside the Patients page did.

---

## A. The urgent one: green was introduced

The live Status and Intake columns now use green chips — `✓ Active` on all six rows, `✓ Done` on five, plus an amber `In Progress`. This is new. It wasn't in the original screens and it isn't in the prototype.

Law 3 of the system: **there is no green in this product.** Paid, completed, present, active and online are the expected states, and they're expressed by *reduced* emphasis, not by a color that announces them. Eleven green chips on one screen is the exact failure the whole direction exists to prevent, and it's worse than the lavender tinting it replaced, because green reads as a second brand color.

Also: the chips carry a pale trailing block extending to the right of the label, which reads as a rendering artifact or a leftover gradient. Whatever produces that, remove it.

Target, verbatim from the prototype:

| Column | Value | Treatment |
|---|---|---|
| Status | Active | `.status-plain` — plain text, 13/500, `--text-secondary`. No chip, no icon, no color. |
| Status | Archived | `.status-quiet` — plain text, 13/500, `--text-muted`. |
| Status | New Intake | `.chip-intake` — `--accent-tint` background, `--accent` text, 11/700. The only chip in this column. |
| Intake | Completed | `.status-quiet` — plain text, `--text-muted`. No check icon. |
| Intake | Pending | `.chip-pending` — `--warning-tint` background, `--warning` text, 11/700. |
| Intake | Not applicable | `—` in `--text-muted`. |

Vocabulary also drifted: the live app says "Done" and "In Progress"; the system says "Completed" and "Pending". Pick the system words, and make sure the same words appear in Assessments and the patient profile.

With this fixed, the screen goes from eleven green chips and one amber to zero chips on your current data, since every patient is Active with intake Completed. That is the correct outcome. A column where every row says the same thing should be quiet.

---

## B. Structural gaps

### B1. Rows are still tinted cards, not flush rows

Live: six separately rounded rows, tinted background, gaps between them, shadow per row. The same "stacked cards" pattern as the old dashboard.

Prototype: one `.table-wrap` container, rows flush inside it, `--canvas` background, `--hairline` bottom border, 56px height, no per-row radius or shadow or gap. Hover `--surface-hover`. Row needing action gets a 2px `--accent` inset left rule, not a tint.

The column header row also needs the `--surface` band behind it — live renders it transparent, so the header floats.

### B2. Every avatar is accent-tinted

Six lavender avatars means six accent objects before anything else on the screen is counted.

`.avatar` is neutral: `--surface` background, `--text-secondary` initials, 11/700. `.avatar-accent` exists for exactly one case — a patient in New Intake, because that row needs action. Your current data has no New Intake, so on this screen every avatar should be grey.

### B3. Age and Gender are still separate columns

Prototype merges them into one `Details` column at 160px: `28 · Male`, 13/500 `--text-secondary`. Demographics are rarely why you opened this screen, and two full columns at cell weight give them the same prominence as the name.

### B4. Created shows the year

Live: `Aug 22, 2026`. Prototype: `Aug 22`, 13/500 `--text-muted`, tabular, right-aligned. The year is noise in a list where everything is from this year, and it widens the column for nothing. Show the year only when the date is in a prior year.

### B5. Row actions are always visible

Three icons on every row, at full strength, on both breakpoints. Eighteen icons on the desktop screen.

Prototype: `.row-actions` sits at `opacity: 0` and reveals on row hover or focus-within, at `--icon-muted`. The archive icon goes `--error` only on its own hover. On touch, collapse to a single kebab.

### B6. Duplicate page actions, both tinted

This got worse, not better. The global header now has "Add patient" and "Schedule session"; the page header *also* has "Add Patient" and "Bulk Upload", both in the old lavender tint fill, both title case. Two buttons on screen say Add Patient.

Fix: remove the duplicate from the global header on this route (spec §5, Header). Page level becomes "Add patient" as `.btn-primary` and "Bulk upload" as `.btn-secondary`. Sentence case.

### B7. Title case

"Add Patient", "Bulk Upload", "In Progress". Sentence case throughout.

---

## C. Mobile

The mobile card list repeats everything in section B. Three items are specific to this breakpoint.

### C1. Icon buttons — your call, with rules

You want the page actions as icons so the filter, add and bulk upload sit on one line, and you want icons in the top bar. That's a reasonable call at 390px and the system now supports it. `tokens.css` has `.btn-icon` and `.action-row`.

```html
<!-- page header: filter grows, two icon buttons fixed at the end -->
<div class="action-row">
  <button class="btn btn-secondary grow">
    Active <svg class="icon icon-16"><use href="#i-chevron-down"/></svg>
  </button>
  <button class="btn btn-primary btn-icon" aria-label="Add patient">
    <svg><use href="#i-plus"/></svg>
  </button>
  <button class="btn btn-secondary btn-icon" aria-label="Bulk upload">
    <svg><use href="#i-upload"/></svg>
  </button>
</div>
```

Four rules that come with this:

- **`aria-label` on every icon button, no exceptions.** Add `title=` too for desktop tooltips. An unlabeled icon button is invisible to a screen reader and ambiguous to everyone else.
- **Exactly one of them is `.btn-primary`.** Add patient is solid accent; bulk upload is `.btn-secondary` (white, bordered). Two solid accent squares side by side means neither is the primary action.
- **Touch targets.** `.btn-icon` renders at 36px on a mouse and jumps to 44px under `@media (pointer: coarse)`. That's handled in the CSS — don't override the height.
- **The filter keeps its label.** "Active ▾" as an icon would be unreadable. It takes `.grow` and fills the remaining width.

One honest caveat, then I'll drop it: an icon-only create button is less discoverable than a labeled one, and Add patient is the action a new user most needs to find. Mitigation is the empty state — when the list has no patients, show a labeled `.btn-primary` "Add patient" inside the `.empty` panel. After that the icon is fine, because by then they've done it once.

### C2. Don't duplicate the action across the top bar and the page

Your current mobile screen has `+` and a calendar icon in the top bar *and* the page-level actions below. Pick one home for each action:

- **Top bar** carries app-level actions: schedule session, notifications, avatar, menu. Both icon buttons here are `.btn-ghost .btn-icon` — no solid fill, because the top bar is chrome.
- **Page header** carries the actions for the screen you're on: on Patients that's add patient and bulk upload, in the `.action-row` above.

So on Patients: top bar has menu, schedule session (ghost icon), bell, avatar. Page row has filter, add patient (primary icon), bulk upload (secondary icon). "Add patient" appears once.

On the dashboard, where there's no page-level action row, "Schedule session" in the top bar can be the primary and takes the solid fill.

### C3. Three action icons per card

Prototype uses a single kebab at the top right opening a sheet. Three inline icons at 390px is too much furniture, and view / edit / archive are all reachable from the patient detail anyway. The kebab is already in the prototype markup — the latest mobile screenshot shows it landed correctly.

Card structure per prototype: white card, `--border`, `--radius-lg`, `.shadow-xs`, 16px padding, 12px gap between cards. Line 1 avatar + name 15/700 + chip only if it's an exception. Line 2 `28 yrs · Male · Aug 22` in 13/500 `--text-secondary`, one middle-dot string maximum. Line 3 status as plain text.

## D. Count

Live desktop, colored objects: 6 tinted avatars, 6 green Active chips, 5 green Done chips, 1 amber chip, 2 tinted page buttons, active nav item, solid header button. Roughly 22.

After the fixes, on this same data: active nav item, "Add patient" primary, and nothing else. Two.

---

## E. Order to work in

1. **Status and Intake columns first** (A). Delete the green entirely — grep for `green`, `emerald`, `bg-green-*`, `text-green-*` across the Patients components and the shared chip/badge component, since whatever produced these chips is probably shared with Assessments and Billing too. Fix the Completed/Pending vocabulary in the same pass.
2. Avatars to neutral (B2).
3. Table container and rows: flush, white, hairline, header band (B1).
4. Columns: merge Details, drop the year, right-align Created (B3, B4).
5. Row actions to hover-reveal; kebab on touch (B5).
6. Page header: de-duplicate, correct variants, sentence case (B6, B7).
7. Mobile cards: kebab, labeled primary, card structure (C).

Then grayscale the screen and count accent objects. Three is the budget; this screen should come in at two.
