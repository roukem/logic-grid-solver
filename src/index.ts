import presets from './presets';
import { Board, Symbol, Pos, Cell, Direction, Game, findGroupContaining, getSymbolCenter } from './solver';
import { solveAdvanced } from './solver/backtrackAdvanced';
import { findForcedCells, UndercluedRule } from './solver/rules';

const canvas = document.getElementById('board')! as HTMLCanvasElement;
const rect = canvas.getBoundingClientRect();
const ctx = canvas.getContext('2d')!;

let game: Game = createEmptyGame(10, 10);

let pixelCellSize = 50;

// Add event listeners to handle cell interaction
let isMouseDown = false;
let mouseCell: Cell = Cell.Empty;

// ---- Undo history ----
// Each entry is a serialized snapshot of `game` taken *before* a mutation, so
// undo restores the state from immediately before the user's last gesture.
// Capped to bound memory; one entry per gesture (a mouse-drag = one entry).
const UNDO_LIMIT = 50;
let history: string[] = [];
let dragSnapshotTaken = false;

// ---- Cell-grouping state ----
// pendingGroup is the in-progress selection the user is building in Join mode.
// Cells appear here once clicked; the user finalizes the group with Commit Group,
// at which point it's pushed to game.groups and pendingGroup is cleared. Purely
// UI state — not serialized.
let pendingGroup: Pos[] = [];

// Older presets and imported games may not have a groups field. Older save
// formats need it filled in so the rest of the code can iterate freely.
function ensureGroups(g: Game) {
  if (!g.groups) g.groups = [];
}

function snapshotGame() {
  const snapshot = JSON.stringify(game);
  // Dedup: if nothing changed since the last snapshot (e.g. a failed solve),
  // skip pushing — keeps the undo stack from filling with no-ops.
  if (history.length > 0 && history[history.length - 1] === snapshot) return;
  history.push(snapshot);
  if (history.length > UNDO_LIMIT) history.shift();
  updateUndoButton();
}

function updateUndoButton() {
  const btn = document.getElementById('undo-button') as HTMLButtonElement | null;
  if (btn) btn.disabled = history.length === 0;
}

function handleUndo() {
  if (history.length === 0) return;
  game = JSON.parse(history.pop()!);
  ensureGroups(game);
  drawGame(game);
  updateRuleList();
  updateUndoButton();
}

// ---- Join mode helpers ----

function posIndexInList(list: Pos[], pos: Pos): number {
  return list.findIndex(p => p.x === pos.x && p.y === pos.y);
}

function findGroupIndexContaining(g: Game, pos: Pos): number {
  for (let i = 0; i < g.groups.length; i++) {
    if (posIndexInList(g.groups[i], pos) !== -1) return i;
  }
  return -1;
}

function handleJoinLeftClick(pos: Pos) {
  // If this cell is already part of a committed group, do nothing — joining
  // an already-joined cell into a new group would be ambiguous. The user can
  // right-click the committed group to delete it first.
  if (findGroupIndexContaining(game, pos) !== -1) return;

  const idx = posIndexInList(pendingGroup, pos);
  if (idx === -1) {
    pendingGroup.push(pos);
  } else {
    pendingGroup.splice(idx, 1);
  }
  drawGame(game);
}

function handleJoinRightClick(pos: Pos) {
  // Delete the committed group containing this cell, if any.
  const idx = findGroupIndexContaining(game, pos);
  if (idx === -1) return;
  snapshotGame();
  game.groups.splice(idx, 1);
  drawGame(game);
}

// BFS over the pending cells using rook adjacency only. Returns true if every
// pending cell is reachable from the first. Used at commit time to forbid
// disconnected "groups" — those would silently get treated as one group whose
// centroid lands somewhere odd, which is never what the user wants.
function isPendingGroupContiguous(): boolean {
  if (pendingGroup.length <= 1) return true;

  const key = (x: number, y: number) => `${x},${y}`;
  const inGroup = new Set(pendingGroup.map(p => key(p.x, p.y)));
  const visited = new Set<string>();
  const queue: Pos[] = [pendingGroup[0]];
  visited.add(key(pendingGroup[0].x, pendingGroup[0].y));

  while (queue.length > 0) {
    const cur = queue.pop()!;
    const neighbours: Pos[] = [
      { x: cur.x - 1, y: cur.y },
      { x: cur.x + 1, y: cur.y },
      { x: cur.x, y: cur.y - 1 },
      { x: cur.x, y: cur.y + 1 }
    ];
    for (const n of neighbours) {
      const k = key(n.x, n.y);
      if (inGroup.has(k) && !visited.has(k)) {
        visited.add(k);
        queue.push(n);
      }
    }
  }

  return visited.size === pendingGroup.length;
}

