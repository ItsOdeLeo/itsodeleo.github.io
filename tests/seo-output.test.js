const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const frontMatter = require("hexo-front-matter");
const yaml = require("js-yaml");
const moment = require("moment-timezone");
const micromatch = require("micromatch");

// Exercise the files crawlers actually receive. Run `npm run build` first.
const root = path.resolve(__dirname, "..");
const output = path.join(root, "public");
const config = yaml.load(fs.readFileSync(path.join(root, "_config.yml"), "utf8"));
const origin = config.url.replace(/\/+$/, "");
const sourceDirectory = path.join(root, config.source_dir || "source");

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(filename) : [filename];
  });
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function plainText(value) {
  return text(JSDOM.fragment(String(value || "")).textContent);
}

function routeFor(filename) {
  return `/${path.relative(output, filename).split(path.sep).join("/")}`.replace(/index\.html$/, "");
}

const pages = filesUnder(output)
  .filter((filename) => filename.endsWith(".html"))
  .map((filename) => {
    const route = routeFor(filename);
    const html = fs.readFileSync(filename, "utf8");
    const document = new JSDOM(html, { url: origin + route }).window.document;
    return { filename, route, html, document, url: origin + route };
  });
const pageByUrl = new Map(pages.map((page) => [page.url, page]));
const sources = filesUnder(sourceDirectory)
  .filter((filename) => {
    const relative = path.relative(sourceDirectory, filename).split(path.sep).join("/");
    if (!/\.md$/i.test(filename) || /(^|\/)_drafts\//.test(relative)) return false;
    if (config.exclude && micromatch.isMatch(relative, config.exclude)) return false;
    if (config.skip_render && micromatch.isMatch(relative, config.skip_render)) return false;
    return true;
  })
  .map((filename) => ({
    filename,
    // Keep authored timestamps as strings, independent of the machine timezone.
    ...frontMatter.parse(fs.readFileSync(filename, "utf8"), { schema: yaml.JSON_SCHEMA })
  }))
  .filter((source) => source.published !== false &&
    (config.future || !source.date || authoredTimestamp(source.date) <= Date.now()));
const posts = sources.filter((source) => source.filename.includes(`${path.sep}_posts${path.sep}`));

function sourcePage(source) {
  const matches = pages.filter((page) =>
    text(page.document.querySelector("h1")?.textContent) === text(source.title) &&
    page.document.documentElement.lang === (source.lang || config.language)
  );
  assert.equal(matches.length, 1, `One generated page for ${source.filename}`);
  return matches[0];
}

function meta(page, name, attribute = "name") {
  const elements = page.document.querySelectorAll(`meta[${attribute}="${name}"]`);
  assert.equal(elements.length, 1, `${page.route}: exactly one ${name} meta tag`);
  return elements[0].getAttribute("content") || "";
}

function canonical(page) {
  const links = page.document.querySelectorAll('link[rel="canonical"]');
  assert.equal(links.length, 1, `${page.route}: exactly one canonical`);
  return links[0].getAttribute("href");
}

function alternates(page) {
  const links = [...page.document.querySelectorAll('link[rel="alternate"][hreflang]')];
  const map = new Map(links.map((link) => [link.getAttribute("hreflang"), link.getAttribute("href")]));
  assert.equal(map.size, links.length, `${page.route}: no duplicate hreflang entries`);
  return map;
}

function structuredNodes(page) {
  const scripts = [...page.document.querySelectorAll('script[type="application/ld+json"]')];
  assert.ok(scripts.length, `${page.route}: JSON-LD is present`);
  const nodes = [];
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (value["@type"]) nodes.push(value);
    Object.values(value).forEach(visit);
  }
  for (const script of scripts) {
    let data;
    assert.doesNotThrow(() => { data = JSON.parse(script.textContent); }, `${page.route}: valid JSON-LD`);
    const documents = Array.isArray(data) ? data : [data];
    for (const item of documents) {
      assert.ok(item["@context"], `${page.route}: JSON-LD context is declared`);
    }
    visit(data);
  }
  return nodes;
}

function hasType(node, type) {
  return [].concat(node["@type"] || []).includes(type);
}

