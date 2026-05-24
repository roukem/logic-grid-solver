import { Board, Color } from '..';

// First "bad pattern" variant: a straight line of N consecutive same-color cells
// in any row or column. Future pattern variants (squares, L-shapes, etc.) can
// land alongside this one and share the BadPatternRule union.
export interface BadPatternLineRule {
  kind: 'bad_pattern_line';
  color: Color;
  length: number;
}

// During solving, the board contains Cell.Empty cells that aren't yet decided.
// An empty (or border) cell is treated as "not the bad color" and resets the run,
// so partial boards can't fail this check until enough cells have been filled —
// exactly the behaviour the backtracker needs.
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