function handleCommitGroup() {
  // A 1-cell "group" is meaningless (a single cell is always its own color).
  // Require at least 2 to make a real group.
  if (pendingGroup.length < 2) {
    pendingGroup = [];
    drawGame(game);
    return;
  }
  if (!isPendingGroupContiguous()) {
    alert('Joined cells must form a single connected shape (no diagonals, no gaps).');
    // Leave pendingGroup intact so the user can fix the selection.
    return;
  }
  snapshotGame();
  game.groups.push(pendingGroup);
  pendingGroup = [];
  drawGame(game);
}

// Commit Group is only meaningful while the user is composing a join. Hiding
// it elsewhere keeps the toolbar from offering an action that has no effect
// in the current mode.
function updateCommitGroupVisibility() {
  const btn = document.getElementById('commit-group-button') as HTMLButtonElement | null;
  if (!btn) return;
  btn.style.display = getMode() === 'join' ? '' : 'none';
}

drawGame(game);
updateRuleList();
updateUndoButton();
updateCommitGroupVisibility();

// Function to get the cell color
function getCellColor(cell: Cell): string {
  switch (cell) {
    case Cell.Empty:
      return '#A0A0A0';
    case Cell.Light:
      return '#FFFFFF';
    case Cell.Dark:
      return '#202020';
    case Cell.Border:
      return '#404040';
  }
}

// Function to draw the board
function drawGame(game: Game) {
  if (canvas.width != game.sizeY * pixelCellSize) canvas.width = game.sizeY * pixelCellSize;
  if (canvas.height != game.sizeX * pixelCellSize) canvas.height = game.sizeX * pixelCellSize;

  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Build a fast lookup: cell -> committed-group index (-1 if none).
  const groupOf: number[][] = [];
  for (let x = 0; x < game.sizeX; x++) {
    groupOf[x] = [];
    for (let y = 0; y < game.sizeY; y++) groupOf[x][y] = -1;
  }
  for (let g = 0; g < game.groups.length; g++) {
    for (const p of game.groups[g]) {
      if (p.x >= 0 && p.x < game.sizeX && p.y >= 0 && p.y < game.sizeY) groupOf[p.x][p.y] = g;
    }
  }
  const sameGroup = (x1: number, y1: number, x2: number, y2: number): boolean => {
    if (x2 < 0 || x2 >= game.sizeX || y2 < 0 || y2 >= game.sizeY) return false;
    const a = groupOf[x1][y1], b = groupOf[x2][y2];
    return a !== -1 && a === b;
  };

  // Pass 1: fill cells.
  for (let x = 0; x < game.sizeX; x++) {
    for (let y = 0; y < game.sizeY; y++) {
      ctx.fillStyle = getCellColor(game.board[x][y]);
      ctx.fillRect(y * pixelCellSize, x * pixelCellSize, pixelCellSize, pixelCellSize);
    }
  }

  // Pass 2: stroke per-cell edges, but skip any edge shared with a same-group
  // neighbour — that's what makes a joined group visually look like one shape.
  ctx.strokeStyle = '#404040';
  ctx.lineWidth = 1;
  for (let x = 0; x < game.sizeX; x++) {
    for (let y = 0; y < game.sizeY; y++) {
      const px = y * pixelCellSize;
      const py = x * pixelCellSize;
      const r = px + pixelCellSize;
      const b = py + pixelCellSize;
      if (!sameGroup(x, y, x - 1, y)) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(r, py); ctx.stroke(); }
      if (!sameGroup(x, y, x + 1, y)) { ctx.beginPath(); ctx.moveTo(px, b);  ctx.lineTo(r, b);  ctx.stroke(); }
      if (!sameGroup(x, y, x, y - 1)) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, b); ctx.stroke(); }
      if (!sameGroup(x, y, x, y + 1)) { ctx.beginPath(); ctx.moveTo(r, py);  ctx.lineTo(r, b);  ctx.stroke(); }
    }
  }

  // Pass 3: highlight cells currently in the in-progress Join selection.
  if (pendingGroup.length > 0) {
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    const inset = 4;
    for (const p of pendingGroup) {
      ctx.strokeRect(
        p.y * pixelCellSize + inset,
        p.x * pixelCellSize + inset,
        pixelCellSize - inset * 2,
        pixelCellSize - inset * 2
      );
    }
    ctx.lineWidth = 1;
  }

  // Draw the symbols.
  // For galaxy/lotus (symmetry symbols), the draw center follows the group
  // centroid when the symbol sits on a grouped cell — visually that lands on
  // the corner / edge where the group's cells meet, which matches what the
  // verifier uses for symmetry math. Other symbol kinds are tied to a single
  // cell and stay put.
  for (const symbol of game.symbols) {
    const drawCenter =
      symbol.kind === 'galaxy' || symbol.kind === 'lotus'
        ? getSymbolCenter(game, symbol.pos)
        : { x: symbol.pos.x, y: symbol.pos.y };

    const cx = drawCenter.y * pixelCellSize + pixelCellSize / 2;
    const cy = drawCenter.x * pixelCellSize + pixelCellSize / 2;

    ctx.fillStyle = game.board[symbol.pos.x][symbol.pos.y] == Cell.Dark ? 'white' : 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw the number on top of the cell
    if (symbol.kind == 'area' || symbol.kind == 'viewpoint' || symbol.kind == 'dart') {
      ctx.font = 'bold ' + Math.floor(pixelCellSize / 2) + 'px Arial';
      ctx.fillText(symbol.count.toString(), cx, cy);
    }

    if (symbol.kind == 'lotus') {
      ctx.font = 'bold ' + Math.floor(pixelCellSize / 2) + 'px Arial';
      let text: string;
      if (symbol.rotation == 0) {
        text = '↕';
      } else if (symbol.rotation == 1) {
        text = '⤢';
      } else if (symbol.rotation == 2) {
        text = '↔';
      } else if (symbol.rotation == 3) {
        text = '⤡';
      }
      ctx.fillText(text!, cx, cy);
    }

    if (symbol.kind != 'area') {
      ctx.font = Math.floor(pixelCellSize / 4) + 'px Arial';

      let text = symbol.kind;
      if (symbol.kind == 'dart') {
        if (symbol.direction == 'up') {
          text += ' ↑';
        } else if (symbol.direction == 'down') {
          text += ' ↓';
        } else if (symbol.direction == 'left') {
          text += ' ←';
        } else if (symbol.direction == 'right') {
          text += ' →';
        }
      }

      ctx.fillText(text, cx, cy + pixelCellSize * 0.3);
    }
  }
}

