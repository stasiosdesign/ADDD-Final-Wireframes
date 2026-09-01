// -----------------------------------------
// OSMO PAGE TRANSITION BOILERPLATE
// -----------------------------------------

gsap.registerPlugin(CustomEase, ScrollTrigger);

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
  if (has('[data-step-timeline-init]')) initStepTimeline();
  if (has('[data-sticky-steps-init]')) initStickySteps();
  if (has('[data-stacking-cards-init]')) initStackingCards();
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

function resetPage(container) {
  resetScroll();
  gsap.set(container, { clearProps: "position,top,left,right" });

  if (hasLenis) {
    lenis.resize();
    lenis.start();
  }
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
   Step timeline — vertical progress line scrubbed by ScrollTrigger
   ============================================================
   The reference implementation's measuring, indexing and matchMedia
   logic is kept as shipped; three things are adapted so it lives in
   this codebase rather than beside it:

     - it is queried against the Barba container, not document, and
       is called from the page registry instead of DOMContentLoaded,
       so it rebinds on every navigation to the homepage;
     - the matchMedia context is reverted through registerPageCleanup,
       which kills its ScrollTriggers with it — otherwise the trigger
       would outlive the DOM it measured;
     - its own ScrollTrigger.refresh() and window load listener are
       dropped. beforeEnter already refreshes once, after every page
       init, while the transition panel still covers the viewport.
   ============================================================ */
function initStepTimeline() {
  const root = nextPage.querySelector("[data-step-timeline-init]");
  if (!root) return;

  const line = root.querySelector("[data-step-timeline-line]");
  const fill = root.querySelector("[data-step-timeline-fill]");
  const items = Array.from(root.querySelectorAll("[data-step-timeline-item]"));
  if (!line || !fill || !items.length) return;

  const anchors = items.map(
    (item) => item.querySelector("[data-step-timeline-marker]") || item
  );

  const activationInput = parseFloat(root.dataset.stepTimelineActivation);
  const activation = Number.isNaN(activationInput)
    ? 0.5
    : Math.min(Math.max(activationInput, 0), 1);
  const activationPercent = activation * 100;
  const lastIndex = items.length - 1;

  let anchorFractions = [0];

  function measureLine() {
    if (items.length < 2) {
      line.style.height = "0px";
      anchorFractions = [0];
      return;
    }
    const base = line.parentElement.getBoundingClientRect().top;
    const centers = anchors.map((anchor) => {
      const box = anchor.getBoundingClientRect();
      return box.top + box.height / 2 - base;
    });
    const firstCenter = centers[0];
    const span = centers[lastIndex] - firstCenter;
    line.style.top = firstCenter + "px";
    line.style.height = span + "px";
    anchorFractions = centers.map((center) =>
      span > 0 ? (center - firstCenter) / span : 0
    );
  }

  let currentIndex = -2;

  function setCurrentIndex(index) {
    if (index === currentIndex) return;
    currentIndex = index;
    items.forEach((item, i) => {
      const status = index >= 0 && i <= index ? "active" : "inactive";
      if (item.getAttribute("data-status") !== status) {
        item.setAttribute("data-status", status);
      }
      item.toggleAttribute("data-current", i === index);
      item.toggleAttribute("data-previous", i === index - 1);
      item.toggleAttribute("data-next", i === index + 1);
    });
  }

  function indexForProgress(reached, progress) {
    if (!reached) return -1;
    let index = 0;
    for (let i = 0; i < anchorFractions.length; i++) {
      if (progress + 0.0001 >= anchorFractions[i]) index = i;
    }
    return index;
  }

  function updateFromScroll(self) {
    const reached = self.isActive || self.progress >= 1;
    setCurrentIndex(indexForProgress(reached, self.progress));
  }

  setCurrentIndex(-1);
  gsap.set(fill, { transformOrigin: "top", scaleY: 0 });

  const mediaQueries = gsap.matchMedia();

  mediaQueries.add("(prefers-reduced-motion: no-preference)", () => {
    measureLine();
    ScrollTrigger.addEventListener("refreshInit", measureLine);

    if (items.length > 1) {
      gsap.fromTo(
        fill,
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          scrollTrigger: {
            trigger: line,
            start: "top " + activationPercent + "%",
            end: "bottom " + activationPercent + "%",
            scrub: true,
            onUpdate: updateFromScroll,
            onToggle: updateFromScroll,
            onRefresh: updateFromScroll,
          },
        }
      );
    } else {
      setCurrentIndex(0);
    }

    return () => {
      ScrollTrigger.removeEventListener("refreshInit", measureLine);
    };
  });

  // No scrubbing without motion: the line is drawn in full and every
  // step reads as done, so the copy is never left at 25% opacity.
  mediaQueries.add("(prefers-reduced-motion: reduce)", () => {
    measureLine();
    gsap.set(fill, { scaleY: 1 });
    setCurrentIndex(lastIndex);
  });

  registerPageCleanup(() => mediaQueries.revert());
}

/* ============================================================
   Sticky steps — square media pinned beside the scrolling copy
   ============================================================
   The reference's status logic is unchanged: whichever anchor sits
   closest to the middle of the viewport is "active", everything
   above it "before", everything below "after"; the CSS does the
   rest. Adapted for this codebase, it is scoped to the Barba
   container, called from the page registry rather than
   DOMContentLoaded, and its listeners are unbound on leave.

   Lenis drives ScrollTrigger, so the update is hung off
   ScrollTrigger rather than a raw scroll listener — otherwise the
   two would be reading the page on different frames.
   ============================================================ */
