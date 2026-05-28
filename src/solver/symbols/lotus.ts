import { Board, Game, Cell, Pos, getNeighbours, verifyPos, findGroupContaining, getSymbolCenter } from '..';

export interface LotusSymbol {
  pos: Pos;
  kind: 'lotus';
  rotation: 0 | 1 | 2 | 3;
}

// Reflect a position around a half-integer-capable lotus axis.
// rotation 0 = horizontal mirror (vertical axis through center)
// rotation 1 = anti-diagonal mirror
// rotation 2 = vertical mirror (horizontal axis through center)
// rotation 3 = main-diagonal mirror
// Returns null off-board or if the reflection lands on a non-integer cell.
function reflectPos(
  board: Board,
  center: { x: number; y: number },
  rotation: 0 | 1 | 2 | 3,
  pos: Pos
): Pos | null {
  let nx: number, ny: number;
  if (rotation == 0) {
    nx = pos.x;
    ny = 2 * center.y - pos.y;
  } else if (rotation == 1) {
    nx = center.x + center.y - pos.y;
    ny = center.x + center.y - pos.x;
  } else if (rotation == 2) {
    nx = 2 * center.x - pos.x;
    ny = pos.y;
  } else {
    nx = center.x - center.y + pos.y;
    ny = center.y - center.x + pos.x;
  }
  if (!Number.isInteger(nx) || !Number.isInteger(ny)) return null;
  const newPos = { x: nx, y: ny };
  return verifyPos(board, newPos) ? newPos : null;
}

// See galaxy.ts for the rationale on the Game-typed signature and the
// group-centroid handling — lotus follows the same shape.
export function verifyLotusSymbol(game: Game, symbol: LotusSymbol): Pos[] | false {
  const board = game.board;
  const center = getSymbolCenter(game, symbol.pos);
  const group = findGroupContaining(game, symbol.pos);

  const anchorCells: Pos[] = group ?? [symbol.pos];

  let cell: Cell = Cell.Empty;
  for (const p of anchorCells) {
    const c = board[p.x][p.y];
    if (c === Cell.Light || c === Cell.Dark) { cell = c; break; }
  }

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

    const oppoPos = reflectPos(board, center, symbol.rotation, curPos);
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
