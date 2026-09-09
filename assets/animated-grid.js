// The overlay persists outside Barba's page container. Delegate button clicks
// so replacement footers work without accumulating listeners on navigation.
function syncAnimatedGridToggles(root = document) {
  const isOpen = document.querySelector('[data-animated-grid]')?.dataset.gridOpen === 'true';
  root.querySelectorAll('[data-animated-grid-toggle]').forEach(button => {
    button.hidden = false;
    button.setAttribute('aria-pressed', String(isOpen));
    button.textContent = isOpen ? 'Hide grid' : 'Show grid';
  });
}

function initAnimatedGrid() {
  const grid = document.querySelector('[data-animated-grid]');
  const cols = grid?.querySelectorAll('[data-animated-grid-col]');
  if (!cols?.length || grid.dataset.gridReady) return;
  grid.dataset.gridReady = 'true';

  const storageKey = 'animatedGridState';
  let isOpen = false;
  let animation;
  try { isOpen = localStorage.getItem(storageKey) === 'open'; } catch (_) { /* Storage is optional. */ }
  // Columns enter horizontally from the left, then leave through the right.
  gsap.set(cols, { xPercent: isOpen ? 0 : -100 });
  gsap.set(grid, { display: 'block' });

  function syncState() {
    grid.dataset.gridOpen = String(isOpen);
    syncAnimatedGridToggles();
  }
  function toggleGrid() {
    isOpen = !isOpen;
    try { localStorage.setItem(storageKey, isOpen ? 'open' : 'closed'); } catch (_) { /* Keep toggling in memory. */ }
    // Only reset a fully closed grid. Mid-animation toggles continue smoothly
    // from the current positions instead of jumping to a fromTo start value.
    const inFlight = animation?.isActive();
    animation?.kill();
    if (isOpen && !inFlight) gsap.set(cols, { xPercent: -100 });
    if (rmMQ.matches) {
      gsap.set(cols, { xPercent: isOpen ? 0 : 100 });
    } else {
      animation = gsap.to(cols, {
        xPercent: isOpen ? 0 : 100,
        duration: 1,
        ease: 'expo.inOut',
        stagger: { each: 0.03, from: 'start' },
        overwrite: true
      });
    }
    syncState();
  }

  document.addEventListener('click', event => {
    if (!event.target.closest('[data-animated-grid-toggle]')) return;
    event.preventDefault();
    toggleGrid();
  });
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const el = event.target;
    if (el?.closest('input, textarea, select') || el?.isContentEditable) return;
    if (!event.shiftKey || event.key.toLowerCase() !== 'g') return;
    event.preventDefault();
    toggleGrid();
  });
  rmMQ.addEventListener('change', event => {
    if (!event.matches) return;
    animation?.kill();
    gsap.set(cols, { xPercent: isOpen ? 0 : 100 });
  });
  syncState();
}
