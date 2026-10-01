import { decode } from "punycode";
import { getAuthToken as getToken, clearStoredToken } from "@/app/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";





interface RequestOptions extends RequestInit {
    params?: Record<string, string>;
    timeoutMs?: number;
}

// Cap every request so a hung backend surfaces an error instead of an
// infinite spinner (e.g. Save stuck on "Saving…"). Callers can override.
const DEFAULT_TIMEOUT_MS = 60_000;

// Thrown for any non-2xx response. `.message` keeps existing callers working
// (`e instanceof Error ? e.message : ...` is a common pattern app-wide); `.status`
// and `.body` are additive, for callers that need the raw error payload (e.g.
// reading `edited_count` off a 409 needs-confirmation response).
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}


async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const token = getToken();



    const { params, timeoutMs, signal, ...fetchOptions } = options;

    const url = new URL(
  endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`
);
    if (params) {
        Object.entries(params).forEach(([Key, val]) => url.searchParams.set(Key, val));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (signal) signal.addEventListener("abort", () => controller.abort());

    let res: Response;
    try {
        res = await fetch(url.toString(), {
            ...fetchOptions,
            signal: controller.signal,
            headers: {
                "Content-Type" : "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...fetchOptions.headers,

            },
        });
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
            throw new Error("Request timed out. Please try again.");
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }


    if (res.status === 401) {
        clearStoredToken();
        window.location.href = "/login";
  throw new Error("Unauthorized. Please log in again.");
    }


    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(body?.message ?? body?.error ?? `Request failed: ${res.status}`, res.status, body);
    }


    const text = await res.text();
    return text ? JSON.parse(text) : ({} as T);
}



export const apiClient = {
    get: <T>(endpoint: string, options?: RequestOptions) => request<T>(endpoint, { ...options, method: "GET" }),

    post: <T>(endpoint: string, body: unknown, options?: RequestOptions) => request<T>(endpoint, {
        ...options,
        method: "POST",
        body: JSON.stringify(body),
    }),

    put: <T>(endpoint: string, body: unknown, options?: RequestOptions) => request<T>(endpoint, {
        ...options,
        method: "PUT",
        body: JSON.stringify(body),
    }),


    patch: <T>(endpoint: string, body: unknown, options?: RequestOptions) => request<T>(endpoint, {
        ...options,
        method: "PATCH",
        body: JSON.stringify(body),
    }),


    delete: <T>(endpoint: string, options?: RequestOptions) => request<T>(endpoint, { ...options, method: "DELETE" }),
}