# Logic Grid Solver

> This is a fork of alaggydev's logic-grid-solver project. I am simply using this to test out Claude Code and see if I can't improve on the project by adding additional rules and tile types for it to solve.

A solver designed to solve logic grids in Islands of Insight automatically.

This solver is VERY incomplete and ugly, only a subset of rules & symbols are implemented right now.

## Usages

```
# 1. Clone this project
git clone https://github.com/ALaggyDev/logic-grid-solver

# 2. Install parcel
npm install parcel --global

# 3. Build
npm run dev
```

## Implemented rules & symbols

#### Rules

- connected
- area
- underclued

#### Symbols

- area
- dart
- viewpoint
- galaxy
- lotus

## How this works

This solver uses a technique called backtracking. Essentially, the solver recursively guesses cells, and backtrack if the guesses are wrong. The process continues until a solution have been found. Some heuristics (e.g. Most Constrained Variable) are also implemented on certain rules & symbols to speed up the process. The solver is smart enough to first guess cells that are more constrained than other cells.

The solver is decently fast when solving a more constrained puzzle. Typically a solution is found before one second. If a solution is not found with a few seconds, chances are that the solution will not be found by the solver.
