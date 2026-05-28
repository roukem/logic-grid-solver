import {
  ConnectedRule,
  AreaRule,
  UndercluedRule,
  BadPatternLineRule,
  BadPatternTRule,
  BadPatternCheckerboardRule,
  BadPatternAlmostSquareRule,
  BadPatternSnakeRule
} from './rules';
import { AreaSymbol, DartSymbol, ViewpointSymbol, GalaxySymbol, LotusSymbol } from './symbols';

export interface Pos {
  x: number;
  y: number;
}

export enum Cell {
  Empty = 0,
  Light,
  Dark,
  Border
}

export type Color = Cell.Light | Cell.Dark;

export type Rule =
  | ConnectedRule
  | AreaRule
  | UndercluedRule
  | BadPatternLineRule
  | BadPatternTRule
  | BadPatternCheckerboardRule
  | BadPatternAlmostSquareRule
  | BadPatternSnakeRule;

export type Symbol = AreaSymbol | DartSymbol | ViewpointSymbol | GalaxySymbol | LotusSymbol;

export type Board = Cell[][];

export interface Game {
  board: Board;
  rules: Rule[];
  symbols: Symbol[];
  // Joined cell groups. Each group is a list of positions that must all
  // share the same color in any valid solution. Empty cells in a group are
  // a wildcard — the constraint only fires once two cells in the same group
  // are colored and disagree.
  groups: Pos[][];
  sizeX: number;
  sizeY: number;
}

export enum Direction {
  Up = 'up',
  Down = 'down',
  Left = 'left',
  Right = 'right'
}

// Check if the position is within the board
export function verifyPos(board: Board, pos: Pos): boolean {
  return pos.x >= 0 && pos.x < board.length && pos.y >= 0 && pos.y < board[0].length;
}

export function getOppositeColor(color: Color): Color {
  return color == Cell.Dark ? Cell.Light : Cell.Dark;
}

export function getNeighbours(board: Board, pos: Pos): Pos[] {
  const positions: Pos[] = [];

  if (pos.x > 0) {
    if (board[pos.x - 1][pos.y] != Cell.Border) positions.push({ x: pos.x - 1, y: pos.y });
  }
  if (pos.x + 1 < board.length) {
    if (board[pos.x + 1][pos.y] != Cell.Border) positions.push({ x: pos.x + 1, y: pos.y });
  }
  if (pos.y > 0) {
    if (board[pos.x][pos.y - 1] != Cell.Border) positions.push({ x: pos.x, y: pos.y - 1 });
  }
  if (pos.y + 1 < board[0].length) {
    if (board[pos.x][pos.y + 1] != Cell.Border) positions.push({ x: pos.x, y: pos.y + 1 });
  }

  return positions;
}

// Find the cell-group containing `pos`, or null if pos isn't in any group.
export function findGroupContaining(game: Game, pos: Pos): Pos[] | null {
  if (!game.groups) return null;
  for (const group of game.groups) {
    for (const p of group) {
      if (p.x === pos.x && p.y === pos.y) return group;
    }
  }
  return null;
}

// Effective symmetry center for a symbol placed at `pos`. If pos sits inside a
// cell-group, the centroid of the group is returned (possibly with half-integer
// coordinates — that's the whole point: a 2x2 group's centroid lands on the
// corner where four cells meet, which is what lotus/galaxy need). Otherwise
// the symbol's own pos is returned unchanged.
export function getSymbolCenter(game: Game, pos: Pos): { x: number; y: number } {
  const group = findGroupContaining(game, pos);
  if (!group || group.length === 0) return { x: pos.x, y: pos.y };
  let sumX = 0, sumY = 0;
  for (const p of group) { sumX += p.x; sumY += p.y; }
  return { x: sumX / group.length, y: sumY / group.length };
}

export function getDirOffset(dir: Direction): [number, number] {
  switch (dir) {
    case Direction.Up:
      return [-1, 0];
    case Direction.Down:
      return [1, 0];
    case Direction.Left:
      return [0, -1];
    case Direction.Right:
      return [0, 1];
  }
}
