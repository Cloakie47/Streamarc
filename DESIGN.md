# StreamArc — Design System

> Audit of the design language currently in use across the app, followed by a list of targeted improvements.
> Source files audited: `app/globals.css`, `tailwind.config.ts`, `app/components/watch/WatchPage.tsx`, `app/components/layout/Sidebar.tsx`, `app/components/studio/StudioPage.tsx`.

---

## 1. Brand Identity

The visual language is derived from the StreamArc logo: **electric cyan eyes on near-black, with deep-teal depth.** Two anchor colors:

- **Electric cyan** `#30D8F0` (`hsl(188 86% 56%)`) — primary, used for accents, glows, active states, ticker
- **Icy aqua** `#A8F0F0` (`hsl(180 70% 80%)`) — secondary accent, button highlights, chapter markers

The visual mood is **Apple-TV-polish + Twitch-playfulness**: dark layered glass panels, soft ambient noise, cyan bloom glows, springy interactions. No multi-color gradients (deliberately — see `--sa-grad` is a *solid*, not a gradient).

---

## 2. Color Tokens

### shadcn / Tailwind base (HSL triplets via `:root`)

| Token | Value | Role |
|---|---|---|
| `--background` | `215 50% 5%` | App background |
| `--foreground` | `188 25% 96%` | Body text |
| `--card` | `213 45% 9%` | Card surface |
| `--primary` | `188 86% 56%` | Electric cyan (brand) |
| `--primary-foreground` | `215 60% 6%` | Text on primary |
| `--accent` | `180 70% 80%` | Icy aqua highlight |
| `--secondary` | `213 35% 14%` | Subtle button bg |
| `--muted` | `213 30% 16%` | Subdued surface |
| `--muted-foreground` | `198 12% 70%` | De-emphasized text |
| `--destructive` | `0 75% 60%` | Errors / delete |
| `--border` | `198 30% 22%` | Default border |
| `--ring` | `188 86% 56%` | Focus ring color |
| `--radius` | `1rem` | shadcn default radius |
| `--live` | `0 80% 60%` | Live red |
| `--ticker` | `188 86% 70%` | Per-second rate text |

### `sa-*` custom palette (`globals.css`)

| Token | Color | Use |
|---|---|---|
| `--sa-bg` | `hsl(215 50% 5%)` | Page bg (also `#040910` literal in `body`) |
| `--sa-surface` | `hsl(213 45% 9%)` | Cards, panels |
| `--sa-surface-2` | `hsl(213 38% 13%)` | Inputs, raised surfaces |
| `--sa-border` | `hsl(198 30% 22%)` | Standard 1px borders |
| `--sa-border-light` | `hsl(198 24% 18%)` | Softer borders |
| `--sa-border-hover` | `hsl(188 60% 38%)` | Border on hover (cyan-tinted) |
| `--sa-text` | `hsl(188 25% 96%)` | Primary text |
| `--sa-text-3` | `hsl(198 14% 68%)` | Tertiary / labels / muted captions |
| `--sa-blue` | `hsl(188 86% 56%)` | Main electric cyan |
| `--sa-blue-glow` | `hsla(188, 86%, 56%, 0.18)` | Cyan glow halo |
| `--sa-cyan` | `hsl(180 70% 80%)` | Icy aqua highlight |
| `--sa-accent` | `hsl(180 70% 80%)` | Alias for `--sa-cyan` |
| `--sa-green` | `hsl(160 70% 55%)` | Success / mint (balance up) |
| `--sa-red` | `hsl(0 80% 62%)` | Live / error / destructive |

### Tailwind config palette (`sa.*`)

`tailwind.config.ts` also exposes named hex colors under `sa.*`:
`sa-bg #040910`, `sa-surface #091422`, `sa-surface-2 #0d1c30`, `sa-blue #30D8F0`, `sa-blue-bright #A8F0F0`, `sa-cyan #A8F0F0`, `sa-deep-teal #187890`, `sa-green #3CD9A0`, `sa-red #F45D5D`.

> ⚠️ **Inconsistency:** the CSS-variable `sa-*` values (HSL) and the Tailwind `sa-*` hex values aren't byte-identical. They're visually close but not unified.

### Layout tokens

| Token | Value |
|---|---|
| `--sidebar-width` | `248px` |
| `--nav-height` | `68px` |
| `--sa-card-radius` | `1.25rem` |

---

## 3. Typography

Three font families loaded via Google Fonts:

