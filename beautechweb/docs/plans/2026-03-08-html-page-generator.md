# HTML Page Generator Prompt - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a universal master prompt file that generates pixel-perfect, standalone HTML reference pages from any BeauTech content markdown file, using the homepage reference HTML as the design system source of truth.

**Architecture:** A single markdown prompt file at `docs/prompts/html-page-generator.md` that instructs Claude Code to read the homepage HTML + target .md, extract the design system, map content to components with unique per-page layouts, and output a complete standalone HTML file for developer handoff.

**Tech Stack:** Markdown (prompt file), HTML/CSS/JS (output specification)

---

### Task 1: Create the prompt file with role, objective, and input instructions

**Files:**
- Create: `docs/prompts/html-page-generator.md`

**Step 1: Write the prompt header and role definition**

Write the opening section of the prompt that establishes:
- The role (expert frontend developer + BeauTech brand specialist)
- The objective (generate a pixel-perfect standalone HTML reference page)
- The three required inputs with exact file paths:
  1. `{{CONTENT_FILE}}` - the target .md file path (user provides)
  2. Homepage reference: `/Users/stevenjunop/app-seo-ai/beautechweb/beautech-homepage-reference.html` (hardcoded)
  3. `{{OUTPUT_FILE}}` - desired output .html path (user provides)
