/** Reads the Insight AI Server-Sent Events stream (POST, so EventSource can't be used). */
import type { AiChatRequest, AiEvent } from '@insightflow/shared';
import { ApiError, parseError } from '../api/client';

/** Incremental parser: feed text chunks, get complete `data:` events back. */
export class SseParser {
  private buffer = '';

  push(chunk: string): AiEvent[] {
    this.buffer += chunk.replace(/\r\n/g, '\n');
    const events: AiEvent[] = [];
    let end: number;
    while ((end = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        events.push(JSON.parse(data) as AiEvent);
      } catch {
        // Ignore a malformed event rather than breaking the whole reply.
      }
    }
    return events;
  }
}

export async function streamChat(
  body: AiChatRequest,
  onEvent: (event: AiEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/ai/chat', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError(0, 'NETWORK', 'Can’t reach the server — check your connection');
  }
  if (!res.ok || !res.body) throw await parseError(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new SseParser();
  let finished = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of parser.push(value)) {
      if (event.type === 'done' || event.type === 'error') finished = true;
      onEvent(event);
    }
  }
  if (!finished && !signal.aborted) {
    onEvent({ type: 'error', code: 'AI_INTERRUPTED', message: 'The reply was interrupted.', retry: true });
  }
}
