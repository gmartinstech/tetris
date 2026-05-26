# Design System

Painted-wood Tetris cabinet. Physical, tactile, warm. Reads as an object you could touch — walnut planks, recessed bezel, gouache-painted pieces. Never neon, never glass, never digital-screen-glow.

## Theme

Dark walnut. Body is warm wood-grain (SVG turbulence noise + brown linear gradient) at #2b1a0e → #3a2415. Light source above-left, so highlights tilt warm and shadows tilt deep. Everything is matte. Nothing glows.

## Color Palette

OKLCH-balanced low-chroma. All neutrals warm-tinted. No `#000`, no `#fff`.

### Wood neutrals (chrome / surfaces)

| Role | Hex | Use |
|---|---|---|
| Body bg deep | `#2b1a0e` | Base wood color |
| Body bg light | `#3a2415` | Upper highlight band |
| Wood panel | `#5b3a20` → `#432712` | Raised buttons, cards, HUD |
| Wood panel deep | `#2a1808` → `#1d0f04` | Recessed slots, inputs, inventory dock |
| Board bezel | `#1a0d04` → `#0e0602` | Deep board frame |
| Text primary | `#f0e3cc` | Cream, on wood |
| Text secondary | `#b59470` | Warm tan, labels |
| Text muted | `#8a6f54` | Locked / inactive |
| Text faint | `#7a614a` | Version, footnotes |

### Piece colors (matte gouache)

Each is a `[outer, inner]` pair for the painted gradient. Brush-edge SVG noise overlay applied via `::after`.

| Name | Outer | Inner |
|---|---|---|
| brick | `#c0593a` | `#7e3320` |
| ochre | `#cf8b34` | `#8c5316` |
| sage | `#7c9f6b` | `#3e5b34` |
| slate | `#6c8ba6` | `#385571` |
| mustard | `#d2b047` | `#8a6c1e` |
| plum | `#8c4769` | `#4f2741` |

### Specials

- **Filler** (rare gold piece): warm shimmer between `#e8c468` and `#a07423`, no rainbow
- **Explosive** (bomb): ember red `#b94025` → `#3a1208`, slow pulse
- **Pre-filled cells** (career obstacles): driftwood `#7d6a55` → `#4a3a2a`
- **Star (career achievement)**: `#e8c468`. Empty star: `#3a2616`
- **Warning / destructive**: `#c08066` (faded brick, never saturated red)

### Strategy

Restrained. Wood neutrals carry 80%+ of every surface. Piece colors are the only saturated touches and appear only where they're literal game pieces. Score uses ochre `#e8c468` only as a small accent — never as a long ribbon, never as gradient text.

## Typography

One family. No display/body pair. Tactile geometric sans.

- **Stack**: `"Futura", "Avenir Next", Avenir, "Trebuchet MS", system-ui, sans-serif`
- **Weights used**: 500 (labels, secondary text), 600 (titles, primary buttons, scores)
- **Letter-spacing for stenciled labels**: `tracking-[0.16em]` to `tracking-[0.4em]` — wide tracking sells the painted-cabinet sign feel
- **Title shadow**: `textShadow: '0 1px 0 rgba(0,0,0,0.55)'` for stamped/embossed letterforms
- **No `font-black`. No `tracking-tight`.** Both are AI tells; banned.
- **Tabular numerals** (`tabular-nums`) on every score, level, and counter

### Type scale

| Step | Size | Use |
|---|---|---|
| h1 | `text-3xl` to `text-5xl` | Main titles (TETRIS, CARREIRA, Fim de jogo) |
| h2 | `text-xl` to `text-2xl` | Modal headings |
| body | `text-sm` to `text-base` | Buttons, body text |
| label | `text-[10px]` to `text-xs` uppercase | Eyebrow labels, hints |

## Components

All defined in `public/style.css`. Composable via Tailwind utility classes.

### `.block-render`
Single material. Soft radial highlight at 30%/25%, soft shadow at 75%/80%, painted-gouache linear gradient between `--c-from` and `--c-to` CSS variables. Brush-edge noise overlay via `::after`. Used for every piece, plus painted block accents in buttons.

### `.wood-panel`
Raised wooden plank. Used for menu cards, primary buttons, HUD pills, modals, dashboard.
- Vertical wood-grain SVG noise + sienna gradient
- Inset top highlight + bottom shadow → embossed plank
- Outer drop shadow → floating off background
- 1px dark border for laminated edge

### `.wood-panel-deep`
Recessed slot. Used for inputs, inventory dock, score wells, locked tiles, progress-bar track.
- Darker grain + inset shadow → carved-in pocket
- No outer shadow (lives flush with surface)

