import Link from "next/link";

import { SignOutButton } from "@/features/shell/SignOutButton";
import type { CurrentUser } from "@/server/auth/session";

interface SiteHeaderProps {
    user: CurrentUser | null;
}

export function SiteHeader({ user }: SiteHeaderProps) {
    return (
        <header className="border-b border-border bg-surface">
            <div className="mx-auto flex min-h-16 flex-wrap py-2 max-w-[76rem] items-center justify-between gap-x-2 gap-y-1 px-5 sm:px-8">
                <Link
                    className="inline-flex min-h-11 shrink-0 items-center rounded-control font-mono text-sm font-semibold tracking-[0.12em] transition-colors hover:text-accent"
                    href="/"
                >
                    RAGNAROK
                </Link>

                <nav aria-label="Primary" className="flex flex-wrap items-center gap-1">
                    {user ? (
                        <>
                            <Link
                                className="inline-flex min-h-11 items-center rounded-control px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground sm:px-3"
                                href="/documents"
                            >
                                Documents
                            </Link>
                            <SignOutButton />
                        </>
                    ) : (
                        <Link
                            className="inline-flex min-h-11 items-center rounded-control px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground sm:px-3"
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