// Function to handle cell color change on mouse move
function handleMouseMove(event: MouseEvent) {
  if (getMode() != 'cell' && getMode() != 'border') return;
  if (!isMouseDown) return;

  const pos = getMouseCellPos(event);
  if (!pos) return;

  // Snapshot once per drag — covers the case where mousedown started outside
  // the canvas (no snapshot taken there) and the drag enters it now.
  if (!dragSnapshotTaken) {
    snapshotGame();
    dragSnapshotTaken = true;
  }

  game.board[pos.x][pos.y] = mouseCell;
  drawGame(game);
}

// Function to handle cell color change on mouse down
function handleMouseDown(event: MouseEvent) {
  // Join mode has its own handling: discrete clicks, not a paint-drag.
  if (getMode() == 'join') {
    const pos = getMouseCellPos(event);
    if (!pos) return;
    if (event.button == 0) handleJoinLeftClick(pos);
    else if (event.button == 2) handleJoinRightClick(pos);
    return;
  }

  if (getMode() != 'cell' && getMode() != 'border') return;

  isMouseDown = true;
  dragSnapshotTaken = false; // reset per drag; first cell paint will snapshot

  if (getMode() == 'border') {
    if (event.button == 0) {
      mouseCell = Cell.Border;
    } else if (event.button == 2) {
      mouseCell = Cell.Empty;
    }
  } else {
    if (event.button == 0) {
      mouseCell = Cell.Dark; // Left click
    } else if (event.button == 2) {
      mouseCell = Cell.Light; // Right click
    } else if (event.button == 1) {
      mouseCell = Cell.Empty; // Middle click
    }
  }

  const pos = getMouseCellPos(event);
  if (!pos) return;

  snapshotGame();
  dragSnapshotTaken = true;

  game.board[pos.x][pos.y] = mouseCell;
  drawGame(game);
}

