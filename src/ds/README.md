# @student-ds/ui

The design system package. Houses shadcn/ui-based components, design tokens synced from Figma, and Code Connect mappings.

## Layout

```
src/
  components/        shadcn primitives + custom components
  styles/
    globals.css      shared Tailwind imports and component styles
    theme.css        generated CSS-variable mirror of all Figma variables
  lib/
    utils.ts         cn() helper
  index.ts           public exports
scripts/
  token-registry.ts  collection, mode, and CSS-name registry
  build-tokens.ts    regenerate theme.css from tokens/
  audit-tokens.ts    verify Figma names, aliases, and CSS coverage
figma/
  *.figma.tsx        Code Connect mappings (one per component)
```

## Scripts

```bash
pnpm typecheck            # type check
pnpm lint                 # lint
pnpm tokens:build         # regenerate theme.css from the Figma JSON export
pnpm tokens:check         # audit all 1,594 names and check generated drift
pnpm figma:dry-run        # validate Code Connect mappings without publishing
pnpm figma:publish        # publish mappings to Figma
```
