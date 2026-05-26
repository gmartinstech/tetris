/**
 * Smoke tests — exercise the four contract rules. Run with:
 *   npx tsx src/engine/__tests__/smoke.ts
 * or after compiling:
 *   node dist/engine/__tests__/smoke.js
 *
 * No test framework — plain asserts so this stays a zero-dep module.
 */

import assert from 'node:assert/strict';
import { GameEngine } from '../gameEngine';
import { PieceGenerator } from '../pieceGenerator';
import { canPlace, createBoard, place } from '../board';
import { rotateClockwise, rotatePiece } from '../rotation';
import { SharedReserve } from '../sharedReserve';
import type { Matrix } from '../types';

// ── Rule 1: fixed grid, manual placement ───────────────────────────────────
{
    const board10 = createBoard(10);
    assert.equal(board10.length, 10);
    assert.equal(board10[0].length, 10);
    assert.ok(board10.every(r => r.every(c => c === null)),
        'fresh board must be entirely empty (no gravity-spawned cells)');
    const board8 = createBoard(8);
    assert.equal(board8.length, 8);
    console.log('rule 1 (fixed grid): ok');
}

// ── Rule 3: rotation transforms matrices 90° CW before validation ─────────
{
    const horizI: Matrix = [[1, 1, 1, 1]];
    const rotated = rotateClockwise(horizI);
    assert.deepEqual(rotated, [[1], [1], [1], [1]],
        'horizontal I must rotate into vertical I');
    const L: Matrix = [[1, 0], [1, 0], [1, 1]];
    assert.deepEqual(rotateClockwise(L),
        [[1, 1, 1], [1, 0, 0]],
        'L rotated 90° CW');
    console.log('rule 3 (rotation 90° CW): ok');
}

// ── Rule 2: balanced generator — complex piece forces two relief pieces ──
{
    // Inject a deterministic RNG that always picks index 0 of the shuffled bag.
    // The first refill ends with a *known* template at the top of the bag;
    // rather than reproducing the shuffle, we just verify the rule by
    // forcing a complex draw via the tier API and then watching the next
    // two automatic draws.
    const gen = new PieceGenerator();
    const complex = gen.nextOfTier('complex');
    assert.ok(complex.blocks >= 5, 'forced complex piece has 5+ blocks');

    // Manually create the debt the same way `next()` would have:
    // We can't reach into the generator, so simulate by drawing until we see
    // a complex piece via the bag path, then assert the next two are relief.
    const gen2 = new PieceGenerator();
    let sawComplex = false;
    let reliefAfter = 0;
    let drew = 0;
    while (drew < 200 && reliefAfter < 2) {
        const p = gen2.next();
        drew++;
        if (sawComplex) {
            assert.ok(p.tier === 'relief',
                `piece #${drew} after complex must be relief, got ${p.tier} (${p.blocks} blocks)`);
            reliefAfter++;
        } else if (p.tier === 'complex') {
            sawComplex = true;
        }
    }
    assert.ok(sawComplex, 'expected at least one complex piece in 200 draws');
    assert.equal(reliefAfter, 2, 'exactly two relief pieces must follow a complex');
    console.log('rule 2 (safety valve): ok');
}

// ── Rule 4: shared reserve accepts complex pieces only & swaps holders ────
{
    const reserve = new SharedReserve({ capacity: 2 });
    const gen = new PieceGenerator();
    const relief = gen.nextOfTier('relief');
    const complex = gen.nextOfTier('complex');

    const badStash = reserve.deposit(relief);
    assert.equal(badStash.ok, false);
    assert.equal(badStash.reason, 'not-complex',
        'reserve must reject non-complex pieces by default');

    const okStash = reserve.deposit(complex);
    assert.equal(okStash.ok, true);
    assert.equal(okStash.slot, 0);

    const back = reserve.withdraw(0);
    assert.ok(back && back.id === complex.id,
        'withdraw returns the deposited piece (any partner can pick it up)');
    assert.equal(reserve.peek(0), null, 'slot is empty after withdraw');
    console.log('rule 4 (cooperative reserve): ok');
}

// ── End-to-end: engine wires it all up ────────────────────────────────────
{
    const engine = new GameEngine({ boardSize: 10, handSize: 3 });
    engine.addPlayer('alice');
    engine.addPlayer('bob');
    const snap = engine.snapshot();
    assert.equal(snap.size, 10);
    assert.equal(snap.players.alice.queue.length, 3);
    assert.equal(snap.players.bob.queue.length, 3);

    // Find a piece in Alice's hand, rotate it, then place it.
    const piece = snap.players.alice.queue[0];
    const rot = engine.rotateInHand('alice', piece.id);
    assert.equal(rot.ok, true);
    const after = engine.snapshot().players.alice.queue.find(p => p.id === piece.id);
    assert.ok(after, 'piece still present after rotation');
    // Try placing at (0,0); if blocked, try (0,1) etc.
    let placed = false;
    for (let y = 0; y < 10 && !placed; y++) {
        for (let x = 0; x < 10 && !placed; x++) {
            const r = engine.placeFromHand('alice', piece.id, x, y);
            if (r.ok) {
                placed = true;
                assert.ok(r.board, 'place result has board');
                assert.ok(r.replacement, 'place result has replacement piece');
            }
        }
    }
    assert.ok(placed, 'piece must place somewhere on an empty board');
    console.log('engine integration: ok');
}

console.log('\nAll smoke tests passed.');
