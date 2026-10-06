const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ejs = require("ejs");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const layout = read("themes/paper/layout/layout.ejs");
const header = read("themes/paper/layout/partials/header.ejs");
const languageScript = read("themes/paper/source/js/language-switcher.js");
const searchScript = read("themes/paper/source/js/search.js");
const site = "https://itsodeleo.github.io";
const listContent = `
  <h1 data-i18n="home.title">Latest essays</h1>
  <section data-language-list>
    <article data-post-lang="en">English essay</article>
    <article data-post-lang="zh">中文文章</article>
  </section>
  <p data-language-empty hidden>No posts</p>`;

async function createPage(t, options = {}) {
  const page = {
    path: options.pathname || "/",
    // Hexo supplies page.lang even to list pages; the earlier filter preserves
    // whether a language was actually authored in the content's front matter.
    lang: options.lang || "en",
    content_language: options.lang || ""
  };
  const locals = {
    page,
    config: { title: "Li Zeng", language: "en", languages: { default: "en" } },
    is_post: () => Boolean(options.post),
    seoTranslations: () => options.translations || [],
    url_for: (url) => url.startsWith("/") ? url : `/${url}`,
    js: () => "",
    body: options.body || listContent,
    partial: (name) => name === "partials/header" ? ejs.render(header, locals) : ""
  };
  const dom = new JSDOM(ejs.render(layout, locals), {
    url: site + page.path + (options.search || "") + (options.hash || ""),
    runScripts: "outside-only"
  });
  return initializePage(t, dom, options);
}

async function initializePage(t, dom, options = {}) {
  t.after(() => dom.window.close());
  await new Promise((resolve) => dom.window.addEventListener("DOMContentLoaded", resolve, { once: true }));
  if (options.storedLanguage) {
    dom.window.localStorage.setItem("preferred-language", options.storedLanguage);
  }
  if (options.storageBlocked) {
    Object.defineProperty(dom.window, "localStorage", {
      get() { throw new dom.window.DOMException("Storage unavailable", "SecurityError"); }
    });
  }
  if (options.searchPosts) {
    dom.window.fetch = async () => ({ json: async () => options.searchPosts });
    dom.window.eval(searchScript);
  }
  dom.window.eval(languageScript);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise(setImmediate);
  return dom.window;
}

function generatedHtmlFiles(directory = path.join(root, "public")) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? generatedHtmlFiles(filename) : filename.endsWith(".html") ? [filename] : [];
  });
}

function generatedPage(filename) {
  const html = fs.readFileSync(filename, "utf8");
  const relative = path.relative(path.join(root, "public"), filename).split(path.sep).join("/");
  return new JSDOM(html, { url: `${site}/${relative.replace(/index\.html$/, "")}`, runScripts: "outside-only" });
}

test("Chinese article retains its content language and clean URL on a first visit", async (t) => {
  const window = await createPage(t, {
    post: true, lang: "zh", pathname: "/posts/essay-zh/",
    translations: [{ lang: "zh", url: `${site}/posts/essay-zh/` }, { lang: "en", url: `${site}/posts/essay/` }]
  });
  assert.equal(window.document.documentElement.lang, "zh");
  assert.equal(window.location.href, `${site}/posts/essay-zh/`);
  assert.equal(window.document.querySelector('[data-i18n="nav.home"]').textContent, "首页");
  assert.equal(window.document.querySelector('[data-language-switch="zh"]').getAttribute("aria-current"), "page");
  assert.equal(window.document.querySelector('[data-i18n="nav.about"]').pathname, "/about/zh/");
});

