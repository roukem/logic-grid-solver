import { Board, Game, Pos } from '..';

// "Off by one" is a meta-rule: it doesn't add a board-level constraint of its
// own, it modifies how area and viewpoint *symbols* interpret their numbers.
// When active, each area/viewpoint symbol whose stored count is N is satisfied
// when the actual count is either N-1 or N+1. Each symbol is independent —
// they don't have to all "lie" in the same direction.
//
// Edge case: count=1 cannot become 0 (no valid 0-cell area or single-cell
// viewpoint), so a stored "1" must be interpreted as 2.
export interface OffByOneRule {
  kind: 'off_by_one';
}

// No-op verifier — the rule has no per-board check of its own. Its effect is
// applied by verifyWithOffByOne() when the area/viewpoint dispatchers call in.
export function verifyOffByOneRule(_board: Board, _rule: OffByOneRule): boolean {
  return true;
}

export function isOffByOneActive(game: Game): boolean {
  return game.rules.some(r => r.kind === 'off_by_one');
}

// Counts the rule will try when off-by-one is active.
export function offByOneVariants(count: number): number[] {
  if (count === 1) return [2];
  return [count - 1, count + 1];
}

// Apply off-by-one to a symbol verifier. Returns the original verifier's result
// when the rule isn't active. When active, calls the verifier once per variant
// count and:
//   - returns false only if EVERY variant returns false (symbol is violated under
//     both interpretations)
//   - otherwise returns the union of affected cells across successful variants
//     (a change to any of those cells could affect at least one interpretation,
//     so the advanced solver needs to re-check the symbol when they change)
export function verifyWithOffByOne<S extends { count: number }>(
  game: Game,
  symbol: S,
  verify: (board: Board, s: S) => Pos[] | false
): Pos[] | false {
  if (!isOffByOneActive(game)) return verify(game.board, symbol);

  const union: Pos[] = [];
  let anyOk = false;
  for (const c of offByOneVariants(symbol.count)) {
    const result = verify(game.board, { ...symbol, count: c });
    if (result !== false) {
      anyOk = true;
      union.push(...result);
    }
  }
  return anyOk ? union : false;
}
