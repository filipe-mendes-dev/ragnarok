import { NewDocumentView } from "@/features/documents/NewDocumentView";
import { getServerEnvironment } from "@/server/config/env";

import {
    completePdfUploadAction,
    createTextDocumentAction,
    startPdfUploadAction,
} from "../actions";

export default function NewDocumentPage() {
    const maximumPdfSizeBytes =
        getServerEnvironment().PDF_MAX_UPLOAD_SIZE_BYTES;

    return (
        <NewDocumentView
            completePdfUploadAction={completePdfUploadAction}
            createTextDocumentAction={createTextDocumentAction}
            maximumPdfSizeBytes={maximumPdfSizeBytes}
            startPdfUploadAction={startPdfUploadAction}
        />
    );
}
