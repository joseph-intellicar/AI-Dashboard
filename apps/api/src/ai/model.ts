/**
 * The chat model behind Insight AI (REQUIREMENTS §17.2). xAI's API is OpenAI-compatible, so the `openai`
 * SDK is used with xAI's base URL. Everything above this file only sees the small `ChatModel` interface,
 * which tests replace with a scripted fake.
 */
import type { Env } from '@insightflow/db';
import OpenAI from 'openai';

export const XAI_BASE_URL = 'https://api.x.ai/v1';

export type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  /** JSON text as produced by the model (may be invalid JSON). */
  arguments: string;
}

export type ModelEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_calls'; calls: ToolCall[] }
  | { type: 'usage'; model: string; inputTokens: number; outputTokens: number };

export interface ChatRequest {
  messages: ChatMessage[];
  tools: ToolDef[];
  signal?: AbortSignal;
}

export interface ChatModel {
  readonly name: string;
  stream(request: ChatRequest): AsyncGenerator<ModelEvent>;
}

/** A failed model call. `fallback` = worth retrying with another model. */
export class ModelError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'rate_limited' | 'unavailable' | 'rejected' | 'aborted',
    readonly status?: number,
  ) {
    super(message);
  }
  get fallback(): boolean {
    return this.kind === 'timeout' || this.kind === 'unavailable';
  }
}

/** Maps SDK/network errors onto ModelError without leaking request details (headers hold the key). */
export function toModelError(err: unknown, timedOut: boolean, aborted: boolean): ModelError {
  if (err instanceof ModelError) return err;
  if (aborted) return new ModelError('Request was stopped', 'aborted');
  if (timedOut || err instanceof OpenAI.APIConnectionTimeoutError)
    return new ModelError('The AI took too long to respond', 'timeout');
  if (err instanceof OpenAI.APIError && typeof err.status === 'number') {
    const status = err.status;
    if (status === 429) return new ModelError('The AI is busy right now', 'rate_limited', status);
    // 404 = unknown/retired model; 5xx = provider trouble. Both are worth trying the fallback model.
    if (status === 404 || status >= 500)
      return new ModelError(`AI provider error (${status})`, 'unavailable', status);
    return new ModelError(`AI request rejected (${status})`, 'rejected', status);
  }
  return new ModelError('Could not reach the AI provider', 'unavailable');
}

/** Collects streamed tool-call fragments (they arrive split across chunks, keyed by index). */
export class ToolCallAssembler {
  private parts = new Map<number, ToolCall>();

  add(delta: { index: number; id?: string; function?: { name?: string; arguments?: string } }) {
    const current = this.parts.get(delta.index) ?? { id: '', name: '', arguments: '' };
    if (delta.id) current.id = delta.id;
    if (delta.function?.name) current.name += delta.function.name;
    if (delta.function?.arguments) current.arguments += delta.function.arguments;
    this.parts.set(delta.index, current);
  }

  calls(): ToolCall[] {
    return [...this.parts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, c]) => ({ ...c, id: c.id || `call_${i}` }))
      .filter((c) => c.name);
  }
}

export type ReasoningEffort = 'low' | 'medium' | 'high';

export function createXaiModel({
  apiKey,
  model,
  timeoutMs,
  reasoningEffort,
}: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Grok reasoning models think less (and answer faster) with "low". */
  reasoningEffort?: ReasoningEffort;
}): ChatModel {
  const client = new OpenAI({ apiKey, baseURL: XAI_BASE_URL, maxRetries: 0 });

  return {
    name: model,
    async *stream({ messages, tools, signal }) {
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const assembler = new ToolCallAssembler();
      try {
        const stream = await client.chat.completions.create(
          {
            model,
            messages,
            stream: true,
            stream_options: { include_usage: true },
            ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
            ...(tools.length
              ? {
                  tools: tools.map((t) => ({ type: 'function' as const, function: t })),
                  tool_choice: 'auto' as const,
                }
              : {}),
          },
          { signal: combined },
        );
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) yield { type: 'text', delta: delta.content };
          for (const call of delta?.tool_calls ?? []) assembler.add(call);
          if (chunk.usage) {
            yield {
              type: 'usage',
              model,
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
            };
          }
        }
      } catch (err) {
        throw toModelError(err, timeout.aborted, Boolean(signal?.aborted));
      }
      // An abort can end the stream without an exception; never treat a cut-off reply as complete.
      if (combined.aborted) throw toModelError(null, timeout.aborted, Boolean(signal?.aborted));
      const calls = assembler.calls();
      if (calls.length) yield { type: 'tool_calls', calls };
    },
  };
}

/**
 * Uses `fallback` once when `primary` fails before producing any output (REQUIREMENTS §17.2).
 * Errors after output has been streamed, rate limits and rejected requests are passed through.
 */
export function withFallback(primary: ChatModel, fallback: ChatModel | null): ChatModel {
  if (!fallback) return primary;
  return {
    name: primary.name,
    async *stream(request) {
      let produced = false;
      try {
        for await (const event of primary.stream(request)) {
          produced = true;
          yield event;
        }
        return;
      } catch (err) {
        const error = toModelError(err, false, Boolean(request.signal?.aborted));
        if (produced || !error.fallback || request.signal?.aborted) throw error;
      }
      yield* fallback.stream(request);
    },
  };
}

/** The configured model, or null when no API key is set ("not configured"). */
export function modelFromEnv(env: Env): ChatModel | null {
  if (!env.XAPI_KEY) return null;
  const make = (model: string) =>
    createXaiModel({
      apiKey: env.XAPI_KEY!,
      model,
      timeoutMs: env.AI_TIMEOUT_MS,
      reasoningEffort: env.AI_REASONING_EFFORT === 'default' ? undefined : env.AI_REASONING_EFFORT,
    });
  const fallback =
    env.AI_FALLBACK_MODEL && env.AI_FALLBACK_MODEL !== 'none' && env.AI_FALLBACK_MODEL !== env.AI_MODEL
      ? make(env.AI_FALLBACK_MODEL)
      : null;
  return withFallback(make(env.AI_MODEL), fallback);
}
