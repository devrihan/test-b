"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import type { ChangeEvent } from "react";
import Avatar from "@/app/components/Avatar";
import Toast from "@/app/components/Toast";
import {
    getMe,
    updateMe,
    uploadMyAvatar,
    photoUrlById,
    errMsg,
} from "@/app/lib/registryApi";

export default function SettingsPage() {
    const queryClient = useQueryClient();
    // null = the field hasn't been edited, so the fetched name shows. Without
    // this, a refetch (e.g. on window focus) would wipe an unsaved edit.
    const [nameOverride, setName] = useState<string | null>(null);
    const [photoV, setPhotoV] = useState(1);
    const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const meQuery = useQuery({
        queryKey: keys.registry.me(),
        queryFn: getMe,
    });

    const me = meQuery.data ?? null;
    const loading = meQuery.isPending;
    const name = nameOverride ?? me?.display_name ?? "";

    // Fetch failures surface through the same toast, without an effect.
    const fetchError = meQuery.error ? errMsg(meQuery.error) : null;

    const saveMutation = useMutation({
        mutationFn: (displayName: string) => updateMe(displayName),
        onSuccess: (u) => {
            queryClient.setQueryData(keys.registry.me(), u);
            setToast({ type: "success", message: "Saved" });
        },
        onError: (e) => setToast({ type: "error", message: errMsg(e) }),
    });

    const avatarMutation = useMutation({
        mutationFn: (file: File) => uploadMyAvatar(file),
        onSuccess: (u) => {
            queryClient.setQueryData(keys.registry.me(), u);
            setPhotoV((v) => v + 1);
            setToast({ type: "success", message: "Photo updated" });
        },
        onError: (err) => setToast({ type: "error", message: errMsg(err) }),
        onSettled: () => {
            if (fileRef.current) fileRef.current.value = "";
        },
    });

    const saving = saveMutation.isPending;
    const uploading = avatarMutation.isPending;

    const saveName = () => saveMutation.mutate(name.trim());

    const onFile = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.currentTarget.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setToast({ type: "error", message: "Image must be under 5MB" });
            return;
        }
        avatarMutation.mutate(file);
    };

    if (loading) return <div className="p-8 text-gray-500">Loading…</div>;
    if (!me) return <div className="p-8 text-gray-500">No registry record found for your account.</div>;

    return (
        <div className="max-w-xl mx-auto p-8">
            {(toast || fetchError) && (
                <Toast
                    message={toast?.message ?? fetchError ?? ""}
                    type={toast?.type ?? "error"}
                    onClose={() => setToast(null)}
                />
            )}
            <h1 className="text-xl font-semibold text-gray-900 mb-6">My settings</h1>
            <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-4">
                    <Avatar
                        key={photoV}
                        name={me.display_name || me.email}
                        photoUrl={me.photo_key ? photoUrlById(me.id, photoV) : undefined}
                        size={72}
                    />
                    <div>
                        <button
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
                        >
                            {uploading ? "Uploading…" : "Change photo"}
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
                        <p className="text-xs text-gray-400 mt-1">PNG / JPG / WebP, under 5MB.</p>
                    </div>
                </div>

                <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                    />
                </div>

                <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <div className="text-sm text-gray-500">{me.email}</div>
                </div>

                <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Groups</label>
                    <div className="flex flex-wrap gap-1.5">
                        {me.groups.length ? (
                            me.groups.map((g) => (
                                <span key={g} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                                    {g}
                                </span>
                            ))
                        ) : (
                            <span className="text-sm text-gray-400">none synced</span>
                        )}
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={saveName}
                        disabled={saving || name.trim() === (me.display_name ?? "")}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}
