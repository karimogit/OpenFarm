// Per-file "Edited by" lists from git history. Usernames only; never emails; bots omitted.
import { execFileSync } from "node:child_process";
import { ROOT } from "../../scripts/content.js";

const BOT = /\[bot\]$|^bot$|dependabot|github-actions|web-flow|renovate|imgbot|renovate-bot/i;

function username(name, email) {
  const e = String(email || "").toLowerCase();
  const m = e.match(/^(?:\d+\+)?([a-z0-9-]+)@users\.noreply\.github\.com$/i);
  if (m) return m[1];
  const n = String(name || "").trim();
  if (/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i.test(n)) return n;
  return null;
}

export default function credits() {
  const map = Object.create(null);
  let out = "";
  try {
    out = execFileSync("git", ["-C", ROOT, "log", "--name-only", "--pretty=format:%x1e%aN%x09%aE"], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch {
    return map;
  }
  for (const chunk of out.split("\x1e")) {
    if (!chunk.trim()) continue;
    const [header, ...files] = chunk.split("\n");
    const [name, email] = (header || "").split("\t");
    if (BOT.test(name || "") || BOT.test(email || "")) continue;
    const user = username(name, email);
    if (!user) continue;
    for (const file of files) {
      const f = file.trim();
      if (!f || !f.startsWith("content/")) continue;
      const list = (map[f] ||= []);
      if (!list.includes(user)) list.push(user);
    }
  }
  return map;
}