| Family | Use | Weights loaded |
|---|---|---|
| **Inter** | Body, buttons, default UI | 400 / 500 / 600 / 700 / 800 |
| **Space Grotesk** | Headings (`h1`–`h6`), wordmark | 500 / 600 / 700 |
| **JetBrains Mono** | Balance amounts, timecodes, ticker, addresses | 400 / 500 / 600 |

**Heading defaults:** `font-weight: 600`, `letter-spacing: -0.02em`, `text-wrap: balance`.
**Body:** `font-feature-settings: 'cv11', 'ss01', 'ss03'` (stylistic alternates), antialiased.

### Sizes observed in the wild

| Class | Use |
|---|---|
| `text-[10px]` uppercase tracking `0.16em–0.22em` | Section labels ("USDC BALANCE", "GATEWAY BALANCE") |
| `text-[11px]` | Tertiary captions, chip labels |
| `text-xs` (12px) | Inline body, helper text |
| `text-sm` (14px) | Default body, inputs, buttons |
| `text-base` (16px) | Stat values |
| `text-lg` (18px) | Modal headings |
| `text-2xl` (24px) | Balance widget value, video titles |
| `text-3xl` / `text-4xl` | Studio stat hero values, page titles |

### Number rendering

`tabular-nums` is applied **almost everywhere** numbers appear (balance, cost, time, stats). This is correct and consistent — preserve it.

---

## 4. Component Patterns

### 4.1 Panels (`.panel`, `.panel-muted`, `.glass`)

Three glass tiers, all share: dark translucent fill, faint cyan-tinted inset highlight on top edge, soft shadow, backdrop-blur 14–22px.

- **`.panel`** — primary card. `radius 1.25rem`, blur 22px, 14px shadow.
- **`.panel-muted`** — secondary card. `radius 1rem`, blur 14px, lighter shadow.
- **`.glass`** — used heavily in Studio. Similar to panel but with different border opacity and hover that brightens the border. Hover state already wired.

### 4.2 Buttons

`.btn` base: rounded-2xl, semibold, springy `cubic-bezier(0.34, 1.56, 0.64, 1)` transform on hover. `.btn:hover` lifts `-2px` and scales `1.015`. `.btn:active` settles back with `0.98` scale.

Variants:
- **`.btn-primary`** — cyan fill, dark text, cyan glow shadow.
- **`.btn-accent`** — icy-aqua fill, dark text.
- **`.btn-glass`** — translucent panel with cyan-tinted border, used for secondary actions.
- **`.btn-ghost`** — fully transparent, borderless until hover.
- Size modifiers: `.btn-sm` (xs/rounded-xl), `.btn-lg` (base/rounded-2xl).

### 4.3 Inputs

Two helpers:
- **`.input-surface`** — pill-shaped (`rounded-full`), translucent, 4px cyan focus ring.
- **`.field-surface`** — softer rectangle (`rounded-[0.875rem]`), same focus ring.

Both use the same translucent fill and animate border/shadow on focus.

### 4.4 Nav / chips

- `.nav-tab` + `.nav-tab-active` / `.nav-tab-inactive`
- `.chip-active` / `.chip-inactive`
- `.sidebar-active-glow` — cyan tint + bordered active-state pill

### 4.5 Badges

- `.live-badge` — red rounded pill with red-shadow glow, uppercase tracked
- `.new-badge` — cyan rounded pill, uppercase tracked
- `.payment-ticker` — mono cyan tabular-nums for live rate display

### 4.6 Glow utilities

Four-layer bloom system: `.glow-neon`, `.glow-neon-sm`, `.glow-neon-lg`, `.glow-neon-cyan`, `.glow-neon-accent`. Each stacks 3–4 box-shadow layers at decreasing intensity to fake real bloom. Used sparingly on hover states and live indicators.

### 4.7 Video card (`.video-card`)

Custom transform-on-hover: `translateY(-4px) scale(1.012)`, border shifts to cyan, adds cyan bloom shadow. Transition is a long 450ms `cubic-bezier(0.16, 1, 0.3, 1)` ("expo out"). This is currently the **gold-standard hover treatment** in the app.

### 4.8 Sidebar item (`SidebarItem` in `Sidebar.tsx`)

- Active item gets a `layoutId="sidebar-active-pill"` motion span — the pill **animates between items** with Framer Motion (spring, stiffness 360, damping 30). Already very nicely done.
- Icon scales 1.1 on hover, color shifts to `sa-cyan` with drop-shadow.
- Right-side glow dot on active state.

---

## 5. Spacing

Common values from across the codebase:

| Value | Use |
|---|---|
| `gap-1` (4px) | Tight inline rows (icon + label) |
| `gap-2` (8px) | Button content, small clusters |
| `gap-3` (12px) | Card internals, stat rows |
| `gap-4` (16px) | Section internals |
| `gap-6` (24px) | Studio stat grids |
| `gap-8` (32px) | Top-level page sections |

