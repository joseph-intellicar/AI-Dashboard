import type { ChatModel, ChatRequest, ModelEvent } from './model';

/**
 * A fake model for tests: each call plays the next scripted round of events. A round may be a function
 * of the request (to assert on what the model was sent) or an Error to throw.
 */
export function scriptedModel(
  rounds: (ModelEvent[] | Error | ((req: ChatRequest) => ModelEvent[]))[],
  name = 'fake-model',
): ChatModel & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    name,
    requests,
    async *stream(request) {
      requests.push(request);
      const round = rounds[requests.length - 1];
      if (round === undefined) throw new Error(`scriptedModel: no round ${requests.length}`);
      if (round instanceof Error) throw round;
      for (const event of typeof round === 'function' ? round(request) : round) {
        if (request.signal?.aborted) return;
        yield event;
      }
    },
  };
}

export const text = (delta: string): ModelEvent => ({ type: 'text', delta });
export const call = (name: string, args: unknown, id = `call_${name}`): ModelEvent => ({
  type: 'tool_calls',
  calls: [{ id, name, arguments: JSON.stringify(args) }],
});
