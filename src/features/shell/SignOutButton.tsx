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
            className="text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            onClick={handleSignOut}
            type="button"
        >
            {isPending ? "Signing out…" : "Sign out"}
        </button>
    );
}
