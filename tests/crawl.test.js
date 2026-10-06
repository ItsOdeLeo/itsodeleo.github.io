const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const yaml = require("js-yaml");

// Inspect published output rather than merely testing the URL helpers.
const root = path.resolve(__dirname, "..");
const config = yaml.load(fs.readFileSync(path.join(root, "_config.yml"), "utf8"));
const output = path.join(root, config.public_dir || "public");
const origin = new URL(config.url).origin;
const files = fs.readdirSync(output, { recursive: true })
  .filter(file => fs.statSync(path.join(output, file)).isFile());
const pages = files.filter(file => file.endsWith(".html")).map(file => {
  const route = "/" + file.split(path.sep).join("/").replace(/index\.html$/, "");
  const url = new URL(route, config.url).href;
  const document = new JSDOM(fs.readFileSync(path.join(output, file), "utf8"), { url }).window.document;
  return { file, url, document };
});
const byFile = new Map(pages.map(page => [page.file, page]));

function resolveInternal(reference, page) {
  if (!reference || /^(?:data|mailto|tel|javascript):/i.test(reference)) return null;
  const url = new URL(reference, page.url);
  if (url.origin !== origin) return null;
  let file = decodeURIComponent(url.pathname).replace(/^\//, "");
  if (!file || file.endsWith("/")) file += "index.html";
  // GitHub Pages redirects slashless directory requests to their index page.
  if (!fs.existsSync(path.join(output, file)) && !path.extname(file)) file += "/index.html";
  const resolved = path.resolve(output, file);
  assert.ok(resolved.startsWith(output + path.sep), `${page.url}: local reference stays in the output directory`);
  assert.ok(fs.existsSync(resolved) && fs.statSync(resolved).isFile(), `${page.url}: ${reference} resolves to a published file`);
  return { file, url, page: byFile.get(file) };
}

function indexable(page) {
  return !/(?:^|[\s,])noindex(?:$|[\s,])/i.test(page.document.querySelector('meta[name="robots"]')?.content || "");
}

function canonical(page) {
  return page.document.querySelector('link[rel="canonical"]')?.href;
}

test("every local link, asset, and document fragment resolves in the published site", () => {
  for (const page of pages) {
    for (const element of page.document.querySelectorAll("[href], [src]")) {
      for (const attribute of ["href", "src"]) {
        const reference = element.getAttribute(attribute);
        if (!reference) continue;
        const target = resolveInternal(reference, page);
        if (target?.page && target.url.hash && !target.url.hash.startsWith("#:~:text=")) {
          const fragment = decodeURIComponent(target.url.hash.slice(1));
          assert.ok(target.page.document.getElementById(fragment) ||
            [...target.page.document.getElementsByName(fragment)].some(node => node.tagName === "A"),
          `${page.url}: fragment ${reference} exists`);
        }
      }
    }
  }
});

test("indexable canonical targets and language alternates are indexable, self-canonical and reciprocal", () => {
  for (const page of pages) {
    const target = resolveInternal(canonical(page), page)?.page;
    assert.ok(target, `${page.url}: canonical refers to a published HTML page`);
    if (indexable(page)) assert.ok(indexable(target), `${page.url}: canonical does not point to noindex content`);
    assert.equal(canonical(target), target.url, `${page.url}: canonical target is itself canonical`);
    const alternates = [...page.document.querySelectorAll('link[rel="alternate"][hreflang]')];
    for (const alternate of alternates) {
      const language = alternate.hreflang;
      const translated = resolveInternal(alternate.href, page)?.page;
      assert.ok(translated && indexable(translated), `${page.url}: ${language} target is an indexable HTML page`);
      assert.equal(alternate.href, canonical(translated), `${page.url}: ${language} points to its canonical URL`);
      if (language === "x-default") continue;
      assert.equal(translated.document.documentElement.lang, language, `${page.url}: alternate language agrees with target`);
      const backLinks = [...translated.document.querySelectorAll('link[rel="alternate"][hreflang]')];
      assert.ok(backLinks.some(link => link.href === canonical(page) && link.hreflang === page.document.documentElement.lang),
        `${page.url}: ${language} alternate links back to this language`);
    }
  }
});

test("every indexable HTML page is reachable from homepage links without executing JavaScript", () => {
  const homepage = byFile.get("index.html");
  assert.ok(homepage, "Homepage exists");
  const visited = new Set();
  const pending = [homepage];
  while (pending.length) {
    const page = pending.shift();
    if (visited.has(page.file)) continue;
    visited.add(page.file);
    for (const anchor of page.document.querySelectorAll("a[href]")) {
      if (anchor.rel.split(/\s+/).includes("nofollow")) continue;
      const target = resolveInternal(anchor.href, page)?.page;
      if (target && !visited.has(target.file)) pending.push(target);
    }
  }
  for (const page of pages.filter(indexable)) {
    assert.ok(visited.has(page.file), `${page.url}: crawlable from the homepage through HTML anchors`);
  }
});

test("content and social images resolve and provide alternatives for readers", () => {
  for (const page of pages) {
    for (const img of page.document.querySelectorAll("img")) {
      assert.ok(img.hasAttribute("alt"), `${page.url}: image has an alt attribute (empty only for decorative images)`);
      assert.ok(img.getAttribute("src"), `${page.url}: image has a source`);
      resolveInternal(img.getAttribute("src"), page);
    }
    for (const element of page.document.querySelectorAll("img[srcset], source[srcset]")) {
      const candidates = element.getAttribute("srcset");
      // Embedded data URLs contain commas and need no network request.
      if (!candidates || candidates.includes("data:")) continue;
      for (const candidate of candidates.split(",")) {
        resolveInternal(candidate.trim().split(/\s+/)[0], page);
      }
    }
    for (const [name, attribute, altName] of [["og:image", "property", "og:image:alt"], ["twitter:image", "name", "twitter:image:alt"]]) {
      const image = page.document.querySelector(`meta[${attribute}="${name}"]`);
      if (!image) continue;
      resolveInternal(image.content, page);
      assert.ok(page.document.querySelector(`meta[${attribute}="${altName}"]`)?.content?.trim(),
        `${page.url}: ${name} has meaningful alternative text`);
    }
    for (const script of page.document.querySelectorAll('script[type="application/ld+json"]')) {
      const visit = value => {
        if (!value || typeof value !== "object") return;
        if (value.image) {
          for (const image of [].concat(value.image)) {
            const reference = typeof image === "string" ? image : image.url || image.contentUrl;
            if (reference) resolveInternal(reference, page);
          }
        }
        Object.values(value).forEach(child => typeof child === "object" && visit(child));
      };
      visit(JSON.parse(script.textContent));
    }
  }
});

test("the homepage has a crawlable square favicon with a sufficiently sized raster fallback", () => {
  const homepage = byFile.get("index.html");
  const icons = [...homepage.document.querySelectorAll('link[rel~="icon"]')];
  assert.ok(icons.length, "Homepage declares its favicon");
  const raster = icons.map(icon => resolveInternal(icon.href, homepage)).find(icon => icon?.file.endsWith(".png"));
  assert.ok(raster, "A crawlable PNG favicon is available");
  const bytes = fs.readFileSync(path.join(output, raster.file));
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "Raster favicon is a PNG");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.equal(width, height, "Favicon is square");
  assert.ok(width > 48, "Favicon exceeds Google's recommended 48px size for larger surfaces");
});

test("a helpful dedicated 404 remains outside the index and sitemap", () => {
  const error = byFile.get("404.html");
  assert.ok(error, "GitHub Pages custom 404.html exists");
  assert.ok(!indexable(error), "404 page is noindex");
  const links = [...error.document.querySelectorAll("a[href]")].map(anchor => new URL(anchor.href).pathname);
  assert.ok(links.includes("/") && links.includes("/zh/"), "404 links back to both language homepages");
  const sitemap = fs.readFileSync(path.join(output, "sitemap.xml"), "utf8");
  assert.ok(!sitemap.includes("/404.html"), "404 is excluded from the sitemap");
});
