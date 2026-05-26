/**
 * Cooperative Shared Reserve.
 *
 * Either player can stash a complex piece they cannot (or don't want to) play
 * right now, freeing their hand to draw a fresh one. Either player can then
 * withdraw any stashed piece on a future turn. The reserve is a small,
 * fixed-size pool — capacity defaults to 3 — so teams must use it sparingly.
 *
 * Deposits are restricted to complex pieces by default. The intent is that
 * the reserve is a *valve for hard pieces*, not a generic swap. Pass
 * `allowAnyTier: true` to relax that constraint.
 */

import type { Piece } from './types';

export interface SharedReserveOptions {
    capacity?: number;
    allowAnyTier?: boolean;
}

export interface ReserveDeposit {
    ok: boolean;
    slot: number;
    reason?: 'full' | 'not-complex';
}

export class SharedReserve {
    private readonly capacity: number;
    private readonly allowAnyTier: boolean;
    private slots: (Piece | null)[];

    constructor(opts: SharedReserveOptions = {}) {
        this.capacity = opts.capacity ?? 3;
        this.allowAnyTier = opts.allowAnyTier ?? false;
        this.slots = Array(this.capacity).fill(null);
    }

    /** Read-only snapshot of every slot. `null` means empty. */
    get contents(): readonly (Piece | null)[] { return this.slots.slice(); }

    get isFull(): boolean { return this.slots.every(s => s !== null); }
    get isEmpty(): boolean { return this.slots.every(s => s === null); }

    /**
     * Try to stash a piece. Returns the slot index used and an `ok` flag.
     * Fails with `not-complex` for non-complex pieces (unless `allowAnyTier`)
     * and `full` when no slot is empty.
     */
    deposit(piece: Piece): ReserveDeposit {
        if (!this.allowAnyTier && piece.tier !== 'complex') {
            return { ok: false, slot: -1, reason: 'not-complex' };
        }
        const idx = this.slots.findIndex(s => s === null);
        if (idx === -1) return { ok: false, slot: -1, reason: 'full' };
        this.slots[idx] = piece;
        return { ok: true, slot: idx };
    }

    /** Pull a piece out of a specific slot. Returns null if the slot is empty. */
    withdraw(slot: number): Piece | null {
        if (slot < 0 || slot >= this.capacity) return null;
        const piece = this.slots[slot];
        if (!piece) return null;
        this.slots[slot] = null;
        return piece;
    }

    /** Peek without removing. */
    peek(slot: number): Piece | null {
        if (slot < 0 || slot >= this.capacity) return null;
        return this.slots[slot];
    }
}
