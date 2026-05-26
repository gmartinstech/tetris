/**
 * Piece shape catalogue, expressed as matrices.
 *
 * Each shape is stored in its tightest bounding box (no leading or trailing
 * empty rows / columns). Rotation expands the matrix as needed.
 *
 * The library is partitioned into three tiers so the balanced generator
 * (see {@link PieceGenerator}) can draw selectively when it owes the team
 * a relief piece.
 */

import type { Matrix, PieceTier } from './types';

export interface ShapeTemplate {
    readonly id: string;
    readonly matrix: Matrix;
    readonly blocks: number;
    readonly tier: PieceTier;
}

const m = (rows: ReadonlyArray<ReadonlyArray<number>>): Matrix =>
    rows.map(r => r.map(v => (v ? 1 : 0)) as (0 | 1)[]);

const countBlocks = (mat: Matrix): number => {
    let total = 0;
    for (const row of mat) for (const v of row) total += v;
    return total;
};

const tierFor = (blocks: number): PieceTier =>
    blocks <= 2 ? 'relief' : blocks >= 5 ? 'complex' : 'standard';

const build = (id: string, rows: ReadonlyArray<ReadonlyArray<number>>): ShapeTemplate => {
    const matrix = m(rows);
    const blocks = countBlocks(matrix);
    return { id, matrix, blocks, tier: tierFor(blocks) };
};

/** Relief tier: 1–2 blocks. These are the "valve" pieces. */
export const RELIEF_SHAPES: readonly ShapeTemplate[] = [
    build('mono', [[1]]),
    build('domino-h', [[1, 1]]),
    build('domino-v', [[1], [1]]),
];

/** Standard tier: 3–4 blocks (triominoes + classic tetrominoes). */
export const STANDARD_SHAPES: readonly ShapeTemplate[] = [
    build('tri-I-h', [[1, 1, 1]]),
    build('tri-L-a', [[1, 0], [1, 1]]),
    build('tri-L-b', [[1, 1], [1, 0]]),
    build('tri-L-c', [[1, 1], [0, 1]]),
    build('tri-L-d', [[0, 1], [1, 1]]),
    build('tet-I',  [[1, 1, 1, 1]]),
    build('tet-O',  [[1, 1], [1, 1]]),
    build('tet-T',  [[1, 1, 1], [0, 1, 0]]),
    build('tet-L',  [[1, 0], [1, 0], [1, 1]]),
    build('tet-J',  [[0, 1], [0, 1], [1, 1]]),
    build('tet-S',  [[0, 1, 1], [1, 1, 0]]),
    build('tet-Z',  [[1, 1, 0], [0, 1, 1]]),
];

/** Complex tier: 5+ blocks. These trigger the relief debt. */
export const COMPLEX_SHAPES: readonly ShapeTemplate[] = [
    build('pent-cross', [[0, 1, 0], [1, 1, 1], [0, 1, 0]]),
    build('pent-L',     [[1, 0], [1, 0], [1, 0], [1, 1]]),
    build('pent-J',     [[0, 1], [0, 1], [0, 1], [1, 1]]),
    build('pent-T',     [[1, 1, 1], [0, 1, 0], [0, 1, 0]]),
    build('pent-U',     [[1, 0, 1], [1, 1, 1]]),
    build('pent-P',     [[1, 1], [1, 1], [1, 0]]),
    build('pent-Z',     [[1, 1, 0], [0, 1, 0], [0, 1, 1]]),
    build('pent-W',     [[1, 0, 0], [1, 1, 0], [0, 1, 1]]),
    build('hex-bigL',   [[1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 1, 1]]),
    build('hex-bigT',   [[1, 1, 1, 1, 1], [0, 0, 1, 0, 0]]),
    build('hex-stair',  [[1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 1]]),
];

export const ALL_SHAPES: readonly ShapeTemplate[] = [
    ...RELIEF_SHAPES, ...STANDARD_SHAPES, ...COMPLEX_SHAPES,
];

export const SHAPES_BY_TIER: Readonly<Record<PieceTier, readonly ShapeTemplate[]>> = {
    relief: RELIEF_SHAPES,
    standard: STANDARD_SHAPES,
    complex: COMPLEX_SHAPES,
};