function absoluteCleanUrl(value, message) {
  const url = new URL(value);
  assert.equal(url.origin, origin, message);
  assert.equal(url.search, "", message);
  assert.equal(url.hash, "", message);
  assert.ok(!url.pathname.endsWith("/index.html"), message);
  return url;
}

function authoredTimestamp(value) {
  return moment.tz(String(value), config.timezone).valueOf();
}

test("every generated HTML page has a clean canonical, distinct title, description and one h1", () => {
  assert.ok(pages.length >= 2, "Production HTML has been generated");
  const titles = new Set();
  for (const page of pages) {
    const titleElements = page.document.querySelectorAll("title");
    assert.equal(titleElements.length, 1, `${page.route}: exactly one title`);
    const title = text(titleElements[0].textContent);
    assert.ok(title.length >= 5, `${page.route}: descriptive title`);
    assert.ok(!titles.has(title), `${page.route}: unique title, including dated archive pages`);
    titles.add(title);
    assert.equal(canonical(page), page.url, `${page.route}: self canonical independent of query parameters`);
    absoluteCleanUrl(canonical(page), `${page.route}: canonical URL`);
    const description = meta(page, "description");
    assert.ok(text(description), `${page.route}: nonempty description`);
    assert.equal(description, plainText(description), `${page.route}: description is plain text`);
    const headings = page.document.querySelectorAll("h1");
    assert.equal(headings.length, 1, `${page.route}: exactly one h1`);
    assert.ok(text(headings[0].textContent), `${page.route}: h1 is meaningful`);
  }
});

test("article descriptions use their own authored summaries and share metadata agrees", () => {
  assert.ok(posts.length, "Authored posts exist");
  for (const source of posts) {
    const page = sourcePage(source);
    const expected = plainText(source.description || source.excerpt);
    const description = meta(page, "description");
    if (expected) {
      assert.ok(description.startsWith(expected.slice(0, Math.min(60, expected.length))),
        `${page.route}: description comes from the article summary`);
    }
    assert.notEqual(description, config.description, `${page.route}: not a generic site summary`);
    assert.equal(meta(page, "og:description", "property"), description);
    assert.equal(meta(page, "og:url", "property"), canonical(page));
    assert.equal(meta(page, "og:type", "property"), "article");
    assert.ok(meta(page, "twitter:card"), `${page.route}: Twitter/X card is specified`);
  }
});

test("production discovery contains only published articles, never preview drafts", () => {
  const publishedUrls = new Set(posts.map(source => sourcePage(source).url));
  const renderedArticles = pages.filter(page => page.document.querySelector('meta[property="og:type"]')?.content === "article");
  assert.deepEqual(renderedArticles.map(page => canonical(page)).sort(), [...publishedUrls].sort(),
    "Every generated article must come from an eligible _posts source; --draft output must not be deployed");
  const searchEntries = JSON.parse(fs.readFileSync(path.join(output, "search.json"), "utf8"));
  for (const entry of searchEntries) {
    assert.ok(publishedUrls.has(new URL(entry.url, origin).href), `Search entry is a published article: ${entry.url}`);
  }
});

test("all structured data parses and identifies the real site and author", () => {
  const nodes = pages.flatMap(structuredNodes);
  const websites = nodes.filter((node) => hasType(node, "WebSite"));
  const people = nodes.filter((node) => hasType(node, "Person"));
  assert.ok(websites.length, "WebSite schema exists");
  assert.ok(people.length, "Person schema exists");
  for (const website of websites) {
    assert.equal(website.url, origin + "/", "WebSite URL is the production homepage");
    assert.ok(text(website.name), "WebSite has a name");
  }
  for (const person of people) {
    assert.equal(person.name, config.author, "Author identity matches the configured public name");
    assert.deepEqual(person.sameAs, ["https://x.com/ItsOdeLeo"], "Only the approved public profile is linked to the author");
    assert.equal(person.alternateName, undefined, "Do not infer social aliases for the author");
    if (person.url) assert.ok(pageByUrl.has(person.url), "Author URL points to a generated page");
  }
});

