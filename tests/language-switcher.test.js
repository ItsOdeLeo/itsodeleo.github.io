const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ejs = require("ejs");
const yaml = require("js-yaml");
const moment = require("moment-timezone");
const { JSDOM } = require("jsdom");
const Warehouse = require("warehouse").default;
const localization = require("../lib/localization");
const { feedDetails } = require("../lib/feeds");
const paginator = require("hexo/dist/plugins/helper/paginator");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const config = yaml.load(read("_config.yml"));
const origin = config.url.replace(/\/+$/, "");
const languageScript = read("themes/paper/source/js/language-switcher.js");
const searchScript = read("themes/paper/source/js/search.js");
const output = path.join(root, "public");
const Query = new Warehouse().model("Post", {}).Query;

function htmlFiles(directory = output) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(filename) : filename.endsWith(".html") ? [filename] : [];
  });
}
function generatedPages() {
  return htmlFiles().map(filename => {
    const route = "/" + path.relative(output, filename).split(path.sep).join("/").replace(/index\.html$/, "");
    return { route, html: fs.readFileSync(filename, "utf8") };
  });
}
function domFor(t, page, query = "") {
  const dom = new JSDOM(page.html, { url: origin + page.route + query, runScripts: "outside-only" });
  t.after(() => dom.window.close());
  return dom;
}
async function ready(dom) {
  await new Promise(resolve => dom.window.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

// These assertions inspect original HTML without running any site JavaScript.
test("English and Chinese collections have complete language-specific HTML and crawlable navigation", t => {
  const pages = generatedPages();
  const paths = new Set(pages.map(page => page.route));
  for (const route of ["/", "/zh/", "/blog/", "/zh/blog/", "/archives/", "/zh/archives/", "/search/", "/zh/search/"]) {
    assert.ok(paths.has(route), `${route} is generated`);
  }
  for (const page of pages) {
    const { document } = domFor(t, page).window;
    if (!document.body.dataset.localizedCollection) continue;
    const lang = page.route.startsWith("/zh/") ? "zh" : "en";
    assert.equal(document.documentElement.lang, lang, `${page.route}: rendered language`);
    assert.equal(document.body.dataset.contentLanguage, lang);
    assert.equal(document.querySelector('[data-i18n="nav.home"]').textContent, lang === "zh" ? "首页" : "Home");
    for (const post of document.querySelectorAll("[data-post-lang]")) {
      assert.equal(post.dataset.postLang, lang, `${page.route}: no other-language essays to hide`);
      assert.equal(post.hidden, false, `${page.route}: content is visible without JavaScript`);
    }
    for (const section of ["home", "posts", "archive", "search", "about"]) {
      const link = document.querySelector(`[data-i18n="nav.${section}"]`);
      assert.equal(link.pathname, "/" + localization.localizedPath(section, lang, config));
      assert.ok(paths.has(link.pathname), `${page.route}: ${section} navigation resolves`);
    }
    for (const control of document.querySelectorAll("[data-language-switch]")) {
      assert.equal(control.tagName, "A", `${page.route}: language switch is crawlable`);
      assert.ok(paths.has(control.pathname), `${page.route}: ${control.href} exists`);
    }
    if (lang === "zh") assert.match(document.querySelector("h1").textContent, /[\u4e00-\u9fff]/);
  }
});

test("article and About translation links work without JavaScript and match declared alternates", t => {
  for (const page of generatedPages().filter(page => /^\/(posts|about)\//.test(page.route))) {
    const { document } = domFor(t, page).window;
    const lang = document.documentElement.lang;
    assert.equal(document.querySelector('[data-i18n="nav.home"]').textContent, lang === "zh" ? "首页" : "Home");
    assert.equal(document.querySelector('[data-i18n="nav.posts"]').pathname, lang === "zh" ? "/zh/blog/" : "/blog/");
    assert.equal(document.querySelector(`[data-language-switch="${lang}"]`).getAttribute("aria-current"), "page");
    for (const alternate of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
      const control = document.querySelector(`[data-language-switch="${alternate.hreflang}"]`);
      assert.equal(control.tagName, "A");
      assert.equal(control.href, alternate.href);
    }
  }
});

test("stored preferences never redirect or relabel a direct language URL", async t => {
  for (const page of generatedPages().filter(page => page.route !== "/404.html")) {
    const dom = domFor(t, page);
    await ready(dom);
    const originalLanguage = dom.window.document.documentElement.lang;
    const originalContent = dom.window.document.body.textContent;
    Object.defineProperty(dom.window, "localStorage", { get() { throw new Error("Language must not depend on localStorage"); } });
    dom.window.eval(languageScript);
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    assert.equal(dom.window.location.href, origin + page.route);
    assert.equal(dom.window.document.documentElement.lang, originalLanguage);
    assert.equal(dom.window.document.body.textContent, originalContent);
  }
});

test("legacy explicit language queries navigate only collection pages and preserve unrelated parameters", () => {
  function run(href, locale, collection = true) {
    const redirected = [];
    const replaced = [];
    const document = {
      documentElement: { lang: locale, dataset: {} },
      body: { dataset: collection ? { localizedCollection: "true" } : {} },
      addEventListener(name, callback) { callback(); },
      querySelector(selector) { return { href: origin + (selector.includes('="zh"') ? "/zh/blog/" : "/blog/") }; }
    };
    vm.runInNewContext(languageScript, {
      URL, document,
      window: { location: { href, replace: value => redirected.push(value) }, history: { replaceState: (_, __, value) => replaced.push(value.href) } }
    });
    return { redirected, replaced, document };
  }
  assert.deepEqual(run(origin + "/blog/?lang=zh&q=intelligence#recent", "en").redirected, [origin + "/zh/blog/?q=intelligence#recent"]);
  assert.deepEqual(run(origin + "/zh/blog/?lang=en", "zh").redirected, [origin + "/blog/"]);
  assert.deepEqual(run(origin + "/zh/blog/?lang=zh&q=x", "zh").replaced, [origin + "/zh/blog/?q=x"]);
  assert.deepEqual(run(origin + "/blog/", "en").redirected, []);
  assert.deepEqual(run(origin + "/blog/?lang=invalid", "en").redirected, []);
  assert.deepEqual(run(origin + "/posts/essay/?lang=zh", "en", false).redirected, []);
});

test("missing article translations are disabled without inventing a destination", () => {
  const locals = {
    page: { lang: "en", content_language: "en", path: "posts/solo/" }, config,
    seoTranslations: () => [],
    seoMetadata: () => ({ canonical: new URL(locals.page.path, origin + '/').href }),
    feedDetails: () => feedDetails(locals.config, locals.page.content_language || locals.page.lang),
    url_for: value => value.startsWith("/") ? value : "/" + value,
    localText: key => localization.text(key, "en"), localizedPath: section => localization.localizedPath(section, "en", config)
  };
  const document = new JSDOM(ejs.render(read("themes/paper/layout/partials/header.ejs"), locals), { url: origin }).window.document;
  const missing = document.querySelector('[data-language-switch="zh"]');
  assert.equal(missing.tagName, "BUTTON");
  assert.equal(missing.disabled, true);
  assert.equal(document.querySelector('[data-language-switch="en"]').pathname, "/posts/solo/");
});

test("search uses its rendered language even when browser storage is unavailable", async t => {
  const page = generatedPages().find(page => page.route === "/zh/search/");
  const dom = domFor(t, page);
  await ready(dom);
  Object.defineProperty(dom.window, "localStorage", { get() { throw new Error("Storage unavailable"); } });
  dom.window.fetch = async () => ({ json: async () => [
    { title: "English intelligence", content: "intelligence 智能", lang: "en", url: "/posts/english/" },
    { title: "中文智能", content: "智能", lang: "zh", url: "/posts/chinese/", date: "2026-03-23T10:00:00Z" }
  ] });
  dom.window.eval(searchScript);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise(setImmediate);
  const input = dom.window.document.getElementById("search-input");
  input.value = "智能";
  input.dispatchEvent(new dom.window.Event("input"));
  const results = dom.window.document.getElementById("search-results");
  assert.match(results.textContent, /中文智能/);
  assert.doesNotMatch(results.textContent, /English intelligence/);
  assert.match(results.textContent, /2026年3月23日/);
});

function fixtureRoutes(overrides = {}) {
  const fixtureConfig = { ...config, pagination_dir: "page", index_generator: { per_page: 2 }, archive_generator: { enabled: true, per_page: 2, yearly: true, monthly: true }, ...overrides };
  const posts = [
    ...Array.from({ length: 9 }, (_, i) => ({ title: `English ${i}`, lang: "en", path: `posts/en-${i}/`, date: moment.utc(`2026-03-${String(20 - i).padStart(2, "0")}`) })),
    ...Array.from({ length: 3 }, (_, i) => ({ title: `中文 ${i}`, lang: "zh", path: `posts/zh-${i}/`, date: moment.utc(`2026-02-${String(20 - i).padStart(2, "0")}`) }))
  ];
  return { routes: localization.collectionRoutes(fixtureConfig, posts, Query), posts, fixtureConfig };
}

test("unequal language counts paginate after filtering with no empty or duplicate slices", () => {
  const { routes, posts, fixtureConfig } = fixtureRoutes();
  const routeByPath = new Map(routes.map(route => [route.path, route]));
  assert.equal(routeByPath.size, routes.length, "No route collisions");
  for (const lang of ["en", "zh"]) {
    for (const kind of ["home", "posts"]) {
      const collection = routes.filter(route => route.data.lang === lang && route.data.collection_kind === kind);
      assert.equal(collection.length, lang === "en" ? 5 : 2);
      const seen = [];
      for (const route of collection) {
        assert.ok(route.data.posts.length > 0 && route.data.posts.length <= 2);
        for (const post of route.data.posts.toArray()) {
          assert.equal(post.lang, lang);
          seen.push(post.path);
        }
        for (const link of [route.data.prev_link, route.data.next_link].filter(Boolean)) {
          assert.equal(routeByPath.get(link).data.lang, lang);
        }
        for (const link of Object.values(route.data.language_paths)) assert.ok(routeByPath.has(link), `${link} resolves`);
        if (route.data.current > 1) assert.deepEqual(route.data.alternates, [], "Uneven slices do not claim translation equivalence");
        const locals = {
          config: fixtureConfig, page: route.data,
          localText: key => localization.text(key, lang),
          partial: (_, values) => `<article data-post-lang="${values.post.lang}"><a href="/${values.post.path}">${values.post.title}</a></article>`,
          paginator(options) { return paginator.call(locals, options); }
        };
        const html = ejs.render(read("themes/paper/layout/index.ejs"), locals);
        const document = new JSDOM(html, { url: origin + "/" + route.path }).window.document;
        for (const link of document.querySelectorAll(".pagination a")) {
          assert.ok(routeByPath.has(link.pathname.replace(/^\//, "")), `${link.pathname}: crawlable pagination target exists`);
        }
        if (route.data.next) assert.ok(document.querySelector('a[rel="next"]'));
      }
      assert.deepEqual(seen.sort(), posts.filter(post => post.lang === lang).map(post => post.path).sort(), "Every essay appears exactly once");
    }
  }
  assert.equal(routeByPath.get("page/5/").data.language_paths.zh, "zh/", "Missing counterpart page falls back to locale landing page");
  assert.equal(routeByPath.get("archives/2026/03/").data.language_paths.zh, "zh/archives/", "Missing locale month falls back to its archive");
});

test("monthly archives remain available when yearly archives are disabled", () => {
  const { routes } = fixtureRoutes({ archive_generator: { enabled: true, per_page: 2, yearly: false, monthly: true } });
  const paths = new Set(routes.map(route => route.path));
  assert.ok(paths.has("archives/2026/03/"));
  assert.ok(paths.has("zh/archives/2026/02/"));
  assert.equal(paths.has("archives/2026/"), false);
  const monthly = routes.find(route => route.path === "archives/2026/03/");
  const { breadcrumbs } = require('../lib/seo');
  const trail = breadcrumbs({ ...config, archive_generator: { yearly: false } }, monthly.data);
  assert.ok(!trail.some(item => item.url.endsWith('/archives/2026/')));
});
