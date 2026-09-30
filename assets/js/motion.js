// Entrance motion for the page copy: headlines rise word by word out of a
// clipped line, groups of cards follow each other in, and section rules
// draw across. Nothing here runs for reduced-motion visitors, and nothing is
// hidden until this module has marked the page with `motion`.

const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const WORDS = '.ident-name, .ident-role, .split > span, h2.big, .proc-h, .big-mail';
const GROUPS = [
    ['.rows', ':scope > details'],
    ['.svcs', ':scope > .svc'],
    ['.cards', ':scope > li'],
    // The list itself has no box (display: contents), so watch the diagram.
    ['.fc', ':scope > .flow-chart > li'],
    ['.monitor', ':scope > .mon-tile'],
    ['.more', ':scope > a'],
    ['.bio', ':scope > p'],
    ['.cv', ':scope > li'],
    ['.j-chart', ':scope > .j-row'],
    ['.foot-cols', 'li'],
    ['.expr', ':scope > p:not(.expr-done)'],
];
const WORD_STEP = 45, ITEM_STEP = 80;

// Wrap every word of an element's text in a clip and an inner span, in
// place, so nested markup (the dimmed half of a headline) survives.
function splitWords(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
    for (const node of nodes) {
        const frag = document.createDocumentFragment();
        for (const part of node.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { frag.append(part); continue; }
            const w = document.createElement('span'), wi = document.createElement('span');
            w.className = 'w'; wi.className = 'wi'; wi.textContent = part;
            w.append(wi); frag.append(w);
        }
        node.replaceWith(frag);
    }
    $$('.wi', el).forEach((wi, i) => { wi.style.transitionDelay = i * WORD_STEP + 'ms'; });
}

// Once an item has arrived it drops the entrance class, so its own hover
// transitions come back untouched.
function settle(el) {
    el.addEventListener('transitionend', function done(e) {
        if (e.target !== el || e.propertyName !== 'opacity' || !el.classList.contains('in')) return;
        el.removeEventListener('transitionend', done);
        el.classList.remove('rise', 'in');
        el.style.transitionDelay = '';
    });
}

export function startMotion({ holdMs = 0 } = {}) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('motion');

    const t0 = performance.now();
    // Anything already on screen waits for the loader to lift.
    const hold = () => Math.max(0, holdMs - (performance.now() - t0));

    const io = new IntersectionObserver(entries => {
        for (const e of entries) if (e.isIntersecting) {
            io.unobserve(e.target);
            const wait = hold();
            const kids = e.target._kids;
            if (kids) kids.forEach((k, i) => { k.style.transitionDelay = wait + i * ITEM_STEP + 'ms'; k.classList.add('in'); });
            else {
                if (wait) $$('.wi', e.target).forEach(wi => { wi.style.transitionDelay = wait + parseFloat(wi.style.transitionDelay || 0) + 'ms'; });
                e.target.classList.add('in');
            }
        }
    }, { root: document, rootMargin: '0px 0px -10% 0px' });

    for (const el of $$(WORDS)) { splitWords(el); el.classList.add('words'); io.observe(el); }
    for (const [box, child] of GROUPS) for (const el of $$(box)) {
        el._kids = $$(child, el);
        el._kids.forEach(k => { k.classList.add('rise'); settle(k); });
        io.observe(el);
    }
    for (const el of $$('.tag')) { el.classList.add('draw'); io.observe(el); }
}
