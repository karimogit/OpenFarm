import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../scripts/content.js";

export default function () {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data/countries.json"), "utf8"));
}