// Function to handle cell color change on mouse up
function handleMouseUp() {
  if (getMode() != 'cell' && getMode() != 'border') return;
  isMouseDown = false;
  dragSnapshotTaken = false;
}

function getMouseCellPos(event: MouseEvent): Pos | null {
  const pixelX = event.pageX - rect.left;
  const pixelY = event.pageY - rect.top;

  const x = Math.floor(pixelY / pixelCellSize);
  const y = Math.floor(pixelX / pixelCellSize);

  if (x < 0 || x >= game.sizeX || y < 0 || y >= game.sizeY) return null;

  return { x, y };
}

// Function to reset the game
function resetGame() {
  const sizeX = parseInt((document.getElementById('size-x')! as HTMLInputElement).value);
  const sizeY = parseInt((document.getElementById('size-y')! as HTMLInputElement).value);

  if (isNaN(sizeX) || isNaN(sizeY) || sizeX < 1 || sizeY < 1) {
    alert('Invalid size!');
    return;
  }

  snapshotGame();
  game = createEmptyGame(sizeX, sizeY);
  pendingGroup = [];

  drawGame(game);
  updateRuleList();
}

// Function to create an empty game
function createEmptyGame(sizeX: number, sizeY: number): Game {
  const board: Board = [];

  for (let x = 0; x < sizeX; x++) {
    board.push([]);
    for (let y = 0; y < sizeY; y++) {
      board[x].push(Cell.Empty);
    }
  }

  return {
    board,
    rules: [],
    symbols: [],
    groups: [],
    sizeX,
    sizeY
  };
}

// Function to solve the game
function solveBoard() {
  console.log('Solving the game...');

  snapshotGame();

  const underclueIdx = game.rules.findIndex(r => r.kind == 'underclue');
  if (underclueIdx === -1) {
    console.time();
    const success = solveAdvanced(game);
    console.timeEnd();

    if (!success) alert('No valid solutions found!');

    drawGame(game);
    return;
  }

  const rule = game.rules[underclueIdx] as UndercluedRule;
  // Strip the Underclued rule before probing so admitsSolution() doesn't recurse.
  const probeGame: Game = { ...game, rules: game.rules.filter((_, i) => i !== underclueIdx) };

  console.time();
  const { forced, unsolvable } = findForcedCells(probeGame);
  console.timeEnd();

  if (unsolvable) {
    alert('Puzzle has no valid solution.');
    return;
  }
  if (forced.length !== rule.count) {
    alert(
      `Underclued: found ${forced.length} forced cell(s) but rule requires exactly ${rule.count}. Board unchanged.`
    );
    return;
  }
  for (const { x, y, color } of forced) game.board[x][y] = color;
  drawGame(game);
}

// Function to get the item mode
function getMode(): string {
  return (document.getElementById('item-select')! as HTMLSelectElement).value;
}

function getInput(event: MouseEvent, out: (value: string) => void) {
  const inputBox = document.createElement('input');
  inputBox.id = 'input-box';
  inputBox.style.left = `${event.pageX}px`;
  inputBox.style.top = `${event.pageY}px`;
  document.body.appendChild(inputBox);

  window.requestAnimationFrame(() => inputBox.focus());

  inputBox.addEventListener('keydown', e => {
    if (e.key != 'Enter') return;

    const value = inputBox.value;
    inputBox.blur();

    out(value);
  });

  inputBox.addEventListener('blur', () => {
    inputBox.remove();
  });
}

