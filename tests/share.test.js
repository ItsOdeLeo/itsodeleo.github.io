const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ejs = require("ejs");
const yaml = require("js-yaml");
const { JSDOM } = require("jsdom");
const { shareMetadata } = require("../lib/share");
const localization = require("../lib/localization");

const root = path.resolve(__dirname, "..");
const read = filename => fs.readFileSync(path.join(root, filename), "utf8");
const config = yaml.load(read("_config.yml"));
const origin = config.url.replace(/\/+$/, "");
const script = () => read("themes/paper/source/js/share.js");
const pageFor = lang => ({
  title: lang === "zh" ? "选择与语义：需要微调吗？" : 'Do "choices" & meaning need fine-tuning?',
  path: `posts/example${lang === "zh" ? "_zh" : ""}/`,
  source: `_posts/example${lang === "zh" ? "_zh" : ""}.md`,
  lang, published: true
});

function markup(lang = "en", overrides = {}, count = 1) {
  const page = { ...pageFor(lang), ...overrides };
  const share = shareMetadata(config, page);
  return Array.from({ length: count }, (_, index) => ejs.render(read("themes/paper/layout/partials/share.ejs"), {
    config, page, postLanguage: lang, position: index ? "bottom" : "top",
    articleShare: () => share,
    url_for: value => "/" + value.replace(/^\/+/, ""),
    localText: key => localization.text(key, lang)
  })).join("\n");
}

