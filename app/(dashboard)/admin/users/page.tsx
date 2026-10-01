"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import type { ChangeEvent, ReactNode } from "react";
import { Plus, RefreshCw, Upload } from "lucide-react";
import { getUserRoles } from "@/app/lib/auth";
import Avatar from "@/app/components/Avatar";
import Toast from "@/app/components/Toast";
import {
    listUsers,
    syncUsers,
    createUser,
    updateUser,
    uploadUserAvatar,
    photoUrlById,
    errMsg,
    type RegistryUser,
    type CreateUserInput,
} from "@/app/lib/registryApi";

type ToastState = { type: "success" | "error"; message: string } | null;

const NO_USERS: RegistryUser[] = [];

export default function AdminUsersPage() {
    const queryClient = useQueryClient();
    const [authorized, setAuthorized] = useState<boolean | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [photoV, setPhotoV] = useState(1);
    const [toast, setToast] = useState<ToastState>(null);

    // Roles live in browser storage, which the server render cannot read — so
    // this must happen after mount or the markup would not match. `authorized`
    // starts null ("unknown") and gates the query below.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAuthorized(getUserRoles().includes("ADMIN"));
    }, []);

    const usersQuery = useQuery({
        queryKey: keys.registry.users(),
        queryFn: () => listUsers().then((r) => r.users),
        enabled: authorized === true,
    });

    const users = usersQuery.data ?? NO_USERS;
    const loading = usersQuery.isPending;
    const fetchError = usersQuery.error ? errMsg(usersQuery.error) : null;

    const load = () =>
        queryClient.invalidateQueries({ queryKey: keys.registry.users() });

    const syncMutation = useMutation({
        mutationFn: syncUsers,
        onSuccess: (r) => {
            setToast({ type: "success", message: `Synced ${r.synced}; ${r.missing.length} not in Keycloak` });
            void load();
        },
        onError: (e) => setToast({ type: "error", message: errMsg(e) }),
    });

    const syncing = syncMutation.isPending;
    const onSync = () => syncMutation.mutate();

    const replace = (u: RegistryUser) =>
        queryClient.setQueryData<RegistryUser[]>(keys.registry.users(), (us) =>
            us?.map((y) => (y.id === u.id ? u : y)),
        );

    if (authorized === null) return <div className="p-8 text-gray-500">Loading…</div>;
    if (!authorized) return <div className="p-8 text-gray-500">You need the ADMIN role to manage users.</div>;

    return (
        <div className="max-w-5xl mx-auto p-8">
            {(toast || fetchError) && (
                <Toast
                    message={toast?.message ?? fetchError ?? ""}
                    type={toast?.type ?? "error"}
                    onClose={() => setToast(null)}
                />
            )}
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-semibold text-gray-900">User management</h1>
                <div className="flex gap-2">
                    <button
                        onClick={onSync}
                        disabled={syncing}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition disabled:opacity-50"
                    >
                        <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
                        {syncing ? "Syncing…" : "Sync from Keycloak"}
                    </button>
                    <button
                        onClick={() => setShowAdd(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition"
                    >
                        <Plus size={15} /> Add user
                    </button>
                </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-left">
                        <tr>
                            <th className="px-4 py-2 font-medium">User</th>
                            <th className="px-4 py-2 font-medium">Email</th>
                            <th className="px-4 py-2 font-medium">Groups</th>
                            <th className="px-4 py-2 font-medium text-right">Photo</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
                        ) : users.length === 0 ? (
                            <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No users yet — Sync from Keycloak or Add user.</td></tr>
                        ) : (
                            users.map((u) => (
                                <UserRow
                                    key={u.id}
                                    user={u}
                                    photoV={photoV}
                                    onName={async (name) => {
                                        try {
                                            replace(await updateUser(u.id, name));
                                            setToast({ type: "success", message: "Saved" });
                                        } catch (e) {
                                            setToast({ type: "error", message: errMsg(e) });
                                        }
                                    }}
                                    onPhoto={async (file) => {
                                        try {
                                            replace(await uploadUserAvatar(u.id, file));
                                            setPhotoV((v) => v + 1);
                                            setToast({ type: "success", message: "Photo updated" });
                                        } catch (e) {
                                            setToast({ type: "error", message: errMsg(e) });
                                        }
                                    }}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {showAdd && (
                <AddUserModal
                    onClose={() => setShowAdd(false)}
                    onCreated={async (u) => {
                        setShowAdd(false);
                        setToast({ type: "success", message: `Created ${u.email}` });
                        await load();
                    }}
                    onError={(m) => setToast({ type: "error", message: m })}
                />
            )}
        </div>
    );
}

function UserRow({
    user,
    photoV,
    onName,
    onPhoto,
}: {
    user: RegistryUser;
    photoV: number;
    onName: (name: string) => Promise<void>;
    onPhoto: (file: File) => Promise<void>;
}) {
    const [name, setName] = useState(user.display_name ?? "");
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    return (
        <tr>
            <td className="px-4 py-2">
                <div className="flex items-center gap-2.5">
                    <Avatar
                        key={photoV}
                        name={user.display_name || user.email}
                        photoUrl={user.photo_key ? photoUrlById(user.id, photoV) : undefined}
                        size={32}
                    />
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={async () => {
                            if (name.trim() !== (user.display_name ?? "")) {
                                setBusy(true);
                                await onName(name.trim());
                                setBusy(false);
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        className="h-8 px-2 text-sm border border-transparent hover:border-gray-200 focus:border-indigo-400 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                    />
                </div>
            </td>
            <td className="px-4 py-2 text-gray-500">{user.email}</td>
            <td className="px-4 py-2">
                <div className="flex flex-wrap gap-1">
                    {user.groups.length ? (
                        user.groups.map((g) => (
                            <span key={g} className="px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{g}</span>
                        ))
                    ) : (
                        <span className="text-xs text-gray-400">—</span>
                    )}
                </div>
            </td>
            <td className="px-4 py-2 text-right">
                <button
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition disabled:opacity-50"
                >
                    <Upload size={13} /> Photo
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                        const f = e.currentTarget.files?.[0];
                        const input = e.currentTarget;
                        if (!f) return;
                        if (f.size > 5 * 1024 * 1024) return;
                        setBusy(true);
                        await onPhoto(f);
                        setBusy(false);
                        input.value = "";
                    }}
                />
            </td>
        </tr>
    );
}

const inputCls =
    "w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10";

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                {label}
                {required && <span className="text-red-500"> *</span>}
            </label>
            {children}
        </div>
    );
}

function AddUserModal({
    onClose,
    onCreated,
    onError,
}: {
    onClose: () => void;
    onCreated: (u: RegistryUser) => void;
    onError: (m: string) => void;
}) {
    const [form, setForm] = useState<CreateUserInput>({ email: "", firstName: "", lastName: "", group: "", initialPassword: "" });
    const [busy, setBusy] = useState(false);
    const set = (k: keyof CreateUserInput) => (e: ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = async () => {
        if (!form.email || !form.initialPassword) {
            onError("Email and initial password are required");
            return;
        }
        setBusy(true);
        try {
            onCreated(await createUser({ ...form, group: form.group || undefined }));
        } catch (e) {
            onError(errMsg(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Add user</h2>
                <div className="space-y-3">
                    <Field label="Email" required>
                        <input value={form.email} onChange={set("email")} type="email" className={inputCls} placeholder="name@inferentics.com" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="First name"><input value={form.firstName} onChange={set("firstName")} className={inputCls} /></Field>
                        <Field label="Last name"><input value={form.lastName} onChange={set("lastName")} className={inputCls} /></Field>
                    </div>
                    <Field label="Group (Keycloak path)">
                        <input value={form.group} onChange={set("group")} className={inputCls} placeholder="/operations" />
                    </Field>
                    <Field label="Initial password" required>
                        <input value={form.initialPassword} onChange={set("initialPassword")} type="text" className={inputCls} placeholder="temporary — user resets at first login" />
                    </Field>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                    Creates a Keycloak login (temporary password) and the registry record. Idempotent if the email already exists.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg text-sm transition">Cancel</button>
                    <button onClick={submit} disabled={busy} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                        {busy ? "Creating…" : "Create user"}
                    </button>
                </div>
            </div>
        </div>
    );
}
