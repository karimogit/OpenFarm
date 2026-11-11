# Sources and licences

OpenFarm content is [CC BY-SA 4.0](content/LICENSE) (attribute as “OpenFarm contributors”).
Imported records that already carry `license: CC0-1.0` stay CC0. Site code is [MIT](LICENSE).

Every factual claim on a crop, variety, guide, tool, companion or rotation record must name
its sources, using keys from [`content/sources.yaml`](content/sources.yaml). That file is the
registry: title, URL, licence, whether we may **import** the source or only **cite** it, and
an optional `license_url`. The build fails if a record points at an unknown key, if a source
is missing a licence or `use`, or if a source marked `use: import` is not on the allowlist
below.

## Which licences we accept for imported data

We only **copy or adapt** data when the source’s own terms are compatible with our content
licence (CC BY-SA 4.0) and do not impose extra restrictions. Allowed:

- Public domain / [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
- [CC BY](https://creativecommons.org/licenses/by/4.0/) (any 3.0 or 4.0 unported / international)
- [CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/) (3.0 or 4.0; ShareAlike is preserved)

Excluded from import: CC BY-NC, CC BY-ND and other NC/ND licences; all-rights-reserved
material; unclear or missing terms; and copyleft **code** licences such as GPL or AGPL
(we do not copy that code into this repository). Seed catalogues and PFAF are not imported.

## Citations are not imports

Most growing advice is **cited**, not copied. University extension services, the RHS and
similar publishers typically reserve copyright. We may summarise their advice in our own
words and link to the page (`use: citation`, often `license: all-rights-reserved`). We must
not paste their text. Citation does not change our CC BY-SA 4.0 licence.

## Wiki-derived data is not an authority

The [openfarm-crops-rescue](https://github.com/thefullnacho/openfarm-crops-rescue) dataset
is legally CC0 and was imported as a scaffold. It is community wiki data from the original
OpenFarm.cc site. Its own README warns that descriptions, spacing and companions are only
as good as the wiki edits they came from. Those fields stay marked **Unreviewed** until a
human checks them against a credible published source (extension services, national
agricultural institutes, FAO, RHS, peer-reviewed papers, and similar). Do not treat
wiki-derived spacing, sun, sowing method, prose or companions as fact, and do not import
new companion, spacing or prose entries from wiki-derived datasets.

## Edibility

`edible` and `edible_parts` are filled only from authoritative, licence-compatible sources
(for example USDA GRIN Taxonomy economic uses, where those terms allow it) and are cited
on the record. If we have no such source, the fields stay blank. Sourced toxic parts (for
example rhubarb leaves) are listed when we have them.

**Edible-part info is for cultivated crops. Don't use it to identify wild plants or for
foraging.**

## Growstuff and other projects

[Growstuff](https://www.growstuff.org/policy/api) structured data is CC BY-SA 3.0 Unported,
which is compatible if we attribute and share alike. Growstuff **member content** (posts,
comments, images) is a separate licence and is not imported. Growstuff **code** is
AGPL-3.0; we do not copy it. Some Growstuff facts come from the Australian Food
Composition Database (CC BY 4.0). We still do not use Growstuff, or any wiki-derived set,
as an authority for edibility, companions, spacing or unsourced prose.

GBIF occurrence dumps mix CC0, CC BY and CC BY-NC; we do not import mixed dumps. Prefer
Wikidata (CC0) for taxonomy. USDA PLANTS text and data are not copyrighted (PD-USGov);
PLANTS images may be copyrighted and are not imported. Practical Plants is mixed
CC BY-SA / CC BY-NC-SA and is not mass-imported. FAO ECOCROP was not given a clear
dataset licence on its page, so it is not imported.

## Photos and other assets

Wikimedia Commons photos are used only when the file itself is CC0, public domain, CC BY
or CC BY-SA. Author and licence appear on the picture. Climate regions use Beck et al.
(2018), CC BY 4.0. Country climate shares assign those 0.5° cells with Natural Earth Admin 0 1:50m boundaries (public domain); tiny territories fall back to a GeoNames city sample. Country-page map outlines are a simplified display extract of those same public-domain boundaries (derived file `data/country-outlines.json`; the shapefile is not committed). Offline place search and country names use GeoNames (`countryInfo`, `cities15000`, `admin1CodesASCII`), CC BY 4.0. Weather
is Open-Meteo, CC BY 4.0, fetched in the browser.

## Contributor credits

Each content page can show an “Edited by” line built from that file’s git history
(GitHub usernames, no email addresses, bots omitted). A one-time import from the rescue
dataset is credited with a link to that dataset and the original OpenFarm.cc project.
The **Sources** list on a page is published references only, not git authors.

## Reusing the JSON API

Static JSON is published with the site (see [API docs](https://karimogit.github.io/OpenFarm/api/)).
Reuse under CC BY-SA 4.0 (or CC0 where a record says so), with attribution to
“OpenFarm contributors” and to any upstream licences named on the record.
