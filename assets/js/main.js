import { Cube, scramble, inverse, notation } from './cube.js';
import { startMonitor } from './monitor.js';
import { startMotion } from './motion.js';
import { startScrollbar } from './scrollbar.js';
import { startJourney } from './journey.js';
import { startNeurons } from './neurons.js';
import { startIntro, INTRO_MS } from './intro.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;

// Palette trial: ?palette=ultramarine drops the live-site colours.
if (new URLSearchParams(location.search).get('palette') === 'ultramarine') $('#palette-live').disabled = true;
// Process trial: ?process=cards shows the cards in place of the steps.
if (new URLSearchParams(location.search).get('process') === 'cards') html.classList.add('proc-cards');
// About trial: ?about=list shows the plain list in place of the chart.
if (new URLSearchParams(location.search).get('about') === 'list') html.classList.add('about-list');
startIntro();
startJourney();

const TURNS = 20;
const LOADER_MS = INTRO_MS + 100;   // the name has landed in the chip
const cube = new Cube($('.cube'));
const scene = $('.scene');
const seqScramble = $('[data-seq="scramble"]');
const seqSolve = $('[data-seq="solve"]');
const neurons = startNeurons();
// Face turns are set in script capitals, the way a group is written on paper.
const SCRIPT = { U: '𝒰', D: '𝒟', R: 'ℛ', L: 'ℒ', F: 'ℱ', B: 'ℬ' };
const script = m => SCRIPT[m.f] + (m.t === -1 ? '⁻¹' : m.t === 2 ? '²' : '');
const ro = k => $(`[data-ro="${k}"]`);
function token(m, i) {
    const s = document.createElement('span');
    s.className = 'mv'; s.dataset.i = i; s.append(SCRIPT[m.f]);
    if (m.t !== 1) { const sup = document.createElement('sup'); sup.textContent = m.t === 2 ? '2' : '−1'; s.append(sup); }
    s.setAttribute('aria-label', notation(m));
    return s;
}

// ─── Sizing and scroll → solve progress ────────────────────────────────
// The solve is spread over the full scroll length, so the page size sets
// the speed: one turn per (scrollable height / turns) pixels.
let maxScroll = 1;
function measure() {
    // Layout size, not the rendered one: the rig is scaled in some sections.
    cube.setSize(Math.round(Math.min(scene.offsetWidth, scene.offsetHeight) * 0.18));
    maxScroll = Math.max(1, html.scrollHeight - innerHeight);
    paintSectionTurns();
}
const target = () => Math.min(1, Math.max(0, scrollY / maxScroll));

// Each section tag lists the turns that play while it is read.
const turnSlots = $$('[data-turns]');
let turnTokens = [];
let turnsKey = '';
function paintSectionTurns() {
    const key = maxScroll + '|' + cubeSol.map(notation).join('');
    if (key === turnsKey || !cubeSol.length) return;
    turnsKey = key;
    const at = y => Math.min(TURNS, Math.max(0, Math.floor(y / maxScroll * TURNS)));
    for (const slot of turnSlots) {
        const sec = slot.closest('section');
        const a = at(sec.offsetTop - innerHeight / 2);
        const b = at(sec.offsetTop + sec.offsetHeight - innerHeight / 2);
        const moves = cubeSol.slice(a, Math.max(a, b));
        slot.replaceChildren(...moves.map((m, i) => token(m, a + i)));
        slot.setAttribute('aria-label', moves.length ? `Turns ${a + 1} to ${a + moves.length}` : '');
    }
    turnTokens = turnSlots.flatMap(s => [...s.children]);
    lastK = -1;
}

// ─── The expression ────────────────────────────────────────────────────
let solveTokens = [];
let typing = 0;
function paintExpression(scr, sol, animate, delay = 250) {
    clearTimeout(typing);
    seqScramble.replaceChildren(...scr.map(token));
    seqSolve.replaceChildren(...sol.map(token));
    solveTokens = [...seqSolve.children];
    const all = [...seqScramble.children, ...solveTokens];
    if (!animate) { all.forEach(s => s.classList.add('in')); html.classList.add('lit'); return; }
    html.classList.remove('lit');
    let i = 0;
    const step = () => {
        all[i++].classList.add('in');
        if (i < all.length) typing = setTimeout(step, i === scr.length ? 260 : 38);
        else typing = setTimeout(() => html.classList.add('lit'), 180);
    };
    typing = setTimeout(step, delay);
}

let cubeSol = [];
let lastK = -1;
function paintProgress({ k, n, solved }) {
    if (k === lastK) return;
    lastK = k;
    solveTokens.forEach((s, i) => { s.classList.toggle('done', i < k); s.classList.toggle('now', i === k); });
    turnTokens.forEach(s => { s.classList.toggle('done', s.dataset.i < k); s.classList.toggle('now', +s.dataset.i === k); });
    ro('k').textContent = String(solved ? n : k + 1).padStart(2, '0');
    ro('m').textContent = solved ? 'e' : script(cubeSol[k]);
    html.classList.toggle('solved', solved);
}

