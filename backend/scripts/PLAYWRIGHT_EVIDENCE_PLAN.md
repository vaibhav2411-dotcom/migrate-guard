# Playwright Evidence Run Plan

This plan describes how the evidence runner captures migration proof across pages, UI layers, branding, and visual design.

## Scope

The script `backend/scripts/two-site-evidence.cjs` now captures deterministic evidence for:

- Multi-page coverage via sitemap + homepage link discovery (or explicit `PATHS` override)
- Multi-viewport screenshots (`375, 768, 1280, 1920`)
- DOM and semantic structure (header/nav/main/footer/heading hierarchy)
- Branding and design tokens (logo, colors, typography signals)
- UI layer metadata (positioning + z-index complexity)
- Element inventory (forms, buttons, inputs, cards, tables, lists)
- Interaction evidence per element (default/hover/focus computed styles + focus-ring checks)
- Network and console traces per page and viewport
- Page-level deterministic findings (visual, branding, palette, structure, interaction)

## Artifacts

Per run under `backend/data/artifacts/<runId>`:

- `evidence-summary.json`
- `evidence-manifest.json`
- `captured-paths.json`
- `baseline-*` / `candidate-*` screenshots
- Per-side folders with html, dom, palette, design tokens, layers, element inventory, interaction evidence, network, and console logs

## Execution

PowerShell example:

```powershell
$env:MAX_PAGES='10'
$env:UI_ELEMENT_MAX='14'
node backend/scripts/two-site-evidence.cjs https://www.bbcbenelux.com https://stage.beta.bbcbenelux.com
```

Optional explicit paths:

```powershell
$env:PATHS='/,/about,/contact,/news'
node backend/scripts/two-site-evidence.cjs https://www.bbcbenelux.com https://stage.beta.bbcbenelux.com
```

## Validation checks

- Ensure `evidence-summary.json` includes multiple pages and all viewports
- Ensure each page has baseline/candidate interaction evidence
- Ensure deterministic findings include focus/branding/palette/layer checks where applicable
