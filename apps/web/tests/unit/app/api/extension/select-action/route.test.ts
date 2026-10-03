import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/modules/job-extension/select-application-action", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/server/modules/job-extension/select-application-action")>();
    return { ...actual, selectApplicationAction: vi.fn() };
});

import { OPTIONS, POST } from "@/app/api/extension/select-action/route";
import { getCurrentUser } from "@/server/auth/session";
import { ActionSelectionError, selectApplicationAction } from "@/server/modules/job-extension/select-application-action";

const extensionId = "a".repeat(32);
const extensionOrigin = `chrome-extension://${extensionId}`;
const input = { pageTitle: "Engineer", actions: [{ index: 4, label: "Join our team", kind: "button" }] };

function request(body = JSON.stringify(input), headers: Record<string, string> = {}): Request {
    return new Request("http://localhost:3000/api/extension/select-action", {
        method: "POST", body,
        headers: { "Content-Type": "application/json", Origin: extensionOrigin, "X-Ragnarok-Extension-Id": extensionId, ...headers },
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("JOB_EXTENSION_ORIGIN", extensionOrigin);
    vi.spyOn(console, "dir").mockImplementation(() => {});
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-id", email: "owner@example.com", image: null, name: "Owner" });
    vi.mocked(selectApplicationAction).mockResolvedValue({ actionIndex: 4, probability: 0.94 });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("POST /api/extension/select-action", () => {
    it("authenticates the existing web session and correlates the service call and response", async () => {
        const incoming = request();
        const response = await POST(incoming);
        const requestId = response.headers.get("X-Request-Id");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ actionIndex: 4, probability: 0.94 });
        expect(requestId).toMatch(/^[\da-f-]{36}$/);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(extensionOrigin);
        expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
        expect(selectApplicationAction).toHaveBeenCalledExactlyOnceWith(input, incoming.signal, requestId);
        expect(getCurrentUser).toHaveBeenCalledTimes(1);
    });

    it("returns a successful null decision when the provider requires manual selection", async () => {
        vi.mocked(selectApplicationAction).mockResolvedValue({ actionIndex: null, probability: 0.79 });
        const response = await POST(request());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ actionIndex: null, probability: 0.79 });
    });

    it("does not call the provider without an authenticated account", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(null);
        const response = await POST(request());
        expect(response.status).toBe(401);
        expect(response.headers.get("X-Request-Id")).toBeTruthy();
        expect(selectApplicationAction).not.toHaveBeenCalled();
    });

    it.each([
        { Origin: "https://untrusted.example.com" },
        { "X-Ragnarok-Extension-Id": "b".repeat(32) },
    ])("rejects callers that do not match the configured extension", async (headers) => {
        expect((await POST(request(undefined, headers))).status).toBe(403);
        expect(getCurrentUser).not.toHaveBeenCalled();
        expect(selectApplicationAction).not.toHaveBeenCalled();
    });

    it("reports missing extension configuration before authentication or inference", async () => {
        vi.stubEnv("JOB_EXTENSION_ORIGIN", "");
        expect((await POST(request())).status).toBe(503);
        expect(getCurrentUser).not.toHaveBeenCalled();
        expect(selectApplicationAction).not.toHaveBeenCalled();
    });

    it.each([
        { body: "{broken", headers: {}, status: 400 },
        { body: JSON.stringify({ ...input, actions: [] }), headers: {}, status: 400 },
        { body: JSON.stringify({ ...input, actions: [input.actions[0], input.actions[0]] }), headers: {}, status: 400 },
        { body: "{}", headers: { "Content-Type": "text/plain" }, status: 415 },
        { body: "x".repeat(128_001), headers: {}, status: 413 },
    ])("rejects invalid transport input with status $status", async ({ body, headers, status }) => {
        expect((await POST(request(body, headers))).status).toBe(status);
        expect(selectApplicationAction).not.toHaveBeenCalled();
    });

    it.each([
        { code: "not_configured", status: 503 },
        { code: "provider_authentication", status: 502 },
        { code: "provider_credits", status: 502 },
        { code: "invalid_response", status: 502 },
        { code: "unavailable", status: 502 },
    ] as const)("maps provider error $code to HTTP $status", async ({ code, status }) => {
        vi.mocked(selectApplicationAction).mockRejectedValue(new ActionSelectionError(code, "Useful provider explanation."));
        const response = await POST(request());
        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ errorMessage: "Useful provider explanation." });
        expect(response.headers.get("X-Request-Id")).toBeTruthy();
    });

    it("does not expose unexpected server exception messages", async () => {
        vi.mocked(getCurrentUser).mockRejectedValue(new Error("Private authentication details"));
        const response = await POST(request());
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("Private authentication details");
    });
});

describe("OPTIONS /api/extension/select-action", () => {
    it("allows only the configured extension origin and exposes the required request headers", async () => {
        const allowed = await OPTIONS(new Request("http://localhost:3000/api/extension/select-action", { method: "OPTIONS", headers: { Origin: extensionOrigin } }));
        expect(allowed.status).toBe(204);
        expect(allowed.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Ragnarok-Extension-Id");
        const rejected = await OPTIONS(new Request("http://localhost:3000/api/extension/select-action", { method: "OPTIONS", headers: { Origin: "https://untrusted.example.com" } }));
        expect(rejected.status).toBe(403);
    });
});
