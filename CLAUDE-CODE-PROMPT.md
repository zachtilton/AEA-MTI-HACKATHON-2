# Claude Code — Meta-Prompt
## AEA/MTI Hackathon 2: Critique • Create • Collab

---

## How to use this prompt

1. Initialize your GitHub repo (instructions in GITHUB-SETUP.md)
2. Add your brand kit files to `/assets/brand/` (or proceed without them — see SPEC.md §8.2 for fallback)
3. Open Claude Code in your project working directory
4. Paste everything below the horizontal rule into Claude Code

---

---

## PROMPT (paste this into Claude Code)

I need you to build a complete static web system for a virtual hackathon called **AEA/MTI Hackathon 2: Critique • Create • Collab**. Full specifications are in `SPEC.md` in this repository. Read `SPEC.md` completely before writing any code.

### Your task

Build all files described in the spec to production-ready quality. This is a full build in one session — do not leave stubs or incomplete sections.

### Context

- **What this is:** A virtual hackathon for evaluation practitioners exploring AI in evaluation. Participants pick one of three paths (Critique, Create, Collab), do a 10–30 minute activity, submit via form, and appear in a live public gallery.
- **Who maintains this:** Non-technical staff after handoff. It must be low-maintenance and well-documented.
- **Hosting:** Pages will be embedded into a WordPress site. GitHub Pages is used as staging via GitHub Actions. No server-side code except Google Apps Script.
- **Stack:** Vanilla HTML + CSS + JS only. No frameworks, no npm, no build tools.

### Build order

Work in this sequence to keep things testable at each stage:

1. **Repo structure** — Create all folders and empty placeholder files
2. **`assets/brand/brand.css`** — Check if it exists. If not, generate the fallback from SPEC.md §8.2
3. **`assets/css/styles.css`** — Shared styles, imports brand.css, fully responsive (mobile-first)
4. **`pages/index.html`** — Landing page (all sections per SPEC.md §4.1)
5. **`pages/critique.html`**, **`create.html`**, **`collab.html`** — Path instruction pages (per SPEC.md §4.2), including all placeholder Prompt Lab challenges from SPEC.md §7.1
6. **`pages/form-critique-create.html`** — Submission form with dynamic field behavior (per SPEC.md §4.3)
7. **`pages/form-collab.html`** — Collab submission form (per SPEC.md §4.3)
8. **`assets/js/gallery.js`** — Gallery fetch, parse, render, and auto-refresh logic (per SPEC.md §4.4)
9. **`pages/gallery.html`** — Gallery page, imports gallery.js (per SPEC.md §4.4)
10. **`appscript/Code.gs`** — Apps Script handler (per SPEC.md §5)
11. **`appscript/DEPLOY.md`** — Deployment instructions
12. **`.github/workflows/deploy.yml`** — GitHub Actions → GitHub Pages (per SPEC.md §6)
13. **`docs/SETUP.md`**, **`docs/WORDPRESS-EMBED.md`**, **`docs/CONTENT.md`** — Handoff docs (per SPEC.md §9)
14. **`README.md`** — Project overview and quick-start
15. **Quality check** — Run through the checklist in SPEC.md §10

### Design requirements

- Use CSS custom properties from `brand.css` for ALL colors and fonts — never hardcode values
- Path accent colors: Critique = `--color-critique` (red), Create = `--color-create` (green), Collab = `--color-collab` (purple)
- Responsive breakpoints: 480px / 768px / 1024px
- Accessible: semantic HTML, visible focus states, labeled form fields, WCAG AA contrast
- Gallery cards: polished, card-style layout with path color badge, clean typography
- The overall aesthetic should feel professional and welcoming — not generic bootstrap, not cluttered

### Placeholder handling

Every URL, date, or configurable value that isn't known yet must:
1. Appear as a clearly named constant at the top of the relevant JS section (e.g., `const APPS_SCRIPT_URL = '[APPS_SCRIPT_URL]';`)
2. Include an HTML comment: `<!-- PLACEHOLDER: replace [APPS_SCRIPT_URL] with your deployed Apps Script URL -->`

Full list of placeholders is in SPEC.md §7.3.

### Prompt Lab challenges

Generate five complete, evaluation-relevant prompt engineering challenges for the Create path. Each challenge needs a name, 2–3 sentence description, stated intent, and estimated time. Use the themes in SPEC.md §7.1 as your guide — write them as real, usable content, not lorem ipsum.

### What I will provide separately

- Brand kit is already in /assets/brand/: brand.css (with Space Grotesk + 4 brand colors: #FC624F, #F7CF46, #73DC8A, #7B31F6), plus three SVGs — use logo_merl-tech-4.svg as the primary logo
- The brand-info.txt file in the same folder has the raw color and font info for reference

- Real URLs for Apps Script, Google Sheet CSV, Slack, Hot Take Wall, and starter templates — these go into the placeholder constants after deployment

### Definition of done

All items in the quality checklist (SPEC.md §10) must pass before you consider the build complete. Tell me when you've finished each major section so I can review incrementally, and surface any ambiguities or decisions you make along the way.

---

## After the build: GitHub repo initialization

Before running the above prompt, initialize your repo with these steps:

```bash
# 1. Create the repo on GitHub (via UI or CLI)
#    Suggested name: aea-mti-hackathon-2
#    Visibility: Private (make public when ready to launch)
#    Initialize with README: Yes

# 2. Clone it locally
git clone https://github.com/YOUR-USERNAME/aea-mti-hackathon-2.git
cd aea-mti-hackathon-2

# 3. Create the folder structure Claude Code will expect
mkdir -p .github/workflows pages assets/brand assets/css assets/js appscript docs

# 4. Add your brand kit (if you have it)
# Copy brand.css and logo.svg into assets/brand/

# 5. Copy SPEC.md into the root of the repo
# cp /path/to/SPEC.md .

# 6. Commit and push the initial structure
git add .
git commit -m "chore: initial repo structure and spec"
git push origin main

# 7. Enable GitHub Pages in repo Settings → Pages
#    Source: GitHub Actions (deploy.yml will handle the rest)

# 8. Open Claude Code in this directory and run the prompt above
```
