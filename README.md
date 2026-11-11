# 🌱 OpenFarm

*Grow food that fits your climate.*

**OpenFarm helps anyone, anywhere grow food. It's an open, community-built library of growing
guides matched to your climate region. Find your location, get advice that fits your conditions,
and share what you know.**

👉 Live demo: **https://karimogit.github.io/OpenFarm/**

Pick a place on the map (or search, or type lat/lon) → OpenFarm looks up its
**Köppen-Geiger climate class** in your browser and maps it to one of **15 climate regions**
that together cover every place on Earth → you get the guides written for your climate region,
a month-by-month calendar, a 7-day forecast with frost risk and soil temperature, varieties that
suit your region and seed sources near you. No accounts, no backend, no tracking.

| | | | |
|---|---|---|---|
| ![Home – Utrecht](docs/screenshots/v2-home-utrecht.png) | ![Guide – carrot in the hot desert](docs/screenshots/v2-guide-hot-desert.png) | ![Crop page with hardiness check](docs/screenshots/v2-crop-apple.png) | ![Mobile](docs/screenshots/v2-mobile-home.png) |

## Why

Most planting calendars are written for one country, and most "zone" systems
(USDA hardiness zones) describe only winter cold. A gardener in the Netherlands, in
Umeå, in Seville and in Bangkok needs completely different advice for the same crop,
and the differences come from the *whole* climate: summer heat, dry seasons and
season length. The Köppen-Geiger classification captures exactly that and covers the
whole planet, so it works as a shared key for organising guides worldwide.

## What's in this repository

```
content/crops/<crop>.md                       A crop: facts true everywhere (type, family, seed saving, perennial facts)
content/varieties/<crop>/<variety>.md         A variety/cultivar: maturity, tolerances, resistance, its seeds block
content/guides/<crop>/<region>.md             How to grow one crop in one climate region: calendar, spacing, varieties, problems
content/regions/<region>.md                   The 15 climate regions, their Köppen classes, colour and "most similar" order
content/problems/<problem>.md                 Pests, diseases and disorders – written once, linked from every crop they affect
content/seed-sources/<source>.md              Seed libraries, networks, gene banks and companies, by country
content/companions.yaml                       Companion-planting pairs with an evidence level
content/sources.yaml                          Citation registry – reuse a source by key instead of copying it
schema/*.schema.json                          JSON Schema for every file type – validated in CI
data/images.json                              Wikimedia Commons photo + author + license per crop/variety
data/koppen/                                  Köppen-Geiger 0.5° grid, Beck et al. 2018 (CC BY 4.0)
scripts/validate.js                           Schemas + cross-references + region coverage (npm run validate)
scripts/import_rescue.js                      Imports the CC0 openfarm-crops-rescue dataset (npm run import:rescue)
scripts/fetch_images.js                       Finds freely licensed Commons photos (npm run images)
site/                                         Eleventy templates, CSS and small vanilla-JS modules (MIT)
```

**Today:** 270 crops (7 curated, 263 imported), 73 varieties, 28 sourced guides and 15 climate
regions covering all 31 Köppen-Geiger classes. 65 crops are fruit, fruit trees, berries or nuts.
Curated guides cite public sources (RHS, University of Minnesota Extension, Colorado State
University Extension, University of Arizona, Clemson HGIC, UC ANR, UF/IFAS, Jordbruksverket and
others) and carry an honest `confidence` rating and `uncertainty` note.

### Climate regions

The 31 Köppen-Geiger classes are grouped into 15 climate regions that gardeners can recognise:

| Region | Köppen classes | Region | Köppen classes |
|---|---|---|---|
| Tropical rainforest | Af | Humid subtropical | Cfa, Cwa |
| Tropical monsoon | Am | Subtropical highland | Cwb, Cwc |
| Tropical savanna (wet and dry) | Aw, As | Temperate oceanic | Cfb |
| Hot desert | BWh | Subpolar oceanic | Cfc |
| Cold desert | BWk | Humid continental | Dfa, Dfb, Dwa, Dwb, Dsa, Dsb |
| Hot semi-arid steppe | BSh | Subarctic (boreal) | Dfc, Dfd, Dwc, Dwd, Dsc, Dsd |
| Cold semi-arid steppe | BSk | Tundra and polar | ET, EF |
| Mediterranean | Csa, Csb, Csc | | |

