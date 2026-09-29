"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/features/auth/auth-client";

export function SignOutButton() {
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);

    async function handleSignOut() {
        setIsPending(true);

        try {
            await authClient.signOut();
            router.push("/");
            router.refresh();
        } finally {
            setIsPending(false);
        }
    }

    return (
        <button
            className="inline-flex min-h-11 items-center rounded-control px-2 text-sm font-medium text-muted-foreground transition-colors enabled:hover:bg-surface-muted enabled:hover:text-foreground sm:px-3 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            onClick={handleSignOut}
            type="button"
        >
            {isPending ? "Signing out…" : "Sign out"}
        </button>
    );
}