- Instructions to read both files before generating anything
- Instruction to read the full homepage HTML in chunks if needed (it's ~1500 lines)

**Step 2: Verify the section**

Read back `docs/prompts/html-page-generator.md` and confirm:
- Role is clear and specific
- All three inputs are defined
- File reading instructions are explicit
- No ambiguity about what gets read first

---

### Task 2: Write the design system extraction rules section

**Files:**
- Modify: `docs/prompts/html-page-generator.md`

**Step 1: Write the mandatory 1:1 reuse rules**

Append a section titled `## Design System Extraction` that lists everything the generator must extract and reuse exactly from the homepage HTML:

- All CSS custom properties (`:root` block with every variable name listed)
- Font stack declarations + Google Fonts `<link>` imports
- Typography scale: h1, h2, h3, p, `.eyebrow`, `.subtitle` (sizes, weights, line-heights, letter-spacing)
- Button classes: `.btn`, `.btn-gold`, `.btn-outline`, `.btn-ghost`, `.btn-sm` with hover states
- Complete nav HTML + CSS + mobile overlay + hamburger JS
- Complete footer HTML + CSS
- Scroll reveal system: `[data-reveal]` CSS + IntersectionObserver JS
- `.section-glow-divider` markup and CSS
- Back-to-top button markup + CSS + scroll JS
- Sticky mobile CTA markup + CSS + visibility JS
- Skip-to-content link
- Cursor glow div + CSS + mouse-tracking JS
- Parallax system: `[data-speed]` CSS + rAF JS
- 3D tilt card system: `.tilt-card` CSS + mousemove JS
- Counter animation: `[data-count]` IntersectionObserver JS
- Image reveal: `.img-reveal` CSS + observer
- Geometric decorations: `.geo-float` classes
- Blade decorations: `.blade-decor` SVGs
- Grain overlay: `.grain::after`
- Hero image load animation
- Layout utilities: `.container`, `.section`

Explicitly state: "Copy the ENTIRE `<style>` block from the homepage reference. Do not cherry-pick rules. The complete CSS must be present in every generated page, plus any new page-specific CSS appended after."

Explicitly state: "Copy the ENTIRE `<script>` block from the homepage reference. Adapt event listeners to match the components present on the generated page (e.g., remove tab switching JS if no tabs exist, add new accordion instances if page has more FAQ items)."

**Step 2: Verify the section**

Read the updated file and confirm all design system elements are enumerated with no gaps vs. the homepage HTML.

---

### Task 3: Write the component library and variation toolkit section

**Files:**
- Modify: `docs/prompts/html-page-generator.md`

**Step 1: Write the component palette**

Append a section titled `## Component Library` that catalogs every reusable component from the homepage, with the class names, expected HTML structure (brief), and when to use each:

1. **Glass cards** (`.glass`, `.glass-featured`) - feature blocks, benefits, differentiators
2. **Proof bar** (`.proof-bar` > `.proof-grid` > `.proof-stat`) - key statistics
3. **FAQ accordion** (`.faq-item` > `.faq-trigger` + `.faq-answer`) - Q&A sections
4. **Tab navigation** (`.tab-nav[role="tablist"]` + `.tab-panel`) - grouped content families
5. **Audience rows** (`.audience-row` with image + content split) - persona-targeted sections
6. **Marquee/logo bar** (`.marquee-wrapper` > `.marquee-track` > `.marquee-item`) - partner logos
7. **Section headers** - two variants:
   - Split 2-column: `.section-header` with `grid-template-columns:1fr 1fr` (eyebrow+h2 left, description right)
   - Centered: `.section-header` with `text-align:center`
8. **Office cards** (`.offices-grid` > `.office-card`) - location blocks with expandable address
9. **Insight cards** (`.insights-grid` > `.insight-card`) - content/article previews
10. **Lifecycle phases** (`.lifecycle-phases` > `.lifecycle-phase`) - process phase blocks with markers
11. **Tilt cards** (`.tilt-card` > `.glass` with `.tilt-shine`) - premium interactive cards
12. **Inline form** (`.inline-form`) - contact/inquiry form
13. **Solution cards** (`.solution-card` with `.card-number`, `.card-icon`, `.card-img`) - service showcases
14. **Numbered step cards** - derived from lifecycle phases, for process flows
15. **Download cards** - glass card variant with icon + title + description + download CTA button
16. **Data table** - `<table>` inside a `.glass` container with styled headers
17. **Featured CTA block** - full-width `.glass` with centered content and CTA buttons
18. **About composition** - multi-image layout with badge overlay

**Step 2: Write the variation toolkit and uniqueness rules**

Append a subsection titled `### Page Uniqueness Rules` with:

- The generator MUST analyze each section's content type and choose the best-fit component
- No two pages may use the same sequence of section layouts
- Never use more than 2 consecutive sections with the same layout pattern
- Each page must include at least one layout pattern not used on any other generated page
- Vary section header style (split vs centered) throughout the page - never use the same style more than 3 times consecutively
- Follow content-heavy sections with breathing sections (proof bar, divider, single CTA block)
- If a page has fewer sections, increase spacing and use more spacious layouts rather than compressing
- Consider reversing image/content sides on full-width rows to create visual rhythm
- Use `.glass-featured` sparingly (max 1-2 per page) for the most important differentiator

Include a table of suggested patterns mapped to content types:

| Content Type | Recommended Patterns |
|-------------|---------------------|
| Hero with stats | Hero section + proof bar |
| List of benefits/features | Glass card grid (2 or 3 col) or tilt cards |
| Process/steps | Numbered steps or lifecycle phases |
| Engine/product specs | Tabbed panels or data tables in glass |
| FAQ | 2-column accordion layout |
| Team/roles | Audience rows or glass cards |
| Downloads/assets | Download cards grid |
| Partner logos | Marquee bar |
| Key differentiator | Featured glass card (full-width) |
| Contact/conversion | Inline form + CTA block |
| Testimonials/quotes | Testimonial marquee cards |

**Step 3: Verify the section**

Read the updated file and confirm all components from homepage are cataloged, uniqueness rules are enforceable, and the content-to-pattern mapping table is complete.

---

### Task 4: Write the image placeholder and content mapping sections

**Files:**
- Modify: `docs/prompts/html-page-generator.md`

**Step 1: Write image placeholder standards**

Append a section titled `## Image Placeholders` with:

- Placeholder HTML structure:
```html
<div class="img-placeholder-block" aria-hidden="true">
  <span>[Creative direction label]</span>
</div>
```

- Required CSS for `.img-placeholder-block` (include the exact CSS):
```css
.img-placeholder-block{display:flex;align-items:center;justify-content:center;background:var(--dark-surface);border:1px solid var(--white-06);border-radius:var(--radius-lg);color:var(--white-10);font-size:0.8rem;font-family:var(--font-body);text-align:center;padding:20px;min-height:200px}
```

- Labels must describe creative intent: subject, mood/lighting, recommended aspect ratio
- Nav logo keeps actual src: `images/beautech-logo-white.png`
- Footer logo keeps actual src: `images/beautech-logo-white.png`
- Client logo marquee reuses the exact homepage markup with all image srcs
- Decorative SVGs (blade patterns, geo-floats) are inline code, not placeholders
- Hero images use `aspect-ratio:16/9` placeholder
- Section images use `aspect-ratio:4/3` or `16/9` depending on layout context
- Card images use `aspect-ratio:16/10`

**Step 2: Write content mapping rules**

Append a section titled `## Content Mapping` with the complete mapping table:

| Markdown Pattern | HTML Output | Notes |
|-----------------|-------------|-------|
| `# SECTION N: NAME` | `<section class="[name] section" id="[name]">` | Derive class/id from section name, lowercase, hyphenated |
| `**H1:**` text | `<h1>text</h1>` | Hero section only. Single h1 per page |
| `**H2:**` text | `<h2 data-reveal>text</h2>` inside `.section-header` | Always has data-reveal |
| `**H3:**` text | `<h3>text</h3>` | Contextual to parent component |
| `**Hero Copy:**` | `<p class="subtitle">text</p>` | In hero, animated with fadeUp |
| `**Proof Bar:** item1 \| item2 \| item3` | `.proof-bar` > `.proof-grid` with one `.proof-stat` per pipe-delimited item | Parse each item into `.proof-number` + `.proof-label` |
| `**CTA 1:** text` | `<a class="btn btn-gold">` | First CTA is always gold |
| `**CTA 2:** text` | `<a class="btn btn-outline">` | Second CTA is outline |
| `**CTA 3:** text` | `<a class="btn btn-ghost">` | Third CTA is ghost. If contains "AOG" use `tel:` link |
| `**CTA:** text1 \| text2` | Button group with gold + outline | Parse pipe for multiple |
| `**Q:** question` / `A:` answer | `.faq-item` > `.faq-trigger` + `.faq-answer` | Each Q/A pair becomes one accordion item |
| Markdown table `\| col \| col \|` | `<table>` inside `.glass` container | Style with design system colors. Or adapt to cards if table has few columns but rich content per row |
| `[Client logo bar]` | Full marquee component from homepage | Copy exact markup including duplicated items for seamless loop |
| `[Dynamic inventory table...]` | Glass container with filter button row + placeholder table | Mock the filter UI with inactive buttons |
| `<!-- SCHEMA: type -->` + JSON-LD | `<script type="application/ld+json">` in `<head>` | Copy JSON exactly as-is |
| `<!-- META -->` comments | Parse into actual `<meta>`, `<title>`, `<link>` tags | Extract title, description, OG tags, canonical |
| `<!-- INTERNAL LINKING -->` block | Implement as `<a href="path">anchor text</a>` in body | Apply each link to the first occurrence of that anchor text |
| `<!-- IMAGE ALT TEXT -->` block | Use as creative direction for placeholder labels | Don't render as visible content |
| Markdown `---` between major sections | `<hr class="section-glow-divider" aria-hidden="true">` | Not between every subsection, only between major `# SECTION` blocks |

Add this critical rule:
> **CONTENT INTEGRITY: Every single word of approved copy from the .md file must appear in the HTML output. Do not rewrite, omit, rephrase, summarize, or add to the approved copy. The markdown content has been through a 4-phase audit process. Your job is to present it perfectly in HTML, not to edit it.**

**Step 3: Verify both sections**

Read the updated file and confirm placeholder standards are complete with exact CSS, and every markdown pattern from the existing .md files is covered in the mapping table.

---

### Task 5: Write the quality checklist and output format section

**Files:**
- Modify: `docs/prompts/html-page-generator.md`

**Step 1: Write the quality checklist**

Append a section titled `## Quality Checklist` with four subsections:

**Accessibility:**
- [ ] Skip-to-content link present and functional
- [ ] All `<section>` elements have unique `id` attributes
- [ ] `<main>` element wraps page content (not nav/footer)
- [ ] FAQ triggers have `aria-expanded`, `aria-controls`
- [ ] Tab buttons have `role="tab"`, `aria-selected`, `aria-controls`
- [ ] Tab panels have `role="tabpanel"`, `aria-labelledby`
- [ ] Mobile nav has `aria-hidden`, hamburger has `aria-expanded`
- [ ] Decorative elements (SVGs, geo-floats, dividers, placeholders) have `aria-hidden="true"`
- [ ] All interactive elements are keyboard accessible
- [ ] Semantic HTML throughout (`<nav>`, `<main>`, `<section>`, `<footer>`)

**SEO:**
- [ ] `<title>` parsed from `<!-- Title: -->` comment
- [ ] `<meta name="description">` parsed from markdown
- [ ] OG title, description, URL, type, image meta tags present
- [ ] `<link rel="canonical">` present
- [ ] All schema JSON-LD blocks in `<head>` exactly as written in markdown
- [ ] Exactly one `<h1>` on the page
- [ ] Heading hierarchy is logical (h1 > h2 > h3, no skips)
- [ ] Internal links implemented per linking strategy comments

**Responsive:**
- [ ] All homepage `@media` queries included (1024px, 768px breakpoints)
- [ ] Any new page-specific components have responsive rules added
- [ ] Mobile nav hamburger menu functional
- [ ] Sticky mobile CTA present and toggles on scroll
- [ ] Proof bar grid switches to 2-col then stacks on mobile
- [ ] Card grids collapse to fewer columns on tablet, single column on mobile
- [ ] Split section headers stack to single column on mobile

**Interactions (JS):**
- [ ] Scroll reveal fires on all `[data-reveal]` elements via IntersectionObserver
- [ ] FAQ accordion expand/collapse toggles `aria-expanded` and `max-height`
- [ ] Tab switching updates `aria-selected`, shows/hides panels (if page uses tabs)
- [ ] Counter animation runs on `.proof-number [data-count]` elements
- [ ] Back-to-top button appears after scrolling past hero
- [ ] Cursor glow tracks mouse on desktop, hidden on mobile
- [ ] Parallax applies to `[data-speed]` elements on desktop only
- [ ] 3D tilt on `.tilt-card` elements on desktop only
- [ ] Hero image parallax + load animation
- [ ] Hamburger toggle opens/closes mobile nav overlay
- [ ] Sticky mobile CTA appears after scrolling past hero

**Content Integrity:**
- [ ] Every line of approved copy from the .md file is present in the output
- [ ] No words have been added, removed, or rephrased
- [ ] All CTA text matches the markdown exactly
- [ ] All FAQ questions and answers match the markdown exactly
- [ ] Schema JSON-LD is byte-for-byte identical to the markdown source
- [ ] All proof bar statistics match the markdown
- [ ] Internal linking anchor text matches the linking strategy comments

**Step 2: Write the output format requirements**

Append a section titled `## Output Format` with:

- Output must be a single, self-contained `.html` file
- All CSS must be in a single `<style>` block in `<head>` (homepage CSS first, then page-specific CSS appended)
- All JS must be in a single `<script>` block before `</body>` (homepage JS first, adapted and extended for page components)
- No external dependencies except Google Fonts CDN links
- File must open correctly in any modern browser with no build step
- Include `<!DOCTYPE html>`, `<html lang="en">`, proper `<head>` with charset/viewport
- Page-specific CSS classes should be namespaced with the page name (e.g., `.careers-hero`, `.inventory-filters`)

**Step 3: Verify the section**

Read the complete prompt file from top to bottom. Confirm every design document requirement is covered. Confirm no sections are missing.

---

### Task 6: Final review and commit

**Files:**
- Review: `docs/prompts/html-page-generator.md`
- Review: `docs/plans/2026-03-08-html-page-generator-design.md`

**Step 1: Full read-through of the prompt**

Read the entire `docs/prompts/html-page-generator.md` file. Check for:
- Completeness: every design doc requirement is addressed
- Clarity: an engineer with zero context could follow this prompt
- No contradictions between sections
- No redundant instructions
- Content mapping covers all patterns found in careers.md, media-kit.md, and inventory.md

**Step 2: Test against one .md file mentally**

Walk through `inventory.md` mentally and confirm every markdown pattern in that file has a mapping rule in the prompt. Check:
- Schema blocks (FAQ, BreadcrumbList, Organization) -> head
- META comments -> meta tags
- Proof bar with pipe-delimited items -> proof-grid
- Engine platform H3 sections with tables -> appropriate component
- Dynamic inventory table placeholder -> filter UI mockup
- Multiple CTA patterns -> correct button classes
- FAQ Q/A blocks -> accordion items
- Internal linking strategy -> `<a>` tags
- Image alt text guidance -> placeholder labels

**Step 3: Commit both files**

```bash
git add docs/prompts/html-page-generator.md docs/plans/2026-03-08-html-page-generator-design.md docs/plans/2026-03-08-html-page-generator.md
git commit -m "docs: add HTML page generator prompt and design docs"
```
