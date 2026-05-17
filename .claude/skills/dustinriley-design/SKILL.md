---
name: dustinriley-design
description: Use when building or modifying any UI in a project that consumes @dustin-riley/design — enforces the warm mid-century-modern token system, the three-radii/three-shadow rules, sentence-case voice, and the curated .ds-* primitive vocabulary.
---

# dustinriley design system

Apply this whenever you add or change UI in a project importing `@dustin-riley/design`.

## Non-negotiables
- One primary (burnt orange `#B8541C`), accents ochre + teal. Never invent colors.
- Three radii only: 8 / 16 / 999px. Three warm-tinted shadows only: sm / md / lg.
- Sentence case everywhere. First person. No emoji. Lucide icons or unicode arrows.
- Color is never the only state signal. Motion resolves under 300ms.
- For text-as-link in burnt orange use `--ds-link`, never `--ds-primary` (WCAG AA).
- Never hard-code a hex/px value — reference a `--ds-*` token.
- AI-generated content uses `.ds-ai` (surface) + `.ds-ai-mark` (Lucide `cpu` + "the model says · <model>") together — never plum colour alone. Plum stays a usable tertiary accent. Write the byline sentence-case in source; `.ds-ai-mark` renders it uppercase (mono-meta carve-out, not an ALL-CAPS exception).

## How to consume
- Always: `@import "@dustin-riley/design/tokens.css"; @import "@dustin-riley/design/core.css";`
- Tailwind v4 + shadcn projects additionally: `@import "@dustin-riley/design/tailwind.css";`
- Base element styling ships inside `core.css` (no separate import, no
  `@layer`): minimal body/heading/code/`::selection` defaults wrapped in
  `:where()` (zero specificity), so any app/component/Preflight rule wins.
- **Never set a global link `text-decoration`.** Links are color-only by
  design (DESIGN.md); underline is a component-scoped app decision (e.g.
  article body), never a system-wide default.

## Vocabulary (prefer extending these over inventing parallels)
Buttons `.ds-btn` + `.ds-btn-primary|secondary|ghost`; layout `.ds-container`,
`.ds-section`; type `.ds-display`, `.ds-lede`, `.ds-caption`, `.ds-mono-note`,
`.grid-label`, `.h1`–`.h6`; chrome bits `.ds-page-header`, `.ds-back-link`;
surfaces `.ds-panel`, `.kbd`; AI `.ds-ai`, `.ds-ai-mark`.

Site-specific furniture (nav, footer, hero, grids) is NOT in the package by
design — build it per project from these primitives and tokens.

See the full rationale in `@dustin-riley/design/DESIGN.md`.
