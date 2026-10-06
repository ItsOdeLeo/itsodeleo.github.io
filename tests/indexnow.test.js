const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ORIGIN, ENDPOINT, MANIFEST, digest, canonicalUrl, pageHash, buildManifest,
  changedUrls, previousManifest, submit } = require("../tools/indexnow");

const url = route => ORIGIN + route;
const key = "a".repeat(64);
const html = (route = "/", { content = "Original", robots = "index, follow", canonical = url(route), year = 2026, theme = "light" } = {}) => `<!doctype html>
  <html lang="en"><head><title>Article title</title><meta name="description" content="An original essay">
  <meta name="robots" content="${robots}"><link rel="canonical" href="${canonical}"></head>
  <body><main><article class="${theme}"><h1>Article title</h1><p>${content}</p></article></main>
  <footer>© ${year}</footer><script>const buildTime = "${year}";</script></body></html>`;
const manifest = pages => ({ version: 1, origin: ORIGIN, pages });
const hash = "1".repeat(64);
const sleepFn = async () => {};
const response = (status, body = "") => new Response(body, { status });

test("fingerprints follow content and metadata while ignoring footer years, scripts and cosmetic classes", () => {
  const original = pageHash(html(), url("/"));
  assert.equal(original, pageHash(html("/", { year: 2030, theme: "dark" }), url("/")));
  assert.notEqual(original, pageHash(html("/", { content: "An edited essay" }), url("/")));
  assert.notEqual(original, pageHash(html().replace("An original essay", "A more precise description"), url("/")));
  assert.notEqual(original, pageHash(html("/", { content: '<a href="/about/">Author</a>' }), url("/")));
  assert.equal(pageHash(html("/", { robots: "noindex, follow" }), url("/")), null);
  assert.equal(pageHash(html("/", { canonical: url("/elsewhere/") }), url("/")), null);
});

test("built manifest excludes search, error pages, feeds and noncanonical/noindex pages", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "indexnow-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [file, content] of Object.entries({ "index.html": html(),
    "zh/index.html": html("/zh/"), "search/index.html": html("/search/"),
    "404.html": html("/404.html"), "hidden/index.html": html("/hidden/", { robots: "none" }),
    "alias/index.html": html("/alias/", { canonical: url("/") }), "atom.xml": "<feed/>" })) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  const current = buildManifest(dir);
  assert.deepEqual(Object.keys(current.pages), [url("/"), url("/zh/")]);
  assert.deepEqual(changedUrls(current, current), [], "identical deployments send nothing");
  const next = manifest({ [url("/")]: "2".repeat(64), [url("/new/")]: hash });
  assert.deepEqual(changedUrls(current, next), [url("/"), url("/new/"), url("/zh/")], "new, edited and removed/noindex pages are notified");
});

test("submissions only permit canonical HTTPS HTML URLs for the production host", () => {
  for (const value of ["http://itsodeleo.github.io/", "http://127.0.0.1/", "https://example.com/",
    url("/?lang=zh"), url("/#top"), url("/index.html"), url("/atom.xml"), url("/search/"), url("/zh/search/"), url("/404.html")]) {
    assert.throws(() => canonicalUrl(value), /Not a public canonical/);
  }
  assert.equal(canonicalUrl(url("/posts/essay_zh/")), url("/posts/essay_zh/"));
});

test("first setup compares actual sitemap pages instead of blindly notifying all existing pages", async () => {
  const requests = [];
  const previous = await previousManifest({ sleepFn, fetchFn: async request => {
    requests.push(request);
    if (request.endsWith(MANIFEST)) return response(404);
    if (request.endsWith("sitemap.xml")) return response(200, `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url("/")}</loc></url></urlset>`);
    assert.equal(request, url("/"));
    return response(200, html());
  } });
  assert.equal(previous.pages[url("/")], pageHash(html(), url("/")));
  assert.equal(requests.length, 3);
  assert.deepEqual(changedUrls(previous, previous), []);
});

test("failed baseline retrieval never becomes an empty baseline or blanket notification", async () => {
  let calls = 0;
  await assert.rejects(previousManifest({ sleepFn, fetchFn: async () => { calls++; return response(503); } }), /HTTP 503/);
  assert.equal(calls, 3, "network retries are bounded");
  await assert.rejects(previousManifest({ sleepFn, fetchFn: async () => response(200, "{}") }), /Invalid live/);
});

function fixture(status) {
  const text = JSON.stringify(manifest({ [url("/")]: hash }));
  const pending = { version: 1, manifestDigest: digest(text), payload: {
    host: "itsodeleo.github.io", key, keyLocation: url(`/${key}.txt`), urlList: [url("/")]
  } };
  const posts = [];
  return { pending, posts, options: { sleepFn, fetchFn: async (request, options) => {
    if (request.endsWith(MANIFEST)) return response(200, text);
    if (request.endsWith(`${key}.txt`)) return response(200, key + "\n");
    assert.equal(request, ENDPOINT);
    assert.equal(options.redirect, "error");
    posts.push(JSON.parse(options.body));
    return response(status);
  } } };
}

test("200 and 202 are reported accurately after live manifest and key verification", async () => {
  for (const status of [200, 202]) {
    const { pending, posts, options } = fixture(status);
    const result = await submit(pending, key, options);
    assert.match(result, new RegExp(`HTTP ${status}`));
    assert.match(result, status === 202 ? /key validation is pending/ : /Indexing is not guaranteed/);
    assert.deepEqual(posts, [pending.payload]);
  }
});

test("stale deployment, bad key and rate limiting do not silently succeed or submit extra URLs", async () => {
  const stale = fixture(200);
  stale.pending.manifestDigest = "0".repeat(64);
  await assert.rejects(submit(stale.pending, key, { ...stale.options, attempts: 2 }), /not live yet/);
  assert.equal(stale.posts.length, 0);
  await assert.rejects(submit(stale.pending, "different-key", stale.options), /Invalid IndexNow submission/);
  for (const status of [403, 422, 429]) {
    const { pending, posts, options } = fixture(status);
    await assert.rejects(submit(pending, key, options), new RegExp(`HTTP ${status}`));
    assert.equal(posts.length, 1, "rejected requests are not blindly retried");
  }
  const unchanged = fixture(200);
  unchanged.pending.payload.urlList = [];
  assert.match(await submit(unchanged.pending, key, unchanged.options), /no IndexNow request/);
  assert.equal(unchanged.posts.length, 0);
});
