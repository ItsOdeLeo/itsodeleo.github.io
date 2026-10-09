const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const yaml = require("js-yaml");
const { feedRoutes } = require("../lib/feeds");

const atomNamespace = "http://www.w3.org/2005/Atom";
const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
const fixtureConfig = {
  url: "https://example.com", title: 'Li & "Leo"', author: "Li Zeng", language: "en",
  description: "English essays & notes", languages: { default: "en" }, feed: { limit: 20 },
  seo: { home_description_zh: "中文文章与思考。" }, future: false
};
const now = Date.parse("2026-10-06T00:00:00Z");
const post = (path, overrides = {}) => ({
  path, title: path, lang: "en", date: "2026-03-23T09:00:00Z", content: "<p>An essay.</p>", ...overrides
});
function xml(value) {
  return new JSDOM(value, { contentType: "application/xml" }).window.document;
}
function child(element, name) {
  return [...element.children].find(node => node.localName === name);
}
function documents(posts, config = fixtureConfig, time = now) {
  return new Map(feedRoutes(config, posts, time).map(route => [route.path, xml(route.data)]));
}

test("feed units: valid bilingual XML preserves language membership, canonical IDs and locale links", () => {
  const english = post("posts/english/", { translation_key: "essay", title: 'English & "quotes" <test>' });
  const chinese = post("posts/chinese/", { translation_key: "essay", lang: "zh", title: "中文文章" });
  const standalone = post("posts/chinese-only/", { lang: "zh", title: "只有中文的文章" });
  const feeds = documents([chinese, english, standalone]);
  assert.deepEqual([...feeds.keys()], ["atom.xml", "rss2.xml", "zh/atom.xml", "zh/rss2.xml"]);
  for (const [prefix, lang, expected] of [["", "en", [english]], ["zh/", "zh", [standalone, chinese]]]) {
    const atom = feeds.get(`${prefix}atom.xml`).documentElement;
    const rss = child(feeds.get(`${prefix}rss2.xml`).documentElement, "channel");
    assert.equal(atom.namespaceURI, atomNamespace);
    assert.equal(atom.getAttributeNS(xmlNamespace, "lang"), lang);
    assert.equal(child(rss, "language").textContent, lang);
    const expectedUrls = expected.map(item => fixtureConfig.url + "/" + item.path).sort();
    assert.deepEqual([...atom.querySelectorAll("entry > id")].map(node => node.textContent).sort(), expectedUrls);
    assert.deepEqual([...rss.querySelectorAll("item > guid")].map(node => node.textContent).sort(), expectedUrls);
    assert.equal(child(atom, "id").textContent, `${fixtureConfig.url}/${prefix}atom.xml`);
    assert.equal(atom.querySelector('link[rel="self"]').getAttribute("href"), `${fixtureConfig.url}/${prefix}atom.xml`);
    assert.equal(atom.querySelector('link[rel="alternate"]').getAttribute("href"), fixtureConfig.url + "/" + prefix);
    assert.equal(child(rss, "link").textContent, fixtureConfig.url + "/" + prefix);
    assert.equal(rss.getElementsByTagNameNS(atomNamespace, "link")[0].getAttribute("href"), `${fixtureConfig.url}/${prefix}rss2.xml`);
    const expectedDescription = lang === "zh" ? fixtureConfig.seo.home_description_zh : fixtureConfig.description;
    assert.equal(child(atom, "subtitle").textContent, expectedDescription);
    assert.equal(child(rss, "description").textContent, expectedDescription);
    assert.ok(child(atom, "title").textContent.includes(lang === "zh" ? "中文" : "English"));
    for (const entry of atom.querySelectorAll("entry")) {
      const original = expected.find(item => fixtureConfig.url + "/" + item.path === child(entry, "id").textContent);
      assert.equal(child(entry, "title").textContent, original.title);
      assert.equal(entry.getAttributeNS(xmlNamespace, "base"), fixtureConfig.url + "/" + original.path);
      assert.equal(child(entry, "link").getAttribute("href"), fixtureConfig.url + "/" + original.path);
    }
  }
});

test("feed units: hidden, unpublished and future content never leaks into ordinary feeds", () => {
  const fixtures = [
    post("posts/public/"),
    post("posts/unpublished/", { published: false }),
    post("posts/noindex/", { indexing: false }),
    post("posts/robots-noindex/", { robots: "follow, NOINDEX" }),
    post("posts/future/", { date: "2027-01-01T00:00:00Z" }),
    post("posts/undated/", { date: "invalid" })
  ];
  for (const [route, document] of documents(fixtures)) {
    const entries = document.querySelectorAll(route.endsWith("atom.xml") ? "entry" : "item");
    assert.equal(entries.length, route.startsWith("zh/") ? 0 : 1);
    if (entries.length) assert.equal(child(entries[0], "title").textContent, "posts/public/");
  }
  const future = documents(fixtures, { ...fixtureConfig, future: true }).get("atom.xml");
  assert.equal(future.querySelectorAll("entry").length, 2, "Explicit future publication follows site configuration");
});

