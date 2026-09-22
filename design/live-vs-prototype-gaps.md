# Live dashboard vs. Clinical Ink prototype — full gap list

Comparison basis: live app screenshot (Sep 13, 1:21 AM, Dr. Neha Kapoor account) against `design/prototype/index.html`, artboard 1 "Dashboard — desktop".

**Font decision changed since the prototype was built: the system is now Manrope, not Switzer.** `tokens.css`, `marketing.css` and the design system doc have all been updated. The prototype HTML still loads Switzer via the old `tokens.css` import; re-pull the updated `tokens.css` into `design/` and the prototype will pick up Manrope with no markup change. Weights and tracking across the whole scale moved up one step to compensate for Manrope's lighter stems and wider set — use the updated file rather than the old numbers.

---

## Root cause

The approach is wrong, not just incomplete. `clinical-ink-overrides.css` layers new declarations on top of the old component CSS in `index.css`, so both stylesheets are alive and competing, and every component keeps its old markup. An overrides file can change a color; it cannot change a table into a flush list, a checkbox into a segmented control, or a tinted card into a white row with a rule.

Correct approach: port the prototype's component classes into the app as a real stylesheet, change the JSX to use those classes, and **delete** the old rules for each component as you convert it. One component at a time, old CSS removed in the same commit. If `clinical-ink-overrides.css` still exists when the dashboard is done, the migration has failed.

Import order in `main.jsx` / `App.jsx`:
```
import './styles/tokens.css';       // tokens + component classes (from design/tokens.css, unmodified)
import './styles/clinical-ink.css'; // prototype.css component classes, renamed
import './index.css';                // shrinking legacy file — delete rules as you convert
```

---

## A. Gaps already identified

Confirmed against the prototype markup. All five are real.

1. **Next-session accent rule.** The prototype's first schedule card carries `.card.rule-accent`, a 2px inset `--accent` left rule. Live cards are uniform with no "next session" emphasis.
2. **Attendance toggle.** Prototype uses `.seg` / `.seg-option` — a segmented pair with a graphite fill on the chosen half and a 14px check or x icon inside each. Live uses coloured checkbox squares on desktop and coloured pills on mobile. Different component, not a different colour.
3. **Overdue payments.** Prototype: white row, `.rule-error` left stripe, "Overdue" as inline `.status-alert` text. Live: the whole card is tinted rose.
4. **Clinical summary narrative card.** Absent from the live right rail. See section C — this is not a straight port.
5. **Header buttons.** Prototype: "Schedule session" is `.btn-primary` (solid), "Add patient" is `.btn-secondary` (white + border). Live gives both the same tinted fill, so the screen has no primary.

---

## B. Gaps that were missed

Cumulatively larger than section A.

### B1. Typography — recalibrate, don't swap

Manrope stays. But the live app is running it at the old sizes, weights and tracking, which is why headings look soft and the nav reads oversized next to the prototype.

Apply the updated scale from `tokens.css`. The values that actually changed:

| Role | Was | Now |
|---|---|---|
| H1 page title | 28/34, 600, -0.02em | 28/34, **700**, **-0.025em** |
| H2 section heading | 19/26, 600, -0.01em | 19/26, 600, **-0.015em** |
| H3 card heading | 15/22, 600, -0.005em | 15/22, 600, **-0.01em** |
| Body small / metadata | 13/20, 400 | 13/20, **500** |
| Caption / timestamps | 12/16, 400 | 12/16, **500** |
| Table header | 12/16, 500 | 12/16, **600** |
| Table cell | 14/20, 400 | 14/20, **500** |
| Table cell key (patient name) | 14/20, 600 | 14/20, **700** |
| Numeric key (amount needing attention) | 14/20, 600 | 14/20, **700** |
| Button | 14/20, 500, -0.005em | 14/20, **600**, **-0.01em** |
| Chip | 11/16, 600, 0.01em | 11/16, **700**, **0.015em** |
| Nav item | 14/20, 500 (active 600) | 14/20, **600** (active **700**) |
| Segmented control selected | 600 | **700** |

Load `Manrope:wght@400;500;600;700`. If the app currently loads only 400 and 600, the 700s will synthesise and look muddy.

Two checks specific to Manrope, both quick:
- Put ₹2,500 above ₹3,000 in the payments rail and confirm the digits align. If they don't, point `--font-numeric` at Inter and apply it to money and time cells only.
- Glance at the Created column on Patients. Manrope's `1` is distinctive enough to look odd in dense date columns.

Also clear any `fontFamily` entry in `tailwind.config.js` that still names a different face — it will override you on every element carrying `font-sans`.

### B2. Title case everywhere

Live: "Today's Schedule", "Recent Patients", "Add Patient", "Schedule Session", "Schedule Appointment".
Prototype: "Today's schedule", "Recent patients", "Add patient", "Schedule session", "Schedule appointment".

Sentence case is a system rule (§11, rule 12). Find-and-replace across the dashboard components; it shifts the feel more than the effort suggests.

### B3. Recent Patients is still a table, and the rows are still tinted

Largest structural gap. The earlier pass only covered the toggle inside it.

Live still has: a column header row (Date / Time / Appointment / Present / Absent), five separately rounded row cards with gaps between them, a tinted grey fill on each row, and a coloured dot before each patient name.

Target structure, verbatim from the prototype:

```html
<div class="table-wrap card-flush">
  <div class="list-row rp-row">
    <div class="rp-id">
      <span class="t-caption tnum rp-datetime">Sep 10 · 4:00 PM</span>
      <span class="t-cell-key">Priya Sharma</span>
    </div>
    <div class="seg">
      <button class="seg-option" aria-pressed="true"><svg class="icon icon-14"><use href="#i-check"/></svg>Present</button>
      <button class="seg-option" aria-pressed="false"><svg class="icon icon-14"><use href="#i-x"/></svg>Absent</button>
    </div>
  </div>
  <!-- repeat per row -->
</div>
```

