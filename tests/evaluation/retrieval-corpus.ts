export interface EvaluationDocument {
    key: string;
    title: string;
    passages: string[];
}
export interface EvaluationQuestion {
    question: string;
    expectedSources: string[];
}

// Synthetic, non-private sources. Passage boundaries are fixed for this ranking baseline.
export const evaluationDocuments: EvaluationDocument[] = [
    { key: "billing", title: "Subscription billing", passages: [
        "Annual subscriptions can be cancelled at any time. Cancellation stops the next renewal; access continues until the paid annual term ends. Annual subscriptions are not refunded after the first fourteen days.",
        "Monthly subscriptions renew on the same day each month. A failed payment is retried after three days. Accounts become read-only after seven days without a successful payment.",
    ] },
    { key: "refunds", title: "Refund requests", passages: [
        "A first-time annual subscriber may request a full refund within fourteen days of purchase. Send the invoice number to the billing team. Refunds are returned to the original payment method within five business days.",
        "Duplicate charges qualify for a refund regardless of subscription age. The customer must provide both transaction identifiers. A cancellation alone does not submit a refund request.",
    ] },
    { key: "security", title: "Account security", passages: [
        "After five unsuccessful password attempts, sign-in is temporarily locked for fifteen minutes. Resetting the password ends the lock. Support never asks customers to send their password by email.",
        "A lost two-factor authentication device can be replaced using a saved recovery code. Each recovery code works once. Without a recovery code, the customer must complete identity verification with support.",
    ] },
    { key: "exports", title: "Data exports", passages: [
        "Workspace owners can export their records as CSV from Settings, Data, Export. The export includes active records and their creation timestamps. Attachments are downloaded separately.",
        "Export links expire after twenty-four hours. Generating a new export invalidates the previous link. Large exports run in the background and send a notification when ready.",
    ] },
    { key: "retention", title: "Deletion and retention", passages: [
        "Deleted projects remain recoverable for thirty days. Workspace owners can restore a project from the trash during that period. After thirty days the project is permanently removed.",
        "Closing an account schedules all workspace data for deletion after thirty days. Billing invoices are retained for seven years to meet accounting requirements.",
    ] },
    { key: "api", title: "API operations", passages: [
        "The public API permits sixty requests per minute per API key. When the limit is exceeded, the server returns HTTP 429 and a Retry-After header indicating how many seconds to wait.",
        "Error code RAG-204 means the document has not completed indexing. Poll the document status before retrying a search. Error code RAG-409 means a newer source revision replaced the requested revision.",
    ] },
    { key: "uploads", title: "Document uploads", passages: [
        "Uploads accept text-based PDF files up to ten megabytes. Encrypted PDFs and scanned documents without selectable text are rejected. Optical character recognition is not available.",
        "A failed upload can be submitted again after correcting the file. A document that is still processing cannot participate in search. Only completed documents appear in retrieval results.",
    ] },
    { key: "support", title: "Support availability", passages: [
        "Standard support operates Monday through Friday from 09:00 to 17:00 UTC. The target first response time is one business day. Public holidays are excluded.",
        "Critical service outages can be reported to the emergency hotline at any time. The on-call engineer acknowledges a critical outage within thirty minutes. Billing questions are handled during standard support hours.",
    ] },
];

export const evaluationQuestions: EvaluationQuestion[] = [
    { question: "If I cancel an annual plan, when do I lose access?", expectedSources: ["billing"] },
    { question: "Can a new annual customer get their money back, and how long does payment take?", expectedSources: ["refunds"] },
    { question: "I was charged twice. Can I ask for a refund after the first month?", expectedSources: ["refunds"] },
    { question: "How long am I locked out after entering the wrong password five times?", expectedSources: ["security"] },
    { question: "What can I do if I lose my two-factor authentication device?", expectedSources: ["security"] },
    { question: "How do I download records as CSV, and when does the download link expire?", expectedSources: ["exports"] },
    { question: "Can I restore a project that I deleted two weeks ago?", expectedSources: ["retention"] },
    { question: "What should my client do after receiving HTTP 429?", expectedSources: ["api"] },
    { question: "What does RAG-204 mean?", expectedSources: ["api"] },
    { question: "Can I upload a scanned PDF without selectable text?", expectedSources: ["uploads"] },
    { question: "When can I contact standard support, and what happens for an overnight critical outage?", expectedSources: ["support"] },
    { question: "What is the cancellation policy, and how long are invoices kept after account closure?", expectedSources: ["billing", "retention"] },
    { question: "Does the service offer a student discount?", expectedSources: [] },
];
