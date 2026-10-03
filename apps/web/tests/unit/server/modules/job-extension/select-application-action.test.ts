import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { actionSelectionRequestSchema, selectApplicationAction } from "@/server/modules/job-extension/select-application-action";
import type { ActionSelectionRequest } from "@/server/modules/job-extension/select-application-action";

const input: ActionSelectionRequest = {
    pageTitle: "Engineer",
    actions: [
        { index: 9, label: "Join our team", kind: "button" },
        { index: 2, label: "Open candidate form", kind: "link" },
    ],
};

beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "private-provider-key");
    vi.stubEnv("NODE_ENV", "test");
    vi.spyOn(console, "dir").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("selectApplicationAction", () => {
    it("sends one independent yes/no question per supplied candidate in one OpenRouter request", async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "provider-response", answers: {
            action_9: { type: "noul", noul: 0.94 }, action_2: { type: "noul", noul: 0.85 },
        } }));
        vi.stubGlobal("fetch", fetcher);

        await expect(selectApplicationAction(input, new AbortController().signal, "request-1")).resolves.toEqual({ actionIndex: 9, probability: 0.94 });

        expect(fetcher).toHaveBeenCalledExactlyOnceWith("https://openrouter.ai/api/alpha/decisions", expect.objectContaining({
            method: "POST", headers: { Authorization: "Bearer private-provider-key", "Content-Type": "application/json" }, cache: "no-store", redirect: "error",
        }));
        const body = fetcher.mock.calls[0]?.[1]?.body;
        if (typeof body !== "string") throw new Error("Expected a JSON provider body.");
        expect(JSON.parse(body) as unknown).toEqual({
            model: "typesafe/jev-1.13", state: { pageTitle: "Engineer" }, questions: {
                action_9: { type: "noul", instructions: { question: expect.any(String), candidate: input.actions[0] }, criteria: { true: expect.any(String), false: expect.any(String) } },
                action_2: { type: "noul", instructions: { question: expect.any(String), candidate: input.actions[1] }, criteria: { true: expect.any(String), false: expect.any(String) } },
            },
        });
        expect(console.dir).toHaveBeenLastCalledWith(expect.objectContaining({
            requestId: "request-1", outcome: "selected", providerResponseId: "provider-response", minimumProbability: 0.8,
            scores: [{ actionIndex: 9, probability: 0.94 }, { actionIndex: 2, probability: 0.85 }],
        }), { depth: null });
    });

    it.each([
        { first: 0.9, second: 0.9, expected: { actionIndex: 2, probability: 0.9 } },
        { first: 0.8, second: 0.4, expected: { actionIndex: 9, probability: 0.8 } },
        { first: 0.79, second: 0.1, expected: { actionIndex: null, probability: 0.79 } },
        { first: 0, second: 0, expected: { actionIndex: null, probability: 0 } },
    ])("applies the probability threshold and scan-index tie-breaker", async ({ first, second, expected }) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ answers: { action_9: { type: "noul", noul: first }, action_2: { type: "noul", noul: second } } })));
        await expect(selectApplicationAction(input, new AbortController().signal, "request-1")).resolves.toEqual(expected);
    });

    it.each([
        { answers: { action_9: { type: "noul", noul: 0.9 } } },
        { answers: { action_9: { type: "noul", noul: 0.9 }, action_99: { type: "noul", noul: 0.9 } } },
        { answers: { action_9: { type: "noul", noul: 0.9 }, action_2: { type: "noul", noul: 0.9 }, action_99: { type: "noul", noul: 0.9 } } },
        { answers: { action_9: { type: "noul", noul: 1.1 }, action_2: { type: "noul", noul: 0.9 } } },
        { answers: { application_action: { type: "choice", choice: "action_9", confidence: 0.9 } } },
    ])("rejects missing, unknown, extra, and malformed provider answers", async (response) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response)));
        await expect(selectApplicationAction(input, new AbortController().signal, "request-1")).rejects.toMatchObject({ name: "ActionSelectionError", code: "invalid_response" });
    });

    it("does not call the provider without an API key", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "");
        const fetcher = vi.fn();
        vi.stubGlobal("fetch", fetcher);
        await expect(selectApplicationAction(input, new AbortController().signal, "request-1")).rejects.toMatchObject({ code: "not_configured" });
        expect(fetcher).not.toHaveBeenCalled();
    });

    it.each([
        { status: 401, code: "provider_authentication" },
        { status: 402, code: "provider_credits" },
        { status: 500, code: "unavailable" },
    ])("maps upstream HTTP $status to a useful provider error", async ({ status, code }) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: status, message: "Provider failure" } }, { status })));
        await expect(selectApplicationAction(input, new AbortController().signal, "request-1")).rejects.toMatchObject({ code });
    });

    it("rejects unreadable JSON and network failures", async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(new Response("not JSON")).mockRejectedValueOnce(new TypeError("Network failed"));
        vi.stubGlobal("fetch", fetcher);
        await expect(selectApplicationAction(input, new AbortController().signal, "request-1")).rejects.toMatchObject({ code: "invalid_response" });
        await expect(selectApplicationAction(input, new AbortController().signal, "request-2")).rejects.toMatchObject({ code: "unavailable" });
    });

    it("omits model input in production and redacts the key and supplied page text from provider errors", async () => {
        vi.stubEnv("NODE_ENV", "production");
        const message = `API key expired. private-provider-key ${input.pageTitle} ${input.actions.map((action) => action.label).join(" ")}`;
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: 401, message } }, { status: 401 })));
        await expect(selectApplicationAction(input, new AbortController().signal, "request-1")).rejects.toMatchObject({ code: "provider_authentication" });
        const logs = JSON.stringify(vi.mocked(console.dir).mock.calls);
        expect(logs).not.toContain('"outcome":"input"');
        expect(logs).not.toContain("private-provider-key");
        expect(logs).not.toContain(input.pageTitle);
        for (const action of input.actions) expect(logs).not.toContain(action.label);
        expect(logs).toContain("API key expired.");
    });
});

describe("actionSelectionRequestSchema", () => {
    it.each([
        { ...input, actions: [] },
        { ...input, actions: [input.actions[0], input.actions[0]] },
        { ...input, pageTitle: "x".repeat(301) },
        { ...input, actions: [{ index: 0, label: " ", kind: "link" }] },
        { ...input, actions: Array.from({ length: 101 }, (_, index) => ({ index, label: "Apply", kind: "link" })) },
    ])("rejects invalid or unbounded candidate inventories", (value: unknown) => {
        expect(actionSelectionRequestSchema.safeParse(value).success).toBe(false);
    });
});
