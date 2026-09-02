// -----------------------------------------
// OSMO PAGE TRANSITION BOILERPLATE
// -----------------------------------------

gsap.registerPlugin(CustomEase, ScrollTrigger);
if (typeof window.SplitText !== "undefined") gsap.registerPlugin(SplitText);

history.scrollRestoration = "manual";

let lenis = null;
let nextPage = document;
let onceFunctionsInitialized = false;

// -----------------------------------------
// LOADER / TRANSITION LIFECYCLE BOUNDARY
// -----------------------------------------
//
// Two animation systems, one rule: a document load gets the logo loader, a
// Barba navigation gets the page wipe. Nothing below is allowed to blur that.
//
// The loader only ever runs from Barba's once(), which fires on a document
// load and never on an internal navigation. Once it has played it is taken
// out of the DOM for good — killing the loader is not enough on its own,
// because the markup lives outside the Barba container and would survive a
// clearProps, a style reset or a stray tween and reappear at z-index 300.
let loaderRetired = false;

// Barba's last resort for a failed internal navigation is window.location
// .assign(): Core.page() catches any rejection out of its lifecycle and calls
// force(). That is a real document load, so the next document runs once() and
// replays the loader on what the user experienced as a link click. The causes
// are fixed further down; this flag is what tells once() that a given arrival
// was Barba giving up rather than a genuine visit.
const FORCED_NAV_KEY = "addd:forced-nav";

// Take the loader out of the document permanently. Tweens are killed first so
// nothing still queued can write style back onto a detached node.
function retireLoader(wrap) {
  if (loaderRetired) return;
  loaderRetired = true;

  const el = wrap || document.querySelector("[data-load-wrap]");
  if (!el) return;

  gsap.killTweensOf(el);
  el.querySelectorAll("*").forEach(node => gsap.killTweensOf(node));
  el.remove();
}

// One-shot read: the flag is cleared the moment it is seen, so it can only
// ever suppress the loader for the single navigation Barba forced.
function consumedForcedNav() {
  let forced = false;

  try {
    forced = sessionStorage.getItem(FORCED_NAV_KEY) === "1";
    sessionStorage.removeItem(FORCED_NAV_KEY);
  } catch (err) {
    return false;
  }

  // A deliberate refresh always earns the loader, even directly after a
  // forced navigation.
  const entry = performance.getEntriesByType?.("navigation")?.[0];
  return forced && entry?.type !== "reload";
}

// Barba treats any rejection inside its lifecycle as a dead transition and
// falls back to a full page load. No page-level init is worth that, so every
// hook body is contained here: a failure is logged and the navigation carries
// on rather than turning into a reload.
function safeHook(name, fn) {
  return function (data) {
    try {
      return fn(data);
    } catch (err) {
      console.error(`barba hook "${name}" failed`, err);
    }
  };
}

const hasLenis = typeof window.Lenis !== "undefined";
const hasScrollTrigger = typeof window.ScrollTrigger !== "undefined";
const hasSplitText = typeof window.SplitText !== "undefined";

const rmMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = rmMQ.matches;
rmMQ.addEventListener?.("change", e => (reducedMotion = e.matches));
rmMQ.addListener?.(e => (reducedMotion = e.matches));

const has = (s) => !!nextPage.querySelector(s);

let staggerDefault = 0.05;
let durationDefault = 0.6;

CustomEase.create("osmo", "0.625, 0.05, 0, 1");
CustomEase.create("loader", "0.65, 0.01, 0.05, 0.99");
gsap.defaults({ ease: "osmo", duration: durationDefault });



// -----------------------------------------
// FUNCTION REGISTRY
// -----------------------------------------

function initOnceFunctions() {
  initLenis();
  if (onceFunctionsInitialized) return;
  onceFunctionsInitialized = true;

  // The nav and the Contact button live outside the Barba container, so
  // they survive every navigation and are only ever wired up once.
  initMegaNavDirectionalHover();

  // Width measurement waits on the webfont so the label is not measured
  // against the fallback face.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(initButton059);
  } else {
    initButton059();
  }
}

// Page-scoped teardown. Anything a page-level init leaves behind that would
// outlive the DOM it was built from — GSAP tweens, ScrollTriggers, listeners
// on window/document, timers, observers — registers an undo here, and it is
// run against the outgoing page in beforeLeave, before the next page inits.
let pageCleanups = [];

function registerPageCleanup(fn) {
  pageCleanups.push(fn);
}

function runPageCleanups() {
  const cleanups = pageCleanups;
  pageCleanups = [];
  cleanups.forEach(fn => {
    try {
      fn();
    } catch (err) {
      console.error("page cleanup failed", err);
    }
  });
}

function initBeforeEnterFunctions(next) {
  nextPage = next || document;

  // Barba's once() inits the first container, and beforeEnter inits every
  // one after it. Marking the container keeps a stray second call from
  // binding the same DOM twice.
  if (nextPage.dataset) {
    if (nextPage.dataset.pageInit === "true") return;
    nextPage.dataset.pageInit = "true";
  }

  // Page-level behaviour — rebound on every navigation because the
  // container these live in is replaced.
  if (has('[data-carousel]')) initCarousel();
  if (has('[data-approach-slides-init]')) initApproachSlides();
  if (has('[data-problem-grid-init]')) initProblemGrid();
  if (has('[data-testimonial-wrap]')) initLineRevealTestimonials();
  if (has('[data-shutter-scroll-transition]')) initShutterScrollTransition();
  if (has('[data-accordion-css-init]')) initAccordionCSS();
  if (has('[data-dots-canvas-init]')) initInteractiveDotsGrid();
  if (has("[data-footer-parallax]")) initFooterParallax();
  if (has('[data-marquee-scroll-direction-target]')) {
    initMarqueeScrollDirection(nextPage);
    registerPageCleanup(destroyMarqueeScrollDirection);
  }
}

// Page functions that need the container live and on screen. Lenis and
// ScrollTrigger are deliberately not re-measured here — that happens once, in
// beforeEnter, while the panel still covers the viewport, so a re-measure can
// never shift the layout the user is already looking at.
function initAfterEnterFunctions(next) {
  nextPage = next || document;
}



// -----------------------------------------
// PAGE TRANSITIONS
// -----------------------------------------

function runPageOnceAnimation(next) {
  const tl = gsap.timeline();

  tl.call(() => {
    resetPage(next);
  }, null, 0);

  const loader = buildLogoRevealLoader(next);
  if (loader) tl.add(loader, 0);

  return tl;
}

// First-load logo reveal, run from Barba's once() so it never fires on an
// internal navigation. The full-opacity logo is wiped in over a low-opacity
// copy of itself with a clip-path while the bottom bar fills; the content
// then fades, the background slides up out of view and the page rises into
// place behind it with the same motion runPageEnterAnimation uses, so the
// hand-off reads as the start of the site's normal transition.
function buildLogoRevealLoader(next) {
  const wrap = document.querySelector("[data-load-wrap]");
  if (!wrap) return null;

  // once() runs on every document load, including one Barba forced on itself
  // after a failed internal navigation. That arrival gets the page rise on its
  // own, with no loader, so it reads as the tail of the internal transition
  // the user actually asked for.
  if (loaderRetired || consumedForcedNav()) {
    retireLoader(wrap);

    const skipped = gsap.timeline();
    if (next && !reducedMotion) {
      skipped.from(next, { y: "15vh", duration: 1, ease: "osmo" });
    }
    return skipped;
  }

  const container = wrap.querySelector("[data-load-container]");
  const bg = wrap.querySelector("[data-load-bg]");
  const progressBar = wrap.querySelector("[data-load-progress]");
  const logo = wrap.querySelector("[data-load-logo]");

  if (reducedMotion) {
    return gsap.timeline().call(() => retireLoader(wrap));
  }

  const tl = gsap
    .timeline({
      defaults: { ease: "loader", duration: 0.9 },
      onComplete: () => retireLoader(wrap)
    })
    .to(progressBar, { scaleX: 1 })
    .to(logo, { clipPath: "inset(0% 0% 0% 0%)" }, "<")
    .to(container, { autoAlpha: 0, duration: 0.2 })
    .to(progressBar, { scaleX: 0, transformOrigin: "right center", duration: 0.2 }, "<")
    .add("hideContent", "<")
    .to(bg, { yPercent: -101, duration: 0.4 }, "hideContent")
    .set(wrap, { display: "none" });

  // The same rise the destination page makes on an internal navigation.
  if (next) {
    tl.from(next, { y: "15vh", duration: 1, ease: "osmo" }, "hideContent");
  }

  return tl;
}

// The leave animation runs before the destination page has been fetched, so
// there is no container to read data-page-name off yet. Derive the label from
// the URL instead: title-casing the slug covers most of the site, and these
// are the pages whose name is not simply their slug (mirrors build.sh).
const PAGE_NAMES = {
  "index": "Home",
  "workshops-audits": "Workshops & Audits",
  "software-licensing-audit": "Software & Licensing Audit",
  "report-template": "BIM 2.0 Report",
  "newsletter-template": "AI in Architecture",
};

