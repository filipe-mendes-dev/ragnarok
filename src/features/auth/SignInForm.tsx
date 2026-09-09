"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";

import { authClient } from "@/features/auth/auth-client";
import { AuthFeedback } from "@/features/auth/AuthFeedback";

type PendingAction = "email" | "github" | null;

export function SignInForm() {
    const router = useRouter();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<PendingAction>(null);
    const isPending = pendingAction !== null;

    async function handleEmailSignIn(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage(null);
        setPendingAction("email");

        try {
            const formData = new FormData(event.currentTarget);
            const email = String(formData.get("email"));
            const password = String(formData.get("password"));
            const { error } = await authClient.signIn.email({ email, password });

            if (error) {
                setErrorMessage(error.message ?? "Unable to sign in.");
                return;
            }

            router.push("/documents");
            router.refresh();
        } catch {
            setErrorMessage("Unable to reach the authentication service.");
        } finally {
            setPendingAction(null);
        }
    }

    async function handleGitHubSignIn() {
        setErrorMessage(null);
        setPendingAction("github");

        try {
            const { error } = await authClient.signIn.social({
                provider: "github",
                callbackURL: "/documents",
            });

            if (error) {
                setErrorMessage(error.message ?? "Unable to start GitHub sign-in.");
            }
        } catch {
            setErrorMessage("Unable to reach the authentication service.");
        } finally {
            setPendingAction(null);
        }
    }

    return (
        <div>
            <button
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-border bg-surface px-4 text-sm font-semibold transition-colors duration-150 enabled:hover:bg-surface-muted enabled:active:bg-border motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
                onClick={handleGitHubSignIn}
                type="button"
            >
                {pendingAction === "github"
                    ? "Connecting to GitHub…"
                    : "Continue with GitHub"}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or use email
                <span className="h-px flex-1 bg-border" />
            </div>

            <form aria-busy={isPending} onSubmit={handleEmailSignIn}>
                <div className="space-y-4">
                    <div className="grid gap-1.5">
                        <label className="text-sm font-medium" htmlFor="email">
                            Email
                        </label>
                        <input
                            autoComplete="email"
                            className="h-11 w-full rounded-control border border-border bg-surface px-3 text-base sm:text-sm placeholder:text-muted-foreground transition-colors enabled:hover:border-muted-foreground focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                            id="email"
                            name="email"
                            required
                            type="email"
                        />
                    </div>

                    <div className="grid gap-1.5">
                        <label className="text-sm font-medium" htmlFor="password">
                            Password
                        </label>
                        <input
                            autoComplete="current-password"
                            className="h-11 w-full rounded-control border border-border bg-surface px-3 text-base sm:text-sm placeholder:text-muted-foreground transition-colors enabled:hover:border-muted-foreground focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                            id="password"
                            name="password"
                            required
                            type="password"
                        />
                    </div>
                </div>

                <AuthFeedback message={errorMessage} />

                <button
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-accent py-2.5 px-4 text-sm font-semibold text-accent-foreground transition-colors duration-150 enabled:hover:bg-accent-hover enabled:active:bg-accent-active motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending}
                    type="submit"
                >
                    {pendingAction === "email" ? "Signing in…" : "Sign in"}
                </button>
            </form>

            <p className="mt-5 border-t border-border pt-5 text-center text-sm text-muted-foreground">
                Need an account?{" "}
                <Link className="rounded-sm font-medium text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:text-accent-hover hover:decoration-current" href="/sign-up">
                    Create one
                </Link>
            </p>
        </div>
    );
}