When a crop has no guide for your region, the site shows the guide from the **most similar
region** (each region lists its `similar` regions in order), clearly labelled
"nearest region – not written for yours", with a link to add a guide for your region.

### URLs and JSON

| Page | JSON |
|---|---|
| `/guides/<crop>/<region>/` | – |
| `/crops/<crop>/` | `/crops/<crop>.json` |
| `/crops/<crop>/varieties/<variety>/` | (inside the crop JSON) |
| `/regions/<region>/` | `/regions/<region>.json` |
| `/problems/<problem>/`, `/seeds/`, `/search/` | `/api/all.json` (everything), `/api/guides.json` |

## Confidence

Every guide has a `confidence` of `high`, `medium` or `low`, shown on the guide page next to its sources:

- **high** – at least two sources from *different publishers* agree, at least one written for a place inside the guide's Köppen classes (the `reference_location`), and `last_reviewed` is within the last three years.
- **medium** – at least one regional source (extension service, national horticultural society, government or research body writing for a place in this climate), but not enough for high.
- **low** – timing adapted from a source for a different or broader climate, or a single general (non-regional) source.

`npm run validate` enforces the mechanical part: `high` fails with fewer than two distinct publishers or a review older than three years. Whether a source is regional is checked in review. Confidence is not shown on cards or overviews.

## Hardiness zones

USDA-style zones (average yearly extreme minimum temperature; zone 1 starts at −60 °F, 10 °F per zone, a/b halves).
The visitor's zone is computed in the browser from the [Open-Meteo historical weather API](https://open-meteo.com/en/docs/historical-weather-api)
(ERA5 reanalysis, ~25 km, CC BY 4.0): the coldest daily minimum of each year 1991–2020, averaged, cached in localStorage.
Limits: the coarse grid smooths frost pockets, valleys and urban heat, and reanalysis is often slightly milder than station data in cold spots.
Crop ranges (`hardiness: {min, max, sources}`) come only from cited sources (currently NC State Extension's Plant Toolbox,
filled by `scripts/fetch_hardiness.py`, which only accepts a page whose heading names the same species). No zones are estimated.

## Your profile, reminders and privacy

