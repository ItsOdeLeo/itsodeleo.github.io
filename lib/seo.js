const { stripHTML, unescapeHTML } = require("hexo-util");

function absoluteUrl(config, path = "") {
  const base = `${config.url.replace(/\/+$/, "")}/`;
  return new URL(String(path).replace(/^\/+/, ""), base).href;
}

function canonicalUrl(config, path = "") {
  const url = new URL(absoluteUrl(config, path));
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/index\.html$/, "/");
  return url.href;
}

function plainText(value = "") {
  const html = String(value)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*class=["'][^"']*headerlink[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/<\/(?:p|div|h[1-6]|li)>/gi, " ");
  return unescapeHTML(stripHTML(html)).replace(/\s+/g, " ").trim();
}

function summarize(value, limit = 180) {
  const text = plainText(value);
  const characters = Array.from(text);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("").trimEnd()}…` : text;
}

function isoDate(value) {
  if (!value) return undefined;
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isNoindex(page = {}) {
  return page.layout === "search" || page.indexing === false ||
    /(?:^|[\s,])noindex(?:$|[\s,])/i.test(String(page.robots || "")) ||
    /^(?:\/)?404(?:\.html|\/index\.html)?$/.test(page.path || "");
}

function translations(config, page, contents) {
  if (!page.translation_key) return [];
  const variants = contents.filter(item => item.translation_key === page.translation_key && !isNoindex(item));
  return variants.map(item => ({
    lang: item.lang || config.language || "en",
    url: canonicalUrl(config, item.path)
  })).sort((a, b) => a.lang.localeCompare(b.lang));
}

function pageMetadata(config, page, { isPost = false, isHome = false, isArchive = false } = {}) {
  const lang = page.lang || config.language || "en";
  const siteName = config.title;
  let label = page.title;
  let description = page.description || page.excerpt;

  if (isHome) {
    label = config.seo?.home_title || "Personal essays";
    description = config.description;
  } else if (isArchive) {
    const period = [page.year, page.month ? String(page.month).padStart(2, "0") : null].filter(Boolean).join("/");
    label = period ? `Archive: ${period}` : "Archive";
    description = period ? `Essays by ${config.author} published in ${period}, in English and Chinese.` : `Browse essays by ${config.author} by year and month, in English and Chinese.`;
  }

  const pageNumber = Number(page.current || 1);
  const pagination = pageNumber > 1 ? ` · Page ${pageNumber}` : "";
  const title = `${plainText(label || siteName)}${pagination}${label && label !== siteName ? ` · ${siteName}` : ""}`;
  const canonical = canonicalUrl(config, page.path || "");
  return {
    title,
    description: summarize(description || (isPost ? page.content : "") || config.description),
    canonical,
    lang,
    locale: lang === "zh" ? "zh_CN" : "en_US",
    robots: isNoindex(page) ? "noindex, follow" : "index, follow, max-image-preview:large",
    published: isPost ? isoDate(page.date) : undefined,
    modified: isPost ? isoDate(page.updated || page.date) : undefined,
    image: page.image ? absoluteUrl(config, page.image) : undefined,
    imageAlt: page.image_alt ? plainText(page.image_alt) : undefined
  };
}

function structuredData(config, page, meta, { isPost = false } = {}) {
  const home = canonicalUrl(config);
  const authorUrl = absoluteUrl(config, config.seo?.author_path || "about/");
  const author = {
    "@type": "Person",
    "@id": `${home}#author`,
    name: config.author || config.title,
    url: authorUrl,
    sameAs: Object.values(config.social || {}).map(account => account.url).filter(Boolean)
  };
  const website = {
    "@type": "WebSite",
    "@id": `${home}#website`,
    url: home,
    name: config.title,
    description: plainText(config.description),
    inLanguage: config.languages?.options || [config.language || "en"],
    publisher: { "@id": author["@id"] }
  };
  const webPage = {
    "@type": page.translation_key === "about" ? "AboutPage" : "WebPage",
    "@id": `${meta.canonical}#webpage`,
    url: meta.canonical,
    name: meta.title,
    description: meta.description,
    inLanguage: meta.lang,
    isPartOf: { "@id": website["@id"] }
  };
  const graph = [author, website, webPage];
  if (page.translation_key === "about") webPage.mainEntity = { "@id": author["@id"] };
  if (isPost) {
    const article = {
      "@type": "BlogPosting",
      "@id": `${meta.canonical}#article`,
      url: meta.canonical,
      headline: plainText(page.title),
      description: meta.description,
      inLanguage: meta.lang,
      datePublished: meta.published,
      dateModified: meta.modified,
      author: { "@id": author["@id"] },
      publisher: { "@id": author["@id"] },
      mainEntityOfPage: { "@id": webPage["@id"] }
    };
    if (meta.image) article.image = [meta.image];
    webPage.mainEntity = { "@id": article["@id"] };
    graph.push(article);
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

function jsonForHtml(value) {
  // JSON is emitted unescaped inside a script element, so escape HTML delimiters.
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function sitemapXml(entries) {
  const xmlEscape = value => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[character]);
  const urls = entries.map(({ url, modified }) => `  <url><loc>${xmlEscape(url)}</loc>${modified ? `<lastmod>${xmlEscape(modified)}</lastmod>` : ""}</url>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>', ''].join("\n");
}

module.exports = { absoluteUrl, canonicalUrl, plainText, summarize, isoDate, isNoindex, translations, pageMetadata, structuredData, jsonForHtml, sitemapXml };
