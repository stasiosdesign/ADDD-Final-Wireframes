#!/usr/bin/env bash
# Assembles every page from partials/ + pages/*.body.html into flat HTML at the root.
# Run:  bash build.sh
#
# Page shape (Barba):
#   body[data-barba="wrapper"]
#     .transition            — the wipe panel, outside the container
#     nav.mega-nav           — persistent, outside the container
#     div[data-barba="container"][data-page-name]
#       main                 — the page body
#       footer               — swapped with the page so it animates with it
set -e

# Cache-buster for the local stylesheet and script URLs. Browsers hold on to
# assets/*.css and assets/*.js hard, so every build stamps them and a reload
# always picks up the build it was served with.
STAMP=$(date +%Y%m%d%H%M%S)
cd "$(dirname "$0")"

build () {
  slug="$1"; title="$2"; page_name="$3"
  esc_title=$(printf '%s' "$title" | sed 's/[&|\\]/\\&/g')
  {
    sed -e "s|{{TITLE}}|$esc_title|" -e "s|{{BUILD}}|$STAMP|" partials/head.html
    cat partials/loader.html
    cat partials/transition.html
    cat partials/nav.html
    printf '<div data-barba="container" data-page-name="%s">\n' "$page_name"
    cat "pages/$slug.body.html"
    cat partials/footer.html
    printf '</div>\n'
    cat partials/scripts.html
  } | sed -E "s#(assets/[A-Za-z0-9_-]+\.(css|js))\"#\1?v=$STAMP\"#g" > "$slug.html"
  echo "built $slug.html"
}

#     slug                       <title>                                          data-page-name
build index                     "ADDD &mdash; Technology strategy for architecture practices" "Home"
build workshops-audits          "Workshops &amp; Audits &mdash; ADDD"            "Workshops &amp; Audits"
build technology-blueprint      "Technology Blueprint &mdash; ADDD"              "Technology Blueprint"
build advisory                  "Advisory &mdash; ADDD"                          "Advisory"
build stack-diagnostic          "Stack Diagnostic &mdash; ADDD"                  "Stack Diagnostic"
build software-licensing-audit  "Software &amp; Licensing Audit &mdash; ADDD"    "Software &amp; Licensing Audit"
build reports                   "Reports &mdash; ADDD"                           "Reports"
build report-template           "The ultimate BIM 2.0 report &mdash; ADDD"       "BIM 2.0 Report"
build newsletter                "Newsletter &mdash; ADDD"                        "Newsletter"
build newsletter-template       "AI in architecture &mdash; ADDD"                "AI in Architecture"
build about                     "About &mdash; ADDD"                             "About"
build contact                   "Contact &mdash; ADDD"                           "Contact"
