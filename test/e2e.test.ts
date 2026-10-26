// Real Chrome, real model: Whisper runs in the page's worker, on static or on
// a microphone that plays a recording. Needs `npm run build` and Chrome.
import assert from "node:assert/strict";
import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { serve } from "./helpers/serve.ts";

const CHROME =
  process.env.CHROME_PATH ||
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
if (!CHROME && process.env.CI) throw new Error("Chrome not found; set CHROME_PATH");

const PORT = 4330;
const BASE = `http://127.0.0.1:${PORT}`;
const RESULTS = path.resolve("test-results");
const WIDTHS = [320, 390, 768, 1280];

let server: http.Server;
const browsers: Browser[] = [];

async function launch(): Promise<Browser> {
  const b = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      ...(process.env.CI ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
    ],
  });
  browsers.push(b);
  return b;
}

before(async () => {
  if (!CHROME) return;
  assert.ok(fs.existsSync("out/index.html"), "run npm run build first");
  server = await serve("out", PORT);
});
after(async () => {
  for (const b of browsers) await b.close();
  server?.close();
});

// Runs in the page: anything wider than the viewport or spilling out of its box.
function layoutProblems() {
  const vw = document.documentElement.clientWidth;
  const out: string[] = [];
  const desc = (el: Element) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className || "").replace(/\s+/g, ".")} "${((el as HTMLElement).innerText || "").trim().slice(0, 30)}"`;
  if (document.documentElement.scrollWidth > vw) out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px > ${vw}px)`);
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (el.closest("[aria-hidden=true], svg, details:not([open])")) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) out.push(`off screen: ${desc(el)}`);
    // the log rows cut long lines with an ellipsis on purpose
    if (el.matches(".row .said")) continue;
    if (!["INPUT", "SELECT"].includes(el.tagName) && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) out.push(`content wider than its box: ${desc(el)}`);
  }
  return [...new Set(out)];
}

const QUIET = /status of 404|favicon/;

async function open(b: Browser, url: string, width = 390, errors: string[] = [], setup?: (p: Page) => Promise<void>): Promise<Page> {
  const page = await b.newPage();
  await setup?.(page);
  await page.setViewport({ width, height: 860 });
  page.on("pageerror", (e) => errors.push(e instanceof Error ? e.message : String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !QUIET.test(m.text())) errors.push(m.text());
  });
  await page.goto(BASE + url, { waitUntil: "networkidle0" });
  return page;
}

async function checkLayout(page: Page, name: string) {
  const problems = await page.evaluate(layoutProblems);
  if (problems.length) {
    fs.mkdirSync(RESULTS, { recursive: true });
    await page.screenshot({ path: path.join(RESULTS, `${name}.png`), fullPage: true });
  }
  assert.deepEqual(problems, [], name);
}

// A microphone that hears a recording, on a loop. (Chrome's own
// --use-file-for-fake-audio-capture gives silence on macOS.) Everything after
// getUserMedia is the page's real capture path.
function micPlaying(file: string) {
  const data = fs.readFileSync(file).toString("base64");
  return (page: Page) =>
    page.evaluateOnNewDocument((b64) => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext();
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const src = ctx.createBufferSource();
        src.buffer = await ctx.decodeAudioData(bytes.buffer);
        src.loop = true;
        const dest = ctx.createMediaStreamDestination();
        src.connect(dest);
        src.start();
        return dest.stream;
      };
    }, data).then(() => undefined);
}

const voiceText = (page: Page) => page.$eval("[data-testid=voice]", (e) => (e as HTMLElement).innerText);

// waits for the n-th thing to come through (counting the one on stage and the log)
async function waitForVoices(page: Page, n: number, timeout = 120000) {
  await page.waitForFunction((k) => document.querySelectorAll("[data-testid=voice], .log li").length >= k, { timeout }, n);
}

async function chooseLanguage(page: Page, value: string) {
  await page.select(".controls select", value);
}

