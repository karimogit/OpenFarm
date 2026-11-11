import { loadGuides } from "../../scripts/guides.js";

export default function () {
  const byCrop = {};
  for (const { data } of loadGuides()) {
    const c = (byCrop[data.crop] ||= { slug: data.crop, common_name: data.common_name, scientific_name: data.scientific_name, family: data.family, variants: [] });
    c.variants.push(data);
  }
  return Object.values(byCrop).sort((a, b) => a.common_name.localeCompare(b.common_name));
}
