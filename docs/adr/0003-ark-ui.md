# ADR 0003: Ark UI for component primitives

## Context

Inkpipe's web UI used zero component libraries — every interactive element (modals, selects, checkboxes, autocompletes, progress bars, toggles) was hand-built with native HTML elements and manual state management. Two modals had hand-rolled click-outside detection, Escape-key handling, focus management, and overlay positioning. Five `<select>` elements were native. Autocomplete was a custom input + filtered list. This meant duplicated accessibility logic and no composable primitive API.

## Decision

Use **Ark UI** (`@ark-ui/react` v5) as the headless component library for all interactive primitives. Wrappers live in `packages/web/app/ui/` as namespace objects with Tailwind CSS baked in, matching existing design tokens (`--sea-ink`, `--lagoon`, `--line`, `--surface-strong`, etc.).

### Wrappers created

| File | Ark primitives | Replaces |
|---|---|---|
| `ui/button.tsx` | Custom styled `<button>` | All 12 `<button>` sites |
| `ui/input.tsx` | Custom styled `<input>` | All ~17 `<input>` sites |
| `ui/checkbox.tsx` | `Checkbox.Root`, `Control`, `Label`, `Indicator` | 12 checkboxes + 1 select-all |
| `ui/select.tsx` | `Select.Root`, `Trigger`, `Content`, `Item`, `ValueText` | 5 native `<select>` elements |
| `ui/combobox.tsx` | `Combobox.Root`, `Input`, `Content`, `Item` | DownloadModal autocomplete |
| `ui/dialog.tsx` | `Dialog.Root`, `Backdrop`, `Content`, `Title`, `CloseTrigger` | DownloadModal + KomgaBooksModal |
| `ui/field.tsx` | `Field.Root`, `Label`, `Input`, `Select`, `HelperText`, `ErrorText` | All label+input pairs in SettingsForm |
| `ui/toast.tsx` | `createToaster`, `Toaster` | Inline success/error `<p>` messages |
| `ui/toggle-group.tsx` | `ToggleGroup.Root`, `Item` | Komga library filter buttons |
| `ui/progress.tsx` | `Progress.Root`, `Track`, `Range` | JobCard progress bar |

## Alternatives considered

- **Radix UI**: The ecosystem default for headless React components, and the foundation of Shadcn/ui. Rejected because Radix is no longer actively maintained (last significant release in 2024). Ark UI is actively maintained by the Chakra UI team and ships ~2x more primitives.
- **Shadcn/ui**: Copies source into your repo (vendor lock-in). Radix is effectively frozen, so Shadcn inherits that stagnation. Rejected.
- **Headless UI (Tailwind Labs)**: Fewer primitives (only ~10), no Combobox, no ToggleGroup, no Field. Rejected.
- **Staying custom**: The two modals alone had 40+ lines of manual focus/click-outside/Escape logic. Rejected.

## Consequences

- Ark UI handles focus trapping, click-outside dismissal, Escape-to-close, portal rendering, and ARIA attributes for all interactive components.
- Components compose via namespace objects (`Dialog.Root`, `Dialog.Content`, etc.) rather than prop-based configuration.
- Design tokens remain in CSS custom properties. Ark wrappers reference them directly; there's no theme context or CSS-in-JS.
- `@ark-ui/react` adds ~172 transitive packages (zag-js state machines), but zero runtime cost beyond bundle size for used components.

## Status

Accepted (2026-06-13)