async function browser(t, options = {}) {
  const lang = options.lang || "en";
  const html = `<html lang="${lang}"><body>${markup(lang, options.page, options.count || 1)}</body></html>`;
  const dom = new JSDOM(html, { url: options.url || origin + pageFor(lang).path.replace(/^/, "/"), runScripts: "outside-only" });
  t.after(() => dom.window.close());
  await new Promise(resolve => dom.window.document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  Object.defineProperty(dom.window, "isSecureContext", { value: options.secure !== false });
  if (options.clipboard !== undefined) Object.defineProperty(dom.window.navigator, "clipboard", { value: options.clipboard });
  if (options.share !== undefined) Object.defineProperty(dom.window.navigator, "share", { value: options.share });
  if (options.canShare !== undefined) Object.defineProperty(dom.window.navigator, "canShare", { value: options.canShare });
  dom.window.eval(script());
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  return dom;
}

const settle = () => new Promise(setImmediate);
const group = dom => dom.window.document.querySelector("[data-share]");
const control = (root, name) => root.querySelector(`[data-share-${name}]`);
const status = root => control(root, "status").textContent.trim();

function assertManualCopy(dom, row, expected) {
  const fallback = control(row, "fallback");
  const input = control(row, "input");
  assert.equal(fallback.hidden, false, "A usable manual-copy fallback is visible");
  assert.equal(input.readOnly, true);
  assert.equal(input.value, expected);
  assert.equal(dom.window.document.activeElement, input, "The link is focused for keyboard copying");
  assert.equal(input.selectionStart, 0);
  assert.equal(input.selectionEnd, expected.length);
  assert.ok(status(row), "The reader receives an explanation instead of false success");
}

test("share metadata preserves the article language and safely encodes a clean canonical and title", () => {
  for (const lang of ["en", "zh"]) {
    const page = { ...pageFor(lang), path: pageFor(lang).path + "index.html?utm_source=example#section" };
    const meta = shareMetadata(config, page);
    const expected = origin + "/" + pageFor(lang).path;
    assert.equal(meta.url, expected);
    assert.equal(meta.title, page.title);
    assert.equal(meta.preview, false);
    const intent = new URL(meta.xUrl);
    assert.equal(intent.origin + intent.pathname, "https://x.com/intent/tweet");
    assert.equal(intent.searchParams.get("url"), expected);
    assert.equal(intent.searchParams.get("text"), page.title);
    assert.equal(intent.searchParams.size, 2);
    const linkedin = new URL(meta.linkedinUrl);
    assert.equal(linkedin.origin + linkedin.pathname, "https://www.linkedin.com/sharing/share-offsite/");
    assert.equal(linkedin.searchParams.get("url"), expected);
    assert.equal(linkedin.searchParams.size, 1, "LinkedIn receives only the canonical URL, without unsupported title or summary parameters");
  }
  assert.equal(shareMetadata(config, { ...pageFor("en"), title: '<em>Choices</em> &amp; meaning' }).title, "Choices & meaning");
});

test("drafts and non-public destinations never receive an external compose URL", () => {
  for (const page of [
    { ...pageFor("en"), published: false },
    { ...pageFor("en"), source: "_drafts/secret.md" },
    { ...pageFor("en"), source: "source/_drafts/secret.md" }
  ]) {
    const meta = shareMetadata(config, page);
    assert.equal(meta.preview, true);
    assert.ok(!meta.xUrl, "An unpublished title and URL never enter an external intent link");
    assert.equal(meta.linkedinUrl, null, "An unpublished URL never enters a LinkedIn share link");
  }
  for (const url of ["http://example.com", "http://127.0.0.1:4000", "https://127.0.0.1:4000", "https://localhost", "https://preview.localhost", "https://[::1]"]) {
    const meta = shareMetadata({ ...config, url }, pageFor("en"));
    assert.equal(meta.preview, true, url);
    assert.ok(!meta.xUrl, url);
    assert.equal(meta.linkedinUrl, null, url);
  }
});

test("the bilingual partial works without JavaScript and contains accessible independent controls", () => {
  for (const lang of ["en", "zh"]) {
    const dom = new JSDOM(markup(lang, {}, 2));
    try {
      const document = dom.window.document;
      const ids = [...document.querySelectorAll("[id]")].map(element => element.id);
      assert.equal(new Set(ids).size, ids.length, "Repeated share rows never duplicate IDs");
      for (const row of document.querySelectorAll("[data-share]")) {
        assert.equal(row.dataset.sharePreview, "false");
        assert.equal(row.dataset.shareUrl, origin + "/" + pageFor(lang).path);
        assert.equal(row.dataset.shareTitle, pageFor(lang).title);
        for (const name of ["x", "linkedin"]) {
          const link = control(row, name);
          assert.equal(link.tagName, "A", `Public ${name} sharing remains available without JavaScript`);
          assert.equal(new URL(link.href).searchParams.get("url"), row.dataset.shareUrl);
          assert.equal(link.getAttribute("aria-label"), localization.text(`share.${name}`, lang));
          assert.equal(link.getAttribute("title"), localization.text(`share.${name}`, lang));
          assert.equal(link.querySelector("svg")?.getAttribute("aria-hidden"), "true");
          assert.equal(link.target, "_blank");
          assert.ok(link.relList.contains("noopener"));
          assert.ok(link.relList.contains("noreferrer"));
        }
        for (const name of ["copy", "native"]) {
          const button = control(row, name);
          assert.equal(button.tagName, "BUTTON");
          assert.equal(button.type, "button");
          assert.equal(button.hidden, true, "Nonfunctional JavaScript controls begin hidden");
        }
        assert.equal(control(row, "status").getAttribute("role"), "status");
        assert.equal(control(row, "status").getAttribute("aria-live"), "polite");
        assert.equal(control(row, "fallback").hidden, true);
        assert.equal(control(row, "input").readOnly, true);
        assert.ok(lang === "zh" ? /[\u4e00-\u9fff]/.test(row.textContent) : !/[\u4e00-\u9fff]/.test(row.textContent));
      }
    } finally { dom.window.close(); }
  }
  const dom = new JSDOM(markup("zh", { published: false, source: "_drafts/secret.md" }));
  try {
    const row = group(dom);
    assert.equal(row.dataset.sharePreview, "true");
    for (const name of ["x", "linkedin"]) {
      assert.equal(control(row, name).tagName, "BUTTON");
      assert.equal(control(row, name).disabled, true, "Without JavaScript the visible preview note explains disabled sharing");
      assert.equal(control(row, name).getAttribute("href"), null);
    }
    assert.equal(row.querySelector('a[href*="intent/tweet"]'), null);
    assert.doesNotMatch(row.innerHTML, /x\.com\/intent/);
    assert.doesNotMatch(row.innerHTML, /linkedin\.com\/sharing/);
  } finally { dom.window.close(); }
});

test("copy uses the canonical of the displayed language, not tracking parameters, and reports only its own row", async t => {
  for (const lang of ["en", "zh"]) {
    const copied = [];
    const dom = await browser(t, {
      lang, count: 2, url: origin + "/" + pageFor(lang).path + "?utm_source=x&lang=en#section",
      clipboard: { writeText: async value => copied.push(value) }
    });
    const [first, second] = dom.window.document.querySelectorAll("[data-share]");
    assert.equal(control(first, "copy").hidden, false);
    control(second, "copy").click();
    await settle();
    assert.deepEqual(copied, [origin + "/" + pageFor(lang).path]);
    assert.equal(status(second), second.dataset.copied, "Success is announced after writeText resolves");
    assert.equal(status(first), "", "The other share row does not announce an action it did not perform");
    assert.equal(control(second, "fallback").hidden, true);
  }
});

test("unavailable or rejected clipboard access provides a selected manual-copy link", async t => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error("Permission denied"); } }]) {
    const dom = await browser(t, { lang: "zh", clipboard });
    const row = group(dom);
    control(row, "copy").click();
    await settle();
    assertManualCopy(dom, row, origin + "/" + pageFor("zh").path);
    assert.equal(status(row), row.dataset.copyFallback);
    assert.notEqual(status(row), row.dataset.copied, "Denied clipboard access must never report success");
    assert.equal(control(row, "copy").disabled, false);
  }
});

