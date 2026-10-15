/**
 * Undo/redo for an edit session (REQUIREMENTS §6.8). Pure: each step holds the widgets before and
 * after one change, so undoing is "save `before`" and redoing is "save `after`".
 */
import type { WidgetSnapshot } from '@insightflow/shared';

export interface UndoStep {
  /** e.g. "move Total Revenue" */
  label: string;
  before: WidgetSnapshot[];
  after: WidgetSnapshot[];
}

export interface UndoState {
  past: UndoStep[];
  future: UndoStep[];
}

export const UNDO_LIMIT = 50;
export const emptyUndo: UndoState = { past: [], future: [] };

/** A new change: becomes the next undo step and clears the redo steps. Oldest steps drop past the limit. */
export function pushStep(state: UndoState, step: UndoStep, limit = UNDO_LIMIT): UndoState {
  return { past: [...state.past, step].slice(-limit), future: [] };
}

export function popUndo(state: UndoState): { step: UndoStep; state: UndoState } | null {
  const step = state.past[state.past.length - 1];
  if (!step) return null;
  return { step, state: { past: state.past.slice(0, -1), future: [step, ...state.future] } };
}

export function popRedo(state: UndoState): { step: UndoStep; state: UndoState } | null {
  const [step, ...future] = state.future;
  if (!step) return null;
  return { step, state: { past: [...state.past, step], future } };
}

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}

/** Which history shortcut a key press is, if any. Ignored while typing or while a dialog is open. */
export function historyShortcut(e: KeyLike, dialogOpen: boolean): 'undo' | 'redo' | null {
  if (dialogOpen || !(e.ctrlKey || e.metaKey)) return null;
  const el = e.target as HTMLElement | null;
  if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return null;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && e.ctrlKey && !e.shiftKey) return 'redo';
  return null;
}
