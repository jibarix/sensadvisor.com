// Opening, as on the live site: the name sits large in the middle, then
// flies into the chip. Two independent layers, both GPU-only:
//   the cover: the hero's own colour, it only fades out;
//   the name:  already the chip's text colour, it only moves and scales.
const HOLD = 500;     // the name holds in the middle
const FLIGHT = 800;   // into the chip, while the cover fades
export const INTRO_MS = HOLD + FLIGHT;
const EASE = 'cubic-bezier(.2, .7, .1, 1)';   // --ease

export function startIntro() {
    const html = document.documentElement;
    const cover = document.querySelector('.loader');
    const word = document.querySelector('.loader-word');
    const dest = document.querySelector('.chip span');
    const done = () => { cover?.remove(); word?.remove(); html.classList.remove('opening'); };
    if (!cover || !word || !dest || matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
    html.classList.add('opening');
    cover.style.backgroundColor = getComputedStyle(document.querySelector('.hero')).backgroundColor;

    const run = () => {
        // Land exactly on the chip's text: same box, same type, same colour.
        const r = dest.getBoundingClientRect();
        const cs = getComputedStyle(dest);
        for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color']) word.style[k] = cs[k];
        word.style.left = r.left + 'px';
        word.style.top = r.top + 'px';
        const s = Math.min(10, Math.max(260, innerWidth - 80) / Math.max(r.width, 1) * 0.9);
        const mid = k => `translate(${innerWidth / 2 - (r.left + r.width / 2)}px, ${innerHeight / 2 - (r.top + r.height / 2)}px) scale(${s * k})`;

        word.animate([{ opacity: 0, transform: mid(0.94) }, { opacity: 1, transform: mid(1) }],
            { duration: 450, easing: EASE, fill: 'forwards' });
        const fly = word.animate([{ transform: mid(1) }, { transform: 'none' }],
            { duration: FLIGHT, delay: HOLD, easing: EASE, fill: 'forwards' });
        cover.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: FLIGHT, delay: HOLD, easing: EASE, fill: 'forwards' });
        fly.finished.then(done, done);
    };
    // The script has taken over, so the CSS fallback that lifts the cover can stop.
    cover.getAnimations().forEach(a => a.cancel());
    // Play only when someone can see it: a tab opened in the background can
    // hold a stale layout until it is shown. Measure with the real font, but
    // never wait long for it, and after a settled frame.
    const visible = new Promise((r, no) => {
        if (!document.hidden) return r();
        setTimeout(no, 4000);   // never keep the cover up for a tab nobody opens
        document.addEventListener('visibilitychange', function on() {
            if (document.hidden) return;
            document.removeEventListener('visibilitychange', on);
            r();
        });
    });
    const font = Promise.race([document.fonts.load('12px "Source Code Pro"'), new Promise(r => setTimeout(r, 400))]).catch(() => {});
    Promise.all([visible, font])
        .then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
        .then(run)
        .catch(done);
}
