// The hero's background: a neuron field drawn in the expression's own
// glyphs. Point at the cube and the glyphs leave the neuron, drop the ones
// the expression doesn't need, and set the expression above the cube; the
// live DOM expression then takes over. Point away and they grow back.

const CW = 8, CH = 11;            // the character grid, in CSS px
const HOME_SIZE = 9;              // glyph size in the neuron field
const ATLAS = 64;                 // atlas glyph size, in device px
// Glyphs from the expression, light to heavy.
const RAMP = ['·', ',', '−', '¹', '²', '1', '=', 'e', '|', 'g', '∈', '7', '4', '2', '5', '3', '9', '6', '0', '8',
    'ℒ', 'ℛ', 'ℱ', '𝒰', 'ℬ', '𝒟', '𝒢'];

const html = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const clamp = v => Math.min(1, Math.max(0, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

// Seeded, so the neuron keeps its shape between visits and resizes.
function rng(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─── Growing the neuron on the character grid ──────────────────────────
// Somas are round, shaded like a lit sphere with the bright rim of an
// electron micrograph; dendrites are tapering random walks that fork.
// Each cell keeps its density and its distance along the branch from the
// soma, which carries the signal pulses.
function grow(w, h) {
    const rnd = rng(7);
    const cols = Math.ceil(w / CW), rows = Math.ceil(h / CH);
    const dens = new Float32Array(cols * rows);
    const dist = new Float32Array(cols * rows).fill(1e9);
    const u = Math.min(w, h);
    const stamp = (x, y, r, v, d) => {
        const reach = Math.max(r, CW * .5);
        const c0 = Math.max(0, Math.floor((x - reach) / CW)), c1 = Math.min(cols - 1, Math.floor((x + reach) / CW));
        const r0 = Math.max(0, Math.floor((y - reach) / CH)), r1 = Math.min(rows - 1, Math.floor((y + reach) / CH));
        for (let rr = r0; rr <= r1; rr++) for (let c = c0; c <= c1; c++) {
            const q = Math.hypot((c + .5) * CW - x, (rr + .5) * CH - y) / reach;
            if (q >= 1) continue;
            const i = rr * cols + c;
            dens[i] = Math.max(dens[i], v * (.4 + .6 * Math.sqrt(1 - q * q)));   // a lit tube
            dist[i] = Math.min(dist[i], d);
        }
    };
    const out = (x, y) => x < -w * .15 || x > w * 1.15 || y < -h * .15 || y > h * 1.15;
    function branch(x, y, ang, th, d, depth) {
        for (let n = 0; n < 600 && th > .7 && !out(x, y); n++) {
            x += Math.cos(ang) * 5; y += Math.sin(ang) * 5; d += 5;
            ang += (rnd() - .5) * .3;
            th *= th > 6 ? .955 : .982;   // a thick cone off the body, then long and thin
            stamp(x, y, th, Math.min(.75, .3 + th / 16), d);
            if (depth < 4 && rnd() < .035) {
                const s = (rnd() < .5 ? -1 : 1) * (.35 + rnd() * .55);
                branch(x, y, ang + s, th * .72, d, depth + 1);
                ang -= s * .35; th *= .86;
            }
        }
    }
    const somas = [
        { x: .22, y: .3, r: .11, n: 8 },
        { x: .93, y: .82, r: .09, n: 7 },
        { x: -.04, y: 1.02, r: .08, n: 5 },
    ];
    for (const s of somas) {
        const sx = s.x * w, sy = s.y * h, R = s.r * u;
        // The cell body: a round, slightly lumpy sphere, lit from the top
        // left, with the bright rim an electron micrograph gives an edge.
        const p1 = rnd() * 6.3, p2 = rnd() * 6.3;
        const edge = a => R * (1 + .06 * Math.sin(3 * a + p1) + .04 * Math.sin(5 * a + p2));
        const L = [-.45, -.55, .7];
        const c0 = Math.max(0, Math.floor((sx - R * 1.2) / CW)), c1 = Math.min(cols - 1, Math.floor((sx + R * 1.2) / CW));
        const r0 = Math.max(0, Math.floor((sy - R * 1.2) / CH)), r1 = Math.min(rows - 1, Math.floor((sy + R * 1.2) / CH));
        for (let rr = r0; rr <= r1; rr++) for (let c = c0; c <= c1; c++) {
            const dx = (c + .5) * CW - sx, dy = (rr + .5) * CH - sy;
            const q = Math.hypot(dx, dy) / edge(Math.atan2(dy, dx));
            if (q >= 1) continue;
            const nx = dx / R, ny = dy / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
            const lit = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
            const i = rr * cols + c;
            dens[i] = Math.max(dens[i], clamp(.14 + lit * .8 + q ** 8 * .5 + (rnd() - .5) * .08));
            dist[i] = 0;
        }
        const a0 = rnd() * Math.PI * 2;
        for (let k = 0; k < s.n; k++) {
            const a = a0 + k * Math.PI * 2 / s.n + (rnd() - .5) * .5;
            branch(sx + Math.cos(a) * R * .85, sy + Math.sin(a) * R * .85, a, R * (.15 + rnd() * .08), R * .85, 0);
        }
    }
    // One long axon from the first soma towards the second.
    let x = somas[0].x * w, y = somas[0].y * h, d = 0, th = 3.2;
    let ang = Math.atan2(somas[1].y * h - y, somas[1].x * w - x);
    for (let n = 0; n < 900 && !out(x, y); n++) {
        const goal = Math.atan2(somas[1].y * h - y, somas[1].x * w - x);
        ang += (rnd() - .5) * .22 + (goal - ang) * .02;
        x += Math.cos(ang) * 5; y += Math.sin(ang) * 5; d += 5;
        stamp(x, y, th, .42, d);
        if (Math.hypot(somas[1].x * w - x, somas[1].y * h - y) < somas[1].r * u) break;
    }

    const parts = [];
    for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
        const i = rr * cols + c, v = dens[i];
        if (dist[i] > 0 ? v < .3 || rnd() < .5 * (1 - v) : v < .12) continue;   // bodies solid, branches sparse
        const g = Math.round(clamp(v + (rnd() - .5) * .35) * (RAMP.length - 1));
        const hx = (c + .5) * CW, hy = (rr + .5) * CH, ha = .05 + v * .5;
        parts.push({ hx, hy, ha, ch: RAMP[g], d: dist[i], dv: v,
            x: hx, y: hy, s: HOME_SIZE, a: ha, key: null, tg: null, tw: null });
    }
    return parts;
}

export function startNeurons() {
    const hero = document.querySelector('.hero');
    const expr = hero.querySelector('.expr');
    // The crop marks frame the cube, so their box is the cube's hover zone.
    const frame = document.querySelector('.crop b');
    const cv = document.createElement('canvas');
    cv.className = 'nn';
    cv.setAttribute('aria-hidden', 'true');
    hero.prepend(cv);
    html.classList.add('neurons');
    const ctx = cv.getContext('2d');

    const heroCS = getComputedStyle(hero);
    const FG = heroCS.getPropertyValue('--fg').trim() || '#ededed';
    const ACCENT = heroCS.getPropertyValue('--accent').trim() || '#36e08a';
    const exprCS = getComputedStyle(expr.querySelector('.expr-g'));
    const HOME_FONT = `normal 400 ${ATLAS}px ${exprCS.fontFamily}`;

    // One small canvas per glyph, font and colour; drawn scaled.
    const atlas = new Map();
    function glyph(font, ch, color) {
        const k = font + '\n' + ch + '\n' + color;
        let c = atlas.get(k);
        if (!c) {
            c = document.createElement('canvas');
            c.width = c.height = ATLAS * 2;
            const g = c.getContext('2d');
            g.font = font; g.fillStyle = color;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(ch, ATLAS, ATLAS);
            atlas.set(k, c);
        }
        return c;
    }

    let W = 0, H = 0, dpr = 1, parts = [];
    let mode = 'home', formedAt = Infinity, stale = false, veiled = false;
    const range = document.createRange();

    function build() {
        const r = hero.getBoundingClientRect();
        dpr = Math.min(2, devicePixelRatio || 1);
        W = r.width; H = r.height;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        // Pinned to the size it was drawn for: if the hero changes size, the
        // field waits for the rebuild instead of being stretched to fit.
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
        parts = grow(W, H);
        for (const p of parts) p.font = HOME_FONT;
        if (mode === 'expr') { assign(targets()); settle(); }
    }

    // Where each character of the expression sits, relative to the hero.
    function targets() {
        const base = hero.getBoundingClientRect();
        const out = [];
        for (const p of expr.querySelectorAll('p')) {
            if (p.classList.contains('expr-done') && !html.classList.contains('solved')) continue;
            const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
            for (let n; (n = walk.nextNode());) {
                const el = n.parentElement, cs = getComputedStyle(el);
                const mv = el.closest('.mv');
                const rgb = cs.color.match(/[\d.]+/g).map(Number);
                const a = Math.min(1, Math.max(...rgb.slice(0, 3)) / 237) * (rgb[3] ?? 1)
                    * (mv?.classList.contains('done') ? .38 : 1);   // not its opacity: it may still be typing in
                const font = `${cs.fontStyle} ${cs.fontWeight} ${ATLAS}px ${cs.fontFamily}`;
                let i = 0;
                for (const ch of n.data) {
                    if (ch.trim()) {
                        range.setStart(n, i); range.setEnd(n, i + ch.length);
                        const r = range.getBoundingClientRect();
                        if (r.width) out.push({ x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2,
                            ch, font, s: parseFloat(cs.fontSize), a });
                    }
                    i += ch.length;
                }
            }
        }
        return out;
    }

    // Each character takes the nearest free glyph that already matches it;
    // failing that, the nearest free glyph, which changes in flight. The
    // glyphs left over are the duplicates, and fade.
    function assign(T) {
        for (const p of parts) p.tg = null;
        const by = new Map();
        for (const p of parts) (by.get(p.ch) || by.set(p.ch, []).get(p.ch)).push(p);
        const nearest = (list, t) => {
            let best = null, bd = Infinity;
            for (const p of list) if (!p.tg) {
                const d = (p.hx - t.x) ** 2 + (p.hy - t.y) ** 2;
                if (d < bd) { bd = d; best = p; }
            }
            return best;
        };
        for (const t of T) {
            const p = nearest(by.get(t.ch) || [], t) || nearest(parts, t);
            if (p) p.tg = t;
        }
    }

    const now = () => performance.now();
    function tween(p, to, delay, dur) {
        p.tw = { fx: p.x, fy: p.y, fs: p.s, fa: p.a, ff: p.font, fc: p.dch || p.ch, t0: now() + delay, dur,
            arc: (Math.random() - .5) * 90, ...to };
    }
    // Snap to the formed expression, with no flight (resize, a new cube).
    function settle() {
        for (const p of parts) {
            p.tw = null;
            if (p.tg) Object.assign(p, { x: p.tg.x, y: p.tg.y, s: p.tg.s, a: p.tg.a, font: p.tg.font, dch: p.tg.ch });
            else Object.assign(p, { x: p.hx, y: p.hy, a: 0 });
        }
        formedAt = now() - 1e4;
    }

    function form() {
        mode = 'expr'; stale = false;
        assign(targets());
        let end = 0;
        for (const p of parts) {
            const delay = reduced ? 0 : Math.random() * 350;
            const dur = reduced ? 0 : p.tg ? 800 + Math.random() * 500 : 450;
            end = Math.max(end, delay + dur);
            if (p.tg) tween(p, { tx: p.tg.x, ty: p.tg.y, ts: p.tg.s, ta: p.tg.a, tf: p.tg.font, tc: p.tg.ch }, delay, dur);
            else tween(p, { tx: p.hx, ty: p.hy, ts: HOME_SIZE, ta: 0, tf: HOME_FONT, tc: p.ch }, delay, dur);
        }
        formedAt = now() + end;
        wake();
    }

    function dissolve() {
        mode = 'home';
        html.classList.remove('expr-on');
        veiled = false;
        if (stale) { assign(targets()); settle(); stale = false; }
        for (const p of parts) {
            if (p.tg) {
                p.a = p.tg.a;   // back from under the DOM expression
                tween(p, { tx: p.hx, ty: p.hy, ts: HOME_SIZE, ta: p.ha, tf: HOME_FONT, tc: p.ch },
                    reduced ? 0 : Math.random() * 300, reduced ? 0 : 900 + Math.random() * 500);
            } else {
                tween(p, { tx: p.hx, ty: p.hy, ts: HOME_SIZE, ta: p.ha, tf: HOME_FONT, tc: p.ch },
                    reduced ? 0 : 300 + Math.random() * 600, reduced ? 0 : 600);
            }
        }
        formedAt = Infinity;
        wake();
    }

    // ─── Drawing ───────────────────────────────────────────────────────
    let raf = 0, visible = true;
    function draw() {
        raf = 0;
        const t = now();
        let busy = !reduced && mode === 'home';   // pulses keep the field alive
        // Once formed, hand over to the DOM expression and fade the glyphs.
        let veil = 1;
        if (mode === 'expr' && t >= formedAt) {
            if (!veiled) { veiled = true; html.classList.add('expr-on'); }
            veil = reduced ? 0 : clamp(1 - (t - formedAt) / 350);
        }
        if (mode === 'expr' && veil > 0) busy = true;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        for (const p of parts) {
            let ch = p.ch, home = !p.tw;
            if (p.tw) {
                const w = p.tw, k = w.dur ? clamp((t - w.t0) / w.dur) : 1, e = ease(k);
                const bend = Math.sin(Math.PI * e) * w.arc;
                const dx = w.tx - w.fx, dy = w.ty - w.fy, len = Math.hypot(dx, dy) || 1;
                p.x = w.fx + dx * e - dy / len * bend;
                p.y = w.fy + dy * e + dx / len * bend;
                p.s = w.fs + (w.ts - w.fs) * e;
                p.a = w.fa + (w.ta - w.fa) * e;
                p.font = e < .5 ? w.ff : w.tf;
                p.dch = e < .5 ? w.fc : w.tc;
                if (k >= 1) { p.tw = null; home = mode === 'home'; } else busy = true;
            } else if (mode === 'home') p.dch = p.ch;
            ch = p.dch || p.ch;
            const a = p.tg && mode === 'expr' ? p.a * veil : p.a;
            if (a < .01) continue;
            const size = p.s * 2;
            ctx.globalAlpha = a;
            ctx.drawImage(glyph(p.font, ch, FG), p.x - p.s, p.y - p.s, size, size);
            // A signal travels out from each soma along the dendrites.
            if (home && mode === 'home' && !reduced) {
                const ph = ((t / 1000 * .16 - p.d / 760) % 1 + 1) % 1;
                if (ph < .05) {
                    ctx.globalAlpha = (1 - ph / .05) * (.35 + p.dv * .6);
                    ctx.drawImage(glyph(p.font, ch, ACCENT), p.x - p.s, p.y - p.s, size, size);
                }
            }
        }
        // Now and then a glyph flickers to a neighbour on the ramp.
        if (mode === 'home' && !reduced) for (let n = 0; n < 3; n++) {
            const p = parts[(Math.random() * parts.length) | 0];
            if (p && !p.tw) {
                const i = RAMP.indexOf(p.ch) + (Math.random() < .5 ? -1 : 1);
                p.ch = RAMP[Math.min(RAMP.length - 1, Math.max(0, i))];
            }
        }
        if (busy && visible) raf = requestAnimationFrame(draw);
    }
    const wake = () => { if (!raf && visible) raf = requestAnimationFrame(draw); };

    // ─── Pointing at the cube ──────────────────────────────────────────
    function overCube(x, y) {
        if (html.dataset.rig !== 'H') return false;
        const r = frame.getBoundingClientRect();
        return x > r.left && x < r.right && y > r.top && y < r.bottom;
    }
    // Once formed, the expression itself holds it, so it can be read.
    function overExpr(x, y) {
        const r = expr.getBoundingClientRect();
        return x > r.left - 24 && x < r.right + 24 && y > r.top - 24 && y < r.bottom + 24;
    }
    let px = -1, py = -1, leave = 0;
    function check() {
        if (px < 0) return;
        const want = overCube(px, py) || (mode === 'expr' && overExpr(px, py));
        if (want) { clearTimeout(leave); leave = 0; if (mode === 'home') form(); }
        else if (mode === 'expr' && !leave) leave = setTimeout(() => { leave = 0; dissolve(); }, 250);
    }
    if (fine) {
        // Only a real move after the opening counts: Chrome sends a still
        // pointer a synthetic move after load, which would pull the whole
        // field into the expression while the name is still landing.
        addEventListener('pointermove', e => {
            if (px < 0 && (html.classList.contains('opening') || !(e.movementX || e.movementY))) return;
            px = e.clientX; py = e.clientY; check();
        }, { passive: true });
        addEventListener('scroll', check, { passive: true });
        document.addEventListener('pointerleave', () => { px = -1; if (mode === 'expr') dissolve(); });
    } else {
        // Touch: a tap on the cube sets the expression; another lets it go.
        addEventListener('pointerup', e => {
            if (e.pointerType === 'mouse' || !overCube(e.clientX, e.clientY)) return;
            if (mode === 'home') form(); else dissolve();
        });
    }

    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }).observe(hero);
    let rt = 0;
    new ResizeObserver(() => {
        clearTimeout(rt);
        rt = setTimeout(() => {
            const r = hero.getBoundingClientRect();
            if (Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1) { build(); wake(); }
        }, 120);
    }).observe(hero);
    build();
    wake();

    // A new cube rewrites the expression; re-aim the glyphs when next used.
    return {
        refresh() {
            if (mode === 'expr') stale = true;
        },
    };
}
