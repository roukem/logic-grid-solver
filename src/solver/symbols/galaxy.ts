import { Board, Game, Pos, verifyPos, Cell, getNeighbours, findGroupContaining, getSymbolCenter } from '..';

export interface GalaxySymbol {
  pos: Pos;
  kind: 'galaxy';
}

// Translate a position around a half-integer-capable rotation center.
// Returns null if the reflected position lands off-board OR doesn't land on
// an integer cell (e.g. an asymmetric group's centroid that can't actually
// support a valid 180° rotation).
function rotatePos(board: Board, center: { x: number; y: number }, pos: Pos): Pos | null {
  const nx = 2 * center.x - pos.x;
  const ny = 2 * center.y - pos.y;
  if (!Number.isInteger(nx) || !Number.isInteger(ny)) return null;
  const newPos = { x: nx, y: ny };
  return verifyPos(board, newPos) ? newPos : null;
}

// Check if galaxy symbol is valid.
//
// Signature takes Game (not just Board) so the verifier can look up whether
// the symbol's pos sits inside a cell-group — if so, the symmetry center
// becomes the group's centroid (possibly a half-integer coordinate like the
// corner where a 2x2 block's cells meet). Otherwise it falls back to the
// symbol's own pos and behaves exactly as before.
export function verifyGalaxySymbol(game: Game, symbol: GalaxySymbol): Pos[] | false {
  const board = game.board;
  const center = getSymbolCenter(game, symbol.pos);
  const group = findGroupContaining(game, symbol.pos);

  // Bootstrap: pick any cell that's part of the symbol's "anchor" — either the
  // single pos, or any cell in the group. The cell's color (if decided) tells
  // us what colour the connected region should be.
  const anchorCells: Pos[] = group ?? [symbol.pos];

  let cell: Cell = Cell.Empty;
  for (const p of anchorCells) {
    const c = board[p.x][p.y];
    if (c === Cell.Light || c === Cell.Dark) { cell = c; break; }
  }

  // Colour not yet determined — every anchor cell affects the symbol.
  if (cell === Cell.Empty) return anchorCells.slice();

  const queue: Pos[] = anchorCells.slice();
  const visited: boolean[][] = [];
  const affectedCells: Pos[] = [];

  for (let x = 0; x < board.length; x++) {
    visited[x] = [];
    for (let y = 0; y < board[0].length; y++) visited[x][y] = false;
  }

  while (queue.length > 0) {
    const curPos = queue.pop()!;
    if (visited[curPos.x][curPos.y]) continue;
    visited[curPos.x][curPos.y] = true;

    const oppoPos = rotatePos(board, center, curPos);
    if (oppoPos == null) return false;
    if (!(board[oppoPos.x][oppoPos.y] == Cell.Empty || board[oppoPos.x][oppoPos.y] == cell)) return false;

    for (const neighbour of getNeighbours(board, curPos)) {
      if (visited[neighbour.x][neighbour.y]) continue;

      if (board[neighbour.x][neighbour.y] == Cell.Empty) {
        affectedCells.push(neighbour);
      } else if (board[neighbour.x][neighbour.y] == cell) {
        queue.push(neighbour);
      }
    }
  }

  return affectedCells;
}
