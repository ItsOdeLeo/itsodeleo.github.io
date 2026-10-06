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

  if (page.localization) {
    label = page.title;
    description = page.description;
  } else if (isHome) {
    label = config.seo?.home_title || "Personal essays";
    description = config.description;
  } else if (isArchive) {
    const period = [page.year, page.month ? String(page.month).padStart(2, "0") : null].filter(Boolean).join("/");
    label = period ? `Archive: ${period}` : "Archive";
    description = period ? `Essays by ${config.author} published in ${period}, in English and Chinese.` : `Browse essays by ${config.author} by year and month, in English and Chinese.`;
  }

  const pageNumber = Number(page.current || 1);
  const pagination = pageNumber > 1 ? (lang === "zh" ? ` · 第 ${pageNumber} 页` : ` · Page ${pageNumber}`) : "";
  const title = `${plainText(label || siteName)}${pagination}${label && label !== siteName ? ` · ${siteName}` : ""}`;
  const canonical = canonicalUrl(config, page.path || "");
  return {
    title,
    description: summarize((description || (isPost ? page.content : "") || config.description) + (pagination ? ` (${pagination.slice(3)})` : "")),
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

function breadcrumbs(config, page, { isPost = false, isHome = false, isArchive = false } = {}) {
  if (isNoindex(page)) return [];
  const chinese = (page.lang || config.language) === "zh";
  const prefix = chinese ? "zh/" : "";
  const archivePath = `${prefix}${(config.archive_dir || "archives").replace(/^\/+|\/+$/g, "")}/`;
  const home = { name: chinese ? "首页" : "Home", url: canonicalUrl(config, prefix) };
  const current = { name: plainText(page.title || config.title), url: canonicalUrl(config, page.path) };
  const items = [home];
  if (isPost) {
    items.push({ name: chinese ? "文章" : "Posts", url: canonicalUrl(config, prefix + "blog/") }, current);
  } else if (isArchive || page.collection_kind === "archive") {
    items.push({ name: chinese ? "归档" : "Archive", url: canonicalUrl(config, archivePath) });
    if (page.year && config.archive_generator?.yearly !== false) items.push({ name: String(page.year), url: canonicalUrl(config, `${archivePath}${page.year}/`) });
    if (page.month) items.push({ name: chinese ? `${page.month}月` : String(page.month).padStart(2, "0"), url: canonicalUrl(config, `${archivePath}${page.year}/${String(page.month).padStart(2, "0")}/`) });
  } else if (page.collection_kind === "posts") {
    items.push({ name: plainText(page.title), url: canonicalUrl(config, prefix + "blog/") });
  } else if (!isHome && page.collection_kind !== "home") {
    items.push(current);
  }
  if (Number(page.current || 1) > 1) {
    items.push({ name: chinese ? `第 ${page.current} 页` : `Page ${page.current}`, url: current.url });
  }
  return items.length > 1 ? items : [];
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
  if (config.seo?.author_aliases?.length) author.alternateName = config.seo.author_aliases;
  const website = {
    "@type": "WebSite",
    "@id": `${home}#website`,
    url: home,
    name: config.title,
    description: plainText(config.description),
    inLanguage: config.languages?.options || [config.language || "en"],
    publisher: { "@id": author["@id"] }
  };
  if (config.seo?.alternate_name) website.alternateName = config.seo.alternate_name;
  const webPage = {
    "@type": page.translation_key === "about" ? ["AboutPage", "ProfilePage"] : "WebPage",
    "@id": `${meta.canonical}#webpage`,
    url: meta.canonical,
    name: meta.title,
    description: meta.description,
    inLanguage: meta.lang,
    isPartOf: { "@id": website["@id"] }
  };
  const graph = [author, website, webPage];
  const trail = breadcrumbs(config, page, { isPost, isHome: page.__index, isArchive: page.__archive });
  if (trail.length) {
    const breadcrumb = {
      "@type": "BreadcrumbList",
      "@id": `${meta.canonical}#breadcrumb`,
      itemListElement: trail.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url }))
    };
    graph.push(breadcrumb);
    webPage.breadcrumb = { "@id": breadcrumb["@id"] };
  }
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

module.exports = { absoluteUrl, canonicalUrl, plainText, summarize, isoDate, isNoindex, translations, pageMetadata, breadcrumbs, structuredData, jsonForHtml, sitemapXml };
