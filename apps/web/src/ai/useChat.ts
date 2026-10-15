import { AI_MAX_HISTORY, type AiChatRequest, type DateFilter, type WidgetConfig } from '@insightflow/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiError, api } from '../api/client';
import {
  archiveChat,
  chatReducer,
  isBusy,
  loadChat,
  loadRecent,
  openPreview,
  saveChat,
  saveRecent,
  type SavedChat,
  type ChatState,
  type PreviewStatus,
  type WidgetContext,
} from './chatStore';
import { streamChat } from './sse';

export interface DashboardContext {
  dateFilter: DateFilter;
  widgetTitles: string[];
}

let seq = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** The conversation as the API expects it: last 20 messages, previews summarised, failed replies left out. */
export function requestMessages(state: ChatState, nextUserText?: string): AiChatRequest['messages'] {
  const history = state.messages
    .filter((m) => !(m.role === 'assistant' && (m.error || m.streaming)))
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 8000),
      ...(m.role === 'assistant' && m.previewIds.length
        ? {
            previews: m.previewIds
              .map((id) => state.previews[id])
              .filter((p) => p !== undefined)
              .slice(-5)
              .map((p) => ({ previewId: p.previewId, title: p.config.title, type: p.config.type })),
          }
        : {}),
    }));
  if (nextUserText !== undefined) history.push({ role: 'user', content: nextUserText });
  return history.slice(-AI_MAX_HISTORY);
}

export function useAiStatus() {
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get<{ configured: boolean }>('/api/ai/status'),
    staleTime: Infinity,
  });
}

export function useChat(userId: string, getDashboard: () => DashboardContext | null) {
  const [state, dispatch] = useReducer(chatReducer, userId, loadChat);
  const stateRef = useRef(state);
  stateRef.current = state;
  const controller = useRef<AbortController | null>(null);
  const dashboardRef = useRef(getDashboard);
  dashboardRef.current = getDashboard;

  const [recent, setRecent] = useState<SavedChat[]>(() => loadRecent(userId));
  const recentRef = useRef(recent);
  recentRef.current = recent;

  useEffect(() => saveChat(userId, state), [userId, state]);
  useEffect(() => saveRecent(userId, recent), [userId, recent]);
  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(
    async (replyId: string, messages: AiChatRequest['messages'], current: ChatState) => {
      const ctl = new AbortController();
      controller.current = ctl;
      const dash = dashboardRef.current();
      const open = openPreview(current);
      const body: AiChatRequest = {
        messages,
        context: {
          dateFilter: dash?.dateFilter,
          widgetTitles: dash?.widgetTitles ?? [],
          openPreview: open ? { previewId: open.previewId, config: open.config } : null,
          widget: current.widget ? { title: current.widget.title, config: current.widget.config } : null,
        },
      };
      try {
        await streamChat(body, (event) => dispatch({ type: 'event', id: replyId, event }), ctl.signal);
      } catch (err) {
        if (ctl.signal.aborted) return;
        const retry = !(err instanceof ApiError && (err.status === 400 || err.status === 503));
        dispatch({ type: 'fail', id: replyId, message: (err as Error).message, retry });
      } finally {
        if (controller.current === ctl) controller.current = null;
      }
    },
    [],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const current = stateRef.current;
      if (!trimmed || isBusy(current)) return;
      const replyId = newId('a');
      const messages = requestMessages(current, trimmed);
      dispatch({ type: 'send', id: newId('u'), text: trimmed, replyId });
      void run(replyId, messages, current);
    },
    [run],
  );

  const retry = useCallback(
    (failedId: string) => {
      const current = stateRef.current;
      const index = current.messages.findIndex((m) => m.id === failedId);
      if (index < 0 || isBusy(current)) return;
      const before = { ...current, messages: current.messages.slice(0, index) };
      const replyId = newId('a');
      dispatch({ type: 'retry', id: failedId, replyId });
      void run(replyId, requestMessages(before), before);
    },
    [run],
  );

  const stop = useCallback(() => {
    const streaming = stateRef.current.messages.find((m) => m.streaming);
    controller.current?.abort();
    if (streaming) dispatch({ type: 'stopped', id: streaming.id });
  }, []);

  const clear = useCallback(() => {
    controller.current?.abort();
    dispatch({ type: 'clear' });
  }, []);

  /** Starts a fresh conversation; the current one moves to Recent chats. */
  const newChat = useCallback(() => {
    controller.current?.abort();
    setRecent(archiveChat(recentRef.current, stateRef.current));
    dispatch({ type: 'clear' });
  }, []);

  /** Switches to a recent conversation; the current one is kept in the list. */
  const openRecent = useCallback((id: string) => {
    const saved = recentRef.current.find((c) => c.id === id);
    if (!saved) return;
    controller.current?.abort();
    setRecent(
      archiveChat(
        recentRef.current.filter((c) => c.id !== id),
        stateRef.current,
      ),
    );
    dispatch({ type: 'load', state: saved.state });
  }, []);

  return {
    state,
    recent,
    newChat,
    openRecent,
    busy: isBusy(state),
    send,
    retry,
    stop,
    clear,
    answered: useCallback((id: string) => dispatch({ type: 'answered', id }), []),
    markPreview: useCallback(
      (previewId: string, status: PreviewStatus) => dispatch({ type: 'preview', previewId, status }),
      [],
    ),
    addLocalPreview: useCallback(
      (messageId: string, config: WidgetConfig) =>
        dispatch({ type: 'addPreview', id: messageId, previewId: newId('local_'), config }),
      [],
    ),
    setWidget: useCallback((widget: WidgetContext | null) => dispatch({ type: 'widget', widget }), []),
  };
}

export type ChatController = ReturnType<typeof useChat>;
