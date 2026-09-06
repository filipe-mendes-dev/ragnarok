import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/server/auth/auth";

export interface CurrentUser {
    id: string;
    email: string;
    image: string | null;
    name: string;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
    const result = await auth.api.getSession({
        headers: await headers(),
    });

    if (!result) {
        return null;
    }

    return {
        id: result.user.id,
        email: result.user.email,
        image: result.user.image ?? null,
        name: result.user.name,
    };
});

export const requireCurrentUser = cache(async (): Promise<CurrentUser> => {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/sign-in");
    }

    return user;
});
