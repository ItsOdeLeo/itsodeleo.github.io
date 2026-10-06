#!/usr/bin/env node
// https://www.indexnow.org/documentation — notify only after Pages is live.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { JSDOM } = require("jsdom");
const yaml = require("js-yaml");

const ORIGIN = "https://itsodeleo.github.io";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const MANIFEST = "indexnow-manifest.json";
const digest = value => createHash("sha256").update(value).digest("hex");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function canonicalUrl(value) {
  const url = new URL(value);
  if (url.origin !== ORIGIN || url.username || url.password || url.search || url.hash ||
      url.href !== value || /\/index\.html$/.test(url.pathname) ||
      /(?:^|\/)(?:search|404)(?:\/|\.|$)/i.test(url.pathname) ||
      (!url.pathname.endsWith("/") && !url.pathname.endsWith(".html"))) {
    throw new Error(`Not a public canonical HTML URL on this site: ${value}`);
  }
  return value;
}

function pageHash(html, url) {
  canonicalUrl(url);
  const dom = new JSDOM(html, { url });
  try {
    const document = dom.window.document;
    const robots = [...document.querySelectorAll('meta[name="robots"], meta[name="bingbot"]')]
      .map(node => node.content).join(",");
    if (/(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/i.test(robots)) return null;
    const links = [...document.querySelectorAll('link[rel="canonical"]')];
    if (links.length !== 1 || links[0].href !== url) return null;
    const main = document.querySelector("main");
    if (!main) throw new Error(`Missing main content: ${url}`);
    // Exclude footer copyright years, build scripts, CSS and presentation-only
    // attributes. Authored text, links, images, dates and metadata still matter.
    main.querySelectorAll("script, style").forEach(node => node.remove());
    for (const node of main.querySelectorAll("*")) {
      for (const attr of [...node.attributes]) {
        if (!["href", "src", "srcset", "alt", "title", "lang", "datetime", "id"].includes(attr.name)) {
          node.removeAttribute(attr.name);
        }
      }
    }
    const metadata = [...document.querySelectorAll("meta[name], meta[property]")]
      .map(node => [node.getAttribute("name") || node.getAttribute("property"), node.content])
      .filter(([name]) => /^(?:description|author|robots|bingbot|og:|twitter:|article:)/i.test(name))
      .sort(([a], [b]) => a.localeCompare(b));
    const alternates = [...document.querySelectorAll('link[rel="alternate"][hreflang]')]
      .map(node => [node.hreflang, node.href]).sort(([a], [b]) => a.localeCompare(b));
    const schema = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(node => JSON.parse(node.textContent));
    return digest(JSON.stringify({ title: document.title, language: document.documentElement.lang,
      metadata, alternates, schema, content: main.innerHTML.replace(/>\s+</g, "><").trim() }));
  } finally {
    dom.window.close();
  }
}

function validateManifest(manifest) {
  if (manifest?.version !== 1 || manifest.origin !== ORIGIN ||
      !manifest.pages || Array.isArray(manifest.pages) || typeof manifest.pages !== "object") {
    throw new Error("Invalid live IndexNow manifest; refusing a blanket submission.");
  }
  for (const [url, hash] of Object.entries(manifest.pages)) {
    canonicalUrl(url);
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Invalid page fingerprint: ${url}`);
  }
  return manifest;
}

function buildManifest(directory) {
  const pages = {};
  const files = fs.readdirSync(directory, { recursive: true }).filter(file => file.endsWith(".html")).sort();
  for (const file of files) {
    const route = "/" + file.split(path.sep).join("/").replace(/index\.html$/, "");
    if (/(?:^|\/)(?:search|404)(?:\/|\.|$)/i.test(route)) continue;
    const url = new URL(route, ORIGIN).href;
    const hash = pageHash(fs.readFileSync(path.join(directory, file), "utf8"), url);
    if (hash) pages[url] = hash;
  }
  if (!Object.keys(pages).length) throw new Error("No indexable canonical HTML pages in build.");
  return validateManifest({ version: 1, origin: ORIGIN, pages });
}

function changedUrls(previous, current) {
  validateManifest(previous);
  validateManifest(current);
  return [...new Set([...Object.keys(previous.pages), ...Object.keys(current.pages)])]
    .filter(url => previous.pages[url] !== current.pages[url]).sort();
}

async function getPublic(url, { fetchFn = fetch, sleepFn = sleep, attempts = 3 } = {}) {
  if (new URL(url).origin !== ORIGIN) throw new Error("Public fetch must stay on the configured site.");
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchFn(url, { redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { "Cache-Control": "no-cache" } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
      return await response.text();
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await sleepFn(2000 * (attempt + 1));
    }
  }
}

async function previousManifest(options) {
  const existing = await getPublic(`${ORIGIN}/${MANIFEST}`, options);
  if (existing !== null) return validateManifest(JSON.parse(existing));
  const pages = {};
  const sitemap = await getPublic(`${ORIGIN}/sitemap.xml`, options);
  if (sitemap !== null) {
    const dom = new JSDOM(sitemap, { contentType: "application/xml" });
    let urls;
    try {
      if (dom.window.document.documentElement.localName !== "urlset") throw new Error("Expected a URL sitemap.");
      urls = [...dom.window.document.querySelectorAll("url > loc")].map(node => canonicalUrl(node.textContent.trim()));
    } finally {
      dom.window.close();
    }
    if (urls.length > 10000) throw new Error("Bootstrap sitemap exceeds 10,000 URLs; review batching first.");
    // One-time bootstrap compares actual live content, not source paths or old
    // git timestamps. A transient fetch failure must never become an empty map.
    for (const url of [...new Set(urls)]) {
      const html = await getPublic(url, options);
      const hash = html === null ? null : pageHash(html, url);
      if (hash) pages[url] = hash;
    }
  }
  return { version: 1, origin: ORIGIN, pages };
}

function validatePending(pending, key) {
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error("Invalid IndexNow key in configuration.");
  const payload = pending?.payload;
  if (pending?.version !== 1 || !/^[a-f0-9]{64}$/.test(pending.manifestDigest) ||
      payload?.host !== new URL(ORIGIN).host || payload.key !== key ||
      payload.keyLocation !== `${ORIGIN}/${key}.txt` || !Array.isArray(payload.urlList) ||
      payload.urlList.length > 10000 || new Set(payload.urlList).size !== payload.urlList.length) {
    throw new Error("Invalid IndexNow submission artifact.");
  }
  payload.urlList.forEach(canonicalUrl);
  return payload;
}

async function submit(pending, key, options = {}) {
  const payload = validatePending(pending, key);
  if (!payload.urlList.length) return "No changed indexable URLs; no IndexNow request sent.";
  const { fetchFn = fetch, sleepFn = sleep, attempts = 4 } = options;
  let ready = false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const [liveManifest, liveKey] = await Promise.all([
      getPublic(`${ORIGIN}/${MANIFEST}`, options), getPublic(payload.keyLocation, options)
    ]);
    if (liveManifest !== null && digest(liveManifest) === pending.manifestDigest && liveKey?.trim() === key) {
      ready = true;
      break;
    }
    if (attempt < attempts - 1) await sleepFn(10000 * (attempt + 1));
  }
  if (!ready) throw new Error("Deployed manifest or public key is not live yet. Retry the retained artifact after CDN propagation.");
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetchFn(ENDPOINT, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(payload) });
    } catch (error) {
      if (attempt === 2) throw error;
      await sleepFn(3000 * (attempt + 1));
      continue;
    }
    if (response.status === 200) return `HTTP 200: IndexNow received ${payload.urlList.length} changed URLs. Indexing is not guaranteed.`;
    if (response.status === 202) return `HTTP 202: IndexNow received ${payload.urlList.length} changed URLs; key validation is pending. Indexing is not confirmed.`;
    if (response.status >= 500 && attempt < 2) {
      await sleepFn(3000 * (attempt + 1));
      continue;
    }
    const reasons = { 400: "invalid request", 403: "key not validated", 422: "host, URLs or key rejected", 429: "rate limited; wait before retrying" };
    throw new Error(`IndexNow HTTP ${response.status}: ${reasons[response.status] || "request failed"}. Retain and retry the pending artifact; do not resubmit the whole site.`);
  }
}

function report(message, error = false) {
  console[error ? "error" : "log"](message);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### IndexNow\n\n${message}\n`);
  if (error && process.env.GITHUB_ACTIONS) console.error(`::warning::${message.replace(/[\r\n]/g, " ")}`);
}

async function main() {
  const [command, directory] = process.argv.slice(2);
  if (!["prepare", "submit"].includes(command) || !directory) throw new Error("Usage: node tools/indexnow.js <prepare|submit> <artifact-directory>");
  const root = path.resolve(__dirname, "..");
  const config = yaml.load(fs.readFileSync(path.join(root, "_config.yml"), "utf8"));
  if (config.url.replace(/\/$/, "") !== ORIGIN) throw new Error("IndexNow is restricted to the production GitHub Pages origin.");
  const key = config.indexnow?.key;
  const file = path.join(directory, "pending.json");
  if (command === "submit") return report(await submit(JSON.parse(fs.readFileSync(file, "utf8")), key));
  const output = path.join(root, config.public_dir || "public");
  if (fs.readFileSync(path.join(output, `${key}.txt`), "utf8").trim() !== key) throw new Error("Build is missing the correct public IndexNow key file.");
  const current = buildManifest(output);
  const previous = await previousManifest();
  const manifestText = JSON.stringify(current, null, 2) + "\n";
  const pending = { version: 1, manifestDigest: digest(manifestText), payload: {
    host: new URL(ORIGIN).host, key, keyLocation: `${ORIGIN}/${key}.txt`, urlList: changedUrls(previous, current)
  } };
  validatePending(pending, key);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(pending, null, 2) + "\n");
  fs.writeFileSync(path.join(output, MANIFEST), manifestText);
  report(`Prepared ${pending.payload.urlList.length} changed URLs for notification after deployment. The retained pending.json can be retried with node tools/indexnow.js submit <artifact-directory>.`);
}

if (require.main === module) main().catch(error => {
  report(`IndexNow failed: ${error.message}`, true);
  process.exitCode = 1;
});
module.exports = { ORIGIN, ENDPOINT, MANIFEST, digest, canonicalUrl, pageHash, buildManifest,
  changedUrls, previousManifest, validatePending, submit };
