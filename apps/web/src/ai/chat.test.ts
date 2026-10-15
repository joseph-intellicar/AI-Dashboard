import { DEFAULT_DASHBOARD, type AiEvent } from '@insightflow/shared';
import { afterEach, describe, expect, it } from 'vitest';
import {
  archiveChat,
  chatReducer,
  chatTitle,
  loadRecent,
  MAX_RECENT_CHATS,
  saveRecent,
  clearAllChats,
  emptyChat,
  followUps,
  loadChat,
  openPreview,
  saveChat,
  type ChatAction,
  type ChatState,
} from './chatStore';
import { answerText } from './ClarificationCard';
import { toBlocks } from './Markdown';
import { SseParser } from './sse';
import { requestMessages } from './useChat';

const bar = DEFAULT_DASHBOARD.widgets.find((w) => w.config.type === 'bar')!.config;
const donut = { ...bar, type: 'donut' as const };
const run = (state: ChatState, ...actions: ChatAction[]) => actions.reduce(chatReducer, state);
const ev = (id: string, event: AiEvent): ChatAction => ({ type: 'event', id, event });

describe('chat reducer', () => {
  it('streams a reply with a preview, then finishes', () => {
    const s = run(
      emptyChat,
      { type: 'send', id: 'u1', text: 'Revenue by category', replyId: 'a1' },
      ev('a1', { type: 'text', delta: 'Here ' }),
      ev('a1', { type: 'text', delta: 'it is.' }),
      ev('a1', { type: 'preview', previewId: 'p1', config: bar, replaces: false }),
      ev('a1', { type: 'done' }),
    );
    expect(s.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(s.messages[1]).toMatchObject({ content: 'Here it is.', previewIds: ['p1'], streaming: false });
    expect(openPreview(s)?.previewId).toBe('p1');
  });

  it('updates an open preview in place when refined', () => {
    let s = run(
      emptyChat,
      { type: 'send', id: 'u1', text: 'x', replyId: 'a1' },
      ev('a1', { type: 'preview', previewId: 'p1', config: bar, replaces: false }),
      ev('a1', { type: 'done' }),
      { type: 'send', id: 'u2', text: 'make it a donut', replyId: 'a2' },
      ev('a2', { type: 'preview', previewId: 'p1', config: donut, replaces: true }),
    );
    expect(s.previews.p1).toMatchObject({ config: { type: 'donut' }, revision: 1 });
    expect(s.messages[3]!.previewIds).toEqual([]); // no second card
    // Once added, a new proposal becomes a new card.
    s = run(
      s,
      { type: 'preview', previewId: 'p1', status: 'added' },
      ev('a2', { type: 'preview', previewId: 'p1', config: bar, replaces: true }),
    );
    expect(s.messages[3]!.previewIds).toHaveLength(1);
    expect(s.previews.p1!.status).toBe('added');
    expect(openPreview(s)?.previewId).not.toBe('p1');
  });

  it('closes clarifications when the user answers and drops a failed reply on retry', () => {
    let s = run(
      emptyChat,
      { type: 'send', id: 'u1', text: 'Show sales', replyId: 'a1' },
      ev('a1', { type: 'clarification', questions: [] }),
      ev('a1', { type: 'done' }),
      { type: 'send', id: 'u2', text: 'Revenue', replyId: 'a2' },
    );
    expect(s.messages[1]!.clarification?.answered).toBe(true);
    s = run(
      s,
      { type: 'fail', id: 'a2', message: 'boom', retry: true },
      { type: 'retry', id: 'a2', replyId: 'a3' },
    );
    expect(s.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a3']);
    expect(s.messages[3]!.streaming).toBe(true);
  });

  it('suggests follow-ups for an open bar preview', () => {
    const s = run(
      emptyChat,
      { type: 'send', id: 'u1', text: 'x', replyId: 'a1' },
      ev('a1', { type: 'preview', previewId: 'p1', config: bar, replaces: false }),
      ev('a1', { type: 'done' }),
    );
    expect(followUps(s)).toEqual(['Make it a donut', 'Top 5 only', 'Change it to the last 90 days']);
    expect(followUps(run(s, { type: 'preview', previewId: 'p1', status: 'discarded' }))).toEqual([]);
  });
});

describe('persistence', () => {
  afterEach(() => sessionStorage.clear());

  it('saves per user, restores, and is cleared on logout', () => {
    const s = run(emptyChat, { type: 'send', id: 'u1', text: 'hi', replyId: 'a1' });
    saveChat('user-a', s);
    const restored = loadChat('user-a');
    expect(restored.messages[0]!.content).toBe('hi');
    expect(restored.messages[1]).toMatchObject({ streaming: false, content: 'Stopped.' });
    expect(loadChat('user-b')).toEqual(emptyChat);
    clearAllChats();
    expect(loadChat('user-a')).toEqual(emptyChat);
  });
});

describe('request building', () => {
  it('sends history with preview summaries and skips failed replies', () => {
    const s = run(
      emptyChat,
      { type: 'send', id: 'u1', text: 'Revenue by category', replyId: 'a1' },
      ev('a1', { type: 'text', delta: 'Here.' }),
      ev('a1', { type: 'preview', previewId: 'p1', config: bar, replaces: false }),
      ev('a1', { type: 'done' }),
      { type: 'send', id: 'u2', text: 'oops', replyId: 'a2' },
      { type: 'fail', id: 'a2', message: 'x', retry: true },
    );
    expect(requestMessages(s, 'make it a donut')).toEqual([
      { role: 'user', content: 'Revenue by category' },
      { role: 'assistant', content: 'Here.', previews: [{ previewId: 'p1', title: bar.title, type: 'bar' }] },
      { role: 'user', content: 'oops' },
      { role: 'user', content: 'make it a donut' },
    ]);
  });
});

describe('SseParser', () => {
  it('handles events split across chunks and ignores junk', () => {
    const p = new SseParser();
    expect(p.push('data: {"type":"text","del')).toEqual([]);
    expect(p.push('ta":"Hi"}\n\ndata: not json\n\n: comment\n\ndata: {"type":"done"}\r\n\r\n')).toEqual([
      { type: 'text', delta: 'Hi' },
      { type: 'done' },
    ]);
  });
});

describe('Markdown blocks', () => {
  it('groups paragraphs and bullet lists', () => {
    expect(toBlocks('**COD** is highest.\n- Card: 8.8%\n- UPI: 3.6%\n\nNext para')).toEqual([
      { kind: 'p', lines: ['**COD** is highest.'] },
      { kind: 'ul', lines: ['Card: 8.8%', 'UPI: 3.6%'] },
      { kind: 'p', lines: ['Next para'] },
    ]);
  });
});

describe('clarification answers', () => {
  it('joins the chosen option labels', () => {
    const questions = [
      {
        id: 'q1',
        question: 'Which?',
        options: [
          { label: 'Revenue', value: 'revenue', kind: 'measure' as const },
          { label: 'Orders', value: 'orders', kind: 'measure' as const },
        ],
        recommended: 0,
      },
      {
        id: 'q2',
        question: 'By?',
        options: [
          { label: 'Category', value: 'category', kind: 'attribute' as const },
          { label: 'Region', value: 'region', kind: 'attribute' as const },
        ],
        recommended: 0,
      },
    ];
    expect(answerText(questions, [1, 1])).toBe('Orders · Region');
    expect(answerText(questions, [])).toBe('Revenue · Category');
  });
});

describe('recent chats', () => {
  afterEach(() => sessionStorage.clear());
  const convo = (text: string) =>
    run(emptyChat, { type: 'send', id: 'u1', text, replyId: 'a1' }, ev('a1', { type: 'text', delta: 'ok' }));

  it('archives a conversation with its first question as the title, newest first', () => {
    let recent = archiveChat([], convo('Show revenue by city for the last 2 weeks'));
    recent = archiveChat(recent, convo('Which payment method has the highest return rate?'));
    expect(recent.map((c) => c.title)).toEqual([
      'Which payment method has the highest return rate?',
      'Show revenue by city for the last 2 weeks',
    ]);
    expect(recent[0]!.state.messages[1]!.streaming).toBe(false); // a half-streamed reply is settled
  });

  it('skips empty conversations, shortens long titles and keeps at most 10', () => {
    expect(archiveChat([], emptyChat)).toEqual([]);
    expect(chatTitle(convo('x'.repeat(100)))).toHaveLength(58);
    let recent: ReturnType<typeof archiveChat> = [];
    for (let i = 0; i < 12; i++) recent = archiveChat(recent, convo(`q${i}`));
    expect(recent).toHaveLength(MAX_RECENT_CHATS);
    expect(recent[0]!.title).toBe('q11');
  });

  it('loads a saved conversation and is stored per user, cleared on logout', () => {
    const recent = archiveChat([], convo('hello'));
    const loaded = chatReducer(convo('current'), { type: 'load', state: recent[0]!.state });
    expect(loaded.messages[0]!.content).toBe('hello');
    saveRecent('user-a', recent);
    expect(loadRecent('user-a')).toHaveLength(1);
    expect(loadRecent('user-b')).toEqual([]);
    clearAllChats();
    expect(loadRecent('user-a')).toEqual([]);
  });
});

describe('"About" label for widget questions', () => {
  it('labels only the first question about the widget and uses it in the recent-chat title', () => {
    const widget = { widgetId: 'w1', title: 'Revenue Trend', config: bar };
    const s = run(
      emptyChat,
      { type: 'widget', widget },
      { type: 'send', id: 'u1', text: 'Why did this change?', replyId: 'a1' },
      ev('a1', { type: 'done' }),
      { type: 'send', id: 'u2', text: 'And by region?', replyId: 'a2' },
    );
    expect(s.messages[0]!.about).toEqual({ widgetId: 'w1', title: 'Revenue Trend' });
    expect(s.messages[2]!.about).toBeUndefined();
    expect(chatTitle(s)).toBe('Revenue Trend: Why did this change?');
    expect(
      run(emptyChat, { type: 'send', id: 'u1', text: 'hi', replyId: 'a1' }).messages[0]!.about,
    ).toBeUndefined();
  });
});
