# OnQ Design Direction

Direction source: user-specified reference `https://www.kaneclihack.sh/` paired with Even Realities G2 hardware waveguide optical constraints.

## Dials
- ENERGY: 3 (confident, sharp editorial blocks with high-contrast acid-lime spotlights and one full-bleed light-mode inversion band)
- RHYTHM: 3 (varied compositions across hero workbench, 4-column safety matrix, light-mode hardware section, corridor modes grid, pairing split, and FAQ accordion)
- MOTION: 2 (restrained kinetic reveals, scroll-driven dot-matrix headline scramble, interactive halftone particle dispersion, zero endless pulses)

## Companion Web Palette
- `--ink`: `#000000` (primary page canvas; `#0a0a0a` ink on bright/lime surfaces)
- `--surface`: `#0b0b0b`
- `--surface-2`: `#141414`
- `--bright`: `#f2f2f2`
- `--lightgray`: `#8a8a8a` (verified >= 5.9:1 on `#000000`)
- `--hairline`: `#37383a`
- `--lime`: `#daff52` (primary accent, deliberate spotlight blocks and active indicators)
- `--lime-deep`: `#1f2606`
- `--danger`: `#ff5a4f`
- `--warning`: `#ffb020`
- Light-mode section (`#hardware`): `#f2f2f2` canvas, `#0a0a0a` ink, `#525252` secondary ink, `#c4c4c4` hairlines.

## Even Realities G2 Lens Hardware Palette & Optical Budget
- Canvas: exact `576x288` px monochrome waveguide.
- Background: pure `#000000` (>= 70% dark-pixel transparent glass budget).
- Phosphor Ink: `#34f57e` primary, `#1ea352` secondary.
- Layout: `<= 7` lines total, `<= 42` columns word-boundary wrapped, `<= 999` UTF-8 bytes, LVGL-safe ASCII only.

## Typography
- Display dot-matrix: `Doto` (section headings, giant numerals)
- Display sans: `Inter Tight` (hero H1, card titles, key figures)
- Mono body & code: `IBM Plex Mono` (body copy, buttons, lists, code, G2 lens fallback)
- Micro pixel labels: `Silkscreen` (uppercase eyebrows, tags, wordmark, metadata)

## Geometry & Craft Rules
- `0px` border-radius across all web components; `border-dashed border-hairline` section dividers; `gap-px bg-hairline` matrix cells; zero drop shadows.
- Zero em dashes in all UI and prose copy.
- Zero fabricated user metrics, testimonials, or logos.
- Every control works or does not exist; visible `:focus-visible` indicator (`2px solid #daff52`).
