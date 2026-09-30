// An overlay scrollbar: the native one is hidden and a thin handle floats
// over the right edge, so the sections run to the edge of the window. It
// shows while scrolling or hovered, takes its colour from the section tone,
// and can be dragged or clicked like the real one. Mouse users only; touch
// screens and reduced-motion visitors keep the native bar.

const HIDE_MS = 900, MIN_THUMB = 40, PAD = 6;

export function startScrollbar() {
    if (!matchMedia('(pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const html = document.documentElement;
    const bar = document.createElement('div');
    const thumb = document.createElement('div');
    bar.className = 'sbar'; thumb.className = 'sbar-thumb';
    bar.setAttribute('aria-hidden', 'true');
    bar.append(thumb);
    document.body.append(bar);
    html.classList.add('has-sbar');

    let thumbH = 0, travel = 0, maxScroll = 1, queued = false, hideT = 0;
    const measure = () => {
        const view = innerHeight, full = html.scrollHeight;
        maxScroll = Math.max(1, full - view);
        bar.hidden = full <= view;
        thumbH = Math.max(MIN_THUMB, (view - PAD * 2) * view / full);
        travel = view - PAD * 2 - thumbH;
        thumb.style.height = thumbH + 'px';
        place();
    };
    const place = () => {
        queued = false;
        thumb.style.transform = `translateY(${PAD + travel * Math.min(1, scrollY / maxScroll)}px)`;
    };
    const show = () => {
        bar.classList.add('on');
        clearTimeout(hideT);
        hideT = setTimeout(() => bar.classList.remove('on'), HIDE_MS);
    };
    addEventListener('scroll', () => {
        show();
        if (!queued) { queued = true; requestAnimationFrame(place); }
    }, { passive: true });
    addEventListener('resize', measure);
    new ResizeObserver(measure).observe(document.body);

    // Drag the handle; the page follows it one to one.
    let grab = null;
    thumb.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        grab = { y: e.clientY, top: scrollY };
        thumb.setPointerCapture(e.pointerId);
        html.classList.add('sbar-drag');
    });
    thumb.addEventListener('pointermove', e => {
        if (!grab) return;
        const top = grab.top + (e.clientY - grab.y) / Math.max(1, travel) * maxScroll;
        scrollTo({ top, behavior: 'instant' });
    });
    const release = () => { grab = null; html.classList.remove('sbar-drag'); show(); };
    thumb.addEventListener('pointerup', release);
    thumb.addEventListener('lostpointercapture', release);

    // Click the track to jump there, centring the handle on the pointer.
    bar.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target !== bar) return;
        const at = (e.clientY - PAD - thumbH / 2) / Math.max(1, travel);
        scrollTo({ top: Math.min(1, Math.max(0, at)) * maxScroll });
    });

    measure();
}
