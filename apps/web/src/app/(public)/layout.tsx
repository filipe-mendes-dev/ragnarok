import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/server/auth/session";

interface PublicAuthLayoutProps {
    children: ReactNode;
}

export default async function PublicAuthLayout({
    children,
}: PublicAuthLayoutProps) {
    const user = await getCurrentUser();

    if (user) {
        redirect("/documents");
    }

    return children;
}
