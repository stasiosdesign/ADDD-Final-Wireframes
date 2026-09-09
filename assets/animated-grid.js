function initAnimatedGrid() {
  const grid = document.querySelector('[data-animated-grid]');
  const cols = grid?.querySelectorAll('[data-animated-grid-col]');
  if (!cols?.length || grid.dataset.gridReady) return;
  grid.dataset.gridReady = 'true';

  // The grid is always hidden on a fresh page load. It is only revealed with
  // Shift + G and deliberately does not retain that state in local storage.
  let isOpen = false;
  let animation;
  // Clip each column within its own bounds: translating by its width merely
  // moves it into the neighbouring column and leaves it visible.
  const hiddenLeft = 'inset(0% 100% 0% 0%)';
  const visible = 'inset(0% 0% 0% 0%)';
  const hiddenRight = 'inset(0% 0% 0% 100%)';
  gsap.set(cols, { clipPath: hiddenLeft });
  gsap.set(grid, { display: 'none' });

  function syncState() {
    grid.dataset.gridOpen = String(isOpen);
  }
  function toggleGrid() {
    isOpen = !isOpen;
    // Only reset a fully closed grid. Mid-animation toggles continue smoothly
    // from the current positions instead of jumping to a fromTo start value.
    const inFlight = animation?.isActive();
    animation?.kill();
    if (isOpen && !inFlight) gsap.set(cols, { clipPath: hiddenLeft });
    if (isOpen) gsap.set(grid, { display: 'block' });
    if (rmMQ.matches) {
      gsap.set(cols, { clipPath: isOpen ? visible : hiddenRight });
      gsap.set(grid, { display: isOpen ? 'block' : 'none' });
    } else {
      animation = gsap.to(cols, {
        clipPath: isOpen ? visible : hiddenRight,
        duration: 1,
        ease: 'expo.inOut',
        stagger: { each: 0.03, from: 'start' },
        overwrite: true,
        onComplete() {
          if (!isOpen) gsap.set(grid, { display: 'none' });
        }
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
    gsap.set(cols, { clipPath: isOpen ? visible : hiddenRight });
    gsap.set(grid, { display: isOpen ? 'block' : 'none' });
  });
  syncState();
}
