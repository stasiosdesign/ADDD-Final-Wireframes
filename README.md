# ADDD — website

Static implementation of the ADDD website from the Figma design.
No build tooling, no dependencies — open `index.html` in a browser.

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
partials/     head, nav, footer, script tags — shared by every page
pages/        *.body.html — the unique <main> of each page
assets/       styles.css, pages.css, nav.css, site.js, logo.svg, icons/
build.sh      assembles partials + bodies into the flat .html files at the root
```

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
- **Imagery** — all photography and video is a black placeholder at the exact
  proportions from the design. The ADDD logo is a real vector (`assets/logo.svg`).
- **Smooth scroll** — [Lenis](https://github.com/darkroomengineering/lenis) 1.2.3 via CDN.
- **Navigation** — mega nav with directional hover dropdowns, mobile slide-over
  panels and an animated burger, built on GSAP 3.15 via CDN.