test("a pending clipboard request cannot be triggered twice and restores the button afterward", async t => {
  let resolve;
  let calls = 0;
  const dom = await browser(t, { clipboard: { writeText: () => { calls++; return new Promise(done => { resolve = done; }); } } });
  const button = control(group(dom), "copy");
  button.click();
  assert.equal(button.disabled, true);
  assert.equal(status(group(dom)), "", "An unresolved clipboard request must not report success");
  button.click();
  assert.equal(calls, 1);
  resolve();
  await settle();
  assert.equal(button.disabled, false);
});

test("native sharing sends only the article title and canonical and waits for user interaction", async t => {
  const shared = [];
  let finish;
  const dom = await browser(t, { lang: "zh", share: payload => { shared.push({ ...payload }); return new Promise(resolve => { finish = resolve; }); } });
  const row = group(dom);
  const button = control(row, "native");
  assert.equal(button.hidden, false);
  assert.equal(shared.length, 0, "Opening a page never opens a share sheet");
  button.click();
  assert.equal(button.disabled, true);
  button.click();
  assert.deepEqual(shared, [{ title: pageFor("zh").title, url: origin + "/" + pageFor("zh").path }]);
  finish();
  await settle();
  assert.equal(button.disabled, false);
  assert.equal(control(row, "fallback").hidden, true);
});

test("native share cancellation is neutral while genuine failure offers the link for manual sharing", async t => {
  for (const name of ["AbortError", "NotAllowedError"]) {
    const dom = await browser(t, { share: async () => { const error = new Error("Share unavailable"); error.name = name; throw error; } });
    const row = group(dom);
    const before = status(row);
    control(row, "native").click();
    await settle();
    assert.equal(control(row, "native").disabled, false);
    if (name === "AbortError") {
      assert.equal(status(row), before);
      assert.equal(control(row, "fallback").hidden, true);
    } else {
      assertManualCopy(dom, row, origin + "/" + pageFor("en").path);
      assert.equal(status(row), row.dataset.shareFallback);
      assert.notEqual(status(row), row.dataset.copied);
    }
  }
});

test("unsupported, insecure or unsupported-payload native sharing stays hidden", async t => {
  for (const options of [{}, { secure: false, share: async () => {} }, { share: async () => {}, canShare: () => false },
    { share: async () => {}, canShare: () => { throw new Error("Unavailable"); } }]) {
    const dom = await browser(t, options);
    assert.equal(control(group(dom), "native").hidden, true);
    assert.equal(control(group(dom), "copy").hidden, false);
  }
});

