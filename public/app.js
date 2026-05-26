const { useState, useEffect, useRef, useCallback } = React;

const BOARD_SIZE = 10;
// Painted-wood palette. Matte gouache piece colors, low chroma, warm bias.
const PIECE_STYLES = ['brick', 'ochre', 'sage', 'slate', 'mustard', 'plum'];

// SVGs inline
const IconTrophy = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>;
const IconLayers = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/></svg>;
const IconMenu = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>;
const IconX = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>;
const IconRefresh = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>;
const IconLogOut = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>;
const IconAlert = () => <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>;
const IconFullscreen = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>;
const IconExitFullscreen = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 3 3 3 3 8"/><polyline points="21 8 21 3 16 3"/><polyline points="3 16 3 21 8 21"/><polyline points="16 21 21 21 21 16"/></svg>;

// Persistent across calls so AudioContext isn't recreated and gets resumed once.
let _audioCtx = null;
const _ensureAudio = () => {
    if (typeof window === 'undefined') return null;
    if (!_audioCtx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        try { _audioCtx = new Ctor(); } catch (e) { return null; }
    }
    if (_audioCtx.state === 'suspended') { try { _audioCtx.resume(); } catch (e) {} }
    return _audioCtx;
};
const beep = (freq, duration = 0.15, volume = 0.3) => {
    const ctx = _ensureAudio();
    if (!ctx) return;
    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.02);
    } catch (e) {}
};
const vibrate = (pattern) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(pattern); } catch (e) {}
    }
};
// Combined haptic + audio feedback. Audio is the iOS fallback since iOS Safari
// has no Vibration API at all.
const feedback = (kind) => {
    if (kind === 'place')        { vibrate(35); }
    else if (kind === 'invalid') { vibrate([60, 60, 60]); beep(180, 0.08, 0.15); }
    else if (kind === 'select')  { vibrate(15); }
    else if (kind === 'hover')   { vibrate(5); }
    else if (kind === 'line1')   { vibrate([250]); beep(660, 0.18, 0.25); }
    else if (kind === 'line2')   { vibrate([300, 80, 300]); beep(660, 0.12, 0.25); setTimeout(() => beep(880, 0.18, 0.25), 140); }
    else if (kind === 'line3')   { vibrate([350, 90, 350, 90, 350]); beep(660, 0.1, 0.25); setTimeout(() => beep(880, 0.1, 0.25), 130); setTimeout(() => beep(1100, 0.18, 0.25), 260); }
    else if (kind === 'line4')   { vibrate([400, 100, 400, 100, 400, 100, 500]); beep(660, 0.09, 0.3); setTimeout(() => beep(880, 0.09, 0.3), 120); setTimeout(() => beep(1100, 0.09, 0.3), 240); setTimeout(() => beep(1320, 0.22, 0.3), 360); }
    else if (kind === 'explode') { vibrate([100, 50, 250]); beep(120, 0.25, 0.3); }
};

const COLOR_MAP = {
    brick:   ['#c0593a', '#7e3320'],
    ochre:   ['#cf8b34', '#8c5316'],
    sage:    ['#7c9f6b', '#3e5b34'],
    slate:   ['#6c8ba6', '#385571'],
    mustard: ['#d2b047', '#8a6c1e'],
    plum:    ['#8c4769', '#4f2741'],
    // Pre-placed (career filler) cell — driftwood grey, painted to match
    'from-gray-500 to-gray-600': ['#7d6a55', '#4a3a2a'],
    // Legacy aliases — older saved piece state maps to the nearest gouache hue
    'from-red-400 to-red-600':       ['#c0593a', '#7e3320'],
    'from-rose-400 to-rose-600':     ['#c0593a', '#7e3320'],
    'from-pink-400 to-pink-600':     ['#8c4769', '#4f2741'],
    'from-orange-400 to-orange-600': ['#cf8b34', '#8c5316'],
    'from-amber-400 to-amber-600':   ['#cf8b34', '#8c5316'],
    'from-yellow-400 to-yellow-600': ['#d2b047', '#8a6c1e'],
    'from-green-400 to-green-600':   ['#7c9f6b', '#3e5b34'],
    'from-emerald-400 to-emerald-600': ['#7c9f6b', '#3e5b34'],
    'from-lime-400 to-lime-600':     ['#7c9f6b', '#3e5b34'],
    'from-blue-400 to-blue-600':     ['#6c8ba6', '#385571'],
    'from-sky-400 to-sky-600':       ['#6c8ba6', '#385571'],
    'from-purple-400 to-purple-600': ['#8c4769', '#4f2741'],
    'from-violet-400 to-violet-600': ['#8c4769', '#4f2741'],
    'from-cyan-400 to-cyan-600':     ['#6c8ba6', '#385571'],
    'from-teal-400 to-teal-600':     ['#7c9f6b', '#3e5b34'],
};

const Block = ({ cellData, isDissolving, noAnim, extraClass = '', staggerDelay = 0, burst = false }) => {
    if (!cellData) return <div className={`w-full h-full rounded-[3px] board-cell-empty ${extraClass}`} />;
    const type = typeof cellData === 'object' ? cellData.type : null;
    let animClass = noAnim ? '' : 'animate-popIn';
    if (isDissolving) animClass = burst ? 'animate-line-burst' : 'animate-dissolve';
    const delayStyle = staggerDelay > 0 ? { animationDelay: `${staggerDelay}ms` } : {};
    if (type === 'filler') {
        const fillerStyle = {
            '--c-from': '#e8c468',
            '--c-to':   '#a07423',
            ...delayStyle,
        };
        return (
            <div className={`w-full h-full block-render relative rounded-[3px] overflow-hidden animate-shimmer ${animClass} ${extraClass}`}
                style={fillerStyle} />
        );
    }
    if (type === 'explosive') {
        const bombStyle = {
            '--c-from': '#b94025',
            '--c-to':   '#3a1208',
            ...delayStyle,
        };
        return (
            <div className={`w-full h-full block-render relative rounded-[3px] overflow-hidden animate-bomb-pulse ${animClass} ${extraClass}`}
                style={bombStyle} />
        );
    }
    const colorClass = typeof cellData === 'string' ? cellData : cellData.color;
    const colors = COLOR_MAP[colorClass] || ['#7d6a55', '#4a3a2a'];
    const blockStyle = { '--c-from': colors[0], '--c-to': colors[1], ...delayStyle };
    return <div className={`w-full h-full block-render ${animClass} relative rounded-[3px] overflow-hidden ${extraClass}`} style={blockStyle} />;
};

const PIECE_LIBRARY = [
    // 2-block dominoes
    [[0,0],[1,0]],                          // horizontal domino
    [[0,0],[0,1]],                          // vertical domino
    // 3-block triominoes
    [[0,0],[1,0],[2,0]],                    // I3 horizontal
    [[0,0],[0,1],[0,2]],                    // I3 vertical
    [[0,0],[1,0],[0,1]],                    // L3 ┐
    [[0,0],[1,0],[1,1]],                    // L3 ┌
    [[0,0],[0,1],[1,1]],                    // L3 ┘
    [[1,0],[0,1],[1,1]],                    // L3 └
    // 4-block classics
    [[0,0],[1,0],[2,0],[3,0]],              // I
    [[0,0],[1,0],[0,1],[1,1]],              // O
    [[0,0],[1,0],[2,0],[1,1]],              // T
    [[0,0],[0,1],[0,2],[1,2]],              // L
    [[1,0],[1,1],[0,2],[1,2]],              // J
    [[1,0],[2,0],[0,1],[1,1]],              // S
    [[0,0],[1,0],[1,1],[2,1]],              // Z
    // 5-block
    [[1,0],[0,1],[1,1],[2,1],[1,2]],        // + cross
    [[0,0],[0,1],[0,2],[1,2],[2,2]],        // 3×3 L ┘
    [[0,0],[1,0],[2,0],[2,1],[2,2]],        // 3×3 L └
    [[0,0],[1,0],[2,0],[0,1],[0,2]],        // 3×3 L ┐
    [[2,0],[2,1],[0,2],[1,2],[2,2]],        // 3×3 L ┌
    [[0,0],[1,0],[2,0],[3,0],[0,1]],        // 4-wide L
    [[0,0],[1,0],[2,0],[3,0],[3,1]],        // 4-wide J
    [[0,0],[0,1],[0,2],[0,3],[1,3]],        // 4-tall L
    [[1,0],[1,1],[1,2],[0,3],[1,3]],        // 4-tall J
    [[0,0],[2,0],[0,1],[1,1],[2,1]],        // U (∪)
    [[1,0],[1,1],[0,2],[1,2],[2,2]],        // T-down
    [[0,0],[1,0],[2,0],[1,1],[1,2]],        // T-up
    // 6-block
    [[0,0],[0,1],[0,2],[0,3],[1,3],[2,3]],  // big L (3+3 arms)
    [[2,0],[2,1],[2,2],[0,3],[1,3],[2,3]],  // big J (3+3 arms)
    [[0,0],[1,0],[2,0],[3,0],[4,0],[2,1]],  // big T flat
    [[0,0],[1,0],[2,0],[2,1],[3,1],[4,1]],  // Z-wide staircase
    [[2,0],[3,0],[4,0],[0,1],[1,1],[2,1]],  // S-wide staircase
    [[0,0],[1,0],[2,0],[0,1],[0,2],[0,3]],  // big corner ┐
    [[0,0],[0,1],[0,2],[1,2],[2,2],[2,3]],  // S-step tall
    // 7-block
    [[0,0],[2,0],[0,1],[1,1],[2,1],[0,2],[2,2]], // H
    [[0,0],[1,0],[2,0],[0,1],[0,2],[1,2],[2,2]], // C / ∪-big
    [[0,0],[1,0],[2,0],[3,0],[0,1],[0,2],[0,3]], // 4+4 L corner
    [[0,0],[1,0],[2,0],[3,0],[3,1],[3,2],[3,3]], // 4+4 J corner
    // diagonal pieces
    [[0,0],[1,1],[2,2]],                         // diagonal ↘ 3
    [[2,0],[1,1],[0,2]],                         // diagonal ↙ 3
    [[0,0],[1,1],[2,2],[3,3]],                   // diagonal ↘ 4
    [[3,0],[2,1],[1,2],[0,3]],                   // diagonal ↙ 4
    [[1,0],[0,1],[2,1],[1,2]],                   // diamond ◆
    [[0,0],[1,0],[1,1],[2,2],[3,2]],             // S-diagonal
    [[0,2],[1,2],[1,1],[2,0],[3,0]],             // Z-diagonal
    [[0,0],[1,1],[2,2],[2,3],[3,3]],             // diagonal + L foot
    [[0,0],[1,0],[1,1],[2,1],[2,2]],             // staircase ↘
    [[0,2],[1,2],[1,1],[2,1],[2,0]],             // staircase ↗
];

