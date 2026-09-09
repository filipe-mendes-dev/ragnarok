export function SiteFooter() {
    return (
        <footer className="border-t border-border bg-surface">
            <div className="mx-auto flex min-h-16 max-w-[76rem] flex-col justify-center gap-2 px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-8">
                <span className="font-mono font-semibold tracking-[0.12em]">RAGNAROK</span>
                <span>Grounded answers. Inspectable retrieval.</span>
            </div>
        </footer>
    );
}
