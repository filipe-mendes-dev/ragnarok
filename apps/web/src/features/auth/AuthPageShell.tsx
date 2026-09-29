import type { ReactNode } from "react";

interface AuthPageShellProps {
    children: ReactNode;
    description: string;
    title: string;
}

export function AuthPageShell({
    children,
    description,
    title,
}: AuthPageShellProps) {
    return (
        <main className="px-5 py-10 sm:px-8 sm:py-14">
            <section className="mx-auto w-full max-w-md rounded-panel border border-border bg-surface p-5 sm:p-8">
                <header className="mb-8">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                        Authentication
                    </p>
                    <h1 className="mt-4 min-h-[2lh] text-3xl sm:min-h-[1lh] font-semibold tracking-[-0.03em]">
                        {title}
                    </h1>
                    <p className="mt-2 min-h-[3lh] text-sm leading-6 sm:min-h-[2lh] text-muted-foreground">
                        {description}
                    </p>
                </header>

                {children}
            </section>
        </main>
    );
}
