import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, "../../..");
export const TOKENS_DIR = join(REPO_ROOT, "tokens");

export type TokenValue = string | number | boolean;

export type TokenNode = {
  $type?: string;
  $value?: TokenValue;
  [key: string]: unknown;
};

export type TokenTree = Record<string, unknown>;

export type TokenRecord = {
  path: string;
  type: string;
  value: TokenValue;
};

export type ModeSpec = {
  name: string;
  file: string;
  selector?: string;
};

export type CollectionSpec = {
  name: string;
  expectedCount: number;
  expectedNameHash: string;
  modes: ModeSpec[];
};

export type LoadedMode = {
  spec: ModeSpec;
  tree: TokenTree;
  records: TokenRecord[];
  recordsByPath: Map<string, TokenRecord>;
};

export type LoadedCollection = {
  spec: CollectionSpec;
  modes: Map<string, LoadedMode>;
};

export const COLLECTION_SPECS: CollectionSpec[] = [
  {
    name: "TW Color Primitives",
    expectedCount: 244,
    expectedNameHash: "cec5830c",
    modes: [{ name: "Mode 1", file: "TW Color Primitives/Mode 1.json" }],
  },
  {
    name: "TW Primitives",
    expectedCount: 522,
    expectedNameHash: "aa74d093",
    modes: [{ name: "Mode 1", file: "TW Primitives/Mode 1.json" }],
  },
  {
    name: "Radix Colours (Additional)",
    expectedCount: 384,
    expectedNameHash: "29767b1d",
    modes: [
      {
        name: "light",
        file: "Radix Colours (Additional)/light.json",
        selector: '[data-radix-colours-mode="light"]',
      },
      {
        name: "dark",
        file: "Radix Colours (Additional)/dark.json",
        selector: '.dark, [data-radix-colours-mode="dark"]',
      },
    ],
  },
  {
    name: "Radix Themes (Additional)",
    expectedCount: 28,
    expectedNameHash: "e33a459c",
    modes: [
      {
        name: "accent/indigo/light",
        file: "Radix Themes (Additional)/accent/indigo/light.json",
        selector: '[data-radix-themes-mode="accent-indigo-light"]',
      },
      {
        name: "gray/slate/light",
        file: "Radix Themes (Additional)/gray/slate/light.json",
        selector: '[data-radix-themes-mode="gray-slate-light"]',
      },
      {
        name: "accent/indigo/dark",
        file: "Radix Themes (Additional)/accent/indigo/dark.json",
        selector: '[data-radix-themes-mode="accent-indigo-dark"]',
      },
      {
        name: "gray/slate/dark",
        file: "Radix Themes (Additional)/gray/slate/dark.json",
        selector: '[data-radix-themes-mode="gray-slate-dark"]',
      },
    ],
  },
  {
    name: "4. Spacing",
    expectedCount: 13,
    expectedNameHash: "bcba5970",
    modes: [{ name: "Mode 1", file: "4. Spacing/Mode 1.json" }],
  },
  {
    name: "3. Radius",
    expectedCount: 9,
    expectedNameHash: "d8565205",
    modes: [{ name: "Mode 1", file: "3. Radius/Mode 1.json" }],
  },
  {
    name: "5. Containers",
    expectedCount: 5,
    expectedNameHash: "07b16357",
    modes: [{ name: "Mode 1", file: "5. Containers/Mode 1.json" }],
  },
  {
    name: "2. Components",
    expectedCount: 30,
    expectedNameHash: "badae38c",
    modes: [{ name: "Mode 1", file: "2. Components/Mode 1.json" }],
  },
  {
    name: "1. shadcn/ui - color modes",
    expectedCount: 50,
    expectedNameHash: "201841ad",
    modes: [
      {
        name: "light/slate",
        file: "1. shadcn/ui - color modes/light/slate.json",
        selector: '[data-shadcn-mode="light-slate"]',
      },
      {
        name: "dark/slate",
        file: "1. shadcn/ui - color modes/dark/slate.json",
        selector: '.dark, [data-shadcn-mode="dark-slate"]',
      },
      {
        name: "light/zinc",
        file: "1. shadcn/ui - color modes/light/zinc.json",
        selector: '[data-shadcn-mode="light-zinc"]',
      },
      {
        name: "dark/zinc",
        file: "1. shadcn/ui - color modes/dark/zinc.json",
        selector: '[data-shadcn-mode="dark-zinc"]',
      },
    ],
  },
  {
    name: "6. Inferentics Color Primitives",
    expectedCount: 146,
    expectedNameHash: "f9516294",
    modes: [
      {
        name: "Default",
        file: "6. Inferentics Color Primitives/Default.json",
      },
    ],
  },
  {
    name: "6. Inferentics Colors",
    expectedCount: 163,
    expectedNameHash: "11515f26",
    modes: [{ name: "Light", file: "6. Inferentics Colors/Light.json" }],
  },
];

