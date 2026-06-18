# ADR 0005: Tailwind token architecture — CSS custom properties to `@theme`

## Context

Design tokens were defined as raw CSS custom properties (`--sea-ink`, `--lagoon`, etc.) in `styles.css` and consumed everywhere as Tailwind arbitrary values (`text-[var(--sea-ink)]`, `bg-[var(--surface-strong)]`). This resulted in 146 references of `var(--token)` across 17 files, heavy repetition, no IDE autocomplete, and one undefined token (`--sea-ink-faded`) that went undetected. Tailwind v4 supports CSS-first theme configuration via `@theme` — but it wasn't being used.

## Decision

Move all design tokens from `:root` CSS custom properties into a single `@theme` block in `styles.css` using Tailwind's `--color-*` namespace. Consume them as standard Tailwind utility classes (`text-sea-ink`, `bg-surface-strong`). Drop light theme entirely — dark-only.

### Tokens (dark-only values)

| Token | Value | Formerly |
|-------|-------|----------|
| `--color-sea-ink` | `#cdd6f4` | `--sea-ink` |
| `--color-sea-ink-soft` | `#a6adc8` | `--sea-ink-soft` |
| `--color-lagoon` | `#cba6f7` | `--lagoon` |
| `--color-lagoon-deep` | `#b4befe` | `--lagoon-deep` |
| `--color-palm` | `#94e2d5` | `--palm` |
| `--color-sand` | `#181825` | `--sand` |
| `--color-foam` | `#1e1e2e` | `--foam` |
| `--color-surface` | `rgba(30, 30, 46, 0.8)` | `--surface` |
| `--color-surface-strong` | `rgba(30, 30, 46, 0.92)` | `--surface-strong` |
| `--color-line` | `rgba(180, 190, 254, 0.18)` | `--line` |
| `--color-inset-glint` | `rgba(205, 214, 244, 0.06)` | `--inset-glint` |
| `--color-bg-base` | `#11111b` | `--bg-base` |
| `--color-header-bg` | `rgba(17, 17, 27, 0.8)` | `--header-bg` |
| `--color-chip-bg` | `rgba(49, 50, 68, 0.9)` | `--chip-bg` |
| `--color-chip-line` | `rgba(180, 190, 254, 0.24)` | `--chip-line` |
| `--color-link-bg-hover` | `rgba(49, 50, 68, 0.8)` | `--link-bg-hover` |
| `--color-hero-a` | `rgba(203, 166, 247, 0.1)` | `--hero-a` |
| `--color-hero-b` | `rgba(180, 190, 254, 0.06)` | `--hero-b` |

**Removed tokens**: `--kicker` (unused), `--sea-ink-faded` (undefined, replaced with `text-sea-ink-soft/50`).

### Migration

- All 146 `text-[var(--token)]`, `bg-[var(--token)]`, `border-[var(--token)]` references in component files replaced with `text-token`, `bg-token`, `border-token`.
- Global CSS in `styles.css` updated: `var(--sea-ink)` → `var(--color-sea-ink)`.
- Hardcoded `rgba()` values in components tokenized.
- `body::before`/`body::after` decorative effects left as-is.

## Consequences

- IDE autocomplete and Tailwind intellisense work on all color tokens.
- Token names are discoverable — no guessing whether it's `--sea-ink` or `--sea-ink-soft`.
- Removing a token surfaces all 17 consumers at once instead of silently breaking at runtime.
- Opacity modifiers (`bg-lagoon/50`) work natively through Tailwind's color system.
- Dark-only simplifies theme management — no `light-dark()`, no manual toggle, no `prefers-color-scheme`.

## Status

Proposed
