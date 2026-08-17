# ADDD — website

Static implementation of the ADDD website from the Figma design.
No build tooling and no install step.

> **Serve it over HTTP.** Page transitions use Barba, which fetches the next
> page with `fetch()`. Browsers block that on `file://`, so opening the HTML
> directly still navigates but falls back to a full page reload with no
> transition. Any static server works — GitHub Pages, VS Code Live Server,
> `npx serve`, etc.

## Pages

| File | Source design |
|---|---|
| `index.html` | Home |
| `workshops-audits.html` | Workshops & Audits |
| `technology-blueprint.html` | Technology Blueprint |
| `advisory.html` | Advisory (ADDDvisory) |
| `reports.html` | Reports index |
| `report-template.html` | Report template — "The ultimate BIM 2.0 report" |
| `newsletter.html` | Newsletter index |
| `newsletter-template.html` | Newsletter template — "AI in architecture" |
| `about.html` | About |
| `contact.html` | Contact |

External destinations (`Software Database`, `AEC Jobs`) point at placeholder URLs
and are not internal pages.

## Structure

```
partials/     head, transition, nav, footer, script tags — shared by every page
pages/        *.body.html — the unique <main> of each page
assets/       css + site.js + logo.svg + icons/ images/ logos/
build.sh      assembles partials + bodies into the flat .html files at the root
```

Each built page has this shape, which is what Barba needs:

```html
<body data-barba="wrapper">
  <div data-transition-wrap>…</div>   <!-- wipe panel, outside the container -->
  <nav class="mega-nav">…</nav>       <!-- persistent, outside the container -->
  <div data-barba="container" data-page-name="Home">
    <main>…</main>
    <footer>…</footer>                <!-- inside, so it animates with the page -->
  </div>
</body>
```

The nav sits outside the container so it survives navigation — its GSAP
timelines and the Contact button's width measurement are wired up once per
session rather than per page. Anything inside the container is replaced on
every navigation, so page-level behaviour must be re-bound in
`initBeforeEnterFunctions()` in `assets/site.js`. `data-page-name` is what the
wipe panel displays mid-transition.

The root `.html` files are generated output and **are** committed, so the site can
be served straight from the repository with no build step.

## Editing

Change a partial or a `pages/*.body.html`, then regenerate:

```bash
bash build.sh
```

Never edit the root `.html` files directly — `build.sh` overwrites them.

## Notes

- **Fonts** — headings use BDO Grotesk, which is licensed and not included. The font
  stack requests it first and falls back to Inter Tight (Google Fonts). Drop in the
  webfont files and add an `@font-face` rule to use the real face.
- **Imagery** — every image slot uses `assets/images/allister-presenting.jpg`,
  applied as a `background-image` in `assets/media.css`. One rule covers all of
  them, so giving a slot its own artwork means overriding `background-image` on
  that selector only. Proportions come from the Figma design and are unchanged.
- **Logos** — client logos live in `assets/logos/` (ADAM, OBMI, Studio Seiler) and
  appear in the homepage logo strip, the case-study tab row and the research
  cards. The ADDD brand mark is a separate vector, `assets/logo.svg`.
- **Page transitions** — [Barba](https://barba.js.org/) 2.10.3. A panel wipes up
  over the page, shows the incoming page's name, then continues up to reveal it.
  Honours `prefers-reduced-motion` with an immediate swap.
- **Smooth scroll** — [Lenis](https://github.com/darkroomengineering/lenis) 1.2.3,
  driven by the GSAP ticker rather than `autoRaf`, so the transition can stop and
  restart it around a navigation.
- **Navigation** — mega nav with directional hover dropdowns, mobile slide-over
  panels and an animated burger, built on GSAP 3.15 via CDN.
