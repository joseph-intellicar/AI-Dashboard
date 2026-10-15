/**
 * Insight AI conversation state (REQUIREMENTS §17.7, §17.11). Pure reducer plus session-storage
 * persistence, so a refresh keeps the chat and logout clears it.
 */
import {
  getMeasure,
  usedFields,
  type AiClarification,
  type AiEvent,
  type AiSource,
  type WidgetConfig,
} from '@insightflow/shared';

export type PreviewStatus = 'open' | 'added' | 'discarded';

export interface ChatPreview {
  previewId: string;
  config: WidgetConfig;
  status: PreviewStatus;
  /** Bumped on each in-place refinement so the card can flash. */
  revision: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  previewIds: string[];
  /** First question about a widget ("Ask Insight AI about this"): shown as a label above the message. */
  about?: { widgetId: string; title: string };
  clarification?: { questions: AiClarification[]; answered: boolean };
  sources?: AiSource[];
  /** Tool progress, e.g. "Checking return rate…" (while streaming). */
  status?: string;
  streaming?: boolean;
  error?: { message: string; retry: boolean };
}

export interface WidgetContext {
  widgetId: string;
  title: string;
  config: WidgetConfig;
}

export interface ChatState {
  messages: ChatMessage[];
  previews: Record<string, ChatPreview>;
  /** "Ask Insight AI about this" context chip. */
  widget: WidgetContext | null;
}

export const emptyChat: ChatState = { messages: [], previews: {}, widget: null };

export type ChatAction =
  | { type: 'send'; id: string; text: string; replyId: string }
  | { type: 'event'; id: string; event: AiEvent }
  | { type: 'fail'; id: string; message: string; retry: boolean }
  | { type: 'stopped'; id: string }
  | { type: 'answered'; id: string }
  | { type: 'preview'; previewId: string; status: PreviewStatus }
  | { type: 'addPreview'; id: string; previewId: string; config: WidgetConfig }
  | { type: 'widget'; widget: WidgetContext | null }
  | { type: 'retry'; id: string; replyId: string }
  | { type: 'load'; state: ChatState }
  | { type: 'clear' };

const assistant = (id: string): ChatMessage => ({
  id,
  role: 'assistant',
  content: '',
  previewIds: [],
  streaming: true,
});

function updateMessage(state: ChatState, id: string, fn: (m: ChatMessage) => ChatMessage): ChatState {
  return { ...state, messages: state.messages.map((m) => (m.id === id ? fn(m) : m)) };
}

function applyEvent(state: ChatState, id: string, event: AiEvent): ChatState {
  switch (event.type) {
    case 'text':
      return updateMessage(state, id, (m) => ({ ...m, content: m.content + event.delta, status: undefined }));
    case 'status':
      return updateMessage(state, id, (m) => ({ ...m, status: event.text }));
    case 'preview': {
      const existing = state.previews[event.previewId];
      // A refinement updates the card in place; only open previews are ever refined.
      if (event.replaces && existing && existing.status === 'open') {
        return {
          ...state,
          previews: {
            ...state.previews,
            [event.previewId]: { ...existing, config: event.config, revision: existing.revision + 1 },
          },
        };
      }
      const previewId = existing ? `${event.previewId}_${state.messages.length}` : event.previewId;
      return {
        ...updateMessage(state, id, (m) => ({ ...m, previewIds: [...m.previewIds, previewId] })),
        previews: {
          ...state.previews,
          [previewId]: { previewId, config: event.config, status: 'open', revision: 0 },
        },
      };
    }
    case 'clarification':
      return updateMessage(state, id, (m) => ({
        ...m,
        clarification: { questions: event.questions, answered: false },
      }));
    case 'sources':
      return updateMessage(state, id, (m) => ({ ...m, sources: event.sources }));
    case 'done':
      return updateMessage(state, id, (m) => ({ ...m, streaming: false, status: undefined }));
    case 'error':
      return updateMessage(state, id, (m) => ({
        ...m,
        streaming: false,
        status: undefined,
        error: { message: event.message, retry: event.retry },
      }));
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'send': {
      // Answering by typing closes any open clarification.
      const messages = state.messages.map((m) =>
        m.clarification && !m.clarification.answered
          ? { ...m, clarification: { ...m.clarification, answered: true } }
          : m,
      );
      // Label only the first question about a widget, so the conversation shows what it is about.
      const widget = state.widget;
      const about =
        widget && !state.messages.some((m) => m.about?.widgetId === widget.widgetId)
          ? { widgetId: widget.widgetId, title: widget.title }
          : undefined;
      return {
        ...state,
        messages: [
          ...messages,
          { id: action.id, role: 'user', content: action.text, previewIds: [], ...(about ? { about } : {}) },
          assistant(action.replyId),
        ],
      };
    }
    case 'event':
      return applyEvent(state, action.id, action.event);
    case 'fail':
      return updateMessage(state, action.id, (m) => ({
        ...m,
        streaming: false,
        status: undefined,
        error: { message: action.message, retry: action.retry },
      }));
    case 'stopped':
      return updateMessage(state, action.id, (m) => ({
        ...m,
        streaming: false,
        status: undefined,
        content: m.content || (m.previewIds.length ? '' : 'Stopped.'),
      }));
    case 'answered':
      return updateMessage(state, action.id, (m) =>
        m.clarification ? { ...m, clarification: { ...m.clarification, answered: true } } : m,
      );
    case 'preview': {
      const p = state.previews[action.previewId];
      if (!p) return state;
      return {
        ...state,
        previews: { ...state.previews, [action.previewId]: { ...p, status: action.status } },
      };
    }
    case 'addPreview':
      // "Show as chart": a preview made in the browser from a query (no model call).
      return {
        ...updateMessage(state, action.id, (m) => ({
          ...m,
          previewIds: [...m.previewIds, action.previewId],
        })),
        previews: {
          ...state.previews,
          [action.previewId]: {
            previewId: action.previewId,
            config: action.config,
            status: 'open',
            revision: 0,
          },
        },
      };
    case 'widget':
      return { ...state, widget: action.widget };
    case 'retry': {
      // Drop the failed reply and stream a new one for the same user message.
      const messages = state.messages.filter((m) => m.id !== action.id);
      return { ...state, messages: [...messages, assistant(action.replyId)] };
    }
    case 'load':
      return settle(action.state);
    case 'clear':
      return emptyChat;
  }
}