function handlePlaceSymbol(event: MouseEvent) {
  const mode = getMode();
  if (mode == 'cell' || mode == 'border' || mode == 'join') return;

  const pos = getMouseCellPos(event);
  if (!pos) return;

  if (event.button == 2) {
    // Remove symbol. Group-aware: a galaxy/lotus on a 2x2 group renders at the
    // group's centroid (between cells), so the user might right-click any cell
    // of the group to remove it. We accept that by treating a click anywhere
    // in a group as a click on the symbol anchored to that group.
    snapshotGame();

    const clickGroup = findGroupContaining(game, pos);
    game.symbols = game.symbols.filter(s => {
      if (s.pos.x === pos.x && s.pos.y === pos.y) return false;
      if (clickGroup && clickGroup.some(p => p.x === s.pos.x && p.y === s.pos.y)) return false;
      return true;
    });
  } else if (event.button == 0) {
    // Place symbol

    // Symbols with input

    if (
      mode == 'area' ||
      mode == 'viewpoint' ||
      mode == 'dart 0' ||
      mode == 'dart 1' ||
      mode == 'dart 2' ||
      mode == 'dart 3'
    ) {
      getInput(event, value => {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) return;

        snapshotGame();

        let symbol: Symbol;
        if (mode == 'area') {
          symbol = { kind: 'area', pos, count: num };
        } else if (mode == 'viewpoint') {
          symbol = { kind: 'viewpoint', pos, count: num };
        } else if (mode == 'dart 0') {
          symbol = { kind: 'dart', pos, count: num, direction: Direction.Up };
        } else if (mode == 'dart 1') {
          symbol = { kind: 'dart', pos, count: num, direction: Direction.Down };
        } else if (mode == 'dart 2') {
          symbol = { kind: 'dart', pos, count: num, direction: Direction.Left };
        } else if (mode == 'dart 3') {
          symbol = { kind: 'dart', pos, count: num, direction: Direction.Right };
        }

        // If a symbol already exists at pos, remove it
        game.symbols = game.symbols.filter(s => s.pos.x != pos.x || s.pos.y != pos.y);

        // Add the symbol
        game.symbols.push(symbol!);

        drawGame(game);
      });

      return;
    }

    // Symbols without input
    snapshotGame();

    let symbol: Symbol;
    if (mode == 'galaxy') {
      symbol = { kind: 'galaxy', pos };
    } else if (mode == 'lotus 0') {
      symbol = { kind: 'lotus', pos, rotation: 0 };
    } else if (mode == 'lotus 1') {
      symbol = { kind: 'lotus', pos, rotation: 1 };
    } else if (mode == 'lotus 2') {
      symbol = { kind: 'lotus', pos, rotation: 2 };
    } else if (mode == 'lotus 3') {
      symbol = { kind: 'lotus', pos, rotation: 3 };
    }

    // If a symbol already exists at pos, remove it
    game.symbols = game.symbols.filter(s => s.pos.x != pos.x || s.pos.y != pos.y);

    // Add the symbol
    game.symbols.push(symbol!);
  }

  drawGame(game);
}

function handleAddRule(event: MouseEvent) {
  const rule = (document.getElementById('rule-select')! as HTMLSelectElement).value;
  if (rule == 'connected dark') {
    snapshotGame();
    game.rules.push({ kind: 'connected', color: Cell.Dark });
    updateRuleList();
  } else if (rule == 'connected light') {
    snapshotGame();
    game.rules.push({ kind: 'connected', color: Cell.Light });
    updateRuleList();
  } else if (rule == 'area dark' || rule == 'area light') {
    getInput(event, value => {
      const num = parseInt(value);
      if (isNaN(num) || num < 1) return;

      snapshotGame();
      if (rule == 'area dark') {
        game.rules.push({ kind: 'area', color: Cell.Dark, count: num });
      } else if (rule == 'area light') {
        game.rules.push({ kind: 'area', color: Cell.Light, count: num });
      }

      updateRuleList();
    });
  } else if (rule == 'underclue') {
    getInput(event, value => {
      const num = parseInt(value);
      if (isNaN(num) || num < 0) return;

      snapshotGame();
      game.rules.push({ kind: 'underclue', count: num });
      updateRuleList();
    });
  } else if (rule == 'bad_pattern_line dark' || rule == 'bad_pattern_line light') {
    getInput(event, value => {
      const num = parseInt(value);
      if (isNaN(num) || num < 1) return;

      snapshotGame();
      const color = rule == 'bad_pattern_line dark' ? Cell.Dark : Cell.Light;
      game.rules.push({ kind: 'bad_pattern_line', color, length: num });
      updateRuleList();
    });
  } else if (rule == 'bad_pattern_t dark') {
    snapshotGame();
    game.rules.push({ kind: 'bad_pattern_t', color: Cell.Dark });
    updateRuleList();
  } else if (rule == 'bad_pattern_t light') {
    snapshotGame();
    game.rules.push({ kind: 'bad_pattern_t', color: Cell.Light });
    updateRuleList();
  } else if (rule == 'bad_pattern_checkerboard') {
    snapshotGame();
    game.rules.push({ kind: 'bad_pattern_checkerboard' });
    updateRuleList();
  } else if (rule == 'bad_pattern_almost_square dark') {
    snapshotGame();
    game.rules.push({ kind: 'bad_pattern_almost_square', color: Cell.Dark });
    updateRuleList();
  } else if (rule == 'bad_pattern_almost_square light') {
    snapshotGame();
    game.rules.push({ kind: 'bad_pattern_almost_square', color: Cell.Light });
    updateRuleList();
  } else if (rule == 'bad_pattern_snake dark') {
    snapshotGame();
    game.rules.push({ kind: 'bad_pattern_snake', color: Cell.Dark });
    updateRuleList();
  } else if (rule == 'bad_pattern_snake light') {
    snapshotGame();
    game.rules.push({ kind: 'bad_pattern_snake', color: Cell.Light });
    updateRuleList();
  }
}