function pageNameFromUrl(href) {
  let slug = "index";

  try {
    const path = new URL(href, location.href).pathname;
    slug = path.split("/").pop().replace(/\.html$/, "") || "index";
  } catch (err) {
    return "Hi there";
  }

  return PAGE_NAMES[slug] || slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function runPageLeaveAnimation(current, nextHref) {
  const transitionWrap = document.querySelector("[data-transition-wrap]");
  const transitionPanel = transitionWrap.querySelector("[data-transition-panel]");
  const transitionLabel = transitionWrap.querySelector("[data-transition-label]");
  const transitionLabelText = transitionWrap.querySelector("[data-transition-label-text]");

  transitionLabelText.innerText = pageNameFromUrl(nextHref);

  // A navigation that starts while the panel is still settling from the last
  // one would otherwise fight the tweens already on it.
  gsap.killTweensOf([transitionPanel, transitionLabel]);

  const tl = gsap.timeline({
    onComplete: () => { current.remove() }
  });

  if (reducedMotion) {
    // Immediate swap behavior if user prefers reduced motion
    return tl.set(current, { autoAlpha: 0 });
  }

  tl.set(transitionPanel, {
    autoAlpha: 1
  }, 0);

  tl.fromTo(transitionPanel, {
    yPercent: 0
  }, {
    yPercent: -100,
    duration: 0.8,
  }, 0);

  tl.fromTo(transitionLabel, {
    autoAlpha: 0
  }, {
    autoAlpha: 1
  }, "<+=0.2");

  tl.fromTo(current, {
    y: "0vh"
  }, {
    y: "-15vh",
    duration: 0.8,
  }, 0);

  // Barba awaits whatever leave() hands back, and a GSAP timeline is
  // thenable. Returning it is what holds the rest of the lifecycle — the
  // swap, the enter animation — until the panel has actually covered the
  // viewport. Without it Barba reads undefined and races straight on.
  return tl;
}

function runPageEnterAnimation(next) {
  const transitionWrap = document.querySelector("[data-transition-wrap]");
  const transitionPanel = transitionWrap.querySelector("[data-transition-panel]");
  const transitionLabel = transitionWrap.querySelector("[data-transition-label]");
  const transitionLabelText = transitionWrap.querySelector("[data-transition-label-text]");

  const tl = gsap.timeline();

  if (reducedMotion) {
    // Immediate swap behavior if user prefers reduced motion. Set outside the
    // timeline so the container comes back in the same frame nextAdded hid it,
    // rather than a frame later.
    gsap.set(next, { autoAlpha: 1 });
    tl.add("pageReady")
    tl.call(resetPage, [next], "pageReady");
    return new Promise(resolve => tl.call(resolve, null, "pageReady"));
  }

  // Barba no longer runs leave and enter together, so the wait before the
  // panel leaves is measured from the moment the screen is covered, not from
  // the start of the wipe. Same pause on screen as before.
  tl.add("startEnter", 0.45);

  tl.set(next, {
    autoAlpha: 1,
  }, "startEnter");

  tl.fromTo(transitionPanel, {
    yPercent: -100,
  }, {
    yPercent: -200,
    duration: 1,
    overwrite: "auto",
    immediateRender: false
  }, "startEnter");

  tl.set(transitionPanel, {
    autoAlpha: 0
  }, ">");

  tl.fromTo(transitionLabel, {
    autoAlpha: 1
  }, {
    autoAlpha: 0,
    duration: 0.4,
    overwrite: "auto",
    immediateRender: false
  }, "startEnter+=0.1");

  tl.from(next, {
    y: "15vh",
    duration: 1,
  }, "startEnter");

  tl.add("pageReady");
  tl.call(resetPage, [next], "pageReady");

  return new Promise(resolve => {
    tl.call(resolve, null, "pageReady");
  });
}


// -----------------------------------------
// BARBA HOOKS + INIT
// -----------------------------------------

// Hide the incoming container the instant Barba puts it in the DOM, so it is
// invisible for the whole covered stretch until enter reveals it. A bare
// gsap.set applies synchronously; a timeline's set() is a zero-duration tween
// that would not render until the ticker's next frame, leaving the browser a
// frame in which to paint the new page.
barba.hooks.nextAdded(data => {
  gsap.set(data.next.container, { autoAlpha: 0 });
});

// Everything expensive or jarring happens here, in the covered window between
// the panel arriving and the enter animation revealing anything: the scroll
// reset, the theme swap, page init and the one ScrollTrigger refresh. None of
// it is on screen, so none of it can read as a jump.
barba.hooks.beforeEnter(data => {
  if (lenis && typeof lenis.stop === "function") {
    lenis.stop();
  }

  resetScroll();

  // The incoming container is in normal flow — the outgoing one is already
  // gone by this point — so the height hold has done its job and can be
  // released here rather than at the reveal.
  document.documentElement.style.minHeight = "";

  initBeforeEnterFunctions(data.next.container);
  applyThemeFrom(data.next.container);

  if (hasLenis) lenis.resize();
  if (hasScrollTrigger) ScrollTrigger.refresh();
});

// Safety net for anything the page cleanups missed. Only triggers whose
// element has left the document are stale — never a blanket kill, which would
// take the incoming page's triggers with it the moment anything (a slow fetch,
// a future sync transition) puts beforeEnter ahead of this hook.
barba.hooks.afterLeave(() => {
  if (!hasScrollTrigger) return;

  ScrollTrigger.getAll().forEach(trigger => {
    const el = trigger.trigger || trigger.vars.trigger;
    if (!el || !document.contains(el)) trigger.kill();
  });
});

barba.hooks.enter(data => {
  initBarbaNavUpdate(data);
})

// Hold the document height for the length of the transition. Without it the
// page briefly has no in-flow content — the outgoing container is removed and
// the incoming one is position:fixed — so the scrollbar drops out and returns,
// shifting the layout by its width twice. Registered ahead of the afterEnter
// hook below so the height is released before Lenis re-measures.
barba.hooks.beforeLeave(() => {
  // Runs before beforeEnter, so the outgoing page is torn down before the
  // incoming one builds anything of its own.
  runPageCleanups();

  const height = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  );
  document.documentElement.style.minHeight = `${height}px`;
});

barba.hooks.afterEnter(data => {
  // Run page functions
  initAfterEnterFunctions(data.next.container);

  // Everything else already settled while the panel was covering; all that
  // is left is handing scrolling back to the user.
  if (hasLenis) lenis.start();
});

barba.init({
  debug: false,
  timeout: 7000,
  preventRunning: true,
  // Not sync: leave runs to completion — the panel wipes up and covers the
  // viewport — before Barba removes the current container, adds the next one
  // and runs enter. The destination page is therefore never in the document
  // while any of it is visible, which is what makes the flash impossible
  // rather than merely hidden.
  transitions: [
    {
      name: "default",

      // First load
      async once(data) {
        initOnceFunctions();
        initBeforeEnterFunctions(data.next.container);

        return runPageOnceAnimation(data.next.container);
      },

      // Current page leaves
      async leave(data) {
        return runPageLeaveAnimation(data.current.container, data.next.url.href);
      },

      // New page enters
      async enter(data) {
        return runPageEnterAnimation(data.next.container);
      }
    }
  ],
});



// -----------------------------------------
// GENERIC + HELPERS
// -----------------------------------------

const themeConfig = {
  light: {
    nav: "dark",
    transition: "light"
  },
  dark: {
    nav: "light",
    transition: "dark"
  }
};

function applyThemeFrom(container) {
  const pageTheme = container?.dataset?.pageTheme || "light";
  const config = themeConfig[pageTheme] || themeConfig.light;

  document.body.dataset.pageTheme = pageTheme;
  const transitionEl = document.querySelector('[data-theme-transition]');
  if (transitionEl) {
    transitionEl.dataset.themeTransition = config.transition;
  }

  const nav = document.querySelector('[data-theme-nav]');
  if (nav) {
    nav.dataset.themeNav = config.nav;
  }
}

function initLenis() {
  if (lenis) return; // already created
  if (!hasLenis) return;

  lenis = new Lenis({
    lerp: 0.165,
    wheelMultiplier: 1.25,
  });

  if (hasScrollTrigger) {
    lenis.on("scroll", ScrollTrigger.update);
  }

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });

  gsap.ticker.lagSmoothing(0);
}

// Scroll to the top in a way Lenis agrees with. Setting window.scrollY behind
// its back leaves its internal position stale, and it snaps back to the old
// offset the moment it is started again.
function resetScroll() {
  if (hasLenis && lenis) {
    lenis.scrollTo(0, { immediate: true, force: true });
  }
  window.scrollTo(0, 0);
}

