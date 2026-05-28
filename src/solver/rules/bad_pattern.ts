import { Board, Color, Cell } from '..';

// "Bad pattern" rules forbid certain local shapes from appearing on the board.
// All variants are partial-board-safe: Cell.Empty (and Cell.Border) cells never
// match a "bad" color, so a partial board can't fail the check until enough
// cells have been filled — exactly what the backtracker needs.

// Helper: cell at (x,y), or null if out of bounds.
function cellAt(board: Board, x: number, y: number): Cell | null {
  if (x < 0 || x >= board.length || y < 0 || y >= board[0].length) return null;
  return board[x][y];
}

// ---------- Line ----------
// N consecutive same-color cells in any row or column.

export interface BadPatternLineRule {
  kind: 'bad_pattern_line';
  color: Color;
  length: number;
}

export function verifyBadPatternLineRule(board: Board, rule: BadPatternLineRule): boolean {
  const sizeX = board.length;
  const sizeY = board[0].length;
  const { color, length } = rule;

  // Rows
  for (let x = 0; x < sizeX; x++) {
    let run = 0;
    for (let y = 0; y < sizeY; y++) {
      if (board[x][y] === color) {
        run++;
        if (run >= length) return false;
      } else {
        run = 0;
      }
    }
  }

  // Columns
  for (let y = 0; y < sizeY; y++) {
    let run = 0;
    for (let x = 0; x < sizeX; x++) {
      if (board[x][y] === color) {
        run++;
        if (run >= length) return false;
      } else {
        run = 0;
      }
    }
  }

  return true;
}

// ---------- T-shape ----------
// 3 same-color cells in a line with a 4th coming off the middle (4 orientations).
//   X X X       . X .       X .       . X
//   . X .       X X X       X X       X X
//   (T down)    (T up)      X .       . X
//                          (T right) (T left)

export interface BadPatternTRule {
  kind: 'bad_pattern_t';
  color: Color;
}

export function verifyBadPatternTRule(board: Board, rule: BadPatternTRule): boolean {
  const c = rule.color;
  const sizeX = board.length;
  const sizeY = board[0].length;

  // Treat each cell as a candidate "junction" — the middle of the 3-cell bar
  // from which the stem extends. Two bar orientations (horizontal / vertical),
  // each with two possible stem directions.
  for (let jx = 0; jx < sizeX; jx++) {
    for (let jy = 0; jy < sizeY; jy++) {
      if (board[jx][jy] !== c) continue;

      const horizontalBar = cellAt(board, jx, jy - 1) === c && cellAt(board, jx, jy + 1) === c;
      if (horizontalBar) {
        if (cellAt(board, jx + 1, jy) === c) return false; // T down
        if (cellAt(board, jx - 1, jy) === c) return false; // T up
      }

      const verticalBar = cellAt(board, jx - 1, jy) === c && cellAt(board, jx + 1, jy) === c;
      if (verticalBar) {
        if (cellAt(board, jx, jy + 1) === c) return false; // T right
        if (cellAt(board, jx, jy - 1) === c) return false; // T left
      }
    }
  }

  return true;
}

// ---------- Checkerboard ----------
// A 2x2 block whose diagonals are same-color and whose adjacents differ.
//   D L      L D
//   L D  or  D L

export interface BadPatternCheckerboardRule {
  kind: 'bad_pattern_checkerboard';
}

function isColored(cell: Cell): boolean {
  return cell === Cell.Light || cell === Cell.Dark;
}

export function verifyBadPatternCheckerboardRule(
  board: Board,
  _rule: BadPatternCheckerboardRule
): boolean {
  for (let x = 0; x < board.length - 1; x++) {
    for (let y = 0; y < board[0].length - 1; y++) {
      const a = board[x][y];
      const b = board[x][y + 1];
      const c = board[x + 1][y];
      const d = board[x + 1][y + 1];

      // All four must be colored (Light or Dark) before this 2x2 can be a
      // checkerboard — empty/border in any slot means "not yet decided".
      if (!isColored(a) || !isColored(b) || !isColored(c) || !isColored(d)) continue;

      // Checkerboard: diagonals equal, adjacents opposite.
      if (a === d && b === c && a !== b) return false;
    }
  }

  return true;
}

