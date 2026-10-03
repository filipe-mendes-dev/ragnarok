import type { JobContext } from "../../../src/shared/job-context";

export const JOB_DESCRIPTION = "Build reliable software for our engineering team. Work with product and design to deliver useful features, review changes, and improve service reliability. Experience with TypeScript and relational databases is required. This role supports flexible working arrangements.";

export function makeAcceptedContext(overrides: Partial<JobContext> = {}): JobContext {
  return { jobDescription: JOB_DESCRIPTION, sourceUrl: "https://jobs.example.com/job", lastPageUrl: "https://jobs.example.com/job",
    capturedAt: "2026-10-02T10:00:00Z", ...overrides };
}
