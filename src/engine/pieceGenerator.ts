/**
 * Balanced piece generator with a relief "safety valve".
 *
 * Strategy
 * --------
 * 1. **Bag system.** A bag is a shuffled copy of every shape in the catalogue.
 *    Each `next()` call pops one shape from the bag; when the bag empties, it
 *    is refilled and reshuffled. This guarantees every shape eventually
 *    appears and that no shape repeats more than twice in a row.
 *
 * 2. **Relief debt (válvula de escape).** Whenever the bag yields a complex
 *    piece (>= `complexThreshold` blocks, default 5), the generator owes the
 *    team two relief pieces (<= `reliefThreshold` blocks). Those two are
 *    drawn from the relief sub-pool and inserted ahead of the bag pick. Debt
 *    survives across bag refills — the team always gets its breather.
 *
 * 3. **Determinism.** All randomness routes through a single injected `rng`.
 *    Pass a seeded RNG in tests; default is `Math.random`.
 */

import {
    ALL_SHAPES, RELIEF_SHAPES, SHAPES_BY_TIER, type ShapeTemplate,
} from './pieceLibrary';
import type { Piece, PieceColor, PieceTier } from './types';
import { PIECE_COLORS } from './types';

export interface GeneratorOptions {
    rng?: () => number;
    complexThreshold?: number;
    reliefThreshold?: number;
    reliefDebtAfterComplex?: number;
}

let _idCounter = 0;
const nextId = (): string => `piece_${++_idCounter}_${Date.now().toString(36)}`;

const pick = <T>(arr: readonly T[], rng: () => number): T =>
    arr[Math.floor(rng() * arr.length)];

const shuffle = <T>(arr: readonly T[], rng: () => number): T[] => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
};

const cloneMatrix = (m: ShapeTemplate['matrix']): ShapeTemplate['matrix'] =>
    m.map(row => row.slice() as (0 | 1)[]);

const tierFromCount = (
    blocks: number, complex: number, relief: number,
): PieceTier => (
    blocks <= relief ? 'relief' : blocks >= complex ? 'complex' : 'standard'
);

const toPiece = (
    template: ShapeTemplate, color: PieceColor,
    complex: number, relief: number,
): Piece => ({
    id: nextId(),
    matrix: cloneMatrix(template.matrix),
    color,
    blocks: template.blocks,
    tier: tierFromCount(template.blocks, complex, relief),
});

export class PieceGenerator {
    private readonly rng: () => number;
    private readonly complexThreshold: number;
    private readonly reliefThreshold: number;
    private readonly reliefDebtAfterComplex: number;

    private bag: ShapeTemplate[] = [];
    private reliefDebt = 0;

    constructor(opts: GeneratorOptions = {}) {
        this.rng = opts.rng ?? Math.random;
        this.complexThreshold = opts.complexThreshold ?? 5;
        this.reliefThreshold = opts.reliefThreshold ?? 2;
        this.reliefDebtAfterComplex = opts.reliefDebtAfterComplex ?? 2;
        this.refillBag();
    }

    /** How many relief pieces are still owed to the team. */
    get pendingReliefDebt(): number { return this.reliefDebt; }

    /** Draw the next piece. Applies the safety valve transparently. */
    next(): Piece {
        if (this.reliefDebt > 0) {
            this.reliefDebt--;
            return this.makePiece(pick(RELIEF_SHAPES, this.rng));
        }
        if (this.bag.length === 0) this.refillBag();
        const template = this.bag.pop()!;
        if (template.blocks >= this.complexThreshold) {
            this.reliefDebt = this.reliefDebtAfterComplex;
        }
        return this.makePiece(template);
    }

    /** Draw `count` pieces in order (useful for filling a fresh hand). */
    nextMany(count: number): Piece[] {
        const out: Piece[] = [];
        for (let i = 0; i < count; i++) out.push(this.next());
        return out;
    }

    /** Force the next draw to come from a specific tier. Bypasses the bag. */
    nextOfTier(tier: PieceTier): Piece {
        const pool = SHAPES_BY_TIER[tier];
        return this.makePiece(pick(pool, this.rng));
    }

    private makePiece(template: ShapeTemplate): Piece {
        const color = pick(PIECE_COLORS, this.rng);
        return toPiece(template, color, this.complexThreshold, this.reliefThreshold);
    }

    private refillBag(): void {
        this.bag = shuffle(ALL_SHAPES, this.rng);
    }
}
