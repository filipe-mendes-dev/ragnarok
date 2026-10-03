import { getCurrentUser } from '@/server/auth/session';
import {
    ActionSelectionError,
    actionSelectionRequestSchema,
    selectApplicationAction,
} from '@/server/modules/job-extension/select-application-action';
import type { ActionSelectionResult } from '@/server/modules/job-extension/select-application-action';

export const runtime = 'nodejs';
const MAX_REQUEST_BYTES = 128_000;

function getExtensionOrigin(): string | null {
    const origin = process.env.JOB_EXTENSION_ORIGIN?.trim();
    if (!origin || !/^chrome-extension:\/\/[a-p]{32}$/.test(origin))
        return null;
    return origin;
}

function hasTrustedExtensionCaller(
    request: Request,
    extensionOrigin: string,
): boolean {
    const origin = request.headers.get('origin');
    if (origin && origin !== extensionOrigin) return false;
    // The ID identifies the caller. The web session cookie authenticates the user.
    return (
        extensionOrigin ===
        `chrome-extension://${request.headers.get('x-ragnarok-extension-id')}`
    );
}

function responseHeaders(extensionOrigin: string): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': extensionOrigin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Expose-Headers': 'X-Request-Id',
        'Cache-Control': 'no-store',
        Vary: 'Origin',
    };
}

export async function OPTIONS(request: Request): Promise<Response> {
    const origin = getExtensionOrigin();
    if (!origin || request.headers.get('origin') !== origin)
        return new Response(null, { status: 403 });
    return new Response(null, {
        status: 204,
        headers: {
            ...responseHeaders(origin),
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers':
                'Content-Type, X-Ragnarok-Extension-Id',
        },
    });
}

export async function POST(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const started = performance.now();
    const origin = getExtensionOrigin();
    const headers: Record<string, string> = {
        ...(origin ? responseHeaders(origin) : { 'Cache-Control': 'no-store' }),
        'X-Request-Id': requestId,
    };
    function reply(
        body: ActionSelectionResult | { errorMessage: string },
        status: number,
        errorCode?: string,
        causeName?: string,
    ): Response {
        console.dir({
            event: 'extension.action_selection',
            level: status >= 400 ? 'error' : 'info',
            requestId,
            status,
            latencyMs: Math.round(performance.now() - started),
            errorCode,
            causeName,
        }, { depth: null });
        return Response.json(body, { status, headers });
    }
    if (!origin)
        return reply(
            {
                errorMessage:
                    'Set JOB_EXTENSION_ORIGIN to your installed extension origin, then restart the backend.',
            },
            503, 'not_configured',
        );
    if (!hasTrustedExtensionCaller(request, origin))
        return reply(
            {
                errorMessage:
                    'This extension is not allowed. Check JOB_EXTENSION_ORIGIN on the backend.',
            },
            403, 'forbidden',
        );
    if (!request.headers.get('content-type')?.startsWith('application/json'))
        return reply(
            { errorMessage: 'Expected a JSON request.' },
            415, 'invalid_content_type',
        );

    try {
        const user = await getCurrentUser();
        if (!user)
            return reply(
                {
                    errorMessage:
                        'Sign in to RAGnarok using the same Chrome profile.',
                },
                401, 'unauthenticated',
            );
        if (!request.body)
            return reply(
                { errorMessage: 'Expected action candidates.' },
                400, 'invalid_request',
            );

        const reader = request.body.getReader();
        const decoder = new TextDecoder();
        let bytes = 0;
        let body = '';
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                bytes += chunk.value.byteLength;
                if (bytes > MAX_REQUEST_BYTES) {
                    await reader.cancel();
                    return reply(
                        {
                            errorMessage:
                                'Action candidates exceed the request limit.',
                        },
                        413, 'request_too_large',
                    );
                }
                body += decoder.decode(chunk.value, { stream: true });
            }
            body += decoder.decode();
        } finally {
            reader.releaseLock();
        }

        let input: unknown;
        try {
            input = JSON.parse(body) as unknown;
        } catch {
            return reply(
                { errorMessage: 'Invalid JSON request.' },
                400, 'invalid_json',
            );
        }
        const parsed = actionSelectionRequestSchema.safeParse(input);
        if (!parsed.success)
            return reply(
                {
                    errorMessage:
                        parsed.error.issues[0]?.message ??
                        'Invalid action candidates.',
                },
                400, 'invalid_request',
            );

        const result = await selectApplicationAction(
            parsed.data,
            request.signal,
            requestId,
        );
        return reply(result, 200);
    } catch (error: unknown) {
        if (error instanceof ActionSelectionError) {
            return reply(
                { errorMessage: error.message },
                error.code === 'not_configured' ? 503 : 502,
                error.code,
            );
        }
        return reply(
            {
                errorMessage:
                    'The backend could not select an action. Check its authentication and provider configuration.',
            },
            503, 'unexpected', error instanceof Error ? error.name : typeof error,
        );
    }
}
