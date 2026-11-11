# OpenFarm style guide

Small, plain and fast: system fonts, one stylesheet (`site/assets/css/style.css`), no framework.

## Tokens (CSS custom properties in `:root`)

| Token | Value | Use |
|---|---|---|
| `--green` | `#2f6b3a` | Brand, header background, links, primary buttons |
| `--green-2` | `#e8f2e6` | Soft highlight: Köppen chips, selected suggestion, privacy note |
| `--ink` | `#1d2a1f` | Body text |
| `--muted` | `#5d6b5f` | Secondary text, captions |
| `--line` | `#d9e3d6` | Borders and dividers |
| `--bg` | `#fafcf8` | Page background |
| `--sow` `--sowd` `--plant` `--prune` `--harvest` | | Calendar rows (sow indoors, sow outside, plant out, prune, harvest) |
| `--nav-hover` | `#ffffff26` | Header nav item on hover |
| `--nav-active` | `#ffffff3d` | Header nav item for the current section |
| `--focus` | `#ffd166` | Keyboard focus ring on the green header |
| `--focus-ink` | `#1f5fbf` | Keyboard focus ring on light backgrounds |
| `--danger` | `#a12a14` | Destructive actions ("Clear my data"), frost warnings |
| `--radius-sm` | `6px` | Nav items, chips, small controls |

## Header navigation

- Items are plain links in `<nav class="main-nav" aria-label="Main">`.
- **Hover:** `--nav-hover` background and an underline.
- **Keyboard focus:** `:focus-visible` shows a 3 px `--focus` outline. Never remove the outline without a replacement.
- **Current section:** the template sets `aria-current="page"` on the link for the current section. CSS styles that
  attribute (not a class) with `--nav-active`, bold text and a white bottom bar, so screen readers and sighted users
  get the same signal. Sections: home → *Find guides*; `/crops/`, `/guides/`, `/problems/` → *Crops*;
  `/regions/` → *Region*; `/tools/` → *Tools*; `/profile/` → *My Profile*; `/contribute/` → *About*. Seed sources live at `/crops/#seed-sources` (with `/seeds/` redirecting there).
  Crops, Region and Tools each have a dropdown of their groups (crop types, climate regions, tool categories). Tool
  category pages live at `/tools/<category>/`; a tool page stays at `/tools/<tool>/` (breadcrumb uses the primary category).

## Cards and images

- Card grids use `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))` so every card in a row has the same width.
- Card images sit in a fixed 4:3 frame with `object-fit: contain` on a neutral background: never cropped, never
  stretched, never upscaled beyond the original size. Crop and region cards may use `object-fit: cover`.
- Page (hero/detail) photos are centred, `object-fit: contain`, and capped in a 360 px-tall frame on desktop and 240 px on
  small screens (`object-fit: cover`), never wider than the content column.
- Wikimedia Commons thumbnails use production standard widths only (250, 330, 500, 960, 1280, 1920; see https://w.wiki/GHai):
  250/500 px (1×/2×) for cards, and 330/500/960 px (`srcset` + `sizes`) for page photos, so file sizes stay small. Below-the-fold images are lazy-loaded; heroes stay eager.
- Names clamp to two lines, scientific names to one line with an ellipsis.

## Links and buttons

- External links open in a new tab, get `rel="noopener noreferrer"`, a small ↗ and a visually hidden
  "(opens in new tab)". Internal links stay in the same tab. (Done by a build transform in `eleventy.config.js`.)
- One edit call-to-action per page, at the bottom: "Edit this guide / crop / variety / region".
- Scientific names in *italics*; cultivars in the 'Cultivar' form, e.g. *Solanum lycopersicum* 'Sungold'.

## Accessibility

- Every interactive element must be reachable and usable with the keyboard; the header search is a combobox with
  arrow-key navigation and Escape to close.
- Colour is never the only signal (region colour swatches always come with the region name).
