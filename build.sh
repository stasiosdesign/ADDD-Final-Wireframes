#!/usr/bin/env bash
# Assembles every page from partials/ + pages/*.body.html into flat HTML at the root.
# Run:  bash build.sh
set -e
cd "$(dirname "$0")"

build () {
  slug="$1"; title="$2"
  {
    esc_title=$(printf '%s' "$title" | sed 's/[&|\\]/\\&/g')
    sed "s|{{TITLE}}|$esc_title|" partials/head.html
    cat partials/nav.html
    cat "pages/$slug.body.html"
    cat partials/footer.html
    cat partials/scripts.html
  } > "$slug.html"
  echo "built $slug.html"
}

build index               "ADDD &mdash; Technology strategy for architecture practices"
build workshops-audits    "Workshops &amp; Audits &mdash; ADDD"
build technology-blueprint "Technology Blueprint &mdash; ADDD"
build advisory            "Advisory &mdash; ADDD"
build reports             "Reports &mdash; ADDD"
build report-template     "The ultimate BIM 2.0 report &mdash; ADDD"
build newsletter          "Newsletter &mdash; ADDD"
build newsletter-template "AI in architecture &mdash; ADDD"
build about               "About &mdash; ADDD"
build contact             "Contact &mdash; ADDD"
