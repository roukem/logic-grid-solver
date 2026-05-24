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
}

function cloneBoard(board: Board): Board {
  return board.map(row => row.slice());
}

// Returns true iff a valid completion exists with cell (x,y) pinned to `color`.
function admitsSolution(game: Game, x: number, y: number, color: Color): boolean {
  const board = cloneBoard(game.board);
  board[x][y] = color;
  const probe: Game = {
    board,
    rules: game.rules,
    symbols: game.symbols,
    sizeX: game.sizeX,
    sizeY: game.sizeY
  };
  return solveAdvanced(probe);
}

// Determine every forced cell on the current board.
// Callers must strip any UndercluedRule from game.rules before passing it in,
// otherwise the probe solves would recurse into Underclued logic.
export function findForcedCells(game: Game): UndercluedResult {
  const forced: ForcedCell[] = [];

  for (let x = 0; x < game.sizeX; x++) {
    for (let y = 0; y < game.sizeY; y++) {
      if (game.board[x][y] !== Cell.Empty) continue;

      const lightOK = admitsSolution(game, x, y, Cell.Light);
      const darkOK = admitsSolution(game, x, y, Cell.Dark);

      if (!lightOK && !darkOK) {
        return { forced: [], unsolvable: true };
      }
      if (lightOK && !darkOK) forced.push({ x, y, color: Cell.Light });
      else if (!lightOK && darkOK) forced.push({ x, y, color: Cell.Dark });
    }
  }

  return { forced, unsolvable: false };
}
