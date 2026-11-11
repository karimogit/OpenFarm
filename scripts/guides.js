// Shared loader: reads content/guides/<crop>/<variant>.md (YAML frontmatter + Markdown).
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const GUIDES_DIR = path.join(ROOT, "content", "guides");

export function loadGuides() {
  const out = [];
  for (const crop of fs.readdirSync(GUIDES_DIR).sort()) {
    const dir = path.join(GUIDES_DIR, crop);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith(".md")) continue;
      const full = path.join(dir, file);
      const parsed = matter(fs.readFileSync(full, "utf8"));
      const data = { ...parsed.data };
      if (data.last_reviewed instanceof Date) data.last_reviewed = data.last_reviewed.toISOString().slice(0, 10);
      out.push({ file: path.relative(ROOT, full), folder: crop, slug: file.replace(/\.md$/, ""), data, body: parsed.content });
    }
  }
  return out;
}
