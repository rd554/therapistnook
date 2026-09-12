# Therapist Nook — Design System v1

**Direction: Clinical Ink.** Near-monochrome structure. Two hues in the entire product: one lavender accent for signal, one red for alarm (plus amber for one pending state). Warmth comes from a second *neutral* (warm paper), never from a second hue.

This document is the single source of truth. Implement in the order given in section 12. Do not start with screens; start with tokens.

---

## 1. The five laws

Everything in this document follows from these. If a future decision conflicts with a law, the law wins.

1. **Fill is a signal, not an identity.** A background fill means "this one needs you now." Nothing that repeats on every row may ever be filled.
2. **Accent budget: 3 per screen.** The lavender accent may appear at most three times on any screen: the primary button, the active nav item, and the one object that needs attention. If you want a fourth, remove one.
3. **Success is the absence of alarm.** Paid, completed, present, active, and online are the expected states. They are expressed by *reduced* emphasis: muted grey text. There is no green in this product.
4. **Structure comes from type, hairlines, and space.** Every screen must still read correctly with all color removed. If it doesn't, fix the type scale and spacing, not the color.
5. **One encoding per attribute.** If an icon says "online," the text and the card fill do not also say it.

---

## 2. Color tokens

```
/* Canvas & surfaces */
--canvas:        #FFFFFF   /* the page */
--paper:         #FAF8F4   /* warm neutral, clinical narrative only */
--surface:       #F7F7F9   /* cool neutral, structural */
--surface-hover: #F2F2F5

/* Text */
--text-primary:   #15151B
--text-secondary: #4E4E5A
--text-muted:     #8A8A96
--text-inverse:   #FFFFFF

/* Lines */
--border:   #E6E6EB   /* visible card / table border */
--hairline: #F1F1F4   /* internal dividers, row separators */

/* Accent (lavender) */
--accent:        #5A4AD1   /* 6.3:1 on white. White text on it is safe. */
--accent-hover:  #4A3BBA
--accent-active: #3E3099
--accent-tint:   #EFEDFB   /* chips and the one hero surface only */
--accent-border: #D9D4F5
--selected:      #E9E6F9   /* active nav, selected row */
--focus-ring:    rgba(90, 74, 209, 0.28)

/* Semantic */
--error:        #A32E43
--error-tint:   #FBEDEF
--error-border: #F0D3D8
--warning:      #8F6414
--warning-tint: #FBF3E3
--success:      #1F7A5C   /* text only, almost never used — see law 3 */

/* Icons */
--icon:       #4E4E5A
--icon-muted: #8A8A96
```

### Where each color may and may not be used

