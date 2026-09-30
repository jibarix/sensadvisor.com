// A 3×3×3 cube as 26 cubies drawn with CSS 3D transforms.
//
// Model coordinates: x right, y up, z toward the viewer; each cubie carries a
// position p (integers in -1..1) and an orientation O (3×3, row-major). A face
// turn rotates every cubie in its layer. The scramble is random; its solution
// is simply the scramble inverted, so every state along the solve can be
// precomputed and any scroll position maps straight onto one of them.

const FACES = {
    U: { axis: 1, layer: 1, cw: -1 }, D: { axis: 1, layer: -1, cw: 1 },
    R: { axis: 0, layer: 1, cw: -1 }, L: { axis: 0, layer: -1, cw: 1 },
    F: { axis: 2, layer: 1, cw: -1 }, B: { axis: 2, layer: -1, cw: 1 },
};

// Cubie faces in local coordinates: outward normal, CSS placement, and the
// cube face whose colour a sticker there carries in the solved state.
const LOCAL = [
    { n: [0, 0, 1], f: 'F', css: 'translateZ(var(--h))' },
    { n: [0, 0, -1], f: 'B', css: 'rotateY(180deg) translateZ(var(--h))' },
    { n: [1, 0, 0], f: 'R', css: 'rotateY(90deg) translateZ(var(--h))' },
    { n: [-1, 0, 0], f: 'L', css: 'rotateY(-90deg) translateZ(var(--h))' },
    { n: [0, 1, 0], f: 'U', css: 'rotateX(90deg) translateZ(var(--h))' },
    { n: [0, -1, 0], f: 'D', css: 'rotateX(-90deg) translateZ(var(--h))' },
];

// Direct light from above, leaning slightly toward the viewer.
const LIGHT = (() => { const v = [0.12, 1, 0.42], m = Math.hypot(...v); return v.map(c => c / m); })();

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const rot = (axis, th) => {
    const c = Math.cos(th), s = Math.sin(th);
    if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
    if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
    return [c, -s, 0, s, c, 0, 0, 0, 1];
};
const mm = (A, B) => {
    const C = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
        C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    return C;
};
const mv = (A, v) => [
    A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
    A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
    A[6] * v[0] + A[7] * v[1] + A[8] * v[2],
];
const round = a => a.map(x => Math.round(x) + 0);   // + 0 folds -0 into 0

const angle = m => FACES[m.f].cw * (m.t === 2 ? 2 : m.t) * Math.PI / 2;

// Random scramble: no two consecutive turns on the same axis, so no move
// cancels or merges with its neighbour.
export function scramble(n = 20, rnd = Math.random) {
    const out = [];
    let lastAxis = -1;
    while (out.length < n) {
        const f = 'UDRLFB'[Math.floor(rnd() * 6)];
        if (FACES[f].axis === lastAxis) continue;
        lastAxis = FACES[f].axis;
        const r = rnd();
        out.push({ f, t: r < 1 / 3 ? 1 : r < 2 / 3 ? -1 : 2 });
    }
    return out;
}
export const inverse = seq => seq.slice().reverse().map(m => ({ f: m.f, t: m.t === 2 ? 2 : -m.t }));
// Group notation: R, R⁻¹, R².
export const notation = m => m.f + (m.t === -1 ? '⁻¹' : m.t === 2 ? '²' : '');

function turn(state, m) {
    const { axis, layer } = FACES[m.f];
    const R = rot(axis, angle(m));
    return state.map(c => c.p[axis] === layer ? { p: round(mv(R, c.p)), O: round(mm(R, c.O)) } : c);
}

// Dwell at each end of a turn so the cube rests between moves.
const ease = f => { const x = Math.min(1, Math.max(0, (f - 0.12) / 0.76)); return x * x * (3 - 2 * x); };

export class Cube {
    constructor(el) {
        this.el = el;
        this.S = 60;
        this.cubies = [];
        this.sol = [];
        this.states = [];
        for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
            if (!x && !y && !z) continue;
            const node = document.createElement('div');
            node.className = 'cubie';
            const p0 = [x, y, z];
            // Only outward (sticker) faces are drawn. Inner faces only show
            // through the gap mid-turn, where the dark page reads as the
            // core, and they confuse the browser's 3D depth sorting.
            const faces = LOCAL.filter(d => d.n[0] * x + d.n[1] * y + d.n[2] * z === 1).map(d => {
                const f = document.createElement('div');
                f.className = 'f st';
                f.dataset.c = d.f;
                f.style.transform = d.css;
                node.appendChild(f);
                return { el: f, n: d.n, face: d.f, d: -1 };
            });
            el.appendChild(node);
            this.cubies.push({ node, p0, faces, center: Math.abs(x) + Math.abs(y) + Math.abs(z) === 1 });
        }
    }

    setSize(S) { this.S = S; this.el.style.setProperty('--s', `${S}px`); }

    // Precompute state k = scramble followed by the first k solution turns.
    set(scr, sol) {
        this.sol = sol;
        let s = this.cubies.map(c => ({ p: c.p0.slice(), O: I3.slice() }));
        for (const m of scr) s = turn(s, m);
        this.states = [s];
        for (const m of sol) this.states.push(s = turn(s, m));
    }

    // Light up the centre sticker of one face (or none).
    highlight(face) {
        for (const c of this.cubies) if (c.center)
            for (const f of c.faces) f.el.classList.toggle('hot', f.face === face);
    }

    // progress 0..1 across the whole solve; view angles in degrees.
    render(progress, pitch, yaw) {
        const n = this.sol.length;
        const seg = Math.min(1, Math.max(0, progress)) * n;
        let k = Math.floor(seg), f = seg - k;
        if (k >= n) { k = n; f = 0; }
        const st = this.states[k];
        const m = k < n ? this.sol[k] : null;
        const e = m ? ease(f) : 0;
        const spin = m && e > 0 ? FACES[m.f] : null;
        const Rp = spin ? rot(spin.axis, angle(m) * e) : null;
        const V = mm(rot(0, pitch * Math.PI / 180), rot(1, yaw * Math.PI / 180));
        const S = this.S;

        for (let i = 0; i < this.cubies.length; i++) {
            const c = this.cubies[i], { p, O } = st[i];
            const moving = spin && p[spin.axis] === spin.layer;
            const M = mm(V, moving ? mm(Rp, O) : O);
            const t = mv(V, moving ? mv(Rp, p) : p);
            // Model (y up) → CSS (y down): conjugate by diag(1, -1, 1).
            c.node.style.transform = `matrix3d(${M[0]},${-M[3]},${M[6]},0,${-M[1]},${M[4]},${-M[7]},0,${M[2]},${-M[5]},${M[8]},0,${t[0] * S},${-t[1] * S},${t[2] * S},1)`;
            for (const fc of c.faces) {
                const nw = mv(M, fc.n);
                if (nw[2] <= 0) continue;              // facing away: hidden anyway
                const lit = Math.max(0, nw[0] * LIGHT[0] + nw[1] * LIGHT[1] + nw[2] * LIGHT[2]);
                const d = Math.round((0.72 - 0.72 * lit) * 100) / 100;
                if (d !== fc.d) { fc.d = d; fc.el.style.setProperty('--d', d); }
            }
        }
        return { k, e, n, solved: k === n };
    }
}