Card padding: most cards land on `p-4` or `p-6`. Studio leans `p-6`/`p-8` (bigger). Sidebar item is `px-3.5 py-2.5` (somewhat tight).

Sidebar nav-stack: `gap-2` between top-level groups, `gap-1` between items in a group, with `mx-3 my-3 h-px bg-sa-border/50` dividers between sections.

---

## 6. Animations & Easing

Three named easings exposed:
- `--ease-apple` `cubic-bezier(0.25, 0.1, 0.25, 1)` — restrained "ease"
- `--ease-spring` `cubic-bezier(0.34, 1.56, 0.64, 1)` — overshoot, used on buttons & sidebar pill
- `--ease-out-expo` `cubic-bezier(0.16, 1, 0.3, 1)` — slow start / strong end, used on video card hover & `.hover-lift`

Keyframes defined: `neon-pulse`, `pulse-glow`, `neon-flicker`, `ticker-beat`, `reveal`, `scan-sweep`, `shimmer`, `pulse-ring`, `record-pulse`, `eq-bounce`, `glitch`, `float-up`, `metric-drift`, `ken-burns`, `stat-shimmer`, `sidebar-pulse`, `circuit-flow`, `scan-beam`, `rgb-shift`, `marquee`, `float-bob`.

Framer Motion is used for: page entry (`initial={{ opacity: 0, y: 20 }}`), sidebar pill, balance number swap, studio stat cards stagger.

---

## 7. What's Working Well — Preserve

1. **The glass + cyan-glow brand language is cohesive.** Panels feel layered, glows feel deliberate, the noise overlay sells the depth.
2. **Springy button physics** (`btn:hover` lift+scale, `btn:active` settle) — feels responsive, not slow.
3. **`tabular-nums` discipline on every numeric value.** Money/timecodes don't jitter — keep this religiously.
4. **The sidebar `layoutId` pill animation** is a high-polish touch — feels like Apple's TV/Music apps.
5. **The video card hover** (lift + cyan border bloom) is the right reference for any card-like UI.
6. **The live ticker** — mono cyan with `.record-dot` pulse for active sessions — uniquely communicates "money is flowing right now."
7. **Three-tier panel system** (`.panel` / `.panel-muted` / `.glass`) gives a coherent depth hierarchy.
8. **Cubic-bezier vocabulary is consistent** (apple / spring / expo) — three intentional easings, not ad hoc.
9. **Heading typography** (Space Grotesk, -0.02em tracking, balance) feels editorial in a good way.

---

## 8. What Needs Improving — Inconsistencies & Gaps

### 8.1 Buttons drift outside `.btn` system

Studio mixes the helper classes (`btn btn-primary`) with hand-rolled buttons:
```tsx
// StudioPage.tsx — top-tab pills, ad hoc
<button className="px-4 py-2 text-sm font-medium ... bg-primary text-primary-foreground" />

// Same file — hand-rolled action button on video row
<button className="inline-flex ... rounded-lg border border-sa-border bg-sa-surface-2 px-3 py-1.5 text-xs ..." />
```
Result: hover, active, focus behaviors diverge by surface. Should consolidate into named variants (`.btn-tab`, `.btn-row-action`) or always go through `.btn`.

### 8.2 Inputs bypass `.field-surface`

Studio writes inputs as raw Tailwind:
```tsx
className="w-full rounded-xl border border-white/[0.08] bg-sa-surface-2 px-4 py-3 text-sm ... focus:border-sa-accent/50"
```
Watch comments do their own variant. Sidebar's wallet form uses `.field-surface`. Three slightly different visual treatments for what should be one component.

### 8.3 Focus rings are inconsistent

- `.field-surface:focus` → `0 0 0 4px hsla(188, 86%, 56%, 0.14)` (cyan halo)
- Watch comment textarea → `focus:ring-2 focus:ring-primary/50` (Tailwind ring, 2px)
- Studio profile inputs → `focus:ring-2 focus:ring-primary/50`
- Studio withdraw input → `focus:border-sa-accent/50` (no ring at all)

No single accessible focus style. **Need one canonical focus class** applied across every interactive element.

### 8.4 Loading uses spinners almost everywhere

Spinners (`animate-spin rounded-full border-2 border-* border-t-transparent`) appear in: deposit button, withdraw button, send button, balance polling, avatar upload, video delete, comment loading (this one is already skeleton — `h-16 animate-pulse rounded-xl bg-sa-surface`).

