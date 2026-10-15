import { describe, expect, it } from 'vitest';
import { emptyUndo, historyShortcut, popRedo, popUndo, pushStep, type UndoStep } from './undoStack';

const step = (label: string): UndoStep => ({ label, before: [], after: [] });
const labels = (steps: UndoStep[]) => steps.map((s) => s.label);

describe('undo stack', () => {
  it('undoes and redoes in order', () => {
    let s = [step('a'), step('b'), step('c')].reduce((acc, x) => pushStep(acc, x), emptyUndo);
    for (let i = 0; i < 3; i++) s = popUndo(s)!.state;
    expect(popUndo(s)).toBeNull();
    expect(labels(s.future)).toEqual(['a', 'b', 'c']);
    const r1 = popRedo(s)!;
    const r2 = popRedo(r1.state)!;
    expect([r1.step.label, r2.step.label]).toEqual(['a', 'b']);
    expect(labels(r2.state.past)).toEqual(['a', 'b']);
    expect(labels(r2.state.future)).toEqual(['c']);
  });

  it('clears redo steps when a new change is made', () => {
    let s = pushStep(pushStep(emptyUndo, step('a')), step('b'));
    s = popUndo(s)!.state;
    s = pushStep(s, step('c'));
    expect(labels(s.past)).toEqual(['a', 'c']);
    expect(s.future).toEqual([]);
    expect(popRedo(s)).toBeNull();
  });

  it('keeps at most 50 steps, dropping the oldest', () => {
    let s = emptyUndo;
    for (let i = 0; i < 55; i++) s = pushStep(s, step(String(i)));
    expect(s.past).toHaveLength(50);
    expect(s.past[0]!.label).toBe('5');
  });
});

describe('historyShortcut', () => {
  const key = (
    k: string,
    mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean }>,
    target?: Element,
  ) => ({
    key: k,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    shiftKey: !!mods.shift,
    target: target ?? document.body,
  });

  it('maps Ctrl/⌘+Z, Ctrl/⌘+Shift+Z and Ctrl+Y', () => {
    expect(historyShortcut(key('z', { ctrl: true }), false)).toBe('undo');
    expect(historyShortcut(key('z', { meta: true }), false)).toBe('undo');
    expect(historyShortcut(key('Z', { meta: true, shift: true }), false)).toBe('redo');
    expect(historyShortcut(key('y', { ctrl: true }), false)).toBe('redo');
    expect(historyShortcut(key('z', {}), false)).toBeNull();
  });

  it('is ignored while typing or with a dialog open', () => {
    expect(historyShortcut(key('z', { ctrl: true }, document.createElement('input')), false)).toBeNull();
    expect(historyShortcut(key('z', { ctrl: true }), true)).toBeNull();
  });
});
