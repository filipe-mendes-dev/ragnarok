import "server-only";

import { database } from "@/server/db/client";
import { createOpenRouterTextGenerator } from "@/server/llm/openrouter-text-generator";
import { createGenerationService } from "@/server/modules/generation/generation-service";
import { createRetrievalService } from "@/server/modules/retrieval/retrieval-service";
import { createChatService } from "./chat-service";

export const retrievalService = createRetrievalService(database);
const generationService = createGenerationService(createOpenRouterTextGenerator());

export const chatService = createChatService(database, {
    retrieval: retrievalService,
    generation: generationService,
});