/* The enter animation tweens the container's y, and GSAP leaves the
   transform on the element when it finishes.
   Two things follow from that, and both are why the pinned sections
   were unreliable:

     - a transformed ancestor is the containing block for anything
       fixed inside it. The transform clears here, but transition.css
       also declares will-change: transform on the container, which
       does the same thing on its own — so pins stay transform pins;
     - every measurement taken while the container is still mid-tween
       is out by however far it has left to travel — up to 15vh. The
       lifecycle's refresh runs in beforeEnter, before the animation,
       so trigger positions were being recorded against a page 100+px
       below where it settles. Whether that mattered came down to how
       far the tween had got, which is why it worked some loads and
       not others.

   Clearing the transform here and refreshing afterwards makes the
   measurement deterministic: it happens once, on the settled page. */
function resetPage(container) {
  resetScroll();
  gsap.set(container, { clearProps: "position,top,left,right,transform" });

  if (hasLenis) {
    lenis.resize();
    lenis.start();
  }

  if (hasScrollTrigger) ScrollTrigger.refresh();
}

function debounceOnWidthChange(fn, ms) {
  let last = innerWidth,
    timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (innerWidth !== last) {
        last = innerWidth;
        fn.apply(this, args);
      }
    }, ms);
  };
}

function initBarbaNavUpdate(data) {
  var tpl = document.createElement('template');
  tpl.innerHTML = data.next.html.trim();
  var nextNodes = tpl.content.querySelectorAll('[data-barba-update]');
  var currentNodes = document.querySelectorAll('nav [data-barba-update]');

  currentNodes.forEach(function (curr, index) {
    var next = nextNodes[index];
    if (!next) return;

    // Aria-current sync
    var newStatus = next.getAttribute('aria-current');
    if (newStatus !== null) {
      curr.setAttribute('aria-current', newStatus);
    } else {
      curr.removeAttribute('aria-current');
    }

    // Class list sync
    var newClassList = next.getAttribute('class') || '';
    curr.setAttribute('class', newClassList);
  });
}



// -----------------------------------------
// YOUR FUNCTIONS GO BELOW HERE
// -----------------------------------------

/* Research carousel arrows — scoped to the incoming page. */
function initCarousel() {
  nextPage.querySelectorAll('[data-carousel] .arrows button').forEach(function (b) {
    b.addEventListener('click', function () {
      const track = b.closest('[data-carousel]').querySelector('.research__track, .scroller');
      if (track) track.scrollBy({ left: Number(b.dataset.scroll), behavior: 'smooth' });
    });
  });
}

/* ============================================================
   Mega nav — directional hover dropdowns, mobile slide-over panels.
   Lives outside the Barba container, so this runs once per session.
   ============================================================ */