test("local previews block external sharing even with production canonicals and copy only a clean local URL", async t => {
  for (const base of ["http://127.0.0.1:4000", "http://localhost:4000", "http://preview.localhost:4000", "http://[::1]:4000"]) {
    const copied = [];
    let shareCalls = 0;
    const dom = await browser(t, {
      url: base + "/posts/example/index.html?utm_source=secret#private",
      clipboard: { writeText: async value => copied.push(value) },
      share: async () => { shareCalls++; }
    });
    const row = group(dom);
    for (const name of ["x", "linkedin"]) {
      const external = control(row, name);
      assert.equal(external.getAttribute("href"), null, `No live ${name} share action remains in preview`);
      assert.equal(external.getAttribute("aria-disabled"), null, "The explanation remains available to assistive technology");
      assert.equal(external.getAttribute("role"), "button");
      assert.equal(external.tabIndex, 0);
      const explanation = `${localization.text(`share.${name}`, "en")}: ${localization.text("share.previewFeedback", "en")}`;
      control(row, "status").textContent = "";
      external.click();
      assert.equal(status(row), explanation, "Clicking an unavailable external share explains the preview restriction");
      for (const key of ["Enter", " "]) {
        control(row, "status").textContent = "";
        const event = new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        external.dispatchEvent(event);
        assert.equal(event.defaultPrevented, true, "Keyboard activation does not navigate or scroll");
        assert.equal(status(row), explanation, "The explanation is also available from the keyboard");
      }
    }
    assert.equal(control(row, "status").getAttribute("aria-live"), "polite");
    assert.equal(control(row, "native").hidden, true);
    control(row, "copy").click();
    await settle();
    assert.deepEqual(copied, [base + "/posts/example/"]);
    assert.equal(shareCalls, 0);
    assert.ok(status(row), "The local-only nature of the preview is explained");
  }
  for (const lang of ["en", "zh"]) {
    const dom = await browser(t, { lang, page: { published: false }, share: async () => { assert.fail("Drafts must not use native sharing"); } });
    const row = group(dom);
    assert.equal(control(row, "native").hidden, true);
    assert.equal(control(row, "status").getAttribute("aria-live"), "polite");
    for (const name of ["x", "linkedin"]) {
      const button = control(row, name);
      assert.equal(button.disabled, false);
      assert.equal(button.getAttribute("href"), null);
      control(row, "status").textContent = "";
      button.click();
      assert.equal(status(row), `${localization.text(`share.${name}`, lang)}: ${localization.text("share.previewFeedback", lang)}`, "Draft controls explain the restriction in the reader's language");
    }
  }
});

test("generated published articles have two correctly localized share rows while other pages have none", t => {
  const output = path.join(root, "public");
  function files(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory() ? files(filename) : filename.endsWith(".html") ? [filename] : [];
    });
  }
  let articles = 0;
  const languages = new Set();
  for (const filename of files(output)) {
    const dom = new JSDOM(fs.readFileSync(filename, "utf8"), { url: origin });
    t.after(() => dom.window.close());
    const document = dom.window.document;
    const rows = document.querySelectorAll("[data-share]");
    if (!document.querySelector("article.post-detail")) {
      assert.equal(rows.length, 0, filename);
      continue;
    }
    articles++;
    languages.add(document.documentElement.lang);
    assert.equal(rows.length, 2, filename);
    const canonical = document.querySelector('link[rel="canonical"]').href;
    for (const row of rows) {
      assert.equal(row.dataset.shareUrl, canonical, filename);
      assert.equal(row.dataset.shareTitle, document.querySelector("h1").textContent.trim());
      assert.equal(row.dataset.sharePreview, "false");
      for (const name of ["x", "linkedin"]) {
        const link = control(row, name);
        assert.equal(link.tagName, "A");
        assert.equal(new URL(link.href).searchParams.get("url"), canonical);
        assert.equal(link.getAttribute("aria-label"), localization.text(`share.${name}`, document.documentElement.lang));
        assert.equal(link.getAttribute("title"), localization.text(`share.${name}`, document.documentElement.lang));
        assert.equal(link.querySelector("svg")?.getAttribute("aria-hidden"), "true");
      }
    }
    const ids = [...document.querySelectorAll("[id]")].map(element => element.id);
    assert.equal(new Set(ids).size, ids.length, `${filename}: unique page IDs`);
  }
  assert.ok(articles > 0, "The build contains published articles to exercise");
  assert.deepEqual([...languages].sort(), ["en", "zh"]);
});