describe("pages", { skip: !CHROME }, () => {
  test("intro, register and a missing page fit at every width", async () => {
    const b = await launch();
    for (const url of ["/", "/register/", "/nobody-here/"]) {
      for (const w of WIDTHS) {
        const errors: string[] = [];
        const page = await open(b, url, w, errors);
        await checkLayout(page, `${url.replace(/\W+/g, "_")}${w}`);
        assert.deepEqual(errors, []);
        await page.close();
      }
    }
  });

  test("the register shows the numbers from the sweep", async () => {
    const b = await launch();
    const page = await open(b, "/register/");
    const text = await page.evaluate(() => document.body.innerText);
    const sweep = JSON.parse(fs.readFileSync("data/sweep.json", "utf8")) as { rows: { outcome: string }[] };
    assert.match(text, new RegExp(`listened to ${sweep.rows.length} windows of nothing`));
    assert.match(text, new RegExp(`\\b${sweep.rows.filter((r) => r.outcome === "kept").length}\\s+would reach a transcript`));
    assert.match(text, /TV GELDERLAND 2020\./);
    assert.match(text, /Редактор субтитров/);
    const dutch = sweep.rows.filter((r) => /TV GELDERLAND/.test((r as unknown as { text: string }).text)).length;
    assert.match(text, new RegExp(`got past the guard ${dutch} of ${dutch}`));
    await page.close();
  });

  test("the intro asks in six languages", async () => {
    const b = await launch();
    const page = await open(b, "/");
    const asks = await page.$$eval(".asks span", (s) => s.map((e) => e.getAttribute("lang")));
    assert.deepEqual(asks, ["hi", "ru", "ja", "es", "nl", "zh"]);
    await page.close();
  });
});

describe("the séance, on static", { skip: !CHROME }, () => {
  let b: Browser;
  before(async () => {
    b = await launch();
  });

  test("in Dutch, the TV credit comes through and Whisper's guard would let it", async () => {
    const errors: string[] = [];
    const page = await open(b, "/?seed=7&quick", 390, errors);
    await chooseLanguage(page, "nl");
    await page.locator("button ::-p-text(Listen to static)").click();
    await page.waitForSelector("[data-testid=voice]", { timeout: 120000 });
    const text = await voiceText(page);
    assert.match(text, /TV GELDERLAND/);
    assert.match(text, /Asked in Dutch/);
    assert.match(text, /A name from the credits/);
    assert.match(text, /Its guard would have let this through/);
    assert.match(text, /Whisper is \d+% sure nobody spoke/);
    // the decoder table: one row per piece, with how sure it was
    await page.locator("[data-testid=voice] summary").click();
    const rows = await page.$$eval("[data-testid=voice] .decoder tbody tr", (r) => r.map((x) => (x as HTMLElement).innerText));
    assert.ok(rows.length >= 3);
    assert.ok(rows.every((r) => /\d+%/.test(r)));
    await waitForVoices(page, 4);
    await checkLayout(page, "seance-390");
    assert.deepEqual(errors, []);
    await page.locator("button ::-p-text(End the séance)").click();
    await page.waitForSelector("button ::-p-text(Listen to this room)");
    await page.close();
  });

  test("a sweep moves through the languages in order", async () => {
    const page = await open(b, "/?seed=3&quick", 1280);
    await chooseLanguage(page, "sweep");
    await page.locator("button ::-p-text(Listen to static)").click();
    await waitForVoices(page, 3);
    // the log lists the older ones, newest first: the first two windows of a sweep are Dutch, then Russian
    const langs = await page.$$eval(".log li .lang", (s) => s.map((e) => (e as HTMLElement).innerText));
    assert.deepEqual(langs.slice(-2).reverse(), ["Dutch", "Russian"]);
    await page.close();
  });

  test("with Whisper's guard on, the silence is dropped but the credits still get through", async () => {
    const page = await open(b, "/?seed=11&quick", 768);
    await chooseLanguage(page, "sweep");
    await page.locator("label ::-p-text(Whisper's guard on)").click();
    await page.locator("button ::-p-text(Listen to static)").click();
    await waitForVoices(page, 6);
    const rows = await page.$$eval(".log li .row", (r) => r.map((x) => (x as HTMLElement).innerText));
    const dutch = rows.find((r) => r.startsWith("Dutch"));
    assert.ok(dutch && /TV GELDERLAND/.test(dutch), rows.join("\n"));
    assert.ok(rows.some((r) => /…/.test(r) && /dropped/.test(r)), rows.join("\n"));
    await checkLayout(page, "guard-768");
    await page.close();
  });

  test("settings are remembered", async () => {
    const page = await open(b, "/");
    await chooseLanguage(page, "ta");
    await page.locator("label ::-p-text(Let it speak)").click();
    await page.reload({ waitUntil: "networkidle0" });
    assert.equal(await page.$eval(".controls select", (s) => (s as HTMLSelectElement).value), "ta");
    assert.equal(await page.$eval(".controls input[type=checkbox]:nth-of-type(1)", () => (document.querySelectorAll(".controls input[type=checkbox]")[1] as HTMLInputElement).checked), false);
    await page.evaluate(() => localStorage.clear());
    await page.close();
  });
});

