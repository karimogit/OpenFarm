# Contributing to OpenFarm

Thanks for helping! OpenFarm is **content-first**: the most valuable contribution is
a good, sourced growing guide for a crop in *your* climate.

## Add or improve a guide

1. Find your Köppen-Geiger class – pick your location on the
   [site](https://karimogit.github.io/OpenFarm/) or check the
   [Köppen map](https://www.gloh2o.org/koppen/).
2. Look in `content/guides/<crop>/`. If a variant already covers your class, improve
   it. Otherwise copy [`content/TEMPLATE.md`](content/TEMPLATE.md) to
   `content/guides/<crop>/<variant>.md`.
3. Fill in the frontmatter. The [JSON Schema](schema/guide.schema.json) is the source
   of truth for every field.
4. Write the body in plain Markdown with at least one `## ` section. Keep it practical:
   timing, spacing, care, harvest, common problems.
5. Run `npm ci && npm run validate`, or just open a pull request – CI validates it.

You can do all of this in the GitHub web editor ("✏️ Improve this guide on GitHub"
on every guide page) without installing anything.

## Content rules

- **Real sources only.** Every guide needs at least one public source (extension
  service, horticultural society, government agency, FAO, peer-reviewed paper,
  reputable seed company). Never invent citations. Personal experience is welcome
  in the text, but say so.
- **Flag uncertainty.** Use `confidence` honestly and explain doubts in `uncertainty`.
  A calendar adapted from a similar climate is fine if you say so.
- **Companion planting** claims are often folklore. Use `evidence: traditional` unless
  you cite research.
- **One Köppen class per crop per hemisphere.** Two variants of a crop must not claim
  the same class and hemisphere (CI checks this). Split or merge variants instead.
- **Hemisphere.** Write months for the hemisphere you know. The site shifts northern
  calendars by six months for southern locations and labels that as unverified, so a
  native southern-hemisphere variant is always better.
- **AI-assisted writing is welcome**, but a human must check every fact against the
  listed sources before the pull request is merged.

## License of contributions

- Guide content (`content/`) is licensed **CC BY-SA 4.0**. By contributing content
  you agree to release it under that license.
- Code (everything else) is **MIT**.
- Don't paste copyrighted text from sources – summarise in your own words and link.

## Code contributions

```bash
npm ci
npm run dev        # http://localhost:8080/OpenFarm/
npm run build      # validate + build to _site/
```

The site is plain [Eleventy](https://www.11ty.dev/) + a small vanilla-JS module
(`site/assets/js/app.js`) + Leaflet. Please keep it fast, static and dependency-light.

## Code of conduct

Be kind, assume good faith, and remember that gardeners in every climate know things
you don't.
