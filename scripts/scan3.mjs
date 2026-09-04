import fs from "fs";
const t = fs.readFileSync("lib/report.ts", "utf8");
// temukan semua baris yang mengandung karakter > 127 dan tampilkan dengan escape
for (const [f] of [["lib/report.ts"]].flat()) {
  const lines = t.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const weird = [...lines[i]].filter(c => c.charCodeAt(0) > 127);
    if (weird.length) {
      const esc = weird.map(c => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(",");
      console.log(`${f}:${i + 1} [${esc}] ${lines[i].trim().slice(0, 110)}`);
    }
  }
}
