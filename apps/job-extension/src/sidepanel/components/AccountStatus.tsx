import { useEffect, useState, type ReactElement } from "react";
import { APP_URL } from "../../config";
import { isRecord } from "../../shared/value-guards";

interface AccountStatusState {
  status: "loading" | "ready" | "unavailable";
  name: string | null;
}

export function AccountStatus(): ReactElement {
  const [account, setAccount] = useState<AccountStatusState>({ status: "loading", name: null });

  useEffect(() => {
    let pending: AbortController | null = null;

    async function refreshAccount(): Promise<void> {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      setAccount({ status: "loading", name: null });
      try {
        const response = await fetch(`${APP_URL}/api/auth/get-session`, {
          credentials: "include",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]),
        });
        if (!response.ok) throw new Error("Could not check the account session.");
        const result: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (result === null) {
          setAccount({ status: "ready", name: null });
          return;
        }
        if (!isRecord(result) || !isRecord(result.user) || typeof result.user.name !== "string") {
          throw new Error("Invalid account session response.");
        }
        setAccount({ status: "ready", name: result.user.name });
      } catch {
        if (controller.signal.aborted) return;
        setAccount({ status: "unavailable", name: null });
      }
    }

    function handleRefresh(): void { void refreshAccount(); }
    handleRefresh();
    chrome.tabs.onActivated.addListener(handleRefresh);
    window.addEventListener("focus", handleRefresh);
    return () => {
      pending?.abort();
      chrome.tabs.onActivated.removeListener(handleRefresh);
      window.removeEventListener("focus", handleRefresh);
    };
  }, []);

  if (account.status === "loading") return <p role="status">Checking RAGnarok sign-in...</p>;
  if (account.status === "unavailable") return <p role="status">Could not check your sign-in. <a href={APP_URL} target="_blank" rel="noreferrer">Open RAGnarok</a> and return to this tab to retry.</p>;
  if (account.name !== null) return <p role="status">Signed in as <strong>{account.name}</strong>.</p>;
  return <p><a href={`${APP_URL}/sign-in`} target="_blank" rel="noreferrer">Sign in to RAGnarok</a> to use automatic action selection with your existing account.</p>;
}

