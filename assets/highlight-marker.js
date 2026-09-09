/* Highlight Marker Text Reveal — SplitText lines with a layered pixel wipe.
   Keep real text in the DOM; canvas only paints the two temporary cover layers. */
function initHighlightMarkerTextReveal(root) {
  if (reducedMotion || !hasSplitText) return;
  const ease = CustomEase.create("marker-wipe", "0.85, 0, 0.15, 1");
  const duration = 0.532, offset = 0.105, hold = 0.035;
  const reveal = offset + duration + hold;
  const end = reveal + offset + duration;

  root.querySelectorAll("[data-highlight-marker-reveal]").forEach((el) => {
    if (el._highlightMarkerReveal) return;
    let timeline, split, observer, active = false, started = false;
    const theme = el.dataset.markerTheme || "--c-red";
    const color = theme.startsWith("--")
      ? getComputedStyle(el).getPropertyValue(theme).trim()
      : ({ pink: "#C700EF", white: "#FFFFFF" }[theme] || theme);
    const parsedStagger = Number(el.dataset.markerStagger ?? 100);
    const stagger = Number.isFinite(parsedStagger) ? Math.max(0, parsedStagger) / 1000 : 0.1;

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
          const canvas = document.createElement("canvas");
          canvas.className = "highlight-marker-bar";
          canvas.setAttribute("aria-hidden", "true");
          wrap.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          if (!ctx) { canvas.remove(); return; }

          const bounds = canvas.getBoundingClientRect();
          const width = Math.ceil(bounds.width), height = Math.ceil(bounds.height);
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);
          const cell = Math.max(3, Math.min(7, parseFloat(getComputedStyle(el).fontSize) / 8));
          const band = Math.min(52, width * 0.2);
          const ink = getComputedStyle(text).color;
          const state = { time: 0 };
          const segment = (t, start) => ease(Math.max(0, Math.min(1, (t - start) / duration)));

          // Stable cell thresholds keep the frayed edge textured without
          // random frame-to-frame flashes or a second animation loop.
          function edge(x, direction, seed, time) {
            for (let col = Math.floor((x - band) / cell); col <= Math.ceil((x + band) / cell); col++) {
              const cx = (col + 0.5) * cell;
              if (cx < 0 || cx > width) continue;
              for (let row = 0; row * cell < height; row++) {
                const noise = Math.sin(col * 127.1 + row * 311.7 + seed) * 43758.5453;
                const threshold = noise - Math.floor(noise);
                const shimmer = Math.sin(time * 24 + col + row * 2) * 0.17;
                if (direction * (cx - x) / band * 0.5 + 0.5 + shimmer > threshold) {
                  ctx.fillRect(col * cell, row * cell, cell + 0.8, cell + 0.8);
                }
              }
            }
          }
          function bar(position, fill, seed, time) {
            const left = position * width, right = left + width;
            ctx.fillStyle = fill;
            const from = Math.max(0, left + band), to = Math.min(width, right - band);
            if (to > from) ctx.fillRect(from, 0, to - from, height);
            edge(left, 1, seed, time);
            edge(right, -1, seed, time);
          }
          function draw() {
            const t = state.time;
            ctx.clearRect(0, 0, width, height);
            text.style.opacity = t >= reveal ? "1" : "0";
            // GSAP rounds numeric tween values; tolerate that rounding at rest.
            if (t <= 0 || t >= end - 0.000001) return;
            ctx.save();
            if (el.dataset.markerDirection === "left") {
              ctx.translate(width, 0);
              ctx.scale(-1, 1);
            }
            bar(segment(t, 0) - 1 + segment(t, reveal + offset), color, 0, t);
            bar(segment(t, offset) - 1 + segment(t, reveal), ink, 91, t);
            ctx.restore();
          }
          draw();
          const order = el.dataset.markerStaggerStart === "end" ? self.lines.length - 1 - index : index;
          timeline.to(state, { time: end, duration: end, ease: "none", onUpdate: draw }, order * stagger);
        });
        // Font/viewport reflows must not hide text that is already being read.
        if (started) timeline.progress(1);
      }
    });

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.35) play();
          else if (!entry.isIntersecting) {
            started = false;
            timeline?.pause(0);
          }
        });
      }, { threshold: [0, 0.35], rootMargin: "0px 0px -8% 0px" });
    }
    rmMQ.addEventListener("change", onMotionChange);
    registerPageCleanup(cleanup);
  });
}