| Token | Use it for | Never use it for |
|---|---|---|
| `--canvas` | Page background, all cards, all table rows, all modals, sidebar | — |
| `--paper` | Background of clinical narrative surfaces only: AI clinical summary, session note body, MMPI-2 report body, assessment instruction panels | Operational chrome, dashboards widgets, payment or patient rows, buttons |
| `--surface` | Avatar background, table header band, disabled inputs, row hover, segmented-control track, empty-state panel | Card backgrounds in a list (that's tinting by another name) |
| `--text-primary` | Page titles, section headings, card headings, patient names, amounts that need attention, body copy | Secondary metadata, table column headers, timestamps |
| `--text-secondary` | Body metadata, demographics, "Active", modality labels, unselected control labels | Anything you want scanned first |
| `--text-muted` | Timestamps, dates, table column headers, "Received", "Completed", placeholders, disabled text | Patient names, amounts, headings |
| `--border` | Card outline, input outline, secondary-button outline, table outer edge | Between every row inside a card (use `--hairline`) |
| `--hairline` | Row separators inside a card or table, divider between header and content | Card outlines (too weak, cards will float) |
| `--accent` | Primary button fill, active nav text+icon, the single hero action, links, focus ring, selected checkbox/radio, active tab underline | Anything that repeats per row, decorative dots, avatars by identity, "online", "received", "active", chart fills for more than one series |
| `--accent-tint` | Chip background for `New Intake` only; optional background of the single next-session card | Any card in a list, any row, any panel, any section background |
| `--selected` | Active sidebar item, currently-open row in a list | Hover state (use `--surface-hover`) |
| `--error` | "Overdue" text, "Failed" text, destructive confirm button, form validation text, left rule on an overdue row, notification dot | "Absent", "No-show" buttons, any patient attribute, any icon that isn't about failure |
| `--error-tint` | Background of a real alert banner; never more than one per screen | Payment rows, patient rows, chips that appear on most rows |
| `--warning` | "Pending" chip text, "No-show" label in history, "Cancelled" label, unsigned-note reminder | Anything a user cannot act on |
| `--success` | Text only, in a confirmation toast, and nowhere else | Chips, fills, borders, icons, status text in lists |

**Closed palette.** Do not add a hue. No teal, sage, plum, steel blue, berry-rose as a second brand color. The plum avatars and steel-blue online state in the current build are removed, not re-tuned.

---

## 3. Typography

### Fonts

```css
--font-ui:      'Switzer', 'Inter', -apple-system, 'Segoe UI', sans-serif;
--font-serif:   'Newsreader', Georgia, serif;       /* clinical narrative only */
--font-numeric: 'Inter', system-ui, sans-serif;      /* tabular figures */
```

- **Switzer** (free, Fontshare) replaces Roboto for all UI. It's a neo-grotesque with slightly humanist terminals: colder and more precise than Roboto at small sizes, and it holds up at 28px+ where Roboto goes soft. Load weights 400, 500, 600 only.
- **Newsreader** (Google Fonts) for clinical narrative body text: the AI clinical summary, session note body, assessment report prose. This is the typographic signature of the product. A therapist's words are set in a reading face; the software's chrome is set in a UI face. Load 400 and 400 italic.
- All numeric columns (money, times, dates, ages, scores) get `font-variant-numeric: tabular-nums`. Verify Switzer's tabular figures render aligned; if they don't, apply `--font-numeric` to numeric cells.

Never use a monospace face for labels or data. Never load a fourth family.

### Scale — desktop

| Role | Element | Size / Line-height | Weight | Tracking | Color |
|---|---|---|---|---|---|
| H1 | Page title ("Patients", "Dashboard") | 28 / 34 | 600 | -0.02em | `--text-primary` |
| H2 | Section heading ("Today's Schedule", "Payments") | 19 / 26 | 600 | -0.01em | `--text-primary` |
| H3 | Card heading, modal title, patient name in a detail header | 15 / 22 | 600 | -0.005em | `--text-primary` |
| H4 | Sub-group label inside a card | 13 / 18 | 600 | 0 | `--text-secondary` |
| Body | Default UI text, list primary text | 15 / 24 | 400 | 0 | `--text-primary` |
| Body S | Metadata, demographics, helper text | 13 / 20 | 400 | 0 | `--text-secondary` |
| Caption | Timestamps, dates, "3 sessions" | 12 / 16 | 400 | 0 | `--text-muted` |
| Table header | Column labels | 12 / 16 | 500 | 0 | `--text-muted` |
| Table cell | Row data | 14 / 20 | 400 | 0 | `--text-secondary` |
| Table cell (key) | Patient name in a row | 14 / 20 | 600 | 0 | `--text-primary` |
| Numeric | Amounts, times, scores | 14 / 20 | 500 | 0 | `--text-secondary` |
| Numeric (key) | Amount needing attention | 14 / 20 | 600 | 0 | `--text-primary` |
| Label | Input label | 13 / 18 | 500 | 0 | `--text-secondary` |
| Button | All button text | 14 / 20 | 500 | -0.005em | per button spec |
| Button S | Compact / row-level button | 13 / 18 | 500 | 0 | per button spec |
| Chip | Status chip text | 11 / 16 | 600 | 0.01em | per chip spec |
| Narrative | Clinical summary, note body (Newsreader) | 16 / 28 | 400 | 0 | `--text-primary` |

**Table column headers are sentence case.** Not uppercase, not tracked out. "Name", "Created", "Status" — not "NAME". Uppercase micro-labels are the single fastest way to make this look like a generic admin template.

### Scale — mobile (≤640px)

Only these change; everything else inherits.

| Role | Size / Line-height |
|---|---|
| H1 | 24 / 30 |
| H2 | 17 / 24 |
| H3 | 15 / 22 |
| Body | 15 / 23 |
| Narrative | 16 / 27 |

Maximum line length for narrative text: 68 characters. Cap the clinical summary panel at `max-width: 62ch`.

---

## 4. Spacing, shape, depth

```
--space-1: 4px    --space-5: 20px   --space-9:  40px
--space-2: 8px    --space-6: 24px   --space-10: 48px
--space-3: 12px   --space-7: 28px   --space-11: 64px
--space-4: 16px   --space-8: 32px

--radius-sm: 6px    /* chips, checkboxes, icon badges */
--radius-md: 8px    /* buttons, inputs, avatars-as-squares, segmented controls */
--radius-lg: 12px   /* cards, table container, list rows */
--radius-xl: 16px   /* modals, sheets, full-width panels */
--radius-full: 999px /* circular avatars only */

--border-width: 1px
--rule-width: 2px   /* the attention rule on a row or card */

--shadow-none: none;
--shadow-xs: 0 1px 2px rgba(21, 21, 27, 0.04);
--shadow-sm: 0 1px 3px rgba(21, 21, 27, 0.06), 0 1px 2px rgba(21, 21, 27, 0.03);
--shadow-md: 0 8px 24px -4px rgba(21, 21, 27, 0.10), 0 2px 6px rgba(21, 21, 27, 0.04);
```

- Page padding: 32px desktop, 20px mobile. Content max-width 1440px.
- Gap between major sections: 40px desktop, 32px mobile.
- Card padding: 20px standard, 16px compact (list rows, mobile cards).
- Gap between cards in a vertical list: 8px if they're rows, 12px if they're cards.
- Table row height: 56px. Compact table row: 48px.
- Sidebar width 240px, nav item height 40px, gap 2px.
- Header height 64px.
- **Radius is assigned by role, not applied uniformly.** A chip and a modal must not share a radius.
- **Shadow never creates hierarchy.** Maximum shadow opacity 0.10. `--shadow-md` is reserved for things that float above the page (modals, dropdowns, popovers). Cards get `--shadow-xs` or nothing. No colored shadows. The indigo glow on the active nav item is deleted.

---

## 5. Component rules

### Sidebar
Background `--canvas`. 1px right border `--border`. No shadow.
- Logo tile 32px, `--radius-md`, `--accent` fill, white "TN", 13/600. Wordmark H3 in `--text-primary`.
- Inactive item: `--text-secondary` 14/500, icon 18px `--icon-muted`, transparent background, `--radius-md`.
- Hover: background `--surface-hover`, text `--text-primary`.
- **Active: background `--selected`, text and icon `--accent`, weight 600. No shadow, no glow, no left bar, no gradient.**
- Footer user block: 32px circular avatar (`--surface` bg, `--text-secondary` initials 11/600), name 13/500 `--text-primary`, role 12/400 `--text-muted`. Separated by a 1px `--hairline` above.

### Header
Background `--canvas`, 1px bottom `--border`, height 64px, no shadow.
- Date and clock: 13/400 `--text-muted`, 14px icons `--icon-muted`.
- Exactly one primary button. Everything else is secondary or ghost.
- **Remove the duplicated page-level actions.** "Add Patient" belongs on the Patients page, not in the global header as well. The global header keeps: date/time, search, notifications, avatar.
- Notification dot: 6px circle `--error`, no ring, no animation.

### Buttons
Height 36px standard, 32px compact, 40px large. `--radius-md`. Icon 16px, gap 8px. Transition 120ms ease on background only.

| Variant | Background | Border | Text | Hover | Use |
|---|---|---|---|---|---|
| Primary | `--accent` | none | `--text-inverse` 14/500 | `--accent-hover` | One per screen. The main action. |
| Secondary | `--canvas` | 1px `--border` | `--text-primary` 14/500 | bg `--surface` | Add Patient when it isn't primary, Bulk Upload, Cancel |
| Ghost | transparent | none | `--text-secondary` 14/500 | bg `--surface`, text `--text-primary` | Filters, "View all", table row actions |
| Destructive | `--error` | none | `--text-inverse` | darken 8% | Only inside a confirm dialog |
| Disabled | `--surface` | 1px `--hairline` | `--text-muted` | none | — |

"View all" is a ghost link in `--accent` 13/500, no arrow glyph appended.
Focus (keyboard): 2px `--accent` outline, 2px offset, on every variant.

### Cards
Background `--canvas`. 1px `--border`. `--radius-lg`. `--shadow-xs`. Padding 20px.
- Card heading H3, then 16px gap to content.
- **No tinted card variants exist.** There is one exception in the whole product, defined under Schedule.
- Narrative variant (clinical summary, note body): background `--paper`, 1px `--border`, `--radius-lg`, body set in `--font-serif` at 16/28.

### Tables
Container: `--canvas`, 1px `--border`, `--radius-lg`, overflow hidden, `--shadow-xs`.
- Header row: background `--surface`, 12/500 `--text-muted`, sentence case, 40px tall, 1px bottom `--hairline`.
- Body rows: background `--canvas`. 1px bottom `--hairline`. Last row no border.
- Hover: `--surface-hover`.
- Selected / currently open: `--selected` background + 2px `--accent` left rule inset.
- Needs attention (e.g. new intake awaiting action): white background + 2px `--accent` left rule. No fill.
- Numeric and date columns right-aligned, tabular figures.
- Row actions: 16px icons `--icon-muted`, `opacity: 0`, revealed on row hover at `--icon`. Delete icon goes `--error` on its own hover only. On touch devices, collapse to a single kebab.

### Avatars
32px circle (`--radius-full`), background `--surface`, initials 11/600 `--text-secondary`.
**One treatment for every patient.** The six-hue avatar set in the current Patients screen is removed. Patient identity is carried by the name, not by a color.
Single permitted variant: a patient in `New Intake` gets `--accent-tint` background and `--accent` initials, because that row needs action.

### Icons
16px in rows and buttons, 18px in nav, 20px in headers. 1.5px stroke. Color `--icon-muted` at rest, `--icon` when meaningful, `--accent` only when part of the 3-per-screen accent budget.
Icon badge (schedule card modality): 32px square, `--radius-md`, background `--surface`, icon `--icon`. Never tinted by category.
No decorative icons. An icon appears only when it replaces a word or marks an action.

### Chips
Height 22px, padding 0 8px, `--radius-sm`, text 11/600.
Only three chips exist in the entire product:

| Chip | Background | Text | Border |
|---|---|---|---|
| New Intake | `--accent-tint` | `--accent` | none |
| Pending | `--warning-tint` | `--warning` | none |
| Overdue (only where a row can't carry a rule) | `--error-tint` | `--error` | none |

Everything else that is currently a chip becomes plain text. Max two filled chips visible in one list region.

### Inputs
Height 40px, `--radius-md`, background `--canvas`, 1px `--border`, text 14/400 `--text-primary`, placeholder `--text-muted`, padding 0 12px.
Focus: border `--accent`, plus 3px ring `--focus-ring`. No glow, no shadow.
Error: border `--error`, message 12/400 `--error` below.
Label 13/500 `--text-secondary`, 6px above the field.

### Modals
Background `--canvas`, `--radius-xl`, `--shadow-md`, padding 24px, max-width 520px (640px for forms).
Backdrop `rgba(21, 21, 27, 0.32)`. Title H3 at 17/24/600. Footer actions right-aligned, secondary then primary, 8px gap.

### Alerts
Only for something the user must act on. Max one per screen.
Background semantic tint, 1px semantic border, `--radius-md`, padding 12px 16px, icon 16px in semantic color, text 13/400 `--text-primary`.
Never use an alert for a confirmation. Confirmations are toasts: `--canvas`, 1px `--border`, `--shadow-md`, text 13/400, optional `--success` check icon.

### Empty states
Background `--canvas` or `--surface` panel, `--radius-lg`, padding 40px, centered.
16px muted line icon, heading 15/600 `--text-primary`, body 13/400 `--text-muted` (max 44ch), one primary or secondary button.
No illustrations, no pastel blobs, no gradients.

---

## 6. Today's Schedule

**Answer: every card is white. Exactly one card is accented, and it is the next session, never "online".**

| State | Background | Border | Text | Accent |
|---|---|---|---|---|
| Next / current session (max one) | `--canvas` | 1px `--border` + **2px `--accent` left rule** | Name H3 `--text-primary`, meta 13/400 `--text-secondary` | Primary button ("Join now") |
| Later today | `--canvas` | 1px `--border` | Name 15/500 `--text-primary`, meta 13/400 `--text-secondary` | Secondary button ("Get link") |
| Completed | `--canvas` | 1px `--hairline` | Name 15/400 `--text-secondary`, meta `--text-muted`, 14px check `--text-muted` | none |
| Cancelled | `--canvas` | 1px `--hairline` | Name `--text-muted`, time struck through, label "Cancelled" 12/500 `--warning` | none |

- **Online vs in-person is an icon plus a word, in neutral color.** Video icon or map-pin icon, 16px `--icon`, inside a `--surface` badge, and the text "Online" / "In person". The steel blue is deleted. Lavender fill for online is deleted. Modality is not urgency.
- Permitted variant, if the dashboard feels too flat with only a left rule: the next-session card may use `--accent-tint` as its background. This is the only tinted surface allowed anywhere in the product, and only one instance per screen.
- The "3 sessions" pill becomes plain text: 12/400 `--text-muted` next to the H2, not a chip.

---

## 7. Recent Patients — Present / Absent

**Answer: attendance uses zero color. Not lavender, and especially not red.**

Marking a patient absent is a neutral clinical fact recorded five to ten times a day. The current dark-berry "Absent" button is the loudest object on the mobile dashboard, which tells the therapist that a no-show is an error state and makes the data-entry control the visual centre of the screen. Both are wrong.

**Control: one segmented pair, used identically on desktop and mobile.** The desktop checkbox columns are replaced by this, so the same action has one component language everywhere.

```
Track:       background --surface, 1px --border, --radius-md, height 32px, padding 2px
Unselected:  transparent, text 13/500 --text-secondary
Hover:       background --canvas, text --text-primary
Selected:    background --text-primary (#15151B), text --text-inverse 13/600, 14px icon white
Disabled:    text --text-muted
```

Present selected and Absent selected are **visually identical in weight and color**. The only difference is which half is filled and the icon (check vs slash). Graphite, not lavender: this repeats per row, so it cannot spend the accent budget.

**Where absence does get a color:** downstream, where it affects operations. In patient history, analytics, and billing, a missed session is labelled "No-show" in 13/500 `--warning`. Amber, because it has a billing consequence. Never `--error`.

**Row treatment for the Recent Patients list:** white rows inside one bordered container, separated by `--hairline`. Date and time in `--text-muted` tabular, patient name 14/600 `--text-primary`. The identity dot before the name is deleted; it duplicates the modality already shown in Schedule.

---

## 8. Payments

**Answer: no payment row ever has a background fill. "Received" is quiet grey. "Overdue" is red text plus a left rule.**

Received is the expected state and currently gets a lavender card, which is inverted emphasis. Alternating lavender and rose down the right rail produces a candy stripe where the two urgent rows don't stand out.

| State | Row background | Rule | Name | Amount | Status | Date |
|---|---|---|---|---|---|---|
| Received | `--canvas` | none | 14/500 `--text-primary` | 14/500 `--text-secondary` tabular | "Received" 13/400 `--text-muted` | 12/400 `--text-muted` |
| Overdue | `--canvas` | 2px `--error` left rule | 14/600 `--text-primary` | 14/600 `--text-primary` tabular | "Overdue" 13/600 `--error` | 12/400 `--text-muted` |
| Pending / awaiting | `--canvas` | none | 14/500 `--text-primary` | 14/500 `--text-secondary` | "Pending" chip (`--warning-tint`) | 12/400 `--text-muted` |
| Failed | `--canvas` | 2px `--error` left rule | 14/600 `--text-primary` | 14/600 `--text-primary` | "Failed" 13/600 `--error` | 12/400 `--text-muted` |

Rows sit in one bordered container with `--hairline` separators, not as five separate cards with gaps.

**Add one line to make overdue instantly legible without any fill:** beside the "Payments" H2, when the overdue count is above zero, show `₹5,500 overdue` in 13/600 `--error`. One red string at the top beats five colored cards, and it's the thing the therapist actually wants to know.

The ₹ symbol renders at `--text-muted` while the digits take the row's text color.

---

## 9. Patients screen

### What's wrong in the current build

1. **Every row is tinted lavender**, and the first row is tinted more strongly. Six tinted rows means the tint carries no information, and the stronger first row reads as "selected" when it actually means "new intake".
2. **Six avatar hues** (rose, lavender, amber, lavender, plum, rose). Color-by-identity is the single biggest contributor to the "pastel SaaS" feel, and it's information-free: the name is already right next to it.
3. **The Status column uses two encodings at once.** "New Intake" and "Archived" are chips; "Active" is plain text; "Completed" is lavender text with a check icon; "Pending" is a rose chip. Four visual languages in two columns.
4. **The chips have a soft trailing fade**, which reads as a gradient artifact and makes them look unfinished.
5. **"Active" is a chip-adjacent treatment on 4 of 6 rows.** A status true of most rows isn't information.
6. **Age and Gender get full columns** at the same weight as Name, spending horizontal room and scanning attention on demographics that are rarely the reason you opened this screen.
7. **"Add Patient" appears twice** (global header and page header), both as tint-filled buttons, so the screen has no primary action.
8. Mobile repeats all of it, plus three action icons per card.

### Target: Patients table

Container per section 5. Header row `--surface`, sentence-case 12/500 `--text-muted`.

| Column | Width | Content | Color |
|---|---|---|---|
| Patient | flex | 32px avatar + name 14/600 | `--text-primary` |
| Details | 160px | "29 · Male" 13/400 | `--text-secondary` |
| Created | 100px | "Sep 11" 13/400 tabular | `--text-muted` |
| Status | 120px | see below | see below |
| Intake | 140px | see below | see below |
| Actions | 96px | 3 icons, hover-revealed | `--icon-muted` |

**Status column — one encoding, chips only for exceptions:**

| Value | Treatment |
|---|---|
| Active | plain text 13/400 `--text-secondary` |
| Archived | plain text 13/400 `--text-muted` |
| New Intake | chip: `--accent-tint` bg, `--accent` text 11/600 |

**Intake column:**

| Value | Treatment |
|---|---|
| Completed | plain text 13/400 `--text-muted`. No check icon, no lavender. |
| Pending | chip: `--warning-tint` bg, `--warning` text 11/600 |
| Not applicable | "—" in `--text-muted` |

**Row backgrounds:** all white. The new-intake row gets a 2px `--accent` left rule instead of a tint, plus the accent avatar variant. Hover `--surface-hover`. Currently-open row `--selected` + accent left rule.

**Result: the whole screen carries 4 accent-family objects** (active nav item, "Add Patient" primary button, one New Intake chip + its rule) and one amber chip. Down from roughly 20.

Header actions on this page: "Add Patient" primary, "Bulk upload" secondary, "Active ▾" filter as a ghost button with 1px `--border`. Remove the header duplicate.

### Target: Patients mobile

- White cards, 1px `--border`, `--radius-lg`, `--shadow-xs`, padding 16px, 12px gap. No tint on any card.
- Line 1: 32px avatar + name 15/600 `--text-primary`, chip right-aligned only if it's New Intake or Pending.
- Line 2: "41 yrs · Male · Jul 19" 13/400 `--text-secondary`. One middle-dot meta string per card, maximum.
- Line 3: status as plain text 13/400 `--text-muted` ("Active · Intake completed"). Only exceptions get a chip.
- Actions: one kebab at top-right, 16px `--icon-muted`, opening a sheet. Three inline icons per card is too much furniture at this width.
- New intake card: 2px `--accent` left rule on the card, accent avatar. Nothing else changes.
- Filter row: ghost filter + primary "Add patient" full-width at 40px height; "Bulk upload" as a text button below, not a second equal-weight button.

---

## 10. Dashboard transformation summary

| Element | Now | Target |
|---|---|---|
| Schedule cards | 2 of 3 solid lavender (online) | All white; 2px accent rule on next session only; modality = neutral icon + word |
| Recent Patients | 5 lavender-tinted rows in a table | White rows, hairline separators, one bordered container |
| Present / Absent | Lavender + berry checkboxes / buttons | Graphite segmented control, zero hue |
| Payments | Alternating lavender / rose cards | White rows; overdue = red text + left rule; "₹5,500 overdue" beside the heading |
| Clinical summary | Smallest card on the page, labelled "Today" in grey | Promoted: `--paper` background, H3 "Clinical summary", body in Newsreader 16/28, patient name and date as 12/400 `--text-muted`, moved to the top of the right rail with real padding (24px) |
| Header buttons | Two identical tint buttons | "Schedule session" primary, "Add patient" secondary |
| Active nav | Lavender pill + indigo glow shadow | `--selected` background, `--accent` text, no shadow |
| "3 sessions" pill | Lavender chip | Plain muted text |
| Right rail | Ends 160px above the left column | Equal column rhythm: 40px section gaps in both columns |

The clinical summary promotion matters more than any color change. It's the only thing on that dashboard no competitor has, and it's currently the weakest object on the screen.

---

## 11. Do not do this

1. Do not tint a card or row background to show category, identity, or a normal state.
2. Do not exceed three accent-colored objects per screen.
3. Do not exceed two filled chips visible in one list region.
4. Do not use the accent on anything that repeats per row.
5. Do not add green. Success is expressed by reduced emphasis, not by color.
6. Do not use red for anything except overdue, failed, and destructive confirmation. Never for absence, never for a patient attribute.
7. Do not color avatars by patient identity.
8. Do not encode the same attribute twice (fill + icon + text + dot).
9. Do not use gradients anywhere, including chip fades and button fills.
10. Do not use colored or glowing shadows. Maximum shadow opacity 0.10.
11. Do not use shadow to create hierarchy that spacing should create.
12. Do not set labels or table headers in all caps or tracked-out uppercase.
13. Do not give a status a chip when that status is true of most rows.
14. Do not add an eyebrow label above content that is already self-evident.
15. Do not place two equal-weight buttons side by side; one of them is secondary.
16. Do not apply one radius to everything. Radius is assigned by role.
17. Do not reduce whitespace to fit more content or more color.
18. Do not introduce a new hue. The palette is closed.
19. Do not use decorative icons, or append arrow glyphs to link text.
20. Do not ship a screen that fails this test: remove all color, and hierarchy still reads. If it fails, fix type and spacing.

---

## 12. Implementation order for Claude Code

Token-first, non-destructive. You have 10 practices on the live UI, so each phase should be independently shippable.

**Phase 0 — foundations, no component edits.**
1. Add `tokens.css` (provided alongside this doc) and import it once at the app root.
2. Extend `tailwind.config.js` from the mapping in section 13. Do not delete the default palette yet; add the semantic names.
3. Load Switzer (400/500/600) and Newsreader (400, 400i). Set `--font-ui` on `body`.
4. Add a `type.css` layer with the section 3 scale as utility classes (`.t-h1`, `.t-h2`, `.t-h3`, `.t-body`, `.t-body-s`, `.t-caption`, `.t-table-head`, `.t-cell`, `.t-cell-key`, `.t-num`, `.t-label`, `.t-chip`, `.t-narrative`).

**Phase 1 — strip the fills.** Grep and replace, app-wide:
```
bg-indigo-*  bg-violet-*  bg-purple-*   -> bg-white / bg-[--surface]
bg-rose-*    bg-red-50    bg-pink-*     -> bg-white
bg-slate-50 on rows                     -> bg-white
shadow-indigo*  shadow-purple*  ring-*  -> shadow-xs / none
from-* via-* to-* (gradients)           -> removed
text-indigo-* used for "received/active/completed" -> --text-muted
```
Ship this alone. The app will look under-designed for one commit. That's expected; phases 2 and 3 supply the structure that the fills were faking.

**Phase 2 — typography.** Apply the scale to every heading, row, cell, and label. Convert all uppercase labels to sentence case. Add `tabular-nums` to money, time, date, age, and score cells.

**Phase 3 — components, in this order.** Each is a self-contained PR: Sidebar → Header → Button → Chip/Badge → Avatar → Table + row → Card → Segmented control (Present/Absent) → Schedule card → Payment row → Input → Modal → Alert/Toast → Empty state.

**Phase 4 — screens, in this order.** Dashboard (desktop, mobile) → Patients (desktop, mobile) → Calendar → Billing → Assessments → Patient profile → Analytics → Settings.

**Phase 5 — audit each screen against the six tests.** For every screen: count accent objects (must be ≤3), count filled chips (≤2 per region), and screenshot it with `filter: grayscale(1)`. If the grayscale version loses its hierarchy, the screen is not done.

Rules for the agent: never hardcode a hex value in a component; always reference a token. Never add a token without adding its row to the section 2 table. Never introduce a hue.

---

## 13. Tailwind mapping

```js
// tailwind.config.js
theme: {
  extend: {
    colors: {
      canvas: '#FFFFFF',
      paper: '#FAF8F4',
      surface: { DEFAULT: '#F7F7F9', hover: '#F2F2F5' },
      ink: { DEFAULT: '#15151B', secondary: '#4E4E5A', muted: '#8A8A96' },
      line: { DEFAULT: '#E6E6EB', hair: '#F1F1F4' },
      accent: {
        DEFAULT: '#5A4AD1', hover: '#4A3BBA', active: '#3E3099',
        tint: '#EFEDFB', border: '#D9D4F5', selected: '#E9E6F9',
      },
      danger: { DEFAULT: '#A32E43', tint: '#FBEDEF', border: '#F0D3D8' },
      warn: { DEFAULT: '#8F6414', tint: '#FBF3E3' },
      ok: '#1F7A5C',
    },
    fontFamily: {
      sans: ['Switzer', 'Inter', 'system-ui', 'sans-serif'],
      serif: ['Newsreader', 'Georgia', 'serif'],
      num: ['Inter', 'system-ui', 'sans-serif'],
    },
    borderRadius: { sm: '6px', md: '8px', lg: '12px', xl: '16px' },
    boxShadow: {
      xs: '0 1px 2px rgba(21,21,27,0.04)',
      sm: '0 1px 3px rgba(21,21,27,0.06), 0 1px 2px rgba(21,21,27,0.03)',
      md: '0 8px 24px -4px rgba(21,21,27,0.10), 0 2px 6px rgba(21,21,27,0.04)',
    },
  },
}
```

Add an ESLint or CI grep that fails on `bg-indigo`, `bg-violet`, `bg-purple`, `bg-rose`, `bg-pink`, `shadow-indigo`, and raw `#` hex values inside `src/components`. That constraint is what keeps the system from drifting back over the next six months.

---

## 14. Accessibility check

Verified pairs (WCAG AA needs 4.5:1 for text under 18px):

| Pair | Ratio |
|---|---|
| `--text-primary` on `--canvas` | 16.4:1 |
| `--text-secondary` on `--canvas` | 8.3:1 |
| `--text-muted` on `--canvas` | 3.4:1 — **decorative and large text only**; never body copy |
| `--accent` on `--canvas` | 6.3:1 |
| `--text-inverse` on `--accent` | 6.3:1 |
| `--accent` on `--accent-tint` | 5.4:1 |
| `--accent` on `--selected` | 5.1:1 |
| `--error` on `--canvas` | 7.2:1 |
| `--error` on `--error-tint` | 6.2:1 |
| `--warning` on `--warning-tint` | 6.0:1 |
| `--text-inverse` on `--text-primary` | 16.4:1 |

`--text-muted` is the one token to police. It's correct for dates, table headers, and "Received", and wrong for anything a user has to read carefully. The current build's lavender-on-lavender-50 pairs (around 3:1) are all eliminated by this palette.
