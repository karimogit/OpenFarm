# Köppen-Geiger climate data

`Beck_KG_V1_present_0p5.tif` is the **present-day (1980–2016) Köppen-Geiger
classification at 0.5° resolution** (360 × 720 cells) from:

> Beck, H.E., N.E. Zimmermann, T.R. McVicar, N. Vergopolan, A. Berg, E.F. Wood (2018).
> Present and future Köppen-Geiger climate classification maps at 1-km resolution.
> *Scientific Data* 5:180214. https://doi.org/10.1038/sdata.2018.214

- Dataset home: https://www.gloh2o.org/koppen/
- License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**,
  as stated by the authors on gloh2o.org. The file is redistributed unmodified.
- SHA-256: `4dcc0f4a6343af2ac354c4a9676262510c3a96acceab2d992a6c2f5e86659756`
- `legend.txt` maps cell values 1–30 to Köppen symbols and colours (0 = ocean / no data).

`scripts/build_koppen.py` turns this GeoTIFF into two small browser assets:

- `site/assets/koppen-0p5.bin` – run-length-encoded grid used for the offline
  location → climate lookup (no server, no API).
- `site/assets/koppen-mercator.png` – a colour map reprojected to Web Mercator for
  the map overlay.

A coarse 0.5° grid (~55 km at the equator) is deliberately used to keep the site
tiny. Mountains, coasts and small islands can be misclassified at this
resolution; the site tells users to double-check. Upgrading to Beck et al. (2023)
V2/V3 (1991–2020, also CC BY 4.0) at 0.1° is on the roadmap.