test("article translation controls preserve native links and never relabel current content", async (t) => {
  const window = await createPage(t, {
    post: true, lang: "zh", pathname: "/posts/essay-zh/", search: "?lang=en", storedLanguage: "en",
    translations: [{ lang: "zh", url: `${site}/posts/essay-zh/` }, { lang: "en", url: `${site}/posts/essay/` }]
  });
  const link = window.document.querySelector('[data-language-switch="en"]');
  assert.equal(link.tagName, "A");
  assert.equal(link.href, `${site}/posts/essay/`);
  assert.equal(link.hreflang, "en");
  let navigationWasPrevented;
  window.document.addEventListener("click", (event) => {
    navigationWasPrevented = event.defaultPrevented;
    event.preventDefault(); // Keep jsdom on this page after observing native navigation.
  }, { once: true });
  link.click();
  assert.equal(navigationWasPrevented, false);
  assert.equal(window.document.documentElement.lang, "zh");
  assert.equal(window.location.search, "?lang=en");
  assert.equal(window.localStorage.getItem("preferred-language"), "en");
});

test("a static page with an explicit language ignores conflicting UI preferences", async (t) => {
  const window = await createPage(t, {
    lang: "en", pathname: "/about/", search: "?lang=zh", storedLanguage: "zh",
    translations: [{ lang: "en", url: `${site}/about/` }, { lang: "zh", url: `${site}/about/zh/` }]
  });
  assert.equal(window.document.documentElement.lang, "en");
  assert.equal(window.document.querySelector('[data-i18n="nav.about"]').textContent, "About");
  assert.equal(window.document.querySelector('[data-language-switch="zh"]').href, `${site}/about/zh/`);
  assert.equal(window.location.search, "?lang=zh");
});

test("missing translations cannot switch a fixed-language page to a nonexistent language", async (t) => {
  const window = await createPage(t, { post: true, lang: "en", pathname: "/posts/solo/" });
  const unavailable = window.document.querySelector('[data-language-switch="zh"]');
  assert.equal(unavailable.disabled, true);
  assert.equal(window.document.querySelector('[data-language-switch="en"]').href, `${site}/posts/solo/`);
  unavailable.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(window.document.documentElement.lang, "en");
  assert.equal(window.location.href, `${site}/posts/solo/`);
});

test("an article without authored language remains fixed to the site default", async (t) => {
  const window = await createPage(t, { post: true, pathname: "/posts/default/", storedLanguage: "zh", search: "?lang=zh" });
  assert.equal(window.document.body.dataset.contentLanguage, "en");
  assert.equal(window.document.documentElement.lang, "en");
  assert.equal(window.document.querySelector('[data-language-switch="zh"]').disabled, true);
});

test("list pages honor query language without rewriting the URL on initialization", async (t) => {
  const window = await createPage(t, { pathname: "/blog/", search: "?lang=zh&q=essay", storedLanguage: "en" });
  assert.equal(window.document.documentElement.lang, "zh");
  assert.equal(window.location.search, "?lang=zh&q=essay");
  assert.equal(window.document.querySelector('[data-post-lang="en"]').hidden, true);
  assert.equal(window.document.querySelector('[data-post-lang="zh"]').hidden, false);
  assert.equal(window.document.querySelector('[data-i18n="home.title"]').textContent, "最新文章");
});

test("list pages preserve a clean URL with stored preferences and update only on explicit switching", async (t) => {
  const window = await createPage(t, { pathname: "/blog/", search: "?q=essay", hash: "#latest", storedLanguage: "en" });
  assert.equal(window.location.href, `${site}/blog/?q=essay#latest`);
  window.document.querySelector('[data-language-switch="zh"]').click();
  assert.equal(window.document.documentElement.lang, "zh");
  assert.equal(window.location.href, `${site}/blog/?q=essay&lang=zh#latest`);
  assert.equal(window.document.querySelector('[data-post-lang="en"]').hidden, true);
  assert.equal(window.localStorage.getItem("preferred-language"), "zh");
  assert.equal(window.document.querySelector('[data-i18n="nav.about"]').pathname, "/about/zh/");
});