describe("the séance, in a room", { skip: !CHROME }, () => {
  test("a quiet room: something comes through, from the room", async () => {
    const b = await launch();
    const errors: string[] = [];
    const page = await open(b, "/", 390, errors, micPlaying("test/fixtures/quiet-room.wav"));
    await chooseLanguage(page, "ru");
    await page.locator("button ::-p-text(Listen to this room)").click();
    await page.waitForSelector("[data-testid=voice]", { timeout: 120000 });
    const text = await voiceText(page);
    assert.match(text, /from the room/);
    assert.match(text, /Asked in Russian/);
    assert.match(text, /sure nobody spoke/);
    assert.deepEqual(errors, []);
    await page.close();
  });

  test("a person talking is recognised as a living voice", async () => {
    const b = await launch();
    const page = await open(b, "/", 390, [], micPlaying("test/fixtures/hello.wav"));
    await chooseLanguage(page, "en");
    await page.locator("button ::-p-text(Listen to this room)").click();
    // the recording loops, so every window has most of the sentence in it
    await page.waitForSelector("[data-testid=voice]", { timeout: 120000 });
    const text = await voiceText(page);
    assert.match(text, /A living voice/);
    assert.match(text, /anyone there/i);
    // a living voice isn't one of the spirits
    assert.doesNotMatch(text, /Not in the register yet/);
    await page.close();
  });

  test("a blocked microphone says so, and static still works", async () => {
    const b = await launch();
    const page = await b.newPage();
    await page.evaluateOnNewDocument(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    });
    await page.goto(BASE + "/?quick", { waitUntil: "networkidle0" });
    await page.locator("button ::-p-text(Listen to this room)").click();
    await page.waitForSelector("[role=alert]");
    assert.match(await page.$eval("[role=alert]", (e) => (e as HTMLElement).innerText), /microphone is blocked/);
    await page.locator("button ::-p-text(Listen to static)").click();
    await page.waitForSelector("[data-testid=voice]", { timeout: 120000 });
    await page.close();
  });
});

describe("offline", { skip: !CHROME }, () => {
  test("after one visit, the séance works with the network off", async () => {
    const b = await launch();
    const page = await open(b, "/?seed=5&quick");
    // first visit online: the worker caches the page, Transformers.js caches Whisper
    await page.locator("button ::-p-text(Listen to static)").click();
    await page.waitForSelector("[data-testid=voice]", { timeout: 120000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    // a second visit so every script the page needs has passed through the worker
    await page.reload({ waitUntil: "networkidle0" });
    await page.locator("button ::-p-text(Listen to static)").click();
    await page.waitForSelector("[data-testid=voice]", { timeout: 120000 });

    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await chooseLanguage(page, "nl");
    await page.locator("button ::-p-text(Listen to static)").click();
    await page.waitForSelector("[data-testid=voice]", { timeout: 120000 });
    assert.match(await voiceText(page), /TV GELDERLAND/);
    await page.goto(BASE + "/register/", { waitUntil: "load" });
    assert.match(await page.evaluate(() => document.body.innerText), /The register/);
    await page.setOfflineMode(false);
    await page.close();
  });
});