function initMegaNavDirectionalHover() {
  // The panel opens as one considered move: the container heights out on the
  // site's own osmo ease while the content settles in behind it. The stagger
  // is deliberately near-nothing — enough to stop the items landing on a
  // single hard frame, not enough to read as a cascade.
  const DUR = {
    bgMorph: 0.45,
    contentIn: 0.35,
    contentOut: 0.2,
    stagger: 0.06,
    backdropIn: 0.35,
    backdropOut: 0.25,
    openScale: 0.45,
    closeScale: 0.3,
  };

  const HOVER_ENTER = 120;
  const HOVER_LEAVE = 150;

  // DOM references
  const menuWrap = document.querySelector("[data-menu-wrap]");
  const navList = document.querySelector("[data-nav-list]");
  const dropWrapper = document.querySelector("[data-dropdown-wrapper]");
  const dropContainer = document.querySelector("[data-dropdown-container]");
  const backdrop = document.querySelector("[data-menu-backdrop]");
  const toggles = [...document.querySelectorAll("[data-dropdown-toggle]")];
  const panels = [...document.querySelectorAll("[data-nav-content]")];
  const burger = document.querySelector("[data-burger-toggle]");
  const backBtn = document.querySelector("[data-mobile-back]");
  const logo = document.querySelector("[data-menu-logo]");
  const [lineTop, lineMid, lineBot] = ["top", "mid", "bot"].map(
    (id) => document.querySelector(`[data-burger-line='${id}']`)
  );

  if (!menuWrap || !navList || !dropWrapper) return;

  // State
  const state = {
    isOpen: false,
    activePanel: null,
    activePanelIndex: -1,
    isMobile: window.innerWidth <= 991,
    mobileMenuOpen: false,
    mobilePanelActive: null,
    hoverTimer: null,
    leaveTimer: null,
    tl: null,
    mobileTl: null,
    mobilePanelTl: null,
  };

  // Helpers
  const getPanel = (name) => document.querySelector(`[data-nav-content="${name}"]`);
  const getToggle = (name) => document.querySelector(`[data-dropdown-toggle="${name}"]`);
  const getFade = (el) => el.querySelectorAll("[data-menu-fade]");
  const getNavItems = () => navList.querySelectorAll("[data-nav-list-item]");
  const getIndex = (name) => toggles.indexOf(getToggle(name));
  const stagger = (n) => (n <= 1 ? 0 : { amount: DUR.stagger });

  function clearTimers() {
    clearTimeout(state.hoverTimer);
    clearTimeout(state.leaveTimer);
    state.hoverTimer = state.leaveTimer = null;
  }

  function killTl(key) {
    if (state[key]) { state[key].kill(); state[key] = null; }
  }

  function killDropdown() {
    killTl("tl");
    gsap.killTweensOf(dropContainer);
    gsap.killTweensOf(backdrop);
    panels.forEach((p) => { gsap.killTweensOf(p); gsap.killTweensOf(getFade(p)); });
  }

  function killMobile() {
    killTl("mobileTl");
    gsap.killTweensOf([navList, lineTop, lineMid, lineBot]);
  }

  function killMobilePanel() {
    killTl("mobilePanelTl");
    gsap.killTweensOf(getNavItems());
    gsap.killTweensOf([backBtn, logo]);
    panels.forEach((p) => { gsap.killTweensOf(p); gsap.killTweensOf(getFade(p)); });
  }

  function resetToggles() {
    toggles.forEach((t) => t.setAttribute("aria-expanded", "false"));
  }

  function resetDesktop() {
    panels.forEach((p) => {
      gsap.set(p, { visibility: "hidden", opacity: 0, pointerEvents: "none", x: 0, y: 0, xPercent: 0 });
      gsap.set(getFade(p), { autoAlpha: 0, x: 0, y: 0, xPercent: 0 });
    });

    gsap.set(dropContainer, { height: 0, clearProps: "transform" });
    gsap.set(backdrop, { autoAlpha: 0 });

    menuWrap.setAttribute("data-menu-open", "false");
    resetToggles();
  }

  function setupMobile() {
    panels.forEach((p) => {
      gsap.set(p, { autoAlpha: 0, xPercent: 0, visibility: "visible", pointerEvents: "none" });
      gsap.set(getFade(p), { xPercent: 20, autoAlpha: 0 });
    });
    gsap.set(getNavItems(), { xPercent: 0, y: 0, autoAlpha: 1 });
    gsap.set(navList, { autoAlpha: 0, x: 0 });
    gsap.set(backBtn, { autoAlpha: 0 });
    gsap.set(logo, { autoAlpha: 1 });
    gsap.set(dropContainer, { clearProps: "height" });
    gsap.set(backdrop, { autoAlpha: 0 });
  }

  function measurePanel(name) {
    const el = getPanel(name);
    if (!el) return 0;
    const s = el.style;
    const prev = [s.visibility, s.opacity, s.pointerEvents];
    Object.assign(s, { visibility: "visible", opacity: "0", pointerEvents: "none" });
    const h = el.getBoundingClientRect().height;
    [s.visibility, s.opacity, s.pointerEvents] = prev;
    return h;
  }

  // DESKTOP — open dropdown (first open)
  function openDropdown(panelName) {
    if (state.isOpen && state.activePanel === panelName) return;
    if (state.isOpen) return switchPanel(state.activePanel, panelName);

    const height = measurePanel(panelName);
    if (!height) return;

    killDropdown();
    resetDesktop();

    const el = getPanel(panelName);
    const fade = getFade(el);
    const toggle = getToggle(panelName);

    state.isOpen = true;
    state.activePanel = panelName;
    state.activePanelIndex = getIndex(panelName);
    menuWrap.setAttribute("data-menu-open", "true");
    if (toggle) toggle.setAttribute("aria-expanded", "true");

    gsap.set(dropContainer, { height: 0 });

    const tl = gsap.timeline();
    state.tl = tl;
    tl.to(backdrop, { autoAlpha: 1, duration: DUR.backdropIn, ease: "power2.out" }, 0);
    tl.to(dropContainer, { height, duration: DUR.openScale, ease: "osmo" }, 0);
    tl.set(el, { visibility: "visible", opacity: 1, pointerEvents: "auto" }, 0.05);
    if (fade.length) {
      tl.fromTo(fade,
        { autoAlpha: 0, y: 6 },
        { autoAlpha: 1, y: 0, duration: DUR.contentIn, stagger: stagger(fade.length), ease: "power2.out" },
        0.12
      );
    }
  }

  // DESKTOP — close dropdown
  function closeDropdown() {
    if (!state.isOpen) return;
    const el = getPanel(state.activePanel);
    const fade = el ? getFade(el) : [];

    killDropdown();

    const tl = gsap.timeline({
      onComplete() {
        state.isOpen = false;
        state.activePanel = null;
        state.activePanelIndex = -1;
        state.tl = null;
        resetDesktop();
      },
    });
    state.tl = tl;
    if (fade.length) tl.to(fade, { autoAlpha: 0, y: -4, duration: DUR.contentOut * 0.7, ease: "power2.in" }, 0);
    tl.to(dropContainer, { height: 0, duration: DUR.closeScale, ease: "osmo" }, 0.05);
    tl.to(backdrop, { autoAlpha: 0, duration: DUR.backdropOut, ease: "power2.out" }, 0);
    if (el) tl.set(el, { visibility: "hidden", opacity: 0, pointerEvents: "none" });
  }

  // DESKTOP — switch panel (directional)
  function switchPanel(fromName, toName) {
    const dir = getIndex(toName) > getIndex(fromName) ? 1 : -1;
    const fromEl = getPanel(fromName), toEl = getPanel(toName);
    if (!fromEl || !toEl) return;

    const fromFade = getFade(fromEl), toFade = getFade(toEl);
    const toHeight = measurePanel(toName);
    if (!toHeight) return;

    killDropdown();

    panels.forEach((p) => {
      gsap.set(p, { visibility: "hidden", opacity: 0, pointerEvents: "none", xPercent: 0 });
      gsap.set(getFade(p), { autoAlpha: 0, x: 0, y: 0 });
    });
    gsap.set(fromEl, { visibility: "visible", opacity: 1, pointerEvents: "auto", x: 0 });
    if (fromFade.length) gsap.set(fromFade, { autoAlpha: 1, x: 0, y: 0 });
    gsap.set(backdrop, { autoAlpha: 1 });

    const toToggle = getToggle(toName);
    state.activePanel = toName;
    state.activePanelIndex = getIndex(toName);
    resetToggles();
    if (toToggle) toToggle.setAttribute("aria-expanded", "true");

    const xOut = dir * -30, xIn = dir * 30;
    const tl = gsap.timeline();
    state.tl = tl;

    if (fromFade.length) tl.to(fromFade, { autoAlpha: 0, x: xOut, duration: DUR.contentOut, ease: "power2.in" }, 0);
    tl.set(fromEl, { visibility: "hidden", opacity: 0, pointerEvents: "none", xPercent: 0 }, DUR.contentOut);
    if (fromFade.length) tl.set(fromFade, { x: 0 }, DUR.contentOut);
    tl.to(dropContainer, { height: toHeight, duration: DUR.bgMorph, ease: "osmo" }, 0.05);
    tl.set(toEl, { visibility: "visible", opacity: 1, pointerEvents: "auto", xPercent: 0 }, DUR.contentOut * 0.5);
    if (toFade.length) {
      tl.fromTo(toFade,
        { autoAlpha: 0, x: xIn },
        { autoAlpha: 1, x: 0, duration: DUR.contentIn, stagger: stagger(toFade.length), ease: "power3.out" },
        DUR.contentOut * 0.6
      );
    }
  }

  // DESKTOP — hover intent
  function handleToggleEnter(e) {
    if (state.isMobile) return;
    const name = e.currentTarget.getAttribute("data-dropdown-toggle");
    if (!name) return;
    clearTimeout(state.leaveTimer); state.leaveTimer = null;
    clearTimeout(state.hoverTimer);
    state.hoverTimer = setTimeout(() => openDropdown(name), state.isOpen ? 0 : HOVER_ENTER);
  }

  function handleToggleLeave() {
    if (state.isMobile) return;
    clearTimeout(state.hoverTimer); state.hoverTimer = null;
    state.leaveTimer = setTimeout(closeDropdown, HOVER_LEAVE);
  }

  function handleWrapperEnter() {
    if (state.isMobile) return;
    clearTimeout(state.leaveTimer); state.leaveTimer = null;
  }

  function handleWrapperLeave() {
    if (state.isMobile) return;
    state.leaveTimer = setTimeout(closeDropdown, HOVER_LEAVE);
  }

  // DESKTOP — close behaviours
  function handleEscape(e) {
    if (e.key !== "Escape") return;
    if (state.isMobile) {
      state.mobilePanelActive ? closeMobilePanel() : state.mobileMenuOpen && closeMobileMenu();
      return;
    }
    if (state.isOpen) {
      const t = getToggle(state.activePanel);
      closeDropdown();
      if (t) t.focus();
    }
  }

  function handleDocClick(e) {
    if (state.isMobile || !state.isOpen) return;
    if (!e.target.closest("[data-menu-wrap]")) closeDropdown();
  }

  // DESKTOP — keyboard navigation
  function focusFirstLink(panelName) {
    setTimeout(() => {
      const el = getPanel(panelName);
      if (!el) return;
      const link = el.querySelector("a");
      if (!link) return;
      gsap.set(link, { visibility: "visible" });
      link.focus();
    }, 80);
  }

  function handleKeydownOnToggle(e) {
    if (state.isMobile) return;
    const name = e.currentTarget.getAttribute("data-dropdown-toggle");

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (state.isOpen && state.activePanel === name) closeDropdown();
      else { openDropdown(name); focusFirstLink(name); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!state.isOpen || state.activePanel !== name) openDropdown(name);
      focusFirstLink(name);
    }
    if (e.key === "Tab" && !e.shiftKey && state.isOpen && state.activePanel === name) {
      e.preventDefault();
      const link = getPanel(name)?.querySelector("a");
      if (link) link.focus();
    }
  }

  function handleKeydownInPanel(e) {
    if (state.isMobile || !state.isOpen) return;
    const el = getPanel(state.activePanel);
    if (!el) return;

    const links = [...el.querySelectorAll("a")];
    const idx = links.indexOf(document.activeElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      links[(idx + 1) % links.length].focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (idx <= 0) { const t = getToggle(state.activePanel); if (t) t.focus(); }
      else links[idx - 1].focus();
    }
    if (e.key === "Tab" && !e.shiftKey && idx === links.length - 1) {
      e.preventDefault();
      const curIdx = toggles.indexOf(getToggle(state.activePanel));
      const next = curIdx < toggles.length - 1 ? toggles[curIdx + 1] : null;
      closeDropdown();
      if (next) next.focus();
    }
    if (e.key === "Tab" && e.shiftKey && idx === 0) {
      e.preventDefault();
      const t = getToggle(state.activePanel);
      if (t) t.focus();
    }
  }

  // MOBILE — burger animation
  function animateBurger(toX) {
    const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
    if (toX) {
      tl.to(lineTop, { y: "0.3125em", duration: 0.15 }, 0);
      tl.to(lineBot, { y: "-0.3125em", duration: 0.15 }, 0);
      tl.to(lineMid, { autoAlpha: 0, duration: 0.1 }, 0.1);
      tl.to(lineTop, { rotation: 45, duration: 0.2 }, 0.15);
      tl.to(lineBot, { rotation: -45, duration: 0.2 }, 0.15);
    } else {
      tl.to(lineTop, { rotation: 0, duration: 0.2 }, 0);
      tl.to(lineBot, { rotation: 0, duration: 0.2 }, 0);
      tl.to(lineTop, { y: 0, duration: 0.15 }, 0.15);
      tl.to(lineBot, { y: 0, duration: 0.15 }, 0.15);
      tl.to(lineMid, { autoAlpha: 1, duration: 0.1 }, 0.15);
    }
    return tl;
  }

  // MOBILE — open/close menu
  function openMobileMenu() {
    killMobile();
    state.mobileMenuOpen = true;
    menuWrap.setAttribute("data-menu-open", "true");
    burger.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";

    const items = getNavItems();
    const tl = gsap.timeline();
    state.mobileTl = tl;
    tl.add(animateBurger(true), 0);
    tl.to(navList, { autoAlpha: 1, duration: 0.3, ease: "power2.out" }, 0);
    if (items.length) {
      tl.fromTo(items,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.04, ease: "power3.out" },
        0.15
      );
    }
  }

  function closeMobileMenu() {
    const hadPanel = state.mobilePanelActive;
    const panelEl = hadPanel ? getPanel(hadPanel) : null;

    killMobile();
    killMobilePanel();

    menuWrap.setAttribute("data-menu-open", "false");
    state.mobileMenuOpen = false;
    state.mobilePanelActive = null;
    burger.setAttribute("aria-expanded", "false");

    const tl = gsap.timeline({
      onComplete() {
        document.body.style.overflow = "";
        state.mobileTl = null;
        setupMobile();
      },
    });
    state.mobileTl = tl;

    tl.add(animateBurger(false), 0);

    if (hadPanel && panelEl) {
      tl.to(panelEl, { autoAlpha: 0, duration: 0.3, ease: "power2.inOut" }, 0.05);
      tl.to(backBtn, { autoAlpha: 0, duration: 0.2, ease: "power2.in" }, 0.05);
    }

    tl.to(navList, { autoAlpha: 0, duration: 0.3, ease: "power2.inOut" }, 0.05);
  }

  // MOBILE — slide-over panels
  function openMobilePanel(panelName) {
    const el = getPanel(panelName);
    if (!el) return;
    killMobilePanel();
    state.mobilePanelActive = panelName;

    const navItems = getNavItems();
    const panelFade = getFade(el);

    const tl = gsap.timeline();
    state.mobilePanelTl = tl;

    if (navItems.length) {
      tl.to(navItems, {
        xPercent: -10, autoAlpha: 0,
        duration: 0.35, stagger: 0.03, ease: "power2.in",
      }, 0);
    }

    tl.to(logo, { autoAlpha: 0, duration: 0.2, ease: "power2.in" }, 0);
    tl.to(backBtn, { autoAlpha: 1, duration: 0.25, ease: "power2.inOut" }, 0.15);

    tl.set(el, { autoAlpha: 1, xPercent: 0, pointerEvents: "auto" }, 0.2);
    if (panelFade.length) {
      tl.fromTo(panelFade,
        { xPercent: 8, autoAlpha: 0 },
        { xPercent: 0, autoAlpha: 1, duration: 0.3, stagger: stagger(panelFade.length), ease: "power3.out" },
        0.25
      );
    }
  }

  function closeMobilePanel() {
    if (!state.mobilePanelActive) return;
    const el = getPanel(state.mobilePanelActive);
    if (!el) return;
    killMobilePanel();

    const navItems = getNavItems();
    const panelFade = getFade(el);

    const tl = gsap.timeline({
      onComplete() { state.mobilePanelActive = null; state.mobilePanelTl = null; },
    });
    state.mobilePanelTl = tl;

    if (panelFade.length) {
      tl.to(el, {
        xPercent: 20, autoAlpha: 0,
        duration: 0.3, stagger: 0.02, ease: "power2.in",
      }, 0);
    }

    tl.set(el, { autoAlpha: 0, pointerEvents: "none" }, 0.25);

    tl.to(backBtn, { autoAlpha: 0, duration: 0.2, ease: "power2.in" }, 0);
    tl.to(logo, { autoAlpha: 1, duration: 0.25, ease: "power2.out" }, 0.15);

    if (navItems.length) {
      tl.fromTo(navItems,
        { xPercent: -20, autoAlpha: 0 },
        { xPercent: 0, autoAlpha: 1, duration: 0.35, stagger: 0.03, ease: "power3.out" },
        0.25
      );
    }
  }

  function handleToggleClick(e) {
    if (!state.isMobile || !state.mobileMenuOpen) return;
    const name = e.currentTarget.getAttribute("data-dropdown-toggle");
    if (name) { e.preventDefault(); openMobilePanel(name); }
  }

  // Close the menu when a navigation starts, so the panel does not sit
  // open over the incoming page.
  function closeEverything() {
    if (state.isMobile) {
      if (state.mobilePanelActive) closeMobilePanel();
      if (state.mobileMenuOpen) closeMobileMenu();
    } else if (state.isOpen) {
      clearTimers();
      closeDropdown();
    }
  }

  // RESIZE
  let resizeTimer = null;
  let lastWidth = window.innerWidth;
  function handleResize() {
    const w = window.innerWidth;
    if (w === lastWidth) return;
    lastWidth = w;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const was = state.isMobile;
      state.isMobile = window.innerWidth <= 991;

      if (was && !state.isMobile) {
        killMobile(); killMobilePanel();
        gsap.set(navList, { clearProps: "all" });
        gsap.set(getNavItems(), { clearProps: "all" });
        gsap.set(backBtn, { autoAlpha: 0 });
        gsap.set(logo, { clearProps: "all" });
        gsap.set([lineTop, lineMid, lineBot], { rotation: 0, y: 0, autoAlpha: 1 });

        panels.forEach((p) => {
          gsap.set(p, { clearProps: "all" });
          gsap.set(getFade(p), { clearProps: "all" });
        });

        burger.setAttribute("aria-expanded", "false");
        state.mobileMenuOpen = false;
        state.mobilePanelActive = null;
        document.body.style.overflow = "";
        resetDesktop();
      }

      if (!was && state.isMobile) {
        killDropdown();
        state.isOpen = false; state.activePanel = null; state.activePanelIndex = -1;
        clearTimers();
        menuWrap.setAttribute("data-menu-open", "false");
        resetToggles();
        setupMobile();
      }

    }, 150);
  }

  // EVENT BINDING
  toggles.forEach((btn) => {
    btn.addEventListener("mouseenter", handleToggleEnter);
    btn.addEventListener("mouseleave", handleToggleLeave);
    btn.addEventListener("keydown", handleKeydownOnToggle);
    btn.addEventListener("click", handleToggleClick);
  });

  dropWrapper.addEventListener("mouseenter", handleWrapperEnter);
  dropWrapper.addEventListener("mouseleave", handleWrapperLeave);

  panels.forEach((p) => p.addEventListener("keydown", handleKeydownInPanel));

  backdrop.addEventListener("click", closeDropdown);

  document.addEventListener("keydown", handleEscape);
  document.addEventListener("click", handleDocClick);

  burger.addEventListener("click", () => state.mobileMenuOpen ? closeMobileMenu() : openMobileMenu());

  backBtn.addEventListener("click", closeMobilePanel);

  window.addEventListener("resize", handleResize);

  barba.hooks.beforeLeave(closeEverything);

  // INIT
  state.isMobile ? setupMobile() : resetDesktop();
}