Four separate changes inside `RecentPatientsTable.jsx`:
- Delete the column header row. Date and time collapse into one `.t-caption` line above the name.
- One container (`.table-wrap.card-flush`), rows flush inside with `--hairline` dividers. No per-row radius, no gaps, no per-row shadow.
- Row background `--canvas`. The tinted fill goes.
- Delete the dot before the patient name. It duplicated modality, which the schedule already shows.

Rename the component while you're in there; it is no longer a table.

### B4. Payments is missing the overdue total

```html
<div class="section-head">
  <h2 class="t-h2">Payments</h2>
  <span class="status-alert">₹5,500 overdue</span>
</div>
```

Live has "View all →" in that slot instead. Keep "View all" if you need the route, but the total is the functional half and it's absent. Compute it from the overdue rows.

Note on the live data: all four visible payment rows are overdue, so once tints are removed you'll get four red rules stacked. That's correct and honest, not a bug.

### B5. Arrow glyphs on "View all"

Present on both Recent Patients and Payments. The system bans appended arrows (§11, rule 19). Plain text link, `--accent`, 13/500.

### B6. Payment row internal layout

Live stacks name over amount on the left, status over date on the right, with the amount in muted red.

Prototype: name and status left, amount and date right-aligned. Amount uses `.t-num` (received) or `.t-num-key` (overdue) with tabular figures, and the ₹ symbol renders at `--text-muted` while the digits take the row's colour. Received rows keep 500 weight in `--text-secondary`; overdue rows promote to 700 in `--text-primary`.

### B6b. Icon buttons in the header

Confirmed direction: the app bar uses icon buttons rather than labeled ones on mobile, and may on desktop too. `tokens.css` now carries `.btn-icon` (36px, 44px under `pointer: coarse`) and `.topbar-actions`.

Rules: `aria-label` on every instance, `title=` for desktop tooltips, and only one icon button per screen may take `.btn-primary`. On the dashboard that one is "Schedule session", since there's no page-level action row competing with it. "Add patient" is `.btn-secondary .btn-icon`. Notification bell and avatar stay as they are — they're not buttons in the variant sense and take no fill.

### B7. Header date/time

Live: calendar icon + "Sep 13, 2026", then a separate clock icon + "1:21 AM".
Prototype: one clock icon + "Thursday, Sep 11 · 10:42 AM" as a single `.t-body-s` string. Weekday in, year out.

### B8. Sidebar details

- Logo: live uses the purple blob mark at ~28px. Prototype uses `.logo-tile` — a 32px `--radius-md` square in `--accent`, white "TN" at 13/600. The blob doesn't read at that size and won't survive as a favicon.
- Wordmark and nav labels are running larger than the system (nav is 14/600, 40px item height, 18px icons).
- Live sidebar footer carries a trailing chevron; the prototype has avatar + name + role only.

### B9. Empty-state card

Not fully comparable — the live account has no appointments and the prototype has three. But two things in the live version are wrong regardless: the icon badge is tinted (it should be `--surface` background with an `--icon` glyph, §5), and the panel is oversized. `.empty` specifies a 15/600 title and 13/500 `--text-muted` body. The solid accent "Schedule appointment" button is correct as that screen's single primary.

### B10. Accent value

Confirm the live app resolves `--accent` to `#5A4AD1`. The button in the screenshot reads more saturated. If any component still hardcodes `#7C72E8`, or Tailwind's `indigo`/`violet` scale is still referenced on this screen, the two will never match no matter how much structure lands.

---

## C. The Therapist's Note question

The live right rail has a "Therapist's Note" freeform textarea; the prototype has a "Clinical summary" narrative card. This is two different features competing for one slot, not a missing component, and the note is real functionality someone may already be using.

Don't delete it to match a mockup:

- Keep the note. Restyle it to `.card-narrative`: `--paper` background, `--border`, `--radius-lg`, 24px padding, no shadow. The textarea itself gets no border, transparent background, and `.t-narrative` (Newsreader 16/28) so what the therapist types reads like writing rather than form input.
- Add the clinical summary above it as a second `.card-narrative` when a summary exists for the day. If none exists, the note sits alone.
- `--paper` appears nowhere else on the screen. That's the point: the two blocks of human language share a surface that operational chrome never uses.

---

## D. Order to work in

Each step is one commit, and each deletes the legacy CSS it replaces.

1. Fonts: load all four Manrope weights, apply the updated scale (B1), clear the Tailwind `fontFamily` override. Confirm 700s are real and not synthesised before continuing.
2. Sentence case pass (B2).
3. Updated `tokens.css` + `clinical-ink.css` in, `clinical-ink-overrides.css` out.
4. `WorkspaceHeader.jsx`: button variants (A5), date/time string (B7).
5. `TodaySchedule.jsx`: `.rule-accent` on next session (A1), neutral icon badge, empty state (B9).
6. `RecentPatientsTable.jsx`: full rebuild (B3 + A2).
7. `PaymentsList.jsx`: white rows + `.rule-error` (A3), overdue total (B4), row layout (B6), arrow removal (B5).
8. `TherapistNote.jsx`: `.card-narrative` (C).
9. `Sidebar.jsx`: logo, sizes, footer (B8).
10. Delete `clinical-ink-overrides.css`. If anything breaks when you remove it, that component wasn't converted.

Then verify: apply `filter: grayscale(1)` to the live dashboard and confirm hierarchy survives, and count accent objects on screen. Three is the budget.
