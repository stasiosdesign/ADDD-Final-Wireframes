/* ============================================================
   Marquee with Scroll Direction (GSAP + ScrollTrigger)
   Reusable for any continuously-scrolling logo strip. Markup:
     [data-marquee-scroll-direction-target]  (root, data-marquee-* config)
       [data-marquee-scroll-target]            (scroll wrapper)
         [data-marquee-collection-target]      (one set of items, duplicated)
   ============================================================ */

let marqueeInstances = [];

/* Every tween and ScrollTrigger this module creates is tracked, so leaving
   the page tears down exactly what it built and nothing else. Without this
   the scrub timelines outlive their markup and the next visit inherits a
   marquee stuck at whatever offset and timeScale the dead triggers left. */
function destroyMarqueeScrollDirection() {
  marqueeInstances.forEach(({ animation, directionTrigger, scrubTimeline }) => {
    animation.kill();
    directionTrigger.kill();
    if (scrubTimeline.scrollTrigger) scrubTimeline.scrollTrigger.kill();
    scrubTimeline.kill();
  });
  marqueeInstances = [];
}

function initMarqueeScrollDirection(root) {
  destroyMarqueeScrollDirection();

  (root || document).querySelectorAll('[data-marquee-scroll-direction-target]').forEach((marquee) => {
    const marqueeScroll = marquee.querySelector('[data-marquee-scroll-target]');
    if (!marqueeScroll) return;

    // Re-running this on repeat (e.g. re-entering the page) must not pile
    // duplicate collections on top of ones a previous run already added.
    const existingCollections = marquee.querySelectorAll('[data-marquee-collection-target]');
    existingCollections.forEach((el, i) => { if (i > 0) el.remove(); });

    const marqueeContent = marquee.querySelector('[data-marquee-collection-target]');
    if (!marqueeContent) return;
    gsap.set(marqueeContent, { xPercent: 0 });

    const {
      marqueeSpeed: speed,
      marqueeDirection: direction,
      marqueeDuplicate: duplicate,
      marqueeScrollSpeed: scrollSpeed
    } = marquee.dataset;

    const marqueeSpeedAttr = parseFloat(speed);
    const marqueeDirectionAttr = direction === 'right' ? 1 : -1;
    const duplicateAmount = parseInt(duplicate || 0);
    const scrollSpeedAttr = parseFloat(scrollSpeed);
    const speedMultiplier =
      window.innerWidth < 479 ? 0.25 :
      window.innerWidth < 991 ? 0.5 : 1;

    let marqueeSpeed =
      marqueeSpeedAttr *
      (marqueeContent.offsetWidth / window.innerWidth) *
      speedMultiplier;

    marqueeScroll.style.marginLeft = `${scrollSpeedAttr * -1}%`;
    marqueeScroll.style.width = `${(scrollSpeedAttr * 2) + 100}%`;

    if (duplicateAmount > 0) {
      const fragment = document.createDocumentFragment();

      for (let i = 0; i < duplicateAmount; i++) {
        fragment.appendChild(marqueeContent.cloneNode(true));
      }

      marqueeScroll.appendChild(fragment);
    }

    const marqueeItems = marquee.querySelectorAll(
      '[data-marquee-collection-target]'
    );

    const animation = gsap.fromTo(marqueeItems, { xPercent: 0 }, {
      xPercent: -100,
      repeat: -1,
      duration: marqueeSpeed,
      ease: 'linear',
      // Infinite repeats extend forward only; replenish the reverse timeline
      // by whole cycles so reversing never stops at time zero or changes phase.
      onReverseComplete() {
        this.totalTime(this.rawTime() + this.duration() * 100);
      }
    }).totalTime(marqueeSpeed * 100.5);

    animation.timeScale(-marqueeDirectionAttr);
    animation.play();

    marquee.setAttribute('data-marquee-status', 'normal');

    const directionTrigger = ScrollTrigger.create({
      trigger: marquee,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        const isInverted = self.direction === 1;
        const currentDirection = isInverted
          ? -marqueeDirectionAttr
          : marqueeDirectionAttr;

        animation.timeScale(currentDirection);
        marquee.setAttribute(
          'data-marquee-status',
          isInverted ? 'normal' : 'inverted'
        );
      }
    });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: marquee,
        start: '0% 100%',
        end: '100% 0%',
        scrub: 0.5
      }
    });

    const scrollStart =
      marqueeDirectionAttr === -1
        ? scrollSpeedAttr
        : -scrollSpeedAttr;

    const scrollEnd = -scrollStart;

    tl.fromTo(
      marqueeScroll,
      { x: `${scrollStart}vw` },
      { x: `${scrollEnd}vw`, ease: 'none' }
    );

    marqueeInstances.push({ animation, directionTrigger, scrubTimeline: tl });
  });
}
