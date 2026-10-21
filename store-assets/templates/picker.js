/* global document */
// Paints the mock picker rows. Brand colors are the packaged default palette.
const GRAYS = ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff"];
const BRAND = ["#F9F4EB", "#9BDCD7", "#FE5917", "#EABF26", "#E69C9C", "#385834", "#1A2D27"];
const STANDARD = ["#000000", "#ffffff", "#4a86e8", "#ea4335", "#f4c232", "#34a853", "#f07d1a", "#46bdc6"];
for (const [id, colors] of [["grays", GRAYS], ["brand", BRAND], ["standard", STANDARD]]) {
  const row = document.getElementById(id);
  if (!row) continue;
  for (const c of colors.slice(0, Number(row.dataset.max ?? colors.length))) {
    const d = document.createElement("span");
    d.className = "dot";
    d.style.background = c;
    row.append(d);
  }
}
