/* Highlight Marker Text Reveal: layered strips fan from left to right over text.
   SplitText and the page lifecycle keep wrapping, replay and cleanup consistent. */
function initHighlightMarkerTextReveal(root) {
  if (reducedMotion || !hasSplitText) return;
  const coverDuration = 0.18, revealDuration = 0.2, layerOffset = 0.04;
  const rowStagger = 0.012;

  root.querySelectorAll("[data-highlight-marker-reveal]").forEach((el) => {
    if (el._highlightMarkerReveal) return;
    let timeline, split, observer, active = false, started = false;
    const theme = el.dataset.markerTheme || "--c-red";
    const color = theme.startsWith("--")
      ? getComputedStyle(el).getPropertyValue(theme).trim()
      : ({ pink: "#C700EF", white: "#FFFFFF" }[theme] || theme);
    const parsedStagger = Number(el.dataset.markerStagger ?? 40);
    const stagger = Number.isFinite(parsedStagger) ? Math.max(0, parsedStagger) / 1000 : 0.04;

    function cleanup() {
      observer?.disconnect();
      timeline?.kill();
      split?.revert();
      rmMQ.removeEventListener("change", onMotionChange);
      delete el._highlightMarkerReveal;
    }
    function onMotionChange(event) {
      if (event.matches) cleanup();
    }
    function play() {
      if (!active || started) return;
      started = true;
      timeline?.restart();
    }

    el._highlightMarkerReveal = {
      activate() {
        if (active) return;
        active = true;
        if (observer) observer.observe(el);
        else play();
      }
    };

    split = SplitText.create(el, {
      type: "lines",
      linesClass: "highlight-marker-line",
      autoSplit: true,
      onSplit(self) {
        timeline?.kill();
        timeline = gsap.timeline({ paused: true });
        self.lines.forEach((line, index) => {
          const wrap = document.createElement("span");
          wrap.className = "highlight-marker-wrap";
          const text = document.createElement("span");
          text.className = "highlight-marker-text";
          while (line.firstChild) text.appendChild(line.firstChild);
          wrap.appendChild(text);
          line.appendChild(wrap);
          const rowCount = window.matchMedia("(max-width: 478px)").matches ? 3 : 4;
          function createLayer(fill) {
            const layer = document.createElement("span");
            layer.className = "highlight-marker-bar";
            layer.setAttribute("aria-hidden", "true");
            layer.style.gridTemplateRows = `repeat(${rowCount}, 1fr)`;
            for (let i = 0; i < rowCount; i++) {
              const row = document.createElement("span");
              row.className = "highlight-marker-row";
              row.style.backgroundColor = fill;
              layer.appendChild(row);
            }
            wrap.appendChild(layer);
            return Array.from(layer.children);
          }
          const accentRows = createLayer(color);
          const inkRows = createLayer(getComputedStyle(text).color);
          const rows = [...accentRows, ...inkRows];
          const order = el.dataset.markerStaggerStart === "end" ? self.lines.length - 1 - index : index;
          const start = order * stagger;
          const reveal = start + coverDuration + layerOffset + (rowCount - 1) * rowStagger + 0.015;
          const fan = { each: rowStagger, from: "end" };

          gsap.set(text, { opacity: 0 });
          // Stagger the horizontal strips to fan the moving edge. Both cover
          // and reveal travel left to right; the text itself stays stationary.
          gsap.set(rows, { scaleX: 0, transformOrigin: "left center" });
          timeline.to(accentRows, { scaleX: 1, duration: coverDuration, stagger: fan, ease: "power2.inOut" }, start);
          timeline.to(inkRows, { scaleX: 1, duration: coverDuration, stagger: fan, ease: "power2.inOut" }, start + layerOffset);
          // Text becomes visible only once both layers completely cover it.
          timeline.set(text, { opacity: 1 }, reveal);
          timeline.set(rows, { transformOrigin: "right center" }, reveal);
          timeline.to(inkRows, { scaleX: 0, duration: revealDuration, stagger: fan, ease: "power2.inOut" }, reveal);
          timeline.to(accentRows, { scaleX: 0, duration: revealDuration, stagger: fan, ease: "power2.inOut" }, reveal + layerOffset);
        });
        // Font/viewport reflows must not hide text that is already being read.
        if (started) timeline.progress(1);
      }
    });

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.15) play();
          else if (!entry.isIntersecting) {
            started = false;
            timeline?.pause(0);
          }
        });
      }, { threshold: [0, 0.15] });
    }
    rmMQ.addEventListener("change", onMotionChange);
    registerPageCleanup(cleanup);
  });
}