test("feed units: freshness tracks the latest included authored change without build-clock churn", () => {
  const fixtures = [
    post("posts/new/", { date: "2026-06-01T09:00:00Z" }),
    post("posts/older-but-updated/", { updated: { toDate: () => new Date("2026-09-10T10:00:00Z") } }),
    post("posts/bad-update/", { updated: "invalid" }),
    post("posts/update-before-publication/", { updated: "2025-01-01T00:00:00Z" }),
    post("posts/chinese/", { lang: "zh", updated: "2026-08-02T09:00:00Z" })
  ];
  assert.deepEqual(feedRoutes(fixtureConfig, fixtures, now), feedRoutes(fixtureConfig, fixtures, now + 86400000), "A build the next day has byte-identical feeds");
  const feeds = documents(fixtures);
  assert.equal(child(feeds.get("atom.xml").documentElement, "updated").textContent, "2026-09-10T10:00:00.000Z");
  assert.equal(feeds.get("rss2.xml").querySelector("lastBuildDate").textContent, "Thu, 10 Sep 2026 10:00:00 GMT");
  assert.equal(child(feeds.get("zh/atom.xml").documentElement, "updated").textContent, "2026-08-02T09:00:00.000Z");
  for (const entry of feeds.get("atom.xml").querySelectorAll("entry")) {
    assert.ok(Date.parse(child(entry, "updated").textContent) >= Date.parse(child(entry, "published").textContent));
  }
  const limited = documents(fixtures, { ...fixtureConfig, feed: { limit: 1 } });
  assert.equal(limited.get("atom.xml").querySelectorAll("entry").length, 1);
  assert.equal(limited.get("zh/atom.xml").querySelectorAll("entry").length, 1, "Each language receives its own limit");
  assert.equal(child(limited.get("atom.xml").documentElement, "updated").textContent, "2026-06-01T09:00:00.000Z");
  const empty = documents([]);
  assert.equal(child(empty.get("atom.xml").documentElement, "updated").textContent, "1970-01-01T00:00:00.000Z");
  assert.equal(empty.get("rss2.xml").querySelector("lastBuildDate"), null, "Empty RSS omits optional freshness");
});

test("feed units: full content survives XML-sensitive text and CDATA terminators", () => {
  const content = '<p>Text &amp; 中文 ]]> tail.</p><h2><a class="headerlink" href="#section" title="Section"></a>Section</h2>';
  const expected = '<p>Text &amp; 中文 ]]> tail.</p><h2>Section</h2>';
  const feeds = documents([post("posts/escaping/", { content, excerpt: "<p>Summary ]]> remains.</p>" })]);
  assert.equal(feeds.get("atom.xml").querySelector("entry > content").textContent, expected);
  assert.equal(feeds.get("atom.xml").querySelector("entry > summary").textContent, "<p>Summary ]]> remains.</p>");
  assert.equal(feeds.get("rss2.xml").getElementsByTagNameNS("http://purl.org/rss/1.0/modules/content/", "encoded")[0].textContent, expected);
});

