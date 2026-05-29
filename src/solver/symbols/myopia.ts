import { Board, Cell, Color, Pos, Direction, getOppositeColor, getDirOffset, verifyPos } from '..';

// Myopia Arrows. A symbol bearing 1–4 cardinal arrows: the arrows point in
// every direction where the nearest opposite-colour cell lies, and ONLY
// those directions (multiple arrows may be present for ties).
//
// Formally: if the symbol's cell ends up with colour C, look in each cardinal
// direction and find the distance to the nearest cell of colour ¬C (or ∞ if
// the path reaches a border or board edge first). Let d_min be the minimum of
// those four distances. The arrow points in direction d iff distance[d] = d_min
// (and d_min is finite — every Myopia must point at some opposite-colour cell).
export interface MyopiaSymbol {
  kind: 'myopia';
  pos: Pos;
  // 1–4 of Up/Down/Left/Right. Order isn't load-bearing for verification but
  // we store them in canonical order (Up, Down, Left, Right) for clean
  // serialisation and equality.
  directions: Direction[];
}

const ALL_DIRS: Direction[] = [Direction.Up, Direction.Down, Direction.Left, Direction.Right];

interface DirWalkResult {
  // Distance to first DEFINITE opposite-colour cell along the path, or null
  // if the path reached a border / edge without finding one.
  definiteDistance: number | null;
  // Empty cells encountered before the definite opposite (or before path end).
  // While any of these are empty, the actual distance for this direction is
  // uncertain — could be lower than definiteDistance if an earlier empty
  // becomes opposite, or higher than null-implies-infinity if a later empty
  // becomes opposite.
  emptiesInPath: Pos[];
}

function walkDirection(board: Board, pos: Pos, dir: Direction, opposite: Color): DirWalkResult {
  const [dx, dy] = getDirOffset(dir);
  let d = 1;
  let x = pos.x + dx;
  let y = pos.y + dy;
  const empties: Pos[] = [];

  while (verifyPos(board, { x, y })) {
    const c = board[x][y];
    if (c === Cell.Border) break;
    if (c === opposite) return { definiteDistance: d, emptiesInPath: empties };
    if (c === Cell.Empty) empties.push({ x, y });
    // Same-colour cells just keep the walk going.
    d++;
    x += dx;
    y += dy;
  }

  return { definiteDistance: null, emptiesInPath: empties };
}

export function verifyMyopiaSymbol(board: Board, symbol: MyopiaSymbol): Pos[] | false {
  const cell = board[symbol.pos.x][symbol.pos.y];
  // Host colour not yet decided — defer; flag the symbol cell as the one cell
  // we need to see resolved before we can verify anything.
  if (cell === Cell.Empty) return [symbol.pos];

  const opposite = getOppositeColor(cell as Color);
  const walks: Record<Direction, DirWalkResult> = {} as Record<Direction, DirWalkResult>;
  for (const dir of ALL_DIRS) walks[dir] = walkDirection(board, symbol.pos, dir, opposite);

  // Definite-failure check: an arrowed direction with no opposite found AND no
  // empties to potentially become one means this direction can never satisfy
  // the arrow.
  for (const arrowDir of symbol.directions) {
    const w = walks[arrowDir];
    if (w.definiteDistance === null && w.emptiesInPath.length === 0) return false;
  }

  // Uncertainty deferral: if ANY direction still has empties in its path the
  // distance is not yet pinned down, so we can't run the tight check. Return
  // every empty seen as "affected" so the advanced solver re-checks when any
  // of them resolves.
  const affected: Pos[] = [];
  for (const dir of ALL_DIRS) affected.push(...walks[dir].emptiesInPath);
  if (affected.length > 0) return affected;

  // From here, every direction's distance is fully determined (a number or
  // null = ∞). Pin d_min from the finite distances; if none exist the symbol
  // is unsatisfiable (Myopia must point at SOME opposite).
  const finiteDistances = ALL_DIRS
    .map(d => walks[d].definiteDistance)
    .filter((d): d is number => d !== null);
  if (finiteDistances.length === 0) return false;
  const dMin = Math.min(...finiteDistances);

  const arrowSet = new Set(symbol.directions);
  for (const dir of ALL_DIRS) {
    const dist = walks[dir].definiteDistance;
    const hasArrow = arrowSet.has(dir);
    if (hasArrow) {
      // Arrowed direction must hit d_min exactly.
      if (dist !== dMin) return false;
    } else {
      // Non-arrowed direction must be strictly further than d_min (or ∞).
      if (dist !== null && dist <= dMin) return false;
    }
  }

  return [];
}
