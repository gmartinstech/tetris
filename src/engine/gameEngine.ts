/**
 * GameEngine — the orchestrator.
 *
 * Owns:
 *   - the board (fixed 8×8 or 10×10 grid; manual placement, no gravity);
 *   - one {@link PieceGenerator} shared by the team so the relief debt is
 *     truly cooperative (a complex piece dealt to either player still bends
 *     the next two draws into relief pieces, regardless of who draws them);
 *   - the per-player hands;
 *   - the {@link SharedReserve}.
 *
 * Exposes the high-level cooperative actions: `rotateInHand`,
 * `placeFromHand`, `stashToReserve`, `withdrawFromReserve`, plus state
 * inspection helpers.
 */

import {
    canPlace, clearFullLines, createBoard, hasAnyValidSpot, place,
} from './board';
import { PieceGenerator } from './pieceGenerator';
import { rotatePiece } from './rotation';
import { SharedReserve } from './sharedReserve';
import type {
    Board, EngineConfig, GameState, Piece, PlayerHand,
} from './types';

export interface PlaceResult {
    ok: boolean;
    reason?: 'unknown-player' | 'unknown-piece' | 'invalid-placement';
    board?: Board;
    clearedRows?: number[];
    clearedCols?: number[];
    /** The freshly drawn piece that replaced the one just placed. */
    replacement?: Piece;
}

export interface RotateResult {
    ok: boolean;
    reason?: 'unknown-player' | 'unknown-piece';
    piece?: Piece;
}

export interface StashResult {
    ok: boolean;
    reason?: 'unknown-player' | 'unknown-piece' | 'reserve-full' | 'not-complex';
    slot?: number;
    replacement?: Piece;
}

export interface WithdrawResult {
    ok: boolean;
    reason?: 'unknown-player' | 'empty-slot' | 'hand-full';
    piece?: Piece;
}

export class GameEngine {
    private board: Board;
    private readonly size: 8 | 10;
    private readonly handSize: number;
    private readonly generator: PieceGenerator;
    private readonly reserve: SharedReserve;
    private readonly hands: Map<string, PlayerHand> = new Map();

    constructor(config: EngineConfig = {}) {
        this.size = config.boardSize ?? 10;
        this.handSize = config.handSize ?? 3;
        this.board = createBoard(this.size);
        this.generator = new PieceGenerator({
            rng: config.rng,
            complexThreshold: config.complexThreshold,
            reliefThreshold: config.reliefThreshold,
            reliefDebtAfterComplex: config.reliefDebtAfterComplex,
        });
        this.reserve = new SharedReserve({
            capacity: config.reserveCapacity ?? 3,
        });
    }

    /** Register a player and deal them an initial hand. */
    addPlayer(playerId: string): PlayerHand {
        const existing = this.hands.get(playerId);
        if (existing) return existing;
        const hand: PlayerHand = {
            playerId,
            queue: this.generator.nextMany(this.handSize),
        };
        this.hands.set(playerId, hand);
        return hand;
    }

    /** Remove a player. Their hand is discarded (pieces are not recycled). */
    removePlayer(playerId: string): void {
        this.hands.delete(playerId);
    }

    /** 90° CW rotation. Replaces the piece in-place inside the player's hand. */
    rotateInHand(playerId: string, pieceId: string): RotateResult {
        const hand = this.hands.get(playerId);
        if (!hand) return { ok: false, reason: 'unknown-player' };
        const idx = hand.queue.findIndex(p => p.id === pieceId);
        if (idx === -1) return { ok: false, reason: 'unknown-piece' };
        const rotated = rotatePiece(hand.queue[idx]);
        hand.queue[idx] = rotated;
        return { ok: true, piece: rotated };
    }

    /**
     * Place a piece from a player's hand at (x, y). On success, the placed
     * slot is refilled from the generator and any cleared lines are reported.
     */
    placeFromHand(
        playerId: string, pieceId: string, x: number, y: number,
    ): PlaceResult {
        const hand = this.hands.get(playerId);
        if (!hand) return { ok: false, reason: 'unknown-player' };
        const idx = hand.queue.findIndex(p => p.id === pieceId);
        if (idx === -1) return { ok: false, reason: 'unknown-piece' };
        const piece = hand.queue[idx];
        if (!canPlace(this.board, piece, x, y)) {
            return { ok: false, reason: 'invalid-placement' };
        }
        const placed = place(this.board, piece, x, y);
        const cleared = clearFullLines(placed.board);
        this.board = cleared.board;
        const replacement = this.generator.next();
        hand.queue[idx] = replacement;
        return {
            ok: true,
            board: this.board,
            clearedRows: cleared.rows,
            clearedCols: cleared.cols,
            replacement,
        };
    }

    /**
     * Move a piece from a player's hand into the cooperative reserve, then
     * draw a fresh piece into the freed hand slot. Only complex pieces are
     * accepted (that is the whole point of the reserve).
     */
    stashToReserve(playerId: string, pieceId: string): StashResult {
        const hand = this.hands.get(playerId);
        if (!hand) return { ok: false, reason: 'unknown-player' };
        const idx = hand.queue.findIndex(p => p.id === pieceId);
        if (idx === -1) return { ok: false, reason: 'unknown-piece' };
        const piece = hand.queue[idx];
        const result = this.reserve.deposit(piece);
        if (!result.ok) {
            const reason = result.reason === 'full' ? 'reserve-full' : 'not-complex';
            return { ok: false, reason };
        }
        const replacement = this.generator.next();
        hand.queue[idx] = replacement;
        return { ok: true, slot: result.slot, replacement };
    }

    /**
     * Take a piece out of the shared reserve and into the player's hand.
     * Fails if the hand is already at capacity — drop or place something first.
     */
    withdrawFromReserve(playerId: string, slot: number): WithdrawResult {
        const hand = this.hands.get(playerId);
        if (!hand) return { ok: false, reason: 'unknown-player' };
        if (hand.queue.length >= this.handSize) {
            return { ok: false, reason: 'hand-full' };
        }
        const piece = this.reserve.withdraw(slot);
        if (!piece) return { ok: false, reason: 'empty-slot' };
        hand.queue.push(piece);
        return { ok: true, piece };
    }

    /** Has this player run out of options on the current board? */
    isPlayerStuck(playerId: string): boolean {
        const hand = this.hands.get(playerId);
        if (!hand) return false;
        return !hand.queue.some(p => hasAnyValidSpot(this.board, p));
    }

    /** Stuck across both hands AND the shared reserve. */
    isTeamStuck(): boolean {
        for (const hand of this.hands.values()) {
            for (const piece of hand.queue) {
                if (hasAnyValidSpot(this.board, piece)) return false;
            }
        }
        for (const piece of this.reserve.contents) {
            if (piece && hasAnyValidSpot(this.board, piece)) return false;
        }
        return true;
    }

    /** Full state snapshot, safe to ship over the wire. */
    snapshot(): GameState {
        const players: Record<string, PlayerHand> = {};
        for (const [id, hand] of this.hands) {
            players[id] = {
                playerId: id,
                queue: hand.queue.map(p => ({ ...p, matrix: p.matrix.map(r => r.slice() as (0 | 1)[]) })),
            };
        }
        return {
            board: this.board.map(row => row.slice()),
            size: this.size,
            players,
            sharedReserve: this.reserve.contents.slice(),
            reserveCapacity: this.reserve.contents.length,
        };
    }
}
