import {
  AI_MAX_MESSAGE_CHARS,
  queryArgsToChart,
  type DateFilter,
  type WidgetConfig,
} from '@insightflow/shared';
import {
  BarChart3,
  CircleHelp,
  Lightbulb,
  LineChart,
  MessagesSquare,
  PieChart,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  SquarePen,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button, IconButton, Spinner } from '../components/ui/Button';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../components/ui/Menu';
import { formatIstDateTime } from '@insightflow/shared';
import { ConfirmDialog } from '../components/ui/Modal';
import { cn } from '../lib/cn';
import { followUps, type ChatMessage } from './chatStore';
import { ClarificationCard } from './ClarificationCard';
import { Markdown } from './Markdown';
import { PreviewCard } from './PreviewCard';
import type { ChatController } from './useChat';

export const CHAT_PANEL_WIDTH = 'lg:pr-[420px]';

/** The suggested prompts (REQUIREMENTS §17.11): 3 that build a chart straight away, 1 data question. */
export const SUGGESTIONS: { text: string; icon: ReactNode }[] = [
  { text: 'Show revenue by category for the last 30 days as a bar chart', icon: <BarChart3 /> },
  { text: 'Show daily orders for the last 90 days as a line chart', icon: <LineChart /> },
  { text: 'Show the share of revenue by sales channel this month as a donut chart', icon: <PieChart /> },
  { text: 'Which payment method has the highest return rate?', icon: <CircleHelp /> },
];

const WIDGET_FOLLOW_UPS = [
  'Why did this change?',
  'Break this down by region',
  'Show the top 5 contributors',
];

