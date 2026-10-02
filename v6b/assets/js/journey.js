// Trial (2026-09-30): v2's work / education chart. Each row's bar is placed
// on a year axis from its data-from / data-to; selecting a row (or hovering
// it, with a mouse) shows its detail below the chart.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function startJourney() {
    const root = $('.journey'); if (!root) return;
    const rows = $$('.j-row', root);
    const Y0 = 2012, Y1 = new Date().getFullYear() + 1;   // the axis runs to the end of this year
    const span = Y1 - Y0;
    const pct = y => (y - Y0) / span * 100;
    root.style.setProperty('--years', span);
    for (const r of rows) {
        const from = +r.dataset.from, to = r.dataset.to === 'now' ? Y1 - 0.25 : +r.dataset.to + 1;
        r.style.setProperty('--x0', pct(from) + '%');
        r.style.setProperty('--w', pct(to) - pct(from) + '%');
    }
    // Every other year is labelled, as '12 '14 …
    $('.j-axis', root).replaceChildren(...Array.from({ length: span }, (_, i) => {
        const s = document.createElement('span');
        if (i % 2 === 0) s.textContent = "'" + String(Y0 + i).slice(2);
        return s;
    }));

    const detail = $('.j-detail', root);
    const show = r => {
        rows.forEach(x => { x.classList.toggle('sel', x === r); x.setAttribute('aria-pressed', String(x === r)); });
        const meta = document.createElement('p'), h = document.createElement('h3'), ul = document.createElement('ul');
        meta.className = 'mono';
        meta.textContent = `${$('.j-yr', r).textContent} · ${$('.j-txt em', r).textContent}`;
        h.textContent = $('.j-txt b', r).textContent;
        ul.append(...r.dataset.detail.split('|').map(d => { const li = document.createElement('li'); li.textContent = d; return li; }));
        detail.replaceChildren(meta, h, ul);
    };
    const hover = matchMedia('(hover: hover)');
    for (const r of rows) {
        r.addEventListener('click', () => show(r));
        r.addEventListener('pointerenter', () => { if (hover.matches) show(r); });
    }
    show(rows[0]);
    root.classList.add('live');

    // The bars draw across once the chart is in view.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { root.classList.add('in'); return; }
    const io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { root.classList.add('in'); io.disconnect(); }
    }, { root: document, threshold: 0.3 });
    io.observe(root);
}
