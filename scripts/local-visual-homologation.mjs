import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const outputDir = path.join(process.cwd(), "artifacts", "automatic-scoring-homologation");
await mkdir(outputDir, { recursive: true });
const debuggingPort = 10_000 + Math.floor(Math.random() * 20_000);
const browser = spawn(edge, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${path.join(outputDir, `edge-profile-${Date.now()}`)}`,
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let version;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try { version = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/version`)).json(); break; } catch { await sleep(500); }
}
if (!version) throw new Error("Edge DevTools did not start");
const pageInfo = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/new?http://127.0.0.1:3100`, { method: "PUT" })).json();
const socket = new WebSocket(pageInfo.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  const handler = pending.get(message.id);
  if (handler) {
    clearTimeout(handler.timeout);
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  }
});
function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Edge DevTools timed out: ${method}`)); }, 30_000);
    pending.set(id, { resolve, reject, timeout });
  });
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function navigate(url) {
  await command("Page.navigate", { url });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(250);
    if (await evaluate("document.readyState === 'complete'")) return;
  }
  throw new Error(`Timed out navigating to ${url}`);
}
async function login(email) {
  await navigate("http://127.0.0.1:3100");
  const response = await evaluate(`fetch('http://127.0.0.1:3100/api/auth/login', {method:'POST', headers:{'content-type':'application/json'}, credentials:'include', body:JSON.stringify({email:${JSON.stringify(email)},password:'Homologacao!2026'})}).then(async r=>({status:r.status,body:await r.text()}))`);
  if (response.status !== 200) throw new Error(`Login failed for ${email}: ${response.status} ${response.body}`);
}
async function capture(name, width, height, url, expectedText) {
  await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await navigate(url);
  let state;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(500);
    state = await evaluate(`({title:document.title,text:document.body.innerText.slice(0,12000),width:innerWidth,scrollWidth:document.documentElement.scrollWidth})`);
    if (!expectedText || state.text.toLowerCase().includes(expectedText.toLowerCase())) break;
  }
  if (state.width !== width || state.scrollWidth > width + 1) throw new Error(`Responsive overflow at ${name}: ${JSON.stringify(state)}`);
  const expectedFound = !expectedText || state.text.toLowerCase().includes(expectedText.toLowerCase());
  if (!expectedFound) throw new Error(`Expected text was not rendered at ${name}: ${expectedText}`);
  const image = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path.join(outputDir, `${name}-${width}x${height}.png`), Buffer.from(image.data, "base64"));
  console.log(JSON.stringify({ name, width, height, title: state.title, expectedText, expectedFound, overflow: false, text: state.text.slice(0, 180) }));
}

try {
  const schoolId = process.argv[2];
  if (!schoolId) throw new Error("school id is required");
  await command("Page.enable");
  await command("Runtime.enable");
  await login("aluno@homolog.local");
  await capture("student-dashboard", 390, 844, "http://127.0.0.1:3100/dashboard", "Aluno Fictício");
  await login("educador@homolog.local");
  await capture("educator-points", 768, 1024, "http://127.0.0.1:3100/points", "Atividades");
  await login("admin@homolog.local");
  await capture("admin-school-mobile", 390, 844, `http://127.0.0.1:3100/schools/${schoolId}`, "Pontuação");
  await capture("admin-school-tablet", 768, 1024, `http://127.0.0.1:3100/schools/${schoolId}`, "homologação");
  await capture("admin-school-desktop", 1440, 1000, `http://127.0.0.1:3100/schools/${schoolId}`, "PendÃªncias de estorno");
  await login("superadmin@homolog.local");
  await capture("superadmin-school", 1440, 1000, `http://127.0.0.1:3100/schools/${schoolId}`, "PendÃªncias de estorno");
} finally {
  socket.close();
  browser.kill();
}