/* ============================================================
   Button 059 — measures each label so the two halves swap width
   ============================================================ */
function initButton059() {
  const buttons = document.querySelectorAll('[data-button-059]');
  if (buttons.length === 0) return;

  const resizeCallbacks = new Set();
  let resizeTimeout;

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      resizeCallbacks.forEach((callback) => callback());
    }, 60);
  });

  const addResizeCallback = (callback) => {
    resizeCallbacks.add(callback);
    return () => resizeCallbacks.delete(callback);
  };

  buttons.forEach((element) => {
    const elements = element.querySelectorAll('[data-button-059-element]');

    const updateWidth = (el) => {
      const text = el.querySelector('[data-button-059-text]');
      const width = text.offsetWidth;
      el.style.setProperty('--button-059-width', `${width}px`);
    };

    const updateAll = () => { elements.forEach(updateWidth); };
    updateAll();
    const removeResize = addResizeCallback(updateAll);

    return () => {
      removeResize?.();
    };
  });
}

/* ============================================================
   Approach slides — each step pinned, tipped back and faded
   ============================================================
   The reference effect is kept as shipped: the slide's wrapper is
   pinned for one viewport while the card inside it rotates back on
   X, twists a few degrees on Z and shrinks, then a second scrubbed
   tween fades it out once it has travelled far enough. Three things
   are adapted so it lives in this codebase rather than beside it:

     - it is queried against the Barba container, not document, and
       is called from the page registry instead of DOMContentLoaded,
       so it rebinds on every navigation to the homepage;
     - its ScrollTriggers are killed through registerPageCleanup,
       which is what unpins the wrappers when the container goes;
     - Lenis and ScrollTrigger are already wired up by the page
       lifecycle, so nothing here starts either.
   ============================================================ */
function initApproachSlides() {
  const root = nextPage.querySelector("[data-approach-slides-init]");
  if (!root || !hasScrollTrigger) return;

  const slides = [...root.querySelectorAll(".approach__slide")];
  if (!slides.length) return;

  // The bar is fixed over the page, so a card has to stack beneath it
  // rather than at the very top of the viewport.
  //
  // Two sources, whichever is larger, because either can read zero at
  // the moment a refresh happens: the bar itself if it is mid-intro,
  // and --nav-h if a stylesheet has not landed. The value is written
  // back onto the section as data-nav-offset, so what the trigger is
  // actually using can be read straight off the DOM.
  const navBar = document.querySelector(".mega-nav__bar");
  const cssNavHeight = () => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;top:0;left:0;visibility:hidden;pointer-events:none;height:var(--nav-h)";
    document.body.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  };
  const navOffset = () => {
    const measured = navBar ? navBar.getBoundingClientRect().height : 0;
    const offset = Math.round(Math.max(measured, cssNavHeight()));
    root.dataset.navOffset = offset;
    return offset;
  };

  const tweens = [];

  slides.forEach((slide, index) => {
    const wrapper = slide.querySelector(".approach__slide-wrapper");
    const card = slide.querySelector(".approach__card");
    if (!wrapper || !card) return;

    // The last step is where the sequence ends, so it is left alone:
    // no pin, no tip, no fade. It arrives like any other block on the
    // page and scrolls on into the section below it.
    if (index === slides.length - 1) return;

    tweens.push(gsap.to(card, {
      rotationZ: (Math.random() - 0.5) * 10, // between -5 and 5 degrees
      scale: 0.7,
      rotationX: 40,
      ease: "power1.in",
      scrollTrigger: {
        pin: wrapper, // held while the card tips away
        // The Barba container carries a transform and will-change,
        // which makes it the containing block for anything fixed —
        // the default pinType would drop the pinned card at the top
        // of the container instead of holding it in the viewport.
        pinType: "transform",
        // start and end are re-measured on every refresh, and the
        // trigger is invalidated with them, so a start computed while
        // the page was still settling cannot stick around
        invalidateOnRefresh: true,
        trigger: slide,
        start: () => "top " + navOffset() + "px",
        end: () => "+=" + window.innerHeight, // one viewport later
        scrub: true,
      },
    }));

    tweens.push(gsap.to(card, {
      autoAlpha: 0,
      ease: "power1.in",
      scrollTrigger: {
        trigger: card,
        start: "top -80%",
        end: "+=" + 0.2 * window.innerHeight,
        scrub: true,
      },
    }));
  });

  // resetPage refreshes once the page has settled, which is the
  // measurement that matters. These two cover the reflows that can
  // still land after it: a late font swap and the images finishing.
  const refreshIfLive = () => {
    if (root.isConnected) ScrollTrigger.refresh();
  };
  document.fonts?.ready.then(refreshIfLive);
  if (document.readyState !== "complete") {
    window.addEventListener("load", refreshIfLive, { once: true });
    registerPageCleanup(() => window.removeEventListener("load", refreshIfLive));
  }

  registerPageCleanup(() => {
    tweens.forEach((tween) => {
      tween.scrollTrigger?.kill();
      tween.kill();
    });
  });
}

