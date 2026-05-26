/**
 * Core type definitions for the Meio Jogo cooperative engine.
 *
 * A piece is stored as a rectangular {@link Matrix} of 0/1 cells. The 1-cells
 * are the painted blocks; the surrounding 0-cells are the rotation envelope.
 * Keeping pieces as matrices (instead of coordinate lists) makes 90° rotation
 * a trivial transposition.
 */

export type Cell = 0 | 1;

/** A rectangular grid of cells. `matrix[row][col]` — y first, then x. */
export type Matrix = Cell[][];

/** A board cell is either empty (`null`) or owned by a piece (color tag). */
export type BoardCell = null | PieceColor;

/** The board itself: a square 2D grid of `BoardCell`. */
export type Board = BoardCell[][];

/** Painted-wood gouache piece colors (see DESIGN.md). */
export type PieceColor =
    | 'brick'
    | 'ochre'
    | 'sage'
    | 'slate'
    | 'mustard'
    | 'plum';

export const PIECE_COLORS: readonly PieceColor[] = [
    'brick', 'ochre', 'sage', 'slate', 'mustard', 'plum',
] as const;

/** Difficulty bucket used by the balanced generator. */
export type PieceTier = 'relief' | 'standard' | 'complex';

/**
 * A playable piece. `matrix` rotates; `blocks` is the canonical block count
 * (it never changes under rotation, so we cache it).
 */
export interface Piece {
    readonly id: string;
    matrix: Matrix;
    color: PieceColor;
    readonly blocks: number;
    readonly tier: PieceTier;
}

/** Per-player queue of pieces currently in hand. */
export interface PlayerHand {
    readonly playerId: string;
    queue: Piece[];
}

/** Position on the board (column, row). */
export interface Coord {
    x: number;
    y: number;
}

/** Snapshot of the entire game state. */
export interface GameState {
    board: Board;
    size: number;
    players: Record<string, PlayerHand>;
    sharedReserve: (Piece | null)[];
    reserveCapacity: number;
}

/** Configurable engine knobs. */
export interface EngineConfig {
    /** 8 or 10. Defaults to 10. */
    boardSize?: 8 | 10;
    /** How many slots in the cooperative reserve. Defaults to 3. */
    reserveCapacity?: number;
    /** Pieces held per player at any time. Defaults to 3. */
    handSize?: number;
    /** Block count threshold that classifies a piece as "complex". Default: 5. */
    complexThreshold?: number;
    /** Block count threshold for "relief" pieces. Default: 2. */
    reliefThreshold?: number;
    /** How many relief pieces follow each complex one. Default: 2. */
    reliefDebtAfterComplex?: number;
    /** Injected RNG (0..1). Defaults to Math.random — override for tests. */
    rng?: () => number;
}
