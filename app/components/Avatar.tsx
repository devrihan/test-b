"use client";
import { useState } from "react";

// Initials from a name or email, e.g. "Tanmay" → "T", "sajan@x.com" → "S".
export function initialsOf(name: string): string {
    return (
        name
            .split(/[\s@._-]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((s) => s[0]?.toUpperCase())
            .join("") || "?"
    );
}

// Photo-first avatar with initials fallback (extracted from the review queue so
// the registry pages and the navigator share one component). On image error
// (e.g. the registry photo endpoint 404s = no photo), it falls back to initials.
export default function Avatar({
    name,
    photoUrl,
    size = 36,
}: {
    name: string;
    photoUrl?: string;
    size?: number;
}) {
    const [err, setErr] = useState(false);
    if (photoUrl && !err) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={photoUrl}
                alt={name}
                onError={() => setErr(true)}
                className="rounded-full object-cover bg-gray-100"
                style={{ width: size, height: size }}
            />
        );
    }
    return (
        <span
            className="inline-flex items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700"
            style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
        >
            {initialsOf(name)}
        </span>
    );
}
