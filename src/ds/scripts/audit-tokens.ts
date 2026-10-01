#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COLLECTION_SPECS,
  EXPECTED_TOKEN_SET_ORDER,
  REPO_ROOT,
  TOKENS_DIR,
  cssNameFor,
  findAliasTarget,
  loadCollections,
  tokenNameHash,
} from "./token-registry";

function fail(message: string): never {
  throw new Error(message);
}

const collections = loadCollections();
const cssOwners = new Map<string, string>();
let variableCount = 0;
let aliasCount = 0;

for (const spec of COLLECTION_SPECS) {
  const collection = collections.get(spec.name);
  if (!collection) fail(`Missing collection: ${spec.name}`);

  for (const modeSpec of spec.modes) {
    const mode = collection.modes.get(modeSpec.name);
    if (!mode) fail(`Missing mode: ${spec.name} / ${modeSpec.name}`);
    if (mode.records.length !== spec.expectedCount) {
      fail(
        `${spec.name}/${modeSpec.name}: expected ${spec.expectedCount} variables, found ${mode.records.length}`
      );
    }
    const nameHash = tokenNameHash(mode.records);
    if (nameHash !== spec.expectedNameHash) {
      fail(
        `${spec.name}/${modeSpec.name}: expected name hash ${spec.expectedNameHash}, found ${nameHash}`
      );
    }

    for (const record of mode.records) {
      if (modeSpec === spec.modes[0]) {
        variableCount += 1;
        const cssName = cssNameFor(spec.name, record.path);
        const owner = cssOwners.get(cssName);
        if (owner) {
          fail(
            `CSS name collision: ${cssName} maps to both ${owner} and ${spec.name}/${record.path}`
          );
        }
        cssOwners.set(cssName, `${spec.name}/${record.path}`);
      }

      if (
        typeof record.value === "string" &&
        record.value.startsWith("{") &&
        record.value.endsWith("}")
      ) {
        findAliasTarget(
          collections,
          spec.name,
          modeSpec.name,
          record.value
        );
        aliasCount += 1;
      }
    }
  }
}

const metadata = JSON.parse(
  readFileSync(join(TOKENS_DIR, "$metadata.json"), "utf-8")
) as { tokenSetOrder?: string[] };
if (
  JSON.stringify(metadata.tokenSetOrder) !==
  JSON.stringify(EXPECTED_TOKEN_SET_ORDER)
) {
  fail("tokens/$metadata.json tokenSetOrder does not match Figma collections");
}

const themeCss = readFileSync(
  join(REPO_ROOT, "packages/ui/src/styles/theme.css"),
  "utf-8"
);
for (const cssName of cssOwners.keys()) {
  if (!themeCss.includes(`${cssName}:`)) {
    fail(`Generated CSS is missing ${cssName}`);
  }
}
if (themeCss.includes("--spacing-sp-")) {
  fail("Deprecated --spacing-sp-* variables are still present");
}

if (collections.size !== 11) {
  fail(`Expected 11 collections, found ${collections.size}`);
}
if (variableCount !== 1594) {
  fail(`Expected 1594 unique variables, found ${variableCount}`);
}

console.log(
  `✓ 11 collections, ${variableCount} variables, ${aliasCount} mode aliases`
);
console.log(`✓ ${cssOwners.size} collision-free CSS names`);
