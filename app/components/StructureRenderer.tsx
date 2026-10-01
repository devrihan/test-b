"use client";

import { useEffect, useState } from "react";



/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    initRDKitModule?: (opts?: { locateFile?: () => string }) => Promise<any>;
    __rdkitPromise?: Promise<any>;
  }
}

export function loadRDKit(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.__rdkitPromise) return window.__rdkitPromise;

  window.__rdkitPromise = new Promise<any>((resolve, reject) => {
    const init = () => {
      if (!window.initRDKitModule) return reject(new Error("initRDKitModule missing"));
      window
        .initRDKitModule({ locateFile: () => "/RDKit_minimal.wasm" })
        .then(resolve)
        .catch(reject);
    };
    if (window.initRDKitModule) return init();
    // Inject the loader script once.
    const existing = document.getElementById("rdkit-loader") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", init);
      existing.addEventListener("error", () => reject(new Error("RDKit script failed")));
      return;
    }
    const script = document.createElement("script");
    script.id = "rdkit-loader";
    script.src = "/RDKit_minimal.js";
    script.async = true;
    script.onload = init;
    script.onerror = () => reject(new Error("RDKit script failed to load"));
    document.head.appendChild(script);
  });
  return window.__rdkitPromise;
}

interface StructureRendererProps {
  smiles?: string | null;
  label?: string;
  width?: number;
  height?: number;
  className?: string;
}

export default function StructureRenderer({
  smiles,
  label,
  width = 260,
  height = 160,
  className,
}: StructureRendererProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [formula, setFormula] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFormula(null);
    setFailed(false);
    if (!smiles) return;

    loadRDKit()
      .then((RDKit) => {
        if (cancelled) return;
        const mol = RDKit.get_mol(smiles);
        if (!mol || !mol.is_valid()) {
          mol?.delete?.();
          setFailed(true);
          return;
        }
        try {
          const out = mol.get_svg(width, height);
          try {
            const inchi = mol.get_inchi();
            if (inchi) {
              const match = inchi.match(/InChI=\S+?\/([\w]+)/);
              if (match) setFormula(match[1]);
            }
          } catch { /* */ }
          setSvg(out);
        } finally {
          mol.delete();
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [smiles, width, height]);

  if (!smiles) return null;
  if (failed) {
    return <code className={`text-xs text-gray-500 ${className ?? ""}`}>{smiles}</code>;
  }
  if (!svg) {
    return <span className={`text-xs text-gray-400 ${className ?? ""}`}>rendering structure…</span>;
  }
  return (
    <div
      className={`inline-block rounded-lg border border-gray-200 bg-white text-center ${className ?? ""}`}
    >
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      {(label || formula) && (
        <div className="px-2 pb-1.5 text-[10px] leading-tight">
          {label && <div className="font-medium text-gray-700">{label}</div>}
          {formula && <div className="text-gray-400">{formula}</div>}
        </div>
      )}
    </div>
  );
}
