import { DocumentsView } from "@/features/documents/DocumentsView";
import { requireCurrentUser } from "@/server/auth/session";
import { database } from "@/server/db/client";
import { createDocumentRepository } from "@/server/modules/documents/document-repository";
import { createDocumentService } from "@/server/modules/documents/document-service";

const documentRepository = createDocumentRepository(database);
const documentService = createDocumentService(documentRepository);

export default async function DocumentsPage() {
    const user = await requireCurrentUser();
    const documents = await documentService.listDocuments(user.id);

    return <DocumentsView documents={documents} userEmail={user.email} />;
}
