// Minimal CDP screenshotter using Node 22's built-in WebSocket.
// Usage: node scripts/cdp-shot.mjs <url> <outfile> [settleMs] [clickText]
import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const [url, outfile, settleMs = "3000", clickText] = process.argv.slice(2);
if (!url || !outfile) { console.error("usage: node cdp-shot.mjs <url> <outfile> [settleMs]"); process.exit(1); }

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/chrome-cdp", "--window-size=1280,800", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page;
    } catch { /* chrome not up yet */ }
    await sleep(300);
  }
  throw new Error("chrome did not start");
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
await new Promise((r) => { ws.onopen = r; });

await send("Page.enable");
await send("Page.navigate", { url });
await sleep(Number(settleMs));
if (clickText) {
  await send("Runtime.evaluate", {
    expression: `(() => {
      const els = [...document.querySelectorAll("button, a, span, div")];
      const el = els.find((e) => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(clickText)});
      if (el) { el.click(); return true; } return false;
    })()`,
  });
  await sleep(800);
}
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(outfile, Buffer.from(shot.result.data, "base64"));
console.log("saved", outfile);
ws.close();
chrome.kill();
process.exit(0);
