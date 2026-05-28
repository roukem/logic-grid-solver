import { Game, Pos, Cell } from '.';
import {
  verify_connected_rule,
  verify_area_rule,
  verify_underclue_rule,
  verify_bad_pattern_line_rule,
  verify_bad_pattern_t_rule,
  verify_bad_pattern_checkerboard_rule,
  verify_bad_pattern_almost_square_rule,
  verify_bad_pattern_snake_rule,
  verify_off_by_one_rule,
  verifyWithOffByOne
} from './rules';
import {
  verify_area_symbol,
  verify_dart_symbol,
  verify_viewpoint_symbol,
  verify_galaxy_symbol,
  verify_lotus_symbol
} from './symbols';

export function isValid(game: Game): boolean {
  for (const rule of game.rules) {
    if (rule.kind == 'connected' && !verify_connected_rule(game.board, rule)) return false;
    if (rule.kind == 'area' && !verify_area_rule(game.board, rule)) return false;
    if (rule.kind == 'underclue' && !verify_underclue_rule(game.board, rule)) return false;
    if (rule.kind == 'bad_pattern_line' && !verify_bad_pattern_line_rule(game.board, rule)) return false;
    if (rule.kind == 'bad_pattern_t' && !verify_bad_pattern_t_rule(game.board, rule)) return false;
    if (rule.kind == 'bad_pattern_checkerboard' && !verify_bad_pattern_checkerboard_rule(game.board, rule)) return false;
    if (rule.kind == 'bad_pattern_almost_square' && !verify_bad_pattern_almost_square_rule(game.board, rule)) return false;
    if (rule.kind == 'bad_pattern_snake' && !verify_bad_pattern_snake_rule(game.board, rule)) return false;
    if (rule.kind == 'off_by_one' && !verify_off_by_one_rule(game.board, rule)) return false;
  }

  for (const symbol of game.symbols) {
    if (symbol.kind == 'area' && !verifyWithOffByOne(game, symbol, verify_area_symbol)) return false;
    if (symbol.kind == 'dart' && !verify_dart_symbol(game.board, symbol)) return false;
    if (symbol.kind == 'viewpoint' && !verifyWithOffByOne(game, symbol, verify_viewpoint_symbol)) return false;
    if (symbol.kind == 'galaxy' && !verify_galaxy_symbol(game, symbol)) return false;
    if (symbol.kind == 'lotus' && !verify_lotus_symbol(game, symbol)) return false;
  }

  // Joined-cell groups: all coloured cells in a group must agree on colour.
  // Empty/Border cells in a group are wildcards — the constraint only fires
  // when two non-empty cells in the same group disagree.
  if (game.groups) {
    for (const group of game.groups) {
      let groupColor: Cell | null = null;
      for (const p of group) {
        const cell = game.board[p.x][p.y];
        if (cell !== Cell.Light && cell !== Cell.Dark) continue;
        if (groupColor === null) groupColor = cell;
        else if (groupColor !== cell) return false;
      }
    }
  }

  return true;
}

// Find the next empty cell
export function naiveNextCell(game: Game): Pos | null {
  for (let x = 0; x < game.sizeX; x++) {
    for (let y = 0; y < game.sizeY; y++) {
      if (game.board[x][y] === Cell.Empty) {
        return { x, y };
      }
    }
  }

  return null;
}

// Attempt to solve the board using a backtracking algorithm
export function solve(game: Game): boolean {
  if (!isValid(game)) return false;

  // Find the first empty cell
  let pos: Pos | null = naiveNextCell(game);
  if (!pos) return true;

  // TODO: Use a better method to determine the order
  game.board[pos.x][pos.y] = Cell.Light;
  if (solve(game)) return true;

  game.board[pos.x][pos.y] = Cell.Dark;
  if (solve(game)) return true;

  // If both fail, returns to initial state
  game.board[pos.x][pos.y] = Cell.Empty;
  return false;
}
