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
        <main className="px-5 py-12 sm:px-8 sm:py-16">
            <section className="mx-auto w-full max-w-md">
                <header className="mb-8">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                        Authentication
                    </p>
                    <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">
                        {title}
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {description}
                    </p>
                </header>

                {children}
            </section>
        </main>
    );
}
