import type { ReactNode } from "react";

import { requireCurrentUser } from "@/server/auth/session";

interface AuthenticatedLayoutProps {
    children: ReactNode;
}

export default async function AuthenticatedLayout({
    children,
}: AuthenticatedLayoutProps) {
    await requireCurrentUser();

    return children;
}
