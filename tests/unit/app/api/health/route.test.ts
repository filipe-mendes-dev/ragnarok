import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
    it("reports that the web service is healthy", async () => {
        const response = await GET();
        const body: unknown = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            status: "ok",
            service: "web",
        });
    });
});