function initStickySteps() {
  const containers = nextPage.querySelectorAll("[data-sticky-steps-init]");
  if (!containers.length) return;

  containers.forEach((container) => {
    const items = [...container.querySelectorAll("[data-sticky-steps-item]")];
    if (!items.length) return;

    function updateSteps() {
      const viewportCenter = window.innerHeight / 2;

      let closestIndex = 0;
      let closestDistance = Infinity;

      items.forEach((item, index) => {
        const anchor = item.querySelector("[data-sticky-steps-anchor]");
        if (!anchor) return;

        const rect = anchor.getBoundingClientRect();
        const anchorCenter = rect.top + rect.height / 2;
        const distance = Math.abs(viewportCenter - anchorCenter);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      items.forEach((item, index) => {
        let status = "active";

        if (index < closestIndex) status = "before";
        if (index > closestIndex) status = "after";

        item.setAttribute("data-sticky-steps-item-status", status);
      });
    }

    if (hasScrollTrigger) {
      const trigger = ScrollTrigger.create({
        trigger: container,
        start: "top bottom",
        end: "bottom top",
        onUpdate: updateSteps,
        onRefresh: updateSteps,
      });
      registerPageCleanup(() => trigger.kill());
    } else {
      window.addEventListener("scroll", updateSteps, { passive: true });
      registerPageCleanup(() => window.removeEventListener("scroll", updateSteps));
    }

    window.addEventListener("resize", updateSteps);
    registerPageCleanup(() => window.removeEventListener("resize", updateSteps));

    requestAnimationFrame(updateSteps);
  });
}

/* ============================================================
   Stacking cards — sticky stack, no bounce
   ============================================================
   The reference's structure, breakpoint tiers and per-tier offset
   attributes are kept. What is removed is the bounce: the pulse
   helper and the ScrollTrigger that fired it are gone entirely, so
   nothing squashes, springs or overshoots. The remaining motion is
   the scrubbed settle into the stack, and its ease drops from
   power1.in to none so the cards track the scroll exactly instead
   of accelerating into place.

   Scoped to the Barba container and unbound on leave; ScrollTrigger
   is already registered and refreshed by the page lifecycle.
   ============================================================ */
function getViewportTier() {
  const width = window.innerWidth;
  if (width <= 479) return "mobile-portrait";
  if (width <= 767) return "mobile-landscape";
  if (width <= 991) return "tablet";
  return "desktop";
}

function initStackingCards() {
  const sections = nextPage.querySelectorAll("[data-stacking-cards-init]");
  if (!sections.length) return;

  const triggers = [];
  const targets = [];

  function parseRotateValues(section, attr) {
    const fallback = [0, 4, -4];
    const values = (section.getAttribute(attr) || "")
      .split(",")
      .map((val) => parseFloat(val.trim()));
    return values.length >= 1 && values.every((v) => !isNaN(v)) ? values : fallback;
  }

  function parseAxisValues(section, attr) {
    const raw = section.getAttribute(attr);
    if (!raw) return ["0em", "0em", "0em"];
    const values = raw.split(",").map((val) => val.trim()).filter((val) => val !== "");
    return values.length ? values : ["0em", "0em", "0em"];
  }

  function build() {
    const tier = getViewportTier();
    const suffix =
      tier === "desktop" ? "desktop" : tier === "tablet" ? "tablet" : "mobile";

    sections.forEach((section) => {
      const isEnabled = section.dataset["stackingCards" + suffix[0].toUpperCase() + suffix.slice(1)] === "true";
      if (!isEnabled) return;

      const cards = Array.from(section.querySelectorAll("[data-stacking-card]"));
      if (!cards.length) return;

      const stickyTop = parseFloat(getComputedStyle(cards[0]).top) || 0;
      const rotateValues = parseRotateValues(section, `data-stacking-cards-${suffix}-rotate`);
      const xValues = parseAxisValues(section, `data-stacking-cards-${suffix}-x`);
      const yValues = parseAxisValues(section, `data-stacking-cards-${suffix}-y`);

      cards.forEach((card, index) => {
        const targetEl = card.querySelector("[data-stacking-card-target]");
        if (!targetEl) return;

        targets.push(targetEl);

        gsap.set(targetEl, {
          rotate: 0,
          x: 0,
          y: 0,
          scale: 1,
          zIndex: cards.length - index,
        });

        const tween = gsap.to(targetEl, {
          rotate: rotateValues[index % rotateValues.length],
          x: xValues[index % xValues.length],
          y: yValues[index % yValues.length],
          ease: "none",
          overwrite: "auto",
          scrollTrigger: {
            trigger: card,
            start: "top 75%",
            end: `top-=${stickyTop} top`,
            scrub: true,
          },
        });

        if (tween.scrollTrigger) triggers.push(tween.scrollTrigger);
      });
    });
  }

  function teardown() {
    triggers.splice(0).forEach((t) => t.kill());
    targets.splice(0).forEach((el) => {
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: "all" });
    });
  }

  build();

  // Only a tier change matters — a plain resize leaves the offsets alone.
  let lastTier = getViewportTier();
  const onResize = () => {
    const next = getViewportTier();
    if (next === lastTier) return;
    lastTier = next;
    teardown();
    build();
    ScrollTrigger.refresh();
  };

  window.addEventListener("resize", onResize);
  registerPageCleanup(() => {
    window.removeEventListener("resize", onResize);
    teardown();
  });
}