test("feed units: links and media remain portable outside the article without rewriting authored text", () => {
  const untouched = '<p title="href=\'../not-a-link\' > quoted">中文 &amp; text.</p>' +
    '<pre>&lt;a href="../example"&gt;Example&lt;/a&gt;</pre>' +
    '<script>const example = \'<a href="../example">\';</script>' +
    '<!-- <img src="../example"> -->' +
    '<a id="mail" href="mailto:leo@example.com">Mail</a>' +
    '<img id="data" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E">' +
    '<a id="absolute" href="https://other.example/?a=1&amp;b=2">External</a>';
  const content = '<a id="root" href="/about/?a=1&amp;b=2">Author</a>' +
    '<a id="relative" HREF = \'../other/?q=a%20b\'>Other</a>' +
    '<a id="fragment" href="#result">Result</a>' +
    '<img id="local-image" src=./figure.png>' +
    '<img id="cdn" src="//cdn.example.com/image.png">' +
    '<video id="video" poster="/poster.jpg"></video>' + untouched;
  const feeds = documents([post("posts/portable/", {
    content, excerpt: '<p><a href="../related/?a=1&amp;b=2">Related</a></p>'
  })]);
  const atom = feeds.get("atom.xml");
  const rss = feeds.get("rss2.xml");
  const bodies = [atom.querySelector("entry > content").textContent,
    rss.getElementsByTagNameNS("http://purl.org/rss/1.0/modules/content/", "encoded")[0].textContent];
  const expected = {
    root: ["href", "https://example.com/about/?a=1&b=2"],
    relative: ["href", "https://example.com/posts/other/?q=a%20b"],
    fragment: ["href", "https://example.com/posts/portable/#result"],
    "local-image": ["src", "https://example.com/posts/portable/figure.png"],
    cdn: ["src", "https://cdn.example.com/image.png"],
    video: ["poster", "https://example.com/poster.jpg"],
    mail: ["href", "mailto:leo@example.com"],
    data: ["src", "data:image/svg+xml,%3Csvg%3E%3C/svg%3E"],
    absolute: ["href", "https://other.example/?a=1&b=2"]
  };
  for (const body of bodies) {
    assert.ok(body.endsWith(untouched), "Unrelated markup, examples, and absolute URLs retain their original bytes");
    const document = new JSDOM(body, { url: "https://feed-reader.example/subscriptions/" }).window.document;
    for (const [id, [attribute, value]] of Object.entries(expected)) {
      assert.equal(document.getElementById(id).getAttribute(attribute), value);
    }
    assert.ok(!body.includes("&amp;amp;"), "Existing HTML entities are not double-escaped");
  }
  const summaries = [atom.querySelector("entry > summary").textContent, rss.querySelector("item > description").textContent];
  for (const summary of summaries) {
    assert.equal(new JSDOM(summary).window.document.querySelector("a").getAttribute("href"),
      "https://example.com/posts/related/?a=1&b=2", "Summary links use the article URL too");
  }
});

test("published feeds: discovery, membership and timestamps match the rendered article language", () => {
  // Integration coverage reads the actual site; run npm run build first.
  const root = path.resolve(__dirname, "..");
  const config = yaml.load(fs.readFileSync(path.join(root, "_config.yml"), "utf8"));
  const output = path.join(root, config.public_dir || "public");
  const pages = fs.readdirSync(output, { recursive: true }).filter(file => file.endsWith(".html")).map(file => {
    const url = new URL(file.replace(/index\.html$/, ""), config.url + "/").href;
    return { url, document: new JSDOM(fs.readFileSync(path.join(output, file), "utf8"), { url }).window.document };
  });
  for (const page of pages) {
    const prefix = page.document.documentElement.lang === "zh" ? "zh/" : "";
    for (const [type, file] of [["application/atom+xml", "atom.xml"], ["application/rss+xml", "rss2.xml"]]) {
      const link = page.document.querySelector(`link[rel="alternate"][type="${type}"]`);
      assert.ok(link, `${page.url}: discovers ${type}`);
      assert.equal(link.href, config.url + "/" + prefix + file);
    }
    const visibleFeeds = [...page.document.querySelectorAll('a[href]')].filter(link => /\/(?:atom|rss2)\.xml$/.test(link.pathname));
    assert.ok(visibleFeeds.length, `${page.url}: a visible feed link exists`);
    for (const link of visibleFeeds) assert.ok([`/${prefix}atom.xml`, `/${prefix}rss2.xml`].includes(link.pathname), `${page.url}: visible subscription follows page language`);
  }
  for (const lang of ["en", "zh"]) {
    const prefix = lang === "zh" ? "zh/" : "";
    let articles = pages.filter(page => page.document.documentElement.lang === lang && page.document.querySelector('meta[property="og:type"]')?.content === "article" && !page.document.querySelector('meta[name="robots"]')?.content.includes("noindex"));
    articles.sort((a, b) => Date.parse(b.document.querySelector('meta[property="article:published_time"]').content) - Date.parse(a.document.querySelector('meta[property="article:published_time"]').content) || a.url.localeCompare(b.url));
    const limit = Number(config.feed?.limit ?? 20);
    if (limit > 0) articles = articles.slice(0, limit);
    const expectedUrls = articles.map(page => page.document.querySelector('link[rel="canonical"]').href).sort();
    const atom = xml(fs.readFileSync(path.join(output, prefix + "atom.xml"), "utf8"));
    const rss = xml(fs.readFileSync(path.join(output, prefix + "rss2.xml"), "utf8"));
    assert.deepEqual([...atom.querySelectorAll("entry > id")].map(node => node.textContent).sort(), expectedUrls);
    assert.deepEqual([...rss.querySelectorAll("item > guid")].map(node => node.textContent).sort(), expectedUrls);
    for (const entry of atom.querySelectorAll("entry")) {
      const article = articles.find(page => page.url === child(entry, "id").textContent);
      assert.equal(child(entry, "published").textContent, article.document.querySelector('meta[property="article:published_time"]').content);
      assert.equal(child(entry, "updated").textContent, article.document.querySelector('meta[property="article:modified_time"]').content);
    }
  }
});
