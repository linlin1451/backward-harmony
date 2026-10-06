// Bundles index.html, styles.css and src/*.js into one self-contained file: dist/backward-harmony.html
// Usage: npm run build:single
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const order = ["theory", "generator", "voicing", "audio", "midi", "app"];
const js = order.map((name) => `// ---- src/${name}.js\n` + readFileSync(`src/${name}.js`, "utf8")
  .replace(/^import[^;]+;[ \t]*\n/gm, "")
  .replace(/^export\s+(?=(const|let|function|async|class)\b)/gm, "")).join("\n");
const css = readFileSync("styles.css", "utf8");
const html = readFileSync("index.html", "utf8")
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="src/app.js"></script>', () => `<script>\n(() => {\n${js}\n})();\n</script>`);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/backward-harmony.html", html);
console.log("Wrote dist/backward-harmony.html");
