// Before first paint: a tab that has already seen the opening (intro.js)
// hides the cover, so coming back to the home page shows it at once.
try { if (sessionStorage.getItem('intro') === '1') document.documentElement.classList.add('seen'); } catch (e) {}