test("blocked browser storage does not break language controls or search", async (t) => {
  const window = await createPage(t, {
    pathname: "/search/", storageBlocked: true,
    body: '<input id="search-input"><div id="search-results" data-search-url="/search.json"></div>',
    searchPosts: [
      { title: "English intelligence", content: "intelligence", lang: "en", url: "/posts/english/" },
      { title: "中文智能", content: "智能", lang: "zh", url: "/posts/chinese/" }
    ]
  });
  const input = window.document.getElementById("search-input");
  assert.equal(window.document.documentElement.lang, "en");
  assert.equal(window.location.search, "");
  window.document.querySelector('[data-language-switch="zh"]').click();
  assert.equal(window.document.documentElement.lang, "zh");
  input.value = "智能";
  input.dispatchEvent(new window.Event("input"));
  const results = window.document.getElementById("search-results");
  assert.match(results.textContent, /中文智能/);
  assert.equal(results.querySelector("a").pathname, "/posts/chinese/");
  window.document.querySelector('[data-language-switch="en"]').click();
  assert.doesNotMatch(results.textContent, /中文智能/);
  assert.match(results.textContent, /No matches/);
});

test("generated home, blog, search and archive pages stay switchable after Hexo adds default lang", async (t) => {
  const output = path.join(root, "public");
  const filenames = generatedHtmlFiles().filter((filename) => {
    const relative = path.relative(output, filename).split(path.sep).join("/");
    return ["index.html", "blog/index.html", "search/index.html"].includes(relative) || /^(archives|page)\//.test(relative);
  });
  assert.ok(filenames.length >= 4, "Homepage, blog, search and archives have been built");
  for (const filename of filenames) {
    const window = await initializePage(t, generatedPage(filename));
    const document = window.document;
    assert.equal(document.body.dataset.contentLanguage, "", `${filename}: list UI is not fixed to Hexo's default lang`);
    assert.equal(window.location.search, "", `${filename}: startup keeps canonical path clean`);
    const chineseControl = document.querySelector('[data-language-switch="zh"]');
    assert.equal(chineseControl.tagName, "BUTTON", `${filename}: UI language control is a button`);
    assert.equal(chineseControl.disabled, false, `${filename}: Chinese switch is enabled`);
    chineseControl.click();
    assert.equal(document.documentElement.lang, "zh", `${filename}: Chinese UI activates`);
    assert.equal(document.querySelector('[data-i18n="nav.home"]').textContent, "首页");
    assert.equal(document.querySelector('[data-i18n="nav.about"]').pathname, "/about/zh/");
    assert.equal(window.location.search, "?lang=zh");
    for (const post of document.querySelectorAll('[data-post-lang="en"]')) {
      assert.equal(post.hidden, true, `${filename}: English list entries are filtered`);
    }
  }
});

test("generated article and About pages retain authored language and real translation links", async (t) => {
  const output = path.join(root, "public");
  const filenames = generatedHtmlFiles().filter((filename) => /^(posts|about)\//.test(path.relative(output, filename).split(path.sep).join("/")));
  assert.ok(filenames.length >= 4, "Bilingual posts and About pages have been built");
  for (const filename of filenames) {
    const dom = generatedPage(filename);
    const authoredLanguage = dom.window.document.documentElement.lang;
    const window = await initializePage(t, dom, { storedLanguage: authoredLanguage === "zh" ? "en" : "zh" });
    const document = window.document;
    assert.equal(document.body.dataset.contentLanguage, authoredLanguage, `${filename}: authored language is preserved`);
    assert.equal(document.documentElement.lang, authoredLanguage, `${filename}: preferences cannot relabel content`);
    assert.equal(window.location.search, "", `${filename}: startup does not append a language parameter`);
    assert.equal(document.querySelector(`[data-language-switch="${authoredLanguage}"]`).getAttribute("aria-current"), "page");
    for (const alternate of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
      const control = document.querySelector(`[data-language-switch="${alternate.hreflang}"]`);
      assert.equal(control.tagName, "A", `${filename}: translation is a native link`);
      assert.equal(control.href, alternate.href, `${filename}: UI and hreflang target the same translation`);
    }
  }
});
