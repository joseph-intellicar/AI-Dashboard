/**
 * One chat turn (REQUIREMENTS §17.3): call the model, run the tools it asks for, feed the results back,
 * repeat up to `maxRounds`. Everything the browser sees goes through `emit`.
 */
import type { AiEvent, AiSource } from '@insightflow/shared';
import type { ChatMessage, ChatModel, ToolCall, ToolDef } from './model';
import {
  executeClarify,
  executePropose,
  executeQuery,
  toolStatus,
  type ToolContext,
  type ToolOutcome,
  type ToolState,
} from './tools';

export const MAX_TOOL_ROUNDS = 6;
/** Retries allowed after an invalid proposal (so 3 attempts in total). */
export const MAX_PROPOSAL_RETRIES = 2;

export interface TurnInput {
  model: ChatModel;
  system: string;
  history: ChatMessage[];
  tools: ToolDef[];
  toolCtx: ToolContext;
  state: ToolState;
  emit: (event: AiEvent) => void;
  signal?: AbortSignal;
  maxRounds?: number;
}

export interface TurnSummary {
  rounds: number;
  toolCalls: string[];
  usage: { model: string; inputTokens: number; outputTokens: number } | null;
  aborted: boolean;
}

async function runTool(call: ToolCall, input: TurnInput): Promise<ToolOutcome> {
  switch (call.name) {
    case 'propose_visualization':
      return executePropose(call, input.toolCtx, input.state);
    case 'query_data':
      return executeQuery(call, input.toolCtx);
    case 'ask_clarification':
      return executeClarify(call);
    default:
      return { result: `ERROR: unknown tool "${call.name}". Use only the tools provided.`, events: [] };
  }
}

export async function runTurn(input: TurnInput): Promise<TurnSummary> {
  const { model, emit, signal } = input;
  const maxRounds = input.maxRounds ?? MAX_TOOL_ROUNDS;
  const messages: ChatMessage[] = [{ role: 'system', content: input.system }, ...input.history];
  const usage = (): TurnSummary['usage'] => (tokens.model ? { ...tokens } : null);
  const sources: AiSource[] = [];
  const toolCalls: string[] = [];
  const tokens = { model: '', inputTokens: 0, outputTokens: 0 };
  let invalidProposals = 0;
  let wroteText = false;
  let rounds = 0;
  let finished = false;

  while (rounds < maxRounds) {
    rounds += 1;
    let text = '';
    let calls: ToolCall[] = [];
    for await (const event of model.stream({ messages, tools: input.tools, signal })) {
      if (event.type === 'text') {
        // Separate text written before and after tool calls.
        if (!text && wroteText) emit({ type: 'text', delta: '\n\n' });
        text += event.delta;
        emit({ type: 'text', delta: event.delta });
      } else if (event.type === 'tool_calls') {
        calls = event.calls;
      } else {
        tokens.model = event.model;
        tokens.inputTokens += event.inputTokens;
        tokens.outputTokens += event.outputTokens;
      }
    }
    if (signal?.aborted) return { rounds, toolCalls, usage: usage(), aborted: true };
    if (text) wroteText = true;
    if (calls.length === 0) {
      finished = true;
      break;
    }

    messages.push({
      role: 'assistant',
      content: text || null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.arguments },
      })),
    });
    let endTurn = false;
    // Calls in one round are independent (e.g. several breakdowns for a "why" question): run them together.
    const statuses = [...new Set(calls.map(toolStatus).filter((s): s is string => s !== null))];
    if (statuses.length)
      emit({
        type: 'status',
        text:
          statuses.length > 2 ? `Checking ${statuses.length} breakdowns of the data…` : statuses.join(' · '),
      });
    const outcomes = await Promise.all(calls.map((call) => runTool(call, input)));
    if (signal?.aborted) return { rounds, toolCalls, usage: usage(), aborted: true };
    for (const [i, call] of calls.entries()) {
      const outcome = outcomes[i]!;
      toolCalls.push(call.name);
      outcome.events.forEach(emit);
      if (outcome.source) sources.push(outcome.source);
      let result = outcome.result;
      if (outcome.invalidProposal && ++invalidProposals > MAX_PROPOSAL_RETRIES) {
        result +=
          '\nDo NOT try again. Tell the user briefly that you could not build that and suggest something close.';
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      endTurn ||= Boolean(outcome.endTurn);
    }
    if (endTurn) {
      finished = true;
      break;
    }
  }

  if (!finished) {
    emit({
      type: 'text',
      delta: `${wroteText ? '\n\n' : ''}I couldn't finish that one. Try asking in a simpler way, for example one measure and one breakdown.`,
    });
  }
  if (sources.length) emit({ type: 'sources', sources });
  emit({ type: 'done', usage: usage() ?? undefined });
  return { rounds, toolCalls, usage: usage(), aborted: false };
}
