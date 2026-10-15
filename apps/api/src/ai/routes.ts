/**
 * Insight AI endpoints (REQUIREMENTS §17.3, §17.12). The browser only ever talks to these; the xAI key
 * stays on the server. Replies stream as Server-Sent Events.
 */
import type { DB } from '@insightflow/db';
import {
  AI_MAX_MESSAGE_CHARS,
  AiChatRequestSchema,
  DateFilterSchema,
  WidgetConfigSchema,
  type AiEvent,
  type QueryResult,
  type WidgetConfig,
} from '@insightflow/shared';
import type { FastifyInstance } from 'fastify';
import { requireUser, userId } from '../auth/requireUser';
import { AppError } from '../errors';
import { runTurn } from './agent';
import { buildSystemPrompt, loadDataContext } from './context';
import { ModelError, type ChatMessage, type ChatModel } from './model';
import { ChatRateLimiter } from './rateLimit';
import { toolDefinitions } from './tools';

export const TURN_TIMEOUT_MS = 60_000;

export interface AiRouteDeps {
  db: DB;
  model: ChatModel | null;
  runQuery: (body: unknown) => Promise<QueryResult>;
  now?: () => Date;
  limiter?: ChatRateLimiter;
}

const validConfig = (input: unknown): WidgetConfig | null => {
  const parsed = WidgetConfigSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};

/** Browser history → model messages. Previews are summarised; tool results are never taken from the client. */
export function toModelHistory(
  messages: ReturnType<typeof AiChatRequestSchema.parse>['messages'],
): ChatMessage[] {
  return messages
    .map((m): ChatMessage => {
      if (m.role === 'user') return { role: 'user', content: m.content };
      const shown = m.previews?.length
        ? `\n[Previews shown: ${m.previews.map((p) => `${p.previewId} "${p.title}" (${p.type})`).join('; ')}]`
        : '';
      return { role: 'assistant', content: `${m.content}${shown}`.trim() || '(no text)' };
    })
    .filter((m, i, all) => !(i === 0 && m.role === 'assistant' && all.length > 1));
}

function friendlyError(err: unknown): AiEvent {
  if (err instanceof ModelError) {
    switch (err.kind) {
      case 'timeout':
        return {
          type: 'error',
          code: 'AI_TIMEOUT',
          message: 'Insight AI took too long to answer. Please try again.',
          retry: true,
        };
      case 'rate_limited':
        return {
          type: 'error',
          code: 'AI_BUSY',
          message: 'Insight AI is busy right now. Try again in a moment.',
          retry: true,
        };
      default:
        return {
          type: 'error',
          code: 'AI_UNAVAILABLE',
          message: "Insight AI couldn't answer just now.",
          retry: true,
        };
    }
  }
  return { type: 'error', code: 'AI_ERROR', message: "Insight AI couldn't answer just now.", retry: true };
}

export function aiRoutes(app: FastifyInstance, deps: AiRouteDeps) {
  const { db, model } = deps;
  const now = deps.now ?? (() => new Date());
  const limiter = deps.limiter ?? new ChatRateLimiter();
  const auth = { preHandler: requireUser(db) };
  const tools = toolDefinitions();

  app.get('/api/ai/status', auth, async () => ({ configured: model !== null }));

  app.post('/api/ai/chat', auth, async (req, reply) => {
    if (!model) throw new AppError(503, 'AI_NOT_CONFIGURED', "Insight AI isn't configured on this server");
    const body = AiChatRequestSchema.parse(req.body);
    const last = body.messages[body.messages.length - 1]!;
    if (last.role !== 'user')
      throw new AppError(400, 'INVALID_REQUEST', 'The last message must be from the user');
    if (!last.content.trim()) throw new AppError(400, 'INVALID_REQUEST', 'Type a message first');
    if (body.messages.some((m) => m.role === 'user' && m.content.length > AI_MAX_MESSAGE_CHARS))
      throw new AppError(
        400,
        'INVALID_REQUEST',
        `Messages can be at most ${AI_MAX_MESSAGE_CHARS} characters`,
      );

    const uid = userId(req);
    const limited = limiter.take(uid);
    if (limited)
      throw new AppError(
        429,
        'RATE_LIMITED',
        limited === 'minute'
          ? "You're sending messages quickly. Wait a minute and try again."
          : "You've reached today's Insight AI limit. It resets at midnight (IST).",
      );

    const dateFilter = DateFilterSchema.safeParse(body.context.dateFilter);
    const dashboardFilter = dateFilter.success ? dateFilter.data : { preset: 'last_30_days' as const };
    const openConfig = body.context.openPreview ? validConfig(body.context.openPreview.config) : null;
    const widgetConfig = body.context.widget ? validConfig(body.context.widget.config) : null;
    const at = now();
    const data = await loadDataContext(db);

    const system = buildSystemPrompt({
      now: at,
      ...data,
      dashboard: { dateFilter: dashboardFilter, widgetTitles: body.context.widgetTitles },
      openPreview:
        openConfig && body.context.openPreview
          ? { previewId: body.context.openPreview.previewId, config: openConfig }
          : null,
      widget:
        widgetConfig && body.context.widget
          ? { title: body.context.widget.title, config: widgetConfig }
          : null,
    });

    // ---- stream (Server-Sent Events)
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const controller = new AbortController();
    let ended = false;
    res.on('close', () => {
      if (!ended) controller.abort();
    });
    const timeout = AbortSignal.timeout(TURN_TIMEOUT_MS);
    const signal = AbortSignal.any([controller.signal, timeout]);
    const emit = (event: AiEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const started = performance.now();
    let summary: Awaited<ReturnType<typeof runTurn>> | null = null;
    let failure: string | null = null;
    try {
      summary = await runTurn({
        model,
        system,
        history: toModelHistory(body.messages),
        tools,
        toolCtx: { runQuery: deps.runQuery, dashboardFilter, now: at, ...data },
        state: { openPreviewId: openConfig ? body.context.openPreview!.previewId : null },
        emit,
        signal,
      });
      if (summary.aborted && timeout.aborted) emit(friendlyError(new ModelError('timeout', 'timeout')));
    } catch (err) {
      const event = timeout.aborted
        ? friendlyError(new ModelError('timeout', 'timeout'))
        : friendlyError(err);
      failure = event.type === 'error' ? event.code : 'error';
      if (!controller.signal.aborted) emit(event);
    } finally {
      ended = true;
      res.end();
      // Metadata only — never message content (REQUIREMENTS §17.12).
      req.log.info(
        {
          ai: {
            user: uid,
            model: summary?.usage?.model ?? model.name,
            rounds: summary?.rounds,
            tools: summary?.toolCalls,
            inputTokens: summary?.usage?.inputTokens,
            outputTokens: summary?.usage?.outputTokens,
            ms: Math.round(performance.now() - started),
            aborted: controller.signal.aborted,
            error: failure,
          },
        },
        'ai chat turn',
      );
    }
  });
}