The pattern is established — skeleton in comments and studio stat cards — but isn't applied to:
- Wallet page chain table rows
- Video cards on browse/explore
- Watch page poster while Cloudflare loads
- Studio video table rows
- History / Favourites / Watch-later lists

These should all be **shimmer skeletons matching the final layout**, not spinners.

### 8.5 No consistent accessibility focus ring

Plenty of `cursor-pointer` and `aria-label`, but no keyboard-visible outline rule. `outline: none` is applied on `.input-surface:focus` and `.field-surface:focus` and the cyan halo replaces it — but other interactive elements (sidebar items, video cards, tab pills) have no explicit `:focus-visible` style. Tabbing through the page is currently invisible.

### 8.6 Rate / price color is inconsistent

The per-second rate `$0.00005/s` appears in different places with different colors:
- Watch page hero pill — `text-foreground` (white)
- Watch page in-player overlay — `text-white/90`
- Stats grid "Current Rate" — `text-foreground`
- `.payment-ticker` class — `text-[hsl(var(--ticker))]` (cyan)

The rate is **the product's signature number** — it should always render in `var(--sa-blue)` / `--ticker` cyan with `font-mono tabular-nums`, no exceptions.

### 8.7 Sidebar feels cramped

- Item vertical padding: `py-2.5` (10px each side, 20px total) — comparable items in YouTube/Twitch use 28–32px.
- Section labels (`"Your activity"`, `"Creator"`) are `text-[10px]` with `mb-2` — could use more breathing room.
- The balance widget abuts directly against the first nav item.

Suggested: bump item `py-3` or `py-3.5`, add `gap-1.5` between items (vs current `gap-1`), increase divider margin from `my-3` to `my-4`.

### 8.8 Settlement / success feedback is blocking & inline

Tip success, withdraw success, deposit success, send success all render as inline green text directly below the button, and disappear via `setTimeout`. There's no shared toast/notification surface.

Pattern needed: **ambient toast** that slides in from a corner (top-right or bottom-right), small, dismissible, never blocks input. Same surface for "Settlement of $0.0023 sent" events during playback — currently those fire only as console events and live-balance ticker updates.

### 8.9 No page transitions

`AppShell` doesn't wrap content in `<AnimatePresence>` — route changes are a hard cut. Individual page elements animate in on mount, but the page swap itself is jarring. A cross-fade (200ms, no slide) would smooth this with minimal work.

### 8.10 Two `sa-*` palettes coexist

CSS-variable palette (HSL, in `globals.css`) and Tailwind palette (hex, in `tailwind.config.ts`) overlap but aren't identical. E.g.:
- CSS `--sa-surface` = `hsl(213 45% 9%)` ≈ `#0c1726`
- Tailwind `sa-surface` = `#091422`

Visually similar, but means `bg-sa-surface` (Tailwind) and `bg-[var(--sa-surface)]` (CSS var) produce slightly different pixels. Should pick one source of truth.

### 8.11 Stray utility classes referenced but undefined

- `text-sa-text-2` is used in WatchPage (e.g., `text-sa-text-2 hover:bg-white/[0.06]`) but **no such token exists** in `globals.css` or `tailwind.config.ts`. Likely falls back to inherit / nothing.
- `border-sa-border/60` etc. work via Tailwind opacity modifier on the hex token; OK.

### 8.12 `clip-path` / `cut-corners` defined but barely used

`.cut-corners` and `.cut-corner-tr` produce angled-corner masks (Cyberpunk-style HUD). Worth either using them deliberately on a specific surface (e.g., live-stream-mode UI) or removing them.

### 8.13 Deprecated decoration classes

`.video-card-holo`, `.thumb-scan`, `.glass-sheen`, `.scan-hover`, `.btn-shine`, `.orb`, `.aurora` have their `::before`/`::after` decorations set to `content: none` or `display: none`. Earlier iteration's holographic / aurora layers were turned off but the class hooks remain. Either re-enable purposefully or delete to reduce CSS bloat.

---

## 9. Target Improvements

These are the concrete goals to drive the next design pass. Each is **prescriptive** — pick the approach and apply consistently.

### 9.1 Video cards — hover lift + thumbnail scale
Already present on `.video-card`. **Extend to**: the studio video table rows, the up-next sidebar cards, history/favourites grid items. Thumbnail should `scale-105` on hover inside an `overflow-hidden` shell while the card itself lifts `-translate-y-1`.

### 9.2 Sidebar — more breathing room
- Item `py-3` (12px) instead of `py-2.5`.
- Group gap `gap-1.5` instead of `gap-1`.
- Divider margin `my-4` instead of `my-3`.
- Balance widget needs `mb-4` separation from first nav item.