test("BlogPosting schema agrees with the published article and authored dates", () => {
  for (const source of posts) {
    const page = sourcePage(source);
    const nodes = structuredNodes(page);
    const articles = nodes.filter((node) => hasType(node, "BlogPosting"));
    assert.equal(articles.length, 1, `${page.route}: exactly one BlogPosting`);
    const article = articles[0];
    assert.equal(article.headline, source.title);
    assert.equal(article.url, canonical(page));
    assert.equal(article.inLanguage, source.lang || config.language);
    assert.equal(article.description, meta(page, "description"));
    assert.ok(Number.isFinite(Date.parse(article.datePublished)), `${page.route}: publication date is valid`);
    assert.ok(Number.isFinite(Date.parse(article.dateModified)), `${page.route}: modification date is valid`);
    assert.equal(Date.parse(article.datePublished), authoredTimestamp(source.date), `${page.route}: authored publication time and timezone`);
    assert.ok(Date.parse(article.dateModified) >= Date.parse(article.datePublished), `${page.route}: modification cannot predate publication`);
    if (source.updated) {
      assert.equal(Date.parse(article.dateModified), authoredTimestamp(source.updated), `${page.route}: authored modification time`);
    } else {
      assert.equal(article.dateModified, article.datePublished, `${page.route}: checkout/build times do not become modification dates`);
    }
    const author = [].concat(article.author || [])[0];
    assert.ok(author, `${page.route}: article has an author`);
    const person = author.name ? author : nodes.find((node) => node["@id"] === author["@id"] && hasType(node, "Person"));
    assert.equal(person?.name, config.author, `${page.route}: article author resolves to Person`);
  }
});

test("JSON-LD preserves arbitrary authored text without breaking out of its script element", () => {
  const { jsonForHtml } = require("../lib/seo");
  const value = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: 'Quotes " and & plus 中文 😀',
    description: '</script><img src=x onerror="alert(1)"><script>\u2028\u2029<!--'
  };
  const html = `<script type="application/ld+json">${jsonForHtml(value)}</script><p id="after">After</p>`;
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelectorAll("script").length, 1, "Authored text cannot inject another script");
  assert.equal(document.querySelectorAll("img").length, 0, "Authored text cannot inject HTML");
  assert.equal(document.querySelector("#after")?.textContent, "After", "The rest of the document remains intact");
  assert.deepEqual(JSON.parse(document.querySelector("script").textContent), value, "All text survives a JSON round trip");
});

test("translated posts and author pages have reciprocal, self-inclusive language alternates", () => {
  const groups = new Map();
  for (const source of sources.filter((source) => source.translation_key)) {
    const group = groups.get(source.translation_key) || [];
    group.push(source);
    groups.set(source.translation_key, group);
  }
  assert.ok([...groups.values()].some((group) => group.some((source) => !posts.includes(source))),
    "At least one translated non-post author/about page is generated");
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const expected = new Map(group.map((source) => [source.lang, sourcePage(source).url]));
    assert.ok(expected.has("en") && expected.has("zh"), `${key}: English and Chinese versions exist`);
    for (const source of group) {
      const page = sourcePage(source);
      const actual = alternates(page);
      for (const [language, url] of expected) {
        assert.equal(actual.get(language), url, `${page.route}: reciprocal ${language} alternate`);
        absoluteCleanUrl(url, `${page.route}: clean alternate URL`);
        assert.equal(pageByUrl.get(url).document.documentElement.lang, language);
      }
      if (actual.has("x-default")) assert.ok(pageByUrl.has(actual.get("x-default")), `${page.route}: x-default resolves`);
    }
  }
});

test("search is noindex,follow while ordinary pages remain indexable", () => {
  assert.ok(pages.some((page) => page.route === "/search/"), "Search page exists");
  for (const page of pages) {
    const directives = meta(page, "robots").toLowerCase().split(/\s*,\s*/);
    assert.ok(directives.includes("follow"), `${page.route}: links can be followed`);
    assert.ok(!directives.includes("nofollow"), `${page.route}: does not block following links`);
    const authored = sources.find(source => text(source.title) === text(page.document.querySelector('h1')?.textContent) && (source.lang || config.language) === page.document.documentElement.lang);
    const excluded = /\/(?:search\/|404\.html)$/.test(page.route) || authored?.indexing === false;
    if (excluded) {
      assert.ok(directives.includes("noindex"), `${page.route}: utility pages are not indexed`);
      assert.ok(!directives.includes("index"), `${page.route}: no conflicting index directive`);
    } else {
      assert.ok(directives.includes("index"), `${page.route}: indexable`);
      assert.ok(!directives.includes("noindex"), `${page.route}: no accidental noindex`);
    }
  }
});

