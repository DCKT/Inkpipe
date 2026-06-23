# ADR 0005: Semantic design tokens in `@theme`, dark-only

## Context

Design tokens were defined as raw CSS custom properties with catppuccin-inspired names (`--sea-ink`, `--lagoon`, `--surface-strong`, etc.) in `styles.css` and consumed everywhere as Tailwind arbitrary values (`text-[var(--sea-ink)]`, `bg-[var(--surface-strong)]`). This meant 196 references across 29 files, no IDE autocomplete on colors, opaque naming that didn't convey semantic role, and one undefined token (`--sea-ink-faded`) that went undetected. Tailwind v4 supports CSS-first theme configuration via `@theme` — but it wasn't being used.

Additionally, both light and dark themes were defined, with 20 color tokens each, duplicating every definition three times (`:root`, `:root[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`). No theme toggle exists in the UI — light mode was never actually used.

## Decision

Reduce 20 catppuccin-named tokens to **14 semantic tokens** in a single `@theme` block using Tailwind's `--color-*` namespace. Consume them as standard Tailwind utility classes (`text-primary`, `bg-surface`). Dark-only — remove all light theme and `prefers-color-scheme` blocks.

### Semantic tokens (core)

| Token | Value (dark) | Absorbs |
|---|---|---|
| `--color-primary` | `#cdd6f4` | `--sea-ink` (body/heading/input text) |
| `--color-secondary` | `#a6adc8` | `--sea-ink-soft` (labels, descriptions, empty states) + `--sea-ink-faded` (undefined) |
| `--color-accent` | `#cba6f7` | `--lagoon` (buttons, focus rings, selected states) |
| `--color-accent-hover` | `#b4befe` | `--lagoon-deep` (hover accent, link text) |
| `--color-success` | `#94e2d5` | `--palm` (DONE/completed states) |
| `--color-border` | `rgba(180, 190, 254, 0.18)` | `--line` (dividers, input borders) + `--chip-line` (accent-tinted borders) |
| `--color-surface` | `rgba(30, 30, 46, 0.92)` | `--surface-strong` (form controls, cards) + `--chip-bg` (chip bg) + `--header-bg` (frosted header/footer) |
| `--color-surface-hover` | `rgba(30, 30, 46, 0.8)` | `--surface` (hover feedback) + `--link-bg-hover` (clickable row hover) |
| `--color-background` | `#11111b` | `--bg-base` (root page background) |

### Decorative tokens (CSS-only, no tsx usage)

| Token | Value (dark) | Absorbs |
|---|---|---|
| `--color-sand` | `#181825` | `--sand` (body gradient tonal layer) |
| `--color-foam` | `#1e1e2e` | `--foam` (body gradient mid-tone) |
| `--color-inset-glint` | `rgba(205, 214, 244, 0.06)` | `--inset-glint` (card inset highlight) |
| `--color-hero-a` | `rgba(203, 166, 247, 0.1)` | `--hero-a` (decorative gradient blob, top-left) |
| `--color-hero-b` | `rgba(180, 190, 254, 0.06)` | `--hero-b` (decorative gradient blob, top-right) |

**Removed tokens**: `--kicker` (unused), `--sea-ink-faded` (undefined, replaced with `--color-secondary`).

### Folding decisions

Four specialized UI tokens were folded into the core semantic set:
- `--chip-bg` → `--color-surface` (same value as surface-strong, minor visual difference from rgba(49,50,68,0.9))
- `--chip-line` → `--color-border` (24% → 18% opacity, slightly more subtle)
- `--link-bg-hover` → `--color-surface-hover` (same value)
- `--header-bg` → `--color-surface` (rgba(17,17,27,0.8) → rgba(30,30,46,0.92), header gets darker)

### Migration

- All 196 `text-[var(--token)]`, `bg-[var(--token)]`, `border-[var(--token)]`, `ring-[var(--token)]` references replaced with `text-primary`, `bg-accent`, `border-border`, etc.
- Global CSS in `styles.css` updated: `var(--sea-ink)` → `var(--color-primary)`.
- Hardcoded `rgba()` values tokenized where possible.
- `body::before`/`body::after` decorative effects left as-is.

## Consequences

- IDE autocomplete and Tailwind intellisense work on all color tokens.
- Token names convey semantic role — `text-primary` vs `text-[var(--sea-ink)]`.
- Removing a token surfaces all consumers at compile time instead of silently breaking at runtime.
- Opacity modifiers (`bg-accent/50`) work natively through Tailwind's color system.
- Dark-only eliminates 66 lines of duplicated theme blocks — no `light-dark()`, no manual toggle, no `prefers-color-scheme`.
- 20 tokens → 14 tokens, with 9 carrying the entire UI surface.

## Status

Accepted (2026-06-23)
