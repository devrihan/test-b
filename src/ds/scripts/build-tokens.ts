#!/usr/bin/env tsx
/**
 * Generate the repository CSS token mirror from the Figma token JSON export.
 *
 * Every Figma variable receives one deterministic CSS custom property. Figma
 * modes are emitted as selectors, while the existing shadcn aliases remain the
 * stable component-facing API.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  COLLECTION_SPECS,
  REPO_ROOT,
  SHADCN_ALIASES,
  LoadedCollection,
  LoadedMode,
  cssNameFor,
  cssValueFor,
  loadCollections,
} from "./token-registry";

const TOKENS_THEME_CSS = join(
  REPO_ROOT,
  "packages/ui/src/styles/theme.css"
);
const START_MARKER = "/* AUTOGEN:TOKENS:START */";
const END_MARKER = "/* AUTOGEN:TOKENS:END */";

function renderDeclarations(
  collections: Map<string, LoadedCollection>,
  collection: LoadedCollection,
  mode: LoadedMode,
  filter: (path: string) => boolean = () => true
): string[] {
  return mode.records
    .filter((record) => filter(record.path))
    .map(
      (record) =>
        `  ${cssNameFor(collection.spec.name, record.path)}: ${cssValueFor(
          collections,
          collection.spec.name,
          mode.spec.name,
          record
        )};`
    );
}

function renderCollection(
  collections: Map<string, LoadedCollection>,
  collection: LoadedCollection,
  mode: LoadedMode,
  filter?: (path: string) => boolean
): string[] {
  return [
    `  /* ${collection.spec.name} — ${mode.spec.name} */`,
    ...renderDeclarations(collections, collection, mode, filter),
    "",
  ];
}

function collection(
  collections: Map<string, LoadedCollection>,
  name: string
): LoadedCollection {
  const value = collections.get(name);
  if (!value) throw new Error(`Missing collection: ${name}`);
  return value;
}

function mode(value: LoadedCollection, name: string): LoadedMode {
  const result = value.modes.get(name);
  if (!result) throw new Error(`Missing mode: ${value.spec.name}/${name}`);
  return result;
}

function generateBlock(): string {
  const collections = loadCollections();
  const rootLines = [":root {"];

  for (const spec of COLLECTION_SPECS) {
    const current = collection(collections, spec.name);
    const currentMode = mode(current, spec.modes[0].name);
    if (spec.name === "3. Radius") {
      rootLines.push(
        ...renderCollection(
          collections,
          current,
          currentMode,
          (path) => path === "radius"
        )
      );
      continue;
    }
    rootLines.push(
      ...renderCollection(collections, current, currentMode)
    );
  }

  rootLines.push("  /* shadcn component aliases */");
  for (const [tokenPath, alias] of Object.entries(SHADCN_ALIASES)) {
    rootLines.push(
      `  ${alias}: var(${cssNameFor(
        "1. shadcn/ui - color modes",
        tokenPath
      )});`
    );
  }
  rootLines.push("}");

  const overrideLines: string[] = [];
  for (const spec of COLLECTION_SPECS) {
    if (spec.modes.length === 1) continue;
    const current = collection(collections, spec.name);
    for (const modeSpec of spec.modes.slice(1)) {
      if (!modeSpec.selector) continue;
      const currentMode = mode(current, modeSpec.name);
      overrideLines.push(
        "",
        `${modeSpec.selector} {`,
        ...renderCollection(collections, current, currentMode),
        "}"
      );
    }
  }

  // Explicit default-mode attributes come last so they can override `.dark`.
  for (const spec of COLLECTION_SPECS) {
    if (spec.modes.length === 1) continue;
    const defaultSpec = spec.modes[0];
    if (!defaultSpec.selector) continue;
    const current = collection(collections, spec.name);
    overrideLines.push(
      "",
      `${defaultSpec.selector} {`,
      ...renderCollection(
        collections,
        current,
        mode(current, defaultSpec.name)
      ),
      "}"
    );
  }

  const radius = collection(collections, "3. Radius");
  const themeLines = [
    "",
    "@theme {",
    ...renderCollection(
      collections,
      radius,
      mode(radius, "Mode 1"),
      (path) => path !== "radius"
    ),
    "}",
  ];

  return [...rootLines, ...overrideLines, ...themeLines].join("\n");
}

function applyToCss(generated: string, css: string): string {
  const start = css.indexOf(START_MARKER);
  const end = css.indexOf(END_MARKER);
  if (start === -1 || end === -1) {
    throw new Error(`AUTOGEN markers not found in ${TOKENS_THEME_CSS}`);
  }
  const before = css.slice(0, start + START_MARKER.length);
  const after = css.slice(end);
  return `${before}\n${generated}\n${after}`;
}

function main() {
  const check = process.argv.includes("--check");
  const css = readFileSync(TOKENS_THEME_CSS, "utf-8");
  const next = applyToCss(generateBlock(), css);

  if (check) {
    if (next !== css) {
      console.error(
        "✗ Token drift: run `pnpm --filter @student-ds/ui tokens:build`."
      );
      process.exit(1);
    }
    console.log("✓ Tokens in sync with theme.css");
    return;
  }

  if (next === css) {
    console.log("✓ theme.css already in sync");
    return;
  }

  writeFileSync(TOKENS_THEME_CSS, next);
  console.log(`✓ Wrote ${TOKENS_THEME_CSS}`);
}

main();
