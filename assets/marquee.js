/* ============================================================
   Marquee with Scroll Direction (GSAP + ScrollTrigger)
   Reusable for any continuously-scrolling logo strip. Markup:
     [data-marquee-scroll-direction-target]  (root, data-marquee-* config)
       [data-marquee-scroll-target]            (scroll wrapper)
         [data-marquee-collection-target]      (one set of items, duplicated)
   ============================================================ */

let marqueeAnimations = [];

function initMarqueeScrollDirection(root) {
  marqueeAnimations.forEach(anim => anim.kill());
  marqueeAnimations = [];

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

    const animation = gsap.to(marqueeItems, {
      xPercent: -100,
      repeat: -1,
      duration: marqueeSpeed,
      ease: 'linear'
    }).totalProgress(0.5);

    gsap.set(marqueeItems, {
      xPercent: marqueeDirectionAttr === 1 ? 100 : -100
    });

    animation.timeScale(marqueeDirectionAttr);
    animation.play();

    marquee.setAttribute('data-marquee-status', 'normal');

    marqueeAnimations.push(animation);

    ScrollTrigger.create({
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
        scrub: 0
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
  });
}
