const BEAVER_BASE =
  process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const cookie = document.cookie
    .split(";")
    .map((r) => r.trim())
    .find((r) => r.startsWith("token="))
    ?.slice("token=".length);
  if (cookie) return decodeURIComponent(cookie);
  return (
    localStorage.getItem("keycloak_token") ??
    sessionStorage.getItem("keycloak_token")
  );
}

function authHeaders(): HeadersInit {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw Object.assign(
      new Error("Network error — check your connection and try again."),
      { status: 0, body: { error: "Network error" } },
    );
  }

  if (res.status === 401) {
    sessionStorage.removeItem("keycloak_token");
    localStorage.removeItem("keycloak_token");
    document.cookie = "token=; Max-Age=0; path=/";
    window.location.href = "/login";
    throw Object.assign(
      new Error("Session expired. Please log in again."),
      { status: 401, body: { error: "Unauthorized" } },
    );
  }

  if (!res.ok) {
    const text = await res.text();
    let body: { error?: string } = {};
    try { body = JSON.parse(text); } catch { body = { error: text || undefined }; }
    const friendly = body.error || "Something went wrong. Please try again.";
    throw Object.assign(new Error(friendly), { status: res.status, body });
  }

  if (res.status === 204) return undefined as unknown as T;
  const b = await res.text();
  return (b ? JSON.parse(b) : ({} as T)) as T;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type BugType = "bug";
export type Priority = "low" | "medium" | "high" | "critical";

export interface Attachment {
  key: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface Bug {
  id: number;
  bug_type: BugType;
  priority: Priority;
  comments: string | null;
  status: string;
  reporter_id: string;
  reporter_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  page_url: string | null;
  school_id: string;
  batch_id: string | null;
  student_id: string | null;
  exam_id: string | null;
  attachments: Attachment[];
  created_at: string;
  updated_at: string;
}

export interface CreateBugPayload {
  bug_type: BugType;
  priority: Priority;
  title?: string;
  comments?: string;
  assignee_id?: string;
  assignee_name?: string;
  page_url?: string;
  batch_id?: string;
  student_id?: string;
  exam_id?: string;
  attachments?: Attachment[];
}

export interface BugUser {
  id: string;
  email: string;
  display_name: string | null;
}

// ── API calls ──────────────────────────────────────────────────────────────

export const createBug = (payload: CreateBugPayload) =>
  jsonFetch<Bug>(`${BEAVER_BASE}/api/bugs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const listBugs = (filters?: { status?: string; bug_type?: string }) => {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.bug_type) params.set("bug_type", filters.bug_type);
  const qs = params.toString();
  return jsonFetch<{ count: number; rows: Bug[] }>(
    `${BEAVER_BASE}/api/bugs${qs ? `?${qs}` : ""}`,
  );
};

export const getBug = (id: number) =>
  jsonFetch<Bug>(`${BEAVER_BASE}/api/bugs/${id}`);

export const listBugUsers = () =>
  jsonFetch<{ count: number; users: BugUser[] }>(`${BEAVER_BASE}/api/bugs/users`);

export const verifyBug = (id: number, clear = false) =>
  jsonFetch<Bug>(`${BEAVER_BASE}/api/bugs/${id}/verify`, {
    method: "PATCH",
    body: JSON.stringify({ clear }),
  });

export const updateBugStatus = (id: number, status: "open" | "resolved") =>
  jsonFetch<Bug>(`${BEAVER_BASE}/api/bugs/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export interface ThreadComment {
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
}

export const addBugComment = (bugId: number, body: string) =>
  jsonFetch<Bug>(`${BEAVER_BASE}/api/bugs/${bugId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export const editBugComment = (bugId: number, index: number, body: string) =>
  jsonFetch<Bug>(`${BEAVER_BASE}/api/bugs/${bugId}/comments/${index}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });

export const updateBug = (id: number, fields: {
  title?: string;
  comments?: string;
  priority?: string;
  assignee_id?: string | null;
  assignee_name?: string | null;
  verified_by_id?: string | null;
  verified_by_name?: string | null;
}) =>
  jsonFetch<Bug>(`${BEAVER_BASE}/api/bugs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
