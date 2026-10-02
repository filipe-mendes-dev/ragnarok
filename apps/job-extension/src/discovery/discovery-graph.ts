import {
    Annotation,
    END,
    MemorySaver,
    START,
    StateGraph,
} from '@langchain/langgraph/web';
import {
    chooseApplicationAction,
    isEligibleNavigationAction,
    isScanIncomplete,
    normalizeExpression,
    pageFingerprint,
} from '../shared/discovery-rules';
import { assessApplicationForm, getMissingFormSignals } from '../shared/form-discovery';
import {
    hasChangedOrigin,
    hasLearnablePreviousAction,
    hasPageScan,
    hasResolvedJobContext,
    hasRecognizedSelectedAction,
    hasSelectedAction,
} from './guards';
import {
    routeAfterActionSelection,
    routeAfterContextAcquisition,
    routeAfterContextDecision,
    routeAfterAssessment,
    routeAfterClick,
    routeAfterManualSelection,
    routeAfterPageWait,
    routeAfterScan,
} from './routes';
import type { DiscoveryPort, DiscoverySession } from './session';

export const MAX_DISCOVERY_CLICKS = 5;
const DiscoveryState = Annotation.Root({
    session: Annotation<DiscoverySession>(),
});

interface GraphState {
    session: DiscoverySession;
}

function stopped(
    session: DiscoverySession,
    stage: string,
    message: string,
): GraphState {
    return { session: { ...session, status: 'stopped', stage, message } };
}

function errorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : 'Unexpected browser operation failure.';
}