export function ChatPanel({
  chat,
  configured,
  dashboardFilter,
  onClose,
  onAdd,
  onEdit,
}: {
  chat: ChatController;
  /** null while the status is loading. */
  configured: boolean | null;
  dashboardFilter: DateFilter;
  onClose: () => void;
  onAdd: (previewId: string, config: WidgetConfig) => void;
  onEdit: (previewId: string, config: WidgetConfig) => void;
}) {
  const { state, busy } = chat;
  const [confirmClear, setConfirmClear] = useState(false);
  const [draft, setDraft] = useState('');
  const [announce, setAnnounce] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const empty = state.messages.length === 0;
  const chips = busy ? [] : followUps(state);

  // Keep the newest content in view unless the user scrolled up to read.
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [state]);

  // Announce finished replies to screen readers.
  const last = state.messages[state.messages.length - 1];
  const lastDone = last?.role === 'assistant' && !last.streaming ? last.id : null;
  useEffect(() => {
    if (lastDone) setAnnounce(`Insight AI replied: ${last?.content.slice(0, 200) ?? ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDone]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc closes the panel when nothing is being typed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role=dialog],[role=alertdialog],[role=menu]'))
        return;
      if (document.activeElement === inputRef.current && draft) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, onClose]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    stick.current = true;
    chat.send(text);
    setDraft('');
  };

  return (
    <aside
      aria-label="Insight AI"
      className="fixed top-16 right-0 bottom-0 z-20 flex w-full animate-fade-in flex-col border-l border-line bg-page shadow-pop lg:w-[420px]"
    >
      <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            Insight AI
            <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase">
              Beta
            </span>
          </h2>
          <p className="hidden truncate text-xs text-muted sm:block">Answers from your sales data</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<SquarePen className="size-3.5" />}
          disabled={empty && !state.widget}
          onClick={() => {
            chat.newChat();
            setDraft('');
            inputRef.current?.focus();
          }}
        >
          New chat
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <IconButton label="Recent chats" size="sm" disabled={chat.recent.length === 0}>
              <MessagesSquare className="size-4" />
            </IconButton>
          </MenuTrigger>
          <MenuContent>
            <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              Recent chats
            </p>
            {chat.recent.map((c) => (
              <MenuItem key={c.id} icon={<MessagesSquare />} onSelect={() => chat.openRecent(c.id)}>
                <span className="flex max-w-64 flex-col">
                  <span className="truncate text-[13px]">{c.title}</span>
                  <span className="text-[11px] text-muted">{formatIstDateTime(c.updatedAt)}</span>
                </span>
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
        <IconButton
          label="Clear conversation"
          size="sm"
          disabled={empty && !state.widget}
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 className="size-4" />
        </IconButton>
        <IconButton label="Close Insight AI" size="sm" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {configured === false ? (
          <NotConfigured />
        ) : empty ? (
          <Welcome onPick={send} disabled={busy || configured === null} />
        ) : (
          <ol className="space-y-4">
            {state.messages.map((m) => (
              <li key={m.id}>
                {m.role === 'user' ? (
                  <UserBubble text={m.content} about={m.about?.title} />
                ) : (
                  <AssistantMessage
                    message={m}
                    chat={chat}
                    dashboardFilter={dashboardFilter}
                    onAdd={onAdd}
                    onEdit={onEdit}
                    onAnswer={(text) => {
                      chat.answered(m.id);
                      send(text);
                    }}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
        {chips.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5 pl-1">
            {chips.map((c) => (
              <Chip key={c} onClick={() => send(c)}>
                {c}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t border-line bg-surface px-3 pt-2.5 pb-3">
        {state.widget ? (
          <div className="mb-2">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft py-0.5 pr-1 pl-2.5 text-xs text-primary-hover">
              <span className="truncate">About: {state.widget.title}</span>
              <button
                type="button"
                aria-label="Remove widget context"
                onClick={() => chat.setWidget(null)}
                className="rounded-full p-0.5 hover:bg-primary/10"
              >
                <X className="size-3" />
              </button>
            </span>
            {!busy ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {WIDGET_FOLLOW_UPS.map((c) => (
                  <Chip key={c} onClick={() => send(c)}>
                    {c}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-end gap-1.5 rounded-xl border border-line bg-surface p-1.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
          {!empty ? (
            <Menu>
              <MenuTrigger asChild>
                <IconButton label="Suggestions" size="sm" className="mb-0.5" disabled={busy}>
                  <Lightbulb className="size-4" />
                </IconButton>
              </MenuTrigger>
              <MenuContent align="start">
                {SUGGESTIONS.map((s) => (
                  <MenuItem key={s.text} icon={s.icon} onSelect={() => send(s.text)}>
                    <span className="max-w-72 text-[13px]">{s.text}</span>
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          ) : null}
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            maxLength={AI_MAX_MESSAGE_CHARS}
            disabled={configured === false}
            placeholder={
              state.widget ? `Ask about ${state.widget.title}…` : 'Ask about your sales or describe a chart…'
            }
            aria-label="Message Insight AI"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
            className="max-h-36 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink outline-none [field-sizing:content] placeholder:text-slate-400"
          />
          {busy ? (
            <IconButton
              label="Stop"
              size="sm"
              className="mb-0.5 bg-slate-900 text-white hover:bg-slate-700 hover:text-white"
              onClick={chat.stop}
            >
              <Square className="size-3 fill-current" />
            </IconButton>
          ) : (
            <IconButton
              label="Send"
              size="sm"
              disabled={!draft.trim() || configured !== true}
              onClick={() => send(draft)}
              className="mb-0.5 bg-primary text-white hover:bg-primary-hover hover:text-white disabled:bg-slate-200 disabled:text-slate-400"
            >
              <SendHorizontal className="size-4" />
            </IconButton>
          )}
        </div>
        <div className="mt-1 flex justify-between px-1 text-[11px] text-slate-500">
          <span>Enter to send · Shift+Enter for a new line</span>
          {draft.length > AI_MAX_MESSAGE_CHARS - 200 ? (
            <span className={cn(draft.length >= AI_MAX_MESSAGE_CHARS && 'text-danger')}>
              {draft.length}/{AI_MAX_MESSAGE_CHARS}
            </span>
          ) : null}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear the conversation?"
        description="Messages and previews in this chat will be removed. Widgets you added stay on your dashboard."
        confirmLabel="Clear"
        onConfirm={chat.clear}
      />
    </aside>
  );
}

function Chip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-primary/30 bg-surface px-3 py-1 text-xs text-primary-hover transition-colors hover:bg-primary-soft"
    >
      {children}
    </button>
  );
}

function Welcome({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <div className="flex min-h-full flex-col justify-center py-4">
      <div className="mb-5 text-center">
        <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Sparkles className="size-6" />
        </span>
        <h3 className="text-base font-semibold text-ink">Hi, I’m Insight AI</h3>
        <p className="mx-auto mt-1 max-w-72 text-sm text-muted">
          Ask about your sales or describe a chart, and I’ll build it.
        </p>
      </div>
      <p className="mb-2 px-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        Try one of these
      </p>
      <ul className="space-y-2">
        {SUGGESTIONS.map((s) => (
          <li key={s.text}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(s.text)}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-sm text-ink shadow-card transition-colors hover:border-primary/40 hover:bg-primary-soft disabled:opacity-60"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-primary [&>svg]:size-4">
                {s.icon}
              </span>
              {s.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <Sparkles className="size-7 text-slate-300" />
      <p className="font-medium text-ink">Insight AI isn’t configured on this server</p>
      <p className="text-sm text-muted">Add an xAI API key (XAPI_KEY) to the server’s .env and restart it.</p>
    </div>
  );
}

function UserBubble({ text, about }: { text: string; about?: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {about ? (
        <span className="inline-flex max-w-[85%] items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-2.5 py-0.5 text-[11px] font-medium text-primary-hover">
          <Sparkles className="size-3 shrink-0" />
          <span className="truncate">About: {about}</span>
        </span>
      ) : null}
      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-white">
        {text}
      </p>
    </div>
  );
}

function AssistantMessage({
  message: m,
  chat,
  dashboardFilter,
  onAdd,
  onEdit,
  onAnswer,
}: {
  message: ChatMessage;
  chat: ChatController;
  dashboardFilter: DateFilter;
  onAdd: (previewId: string, config: WidgetConfig) => void;
  onEdit: (previewId: string, config: WidgetConfig) => void;
  onAnswer: (text: string) => void;
}) {
  const waiting = m.streaming && !m.content && !m.status && m.previewIds.length === 0;
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Sparkles className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        {waiting ? <TypingDots /> : null}
        {m.content ? (
          <div className="rounded-2xl rounded-tl-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-slate-700 shadow-card">
            <Markdown text={m.content} />
          </div>
        ) : null}
        {m.status && m.streaming ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            <Spinner className="size-3" /> {m.status}
          </p>
        ) : null}
        {m.clarification ? (
          <ClarificationCard
            questions={m.clarification.questions}
            answered={m.clarification.answered}
            onAnswer={onAnswer}
          />
        ) : null}
        {m.previewIds.map((id) => {
          const p = chat.state.previews[id];
          return p ? (
            <PreviewCard
              key={id}
              preview={p}
              dashboardFilter={dashboardFilter}
              onAdd={() => onAdd(id, p.config)}
              onEdit={() => onEdit(id, p.config)}
              onDiscard={() => chat.markPreview(id, 'discarded')}
            />
          ) : null;
        })}
        {m.sources?.length && !m.streaming ? (
          <div className="mt-1.5 space-y-0.5 px-1 text-[11px] leading-snug text-slate-500">
            {m.sources.map((s, i) => (
              <p key={i}>
                <span className="font-medium">Based on:</span> {s.label} ·{' '}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => {
                    const chart = queryArgsToChart(s.query);
                    if (chart.ok) chat.addLocalPreview(m.id, chart.config);
                    else toast.error("Couldn't turn that into a chart", { description: chart.problems[0] });
                  }}
                >
                  Show as chart
                </button>
              </p>
            ))}
          </div>
        ) : null}
        {m.error ? (
          <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
            <span>{m.error.message}</span>
            {m.error.retry ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw className="size-3.5" />}
                onClick={() => chat.retry(m.id)}
              >
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div
      aria-label="Insight AI is typing"
      className="inline-flex items-center gap-1 rounded-2xl rounded-tl-md border border-line bg-surface px-3.5 py-3 shadow-card"
    >
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="size-1.5 animate-bounce rounded-full bg-slate-400"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </div>
  );
}