export const EXPECTED_TOKEN_SET_ORDER = [
  "global",
  "TW Color Primitives/Mode 1",
  "Radix Colours (Additional)/light",
  "Radix Colours (Additional)/dark",
  "Radix Themes (Additional)/accent/indigo/light",
  "Radix Themes (Additional)/gray/slate/light",
  "Radix Themes (Additional)/accent/indigo/dark",
  "Radix Themes (Additional)/gray/slate/dark",
  "2. Components/Mode 1",
  "1. shadcn/ui - color modes/light/slate",
  "1. shadcn/ui - color modes/dark/slate",
  "1. shadcn/ui - color modes/light/zinc",
  "1. shadcn/ui - color modes/dark/zinc",
  "TW Primitives/Mode 1",
  "4. Spacing/Mode 1",
  "3. Radius/Mode 1",
  "5. Containers/Mode 1",
  "6. Inferentics Color Primitives/Default",
  "6. Inferentics Colors/Light",
] as const;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function flattenTokens(
  node: unknown,
  path: string[] = [],
  inheritedType = "",
  out: TokenRecord[] = []
): TokenRecord[] {
  if (!node || typeof node !== "object") return out;

  const object = node as TokenNode;
  const type = typeof object.$type === "string" ? object.$type : inheritedType;
  if (object.$value !== undefined) {
    out.push({ path: path.join("/"), type, value: object.$value });
    return out;
  }

  for (const [key, value] of Object.entries(object)) {
    if (key.startsWith("$")) continue;
    flattenTokens(value, [...path, key], type, out);
  }
  return out;
}

export function loadCollections(): Map<string, LoadedCollection> {
  const collections = new Map<string, LoadedCollection>();
  for (const spec of COLLECTION_SPECS) {
    const modes = new Map<string, LoadedMode>();
    for (const modeSpec of spec.modes) {
      const tree = readJson<TokenTree>(join(TOKENS_DIR, modeSpec.file));
      const records = flattenTokens(tree);
      modes.set(modeSpec.name, {
        spec: modeSpec,
        tree,
        records,
        recordsByPath: new Map(records.map((record) => [record.path, record])),
      });
    }
    collections.set(spec.name, { spec, modes });
  }
  return collections;
}