### 9.3 Buttons — single source of truth
Consolidate every button through `.btn` + variant. Remove hand-rolled buttons in Studio (top tabs, video row actions). Add two missing variants:
- `.btn-tab` — for segmented controls (used in studio header).
- `.btn-row-action` — for table-row micro-actions (small, ghost, icon-led).

### 9.4 Loading — skeleton screens, not spinners
Replace the spinner pattern (`animate-spin rounded-full border-2`) with shape-matching skeletons (`animate-pulse rounded-* bg-sa-surface-2`) for:
- Video card thumbnails (aspect-video skeleton)
- Studio table rows (match the row shape: thumbnail box + title line + 2 number cells)
- Wallet chain rows (icon + name + balance line)
- Watch poster (full aspect-video while Cloudflare initializes)

Keep spinners only inside buttons during submit (where the action is already user-initiated).

### 9.5 Consistent focus ring for accessibility
Add a single utility:
```css
.focus-ring:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px hsl(var(--background)), 0 0 0 4px var(--sa-blue);
}
```
Apply to every `<button>`, `<a>`, `<input>`, `<select>`, `<textarea>`, sidebar items, video cards, chip buttons. Replaces the various ad-hoc `focus:ring-2 focus:ring-primary/50` patterns.

### 9.6 `tabular-nums` on all price/rate displays
Already mostly applied — audit for stragglers (currently the Watch tip success message uses non-tabular, as does the wallet copy-address pill). One sweep to add `tabular-nums` to every dollar-string output.

### 9.7 Per-second rate — always in accent color
Define a canonical pill:
```tsx
<span className="font-mono tabular-nums text-sa-blue">{rate}/s</span>
```
Apply everywhere the rate is shown: Watch hero, in-player overlay, Watch stats grid "Current Rate", Studio earnings card, Browse video card. The rate is the **brand signature** — should always be the same color and font.

### 9.8 Ambient settlement toasts
Build a `<Toaster />` slot mounted in `AppShell` (top-right, fixed). Settlements, deposits, tips, sends, withdrawals all dispatch `window.dispatchEvent(new CustomEvent("toast", { detail: { kind, message, txUrl } }))`. Toasts:
- 320px wide, glass surface, cyan top-edge on success / red on error.
- Slide in from right (200ms ease-out-expo), auto-dismiss after 4s.
- Stack vertically with `gap-2`.
- Never block the click target underneath.

Replace inline `setTipSuccess` / `setWithdrawSuccess` / `setExternalSuccess` blocks with toast emissions.

### 9.9 Page transitions
Wrap the routed content in `AppShell` with:
```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={pathname}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
  >
    {children}
  </motion.div>
</AnimatePresence>
```
Cross-fade only, no slide — the sidebar pill already handles the spatial motion.

### 9.10 Unify the `sa-*` palette
Pick one source of truth — recommend keeping the **CSS-variable HSL palette** (it's used in panel/glow definitions and supports opacity modifiers via `hsl(var(--…) / 0.X)`), and update `tailwind.config.ts` to read from those variables instead of duplicating hex values:
```ts
sa: {
  bg: "hsl(var(--sa-bg))",
  surface: "hsl(var(--sa-surface))",
  // ...
}
```

### 9.11 Define `--sa-text-2` (or remove references)
`text-sa-text-2` is used in WatchPage but undefined. Define it as a mid-grey between `--sa-text` and `--sa-text-3`, or replace all uses with `--sa-text-3`.

### 9.12 Remove dead decoration hooks
Delete `.video-card-holo`, `.thumb-scan`, `.glass-sheen`, `.scan-hover`, `.btn-shine`, `.orb`, `.aurora`, and the now-empty keyframes that supported them (`scan-sweep`, `scan-vertical`, `glass-sweep`, `aurora-shift`, `orb-float`, `circuit-flow`, `scan-beam`, `rgb-shift`, `navbar-sweep`, `stat-shimmer`, `sidebar-pulse`). Cuts ~80 lines from `globals.css` without affecting any rendered surface.

---

## 10. Out of Scope for This Pass

- Light theme (HeroUI light tokens are defined in `tailwind.config.ts` but unused).
- Mobile-specific overhauls — sidebar is `hidden lg:block`, mobile nav doesn't exist yet.
- Iconography refresh (currently all `lucide-react`, consistent).
- Avatar / chat / live-stream surfaces — not yet built.

---

*Last audited: 2026-05-11. Re-audit when major surface changes ship (mobile nav, live-stream UI, creator analytics dashboard).*