test("visible breadcrumbs match structured navigation and author profiles identify their main person", () => {
  for (const page of pages) {
    const nodes = structuredNodes(page);
    const trail = nodes.find(node => hasType(node, "BreadcrumbList"));
    const visible = [...page.document.querySelectorAll('.breadcrumbs li')];
    if (visible.length) {
      assert.ok(trail, `${page.route}: visible navigation has matching schema`);
      assert.deepEqual(trail.itemListElement.map(item => item.name), visible.map(item => text(item.textContent)));
      trail.itemListElement.forEach((item, index) => {
        assert.equal(item.position, index + 1);
        assert.ok(pageByUrl.has(item.item), `${page.route}: breadcrumb target is generated`);
        const link = visible[index].querySelector('a');
        if (link) assert.equal(link.href, item.item);
      });
    } else assert.ok(!trail, `${page.route}: no invisible breadcrumb schema`);
    if (/\/about\/(?:zh\/)?$/.test(page.route)) {
      const profile = nodes.find(node => hasType(node, "ProfilePage"));
      assert.ok(profile, `${page.route}: the author page is a profile`);
      assert.ok(nodes.some(node => hasType(node, "Person") && node['@id'] === profile.mainEntity['@id']));
    }
  }
});

test("sitemap is valid XML containing exactly the indexable generated routes", () => {
  const xml = fs.readFileSync(path.join(output, "sitemap.xml"), "utf8");
  const document = new JSDOM(xml, { contentType: "application/xml" }).window.document;
  const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
  assert.equal(document.documentElement.localName, "urlset");
  assert.equal(document.documentElement.namespaceURI, namespace);
  const entries = [...document.getElementsByTagNameNS(namespace, "url")];
  const urls = entries.map((entry) => {
    const locations = entry.getElementsByTagNameNS(namespace, "loc");
    assert.equal(locations.length, 1, "Each sitemap entry has exactly one location");
    const url = locations[0].textContent;
    absoluteCleanUrl(url, "Sitemap URL is clean and on the production origin");
    assert.ok(pageByUrl.has(url), `${url}: sitemap entry resolves to a generated HTML page`);
    const lastmod = entry.getElementsByTagNameNS(namespace, "lastmod")[0]?.textContent;
    if (lastmod) assert.ok(Number.isFinite(Date.parse(lastmod)), `${url}: valid lastmod`);
    return url;
  });
  assert.equal(new Set(urls).size, urls.length, "Sitemap contains no duplicate locations");
  const expected = pages.filter((page) => !meta(page, "robots").includes("noindex")).map((page) => page.url);
  assert.deepEqual(urls.sort(), expected.sort(), "All indexable routes, including both article languages, are listed; search is excluded");
});

test("robots advertises the sitemap and lets crawlers read every HTML page, including search", () => {
  const robots = fs.readFileSync(path.join(output, "robots.txt"), "utf8");
  const lines = robots.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean);
  assert.ok(lines.some((line) => /^sitemap\s*:/i.test(line) && line.split(/:\s+/).slice(1).join(": ") === origin + "/sitemap.xml"),
    "Production sitemap is advertised");
  let agents = [];
  let sawRules = false;
  const rules = [];
  for (const line of lines) {
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, rawDirective, value] = match;
    const directive = rawDirective.toLowerCase();
    if (directive === "user-agent") {
      if (sawRules) agents = [];
      sawRules = false;
      agents.push(value);
    } else if (directive === "allow" || directive === "disallow") {
      sawRules = true;
      if (agents.includes("*") && value) rules.push({ allow: directive === "allow", value });
    }
  }
  assert.match(robots, /^User-agent:\s*\*\s*$/im, "Generic crawler group is present");
  for (const page of pages) {
    const matches = rules.filter((rule) => {
      const pattern = rule.value.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp("^" + pattern).test(page.route);
    }).sort((a, b) => b.value.length - a.value.length || Number(b.allow) - Number(a.allow));
    assert.ok(!matches.length || matches[0].allow, `${page.route}: not blocked by robots.txt`);
  }
});