export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function tokenNameHash(records: TokenRecord[]): string {
  return fnv1a(
    records
      .map((record) => record.path)
      .sort()
      .join("\n")
  );
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function cssNameFor(collectionName: string, tokenPath: string): string {
  const path = slug(tokenPath);
  switch (collectionName) {
    case "TW Color Primitives":
      return `--tw-color-${path}`;
    case "TW Primitives":
      return `--tw-primitive-${path}`;
    case "Radix Colours (Additional)":
      return `--radix-color-${path}`;
    case "Radix Themes (Additional)":
      return `--${path}`;
    case "4. Spacing":
    case "3. Radius":
    case "5. Containers":
      return `--${path}`;
    case "2. Components":
      return `--component-${path}`;
    case "1. shadcn/ui - color modes":
      return `--shadcn-${path}`;
    case "6. Inferentics Color Primitives":
      return `--inferentics-primitive-${path}`;
    case "6. Inferentics Colors":
      return `--inferentics-${path}`;
    default:
      throw new Error(`No CSS naming rule for collection: ${collectionName}`);
  }
}

export function codeSyntaxFor(collectionName: string, tokenPath: string): string {
  const shadcnAlias = SHADCN_ALIASES[tokenPath];
  const cssName = shadcnAlias ?? cssNameFor(collectionName, tokenPath);
  return `var(${cssName})`;
}

export const SHADCN_ALIASES: Record<string, string> = {
  "tokens/background": "--background",
  "tokens/foreground": "--foreground",
  "tokens/muted": "--muted",
  "tokens/muted-foreground": "--muted-foreground",
  "tokens/card": "--card",
  "tokens/card-foreground": "--card-foreground",
  "tokens/popover": "--popover",
  "tokens/popover-foreground": "--popover-foreground",
  "tokens/border": "--border",
  "tokens/input": "--input",
  "tokens/primary": "--primary",
  "tokens/primary-foreground": "--primary-foreground",
  "tokens/secondary": "--secondary",
  "tokens/secondary-foreground": "--secondary-foreground",
  "tokens/accent": "--accent",
  "tokens/accent-foreground": "--accent-foreground",
  "tokens/destructive": "--destructive",
  "tokens/destructive-foreground": "--destructive-foreground",
  "tokens/ring": "--ring",
  "charts/chart-1": "--chart-1",
  "charts/chart-2": "--chart-2",
  "charts/chart-3": "--chart-3",
  "charts/chart-4": "--chart-4",
  "charts/chart-5": "--chart-5",
  "sidebar/sidebar-background": "--sidebar",
  "sidebar/sidebar-foreground": "--sidebar-foreground",
  "sidebar/sidebar-primary": "--sidebar-primary",
  "sidebar/sidebar-primary-foreground": "--sidebar-primary-foreground",
  "sidebar/sidebar-accent": "--sidebar-accent",
  "sidebar/sidebar-accent-foreground": "--sidebar-accent-foreground",
  "sidebar/sidebar-border": "--sidebar-border",
  "sidebar/sidebar-ring": "--sidebar-ring",
};

function getMode(
  collections: Map<string, LoadedCollection>,
  collectionName: string,
  modeName: string
): LoadedMode {
  const collection = collections.get(collectionName);
  const mode = collection?.modes.get(modeName);
  if (!mode) {
    throw new Error(`Missing token mode: ${collectionName} / ${modeName}`);
  }
  return mode;
}

type AliasSource = {
  collection: string;
  mode: string;
  namespace?: string;
};

function aliasSources(
  collectionName: string,
  modeName: string
): AliasSource[] {
  switch (collectionName) {
    case "TW Primitives":
      return [{ collection: collectionName, mode: modeName }];
    case "1. shadcn/ui - color modes":
      return [
        { collection: collectionName, mode: modeName },
        { collection: "TW Color Primitives", mode: "Mode 1" },
        { collection: "TW Primitives", mode: "Mode 1" },
      ];
    case "2. Components":
      return [
        { collection: collectionName, mode: modeName },
        {
          collection: "1. shadcn/ui - color modes",
          mode: "light/slate",
        },
        { collection: "TW Color Primitives", mode: "Mode 1" },
        { collection: "Radix Colours (Additional)", mode: "light" },
      ];
    case "3. Radius":
    case "4. Spacing":
    case "5. Containers":
      return [{ collection: "TW Primitives", mode: "Mode 1" }];
    case "Radix Themes (Additional)":
      return [
        {
          collection: "Radix Colours (Additional)",
          mode: modeName.endsWith("/dark") ? "dark" : "light",
        },
      ];
    case "6. Inferentics Colors":
      return [
        {
          collection: "6. Inferentics Color Primitives",
          mode: "Default",
          namespace: "inferentics-primitive",
        },
        { collection: "TW Color Primitives", mode: "Mode 1" },
      ];
    default:
      return [];
  }
}

function isAlias(value: TokenValue): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("{") &&
    value.endsWith("}")
  );
}

export function findAliasTarget(
  collections: Map<string, LoadedCollection>,
  collectionName: string,
  modeName: string,
  value: string
): { collection: string; mode: string; record: TokenRecord } {
  const aliasSegments = value.slice(1, -1).split(".");
  for (const source of aliasSources(collectionName, modeName)) {
    const segments = [...aliasSegments];
    if (source.namespace) {
      if (segments[0] !== source.namespace) continue;
      segments.shift();
    } else if (segments[0] === "inferentics-primitive") {
      continue;
    }

    const path = segments.join("/");
    const record = getMode(
      collections,
      source.collection,
      source.mode
    ).recordsByPath.get(path);
    if (record) {
      return { collection: source.collection, mode: source.mode, record };
    }
  }

  throw new Error(
    `Alias target not found for ${collectionName}/${modeName}: ${value}`
  );
}

function formatNumber(
  collectionName: string,
  tokenPath: string,
  value: number
): string {
  if (collectionName === "TW Primitives") {
    const group = tokenPath.split("/")[0];
    if (group === "opacity") return String(value / 100);
    if (group === "tracking") return `${value / 100}em`;
    if (group === "font") return String(value);
  }
  return `${value / 16}rem`;
}

export function cssValueFor(
  collections: Map<string, LoadedCollection>,
  collectionName: string,
  modeName: string,
  record: TokenRecord
): string {
  if (isAlias(record.value)) {
    const target = findAliasTarget(
      collections,
      collectionName,
      modeName,
      record.value
    );
    return `var(${cssNameFor(target.collection, target.record.path)})`;
  }
  if (record.type === "color") return String(record.value).toLowerCase();
  if (typeof record.value === "number") {
    return formatNumber(collectionName, record.path, record.value);
  }
  return String(record.value);
}

export function defaultMode(collection: LoadedCollection): LoadedMode {
  const firstModeName = collection.spec.modes[0]?.name;
  if (!firstModeName) throw new Error(`Collection has no modes: ${collection.spec.name}`);
  return getMode(
    new Map([[collection.spec.name, collection]]),
    collection.spec.name,
    firstModeName
  );
}
