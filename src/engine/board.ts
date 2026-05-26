/**
 * Board model for "Meio Jogo" co-op mode.
 *
 * The board is a fixed square grid. Pieces don't fall — players place them
 * manually at any (x, y) anchor, provided the piece's painted cells land on
 * empty squares and stay inside the grid. Line clears are still honored
 * after each successful placement (both rows and columns).
 */

import type { Board, BoardCell, Matrix, Piece } from './types';

export function createBoard(size: 8 | 10): Board {
    return Array.from({ length: size }, () =>
        Array.from({ length: size }, () => null as BoardCell));
}

export function cloneBoard(board: Board): Board {
    return board.map(row => row.slice());
}

/**
 * Does `piece.matrix` fit if its (0,0) corner lands at (atX, atY)?
 * The piece must stay in-bounds AND only overlap empty cells.
 */
export function canPlace(board: Board, piece: Piece, atX: number, atY: number): boolean {
    const size = board.length;
    const m: Matrix = piece.matrix;
    for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
            if (m[r][c] === 0) continue;
            const bx = atX + c;
            const by = atY + r;
            if (bx < 0 || by < 0 || bx >= size || by >= size) return false;
            if (board[by][bx] !== null) return false;
        }
    }
    return true;
}

/**
 * Place the piece. Returns the new board and the list of cells that were
 * painted. Throws if placement is invalid — call {@link canPlace} first.
 */
export function place(
    board: Board, piece: Piece, atX: number, atY: number,
): { board: Board; painted: { x: number; y: number }[] } {
    if (!canPlace(board, piece, atX, atY)) {
        throw new Error(`Invalid placement for piece ${piece.id} at (${atX}, ${atY})`);
    }
    const next = cloneBoard(board);
    const painted: { x: number; y: number }[] = [];
    const m = piece.matrix;
    for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
            if (m[r][c] === 0) continue;
            next[atY + r][atX + c] = piece.color;
            painted.push({ x: atX + c, y: atY + r });
        }
    }
    return { board: next, painted };
}

/** Has at least one valid spot for `piece` on `board` (any anchor)? */
export function hasAnyValidSpot(board: Board, piece: Piece): boolean {
    const size = board.length;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (canPlace(board, piece, x, y)) return true;
        }
    }
    return false;
}

/**
 * Clear any fully-painted rows AND columns. Returns the cleared indices and
 * the resulting board. Cleared cells are reset to `null` — nothing falls.
 */
export function clearFullLines(board: Board): {
    board: Board; rows: number[]; cols: number[];
} {
    const size = board.length;
    const fullRows: number[] = [];
    const fullCols: number[] = [];
    for (let r = 0; r < size; r++) {
        if (board[r].every(cell => cell !== null)) fullRows.push(r);
    }
    for (let c = 0; c < size; c++) {
        let full = true;
        for (let r = 0; r < size; r++) {
            if (board[r][c] === null) { full = false; break; }
        }
        if (full) fullCols.push(c);
    }
    if (fullRows.length === 0 && fullCols.length === 0) {
        return { board, rows: [], cols: [] };
    }
    const next = cloneBoard(board);
    for (const r of fullRows) {
        for (let c = 0; c < size; c++) next[r][c] = null;
    }
    for (const c of fullCols) {
        for (let r = 0; r < size; r++) next[r][c] = null;
    }
    return { board: next, rows: fullRows, cols: fullCols };
}
