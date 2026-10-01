"use client";

import { useEffect, useState } from "react";
import StructureRenderer, { loadRDKit } from "./StructureRenderer";
import {
  extractMoleculeNames,
  resolveNames,
  isValidSmiles,
  type SmilesCandidate,
} from "../lib/smiles";

export default function DetectedStructures({ text }: { text: string }) {
  const [names, setNames] = useState<string[]>([]);
  const [valid, setValid] = useState<SmilesCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setValid([]);
    setLoading(false);

    const extracted = extractMoleculeNames(text);
    setNames(extracted);
    if (extracted.length === 0) return;

    setLoading(true);

    (async () => {
      const resolved = await resolveNames(extracted);
      if (cancelled) return;

      const rdkit = await loadRDKit();
      if (cancelled) return;

      const results = resolved.filter((c) => isValidSmiles(rdkit, c.smiles));

      if (!cancelled) {
        setValid(results);
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [text]);

  if (names.length === 0) return null;

  const unresolvedCount = names.length - valid.length;

  return (
    <div className="flex gap-2 px-4 pb-2 pt-0">
      <div className="w-12 shrink-0" />
      <div>
        <div className="text-[10px] font-semibold text-violet-600 mb-1">
          {loading
            ? "Looking up structures…"
            : `Detected molecule${names.length > 1 ? "s" : ""}`}
        </div>
        <div className="text-xs text-gray-600 mb-1.5">{names.join(", ")}</div>
        {!loading && unresolvedCount > 0 && (
          <div className="text-[10px] text-amber-600 mb-1.5">
            {unresolvedCount} name{unresolvedCount > 1 ? "s" : ""} not found — double-click the
            answer to correct the Molecules: line
          </div>
        )}
        {!loading && valid.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {valid.map((c, i) => (
              <StructureRenderer key={`${c.smiles}-${i}`} smiles={c.smiles} label={c.label} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
