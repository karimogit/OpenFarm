import { scientificMarkup, scientificText } from "./sci.js";

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

ok(scientificText(null, "Malus domestica", "Elstar") === "Malus domestica 'Elstar'", "crop species + cultivar (ICNCP)");
ok(scientificMarkup(null, "Malus domestica", "Elstar").includes('class="lat"') && scientificMarkup(null, "Malus domestica", "Elstar").includes("&#39;Elstar&#39;"), "markup italicizes Latin, not cultivar");
ok(scientificText("Allium sativum var. ophioscorodon", "Allium sativum", "Hardneck") === "Allium sativum var. ophioscorodon", "sourced var. name is kept; cultivar not invented onto it");
ok(scientificMarkup("Allium sativum var. ophioscorodon", "Allium sativum").includes("var.") && !/lat">var\./.test(scientificMarkup("Allium sativum var. ophioscorodon", "Allium sativum")), "var. is not italic");
ok(scientificText("Malus pumila", "Malus domestica", "Fuji") === "Malus pumila 'Fuji'", "use sourced variety binomial when present");
ok(scientificText(null, "Allium sativum", "Van Zerden") === "Allium sativum 'Van Zerden'", "fallback to crop species + cultivar");
ok(scientificText("Malus domestica 'Elstar'", "Malus domestica") === "Malus domestica 'Elstar'", "quotes already in the sourced name");
ok(scientificText("Malus domestica × M. sylvestris", "Malus domestica", "Granny Smith") === "Malus domestica × M. sylvestris 'Granny Smith'", "hybrid + cultivar");
ok(!scientificMarkup(null, null, "Elstar"), "no name, no markup");
ok(!scientificMarkup("<script>", "Foo", "x").includes("<script>"), "escapes HTML in names");

if (failed) { console.error(`\n${failed} sci test(s) failed.`); process.exit(1); }
console.log("✓ scientific name tests passed");
