# Buddy Pass — Design System

Dark-first, energetic, data-forward. Built to be read at arm's length between sets.
All tokens are expressed as CSS variables so they map directly onto shadcn/ui + Tailwind, and stay portable to React Native.

## Principles

1. **Glanceable under load.** The mid-workout screen is the design target: sweaty hands, phone on the floor, 2-second glances. Big numbers, big targets, obvious state.
2. **Volt is you, violet is your buddies.** Everything the *user* does (actions, progress, completions) is volt. Everything *friends* do (presence, invites, sync activity, comparisons) is violet. Never mix them.
3. **Numbers are the interface.** Reps, weight, timers, and PRs get the largest type on screen. Chrome and labels stay small and muted.
4. **Status is systematic.** Every status enum in the schema maps to exactly one semantic color (see table below). No ad-hoc greens/reds in feature code.
5. **Dark is the source of truth.** Design dark-first; light mode is a derived theme, added later.

## Color

### Neutrals (dark theme)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0B0B0E` | App background |
| `--surface-1` | `#141419` | Cards, sheets |
| `--surface-2` | `#1D1D24` | Nested cards, inputs, hover |
| `--surface-3` | `#26262F` | Active/pressed, popovers |
| `--border` | `#2C2C36` | Hairlines, dividers |
| `--text` | `#F4F4F6` | Primary text |
| `--text-muted` | `#9A9AA6` | Labels, secondary text |
| `--text-faint` | `#5C5C68` | Placeholders, disabled |

Elevation on dark = lighter surface + border, **not** drop shadows. Shadows are reserved for overlays (dialogs, sheets).

### Brand

| Token          | Hex       | Use                                                                         |
| ----------------| -----------| -----------------------------------------------------------------------------|
| `--volt`       | `#C8F542` | "You": primary actions, your progress, completed sets, PRs, streaks         |
| `--volt-dim`   | `#8FB32E` | Volt on large fills where full volt is too loud (charts, progress tracks)   |
| `--violet`     | `#A78BFA` | "Buddies": friend presence, sync mode, invites, friend stats in comparisons |
| `--violet-dim` | `#7C5CD6` | Violet fills/tracks                                                         |

- Text/icons **on volt** are always dark (`#101204`) — never white.
- Text/icons **on violet** are dark (`#17103A`) at these tints; verify contrast if the tint changes.
- Volt doubles as the success color. Do not introduce a second green.

### Semantic

| Token | Hex | Use |
|---|---|---|
| `--success` | `--volt` | Completed, accepted, done |
| `--warning` | `#F5A623` | Pending states, expiring invites, recovery cautions |
| `--danger` | `#F4514E` | Errors, cancelled/rejected, destructive actions |
| `--info` | `#4EA8F4` | Neutral notices, tips |

### Status mapping (from schema enums)

| Domain status           | Treatment                      |
| -------------------------| --------------------------------|
| workout `planned`       | neutral (`--text-muted` badge) |
| workout `in_progress`   | volt, pulsing dot              |
| workout `completed`     | volt, solid                    |
| workout `cancelled`     | `--danger`, muted badge        |
| invite `pending`        | `--warning`                    |
| invite `accepted`       | volt                           |
| invite `rejected`       | `--danger`                     |
| multiplayer `pending`   | `--warning`                    |
| multiplayer `active`    | violet, pulsing dot            |
| multiplayer `completed` | violet, solid                  |
| set `completed`         | volt check                     |
| set incomplete          | `--text-faint` outline         |

### Friend accents

For avatars, charts, and multi-friend comparisons, assign colors in this fixed order (stable per friendship, assigned at accept time):

`#A78BFA` violet → `#4EA8F4` blue → `#F472B6` pink → `#2DD4BF` teal → `#FB923C` orange → `#E879F9` fuchsia

Volt is excluded — it always means *you*.

## Typography

- **Family:** Inter (variable) for everything. No second display font for v1.
- **Numerals:** `font-variant-numeric: tabular-nums` on ALL numeric data — weights, reps, timers, stats. Non-negotiable; prevents timer jitter and misaligned tables.
- **Hierarchy is weight + color, not just size.** Labels: 12–14px muted; values: large, bright, semibold+.

| Token | Size / weight | Use |
|---|---|---|
| `display` | 48px / 700 | Live timer, active-set weight & reps |
| `stat` | 30px / 700 | Dashboard stats, PR numbers |
| `h1` | 24px / 600 | Screen titles |
| `h2` | 20px / 600 | Section headers |
| `body` | 16px / 400 | Default text |
| `body-sm` | 14px / 400 | Secondary text, table cells |
| `label` | 12px / 500, uppercase, +0.05em tracking | Field labels, badge text, "SETS × REPS" |

Line-height: 1.2 for display/stat, 1.5 for body.

## Spacing, layout, radius

- **Base unit 4px.** Use the Tailwind default scale; component padding lands on 8/12/16/24.
- **Touch targets:** 44px minimum everywhere; **56px** for mid-workout controls (complete set, adjust weight, rest timer skip).
- **Mobile-first:** single column ≤640px; max content width 640px on desktop for workout flows, wider (1024px) only for dashboards/history.
- **Thumb zone:** primary in-workout actions live in the bottom third of the screen (sticky bottom bar).
- **Radius:** `--radius: 12px` for cards/sheets, 8px for buttons/inputs, full pill for badges/avatars/timer chips.

## Icons

- **Set:** Lucide only (ships with shadcn/ui). No mixed icon sets, no emoji as UI icons.
- **Size:** 20px inline with text, 24px standalone/nav, 28px in-workout controls.
- **Stroke:** 2 (Lucide default). Never fill.
- Icons are always paired with a label or `aria-label` — never meaning-bearing alone.

## Motion

- **Durations:** 150ms (hover/press), 200ms (enter/exit), 300ms (sheets/dialogs). Ease-out for enters, ease-in for exits.
- **Signature moments (only places motion gets loud):**
  - Set completed → volt check pop (~250ms spring).
  - PR hit → one-shot volt celebration.
  - Buddy activity in sync mode → violet pulse on their avatar/row.
- Rest timer counts down smoothly (no per-second jump animation).
- Respect `prefers-reduced-motion`: replace pulses/pops with instant state changes.

## Accessibility

- Text contrast ≥ 4.5:1 on its surface (the neutral scale above satisfies this; re-verify if tweaked).
- Status never communicated by color alone — always pair with icon or text (badges say "Pending", not just amber).
- Focus rings: 2px volt outline with 2px offset, on every interactive element.

## Implementation notes

Express tokens as CSS variables in `:root`/`.dark` and map them to shadcn/ui's token names (`--background`, `--primary`, `--secondary`, etc.) in the Tailwind config:

```css
.dark {
  --background: #0B0B0E;
  --card: #141419;
  --border: #2C2C36;
  --foreground: #F4F4F6;
  --muted-foreground: #9A9AA6;
  --primary: #C8F542;            /* volt */
  --primary-foreground: #101204;
  --secondary: #A78BFA;          /* violet */
  --secondary-foreground: #17103A;
  --destructive: #F4514E;
  --radius: 0.75rem;
}
```

Feature code consumes semantic tokens (`bg-primary`, `text-muted-foreground`), never raw hexes. Friend-accent hexes live in one shared constant (in the shared types package) so web and React Native use the same list.
