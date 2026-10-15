import type { AiClarification } from '@insightflow/shared';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/cn';

/** "Revenue · by Category": the user's choices, sent as their reply. */
export function answerText(questions: AiClarification[], selected: number[]): string {
  return questions
    .map((q, i) => q.options[selected[i] ?? q.recommended]?.label ?? '')
    .filter(Boolean)
    .join(' · ');
}

/** Option buttons for ask_clarification, recommended option pre-selected (REQUIREMENTS §17.11). */
export function ClarificationCard({
  questions,
  answered,
  onAnswer,
}: {
  questions: AiClarification[];
  answered: boolean;
  onAnswer: (text: string) => void;
}) {
  const [selected, setSelected] = useState(() => questions.map((q) => q.recommended));

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-line bg-slate-50/70 p-3">
      {questions.map((q, qi) => (
        <div key={q.id}>
          <p id={`clarify-${q.id}`} className="mb-1.5 text-[13px] font-medium text-ink">
            {q.question}
          </p>
          <div role="radiogroup" aria-labelledby={`clarify-${q.id}`} className="flex flex-wrap gap-1.5">
            {q.options.map((o, oi) => {
              const checked = selected[qi] === oi;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={answered}
                  onClick={() => setSelected((s) => s.map((v, i) => (i === qi ? oi : v)))}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[13px] transition-colors disabled:cursor-default',
                    checked
                      ? 'border-primary bg-primary text-white'
                      : 'border-line bg-white text-ink hover:border-primary/50 hover:bg-primary-soft',
                    answered && !checked && 'opacity-50',
                  )}
                >
                  {o.label}
                  {oi === q.recommended && !answered ? (
                    <span className={cn('ml-1 text-[11px]', checked ? 'text-white/80' : 'text-muted')}>
                      (recommended)
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {answered ? null : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">…or type your answer below</span>
          <Button
            variant="primary"
            size="sm"
            icon={<ArrowRight className="size-4" />}
            onClick={() => onAnswer(answerText(questions, selected))}
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