### `.board-bezel`
Deep recessed game-board frame. Strong inset top shadow + outer drop shadow → board sits in a routed groove.

### `.board-cell-empty`
Pocket for empty cells. Subtle radial darkening at top-left + inset shadow. Reads as carved-into-wood, not flat tile.

### Button states

- **Default**: `wood-panel` (raised plank)
- **Press**: `active:translate-y-px` (depresses 1px, no scale animation)
- **Disabled**: `wood-panel-deep opacity-50`
- **Secondary**: `wood-panel-deep` (recessed, lower contrast)
- **Ghost / tertiary**: text only, `text-[#8a6f54]` → `hover:text-[#b59470]`

No spring overshoot. No hover lift. No ring focus glow.

## Layout

- **Game board**: 8×8 (co-op default) or 10×10. Cells `aspect-square`, sized via `min(95vw, calc(100vh - 240px), 95vh, 620px)`. 2.5px padding inside bezel, 2px gap between cells.
- **Menu card**: `max-w-sm`, `wood-panel`, 28px padding, rounded-md.
- **Inventory dock**: `wood-panel-deep`, recessed, mini-pieces in `rounded-[4px]` carved pockets.
- **Card radius**: `rounded-md` (6px) everywhere. No `rounded-2xl`, no `rounded-[2rem]`, no `rounded-full` pills.
- **Spacing rhythm**: deliberate variance. `space-y-2.5` inside cards, `gap-3` between HUD pills, `mb-6/7` on title→body. Same-spacing-everywhere is monotony.

## Motion

Quieter than the previous set. Eased exponentially. No bounce.

| Keyframe | Duration | Curve | Use |
|---|---|---|---|
| `popIn` | 0.18s | cubic-bezier(0.22, 1, 0.36, 1) | Block spawn |
| `dissolve` | 0.40s | cubic-bezier(0.22, 1, 0.36, 1) | Cleared blocks |
| `floatUp` | 1.2s | cubic-bezier(0.22, 1, 0.36, 1) | Score popups |
| `shimmer-warm` | 1.6s | ease-in-out infinite | Filler piece |
| `bomb-pulse` | 1.1s | ease-in-out infinite | Explosive piece |
| `board-shake` | 0.22s | cubic-bezier(0.22, 1, 0.36, 1) | Invalid placement / explosion |

All animations respect `prefers-reduced-motion: reduce`.

## Anti-references (absolute bans)

Things that immediately re-introduce AI aesthetic. If any appear, rewrite the element.

- `backdrop-blur-*` / glassmorphism cards
- `bg-gradient-to-*` on chrome / buttons / text
- `text-transparent bg-clip-text` (gradient text)
- `drop-shadow-[0_0_Npx_rgba(...)]` glows of any color
- `font-black` / `tracking-tight` (use `fontWeight: 600` + `tracking-wide` instead)
- `rounded-full` pills for non-circular content
- `hover:-translate-y-1` on every CTA
- Spring overshoot curves (`cubic-bezier(0.175, 0.885, 0.32, 1.275)` family)
- Neon piece palette / `#030712` blue-black bg (gaming category reflex)
- Emoji-as-UI (🎨🎲🍭🪨🔩💎📋✓⚡⭐) — use SVG icons or styled glyphs
- Multi-material gimmick sets (candy/stone/metal/glass) — one material, committed
- Display fonts in body / data / buttons
- Stacked decorative shadows (`shadow-lg` + `drop-shadow-*` + inset stack)

## Iconography

Stroke-style SVG icons inline in JSX (Trophy, Layers, Menu, X, Refresh, LogOut, Alert, Fullscreen). Stroke `currentColor`, width 2. Tinted via `text-*` of the parent, usually `text-[#f0e3cc]` or `text-[#e8c468]` for emphasis. Never given drop-shadow glow.

## Copy voice

- Lowercase or stenciled-uppercase only. No mixed-case marketing copy.
- Tight, casual Portuguese. "pra dois", "voltar", "novo recorde" — friendly, not corporate.
- No em-dashes. Commas, colons, periods, or middle-dot `·` for list separators.
- Eyebrow labels are lowercase + wide tracking ("nº01", "suas peças", "sala", "pontuação").
- Modal headings are stenciled uppercase ("Fim de jogo", "Vitória", "Mais uma").

## Accessibility

- `prefers-reduced-motion` honored: all keyframes collapse to 0.01ms.
- Touch targets ≥ 44px (menu buttons are 56px+ tall).
- Contrast: `#f0e3cc` on `#5b3a20` passes WCAG AA. `#b59470` on `#5b3a20` is secondary-only.
- No color-only state. Selected difficulty uses `wood-panel` vs `wood-panel-deep` (depth) plus color shift.
