// Chrome for the analytics dashboards, in the home page's (v6a) style: the
// boxed SENS ADVISOR chip, the Menu box that opens a full-screen menu, and a
// theme box beside it. Shared by all five dashboards; each page carries the
// markup, this file carries the behaviour.

(function () {
    var root = document.documentElement;
    var btn = document.querySelector('.sa-menu-btn');
    var menu = document.getElementById('sa-menu');

    if (btn && menu) {
        var setOpen = function (open) {
            menu.hidden = !open;
            root.classList.toggle('sa-menu-open', open);
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.textContent = open ? 'Close' : 'Menu';
            if (open) {
                var first = menu.querySelector('a');
                if (first) first.focus({ preventScroll: true });
            }
        };
        btn.addEventListener('click', function () {
            var open = menu.hidden;
            setOpen(open);
            if (!open) btn.focus({ preventScroll: true });
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !menu.hidden) {
                setOpen(false);
                btn.focus({ preventScroll: true });
            }
        });
        // Any destination closes the menu (in-page links scroll behind it).
        menu.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () { setOpen(false); });
        });
    }

    var theme = document.querySelector('.sa-theme');
    if (theme) {
        var sync = function () {
            theme.setAttribute('aria-pressed', root.getAttribute('data-theme') === 'dark' ? 'true' : 'false');
        };
        sync();
        theme.addEventListener('click', function () {
            var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem('theme', next); } catch (e) {}
            sync();
            if (typeof window.refreshAnalyticsTheme === 'function') window.refreshAnalyticsTheme();
        });
    }
})();