function newCube(animate, delay) {
    const scr = scramble(TURNS);
    cubeSol = inverse(scr);
    cube.set(scr, cubeSol);
    ro('n').textContent = TURNS;
    lastK = -1;
    paintExpression(scr, cubeSol, animate, delay);
    paintSectionTurns();
    neurons.refresh();
}

// ─── The rig follows the section in the middle of the screen ───────────
// Each block names where the cube sits (H: under the hero expression,
// L / R half, or S: small, top right)
// and its tone flips the crop-mark ink.
const rigIO = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) {
        html.dataset.rig = e.target.dataset.rig;
        html.dataset.tone = e.target.classList.contains('tone-paper') ? 'paper' : 'signal';
    }
}, { rootMargin: '-50% 0px -50% 0px' });
$$('[data-rig]:not(html)').forEach(s => rigIO.observe(s));

// ─── View: default three-quarter view; each side row turns its face in ─
const VIEWS = {
    home: [24, -36],
    F: [16, -12], R: [16, -78], U: [68, -30],
    L: [16, 78], B: [16, 168], D: [-62, -30],
};
let view = VIEWS.home.slice(), viewTarget = VIEWS.home;
let faceInView = null, faceHover = null;
const sides = $$('.side');
function setFace() {
    const f = faceHover || faceInView;
    viewTarget = VIEWS[f] || VIEWS.home;
    cube.highlight(f);
    sides.forEach(s => s.classList.toggle('hot', s.dataset.face === f));
}
const sideIO = new IntersectionObserver(entries => {
    for (const e of entries) {
        if (e.isIntersecting) faceInView = e.target.dataset.face;
        else if (faceInView === e.target.dataset.face) faceInView = null;
    }
    setFace();
}, { rootMargin: '-45% 0px -45% 0px' });
for (const row of sides) {
    sideIO.observe(row);
    const on = () => { faceHover = row.dataset.face; setFace(); };
    const off = () => { if (faceHover === row.dataset.face) { faceHover = null; setFace(); } };
    row.addEventListener('pointerenter', on);
    row.addEventListener('pointerleave', off);
    row.addEventListener('focusin', on);
    row.addEventListener('focusout', off);
    row.addEventListener('toggle', () => { if (row.open) on(); });
}

// Pointer parallax, desktop only.
let px = 0, py = 0;
if (fine && !reduced) addEventListener('pointermove', e => {
    px = e.clientX / innerWidth - 0.5; py = e.clientY / innerHeight - 0.5;
}, { passive: true });

// ─── Frame loop ────────────────────────────────────────────────────────
let prog = target();
function frame(t) {
    const goal = target();
    prog += (goal - prog) * (reduced ? 1 : 0.16);
    if (Math.abs(goal - prog) < 1e-4) prog = goal;
    const k = reduced ? 1 : 0.07;
    view[0] += (viewTarget[0] - view[0]) * k;
    view[1] += (viewTarget[1] - view[1]) * k;
    const drift = reduced ? 0 : Math.sin(t / 2600) * 3;
    paintProgress(cube.render(prog, view[0] - py * 8, view[1] + drift + px * 12));
    requestAnimationFrame(frame);
}

// ─── Reset: a new random position and its expression ───────────────────
for (const b of $$('[data-reset]')) b.addEventListener('click', () => {
    html.classList.add('swap');
    const typeIt = !reduced && scrollY < innerHeight / 2;
    setTimeout(() => { newCube(typeIt); html.classList.remove('swap'); }, reduced ? 0 : 320);
});

// ─── Menu ──────────────────────────────────────────────────────────────
const menu = $('#menu');
const menuBtn = $('[data-menu]');
function setMenu(open) {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.textContent = open ? 'Close' : 'Menu';
    html.classList.toggle('menu-open', open);
}
menuBtn.addEventListener('click', () => setMenu(menu.hidden));
menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

// Phones: once the expression scrolls above the top 35% of the screen, the rig
// docks under the menu. Read from the live position on load and on every
// scroll, so a jump or a restored scroll position past the hero still docks.
const heroFoot = $('.hero-foot');
let dockQueued = false;
function updateDock() {
    dockQueued = false;
    html.classList.toggle('docked', heroFoot.getBoundingClientRect().bottom < innerHeight * .35);
}
addEventListener('scroll', () => { if (!dockQueued) { dockQueued = true; requestAnimationFrame(updateDock); } }, { passive: true });
addEventListener('resize', updateDock);
updateDock();

// The live monitor only starts polling when the projects come near.
const monIO = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { monIO.disconnect(); startMonitor(); }
}, { root: document, rootMargin: '800px 0px' });
monIO.observe($('#projects'));

$('[data-year]').textContent = new Date().getFullYear();
// Type the expression out only when the visitor is actually looking at it,
// after the loader has cleared.
startMotion({ holdMs: LOADER_MS });
startScrollbar();
newCube(!reduced && !document.hidden && scrollY < innerHeight / 2, LOADER_MS);
measure();
addEventListener('resize', measure);
new ResizeObserver(measure).observe(document.body);
requestAnimationFrame(frame);