const DIAGONAL_OFFSET = PIECE_LIBRARY.length - 10; // last 10 are diagonal pieces

// ── Balanced bag generator (válvula de escape) ────────────────────────────
// A piece bag re-shuffles when emptied; whenever a draw yields a "complex"
// piece (>= COMPLEX_THRESHOLD blocks), the team owes the queue two relief
// pieces (<= RELIEF_THRESHOLD blocks). The debt persists across bag refills
// and across the two co-op players, since both pull from the same bag.
//
// Reset via `resetPieceBag()` at the start of every fresh game/board so
// debt and ordering from a previous session don't leak.
const COMPLEX_THRESHOLD = 5;
const RELIEF_THRESHOLD = 2;
const RELIEF_DEBT_AFTER_COMPLEX = 2;

let _pieceBag = [];
let _reliefDebt = 0;

const resetPieceBag = () => { _pieceBag = []; _reliefDebt = 0; };

const _shuffleArray = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
};

const _shapeToPiece = (shape) => ({
    blocks: shape.map(([x, y]) => ({ x, y })),
    color: PIECE_STYLES[Math.floor(Math.random() * PIECE_STYLES.length)],
});

const _modPool = (level, mods) => {
    const cap = mods.maxBlocks ?? Math.min(7, 5 + Math.floor(level / 2));
    const minB = mods.minBlocks ?? 0;
    const base = mods.onlyDiagonal ? PIECE_LIBRARY.slice(DIAGONAL_OFFSET) : PIECE_LIBRARY;
    const filtered = base.filter(p => p.length <= cap && p.length >= minB);
    return filtered.length > 0 ? filtered : PIECE_LIBRARY.filter(p => p.length <= cap);
};

// Pure random — used for board obstacle seeding. Doesn't touch bag/debt.
const generateProceduralPiece = (level, mods = {}) => {
    const pool = _modPool(level, mods);
    const shape = pool[Math.floor(Math.random() * pool.length)];
    return _shapeToPiece(shape);
};

// Bag-aware draw — used for player hands so the safety valve fires.
const drawFromPieceBag = (level, mods = {}) => {
    const pool = _modPool(level, mods);

    // Relief debt: force a small piece if the current pool has any.
    if (_reliefDebt > 0) {
        const relief = pool.filter(p => p.length <= RELIEF_THRESHOLD);
        if (relief.length > 0) {
            _reliefDebt--;
            return _shapeToPiece(relief[Math.floor(Math.random() * relief.length)]);
        }
        // No relief in pool (e.g., "Complexo" stage forbids small pieces) —
        // drop the debt rather than stall.
        _reliefDebt = 0;
    }

    // Draw from bag, skipping items that don't fit the current mod pool.
    let shape = null;
    while (_pieceBag.length > 0) {
        const candidate = _pieceBag.pop();
        if (pool.includes(candidate)) { shape = candidate; break; }
    }
    if (!shape) {
        _pieceBag = _shuffleArray(pool);
        shape = _pieceBag.pop();
    }

    if (shape.length >= COMPLEX_THRESHOLD) _reliefDebt = RELIEF_DEBT_AFTER_COMPLEX;
    return _shapeToPiece(shape);
};

const generateInventory = (level, mods = {}) => {
    const makeSlot = (forceType) => {
        if (forceType === 'explosive') return { blocks: { blocks: [{ x: 0, y: 0 }], type: 'explosive' } };
        if (forceType === 'filler') return { blocks: { blocks: [{ x: 0, y: 0 }], type: 'filler' } };
        if (mods.banSpecials) return { blocks: drawFromPieceBag(level, mods) };
        const r = Math.random();
        const fillerPct = mods.fillerPct ?? 0.08;
        const explosivePct = mods.explosivePct ?? 0.07;
        if (r < fillerPct) return { blocks: { blocks: [{ x: 0, y: 0 }], type: 'filler' } };
        if (r < fillerPct + explosivePct) return { blocks: { blocks: [{ x: 0, y: 0 }], type: 'explosive' } };
        return { blocks: drawFromPieceBag(level, mods) };
    };
    if (mods.forceExplosives) return [makeSlot('explosive'), makeSlot(), makeSlot()];
    return [makeSlot(), makeSlot(), makeSlot()];
};

const getBoardSize = (board) => Math.round(Math.sqrt(board.length)) || BOARD_SIZE;

const generateComplexInitialBoard = (size = BOARD_SIZE, density = 0.05) => {
    resetPieceBag(); // fresh game — drop any inherited debt + bag ordering
    let newBoard = Array(size * size).fill(0);
    const targetCells = Math.floor(size * size * density);
    let attempts = 0;
    while (newBoard.filter(v => v !== 0).length < targetCells && attempts < 200) {
        const piece = generateProceduralPiece(2);
        const startX = Math.floor(Math.random() * size); const startY = Math.floor(Math.random() * size);
        let isValid = true;
        for (const block of piece.blocks) {
            const tX = startX + block.x; const tY = startY + block.y;
            if (tX < 0 || tX >= size || tY < 0 || tY >= size || newBoard[tY * size + tX] !== 0) { isValid = false; break; }
        }
        if (isValid) for (const block of piece.blocks) newBoard[(startY + block.y) * size + (startX + block.x)] = { color: 'from-gray-500 to-gray-600 grayscale-[20%]' };
        attempts++;
    }
    return newBoard;
};

const canPlacePiece = (board, piece) => {
    if (!piece || !piece.blocks || !piece.blocks.blocks) return false;
    const size = getBoardSize(board);
    if (piece.blocks.type === 'explosive') return true;
    for (let gridY = 0; gridY < size; gridY++) {
        for (let gridX = 0; gridX < size; gridX++) {
            let isValid = true;
            for (const block of piece.blocks.blocks) {
                const tX = gridX + block.x; const tY = gridY + block.y;
                if (tX < 0 || tX >= size || tY < 0 || tY >= size || board[tY * size + tX] !== 0) { isValid = false; break; }
            }
            if (isValid) return true;
        }
    }
    return false;
};

const CAREER_STAGES = [
    { id: 1, name: 'Aquecimento', hint: 'Comece simples', density: 0, objective: { type: 'score', target: 200 }, modifiers: { maxBlocks: 4, banSpecials: true }, stars: [200, 400, 700] },
    { id: 2, name: 'Limpeza Básica', hint: 'Limpe linhas no campo', density: 0.3, objective: { type: 'lines', target: 5 }, modifiers: { maxBlocks: 4 }, stars: [5, 8, 12] },
    { id: 3, name: 'Sobrevivência', hint: 'Coloque sem perder', density: 0, objective: { type: 'pieces', target: 20 }, modifiers: { maxBlocks: 5, banSpecials: true }, stars: [20, 30, 40] },
    { id: 4, name: 'Pressão', hint: 'Pontue sob pressão', density: 0.4, objective: { type: 'score', target: 800 }, modifiers: { maxBlocks: 5 }, stars: [800, 1200, 1800] },
    { id: 5, name: 'Demolição', hint: 'Use explosivos com sabedoria', density: 0.5, objective: { type: 'score', target: 600 }, modifiers: { forceExplosives: true, explosivePct: 0.2 }, stars: [600, 1000, 1500] },
    { id: 6, name: 'Sem Apoio', hint: 'Pontue sem especiais', density: 0.3, objective: { type: 'score', target: 1500 }, modifiers: { banSpecials: true }, stars: [1500, 2200, 3000] },
    { id: 7, name: 'Diagonal', hint: 'Apenas peças diagonais', density: 0.2, objective: { type: 'score', target: 600 }, modifiers: { onlyDiagonal: true }, stars: [600, 1000, 1500] },
    { id: 8, name: 'Apertado', hint: 'Espaço escasso', density: 0.6, objective: { type: 'lines', target: 4 }, modifiers: {}, stars: [4, 7, 10] },
    { id: 9, name: 'Maratona', hint: 'Pontuação alta', density: 0.2, objective: { type: 'score', target: 3000 }, modifiers: {}, stars: [3000, 5000, 7000] },
    { id: 10, name: 'Complexo', hint: 'Apenas peças grandes', density: 0.1, objective: { type: 'score', target: 1000 }, modifiers: { maxBlocks: 7, minBlocks: 6 }, stars: [1000, 1500, 2200] },
    { id: 11, name: 'Mestre Limpador', hint: 'Combos de linhas', density: 0.4, objective: { type: 'lines', target: 15 }, modifiers: {}, stars: [15, 25, 40] },
    { id: 12, name: 'Bombardeio', hint: 'Tabuleiro pré-preenchido', density: 0.5, objective: { type: 'score', target: 2000 }, modifiers: {}, stars: [2000, 3000, 4500] },
    { id: 13, name: 'Vidente', hint: 'Sem especiais, espaço apertado', density: 0.55, objective: { type: 'pieces', target: 30 }, modifiers: { banSpecials: true }, stars: [30, 50, 80] },
    { id: 14, name: 'Velocista', hint: 'Aumente os pontos rápido', density: 0.3, objective: { type: 'score', target: 5000 }, modifiers: {}, stars: [5000, 7500, 10000] },
    { id: 15, name: 'Diagonal+', hint: 'Diagonais sob densidade', density: 0.4, objective: { type: 'score', target: 1200 }, modifiers: { onlyDiagonal: true }, stars: [1200, 1800, 2500] },
    { id: 16, name: 'Eco', hint: 'Sobreviva a muitas peças', density: 0.4, objective: { type: 'pieces', target: 50 }, modifiers: { banSpecials: true }, stars: [50, 80, 120] },
    { id: 17, name: 'Inferno', hint: 'Tabuleiro hostil', density: 0.65, objective: { type: 'lines', target: 6 }, modifiers: {}, stars: [6, 10, 15] },
    { id: 18, name: 'Mestre', hint: 'Tudo no máximo', density: 0.5, objective: { type: 'score', target: 8000 }, modifiers: {}, stars: [8000, 12000, 18000] },
    { id: 19, name: 'Disciplina', hint: 'Sem especiais, denso', density: 0.6, objective: { type: 'score', target: 3000 }, modifiers: { banSpecials: true }, stars: [3000, 4500, 6500] },
    { id: 20, name: 'Apocalipse', hint: 'O teste final', density: 0.7, objective: { type: 'score', target: 2000 }, modifiers: {}, stars: [2000, 3500, 5500] },
];

