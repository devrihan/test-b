# Figma → Code Token Mapping

The JSON under `tokens/` mirrors the 11 variable collections in the
**Inferentics Design System** Figma library. Collection names, mode names, and
all 1,594 variable names are audited against Figma.

Run:

```sh
pnpm --filter @student-ds/ui tokens:build
pnpm --filter @student-ds/ui tokens:check
```

`tokens:build` regenerates the AUTOGEN block in `src/styles/theme.css`.
`tokens:check` verifies the JSON inventory, aliases, CSS-name uniqueness, and
generated CSS drift.

## CSS naming

Figma `/` hierarchy separators become `-` in CSS. Names are lowercased and
other punctuation is collapsed to a single `-`.

| Figma collection | CSS naming | Example |
|---|---|---|
| `TW Color Primitives` | `--tw-color-*` | `slate/50` → `--tw-color-slate-50` |
| `TW Primitives` | `--tw-primitive-*` | `gap/gap-4` → `--tw-primitive-gap-gap-4` |
| `Radix Colours (Additional)` | `--radix-color-*` | `amber/1` → `--radix-color-amber-1` |
| `Radix Themes (Additional)` | exact normalized name | `radix-bg` → `--radix-bg` |
| `2. Components` | `--component-*` | `Sonner/Themes/Normal/bg` → `--component-sonner-themes-normal-bg` |
| `1. shadcn/ui - color modes` | `--shadcn-*` | `tokens/background` → `--shadcn-tokens-background` |
| `3. Radius` | exact token name | `radius-sm` → `--radius-sm` |
| `4. Spacing` | exact token name | `spacing-sm` → `--spacing-sm` |
| `5. Containers` | exact token name | `container-padding-mobile` → `--container-padding-mobile` |
| `6. Inferentics Color Primitives` | `--inferentics-primitive-*` | `brand/green-500` → `--inferentics-primitive-brand-green-500` |
| `6. Inferentics Colors` | `--inferentics-*` | `brand/primary` → `--inferentics-brand-primary` |

The standard shadcn variables remain aliases to their collection-qualified
mirrors. For example:

```css
--shadcn-tokens-background: var(--tw-color-base-white);
--background: var(--shadcn-tokens-background);
```

## Spacing and radius

Spacing names now match Figma directly:

| Token | Value |
|---|---:|
| `--spacing-none` | `0rem` |
| `--spacing-xxs` | `0.125rem` |
| `--spacing-xs` | `0.25rem` |
| `--spacing-sm` | `0.375rem` |
| `--spacing-md` | `0.5rem` |
| `--spacing-lg` | `0.75rem` |
| `--spacing-xl` | `1rem` |
| `--spacing-2xl`–`--spacing-7xl` | `1.25rem`–`4rem` |

The deprecated `--spacing-sp-*` names are not emitted.
Spacing variables live in `:root`, outside Tailwind's `@theme` namespace, so
they do not change unrelated utilities such as `max-w-md`. Use them directly
in CSS or through an arbitrary value such as `p-[var(--spacing-sm)]`.

The Tailwind radius namespace uses the exact Figma scale:

| Token | Value |
|---|---:|
| `--radius-none` | `0rem` |
| `--radius-sm` | `0.125rem` |
| `--radius` | `0.25rem` |
| `--radius-md` | `0.375rem` |
| `--radius-lg` | `0.5rem` |
| `--radius-xl` | `0.75rem` |
| `--radius-2xl` | `1rem` |
| `--radius-3xl` | `1.5rem` |
| `--radius-full` | `624.9375rem` |

`--radius-xs` remains a component compatibility alias to `--radius-sm`.

## Modes

The first Figma mode for each collection is emitted in `:root`. Existing
applications continue to use light/slate by default and `.dark` for
dark/slate.

Alternate modes can be selected explicitly:

```html
<html data-shadcn-mode="light-zinc">
<html data-radix-colours-mode="dark">
<html data-radix-themes-mode="gray-slate-dark">
```

Supported values:

- `data-shadcn-mode`: `light-slate`, `dark-slate`, `light-zinc`, `dark-zinc`
- `data-radix-colours-mode`: `light`, `dark`
- `data-radix-themes-mode`: `accent-indigo-light`, `gray-slate-light`,
  `accent-indigo-dark`, `gray-slate-dark`

## Numeric units

- Length, size, spacing, and radius values are emitted as `rem`.
- Opacity primitives are emitted from `0` to `1`.
- Tracking primitives are emitted as `em`.
- Font-weight primitives remain unitless.
- Colors preserve their source hex value, including alpha.

## Typography and effects

Figma text and effect styles are not variables in the Tokens Studio JSON
export. Existing typography utilities and component styles therefore remain
outside the generated token block.
