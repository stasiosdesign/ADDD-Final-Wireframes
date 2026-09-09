function initAnimatedGrid() {
  const grid = document.querySelector('[data-animated-grid]');
  const cols = grid?.querySelectorAll('[data-animated-grid-col]');
  if (!cols?.length || grid.dataset.gridReady) return;
  grid.dataset.gridReady = 'true';

  // The grid is always hidden on a fresh page load. It is only revealed with
  // Shift + G and deliberately does not retain that state in local storage.
  let isOpen = false;
  let animation;
  // Columns enter horizontally from the left, then leave through the right.
  gsap.set(cols, { xPercent: -100 });
  gsap.set(grid, { display: 'block' });

  function syncState() {
    grid.dataset.gridOpen = String(isOpen);
  }
  function toggleGrid() {
    isOpen = !isOpen;
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
