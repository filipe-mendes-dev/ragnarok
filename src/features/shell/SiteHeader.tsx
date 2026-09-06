import Link from "next/link";

import { SignOutButton } from "@/features/shell/SignOutButton";
import type { CurrentUser } from "@/server/auth/session";

interface SiteHeaderProps {
    user: CurrentUser | null;
}

export function SiteHeader({ user }: SiteHeaderProps) {
    return (
        <header className="border-b border-border">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
                <Link
                    className="font-mono text-sm font-semibold tracking-[0.12em]"
                    href="/"
                >
                    RAGNAROK
                </Link>

                <nav aria-label="Primary" className="flex items-center gap-4">
                    {user ? (
                        <>
                            <Link
                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                href="/documents"
                            >
                                Documents
                            </Link>
                            <SignOutButton />
                        </>
                    ) : (
                        <Link
                            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                            href="/sign-in"
                        >
                            Sign in
                        </Link>
                    )}
                </nav>
            </div>
        </header>
    );
}