// ---------- Square ----------
// A 2x2 block of all the same color. Distinct from "Almost Square" (3+1).

export interface BadPatternSquareRule {
  kind: 'bad_pattern_square';
  color: Color;
}

export function verifyBadPatternSquareRule(board: Board, rule: BadPatternSquareRule): boolean {
  const c = rule.color;
  for (let x = 0; x < board.length - 1; x++) {
    for (let y = 0; y < board[0].length - 1; y++) {
      if (
        board[x][y] === c &&
        board[x][y + 1] === c &&
        board[x + 1][y] === c &&
        board[x + 1][y + 1] === c
      ) return false;
    }
  }
  return true;
}

// ---------- Snake / zig-zag ----------
// 4 same-color cells forming a connected zig-zag. Looks like a 2x2 square
// where one row (or column) has been shifted over by one. 4 orientations:
//   X X .       . X X       X .       . X
//   . X X       X X .       X X       X X
//   (horiz Z)   (horiz S)   . X       X .
//                          (vert Z)  (vert S)

export interface BadPatternSnakeRule {
  kind: 'bad_pattern_snake';
  color: Color;
}

export function verifyBadPatternSnakeRule(board: Board, rule: BadPatternSnakeRule): boolean {
  const c = rule.color;
  const sizeX = board.length;
  const sizeY = board[0].length;

  // Horizontal forms (bounding box 2 rows x 3 cols; anchor = top-left)
  for (let x = 0; x < sizeX - 1; x++) {
    for (let y = 0; y < sizeY - 2; y++) {
      // Z: top [y, y+1], bottom [y+1, y+2]
      if (
        board[x][y] === c &&
        board[x][y + 1] === c &&
        board[x + 1][y + 1] === c &&
        board[x + 1][y + 2] === c
      ) return false;

      // S: top [y+1, y+2], bottom [y, y+1]
      if (
        board[x][y + 1] === c &&
        board[x][y + 2] === c &&
        board[x + 1][y] === c &&
        board[x + 1][y + 1] === c
      ) return false;
    }
  }

  // Vertical forms (bounding box 3 rows x 2 cols; anchor = top-left)
  for (let x = 0; x < sizeX - 2; x++) {
    for (let y = 0; y < sizeY - 1; y++) {
      // Vert Z: left col [x, x+1], right col [x+1, x+2]
      if (
        board[x][y] === c &&
        board[x + 1][y] === c &&
        board[x + 1][y + 1] === c &&
        board[x + 2][y + 1] === c
      ) return false;

      // Vert S: right col [x, x+1], left col [x+1, x+2]
      if (
        board[x][y + 1] === c &&
        board[x + 1][y] === c &&
        board[x + 1][y + 1] === c &&
        board[x + 2][y] === c
      ) return false;
    }
  }

  return true;
}

// ---------- Almost square ----------
// A 2x2 block with exactly 3 cells of `color` and 1 of the opposite color.
// `color` is the majority color (the "(Dark)" / "(Light)" suffix in the UI).

export interface BadPatternAlmostSquareRule {
  kind: 'bad_pattern_almost_square';
  color: Color;
}

export function verifyBadPatternAlmostSquareRule(
  board: Board,
  rule: BadPatternAlmostSquareRule
): boolean {
  const target = rule.color;
  const other: Color = target === Cell.Dark ? Cell.Light : Cell.Dark;

  for (let x = 0; x < board.length - 1; x++) {
    for (let y = 0; y < board[0].length - 1; y++) {
      const cells = [board[x][y], board[x][y + 1], board[x + 1][y], board[x + 1][y + 1]];
      let targetCount = 0;
      let otherCount = 0;
      for (const cell of cells) {
        if (cell === target) targetCount++;
        else if (cell === other) otherCount++;
      }
      // Exactly 3+1 = a fully-decided 2x2 with the required split.
      // If any cell is empty/border, the counts won't add up to 4 and we skip.
      if (targetCount === 3 && otherCount === 1) return false;
    }
  }

  return true;
}