/* ============================================================
   Line reveal testimonials — masked lines, one slide at a time
   ============================================================
   The reference component's logic is kept as shipped: the slides
   stack in one grid cell, SplitText masks each slide's lines, and
   a change wipes the outgoing lines up and the incoming lines in
   behind them, with the same durations, eases and staggers. Its
   counter, autoplay, arrow buttons, arrow-key handling and the
   in-view ScrollTrigger are all unchanged.

   Four adaptations so it lives in this codebase:

     - it is queried against the Barba container, not document, and
       runs from the page registry rather than DOMContentLoaded;
     - its listeners, ScrollTrigger, autoplay call and splits are
       torn down through registerPageCleanup, so nothing outlives
       the DOM it measured;
     - the portrait's circular clip becomes a straight fade, since
       what sits there is a logo on a square tile, not a face;
     - if SplitText is not on the page it falls back to the
       component's own reduced-motion path, a plain crossfade.
   ============================================================ */
function initLineRevealTestimonials() {
  const wraps = nextPage.querySelectorAll("[data-testimonial-wrap]");
  if (!wraps.length) return;

  wraps.forEach((wrap) => {
    const list = wrap.querySelector("[data-testimonial-list]");
    if (!list) return;

    const items = Array.from(list.querySelectorAll("[data-testimonial-item]"));
    if (!items.length) return;

    const btnPrev = wrap.querySelector("[data-prev]");
    const btnNext = wrap.querySelector("[data-next]");
    const elCurrent = wrap.querySelector("[data-current]");
    const elTotal = wrap.querySelector("[data-total]");

    if (elTotal) elTotal.textContent = String(items.length);

    let activeIndex = items.findIndex((el) => el.classList.contains("is--active"));
    if (activeIndex < 0) activeIndex = 0;

    let isAnimating = false;
    const reduceMotion = reducedMotion || !hasSplitText;

    const autoplayEnabled = wrap.getAttribute("data-autoplay") === "true";
    const autoplayDuration = parseInt(wrap.getAttribute("data-autoplay-duration"), 10) || 4000;

    let autoplayCall = null;
    let isInView = true;

    const slides = items.map((item) => ({
      item,
      image: item.querySelector("[data-testimonial-img]"),

      splitTargets: [
        item.querySelector("[data-testimonial-text]"),
        ...item.querySelectorAll("[data-testimonial-split]"),
      ].filter(Boolean),

      splitInstances: [],

      getLines() {
        return this.splitInstances.flatMap((instance) => instance.lines);
      },
    }));

    function setSlideState(slideIndex, isActive) {
      const { item } = slides[slideIndex];
      item.classList.toggle("is--active", isActive);
      item.setAttribute("aria-hidden", String(!isActive));
      gsap.set(item, {
        autoAlpha: isActive ? 1 : 0,
        pointerEvents: isActive ? "auto" : "none",
      });
    }

    function updateCounter() {
      if (elCurrent) elCurrent.textContent = String(activeIndex + 1);
    }

    function startAutoplay() {
      if (!autoplayEnabled || slides.length < 2) return;
      if (autoplayCall) autoplayCall.kill();

      autoplayCall = gsap.delayedCall(autoplayDuration / 1000, () => {
        if (!isInView || isAnimating) {
          startAutoplay();
          return;
        }
        goTo((activeIndex + 1) % slides.length);
        startAutoplay();
      });
    }

    function pauseAutoplay() {
      if (autoplayCall) autoplayCall.pause();
    }

    function resumeAutoplay() {
      if (!autoplayEnabled) return;
      if (!autoplayCall) startAutoplay();
      else autoplayCall.resume();
    }

    function resetAutoplay() {
      if (!autoplayEnabled) return;
      startAutoplay();
    }

    // Set initial state
    slides.forEach((_, i) => setSlideState(i, i === activeIndex));
    updateCounter();

    // Create SplitText instances
    if (hasSplitText) {
      slides.forEach((slide, slideIndex) => {
        slide.splitInstances = slide.splitTargets.map((el) =>
          SplitText.create(el, {
            type: "lines",
            mask: "lines",
            linesClass: "text-line",
            autoSplit: true,
            onSplit(self) {
              if (reduceMotion) return;

              const isActive = slideIndex === activeIndex;
              gsap.set(self.lines, { yPercent: isActive ? 0 : 110 });

              if (slide.image) {
                gsap.set(slide.image, { autoAlpha: isActive ? 1 : 0 });
              }
            },
          })
        );
      });
    }

    function goTo(nextIndex) {
      if (isAnimating || nextIndex === activeIndex) return;
      isAnimating = true;

      const outgoingSlide = slides[activeIndex];
      const incomingSlide = slides[nextIndex];

      const tl = gsap.timeline({
        onComplete: () => {
          setSlideState(activeIndex, false);
          setSlideState(nextIndex, true);
          activeIndex = nextIndex;
          updateCounter();
          isAnimating = false;
        },
      });

      if (reduceMotion) {
        tl.to(outgoingSlide.item, {
            autoAlpha: 0,
            duration: 0.4,
            ease: "power2"
          }, 0)
          .fromTo(incomingSlide.item, {
            autoAlpha: 0
          }, {
            autoAlpha: 1,
            duration: 0.4,
            ease: "power2"
          }, 0);

        return;
      }

      const outgoingLines = outgoingSlide.getLines();
      const incomingLines = incomingSlide.getLines();

      gsap.set(incomingSlide.item, { autoAlpha: 1, pointerEvents: "auto" });
      gsap.set(incomingLines, { yPercent: 110 });

      if (outgoingSlide.image) gsap.set(outgoingSlide.image, { autoAlpha: 1 });

      tl.to(outgoingLines, {
        yPercent: -110,
        duration: 0.6,
        ease: "power4.inOut",
        stagger: { amount: 0.25 },
      }, 0);

      if (outgoingSlide.image) {
        tl.to(outgoingSlide.image, {
          autoAlpha: 0,
          duration: 0.4,
          ease: "power2.inOut",
        }, 0);
      }

      tl.to(incomingLines, {
        yPercent: 0,
        duration: 0.7,
        ease: "power4.inOut",
        stagger: { amount: 0.4 },
      }, ">-=0.3");

      if (incomingSlide.image) {
        tl.fromTo(incomingSlide.image, {
          autoAlpha: 0,
        }, {
          autoAlpha: 1,
          duration: 0.5,
          ease: "power2.inOut",
        }, "<");
      }

      tl.set(outgoingSlide.item, { autoAlpha: 0 }, ">");
    }

    // Start autoplay on the wrap (only works if autoplay is set to 'true')
    startAutoplay();

    const onNext = () => {
      resetAutoplay();
      goTo((activeIndex + 1) % slides.length);
    };
    const onPrev = () => {
      resetAutoplay();
      goTo((activeIndex - 1 + slides.length) % slides.length);
    };

    if (btnNext) btnNext.addEventListener("click", onNext);
    if (btnPrev) btnPrev.addEventListener("click", onPrev);

    function onKeyDown(e) {
      if (!isInView) return;

      // Don't hijack arrow keys while user is typing.
      const t = e.target;
      const isTypingTarget =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);

      if (isTypingTarget) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
      }
    }

    // Listen for left/right arrows
    window.addEventListener("keydown", onKeyDown);

    // Enable/disable keyboard + autoplay depending on scroll position
    const trigger = ScrollTrigger.create({
      trigger: wrap,
      start: "top bottom",
      end: "bottom top",
      onEnter: () => {
        isInView = true;
        resumeAutoplay();
      },
      onEnterBack: () => {
        isInView = true;
        resumeAutoplay();
      },
      onLeave: () => {
        isInView = false;
        pauseAutoplay();
      },
      onLeaveBack: () => {
        isInView = false;
        pauseAutoplay();
      },
    });

    registerPageCleanup(() => {
      window.removeEventListener("keydown", onKeyDown);
      if (btnNext) btnNext.removeEventListener("click", onNext);
      if (btnPrev) btnPrev.removeEventListener("click", onPrev);
      if (autoplayCall) autoplayCall.kill();
      trigger.kill();
      slides.forEach((slide) => slide.splitInstances.forEach((instance) => instance.revert()));
    });
  });
}


