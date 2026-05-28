import { Board, Game, Cell, Color } from '..';
import { solveAdvanced } from '../backtrackAdvanced';

export interface UndercluedRule {
  kind: 'underclue';
  count: number;
}

// Underclued is a solver mode, not a board-validity constraint.
// Returning true keeps isValid()/isValidAdvanced() happy without affecting solver behaviour.
export function verifyUndercluedRule(_board: Board, _rule: UndercluedRule): boolean {
  return true;
}

export interface ForcedCell {
  x: number;
  y: number;
  color: Color;
}

export interface UndercluedResult {
  forced: ForcedCell[];
  unsolvable: boolean;
  // Set to true if isCancelled() returned true during the per-cell scan.
  // When cancelled, `forced` reflects only the cells probed so far — callers
  // should treat the result as discarded rather than partial.
  cancelled: boolean;
}

function cloneBoard(board: Board): Board {
  return board.map(row => row.slice());
}

// Build a probe Game with a swapped board. Spread keeps every field on the
// original (rules, symbols, groups, sizeX, sizeY) — including groups, which a
// previous version of this file forgot, silently dropping cell-group
// constraints during forced-cell determination.
function makeProbe(game: Game, board: Board): Game {
  return { ...game, board };
}

// Returns true iff a valid completion exists with cell (x,y) pinned to `color`.
function admitsSolution(game: Game, x: number, y: number, color: Color): boolean {
  const board = cloneBoard(game.board);
  board[x][y] = color;
  return solveAdvanced(makeProbe(game, board));
}

// How often to yield control back to the event loop during the per-cell
// scan. Lower = smoother UI, higher = less overhead. Every 4 cells lands
// at a few hundred ms of work per turn for typical puzzles — good enough
// for the browser to repaint progress and stay responsive.
const YIELD_EVERY = 4;

export interface FindForcedCellsOptions {
  onProgress?: (done: number, total: number) => void;
  // Polled between cell probes. If it returns true, the scan aborts and the
  // returned UndercluedResult has cancelled=true. Cancellation cannot
  // interrupt a single solveAdvanced call in progress — it takes effect at
  // the inter-cell boundary (which is also the yield point).
  isCancelled?: () => boolean;
}

// Determine every forced cell on the current board.
//
// Algorithm — "uniqueness fast-path":
//   1. Solve the puzzle once to get a candidate solution.
//      If no solution exists, the puzzle is unsolvable.
//   2. For each originally-empty cell c, test only the OPPOSITE colour
//      of what the candidate assigned. If that probe finds no solution,
//      cell c is forced to the candidate's colour. Otherwise it's free.
//
// This is `1 + empty_cells` solves vs the previous `2 * empty_cells`. For
// uniquely-solvable puzzles the opposite-colour probe typically fails very
// quickly because constraint propagation hits a contradiction early.
//
// Callers must strip any UndercluedRule from game.rules before passing it in,
// otherwise the probe solves would recurse into Underclued logic.
//
// Async with a progress callback. Yields to the event loop every few cells
// so the browser stays responsive on large boards.
export async function findForcedCells(
  game: Game,
  options: FindForcedCellsOptions = {}
): Promise<UndercluedResult> {
  const { onProgress, isCancelled } = options;

  // Collect originally-empty cells once so the iteration order doesn't change
  // as the candidate solve fills cells in.
  const emptyCells: { x: number; y: number }[] = [];
  for (let x = 0; x < game.sizeX; x++) {
    for (let y = 0; y < game.sizeY; y++) {
      if (game.board[x][y] === Cell.Empty) emptyCells.push({ x, y });
    }
  }

  if (onProgress) onProgress(0, emptyCells.length);

  // Step 1: find a candidate solution.
  const candidateBoard = cloneBoard(game.board);
  if (!solveAdvanced(makeProbe(game, candidateBoard))) {
    return { forced: [], unsolvable: true, cancelled: false };
  }

  // Step 2: for each empty cell, probe the opposite colour. If that fails,
  // the candidate's colour is forced for that cell.
  const forced: ForcedCell[] = [];
  for (let i = 0; i < emptyCells.length; i++) {
    // Cancel check at the cell boundary. We can't interrupt a single
    // solveAdvanced call once it's started, so cancellation lag is bounded
    // by the slowest individual probe.
    if (isCancelled && isCancelled()) {
      return { forced, unsolvable: false, cancelled: true };
    }

    const { x, y } = emptyCells[i];
    const candidateColor = candidateBoard[x][y] as Color;
    const oppositeColor: Color = candidateColor === Cell.Light ? Cell.Dark : Cell.Light;

    if (!admitsSolution(game, x, y, oppositeColor)) {
      forced.push({ x, y, color: candidateColor });
    }

    if (onProgress) onProgress(i + 1, emptyCells.length);

    // Yield periodically so the browser can repaint and stay interactive.
    if ((i + 1) % YIELD_EVERY === 0 && i + 1 < emptyCells.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return { forced, unsolvable: false, cancelled: false };
}
