"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDocumentAction } from "@/app/(authenticated)/documents/actions";
interface RemoveDocumentButtonProps { id: string; title: string; deleting: boolean }
export function RemoveDocumentButton({ id, title, deleting }: RemoveDocumentButtonProps) {
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const router = useRouter();
    function remove() {
        if (!deleting && !window.confirm(`Remove "${title}" and its stored content permanently?`)) return;
        startTransition(async () => {
            try {
                const result = await deleteDocumentAction(id);
                setError(result.errorMessage);
                router.refresh();
            } catch { setError("Could not remove this document. Please retry."); }
        });
    }
    return <div className="min-w-0 max-w-64"><button type="button" disabled={pending} onClick={remove} aria-label={`${deleting ? "Retry removal of" : "Remove"} ${title}`} className="min-h-11 rounded-control border border-border px-3 text-sm hover:bg-surface-muted disabled:opacity-50">{pending ? "Removing…" : deleting ? "Retry removal" : "Remove"}</button>{error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}</div>;
}