/** The latest preview that hasn't been added or discarded ("make it a donut" refers to it). */
export function openPreview(state: ChatState): ChatPreview | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    for (const id of [...state.messages[i]!.previewIds].reverse()) {
      const p = state.previews[id];
      if (p?.status === 'open') return p;
    }
  }
  return null;
}

export const isBusy = (state: ChatState) => state.messages.some((m) => m.streaming);

/** Up to 3 follow-up chips for the latest assistant message (REQUIREMENTS §17.11). */
export function followUps(state: ChatState): string[] {
  const last = state.messages[state.messages.length - 1];
  if (!last || last.role !== 'assistant' || last.streaming || last.error || last.clarification) return [];
  const preview = [...last.previewIds]
    .reverse()
    .map((id) => state.previews[id])
    .find((p) => p?.status === 'open');
  if (!preview) return [];
  const c = preview.config;
  const { measures, attributes } = usedFields(c);
  const additive = measures[0] ? getMeasure(measures[0]).aggregation !== 'ratio' : false;
  const chips: string[] = [];
  if (c.type === 'bar' || c.type === 'hbar') {
    if (additive && attributes.length === 1) chips.push('Make it a donut');
    if ((c.options.limit ?? 10) > 5) chips.push('Top 5 only');
  }
  if (c.type === 'donut') chips.push('Show it as a bar chart');
  if ((c.type === 'line' || c.type === 'kpi') && !c.options.compare)
    chips.push('Compare with previous period');
  if (c.type === 'line') chips.push('Show it by month');
  if (c.options.dateRange.mode !== 'preset' || c.options.dateRange.preset !== 'last_90_days')
    chips.push('Change it to the last 90 days');
  return chips.slice(0, 3);
}

// ---------- persistence (sessionStorage, per user)

const PREFIX = 'insightflow.chat.';
const storageKey = (userId: string) => `${PREFIX}${userId}`;

/** A reply that was streaming when the page closed (or the chat was switched) can't resume. */
function settle(state: ChatState): ChatState {
  return {
    ...emptyChat,
    ...state,
    messages: state.messages.map((m) =>
      m.streaming ? { ...m, streaming: false, status: undefined, content: m.content || 'Stopped.' } : m,
    ),
  };
}

export function loadChat(userId: string): ChatState {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    return raw ? settle(JSON.parse(raw) as ChatState) : emptyChat;
  } catch {
    return emptyChat;
  }
}

export function saveChat(userId: string, state: ChatState): void {
  try {
    if (state.messages.length === 0 && !state.widget) sessionStorage.removeItem(storageKey(userId));
    else sessionStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // Storage full or blocked: the chat still works for this page.
  }
}

/** Called on logout: no conversation outlives the session. */
export function clearAllChats(): void {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ---------- recent chats ("New chat" keeps the previous conversation here)

export interface SavedChat {
  id: string;
  title: string;
  updatedAt: string;
  state: ChatState;
}

export const MAX_RECENT_CHATS = 10;
const recentKey = (userId: string) => `${PREFIX}${userId}.recent`;

/** The first user message, shortened: what the conversation was about. */
export function chatTitle(state: ChatState): string {
  const firstMessage = state.messages.find((m) => m.role === 'user');
  const question = firstMessage?.content.trim() ?? 'Conversation';
  // "Revenue Trend: Why did this change?" — the question alone would lose its context.
  const first = firstMessage?.about ? `${firstMessage.about.title}: ${question}` : question;
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
}

/** Puts a conversation at the top of the recent list (pure). Empty conversations aren't kept. */
export function archiveChat(recent: SavedChat[], state: ChatState, now = new Date()): SavedChat[] {
  if (!state.messages.some((m) => m.role === 'user')) return recent;
  const saved: SavedChat = {
    id: `chat_${now.getTime().toString(36)}_${recent.length}`,
    title: chatTitle(state),
    updatedAt: now.toISOString(),
    state: settle(state),
  };
  return [saved, ...recent].slice(0, MAX_RECENT_CHATS);
}

export function loadRecent(userId: string): SavedChat[] {
  try {
    const raw = sessionStorage.getItem(recentKey(userId));
    return raw ? (JSON.parse(raw) as SavedChat[]) : [];
  } catch {
    return [];
  }
}

export function saveRecent(userId: string, recent: SavedChat[]): void {
  try {
    if (recent.length === 0) sessionStorage.removeItem(recentKey(userId));
    else sessionStorage.setItem(recentKey(userId), JSON.stringify(recent));
  } catch {
    // ignore
  }
}
