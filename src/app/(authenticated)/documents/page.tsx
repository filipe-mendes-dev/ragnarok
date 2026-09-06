import { requireCurrentUser } from "@/server/auth/session";

export default async function DocumentsPage() {
    const user = await requireCurrentUser();

    return (
        <main className="px-5 py-12 sm:px-8 sm:py-16">
            <section className="mx-auto max-w-6xl">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                    Private workspace
                </p>
                <div className="mt-4 flex flex-col justify-between gap-4 border-b border-border pb-8 sm:flex-row sm:items-end">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-[-0.03em]">
                            Documents
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Signed in as {user.email}
                        </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Upload and ingestion are the next implementation stage.
                    </p>
                </div>

                <div className="py-16 text-center">
                    <h2 className="text-lg font-semibold">No documents yet</h2>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                        The authenticated boundary is ready. The next feature will add
                        PDF upload and text submission here.
                    </p>
                </div>
            </section>
        </main>
    );
}