/* ============================================================
   Shutter scroll transition — rows closing over a section
   ============================================================
   The reference component as shipped: its defaults, breakpoints,
   matchMedia tiers, row building and the two modes (cover, where
   the rows grow from the bottom as a section leaves; reveal, where
   they retract as one arrives) are unchanged.

   Three adaptations so it lives in this codebase:

     - it is queried against the Barba container, not document, and
       is called from the page registry rather than DOMContentLoaded,
       so it rebinds on every navigation;
     - the trigger is the nearest [data-shutter-scroll-section] when
       there is one, falling back to the reference's closest section.
       Here the shutter belongs to one step of the approach stack,
       not to the whole section it sits in;
     - the matchMedia context is reverted through registerPageCleanup,
       which tears the rows and their triggers down with it, and GSAP
       and ScrollTrigger are the ones the page has already loaded.
   ============================================================ */
function initShutterScrollTransition() {
  // Defaults — edit these to change fallbacks if no data-attribute is added
  const defaultRows = 6;
  const defaultMode = "cover";
  const defaultScrollStart = { cover: "bottom bottom", reveal: "top bottom" };
  const defaultScrollEnd = { cover: "bottom top", reveal: "top center" };
  const defaultScrub = 0.3;
  const defaultShutterDuration = 0.1;
  const defaultStaggerAmount = 0.01;

  // Class names applied to generated elements
  const panelClass = "shutter-scroll-transition__panel";
  const rowClass = "shutter-scroll-transition__row";

  // Breakpoints
  const breakpoints = {
    mobile: "(max-width: 478px)",
    landscape: "(max-width: 767px)",
    tablet: "(max-width: 991px)",
  };

  const instances = [];

  function getMode(wrapper) {
    return wrapper.dataset.mode === "reveal" ? "reveal" : defaultMode;
  }

  function getRows(wrapper) {
    const base = parseInt(wrapper.dataset.rows, 10) || defaultRows;

    if (window.matchMedia(breakpoints.mobile).matches) {
      return parseInt(wrapper.dataset.rowsMobile, 10) || base;
    }
    if (window.matchMedia(breakpoints.landscape).matches) {
      return parseInt(wrapper.dataset.rowsLandscape, 10) || base;
    }
    if (window.matchMedia(breakpoints.tablet).matches) {
      return parseInt(wrapper.dataset.rowsTablet, 10) || base;
    }
    return base;
  }

  function getScrollStart(wrapper, mode) {
    return wrapper.dataset.scrollStart || defaultScrollStart[mode];
  }

  function getScrollEnd(wrapper, mode) {
    return wrapper.dataset.scrollEnd || defaultScrollEnd[mode];
  }

  function createRow() {
    const row = document.createElement("div");
    row.classList.add(rowClass);
    row.setAttribute("data-shutter-scroll-row", "");
    return row;
  }

  function buildRows(wrapper, rows) {
    const panel = document.createElement("div");
    panel.classList.add(panelClass);
    panel.setAttribute("data-shutter-scroll-panel", "");

    const fragment = document.createDocumentFragment();
    for (let r = 0; r < rows; r++) {
      fragment.appendChild(createRow());
    }
    panel.appendChild(fragment);
    wrapper.appendChild(panel);

    return { panel };
  }

  function collectRows(panel) {
    return Array.from(panel.children);
  }

  function createAnimation(wrapper, rows, section, mode) {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: getScrollStart(wrapper, mode),
        end: getScrollEnd(wrapper, mode),
        scrub: defaultScrub,
        invalidateOnRefresh: true,
      },
    });

    const fromScale = mode === "cover" ? 0 : 1;
    const toScale = mode === "cover" ? 1 : 0;
    const origin = mode === "cover" ? "bottom center" : "top center";

    gsap.set(rows, {
      scaleY: fromScale,
      transformOrigin: origin,
    });

    tl.to(rows, {
      scaleY: toScale,
      duration: defaultShutterDuration,
      stagger: { each: defaultStaggerAmount, from: "end" },
      ease: "none",
    });

    return tl;
  }

  function setupInstance(wrapper) {
    const section =
      wrapper.closest("[data-shutter-scroll-section]") ||
      wrapper.closest("section") ||
      wrapper.parentElement;
    const rows = getRows(wrapper);
    const mode = getMode(wrapper);

    const { panel } = buildRows(wrapper, rows);
    const rowList = collectRows(panel);
    const tl = createAnimation(wrapper, rowList, section, mode);

    return { wrapper, tl };
  }

  function destroyInstance(instance) {
    if (instance.tl) {
      instance.tl.scrollTrigger?.kill();
      instance.tl.kill();
    }
    const panel = instance.wrapper.querySelector("[data-shutter-scroll-panel]");
    if (panel) panel.remove();
  }

  function buildAll(wrappers) {
    wrappers.forEach((wrapper) => {
      instances.push(setupInstance(wrapper));
    });
    ScrollTrigger.refresh();
  }

  function destroyAll() {
    instances.forEach(destroyInstance);
    instances.length = 0;
  }

  const wrappers = [...nextPage.querySelectorAll("[data-shutter-scroll-transition]")];
  if (!wrappers.length || !hasScrollTrigger) return;

  const mm = gsap.matchMedia();

  mm.add(
    {
      isDesktop: "(min-width: 992px)",
      isTablet: "(min-width: 768px) and (max-width: 991px)",
      isLandscape: "(min-width: 479px) and (max-width: 767px)",
      isMobile: "(max-width: 478px)",
      reduceMotion: "(prefers-reduced-motion: reduce)",
    },
    (context) => {
      if (context.conditions.reduceMotion) return;

      buildAll(wrappers);

      return () => {
        destroyAll();
      };
    }
  );

  registerPageCleanup(() => mm.revert());
}


/* ============================================================
   Problem grid — three columns released as the row arrives
   ============================================================
   The columns are held down by CSS until the row is properly in
   view; this only flips the status attribute that releases them,
   once, and then stops observing. Scoped to the Barba container
   and disconnected on leave.
   ============================================================ */
function initProblemGrid() {
  const grids = nextPage.querySelectorAll("[data-problem-grid-init]");
  if (!grids.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.setAttribute("data-problem-grid-status", "in");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.2 });

  grids.forEach((grid) => observer.observe(grid));
  registerPageCleanup(() => observer.disconnect());
}

/* ============================================================
   Accordion — one delegated handler, every instance on the page
   ============================================================
   The reference's logic is unchanged: a click on a toggle flips its
   item's data-accordion-status, and when the accordion carries
   data-accordion-close-siblings="true" every other open item in the
   same accordion is closed. The CSS does the expansion.

   Two adaptations. It is scoped to the Barba container and called
   from the page registry rather than DOMContentLoaded, so it binds
   on every navigation; the listeners sit on elements inside the
   container, so they are collected with it and need no cleanup.

   And the toggles are reachable from the keyboard. Replacing
   <details>/<summary> with a div would otherwise have dropped the
   keyboard and screen-reader behaviour the native element gave us
   for free, so the toggle carries role/tabindex/aria-expanded in the
   markup, Enter and Space activate it here, and aria-expanded is
   kept in step with the status attribute.
   ============================================================ */
function initAccordionCSS() {
  nextPage.querySelectorAll("[data-accordion-css-init]").forEach((accordion) => {
    const closeSiblings =
      accordion.getAttribute("data-accordion-close-siblings") === "true";

    function syncAria(item) {
      const toggle = item.querySelector("[data-accordion-toggle]");
      if (toggle) {
        toggle.setAttribute(
          "aria-expanded",
          item.getAttribute("data-accordion-status") === "active" ? "true" : "false"
        );
      }
    }

    function toggleItem(toggle) {
      const singleAccordion = toggle.closest("[data-accordion-status]");
      if (!singleAccordion) return;

      const isActive =
        singleAccordion.getAttribute("data-accordion-status") === "active";
      singleAccordion.setAttribute(
        "data-accordion-status",
        isActive ? "not-active" : "active"
      );
      syncAria(singleAccordion);

      if (closeSiblings && !isActive) {
        accordion
          .querySelectorAll('[data-accordion-status="active"]')
          .forEach((sibling) => {
            if (sibling !== singleAccordion) {
              sibling.setAttribute("data-accordion-status", "not-active");
              syncAria(sibling);
            }
          });
      }
    }

    accordion.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-accordion-toggle]");
      if (!toggle) return;
      toggleItem(toggle);
    });

    accordion.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
      const toggle = event.target.closest("[data-accordion-toggle]");
      if (!toggle) return;
      // Space would otherwise scroll the page out from under the answer.
      event.preventDefault();
      toggleItem(toggle);
    });
  });
}

