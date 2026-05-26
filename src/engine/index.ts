/**
 * Public API for the Meio Jogo cooperative engine.
 *
 * @example
 *   import { GameEngine } from './engine';
 *
 *   const engine = new GameEngine({ boardSize: 10 });
 *   engine.addPlayer('alice');
 *   engine.addPlayer('bob');
 *
 *   const piece = engine.snapshot().players['alice'].queue[0];
 *   engine.rotateInHand('alice', piece.id);          // 90° CW
 *   engine.placeFromHand('alice', piece.id, 3, 3);   // anchor at (3,3)
 *
 *   // Bob hates his pentomino — stash it for later.
 *   const ugly = engine.snapshot().players['bob'].queue[2];
 *   engine.stashToReserve('bob', ugly.id);
 *
 *   // Alice retrieves it next turn after placing one of her own.
 *   engine.withdrawFromReserve('alice', 0);
 */

export * from './types';
export {
    RELIEF_SHAPES, STANDARD_SHAPES, COMPLEX_SHAPES,
    ALL_SHAPES, SHAPES_BY_TIER,
} from './pieceLibrary';
export { rotateClockwise, rotateClockwiseN, rotatePiece, trim } from './rotation';
export { PieceGenerator } from './pieceGenerator';
export {
    createBoard, cloneBoard, canPlace, place, hasAnyValidSpot, clearFullLines,
} from './board';
export { SharedReserve } from './sharedReserve';
export { GameEngine } from './gameEngine';