function handleClearRules() {
  snapshotGame();
  game.rules = [];
  updateRuleList();
}

function updateRuleList() {
  const list = document.getElementById('rule-list')!;
  list.innerHTML = '';

  for (const rule of game.rules) {
    const element = document.createElement('li');

    if (rule.kind == 'connected') {
      element.textContent = `Connect all ${rule.color == Cell.Dark ? 'dark' : 'light'} cells`;
    } else if (rule.kind == 'area') {
      element.textContent = `All ${rule.color == Cell.Dark ? 'dark' : 'light'} regions have area ${rule.count}`;
    } else if (rule.kind == 'underclue') {
      element.textContent = `Underclued: fill ${rule.count} forced cell${rule.count == 1 ? '' : 's'}`;
    } else if (rule.kind == 'bad_pattern_line') {
      element.textContent = `No ${rule.length} ${rule.color == Cell.Dark ? 'dark' : 'light'} cells in a row or column`;
    } else if (rule.kind == 'bad_pattern_t') {
      element.textContent = `No T-shape of ${rule.color == Cell.Dark ? 'dark' : 'light'} cells`;
    } else if (rule.kind == 'bad_pattern_checkerboard') {
      element.textContent = `No 2×2 checkerboard pattern`;
    } else if (rule.kind == 'bad_pattern_almost_square') {
      const majority = rule.color == Cell.Dark ? 'dark' : 'light';
      const minority = rule.color == Cell.Dark ? 'light' : 'dark';
      element.textContent = `No 2×2 with three ${majority} cells and one ${minority} cell`;
    } else if (rule.kind == 'bad_pattern_snake') {
      element.textContent = `No snake/zig-zag of ${rule.color == Cell.Dark ? 'dark' : 'light'} cells`;
    }

    list.appendChild(element);
  }
}

function handleImport(event: MouseEvent) {
  getInput(event, value => {
    if (value == '') return;

    try {
      const parsed = JSON.parse(value);
      // Snapshot only after a successful parse — a malformed input shouldn't
      // pollute the undo stack.
      snapshotGame();
      game = parsed;
      ensureGroups(game);
      pendingGroup = [];

      drawGame(game);
      updateRuleList();
    } catch (err) {
      console.error(err);
      alert('Import failed! See console for more details.');
    }
  });
}

function handlePreset(event: Event) {
  const preset = (event.target as HTMLSelectElement).value;

  if (preset == 'none') {
    // resetGame() already snapshots
    resetGame();
  } else {
    snapshotGame();
    game = JSON.parse(presets[parseInt(preset) - 1]);
    ensureGroups(game);
    pendingGroup = [];
  }
  drawGame(game);
  updateRuleList();
}

function handleExport() {
  console.log(JSON.stringify(game));

  alert('Game has been printed to the console.\nPress Ctrl+Shift+I to view it.');
}

canvas.addEventListener('mousedown', handleMouseDown);
window.addEventListener('mouseup', handleMouseUp);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('contextmenu', event => event.preventDefault());

document.getElementById('reset-button')!.addEventListener('click', resetGame);
document.getElementById('add-rule-button')!.addEventListener('click', handleAddRule);
document.getElementById('clear-rules-button')!.addEventListener('click', handleClearRules);
document.getElementById('preset-select')!.addEventListener('change', handlePreset);
document.getElementById('import-button')!.addEventListener('click', handleImport);
document.getElementById('export-button')!.addEventListener('click', handleExport);
document.getElementById('solve-button')!.addEventListener('click', solveBoard);
document.getElementById('undo-button')!.addEventListener('click', handleUndo);
document.getElementById('commit-group-button')!.addEventListener('click', handleCommitGroup);
document.getElementById('item-select')!.addEventListener('change', updateCommitGroupVisibility);

canvas.addEventListener('mousedown', handlePlaceSymbol);