Exports on the Profile page: **JSON** (full backup, re-importable), **CSV** (favourites and growing list with notes), **.ics** (sow/plant/harvest reminders) and **Markdown** (a readable garden notebook). See also the in-site [Help](https://karimogit.github.io/OpenFarm/help/) page.


- **Local profile, no account.** Your location, favourites (♡ on crops, varieties and guides) and "What I'm
  growing" list (with sow dates and notes) are stored only in your browser's `localStorage`
  (key `openfarm.profile`, versioned JSON). Nothing is sent to a server. The profile page can export it as a JSON
  file, import it again (the shape is validated) and clear it.
- **Reminders (🔔).** Worked out in the browser from your growing list, your climate region's calendar and the
  Open-Meteo forecast: "Sow tomatoes indoors this month", "Frost forecast Thursday", "Dry week ahead – water …".
  You can opt in to browser notifications with a click (never asked on page load).
- **Limits.** OpenFarm is a static site with no push server, so reminders and notifications only appear while
  the site is open or when you come back to it. For reminders while the site is closed, use **Export to calendar
  (.ics)** on the profile page: it creates yearly all-day events for each sowing, planting, pruning and harvest
  window, with a 09:00 alert, which your phone or computer calendar shows on its own.
- **Third parties contacted by your browser:** OpenStreetMap tiles and Nominatim (map and place search – only when
  you search; the header only looks up places when you choose "Find place"), Open-Meteo (forecast for your saved
  coordinates) and Wikimedia (photos).

## Data model rationale

- **Crop → varieties → guides.** A *crop* holds facts that are true everywhere; a *variety*
  holds what differs between cultivars; a *guide* holds only what changes with the climate
  (calendar, spacing, which varieties and problems matter there). Nothing is repeated in
  every guide any more – the old guides each copied the scientific name, family and companions.
- **Seeds are split three ways.** How a *species* is pollinated, how far to isolate it and how
  long seed stays viable is botany, so it lives on the crop (`seed_saving`). Whether a
  *variety* is open-pollinated, F1 or clonal – and so whether saved seed comes true – lives on
  the variety (`seeds`), overriding the crop default. *Where to get seed* changes by country,
  not by climate, so seed sources are their own files with a `countries` list, and the site
  puts the ones serving your country first. Climate-specific seed timing goes in the guide
  (`seed_saving_note`).
- **Problems and companions are shared.** Late blight hits tomatoes and potatoes in every wet
  climate; writing it once in `content/problems/` with an `affects` list keeps the advice and
  sources consistent, and a guide just lists which problems matter locally. Companion pairs
  live once in `content/companions.yaml` with an evidence level (research / extension-advice /
  traditional), because most companion claims are folklore and should say so.
- **Sources are a registry.** `content/sources.yaml` lets many files cite the same RHS or
  extension page by key, so a moved URL is fixed in one place.
- **Regions are data, not code.** Region names, colours, Köppen classes and fallback order
  live in `content/regions/`, so they can be reviewed and changed like any other content, and
  CI checks that every Köppen class belongs to exactly one region.
- **Imported data is marked.** The 263 crops imported from the rescue dataset keep their CC0
  license, an `origin: imported` flag and the raw rescue fields, and are shown as unreviewed
  until someone curates them (`origin: curated`). The importer never overwrites curated files.

### Guide format

```yaml
crop: potato
region: temperate-oceanic
title: Potatoes in mild oceanic climates (Netherlands, UK, Belgium)
koppen: [Cfb, Cfc]
hemisphere: north
reference_location: Netherlands / UK lowlands
calendar: { plant: [3, 4, 5], harvest: [6, 7, 8, 9, 10] }
spacing: { in_row_cm: [30, 37], between_rows_cm: [60, 75] }
sun: full
water: moderate
problems: [late-blight]
confidence: high
sources: [{ title: "Potatoes: grow your own", publisher: RHS, url: https://www.rhs.org.uk/vegetables/potatoes/grow-your-own }]
license: CC-BY-SA-4.0
```

Full field reference: [`schema/`](schema/) and [`content/TEMPLATE.md`](content/TEMPLATE.md).

## How this differs from the original OpenFarm

[OpenFarm](https://github.com/openfarmcc) (openfarm.cc), started by Rory Aronson,
was a free and open database of crowd-sourced growing guides. It inspired a lot of
people, including us, and this project would not exist without it. Its lessons shaped
this restart:

- **Content first, not app first.** The original needed a large web app before the
  database could become useful. Here the guides *are* the product: plain files that
  are readable and useful even without the website.
- **Git + Markdown instead of a database.** Every change is a reviewed pull request
  with full history, attribution and easy forking. Anyone can mirror or reuse the
  whole dataset with `git clone`.
- **Climate-based.** Guides are keyed to Köppen-Geiger classes and hemisphere, not
  just USDA zones, so the same crop gets different calendars in Utrecht, Umeå, Seville
  and Bangkok.
- **Sourced and honest.** Every guide links real sources and states its confidence,
  so readers can tell well-tested advice from a first draft.
- **Tiny and cheap to run.** A static site on free hosting – nothing to keep alive,
  no servers to pay for.
- **AI-assisted tooling, human-reviewed content.** Modern tools make it fast to draft
  guides, translate them and build features, but CI validation and human review keep
  quality up.

## Related projects

We'd rather cooperate than compete:

- **[Growstuff](https://www.growstuff.org/)** – a long-running open-source community
  for food gardeners that shares openly licensed crop data. Great for tracking plantings
  and harvests.
- **[OpenPlantDB](https://github.com/cwfrazier1/openplantdb)** – a CC0
  machine-readable garden-plant dataset (germination, maturity, USDA-zone timing).
  Its CC0 data could seed crop facts here, with climate-specific calendars on top.

## Roadmap

- [x] Guide format, JSON Schema and CI validation
- [x] Offline location → Köppen lookup, monthly calendar, mobile-friendly static site
- [x] First 19 sourced guides across 5 crops and 4 climate groups
- [x] All 31 Köppen classes in 15 climate regions, with nearest-region fallback
- [x] Crop → variety → guide data model; seeds, problems, companions and seed sources as shared files
- [x] 263 crops imported from the CC0 rescue dataset; Commons photos; Pagefind search; Open-Meteo weather
- [ ] Guides for the 7 regions that have none yet (tropical rainforest and monsoon, deserts, subpolar oceanic, subtropical highland, tundra)
- [ ] Review imported crops one by one and promote them to `origin: curated`
- [ ] Upgrade climate data to Beck et al. (2023) 1991–2020 at 0.1° (also CC BY 4.0)
- [ ] Native southern-hemisphere variants (instead of the shifted calendar)
- [ ] 50 crops × major climate groups; regional reviewers per climate
- [ ] Translations (Dutch, Swedish, Spanish, …) – the structured format makes this easy
- [ ] Frost-date and day-length hints; climate-change view (2041–2070 Köppen maps)
- [x] Public JSON export (`/api/all.json`, one JSON file per crop and region)
- [ ] Import openly licensed facts (e.g. OpenPlantDB CC0) with attribution

## Sustainability

- **Hosting costs almost nothing:** a static site on GitHub Pages (or any static host).
  If the project moves to `openfarm.cc`, set `PATH_PREFIX=/` in the deploy workflow.
- **Low maintenance:** no database, no user accounts, no server to patch. If the website
  stopped tomorrow, the guides would still be usable straight from the repository.
- **Community governance:** the guides are reviewed through pull requests, with
  maintainers for each climate region over time.
- **Funding:** small, targeted grants for specific milestones (for example
  [NLnet](https://nlnet.nl/) open-source funding) to pay for content sprints,
  translations and the data upgrade. No ads and no paywall. The content stays
  CC BY-SA, so it can't be closed off.

## Development

```bash
npm ci
npm run validate        # check every content file against schema/ + cross-references
npm run dev             # http://localhost:8080/OpenFarm/ (search needs a full build)
npm run build           # validate + Eleventy + Pagefind search index into _site/
npm run import:rescue   # re-import the rescue dataset (never touches curated files)
npm run images          # refresh data/images.json from Wikimedia Commons
```

Node 20+. The climate assets in `site/assets/` are committed; rebuild them with
`npm run build:climate` (Python 3 + numpy + pillow) only if the source grid changes.

### Deploying (GitHub Pages)

1. The repository must be **public** (Pages on private repos needs a paid plan).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main`. The *Deploy to GitHub Pages* workflow publishes the site to
   `https://karimogit.github.io/OpenFarm/`.

## Licenses and credits

- **Code:** [MIT](LICENSE) – © 2026 OpenFarm contributors.
- **Content** (`content/`): [CC BY-SA 4.0](content/LICENSE) – attribute as "OpenFarm contributors".
  You may reuse and adapt it, also commercially, with attribution, under the same license.
- **Imported crop records:** [openfarm-crops-rescue](https://github.com/thefullnacho/openfarm-crops-rescue)
  (data recovered from the original OpenFarm.cc via the Wayback Machine), **CC0 1.0**. Files carrying
  `license: CC0-1.0` stay CC0.
- **Climate data:** Beck, H.E. et al. (2018), *Present and future Köppen-Geiger climate
  classification maps at 1-km resolution*, Scientific Data 5:180214,
  [doi:10.1038/sdata.2018.214](https://doi.org/10.1038/sdata.2018.214) –
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [`data/koppen/`](data/koppen/README.md).
- **Photos:** [Wikimedia Commons](https://commons.wikimedia.org/) – each photo shows its author and
  license (CC0, public domain, CC BY or CC BY-SA only); details in `data/images.json`.
- **Weather:** [Open-Meteo.com](https://open-meteo.com/), CC BY 4.0 – fetched in the browser, no key.
- **Map tiles and place search:** © [OpenStreetMap](https://www.openstreetmap.org/copyright)
  contributors, via the OSM tile server and Nominatim (used within their usage policies).
- **Leaflet:** BSD-2-Clause. **Pagefind:** MIT.

Advice in the guides is general. Always check local conditions and local advice. Imported crop data
is unreviewed – never use it to decide whether a plant is safe to eat.
