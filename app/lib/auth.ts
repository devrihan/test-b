const KEYCLOAK_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL;
const KEYCLOAK_REALM = process.env.NEXT_PUBLIC_KEYCLOAK_REALM;
const KEYCLOAK_CLIENT_ID = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID;


const TOKEN_KEY = "keycloak_token";
const USER_KEY = "keycloak_user";
const REMEMBER_ME_KEY = "remember_me";


export interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    token_type: string;
}

export interface User {
    username: string;
    email?: string;
    name?: string;
    roles: string[];
}


function parseJwt(token: string): Record<string, unknown> {
    try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        );
        return JSON.parse(jsonPayload);
    } catch {
        return {};
    }
}


export async function login(
    username: string,
    password: string,
    rememberMe: boolean = false
): Promise<User> {

    const params = new URLSearchParams();
    params.append("grant_type", "password");
    params.append("client_id", KEYCLOAK_CLIENT_ID!);
    params.append("username", username);
    params.append("password", password);

    const response = await fetch("/api/auth/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));;
        throw new Error(errorData.error_description || "Authentication failed");
    }

    const tokenData: TokenResponse = await response.json();

    // console.log("Received token data:", tokenData);

    // Clear the other store first: logging in again with a different
    // rememberMe would otherwise leave a stale token behind it.
    const storage = rememberMe ? localStorage : sessionStorage;
    const other = rememberMe ? sessionStorage : localStorage;
    other.removeItem(TOKEN_KEY);
    storage.setItem(TOKEN_KEY, tokenData.access_token);

    document.cookie = `token=${tokenData.access_token}; path=/; SameSite=Strict`;

    const tokenPayload = parseJwt(tokenData.access_token);

    const VALID_ROLES = ["ADMIN", "SUPER_ADMIN", "MANAGER", "VIEWER"];
    const realmAccess = tokenPayload.realm_access as { roles?: string[] } | undefined;
    const roles: string[] = realmAccess?.roles?.filter((r) =>
        VALID_ROLES.includes(r)
    ) ?? [];

    const user: User = {
        username: (tokenPayload.preferred_username as string) || username,
        email: tokenPayload.email as string | undefined,
        name: tokenPayload.name as string | undefined,
        roles,   
    };

    storage.setItem(USER_KEY, JSON.stringify(user));
    return user;
}

export async function logout(): Promise<void> {
    try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch { }

    clearStoredToken();
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(REMEMBER_ME_KEY);

    window.location.href = "/login";
}

// Drops the bearer token from every place it can live.
export function clearStoredToken(): void {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    document.cookie = "token=; path=/; Max-Age=0; SameSite=Strict";
}


// The one place the bearer token is read. Priority: the "token" cookie set by
// the auth proxy, then whichever store login wrote to.
export function getAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    const cookie = document.cookie
        .split(";")
        .map((r) => r.trim())
        .find((r) => r.startsWith("token="))
        ?.slice("token=".length);
    if (cookie) return decodeURIComponent(cookie);
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredToken(): string | null {
    return getAuthToken();
}


export function isTokenValid(): boolean {
    const token = getStoredToken();
    if (!token) return false;
    try {
        const payload = parseJwt(token);
        const exp = payload.exp as number;
        if (!exp) return false;
        return Date.now() < exp * 1000 - 30000;
    } catch {
        return false;
    }
}

export function getUserRoles(): string[] {
  if (typeof window === "undefined") return [];
  const userStr = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
  if (!userStr) return [];
  try {
    const user: User = JSON.parse(userStr);
    return user.roles ?? [];
  } catch {
    return [];
  }
}

// Returns the login username (Keycloak preferred_username), distinct from the
// display name. Used for username-gated features (e.g. bulk batch creation).
export function getUsername(): string {
  if (typeof window === "undefined") return "";
  const userStr = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
  if (!userStr) return "";
  try {
    const user: User = JSON.parse(userStr);
    return user.username ?? "";
  } catch {
    return "";
  }
}