export function createDiscoveryGraph(port: DiscoveryPort) {
    async function acquireJobContext({ session }: GraphState): Promise<GraphState> {
        try {
            const context = await port.readContext();
            if (!context) {
                await port.clearContext();
                return {
                    session: {
                        ...session,
                        context: null,
                        contextSkipped: false,
                        contextResponse: null,
                        pauseReason: 'context',
                        status: 'paused',
                        stage: 'context',
                        message: 'No visible job text was found. Retry or continue without context.',
                    },
                };
            }

            await port.saveContext(context);

            return {
                session: {
                    ...session,
                    context,
                    contextSkipped: false,
                    contextResponse: null,
                    pauseReason: null,
                    status: 'running',
                    stage: 'context',
                    message: 'Captured job text. Continuing to application-form discovery.',
                },
            };
        } catch (error: unknown) {
            return stopped(session, 'context', errorMessage(error));
        }
    }

    function contextDecision({ session }: GraphState): GraphState {
        if (session.contextResponse === 'retry') {
            return {
                session: {
                    ...session,
                    status: 'running',
                    pauseReason: null,
                    contextSkipped: false,
                    contextResponse: null,
                    stage: 'context-decision',
                    message: 'Retrying job context acquisition on the current page.',
                },
            };
        }
        if (session.contextResponse === 'skip') {
            return {
                session: {
                    ...session,
                    status: 'running',
                    pauseReason: null,
                    contextSkipped: true,
                    contextResponse: null,
                    context: null,
                    stage: 'context-decision',
                    message: 'Continuing without job context by explicit choice.',
                },
            };
        }
        return stopped(session, 'context-decision', 'Discovery cancelled.');
    }

    async function scanPage({ session }: GraphState): Promise<GraphState> {
        if (!hasResolvedJobContext(session))
            return stopped(session, 'scan', 'Acquire job context or explicitly skip it before navigation.');
        try {
            const scan = await port.scan();
            if (hasChangedOrigin(session, scan))
                return stopped(
                    session,
                    'scan',
                    'Navigation changed origin. Open the extension on the new page and start discovery there.',
                );
            if (!hasPageScan(session) && session.context && session.context.lastPageUrl !== scan.pageUrl)
                return stopped(session, 'scan', 'The page changed after context acquisition. Start discovery again on this page.');
            const context = session.context ? { ...session.context, lastPageUrl: scan.pageUrl } : null;
            if (context) await port.saveContext(context);
            return {
                session: {
                    ...session,
                    scan,
                    context,
                    status: 'running',
                    stage: 'scan',
                    message: `Scanned ${scan.fields.length} fields and ${scan.actions.length} actions.`,
                },
            };
        } catch (error: unknown) {
            return stopped(session, 'scan', errorMessage(error));
        }
    }

    function assessForm({ session }: GraphState): GraphState {
        if (!hasPageScan(session))
            return stopped(session, 'assess', 'No page scan is available.');
        const assessment = assessApplicationForm(session.scan);
        if (assessment.outcome === 'found')
            return {
                session: {
                    ...session,
                    assessment,
                    status: 'found',
                    stage: 'assess',
                    message:
                        'Application form found: name, email, and file input in one area.',
                },
            };
        if (isScanIncomplete(session.scan))
            return stopped(
                { ...session, assessment },
                'assess',
                'The scan is incomplete. Review this page manually.',
            );
        if (assessment.outcome === 'ambiguous')
            return stopped(
                { ...session, assessment },
                'assess',
                'Multiple application form areas match. Review the page before continuing.',
            );
        if (session.clicks >= MAX_DISCOVERY_CLICKS)
            return stopped(
                { ...session, assessment },
                'assess',
                'Discovery reached its five-click limit.',
            );
        const fingerprint = pageFingerprint(session.scan);
        if (session.visited.includes(fingerprint))
            return stopped(
                { ...session, assessment },
                'assess',
                'Discovery returned to an already visited page state.',
            );
        return {
            session: {
                ...session,
                assessment,
                visited: [...session.visited, fingerprint],
                stage: 'assess',
                message: assessment.outcome === 'partial'
                    ? `Partial form area: missing ${getMissingFormSignals(assessment).join(', ')}. Looking for an application-opening action.`
                    : 'No application form found. Looking for an application-opening action.',
            },
        };
    }

    function chooseAction({ session }: GraphState): GraphState {
        if (!hasPageScan(session))
            return stopped(session, 'choose', 'No page scan is available.');
        const choice = chooseApplicationAction(session.scan, session.learned);
        if (choice.candidates.length === 0)
            return stopped(
                session,
                'choose',
                'No eligible navigation actions found. The form may be in an unsupported frame or require manual navigation.',
            );
        const updated: DiscoverySession = {
            ...session,
            selectedAction: choice.action,
            selectionSource: choice.source,
            candidates: choice.candidates,
            manualResponse: null,
            stage: 'choose',
        };
        if (!choice.action)
            return {
                session: {
                    ...updated,
                    status: 'paused',
                    pauseReason: 'action',
                    message: 'No unique keyword match. Choose an action to resume the graph.',
                },
            };
        return {
            session: {
                ...updated,
                status: 'running',
                pauseReason: null,
                message: `Selected '${choice.action.label}' using ${choice.source} matching.`,
            },
        };
    }

    function manualSelection({ session }: GraphState): GraphState {
        // A static breakpoint pauses before this node. Resume supplies an explicit state update.
        const response: unknown = session.manualResponse;
        if (response === null)
            return stopped(session, 'manual', 'Discovery cancelled.');
        if (typeof response !== 'number')
            return stopped(session, 'manual', 'Invalid action selection.');
        if (!Number.isInteger(response))
            return stopped(session, 'manual', 'Invalid action selection.');
        const action = session.candidates.find(
            (candidate) => candidate.index === response,
        );
        if (!action)
            return stopped(
                session,
                'manual',
                'The selected action is not an eligible navigation candidate.',
            );
        if (!isEligibleNavigationAction(action))
            return stopped(
                session,
                'manual',
                'The selected action is not an eligible navigation candidate.',
            );
        return {
            session: {
                ...session,
                selectedAction: action,
                selectionSource: 'manual',
                status: 'running',
                pauseReason: null,
                stage: 'manual',
                message: `Selected '${action.label}' manually.`,
            },
        };
    }

    async function clickAction({ session }: GraphState): Promise<GraphState> {
        if (!hasResolvedJobContext(session))
            return stopped(session, 'click', 'Job context has not been acquired or skipped.');
        if (!hasPageScan(session))
            return stopped(session, 'click', 'No eligible action selected.');
        if (!hasSelectedAction(session))
            return stopped(session, 'click', 'No eligible action selected.');
        if (!isEligibleNavigationAction(session.selectedAction))
            return stopped(session, 'click', 'No eligible action selected.');
        try {
            await port.click(session.scan, session.selectedAction);
            const label = normalizeExpression(
                session.selectedAction.label ?? '',
            );
            return {
                session: {
                    ...session,
                    clicks: session.clicks + 1,
                    previousOrigin: session.scan.pageOrigin,
                    previousLabel: label,
                    learnPrevious: session.selectionSource === 'manual',
                    stage: 'click',
                    message: `Clicked '${session.selectedAction.label}'. Waiting for the page to change.`,
                },
            };
        } catch (error: unknown) {
            return stopped(session, 'click', errorMessage(error));
        }
    }

    async function waitForPage({ session }: GraphState): Promise<GraphState> {
        if (!hasPageScan(session))
            return stopped(session, 'wait', 'No previous scan is available.');
        try {
            await port.waitForChange(session.scan);
            return {
                session: {
                    ...session,
                    stage: 'wait',
                    message: 'Page changed. Scanning the resulting state.',
                },
            };
        } catch (error: unknown) {
            return stopped(session, 'wait', errorMessage(error));
        }
    }

    async function recordSuccess({ session }: GraphState): Promise<GraphState> {
        if (!hasLearnablePreviousAction(session)) return { session };
        // Credit only the immediately preceding transition that revealed the form.
        const action = {
            origin: session.previousOrigin,
            label: session.previousLabel,
        };
        if (hasRecognizedSelectedAction(session)) return { session };
        try {
            await port.learnAction(action);
            return {
                session: {
                    ...session,
                    learned: [...session.learned, action],
                    stage: 'learn',
                    message: `${session.message} Learned '${action.label}' for ${action.origin}.`,
                },
            };
        } catch (error: unknown) {
            return {
                session: {
                    ...session,
                    stage: 'learn',
                    message: `${session.message} Could not save the learned label: ${errorMessage(error)}`,
                },
            };
        }
    }

    // Edges own orchestration. Nodes remain ordinary, independently testable functions.
    return new StateGraph(DiscoveryState)
        .addNode('acquireContext', acquireJobContext)
        .addNode('contextDecision', contextDecision)
        .addNode('scan', scanPage)
        .addNode('assess', assessForm)
        .addNode('choose', chooseAction)
        .addNode('manual', manualSelection)
        .addNode('click', clickAction)
        .addNode('wait', waitForPage)
        .addNode('learn', recordSuccess)
        .addEdge(START, 'acquireContext')
        .addConditionalEdges(
            'acquireContext',
            routeAfterContextAcquisition,
            [END, 'scan', 'contextDecision'],
        )
        .addConditionalEdges(
            'contextDecision',
            routeAfterContextDecision,
            [END, 'scan', 'acquireContext'],
        )
        .addConditionalEdges(
            'scan',
            routeAfterScan,
            [END, 'assess'],
        )
        .addConditionalEdges(
            'assess',
            routeAfterAssessment,
            ['learn', END, 'choose'],
        )
        .addConditionalEdges(
            'choose',
            routeAfterActionSelection,
            [END, 'click', 'manual'],
        )
        .addConditionalEdges(
            'manual',
            routeAfterManualSelection,
            [END, 'click'],
        )
        .addConditionalEdges(
            'click',
            routeAfterClick,
            [END, 'wait'],
        )
        .addConditionalEdges(
            'wait',
            routeAfterPageWait,
            [END, 'scan'],
        )
        .addEdge('learn', END)
        .compile({
            checkpointer: new MemorySaver(),
            interruptBefore: ['contextDecision', 'manual'],
        });
}
