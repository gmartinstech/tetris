/**
 * 90° clockwise rotation for piece matrices.
 *
 * The rotation is pure: it returns a fresh matrix and never mutates input.
 * Always call this before validating placement — the engine relies on the
 * returned shape being the new canonical form of the piece.
 */

import type { Matrix, Piece } from './types';

/** Rotate a matrix 90° clockwise. New row = reversed old column. */
export function rotateClockwise(matrix: Matrix): Matrix {
    if (matrix.length === 0) return [];
    const rows = matrix.length;
    const cols = matrix[0].length;
    const out: Matrix = Array.from({ length: cols }, () =>
        Array.from({ length: rows }, () => 0 as 0 | 1));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            out[c][rows - 1 - r] = matrix[r][c];
        }
    }
    return out;
}

/** Convenience: rotate `times` quarter turns clockwise. */
export function rotateClockwiseN(matrix: Matrix, times: number): Matrix {
    let m = matrix;
    const n = ((times % 4) + 4) % 4;
    for (let i = 0; i < n; i++) m = rotateClockwise(m);
    return m;
}

/** Strip rows / columns that are entirely empty. Used after rotation. */
export function trim(matrix: Matrix): Matrix {
    if (matrix.length === 0) return matrix;
    let top = 0, bottom = matrix.length - 1;
    while (top <= bottom && matrix[top].every(v => v === 0)) top++;
    while (bottom >= top && matrix[bottom].every(v => v === 0)) bottom--;
    if (top > bottom) return [];
    let left = 0, right = matrix[0].length - 1;
    while (left <= right && matrix.every(row => row[left] === 0)) left++;
    while (right >= left && matrix.every(row => row[right] === 0)) right--;
    const out: Matrix = [];
    for (let r = top; r <= bottom; r++) {
        out.push(matrix[r].slice(left, right + 1) as (0 | 1)[]);
    }
    return out;
}

/**
 * Apply a rotation to a {@link Piece}, returning a new piece object.
 * The block count stays the same (cached on the original).
 */
export function rotatePiece(piece: Piece): Piece {
    return {
        ...piece,
        matrix: trim(rotateClockwise(piece.matrix)),
    };
}
