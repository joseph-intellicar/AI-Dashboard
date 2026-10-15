import { describe, expect, it } from 'vitest';
import { duplicatePlacement, layoutProblem } from './layout';

const types = { a: 'kpi', b: 'table' } as const;
const typeOf = (id: string) => types[id as keyof typeof types];

describe('layoutProblem', () => {
  it('accepts a valid layout', () => {
    expect(
      layoutProblem(
        [
          { id: 'a', x: 0, y: 0, w: 2, h: 2 },
          { id: 'b', x: 2, y: 0, w: 10, h: 4 },
        ],
        typeOf,
      ),
    ).toBeNull();
  });

  it('rejects widgets past column 12', () => {
    expect(layoutProblem([{ id: 'a', x: 11, y: 0, w: 2, h: 2 }], typeOf)).toMatch(/12-column/);
  });

  it('rejects sizes below the type minimum', () => {
    expect(layoutProblem([{ id: 'b', x: 0, y: 0, w: 3, h: 4 }], typeOf)).toMatch(/minimum size/);
    expect(layoutProblem([{ id: 'a', x: 0, y: 0, w: 1, h: 2 }], typeOf)).toMatch(/minimum size/);
  });

  it('rejects duplicate IDs', () => {
    expect(
      layoutProblem(
        [
          { id: 'a', x: 0, y: 0, w: 2, h: 2 },
          { id: 'a', x: 2, y: 0, w: 2, h: 2 },
        ],
        typeOf,
      ),
    ).toMatch(/once/);
  });
});

describe('duplicatePlacement', () => {
  it('places the copy directly below the original with the same size', () => {
    expect(duplicatePlacement({ x: 4, y: 6, w: 8, h: 4 })).toEqual({ x: 4, y: 10, w: 8, h: 4 });
  });
});
