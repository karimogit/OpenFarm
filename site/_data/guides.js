import markdownIt from "markdown-it";
import { loadGuides } from "../../scripts/guides.js";

const md = markdownIt({ html: false, linkify: true, typographer: true });

export default function () {
  return loadGuides().map((g) => ({ ...g.data, file: g.file, html: md.render(g.body) }));
}
