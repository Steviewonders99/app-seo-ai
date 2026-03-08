# HTML Page Generator Prompt - Design Document

**Goal:** Create a universal master prompt that generates pixel-perfect, standalone HTML reference pages from BeauTech content markdown files, using the homepage reference HTML as the design system source of truth.

**Architecture:** A single prompt file instructs Claude Code to read the homepage HTML + target .md file, extract the full design system, map content to components, apply unique layout variations, and output a complete standalone HTML file for developer handoff.

---

## Inputs

1. **Target content file path** - e.g., `careers.md`
2. **Homepage reference path** - `beautech-homepage-reference.html` (hardcoded)
3. **Output file path** - e.g., `careers-reference.html`

## Design System Extraction

**Mandatory 1:1 reuse (no deviation):**
- All CSS custom properties (`:root` variables)
- Font stacks (Eurostile/Exo 2 display, Inter body) + Google Fonts imports
- Typography scale (h1/h2/h3/p/eyebrow/subtitle)
- Button classes (`.btn-gold`, `.btn-outline`, `.btn-ghost`, `.btn-sm`)
- Full nav + mobile overlay (unchanged)
- Full footer (unchanged)
- Scroll reveal system (`[data-reveal]` + IntersectionObserver)
- Section glow dividers, back-to-top, sticky mobile CTA, skip-link
- Meta viewport, charset, OG tag structure

**Component palette (use where content fits):**
- `.glass` cards (standard + featured)
- `.proof-bar` / `.proof-grid` / `.proof-stat`
- FAQ accordion
- Tab navigation + panels
- Audience row layout (image + content split)
- Marquee/logo bar
- Section headers (split 2-col and centered)
- Office cards, insight cards, lifecycle phases
- 3D tilt cards, inline contact form
- Cursor glow, parallax, geometric decorations

## Page Uniqueness

**Content-driven variation (primary):** Analyze what each section's content *is* and choose the component that best serves it. No two pages share the same section layout sequence.

**Variation toolkit (secondary):**
- Split header (2-col), Centered header
- Glass card grid (2/3-col), Full-width row
- Tabbed panels, Data table, Accordion FAQ
- Numbered steps, Marquee bar, Download cards
- Stat proof bar, Featured glass card

**Rules:**
- No more than 2 consecutive sections with the same pattern
- Each page uses at least one layout pattern unique to that page
- Vary header style (split vs centered) throughout
- Alternate density: content-heavy followed by breathing sections

## Image Placeholders

- Styled `<div>` with aspect ratio, `var(--dark-surface)` bg, border, rounded corners
- Descriptive label with creative intent (subject, mood, aspect ratio)
- `aria-hidden="true"` on placeholder blocks
- Nav logo keeps actual `images/beautech-logo-white.png` src
- Client logos reuse homepage marquee markup
- Decorative SVGs generated inline (not placeholders)

## Content Mapping

| Markdown Pattern | HTML Output |
|-----------------|-------------|
| `# SECTION N: NAME` | `<section>` with unique class/id |
| `**H1:**` | `<h1>` in hero only |
| `**H2:**` | `<h2>` in `.section-header` |
| `**H3:**` | `<h3>` contextual to parent |
| `**Hero Copy:**` | `<p class="subtitle">` |
| `**Proof Bar:**` | `.proof-bar` > `.proof-grid` > `.proof-stat` |
| `**CTA 1/2/3:**` | Button group (`.btn-gold`, `.btn-outline`, `.btn-ghost`) |
| `**Q:/A:**` | FAQ accordion item |
| `\| table \|` | Styled `<table>` or adapted cards |
| `[Client logo bar]` | Marquee from homepage |
| `[Dynamic table...]` | Placeholder glass container with filter UI |
| `<!-- SCHEMA -->` | Copy to `<head>` unchanged |
| `<!-- META -->` | Parse to actual meta tags |
| `<!-- INTERNAL LINKING -->` | Implement as `<a>` tags |
| `---` between sections | `.section-glow-divider` |

**Content integrity:** Every word preserved. No rewrites, omissions, or additions.

## Quality Checklist

- Accessibility: skip-link, aria attrs, keyboard nav, semantic HTML
- SEO: title, meta, OG, canonical, schema, single h1, logical heading hierarchy
- Responsive: 1024px + 768px breakpoints, mobile nav, sticky CTA
- Interactions: scroll reveal, FAQ accordion, tabs, counters, parallax, cursor glow, tilt cards
- Content: all copy present, all CTAs present, internal links implemented
