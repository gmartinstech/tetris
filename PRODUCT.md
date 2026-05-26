# Product

## Register

product

## Users

Casual gamers playing on phones and desktops. Two-player co-op (local or remote) is the default mode; solo and career exist for the same player on their own. Ages 10+. Short sessions, often shared on a couch or over a quick break.

## Product Purpose

A cooperative Tetris game where two players fill a shared board, clear lines, and score together. Real-time sync via SSE. No external dependencies — runs as a single Java file. The game should feel like a small physical object the two of you are playing on, not an app you're looking at.

## Brand Personality

Tactile, warm, deliberate. Think a painted wooden cabinet game from a café shelf — something you'd reach for over a drink with a friend. Confident but quiet. Object-real, not screen-real. The game has weight and grain; pieces look painted, the board looks routed into the surface.

Closer references: Tsuro, Kalimba game boards, Carcassonne, Threes (early prototype), Mini Metro. Far references: anything that looks like a phone game ad, anything neon, anything that says "premium" out loud.

## Anti-references

- Neon arcade-cabinet aesthetic (the old direction; recovered from)
- Glassmorphism — `backdrop-blur` cards, frosted overlays
- Gradient buttons / gradient text / gradient anything decorative
- Glowing drop-shadows on icons, scores, or labels
- Spring-bouncy motion (overshoot easing curves)
- Generic SaaS card grids
- Flat, lifeless minimalism that strips away material character
- Corporate dashboard chrome

The line: if it would look correct in a fintech onboarding flow OR in a generic "AI game UI" screenshot, it's wrong here.

## Design Principles

1. **Material before motion** — every surface should feel like a real object first. Wood grain, painted pigment, recessed bezels. Motion is restrained, not theatrical.
2. **Object-real feedback** — placing a piece feels like pressing it into a groove. Active states depress 1px, not bounce. Sound and haptics confirm; visuals don't have to scream.
3. **Co-op clarity** — both players must instantly know which pieces are theirs, where the partner is hovering, and whose turn the game is waiting on. Painted color (brick = P1, slate = P2 in lobby) does that work.
4. **Mobile-first touch** — primary input is touch/drag on phones. Buttons sit at 44px+ minimum. Tap zones are generous.
5. **Quiet accessibility** — motion enhances but never blocks. `prefers-reduced-motion` honored. Contrast holds on wood backgrounds.

## Visual Direction (one-line)

Painted wood cabinet. Walnut planks, gouache pieces, recessed board. See `DESIGN.md` for the implemented system.

## Accessibility & Inclusion

- Respect `prefers-reduced-motion` — all keyframes collapse to 0.01ms
- WCAG AA contrast on primary text (`#f0e3cc` on `#5b3a20`)
- Touch targets ≥ 44px on all interactive elements
- No color-only state changes — depth (raised vs recessed wood) carries the same signal
- Portuguese-first copy (project audience), kept short and lowercase-friendly
