# Contributing to OpenFarm

Thanks for helping! OpenFarm is **content-first**: every guide is a plain text file on GitHub,
and the most valuable contribution is a good, sourced growing guide for a crop in *your*
climate region.

## How the content fits together

| What | Where | Holds |
|---|---|---|
| Crop | `content/crops/<crop>.md` | Facts true everywhere: type, family, sun, seed saving for the species, perennial facts (chill hours, rootstocks, years to first crop), linked problems |
| Variety | `content/varieties/<crop>/<variety>.md` | A cultivar: maturity, tolerances, disease resistance, regions it suits, and its `seeds` block (open-pollinated / F1 / clonal, comes true?) |
| Guide | `content/guides/<crop>/<region>.md` (public URL `/crops/<crop>/<region>/`) | How to grow one crop in one climate region: calendar, spacing, varieties and problems that matter there |
| Climate region | `content/regions/<region>.md` | Köppen classes, colour, examples, `similar` regions used as fallback |
| Problem | `content/problems/<problem>.md` | A pest, disease or disorder, with the crops it `affects` |
| Seed source | `content/seed-sources/<source>.md` | A seed library, network, gene bank or company, with the `countries` it serves |
| Companions | `content/companions.yaml` | Crop pairs, `good` or `avoid`, with an evidence level |
| Sources | `content/sources.yaml` | Citations reused by key from any file |

The [JSON Schemas](schema/) are the source of truth for every field. Why it is split this way
is explained in the README under "Data model rationale".

## Add a guide

1. Find your climate region – pick your location on the
   [site](https://karimogit.github.io/OpenFarm/) or see the [list of regions](content/regions/).
2. Look in `content/guides/<crop>/`. If a guide for your region exists, improve it. Otherwise
   copy [`content/TEMPLATE.md`](content/TEMPLATE.md) to `content/guides/<crop>/<region>.md`.
   The "＋ Add a guide for your region" buttons on the site open GitHub with this file pre-filled.
3. Fill in the frontmatter: the Köppen classes you wrote it for, the calendar, spacing, and at
   least one real source.
4. Write the body in plain Markdown with at least one `## ` section. Keep it practical:
   timing, spacing, care, harvest, local problems.
5. Run `npm ci && npm run validate`, or just open a pull request – CI validates it.

You can do all of this in the GitHub web editor ("✏️ Improve on GitHub" on every page)
without installing anything.

If the crop doesn't exist yet, add `content/crops/<crop>.md` first (see `schema/crop.schema.json`).
Many crops were imported from the rescue dataset with `origin: imported` – reviewing one against
real sources, fixing it and changing it to `origin: curated` is a great first contribution.

## Add a variety

Create `content/varieties/<crop>/<variety>.md`. Give it a `seeds` block if you know whether it is
open-pollinated or a hybrid, and list `suitable_regions` only if a source says it does well there
(explain in `regions_note`).

## Seed sources

Add a file to `content/seed-sources/` for a seed library, seed-saving network, gene bank or
seed company. List only the `countries` (ISO codes) the source really serves – check its shipping
or membership page. Non-commercial seed libraries and networks are especially welcome.

## Content rules

- **Real sources only.** Every guide, crop, variety and problem needs at least one public source
  (extension service, horticultural society, government agency, FAO, peer-reviewed paper,
  reputable seed company). Never invent citations. Personal experience is welcome in the text,
  but say so.
- **Flag uncertainty.** Use `confidence` honestly and explain doubts in `uncertainty`. A
  calendar adapted from a similar climate is fine if you say so.
- **Companion planting** claims are often folklore. Use `evidence: traditional` unless you cite
  research.
- **One Köppen class per crop per hemisphere.** Two guides for a crop must not claim the same
  class and hemisphere (CI checks this).
- **Hemisphere.** Write months for the hemisphere you know. The site shifts northern calendars
  by six months for southern locations and labels that as unverified, so a native
  southern-hemisphere guide is always better.
- **Photos** come from Wikimedia Commons with a free license (CC0, public domain, CC BY,
  CC BY-SA). To pick a better photo, set `commons_file:` on the crop or variety and run
  `npm run images`.
- **AI-assisted writing is welcome**, but a human must check every fact against the listed
  sources before the pull request is merged.

## Sources and licences

The full policy, with licence links, is in [SOURCES.md](SOURCES.md). In short:

- **Accepted for imported (copied) data:** public domain / CC0, CC BY, and CC BY-SA, with
  attribution. These are compatible with our content licence (CC BY-SA 4.0) and do not add
  NC, ND or other extra restrictions.
- **Excluded from import:** CC BY-NC, CC BY-ND, all-rights-reserved material, unclear terms,
  seed catalogues, PFAF, and copyleft *code* (GPL, AGPL — do not copy Growstuff or similar
  code). Growstuff *structured data* is CC BY-SA 3.0 and may be used only with attribution
  and ShareAlike; member posts, comments and images must not be imported.
- **Citations:** extension services, the RHS and similar pages are usually all-rights-reserved.
  Summarise in your own words and link. Do not paste their text. Every record lists its
  sources by key from `content/sources.yaml` (each key has a `license` and a `use` of
  `import` or `citation`). The validator fails the build if an import source is not on the
  allowlist.
- **Wiki-derived data is not an authority.** The CC0 rescue import is a scaffold. Do not add
  companions, spacing or prose from wiki-derived datasets. Keep the Unreviewed marking until
  a published source has been checked.
- **Edibility** must come from an authoritative, compatible source and be cited on the record.
  Leave the fields blank if unsourced. Edible-part info is for cultivated crops — not for
  identifying wild plants or foraging.
- **Credits:** an “Edited by” line is generated from that file’s git history (GitHub
  usernames only, no emails, bots omitted). The Sources list on a page is published
  references, not git authors.

## License of contributions

- Content (`content/`) is licensed **CC BY-SA 4.0** and attributed to "OpenFarm contributors".
  By contributing content you agree to release it under that license. Imported records marked
  `license: CC0-1.0` stay CC0.
- Code (everything else) is **MIT**.
- Don't paste copyrighted text from sources – summarise in your own words and link.

## Code contributions

```bash
npm ci
npm run dev             # http://localhost:8080/OpenFarm/
npm run build           # validate + Eleventy + Pagefind into _site/
npm run import:rescue   # re-import the CC0 rescue dataset (skips curated files)
npm run images          # refresh data/images.json from Wikimedia Commons
```

The site is plain [Eleventy](https://www.11ty.dev/), small vanilla-JS modules
(`site/assets/js/common.js` for every page, `home.js` for the map), Leaflet and
[Pagefind](https://pagefind.app/). Please keep it fast, static and dependency-light.

## Code of conduct

Be kind, assume good faith, and remember that gardeners in every climate know things you don't.
