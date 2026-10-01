// Client-side helpers for the user registry (s056). Hits beaver-api /api/registry/*.
// Identity is derived server-side from the bearer token. Mirrors reviewApi.ts.

import { getAuthToken as getToken } from "@/app/lib/auth";

const BEAVER_BASE =
    process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";

export type RegistryUser = {
    id: string;
    keycloak_id: string | null;
    email: string;
    display_name: string | null;
    groups: string[];
    photo_key: string | null;
    photo_content_type: string | null;
    photo_updated_at: string | null;
};


function authHeaders(): HeadersInit {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
            ...(init?.headers ?? {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        let body: unknown;
        try {
            body = JSON.parse(text);
        } catch {
            body = { error: text || `HTTP ${res.status}` };
        }
        throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body });
    }
    if (res.status === 204) return undefined as unknown as T;
    const b = await res.text();
    return (b ? JSON.parse(b) : ({} as T)) as T;
}

// Photo URLs. The serve endpoint 302s to R2 (with its own ?v= cache-bust); we add
// a client-side ?v= after an upload to bust the short-lived redirect cache.
export function photoUrlById(id: string, v = 0): string {
    return `${BEAVER_BASE}/api/registry/photo/by-id/${encodeURIComponent(id)}${v ? `?v=${v}` : ""}`;
}
export function photoUrlByEmail(email: string): string {
    return `${BEAVER_BASE}/api/registry/photo/by-email/${encodeURIComponent(email)}`;
}

// ── Self-service (own record) ───────────────────────────────────────────────
export const getMe = () => jsonFetch<RegistryUser>(`${BEAVER_BASE}/api/registry/me`);
export const updateMe = (displayName: string) =>
    jsonFetch<RegistryUser>(`${BEAVER_BASE}/api/registry/me`, {
        method: "PATCH",
        body: JSON.stringify({ displayName }),
    });

// ── Admin / OPERATIONS ──────────────────────────────────────────────────────
export const listUsers = () =>
    jsonFetch<{ count: number; users: RegistryUser[] }>(`${BEAVER_BASE}/api/registry/users`);
export const syncUsers = () =>
    jsonFetch<{ synced: number; missing: string[] }>(`${BEAVER_BASE}/api/registry/sync`, {
        method: "POST",
        body: JSON.stringify({}),
    });
export const updateUser = (id: string, displayName: string) =>
    jsonFetch<RegistryUser>(`${BEAVER_BASE}/api/registry/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ displayName }),
    });

export type CreateUserInput = {
    email: string;
    firstName?: string;
    lastName?: string;
    group?: string;
    initialPassword: string;
};
export const createUser = (input: CreateUserInput) =>
    jsonFetch<RegistryUser>(`${BEAVER_BASE}/api/registry/users/create`, {
        method: "POST",
        body: JSON.stringify(input),
    });

// ── Photo upload (presign → PUT to R2 → confirm) ────────────────────────────
async function uploadVia(presignUrl: string, confirmUrl: string, file: File): Promise<RegistryUser> {
    const contentType = file.type || "image/webp";
    const { uploadUrl } = await jsonFetch<{ key: string; contentType: string; uploadUrl: string }>(
        presignUrl,
        { method: "POST", body: JSON.stringify({ contentType }) },
    );
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
    if (!put.ok) throw new Error(`Upload to storage failed (${put.status})`);
    return jsonFetch<RegistryUser>(confirmUrl, { method: "PUT", body: JSON.stringify({ contentType }) });
}
export const uploadMyAvatar = (file: File) =>
    uploadVia(`${BEAVER_BASE}/api/registry/me/photo/presign`, `${BEAVER_BASE}/api/registry/me/photo`, file);
export const uploadUserAvatar = (id: string, file: File) =>
    uploadVia(
        `${BEAVER_BASE}/api/registry/users/${id}/photo/presign`,
        `${BEAVER_BASE}/api/registry/users/${id}/photo`,
        file,
    );

// Pull a human-readable message out of a thrown jsonFetch error.
export function errMsg(e: unknown): string {
    const body = (e as { body?: { error?: string; detail?: string } })?.body;
    return body?.error ?? body?.detail ?? (e as Error)?.message ?? "Something went wrong";
}