const SOLO_DIFFICULTIES = {
    entry:   { name: 'Iniciante', boardSize: 8, density: 0,    modifiers: { maxBlocks: 4, banSpecials: true } },
    easy:    { name: 'Fácil',     boardSize: 10, density: 0,    modifiers: { maxBlocks: 5, fillerPct: 0.12, explosivePct: 0.10 } },
    normal:  { name: 'Normal',    boardSize: 10, density: 0.1,  modifiers: {} },
    hard:    { name: 'Difícil',   boardSize: 10, density: 0.3,  modifiers: { fillerPct: 0.04, explosivePct: 0.04 } },
    extreme: { name: 'Extremo',   boardSize: 10, density: 0.5,  modifiers: { banSpecials: true } },
};

const computeStars = (stage, gs, pieces) => {
    const v = stage.objective.type === 'score' ? gs.score : stage.objective.type === 'lines' ? gs.lines : pieces;
    return stage.stars.filter(t => v >= t).length;
};

const playerStuck = (player, board) =>
    !player?.inventory?.some(p => p.blocks && canPlacePiece(board, p));

// Game ends only when every present player's CURRENT inventory has no playable
// piece. Don't refresh anyone's inventory just because they're stuck — the
// other player keeps playing until they unblock the board (or until both are
// stuck on real pieces).
const allPlayersStuck = (state) => {
    const present = ['p1', 'p2'].filter(r => state[r] && state[r].inventory);
    if (present.length === 0) return false;
    return present.every(r => playerStuck(state[r], state.board));
};
function App() {
    const [userId] = useState(() => {
        let id = localStorage.getItem('tetris_uid');
        if (!id) { id = Math.random().toString(36).substring(2) + Date.now().toString(36); localStorage.setItem('tetris_uid', id); }
        return id;
    });
    
    const [appVersion, setAppVersion] = useState('');
    useEffect(() => {
        let initial = null;
        const check = () => {
            fetch('version', { cache: 'no-store' })
                .then(r => r.json())
                .then(data => {
                    const v = data.version || '';
                    if (initial === null) { initial = v; setAppVersion(v); return; }
                    if (v && v !== initial) {
                        try { window.location.reload(); } catch (e) {}
                    }
                })
                .catch(() => {});
        };
        check();
        const id = setInterval(check, 60000);
        return () => clearInterval(id);
    }, []);
    
    const [mode, setMode] = useState(() => {
        // Direct deep-link to a room ?room=<slug> always lands the user in coop,
        // regardless of whatever mode was last persisted (or none on a fresh browser).
        const params = new URLSearchParams(window.location.search);
        if (params.get('room')) return 'coop';
        return localStorage.getItem('tetris_mode') || 'menu';
    }); // menu|coop|solo|career-map|career-stage
    const [gameState, setGameState] = useState(null);
    const [playerRole, setPlayerRole] = useState(null);
    const [selectedPieceIndex, setSelectedPieceIndex] = useState(null);
    const [hoverCell, setHoverCell] = useState(null);
    const [showDashboard, setShowDashboard] = useState(false);
    const [floatingTexts, setFloatingTexts] = useState([]);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [careerSave, setCareerSave] = useState(null);
    const [activeStage, setActiveStage] = useState(null);
    const [stagePieceCount, setStagePieceCount] = useState(0);
    const [stageResult, setStageResult] = useState(null); // null|'won'|'lost'
    const [boardShake, setBoardShake] = useState(false);
    const [soloHighScore, setSoloHighScore] = useState(() => parseInt(localStorage.getItem('tetris_solo_hs') || '0'));
    const [soloDifficulty, setSoloDifficulty] = useState(() => localStorage.getItem('tetris_solo_diff') || 'normal');
    useEffect(() => { localStorage.setItem('tetris_solo_diff', soloDifficulty); }, [soloDifficulty]);
    const [coopBoardSize, setCoopBoardSize] = useState(() => {
        const v = parseInt(localStorage.getItem('tetris_coop_size') || '10');
        return v === 7 ? 8 : v; // migrate prior 7×7 selection to the new 8×8
    });
    useEffect(() => { localStorage.setItem('tetris_coop_size', String(coopBoardSize)); }, [coopBoardSize]);
    const [coopRoom, setCoopRoom] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('room') || null;
    });
    useEffect(() => {
        const onPop = () => {
            const params = new URLSearchParams(window.location.search);
            setCoopRoom(params.get('room') || null);
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);
    const setRoomInUrl = (slug) => {
        const url = new URL(window.location.href);
        if (slug) url.searchParams.set('room', slug);
        else url.searchParams.delete('room');
        window.history.replaceState({}, '', url);
        setCoopRoom(slug);
    };
    const [roomCreateName, setRoomCreateName] = useState('');
    const [roomCreateError, setRoomCreateError] = useState('');
    const [roomCreating, setRoomCreating] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    const gridRef = useRef(null);
    const lastHoverRef = useRef(null);
    const [dragData, setDragData] = useState(null);
    const lastHoverSentRef = useRef(0);
    const lastHoverPayloadRef = useRef('');

    const sendHoverBroadcast = (payload) => {
        if (mode !== 'coop' || !coopRoom) return;
        const body = JSON.stringify({ ...payload, uid: userId });
        if (body === lastHoverPayloadRef.current) return;
        lastHoverPayloadRef.current = body;
        fetch(`hover?room=${encodeURIComponent(coopRoom)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
        }).catch(() => {});
    };
    const throttledHoverBroadcast = (payload) => {
        const now = Date.now();
        if (now - lastHoverSentRef.current < 80) return;
        lastHoverSentRef.current = now;
        sendHoverBroadcast(payload);
    };

    useEffect(() => { localStorage.setItem('tetris_mode', mode); }, [mode]);

    // Safety: if reloaded into career-stage with no active stage, drop to map
    useEffect(() => {
        if (mode === 'career-stage' && !activeStage) setMode('career-map');
    }, [mode, activeStage]);

    useEffect(() => {
        const onChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen();
    };

    const [partnerHover, setPartnerHover] = useState(null);

    // --- SSE (Server-Sent Events) Setup — only co-op, scoped to room ---
    useEffect(() => {
        if (mode !== 'coop' || !coopRoom) return;
        let es;
        let cancelled = false;
        // Pre-flight: check room exists before subscribing
        fetch(`room/${encodeURIComponent(coopRoom)}`).then(res => {
            if (cancelled) return;
            if (res.status === 404) {
                setRoomCreateError(`Sala "${coopRoom}" não encontrada (expirada ou inexistente)`);
                setRoomInUrl(null);
                return;
            }
            const connectSSE = () => {
                if (cancelled) return;
                es = new EventSource(`events?room=${encodeURIComponent(coopRoom)}`);
                es.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    setGameState(data);
                    if (data.p1 && data.p1.uid === userId) setPlayerRole('p1');
                    else if (data.p2 && data.p2.uid === userId) setPlayerRole('p2');
                    else setPlayerRole(null);
                };
                es.addEventListener('hover', (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        // Ignore our own hover broadcasts (server fans out to all clients)
                        if (msg.uid && msg.uid === userId) return;
                        if (msg.x == null) setPartnerHover(null);
                        else setPartnerHover(msg);
                    } catch (e) {}
                });
                es.addEventListener('session-end', () => {
                    setRoomCreateError(`Sala "${coopRoom}" foi encerrada por outro jogador`);
                    setRoomInUrl(null);
                    setGameState(null); setPlayerRole(null); setPartnerHover(null);
                });
                es.onerror = () => { es.close(); setTimeout(connectSSE, 1000); };
            };
            connectSSE();
        }).catch(() => {});
        return () => { cancelled = true; if(es) es.close(); setPartnerHover(null); };
    }, [userId, mode, coopRoom]);

    // Clear stale partner hover after 3s of no updates (drag aborted / partner offline)
    useEffect(() => {
        if (!partnerHover) return;
        const id = setTimeout(() => setPartnerHover(null), 3000);
        return () => clearTimeout(id);
    }, [partnerHover]);

    // Auto-reconnect: if co-op state already has our uid, restore role
    useEffect(() => {
        if (mode !== 'coop' || !gameState || playerRole) return;
        if (gameState.p1 && gameState.p1.uid === userId) setPlayerRole('p1');
        else if (gameState.p2 && gameState.p2.uid === userId) setPlayerRole('p2');
    }, [gameState, userId, mode]);

    // Solo init: build a fresh local state when entering solo mode
    useEffect(() => {
        if (mode !== 'solo' || gameState) return;
        const diff = SOLO_DIFFICULTIES[soloDifficulty] || SOLO_DIFFICULTIES.normal;
        const size = diff.boardSize || BOARD_SIZE;
        setGameState({
            board: generateComplexInitialBoard(size, diff.density),
            p1: { uid: userId, name: 'Solo', inventory: generateInventory(1, diff.modifiers) },
            p2: null, score: 0, level: 1, lines: 0, status: 'playing',
            clearingLines: { rows: [], cols: [] }, explosionArea: [],
            modifiers: diff.modifiers, density: diff.density, boardSize: size
        });
        setPlayerRole('p1'); setStagePieceCount(0); setStageResult(null);
    }, [mode, gameState, userId, soloDifficulty]);

    // Career stage init: build a fresh local state when entering a stage
    useEffect(() => {
        if (mode !== 'career-stage' || !activeStage || gameState) return;
        const mods = activeStage.modifiers;
        const size = mods.boardSize || BOARD_SIZE;
        setGameState({
            board: generateComplexInitialBoard(size, activeStage.density || 0),
            p1: { uid: userId, name: 'Solo', inventory: generateInventory(1, mods) },
            p2: null, score: 0, level: 1, lines: 0, status: 'playing',
            clearingLines: { rows: [], cols: [] }, explosionArea: [],
            modifiers: mods, density: activeStage.density || 0, boardSize: size
        });
        setPlayerRole('p1'); setStagePieceCount(0); setStageResult(null);
    }, [mode, activeStage, gameState, userId]);

    // Career save load
    useEffect(() => {
        if (mode !== 'career-map' || careerSave) return;
        fetch(`career/${userId}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => setCareerSave(data || { stages: {}, totalStars: 0, lastUnlocked: 1 }))
            .catch(() => setCareerSave({ stages: {}, totalStars: 0, lastUnlocked: 1 }));
    }, [mode, careerSave, userId]);

    // Solo high-score tracker
    useEffect(() => {
        if (mode !== 'solo' || !gameState) return;
        if (gameState.score > soloHighScore) {
            setSoloHighScore(gameState.score);
            localStorage.setItem('tetris_solo_hs', String(gameState.score));
        }
    }, [mode, gameState, soloHighScore]);

    // Stage objective checker
    useEffect(() => {
        if (mode !== 'career-stage' || !activeStage || !gameState || stageResult) return;
        if (gameState.status === 'game_over') { setStageResult('lost'); return; }
        const obj = activeStage.objective;
        const achieved = obj.type === 'score' ? gameState.score : obj.type === 'lines' ? gameState.lines : stagePieceCount;
        if (achieved >= obj.target) {
            setStageResult('won');
            const stars = computeStars(activeStage, gameState, stagePieceCount);
            const save = careerSave || { stages: {}, totalStars: 0, lastUnlocked: 1 };
            const existing = save.stages?.[activeStage.id] || { stars: 0, bestScore: 0 };
            const newStages = { ...(save.stages || {}), [activeStage.id]: { stars: Math.max(stars, existing.stars), bestScore: Math.max(gameState.score, existing.bestScore) } };
            const newSave = { stages: newStages, totalStars: Object.values(newStages).reduce((a, b) => a + b.stars, 0), lastUnlocked: Math.max(save.lastUnlocked || 1, activeStage.id + 1) };
            setCareerSave(newSave);
            fetch(`career/${userId}`, { method: 'POST', body: JSON.stringify(newSave), headers: { 'Content-Type': 'application/json' } }).catch(console.error);
        }
    }, [mode, activeStage, gameState, stagePieceCount, stageResult, careerSave, userId]);

    const goToMenu = () => {
        setMode('menu'); setGameState(null); setPlayerRole(null); setActiveStage(null);
        setStagePieceCount(0); setStageResult(null); setShowDashboard(false);
        setRoomInUrl(null); setRoomCreateName(''); setRoomCreateError(''); setShareCopied(false);
    };

    const createRoom = async (name) => {
        setRoomCreating(true); setRoomCreateError('');
        try {
            const res = await fetch('room/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(name ? { name } : {})
            });
            if (!res.ok) { setRoomCreateError(res.status === 400 ? 'Nome inválido (use 3-50 letras minúsculas, números, traço)' : `Erro ${res.status}`); return; }
            const data = await res.json();
            setRoomInUrl(data.slug);
            setGameState(null); setPlayerRole(null);
        } catch (e) {
            setRoomCreateError('Falha de rede');
        } finally {
            setRoomCreating(false);
        }
    };

    const endSession = async () => {
        if (!coopRoom) return;
        if (!window.confirm(`Encerrar sessão "${coopRoom}"? Isso apaga a sala para todos.`)) return;
        try {
            await fetch(`room/${encodeURIComponent(coopRoom)}`, { method: 'DELETE' });
        } catch (e) {}
        setRoomInUrl(null);
        setGameState(null); setPlayerRole(null); setPartnerHover(null);
        setRoomCreateName(''); setRoomCreateError(''); setShareCopied(false);
    };

    const shareLink = () => {
        if (!coopRoom) return;
        const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(coopRoom)}`;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                setShareCopied(true);
                setTimeout(() => setShareCopied(false), 1800);
            }).catch(() => {});
        } else {
            try {
                const ta = document.createElement('textarea');
                ta.value = url; document.body.appendChild(ta);
                ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                setShareCopied(true);
                setTimeout(() => setShareCopied(false), 1800);
            } catch (e) {}
        }
    };

    const startStage = (stage) => {
        setActiveStage(stage); setGameState(null); setPlayerRole(null);
        setStagePieceCount(0); setStageResult(null); setMode('career-stage');
    };

    const retryStage = () => {
        setGameState(null); setStagePieceCount(0); setStageResult(null);
    };

    // Game-over check only — never auto-regenerate a stuck player's inventory.
    // If only one player is stuck, the other keeps playing until they clear the
    // board enough that the stuck player can act, OR until both are stuck.
    useEffect(() => {
        if (!gameState || !playerRole) return;
        if (gameState.status !== 'playing') return;
        if (gameState.clearingLines?.rows?.length > 0 || gameState.clearingLines?.cols?.length > 0 || gameState.explosionArea?.length > 0) return;
        if (allPlayersStuck(gameState)) syncState({ ...gameState, status: 'game_over' });
    }, [gameState, playerRole]);

    // --- State sync: co-op broadcasts to server, solo/career stays local ---
    const syncState = (newState) => {
        setGameState(newState);
        if (mode === 'coop' && coopRoom) {
            fetch(`action?room=${encodeURIComponent(coopRoom)}`, {
                method: 'POST',
                body: JSON.stringify(newState),
                headers: { 'Content-Type': 'application/json' }
            }).catch(console.error);
        }
    };

    const joinGame = (role, name) => {
        let baseState = gameState;
        const noPlayers = !baseState || (!baseState.p1 && !baseState.p2);
        if (noPlayers) {
            const size = coopBoardSize;
            const sizeMods = size <= 8 ? { maxBlocks: 4, banSpecials: true } : {};
            baseState = {
                board: generateComplexInitialBoard(size, 0),
                p1: null, p2: null, score: 0, level: 1, lines: 0, status: 'playing',
                clearingLines: { rows: [], cols: [] }, explosionArea: [],
                modifiers: sizeMods, density: 0, boardSize: size
            };
        }
        const mods = baseState.modifiers || {};
        const newState = { ...baseState, [role]: { uid: userId, name: name, inventory: generateInventory(baseState.level || 1, mods) } };
        syncState(newState);
    };

    const resetGame = () => {
        const mods = gameState.modifiers || {};
        const density = gameState.density ?? 0;
        const size = gameState.boardSize || BOARD_SIZE;
        syncState({
            ...gameState,
            board: generateComplexInitialBoard(size, density),
            p1: gameState.p1 ? { ...gameState.p1, inventory: generateInventory(1, mods) } : null,
            p2: gameState.p2 ? { ...gameState.p2, inventory: generateInventory(1, mods) } : null,
            score: 0, level: 1, lines: 0, status: 'playing',
            clearingLines: { rows: [], cols: [] }, explosionArea: []
        });
        setSelectedPieceIndex(null); setShowDashboard(false); setStagePieceCount(0); setStageResult(null);
    };

    const leaveGame = () => {
        if (!playerRole) return;
        syncState({ ...gameState, [playerRole]: null });
        setPlayerRole(null); setShowDashboard(false);
    };

    const attemptPlacement = (gridX, gridY, pieceIndex) => {
        if (!playerRole || pieceIndex === null || !gameState) return;
        if (gameState.clearingLines?.rows?.length > 0 || gameState.clearingLines?.cols?.length > 0 || gameState.explosionArea?.length > 0) return;

        const size = gameState.boardSize || BOARD_SIZE;
        const playerState = gameState[playerRole];
        const pieceObj = playerState.inventory[pieceIndex];
        if (!pieceObj || !pieceObj.blocks) return;
        const piece = pieceObj.blocks;

        // --- Explosive branch ---
        if (piece.type === 'explosive') {
            if (gridX < 0 || gridX >= size || gridY < 0 || gridY >= size) { feedback('invalid'); return; }
            feedback('explode');
            const blastArea = [];
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = gridX + dx, ny = gridY + dy;
                if (nx >= 0 && nx < size && ny >= 0 && ny < size) blastArea.push({ x: nx, y: ny });
            }
            const mods = gameState.modifiers || {};
            let newInventory = [...playerState.inventory];
            newInventory[pieceIndex] = { blocks: null };
            if (newInventory.every(p => p.blocks === null)) newInventory = generateInventory(gameState.level, mods);
            const nextP1 = playerRole === 'p1' ? { ...playerState, inventory: newInventory } : gameState.p1;
            const nextP2 = playerRole === 'p2' ? { ...playerState, inventory: newInventory } : gameState.p2;
            syncState({ ...gameState, explosionArea: blastArea, [playerRole]: playerRole === 'p1' ? nextP1 : nextP2 });
            setSelectedPieceIndex(null); setHoverCell(null); setDragData(null);
            setStagePieceCount(c => c + 1);
            setTimeout(() => {
                let newBoard = [...gameState.board];
                blastArea.forEach(({ x, y }) => { newBoard[y * size + x] = 0; });
                const newScore = gameState.score;
                const newLevel = 1 + Math.floor(newScore / 1000);
                const next = { ...gameState, board: newBoard, explosionArea: [], score: newScore, lines: gameState.lines, level: newLevel, p1: nextP1, p2: nextP2 };
                next.status = allPlayersStuck(next) ? 'game_over' : 'playing';
                syncState(next);
            }, 500);
            return;
        }

        // --- Normal placement ---
        let isValid = true;
        for (const block of piece.blocks) {
            const targetX = gridX + block.x; const targetY = gridY + block.y;
            if (targetX < 0 || targetX >= size || targetY < 0 || targetY >= size || gameState.board[targetY * size + targetX] !== 0) {
                isValid = false; break;
            }
        }

        if (!isValid) { feedback('invalid'); return; }
        feedback('place');

        let newBoard = [...gameState.board];
        for (const block of piece.blocks) newBoard[(gridY + block.y) * size + (gridX + block.x)] = { color: piece.color, type: piece.type || null, texture: piece.texture || 'default' };

        let rowsToClear = new Set(); let colsToClear = new Set();
        for (let y = 0; y < size; y++) if (newBoard.slice(y * size, (y + 1) * size).every(v => v !== 0)) rowsToClear.add(y);
        for (let x = 0; x < size; x++) {
            let colComplete = true;
            for (let y = 0; y < size; y++) { if (newBoard[y * size + x] === 0) { colComplete = false; break; } }
            if (colComplete) colsToClear.add(x);
        }

        const totalLinesCleared = rowsToClear.size + colsToClear.size;
        let newScore = gameState.score;

        if (totalLinesCleared > 0) {
            const comboScore = 100 * Math.pow(totalLinesCleared, 2);
            newScore += comboScore;
            if (dragData) {
                const id = Date.now();
                setFloatingTexts(prev => [...prev, { id, text: `+${comboScore}`, x: dragData.clientX, y: dragData.clientY - 50 }]);
                setTimeout(() => setFloatingTexts(prev => prev.filter(ft => ft.id !== id)), 1500);
            }
            if (totalLinesCleared === 1) feedback('line1');
            else if (totalLinesCleared === 2) feedback('line2');
            else if (totalLinesCleared === 3) feedback('line3');
            else feedback('line4');
            if (totalLinesCleared >= 2) { setBoardShake(true); setTimeout(() => setBoardShake(false), 350); }
        }

        let newLines = gameState.lines + totalLinesCleared;
        let newLevel = 1 + Math.floor(newScore / 1000);
        const mods = gameState.modifiers || {};

        let newInventory = [...playerState.inventory];
        newInventory[pieceIndex] = { blocks: null };
        if (newInventory.every(p => p.blocks === null)) newInventory = generateInventory(newLevel, mods);

        const nextP1 = playerRole === 'p1' ? { ...playerState, inventory: newInventory } : gameState.p1;
        const nextP2 = playerRole === 'p2' ? { ...playerState, inventory: newInventory } : gameState.p2;

        if (totalLinesCleared > 0) {
            syncState({ ...gameState, board: newBoard, clearingLines: { rows: Array.from(rowsToClear), cols: Array.from(colsToClear) }, [playerRole]: playerRole === 'p1' ? nextP1 : nextP2 });
            setSelectedPieceIndex(null); setHoverCell(null); setDragData(null);
            setStagePieceCount(c => c + 1);
            setTimeout(() => {
                let clearedBoard = [...newBoard];
                for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                    if (rowsToClear.has(y) || colsToClear.has(x)) clearedBoard[y * size + x] = 0;
                }
                const next = { ...gameState, board: clearedBoard, clearingLines: { rows: [], cols: [] }, score: newScore, lines: newLines, level: newLevel, p1: nextP1, p2: nextP2 };
                next.status = allPlayersStuck(next) ? 'game_over' : 'playing';
                syncState(next);
            }, 500);
            return;
        }

        const next = { ...gameState, board: newBoard, p1: nextP1, p2: nextP2, score: newScore, lines: newLines, level: newLevel };
        next.status = allPlayersStuck(next) ? 'game_over' : 'playing';
        syncState(next);
        setSelectedPieceIndex(null); setHoverCell(null); setDragData(null);
        setStagePieceCount(c => c + 1);
    };

    const handlePointerDown = (e, index) => {
        e.preventDefault();
        if (gameState.status === 'game_over' || showDashboard) return;
        if (!canPlacePiece(gameState.board, gameState[playerRole].inventory[index])) { feedback('invalid'); return; }
        
        const target = e.currentTarget; target.setPointerCapture(e.pointerId);
        const rect = target.getBoundingClientRect();
        setSelectedPieceIndex(index);
        setDragData({ index, pointerId: e.pointerId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, clientX: e.clientX, clientY: e.clientY, pointerType: e.pointerType, boardRect: gridRef.current ? gridRef.current.getBoundingClientRect() : null });
        feedback('select');
    };

    const handleGlobalPointerMove = (e) => {
        if (!dragData) return;
        let newDragData = { ...dragData, clientX: e.clientX, clientY: e.clientY };
        if (gridRef.current && gameState) {
            const rect = gridRef.current.getBoundingClientRect();
            const size = gameState.boardSize || BOARD_SIZE;
            const cellW = rect.width / size; const cellH = rect.height / size;
            newDragData.boardRect = rect; newDragData.cellW = cellW; newDragData.cellH = cellH;
            
            const touchOffsetY = dragData.pointerType === 'touch' ? 120 : 0; 
            const pieceX = e.clientX - dragData.offsetX; const pieceY = e.clientY - dragData.offsetY - touchOffsetY;
            const gridX = Math.round((pieceX - rect.left) / cellW); const gridY = Math.round((pieceY - rect.top) / cellH);

            const isNearBoard = pieceX >= rect.left - 40 && pieceX <= rect.right + 40 && pieceY >= rect.top - 40 && pieceY <= rect.bottom + 40;

            if (isNearBoard && gridX >= -2 && gridX <= size + 2 && gridY >= -2 && gridY <= size + 2) {
                setHoverCell({ x: gridX, y: gridY });
                const cellId = `${gridX},${gridY}`;
                if (lastHoverRef.current !== cellId) { lastHoverRef.current = cellId; feedback('hover'); }
                if (mode === 'coop' && playerRole && gameState) {
                    const piece = gameState[playerRole]?.inventory?.[dragData.index]?.blocks;
                    if (piece && piece.blocks) {
                        throttledHoverBroadcast({
                            role: playerRole,
                            x: gridX, y: gridY,
                            blocks: piece.blocks,
                            color: piece.color,
                            texture: piece.texture,
                            type: piece.type || null,
                        });
                    }
                }
            } else {
                setHoverCell(null); lastHoverRef.current = null;
                if (mode === 'coop' && playerRole) sendHoverBroadcast({ role: playerRole, x: null, y: null });
            }
        }
        setDragData(newDragData);
    };

    const handleGlobalPointerUp = (e) => {
        if (!dragData) return;
        if (hoverCell) attemptPlacement(hoverCell.x, hoverCell.y, dragData.index);
        // Always clear selection so the mini-piece returns to its spawner slot,
        // even if the drag ended off-board or on an invalid spot.
        setSelectedPieceIndex(null);
        setDragData(null); setHoverCell(null); lastHoverRef.current = null;
        if (mode === 'coop' && playerRole) sendHoverBroadcast({ role: playerRole, x: null, y: null });
    };

    const renderMiniPiece = (pieceWrapper, isSelected, onPointerDown) => {
        if (!pieceWrapper || !pieceWrapper.blocks) return <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[4px]" style={{ background: 'rgba(0,0,0,0.25)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.55)' }} />;
        const piece = pieceWrapper.blocks;
        const maxX = Math.max(...piece.blocks.map(p => p.x)); const maxY = Math.max(...piece.blocks.map(p => p.y));
        const gridW = maxX + 1; const gridH = maxY + 1;
        const isPlayable = gameState && canPlacePiece(gameState.board, pieceWrapper);
        const playabilityFilter = isPlayable ? 'hover:scale-[1.04]' : 'opacity-35 grayscale pointer-events-none cursor-not-allowed';
        const grid = Array(gridH).fill(null).map(() => Array(gridW).fill(0));
        piece.blocks.forEach(p => grid[p.y][p.x] = 1);
        return (
            <div onPointerDown={onPointerDown}
                className={`w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none transition-transform duration-150 rounded-[4px] ${isSelected ? 'opacity-25 scale-95 grayscale' : playabilityFilter}`}
                style={{ background: 'rgba(0,0,0,0.22)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.55), inset 0 -1px 0 rgba(120,75,40,0.10)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridW}, min(3.5vw, 16px))`, gridTemplateRows: `repeat(${gridH}, min(3.5vw, 16px))`, gap: '1px' }}>
                    {grid.flat().map((val, idx) => (val === 1 ? <Block key={idx} cellData={piece} /> : <div key={idx} />))}
                </div>
            </div>
        );
    };

    const renderFloatingClone = () => {
        if (!dragData || !playerRole || !gameState) return null;
        const pieceWrapper = gameState[playerRole].inventory[dragData.index];
        if (!pieceWrapper || !pieceWrapper.blocks) return null;
        const piece = pieceWrapper.blocks;
        const maxX = Math.max(...piece.blocks.map(p => p.x)); const maxY = Math.max(...piece.blocks.map(p => p.y));
        const gridW = maxX + 1; const gridH = maxY + 1;

        const isSnapped = hoverCell !== null && dragData.boardRect;
        const touchOffsetY = dragData.pointerType === 'touch' && !isSnapped ? 120 : 0; 
        
        let left, top, cellSize;
        if (isSnapped) {
            left = dragData.boardRect.left + (hoverCell.x * dragData.cellW) + 2; 
            top = dragData.boardRect.top + (hoverCell.y * dragData.cellH) + 2;
            cellSize = dragData.cellW - 2; 
        } else {
            left = dragData.clientX - dragData.offsetX;
            top = dragData.clientY - dragData.offsetY - touchOffsetY;
            cellSize = window.innerWidth < 640 ? window.innerWidth * 0.035 : 16; 
        }

        const grid = Array(gridH).fill(null).map(() => Array(gridW).fill(0));
        piece.blocks.forEach(p => grid[p.y][p.x] = 1);

        return (
            <div className="fixed pointer-events-none z-[100] flex items-center justify-center" style={{ left, top, transition: isSnapped ? 'left 0.075s ease-out, top 0.075s ease-out' : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridW}, ${cellSize}px)`, gridTemplateRows: `repeat(${gridH}, ${cellSize}px)`, gap: isSnapped ? '2px' : '1px', filter: isSnapped ? 'drop-shadow(0px 10px 10px rgba(0,0,0,0.5))' : 'drop-shadow(0px 25px 25px rgba(0,0,0,0.6))', transition: 'gap 0.1s ease-out' }}>
                    {grid.flat().map((val, idx) => (
                        val === 1 ? <div key={idx} style={{ width: `${cellSize}px`, height: `${cellSize}px`, transition: 'width 0.1s ease-out, height 0.1s ease-out' }}><Block cellData={piece} noAnim={true} extraClass={isSnapped ? 'opacity-95' : 'scale-110'} /></div> : <div key={idx} />
                    ))}
                </div>
            </div>
        );
    };

    // --- Mode menu ---
    if (mode === 'menu') {
        const modeBtn = 'w-full text-left py-4 px-5 rounded-md wood-panel flex items-center gap-4 active:translate-y-px transition-transform';
        return (
            <div className="flex flex-col h-screen items-center justify-center p-4">
                <div className="wood-panel p-7 rounded-md max-w-sm w-full">
                    <div className="text-center mb-7">
                        <h1 className="text-5xl text-[#f0e3cc] tracking-[0.18em] mb-1" style={{ fontWeight: 600, textShadow: '0 1px 0 rgba(0,0,0,0.55), 0 -1px 0 rgba(255,210,160,0.10)' }}>TETRIS</h1>
                        <p className="text-[11px] uppercase tracking-[0.4em] text-[#b59470]">pra dois · ou um</p>
                    </div>
                    <div className="space-y-2.5">
                        <button onClick={() => { setGameState(null); setPlayerRole(null); setMode('coop'); }} className={modeBtn}>
                            <span className="w-6 h-6 block-render rounded-[3px] flex-shrink-0" style={{ '--c-from': '#c0593a', '--c-to': '#7e3320' }} />
                            <span className="flex-1">
                                <span className="block text-[#f0e3cc] text-base tracking-wide" style={{ fontWeight: 600 }}>Co-op</span>
                                <span className="block text-[11px] text-[#b59470] tracking-wide">dois jogadores, em tempo real</span>
                            </span>
                        </button>
                        <div className="wood-panel rounded-md p-4">
                            <div className="flex items-center gap-4 mb-3">
                                <span className="w-6 h-6 block-render rounded-[3px] flex-shrink-0" style={{ '--c-from': '#7c9f6b', '--c-to': '#3e5b34' }} />
                                <span className="flex-1">
                                    <span className="block text-[#f0e3cc] text-base tracking-wide" style={{ fontWeight: 600 }}>Sozinho</span>
                                    <span className="block text-[11px] text-[#b59470] tracking-wide">recorde {soloHighScore}</span>
                                </span>
                            </div>
                            <div className="grid grid-cols-5 gap-1 mb-2.5">
                                {Object.entries(SOLO_DIFFICULTIES).map(([key, d]) => (
                                    <button key={key} onClick={() => setSoloDifficulty(key)}
                                        className={`text-[10px] py-1.5 rounded-[3px] tracking-wide transition-colors ${soloDifficulty === key ? 'wood-panel text-[#f0e3cc]' : 'wood-panel-deep text-[#8a6f54]'}`}
                                        style={{ fontWeight: 500 }}>{d.name}</button>
                                ))}
                            </div>
                            <button onClick={() => { setGameState(null); setPlayerRole(null); setMode('solo'); }} className="w-full py-2 wood-panel-deep rounded-[3px] text-[#f0e3cc] text-sm tracking-wider active:translate-y-px transition-transform" style={{ fontWeight: 600 }}>Jogar</button>
                        </div>
                        <button onClick={() => { setGameState(null); setPlayerRole(null); setActiveStage(null); setMode('career-map'); }} className={modeBtn}>
                            <span className="w-6 h-6 block-render rounded-[3px] flex-shrink-0" style={{ '--c-from': '#cf8b34', '--c-to': '#8c5316' }} />
                            <span className="flex-1">
                                <span className="block text-[#f0e3cc] text-base tracking-wide" style={{ fontWeight: 600 }}>Carreira</span>
                                <span className="block text-[11px] text-[#b59470] tracking-wide">20 etapas, três estrelas cada</span>
                            </span>
                        </button>
                    </div>
                </div>
                <div className="mt-3 text-[10px] text-[#7a614a] tracking-wider w-full max-w-sm flex justify-end px-1">{appVersion}</div>
            </div>
        );
    }

    // --- Career stage map ---
    if (mode === 'career-map') {
        if (!careerSave) return <div className="flex h-screen items-center justify-center text-[#b59470] tracking-wider">carregando carreira...</div>;
        const totalStars = careerSave.totalStars || 0;
        const maxStars = CAREER_STAGES.length * 3;
        return (
            <div className="min-h-screen p-4 sm:p-8 overflow-y-auto">
                <div className="max-w-3xl mx-auto">
                    <div className="flex justify-between items-center mb-7">
                        <button onClick={goToMenu} className="wood-panel px-4 py-2 rounded-md text-[#f0e3cc] text-sm tracking-wide active:translate-y-px transition-transform" style={{ fontWeight: 500 }}>← Menu</button>
                        <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 block-render rounded-[3px]" style={{ '--c-from': '#d2b047', '--c-to': '#8a6c1e' }} />
                            <span className="text-[#e8c468] text-base tracking-wide" style={{ fontWeight: 600 }}>{totalStars}</span>
                            <span className="text-[#8a6f54] text-sm tracking-wide">/ {maxStars}</span>
                        </div>
                    </div>
                    <h1 className="text-[#f0e3cc] text-2xl tracking-[0.16em] uppercase mb-6" style={{ fontWeight: 600, textShadow: '0 1px 0 rgba(0,0,0,0.5)' }}>Carreira</h1>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {CAREER_STAGES.map(stage => {
                            const data = careerSave.stages?.[stage.id];
                            const unlocked = stage.id <= (careerSave.lastUnlocked || 1);
                            const stars = data?.stars || 0;
                            return (
                                <button key={stage.id} disabled={!unlocked} onClick={() => startStage(stage)}
                                    className={`p-4 rounded-md text-left transition-transform ${unlocked ? 'wood-panel active:translate-y-px' : 'wood-panel-deep opacity-50 cursor-not-allowed'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] tracking-[0.2em] text-[#8a6f54]" style={{ fontWeight: 500 }}>nº{String(stage.id).padStart(2, '0')}</span>
                                        <span className="flex gap-0.5">{Array(3).fill(0).map((_, i) => <span key={i} className={i < stars ? 'text-[#e8c468]' : 'text-[#3a2616]'} style={{ fontSize: '12px' }}>★</span>)}</span>
                                    </div>
                                    <div className="text-[#f0e3cc] text-base mb-1 tracking-wide" style={{ fontWeight: 600 }}>{stage.name}</div>
                                    <div className="text-[11px] text-[#b59470] mb-2 leading-snug">{stage.hint}</div>
                                    <div className="text-[10px] uppercase tracking-[0.18em] text-[#cf8b34]" style={{ fontWeight: 500 }}>{stage.objective.type === 'score' ? `${stage.objective.target} pts` : stage.objective.type === 'lines' ? `${stage.objective.target} linhas` : `${stage.objective.target} peças`}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // Co-op room landing — no room slug in URL, user creates or auto-generates
    if (mode === 'coop' && !coopRoom) {
        return (
            <div className="flex flex-col h-screen items-center justify-center p-4">
                <div className="wood-panel p-7 rounded-md max-w-sm w-full text-center">
                    <h1 className="text-3xl text-[#f0e3cc] tracking-[0.16em] uppercase mb-1" style={{ fontWeight: 600, textShadow: '0 1px 0 rgba(0,0,0,0.5)' }}>Sala nova</h1>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-[#b59470] mb-6">passe o link pro amigo</p>
                    <div className="space-y-3">
                        <input type="text" value={roomCreateName} onChange={(e) => setRoomCreateName(e.target.value)}
                            placeholder="nome (opcional)"
                            maxLength={50}
                            className="w-full px-4 py-3 wood-panel-deep rounded-md text-[#f0e3cc] text-sm placeholder:text-[#7a614a] focus:outline-none" />
                        {roomCreateError && <div className="text-xs text-[#d4a06b] tracking-wide" style={{ fontWeight: 500 }}>{roomCreateError}</div>}
                        <button onClick={() => createRoom(roomCreateName.trim())} disabled={roomCreating}
                            className="w-full py-3.5 wood-panel rounded-md text-[#f0e3cc] tracking-wide disabled:opacity-50 active:translate-y-px transition-transform" style={{ fontWeight: 600 }}>
                            {roomCreating ? 'criando…' : (roomCreateName.trim() ? 'criar com esse nome' : 'criar sala')}
                        </button>
                        <button onClick={() => { setRoomCreateName(''); createRoom(''); }} disabled={roomCreating}
                            className="w-full py-3 wood-panel-deep rounded-md text-[#b59470] tracking-wide text-sm disabled:opacity-50 active:translate-y-px transition-transform" style={{ fontWeight: 500 }}>
                            sortear nome
                        </button>
                        <button onClick={goToMenu} className="w-full py-2 text-[#8a6f54] text-sm tracking-wide hover:text-[#b59470] transition-colors" style={{ fontWeight: 500 }}>← voltar</button>
                    </div>
                </div>
            </div>
        );
    }

    // Co-op join screen — render before loading guard so first player can create the room
    if (mode === 'coop' && !playerRole) {
        const noPlayers = !gameState || (!gameState.p1 && !gameState.p2);
        const existingSize = gameState?.boardSize || 10;
        return (
            <div className="flex flex-col h-screen items-center justify-center p-4">
                <div className="wood-panel p-7 rounded-md max-w-sm w-full text-center">
                    <h1 className="text-3xl text-[#f0e3cc] tracking-[0.16em] uppercase mb-1" style={{ fontWeight: 600, textShadow: '0 1px 0 rgba(0,0,0,0.5)' }}>Co-op</h1>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-[#b59470] mb-4">escolha um lado</p>
                    <div className="mb-5 flex items-center justify-center gap-2 text-[11px]">
                        <span className="px-2.5 py-1 wood-panel-deep rounded-[3px] text-[#b59470] tracking-wide" style={{ fontWeight: 500 }}>sala · {coopRoom}</span>
                        <button onClick={shareLink} className="px-2.5 py-1 wood-panel rounded-[3px] text-[#f0e3cc] tracking-wide active:translate-y-px transition-transform" style={{ fontWeight: 500 }}>{shareCopied ? 'copiado' : 'copiar link'}</button>
                    </div>
                    {noPlayers ? (
                        <div className="mb-5">
                            <div className="text-[10px] uppercase tracking-[0.3em] text-[#8a6f54] mb-2" style={{ fontWeight: 500 }}>tamanho</div>
                            <div className="grid grid-cols-2 gap-2">
                                {[8, 10].map(s => (
                                    <button key={s} onClick={() => setCoopBoardSize(s)}
                                        className={`py-3 rounded-md text-sm tracking-wide transition-transform active:translate-y-px ${coopBoardSize === s ? 'wood-panel text-[#f0e3cc]' : 'wood-panel-deep text-[#8a6f54]'}`}
                                        style={{ fontWeight: 600 }}>
                                        {s} × {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="mb-4 text-[10px] text-[#8a6f54] tracking-[0.3em] uppercase" style={{ fontWeight: 500 }}>em jogo · {existingSize} × {existingSize}</div>
                    )}
                    <div className="space-y-2.5">
                        {!gameState?.p1
                            ? <button onClick={() => joinGame('p1', 'Jogador 1')} className="w-full py-3.5 wood-panel rounded-md text-[#f0e3cc] tracking-wide active:translate-y-px transition-transform flex items-center justify-center gap-3" style={{ fontWeight: 600 }}>
                                <span className="w-5 h-5 block-render rounded-[3px]" style={{ '--c-from': '#c0593a', '--c-to': '#7e3320' }} />
                                Jogador 1
                              </button>
                            : <div className="py-3.5 wood-panel-deep rounded-md text-[#b59470] text-sm tracking-wide flex items-center justify-center gap-3" style={{ fontWeight: 500 }}>
                                <span className="w-5 h-5 block-render rounded-[3px]" style={{ '--c-from': '#c0593a', '--c-to': '#7e3320' }} />
                                Jogador 1 · conectado
                              </div>}
                        {!gameState?.p2
                            ? <button onClick={() => joinGame('p2', 'Jogador 2')} className="w-full py-3.5 wood-panel rounded-md text-[#f0e3cc] tracking-wide active:translate-y-px transition-transform flex items-center justify-center gap-3" style={{ fontWeight: 600 }}>
                                <span className="w-5 h-5 block-render rounded-[3px]" style={{ '--c-from': '#6c8ba6', '--c-to': '#385571' }} />
                                Jogador 2
                              </button>
                            : <div className="py-3.5 wood-panel-deep rounded-md text-[#b59470] text-sm tracking-wide flex items-center justify-center gap-3" style={{ fontWeight: 500 }}>
                                <span className="w-5 h-5 block-render rounded-[3px]" style={{ '--c-from': '#6c8ba6', '--c-to': '#385571' }} />
                                Jogador 2 · conectado
                              </div>}
                        <button onClick={endSession} className="w-full py-2.5 wood-panel-deep rounded-md text-[#c08066] text-xs tracking-wide active:translate-y-px transition-transform" style={{ fontWeight: 500 }}>encerrar sessão</button>
                        <button onClick={goToMenu} className="w-full py-2 text-[#8a6f54] text-sm tracking-wide hover:text-[#b59470] transition-colors" style={{ fontWeight: 500 }}>← voltar</button>
                    </div>
                </div>
            </div>
        );
    }

    // --- Loading guards for solo / career-stage ---
    if (!gameState) return <div className="flex h-screen items-center justify-center text-[#b59470] tracking-wider">carregando…</div>;

    if (!playerRole) return <div className="flex h-screen items-center justify-center text-[#b59470] tracking-wider">carregando…</div>;

    return (
        <div className="fixed inset-0 text-[#f0e3cc] selection:bg-transparent overflow-hidden flex flex-col touch-none" onPointerMove={handleGlobalPointerMove} onPointerUp={handleGlobalPointerUp} onPointerLeave={handleGlobalPointerUp}>
            {floatingTexts.map(ft => <div key={ft.id} className="fixed pointer-events-none z-[200] animate-floatUp text-2xl text-[#e8c468] tracking-wide" style={{ left: ft.x, top: ft.y, transform: 'translate(-50%, -50%)', fontWeight: 600, textShadow: '0 2px 0 rgba(0,0,0,0.55)' }}>{ft.text}</div>)}

            <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 flex justify-between items-start z-20 pointer-events-none">
                <button onClick={() => setShowDashboard(true)} className="pointer-events-auto wood-panel p-3 rounded-md text-[#f0e3cc] active:translate-y-px transition-transform"><IconMenu /></button>
                <div className="flex gap-2 sm:gap-3 flex-col sm:flex-row items-end sm:items-center pointer-events-auto">
                    <div className="wood-panel px-4 py-2 rounded-md flex items-center gap-2.5">
                        <span className="text-[#e8c468]"><IconTrophy /></span>
                        <span className="text-[#f0e3cc] text-base tracking-wide tabular-nums" style={{ fontWeight: 600 }}>{gameState.score}</span>
                    </div>
                    <div className="wood-panel px-3 py-2 rounded-md hidden sm:flex items-center gap-2 text-[#b59470]">
                        <span className="text-[10px] uppercase tracking-[0.25em]" style={{ fontWeight: 500 }}>nv</span>
                        <span className="text-[#f0e3cc] text-sm tabular-nums" style={{ fontWeight: 600 }}>{gameState.level}</span>
                    </div>
                    <button onClick={toggleFullscreen} className="wood-panel p-3 rounded-md text-[#f0e3cc] active:translate-y-px transition-transform">{isFullscreen ? <IconExitFullscreen /> : <IconFullscreen />}</button>
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center pt-24 pb-6 px-2 z-10 w-full max-w-4xl mx-auto h-full">
                <div ref={gridRef} className={`grid gap-[2px] p-2.5 board-bezel rounded-md select-none touch-none mb-auto mt-auto ${boardShake ? 'animate-board-shake' : ''}`} style={{ gridTemplateColumns: `repeat(${gameState.boardSize || BOARD_SIZE}, minmax(0, 1fr))`, width: 'min(95vw, calc(100vh - 240px), 95vh, 620px)', aspectRatio: '1 / 1' }}>
                    {gameState.board.map((cellValue, index) => {
                        const size = gameState.boardSize || BOARD_SIZE;
                        const x = index % size; const y = Math.floor(index / size);
                        const inClearingRow = gameState.clearingLines?.rows?.includes(y);
                        const inClearingCol = gameState.clearingLines?.cols?.includes(x);
                        const inExplosion = gameState.explosionArea?.some(c => c.x === x && c.y === y);
                        const isDissolving = inClearingRow || inClearingCol || inExplosion;
                        const staggerDelay = inClearingRow ? x * 35 : (inClearingCol ? y * 35 : 0);
                        const ghosted = partnerHover && partnerHover.blocks && partnerHover.x != null
                            && partnerHover.blocks.some(b => (partnerHover.x + b.x) === x && (partnerHover.y + b.y) === y);
                        const ghostColors = ghosted ? (COLOR_MAP[partnerHover.color] || ['#888','#555']) : null;
                        return <div key={index} className="relative aspect-square p-[1px]">
                            <Block cellData={cellValue !== 0 ? cellValue : null} isDissolving={isDissolving} staggerDelay={staggerDelay} burst={inClearingRow || inClearingCol} />
                            {ghosted && cellValue === 0 && (
                                <div className="absolute inset-[1px] rounded-[3px] pointer-events-none"
                                    style={{ background: `linear-gradient(160deg, ${ghostColors[0]}44, ${ghostColors[1]}33)`, boxShadow: `inset 0 0 0 1px ${ghostColors[0]}66` }} />
                            )}
                        </div>;
                    })}
                </div>

                <div className="w-full mt-4 flex justify-between px-2 sm:px-8 items-end pb-2">
                    {(() => {
                        const partnerRole = playerRole === 'p1' ? 'p2' : 'p1';
                        const partnerState = gameState[partnerRole];
                        if (!partnerState) return <div className="w-1/3"></div>;
                        return (
                            <div className="flex flex-col items-start gap-2 opacity-55 scale-75 origin-bottom-left pointer-events-none w-1/3">
                                <span className="text-[10px] uppercase tracking-[0.25em] text-[#8a6f54]" style={{ fontWeight: 500 }}>{partnerState.name}</span>
                                <div className="flex gap-2">{partnerState.inventory.map((piece, idx) => (<div key={`remote-${idx}`}>{renderMiniPiece(piece, false, () => {})}</div>))}</div>
                            </div>
                        );
                    })()}
                    <div className="flex flex-col items-center gap-2 w-auto flex-1">
                        <span className="text-[10px] uppercase tracking-[0.4em] text-[#b59470]" style={{ fontWeight: 500 }}>suas peças</span>
                        <div className="flex gap-3 sm:gap-4 wood-panel-deep p-3 sm:p-3.5 rounded-md">
                            {gameState[playerRole].inventory.map((piece, idx) => (<div key={`local-${idx}`}>{renderMiniPiece(piece, selectedPieceIndex === idx, (e) => handlePointerDown(e, idx))}</div>))}
                        </div>
                    </div>
                    <div className="w-1/3 hidden sm:block"></div>
                </div>
            </div>

            {renderFloatingClone()}

            {showDashboard && (
                <div className="absolute inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/70" onClick={() => setShowDashboard(false)} />
                    <div className="relative w-full max-w-sm wood-panel-deep h-full p-7 flex flex-col" style={{ boxShadow: '-12px 0 24px rgba(0,0,0,0.55), inset 1px 0 0 rgba(120,75,40,0.18)' }}>
                        <button onClick={() => setShowDashboard(false)} className="absolute top-5 right-5 text-[#b59470] wood-panel p-2 rounded-md active:translate-y-px transition-transform"><IconX /></button>
                        <h2 className="text-xl text-[#f0e3cc] mb-7 mt-1 tracking-[0.18em] uppercase" style={{ fontWeight: 600, textShadow: '0 1px 0 rgba(0,0,0,0.5)' }}>Painel</h2>
                        <div className="wood-panel p-5 rounded-md mb-5">
                            {(() => { const scoreInLevel = gameState.score - (gameState.level - 1) * 1000; return (<>
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-[10px] tracking-[0.25em] uppercase text-[#b59470]" style={{ fontWeight: 500 }}>nv {gameState.level} → {gameState.level + 1}</span>
                                <span className="text-xs text-[#e8c468] tabular-nums" style={{ fontWeight: 600 }}>{scoreInLevel} / 1000</span>
                            </div>
                            <div className="w-full wood-panel-deep rounded-[2px] h-2.5"><div className="h-full rounded-[2px]" style={{ width: `${Math.min(100, scoreInLevel / 10)}%`, background: 'linear-gradient(180deg,#e8c468,#a07423)', boxShadow: 'inset 0 1px 0 rgba(255,235,180,0.35), inset 0 -1px 0 rgba(60,30,0,0.4)' }} /></div>
                            </>); })()}
                        </div>
                        <div className="mt-auto flex flex-col gap-3">
                            {mode === 'coop' && coopRoom && (
                                <div className="wood-panel p-4 rounded-md">
                                    <div className="text-[10px] uppercase tracking-[0.3em] text-[#8a6f54] mb-2" style={{ fontWeight: 500 }}>sala</div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[#b59470] text-sm truncate tracking-wide">{coopRoom}</span>
                                        <button onClick={shareLink} className="px-3 py-2 wood-panel-deep rounded-[3px] text-[#f0e3cc] text-xs whitespace-nowrap active:translate-y-px transition-transform tracking-wide" style={{ fontWeight: 500 }}>{shareCopied ? 'copiado' : 'copiar link'}</button>
                                    </div>
                                </div>
                            )}
                            <button onClick={resetGame} className="w-full py-3.5 wood-panel rounded-md text-[#c08066] tracking-wide flex items-center justify-center gap-2 active:translate-y-px transition-transform" style={{ fontWeight: 500 }}><IconRefresh /> Reiniciar tabuleiro</button>
                            {mode === 'coop' && <button onClick={leaveGame} className="w-full py-3 text-[#8a6f54] hover:text-[#b59470] rounded-md text-sm flex items-center justify-center gap-2 tracking-wide transition-colors" style={{ fontWeight: 500 }}><IconLogOut /> Sair da sala</button>}
                            <button onClick={goToMenu} className="w-full py-3 text-[#8a6f54] hover:text-[#b59470] rounded-md text-sm flex items-center justify-center gap-2 tracking-wide transition-colors" style={{ fontWeight: 500 }}><IconLogOut /> Voltar ao menu</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Career stage HUD strip */}
            {mode === 'career-stage' && activeStage && (
                <div className="absolute top-20 left-0 right-0 flex justify-center z-20 pointer-events-none">
                    <div className="wood-panel px-4 py-2 rounded-md flex items-center gap-3 text-xs">
                        <span className="w-2.5 h-2.5 block-render rounded-[2px]" style={{ '--c-from': '#cf8b34', '--c-to': '#8c5316' }} />
                        <span className="text-[#f0e3cc] tracking-wide" style={{ fontWeight: 600 }}>nº{String(activeStage.id).padStart(2,'0')} · {activeStage.name}</span>
                        {(() => {
                            const obj = activeStage.objective;
                            const v = obj.type === 'score' ? gameState.score : obj.type === 'lines' ? gameState.lines : stagePieceCount;
                            const label = obj.type === 'score' ? 'pts' : obj.type === 'lines' ? 'linhas' : 'peças';
                            return <span className="text-[#b59470] tracking-wide tabular-nums" style={{ fontWeight: 500 }}>{v} / {obj.target} {label}</span>;
                        })()}
                    </div>
                </div>
            )}

            {/* Career stage result modal */}
            {mode === 'career-stage' && stageResult && (
                <div className="absolute inset-0 z-[60] bg-black/85 flex items-center justify-center p-4">
                    <div className="wood-panel p-9 rounded-md max-w-sm w-full text-center">
                        {stageResult === 'won' ? (() => {
                            const stars = computeStars(activeStage, gameState, stagePieceCount);
                            return (<>
                                <div className="text-4xl mb-3">{Array(3).fill(0).map((_, i) => <span key={i} className={i < stars ? 'text-[#e8c468]' : 'text-[#3a2616]'}>★</span>)}</div>
                                <h2 className="text-2xl text-[#f0e3cc] mb-1 tracking-[0.16em] uppercase" style={{ fontWeight: 600 }}>Vitória</h2>
                                <p className="text-[#b59470] text-sm mb-6 tracking-wide">{activeStage.name} completo</p>
                            </>);
                        })() : (<>
                            <div className="text-[#c08066] flex justify-center mb-4"><IconAlert /></div>
                            <h2 className="text-2xl text-[#f0e3cc] mb-1 tracking-[0.16em] uppercase" style={{ fontWeight: 600 }}>Mais uma</h2>
                            <p className="text-[#b59470] text-sm mb-6 tracking-wide">objetivo não alcançado</p>
                        </>)}
                        <div className="wood-panel-deep rounded-md p-4 mb-6">
                            <p className="text-[10px] uppercase tracking-[0.3em] text-[#8a6f54] mb-1" style={{ fontWeight: 500 }}>pontuação</p>
                            <p className="text-3xl text-[#f0e3cc] tabular-nums" style={{ fontWeight: 600, textShadow: '0 1px 0 rgba(0,0,0,0.5)' }}>{gameState.score}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button onClick={retryStage} className="w-full py-3 wood-panel rounded-md text-[#f0e3cc] tracking-wide flex items-center justify-center gap-2 active:translate-y-px transition-transform" style={{ fontWeight: 500 }}><IconRefresh /> Repetir</button>
                            {stageResult === 'won' && (() => {
                                const next = CAREER_STAGES.find(s => s.id === activeStage.id + 1);
                                return next ? <button onClick={() => startStage(next)} className="w-full py-3 wood-panel rounded-md text-[#f0e3cc] tracking-wide flex items-center justify-center gap-2 active:translate-y-px transition-transform" style={{ fontWeight: 600 }}>Próxima · {next.name}</button> : null;
                            })()}
                            <button onClick={() => { setMode('career-map'); setGameState(null); setActiveStage(null); setStageResult(null); }} className="w-full py-2 text-[#8a6f54] hover:text-[#b59470] text-sm tracking-wide transition-colors" style={{ fontWeight: 500 }}>← Mapa</button>
                        </div>
                    </div>
                </div>
            )}

            {gameState.status === 'game_over' && !(mode === 'career-stage' && stageResult) && (
                <div className="absolute inset-0 z-[60] bg-black/85 flex items-center justify-center p-4">
                    <div className="wood-panel p-9 rounded-md max-w-sm w-full text-center">
                        <div className="text-[#c08066] flex justify-center mb-5"><IconAlert /></div>
                        <h2 className="text-3xl text-[#f0e3cc] mb-2 tracking-[0.2em] uppercase" style={{ fontWeight: 600, textShadow: '0 1px 0 rgba(0,0,0,0.55)' }}>Fim de jogo</h2>
                        <p className="text-[#b59470] mb-7 text-sm tracking-wide">nenhuma peça encaixa</p>
                        <div className="wood-panel-deep rounded-md p-5 mb-7">
                            <p className="text-[10px] uppercase tracking-[0.3em] text-[#8a6f54] mb-2" style={{ fontWeight: 500 }}>pontuação{mode === 'solo' ? ' solo' : mode === 'coop' ? ' compartilhada' : ''}</p>
                            <p className="text-4xl text-[#f0e3cc] tabular-nums" style={{ fontWeight: 600, textShadow: '0 1px 0 rgba(0,0,0,0.55)' }}>{gameState.score}</p>
                            {mode === 'solo' && gameState.score >= soloHighScore && gameState.score > 0 && <p className="text-[10px] text-[#e8c468] tracking-[0.3em] uppercase mt-2" style={{ fontWeight: 600 }}>novo recorde</p>}
                        </div>
                        <div className="flex flex-col gap-2">
                            <button onClick={resetGame} className="w-full py-3.5 wood-panel rounded-md text-[#f0e3cc] tracking-wide flex items-center justify-center gap-2 active:translate-y-px transition-transform" style={{ fontWeight: 600 }}><IconRefresh /> Nova partida</button>
                            <button onClick={goToMenu} className="w-full py-2 text-[#8a6f54] hover:text-[#b59470] text-sm tracking-wide transition-colors" style={{ fontWeight: 500 }}>← Voltar ao menu</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