/* ============================================================
   Interactive dots grid — canvas background behind the hero
   ============================================================
   The reference component as supplied, with the adaptations this
   codebase needs: it is scoped to the Barba container and called
   from the page registry rather than DOMContentLoaded, and every
   listener, observer and rAF it opens is handed to
   registerPageCleanup, so navigating away cannot leave a frame
   loop running against a canvas that has left the document.

   The pointer work is already gated behind (hover: hover) and
   (pointer: fine), so on touch the grid paints once per resize
   and never starts a loop.
   ============================================================ */
function initInteractiveDotsGrid() {
  const elements = nextPage.querySelectorAll("[data-dots-canvas-init]");
  if (!elements.length) return;

  const gap = "1em";
  const dotSize = "0.125em";
  const shape = "circle";
  const dotColorInactive = "rgba(0, 0, 0, 0.2)";
  const dotColorActive = "rgba(0, 0, 0, 0.75)";
  const dotMaxScale = 1.75;
  const pressScale = 1.5;
  const hoverRadius = 12;
  const easeDuration = 0.5;

  const hasPointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const pointer = { x: 0, y: 0, cx: 0, cy: 0, active: false };
  const hover = { value: 0, from: 0, to: 0, start: 0 };
  const press = { value: 0, from: 0, to: 0, start: 0 };
  const canvases = [];

  let dpr, size, spacing, radius, raf, lastTime = performance.now();

  function toPx(value, element) {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;width:" + value + ";";
    element.appendChild(probe);
    const px = probe.getBoundingClientRect().width;
    probe.remove();
    return px;
  }

  function parseColor(color, element) {
    const probe = document.createElement("span");
    probe.style.color = color;
    element.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = resolved;
    ctx.fillRect(0, 0, 1, 1);

    const data = [...ctx.getImageData(0, 0, 1, 1).data];
    data[3] /= 255;
    return data;
  }

  function mixColor(a, b, p) {
    return "rgba(" + a.map((v, i) => v + (b[i] - v) * p).join(",") + ")";
  }

  function setEase(state, to) {
    Object.assign(state, { from: state.value, to, start: performance.now() });
  }

  function updateEase(state, time) {
    if (!easeDuration) return (state.value = state.to);
    const p = Math.min(Math.max((time - state.start) / (easeDuration * 1000), 0), 1);
    state.value = state.from + (state.to - state.from) * (1 - Math.pow(1 - p, 4));
  }

  elements.forEach((element) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      pointerEvents: "none"
    });

    if (getComputedStyle(element).position === "static") element.style.position = "relative";

    element.prepend(canvas);
    canvases.push({
      element, canvas, ctx, width: 0, height: 0, visible: false,
      inactive: parseColor(element.getAttribute("data-dots-color-inactive") || dotColorInactive, element),
      active: parseColor(element.getAttribute("data-dots-color-active") || dotColorActive, element)
    });
  });

  function pointerInside() {
    return canvases.some(({ element }) => {
      const r = element.getBoundingClientRect();
      return pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
    });
  }

  function render(state, origin) {
    const rect = state.element.getBoundingClientRect();
    const left = rect.left - origin.left;
    const top = rect.top - origin.top;
    const px = pointer.cx - origin.left;
    const py = pointer.cy - origin.top;
    const maxScale = dotMaxScale * (1 + (pressScale - 1) * press.value);

    state.ctx.clearRect(0, 0, state.width, state.height);

    const colStart = Math.floor(left / spacing);
    const colEnd = Math.ceil((left + state.width) / spacing);
    const rowStart = Math.floor(top / spacing);
    const rowEnd = Math.ceil((top + state.height) / spacing);

    for (let row = rowStart; row <= rowEnd; row++) {
      const gy = row * spacing;
      const y = gy - top;

      for (let col = colStart; col <= colEnd; col++) {
        const gx = col * spacing;
        const x = gx - left;
        const influence = hasPointer && hover.value
          ? Math.max(0, 1 - Math.hypot(gx - px, gy - py) / radius) * hover.value
          : 0;
        const currentSize = size * (1 + (maxScale - 1) * influence);

        state.ctx.fillStyle = mixColor(state.inactive, state.active, influence);

        if (shape === "square") {
          state.ctx.fillRect(x - currentSize / 2, y - currentSize / 2, currentSize, currentSize);
        } else {
          state.ctx.beginPath();
          state.ctx.arc(x, y, currentSize / 2, 0, Math.PI * 2);
          state.ctx.fill();
        }
      }
    }
  }

  function renderAll(visibleOnly = false) {
    const origin = elements[0].getBoundingClientRect();
    canvases.forEach(state => (!visibleOnly || state.visible) && render(state, origin));
  }

  function tick(time) {
    raf = null;
    if (!canvases.some(state => state.visible)) return;

    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    updateEase(hover, time);
    updateEase(press, time);

    if (!easeDuration) {
      pointer.cx = pointer.x;
      pointer.cy = pointer.y;
    } else {
      const strength = 1 - Math.exp(-delta * 6 / easeDuration);
      pointer.cx += (pointer.x - pointer.cx) * strength;
      pointer.cy += (pointer.y - pointer.cy) * strength;
    }

    renderAll(true);
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (hasPointer && !raf && canvases.some(state => state.visible)) {
      lastTime = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    size = toPx(dotSize, elements[0]);
    spacing = size + toPx(gap, elements[0]);
    radius = spacing * hoverRadius;

    canvases.forEach(state => {
      const rect = state.element.getBoundingClientRect();
      state.width = rect.width;
      state.height = rect.height;
      state.canvas.width = Math.round(rect.width * dpr);
      state.canvas.height = Math.round(rect.height * dpr);
      state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });

    renderAll();
    start();
  }

  const onPointerMove = (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;

    const inside = pointerInside();

    if (inside !== pointer.active) {
      pointer.active = inside;
      setEase(hover, +inside);

      if (inside) {
        pointer.cx = pointer.x;
        pointer.cy = pointer.y;
      } else {
        setEase(press, 0);
      }
    }

    start();
  };
  const onPointerDown = () => pointer.active && setEase(press, 1);
  const onPointerUp = () => setEase(press, 0);

  if (hasPointer) {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
  }

  const intersectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const state = canvases.find(state => state.element === entry.target);
      if (state) state.visible = entry.isIntersecting;
    });

    hasPointer ? start() : renderAll(true);
  });

  const resizeObserver = new ResizeObserver(resize);

  elements.forEach(element => {
    intersectionObserver.observe(element);
    resizeObserver.observe(element);
  });

  window.addEventListener("resize", resize);
  resize();

  // The page registry runs this while the transition panel still covers the
  // viewport and the container is mid-flight, so the first measurement can
  // land before the hero has its real size — leaving the canvas backing
  // store at whatever it read then, since the observer has nothing new to
  // report once the element settles at a size it was already given. Take one
  // more measurement on the far side of the next paint.
  requestAnimationFrame(() => requestAnimationFrame(resize));

  registerPageCleanup(() => {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    intersectionObserver.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    canvases.forEach(state => state.canvas.remove());
  });
}



/* ============================================================
   FOOTER PARALLAX
   ------------------------------------------------------------
   The footer sits in a clipping wrap and is revealed at a
   different rate to the page above it: the panel starts a
   quarter of its own height high inside the wrap and is scrubbed
   down to rest as the wrap travels from the bottom of the
   viewport to the top of it. A black scrim over the panel clears
   off on the same scrub, so the footer lifts out of shadow
   rather than simply sliding in.

   clamp() on the ScrollTrigger bounds keeps the reveal honest on
   a page short enough that the footer is already on screen at
   load — the start is pinned to the current scroll position
   instead of a point above it, so the panel is never caught
   mid-animation with nowhere left to scroll.
   ============================================================ */
function initFooterParallax() {
  if (!hasScrollTrigger) return;

  const wraps = nextPage.querySelectorAll("[data-footer-parallax]");
  if (!wraps.length) return;

  const timelines = [];

  wraps.forEach(wrap => {
    const inner = wrap.querySelector("[data-footer-parallax-inner]");
    const scrim = wrap.querySelector("[data-footer-parallax-dark]");
    if (!inner && !scrim) return;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: wrap,
        start: "clamp(top bottom)",
        end: "clamp(top top)",
        scrub: true
      }
    });

    if (inner) tl.from(inner, { yPercent: -25, ease: "none" });
    if (scrim) tl.from(scrim, { opacity: 0.5, ease: "none" }, "<");

    timelines.push(tl);
  });

  registerPageCleanup(() => {
    timelines.forEach(tl => {
      if (tl.scrollTrigger) tl.scrollTrigger.kill();
      tl.kill();
    });
  });
}
