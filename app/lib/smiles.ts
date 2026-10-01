/* eslint-disable @typescript-eslint/no-explicit-any */

const MOLECULES_TAG = "§MOLECULES§";
const FENCE_RE = /```([\s\S]*?)```/g;

export interface SmilesCandidate {
  smiles: string;
  label?: string;
}

export function extractMoleculeNames(text: string): string[] {
  if (!text) return [];

  const sepIdx = text.indexOf(MOLECULES_TAG);
  if (sepIdx !== -1) {
    const moleculesBlock = text.slice(sepIdx + MOLECULES_TAG.length);
    return moleculesBlock
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  const LANG_TAG_RE = /^(smiles|chem|chemistry)$/i;
  const names: string[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(FENCE_RE)) {
    let body = m[1];
    const nl = body.indexOf("\n");
    if (nl !== -1 && LANG_TAG_RE.test(body.slice(0, nl).trim())) {
      body = body.slice(nl + 1);
    }
    for (const line of body.split(/[\r\n]+/)) {
      const t = line.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const pipeIdx = t.indexOf("|");
      if (pipeIdx !== -1) {
        const label = t.slice(pipeIdx + 1).trim();
        if (label) names.push(label);
      } else {
        names.push(t);
      }
    }
  }
  return names;
}

export function stripMoleculeFences(text: string): string {
  if (!text) return "";

  const sepIdx = text.indexOf(MOLECULES_TAG);
  if (sepIdx !== -1) {
    return text.slice(0, sepIdx).trim();
  }

  return text.replace(FENCE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

// Operator-edited replacement for the §MOLECULES§ name list (e.g. correcting
// a name GPT got wrong). Replaces an existing block in place, or appends one
// if the answer never had one. An empty name list removes the block entirely.
export function replaceMoleculeNames(text: string, names: string[]): string {
  const base = stripMoleculeFences(text);
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return base;
  return `${base}\n\n${MOLECULES_TAG}\n${cleaned.join("\n")}`;
}

const EDITABLE_PREFIX = "Molecules: ";

// The internal §MOLECULES§ block is meant for parsing, not editing — turn it
// into a plain "Molecules: name1, name2" line so it shows up as ordinary,
// editable text right in the answer textarea instead of a separate control.
export function toEditableMolecules(text: string): string {
  const base = stripMoleculeFences(text);
  const names = extractMoleculeNames(text);
  if (names.length === 0) return base;
  return `${base}\n\n${EDITABLE_PREFIX}${names.join(", ")}`;
}

// Reverses toEditableMolecules on save: pulls the "Molecules: ..." line back
// out of the edited draft and rebuilds the internal §MOLECULES§ block from
// whatever the operator left there (added, corrected, or deleted names).
export function fromEditableMolecules(text: string): string {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => l.trim().toLowerCase().startsWith(EDITABLE_PREFIX.toLowerCase()));
  if (idx === -1) return text.trim();
  const namesLine = lines[idx].trim().slice(EDITABLE_PREFIX.length);
  const names = namesLine.split(",").map((n) => n.trim()).filter(Boolean);
  const base = lines.slice(0, idx).join("\n").trim();
  return replaceMoleculeNames(base, names);
}

export async function lookupSmiles(name: string): Promise<string | null> {
  try {
    const url =
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/` +
      `${encodeURIComponent(name)}/property/ConnectivitySMILES,SMILES/JSON`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const props = data?.PropertyTable?.Properties?.[0];
    if (!props) return null;
    const smiles = props.SMILES ?? props.ConnectivitySMILES;
    return typeof smiles === "string" ? smiles : null;
  } catch {
    return null;
  }
}

export async function resolveNames(names: string[]): Promise<SmilesCandidate[]> {
  const results = await Promise.all(
    names.map(async (name): Promise<SmilesCandidate | null> => {
      const smiles = await lookupSmiles(name);
      if (!smiles) return null;
      return { smiles, label: name };
    })
  );
  return results.filter((r): r is SmilesCandidate => r !== null);
}

export function isValidSmiles(rdkit: any, smiles: string): boolean {
  let mol: any = null;
  try {
    mol = rdkit.get_mol(smiles);
    if (!mol || !mol.is_valid()) return false;
    const n = typeof mol.get_num_atoms === "function" ? mol.get_num_atoms() : 2;
    return n >= 2;
  } catch {
    return false;
  } finally {
    mol?.delete?.();
  }
}
