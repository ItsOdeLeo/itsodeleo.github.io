const { stripHTML } = require("hexo-util");
const { Parser } = require("htmlparser2");
const { canonicalUrl, isNoindex, isoDate } = require("./seo");
const { languages, language, localizedPath } = require("./localization");

function xmlEscape(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[character]);
}

function cdata(value = "") {
  return `<![CDATA[${String(value).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function feedDetails(config, lang = "en") {
  const locale = language(lang);
  const homePath = localizedPath("home", locale, config);
  const siteTitle = config.title || "Blog";
  return {
    lang: locale,
    title: locale === "zh" ? `${siteTitle} 的中文文章` : `${siteTitle} — Essays in English`,
    description: locale === "zh" ? config.seo?.home_description_zh || `${config.author || siteTitle} 的中文文章。` : config.description || `Essays by ${config.author || siteTitle}.`,
    author: config.author || siteTitle,
    home: canonicalUrl(config, homePath),
    atomPath: `${homePath}atom.xml`,
    rssPath: `${homePath}rss2.xml`
  };
}

function feedPosts(config, posts, lang, now = Date.now()) {
  const fallback = config.languages?.default || config.language || "en";
  const limit = Number(config.feed?.limit ?? 20);
  const filtered = posts.filter(post => {
    const published = isoDate(post.date);
    return post.published !== false && !isNoindex(post) && post.path && published &&
      language(post.lang || fallback) === language(lang) &&
      (config.future || Date.parse(published) <= now);
  }).sort((a, b) => Date.parse(isoDate(b.date)) - Date.parse(isoDate(a.date)) || String(a.path).localeCompare(String(b.path)));
  return Number.isFinite(limit) && limit > 0 ? filtered.slice(0, limit) : filtered;
}

function changedAt(post) {
  // Hexo's updated_option: date keeps unauthored filesystem times out of this field.
  return new Date(Math.max(Date.parse(isoDate(post.date)), Date.parse(isoDate(post.updated) || isoDate(post.date))));
}

function latestChange(posts) {
  return posts.length ? new Date(Math.max(...posts.map(post => changedAt(post).getTime()))) : null;
}

function absoluteContentUrls(html, base) {
  html = String(html);
  const edits = [];
  // Rewrite only parsed URL attributes. Keeping source slices avoids changing
  // prose, code examples, or the entity escaping of unrelated HTML.
  const parser = new Parser({
    onattribute(name, value) {
      if (!["href", "src", "poster"].includes(name) || !value.trim() || /^[a-z][a-z\d+.-]*:/i.test(value.trim())) return;
      let absolute;
      try { absolute = new URL(value, base).href; } catch { return; }
      edits.push({ start: parser.startIndex, end: parser.endIndex, value: `${name}="${xmlEscape(absolute)}"` });
    }
  });
  parser.end(html);
  for (const edit of edits.reverse()) html = html.slice(0, edit.start) + edit.value + html.slice(edit.end);
  return html;
}

function entryContent(config, post) {
  const content = (post.content || "").replace(/<a\b[^>]*class=["'][^"']*\bheaderlink\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "");
  const base = canonicalUrl(config, post.path);
  return {
    content: cdata(absoluteContentUrls(content, base)),
    summary: cdata(absoluteContentUrls(post.excerpt || post.description || stripHTML(content).slice(0, 280), base))
  };
}

function buildAtomFeed(config, posts, lang) {
  const details = feedDetails(config, lang);
  const self = canonicalUrl(config, details.atomPath);
  // Atom requires updated even for an empty feed. A fixed epoch avoids claiming
  // a fresh editorial change every time an empty locale is rebuilt.
  const updated = (latestChange(posts) || new Date(0)).toISOString();
  const entries = posts.map(post => {
    const url = xmlEscape(canonicalUrl(config, post.path));
    const { summary, content } = entryContent(config, post);
    return [
      `<entry xml:lang="${details.lang}" xml:base="${url}">`,
      `<title>${xmlEscape(post.title || "Untitled")}</title>`,
      `<link href="${url}" rel="alternate" type="text/html" hreflang="${details.lang}"/>`,
      `<id>${url}</id>`,
      `<updated>${changedAt(post).toISOString()}</updated>`,
      `<published>${isoDate(post.date)}</published>`,
      `<summary type="html">${summary}</summary>`,
      `<content type="html">${content}</content>`,
      "</entry>"
    ].join("");
  }).join("");
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${details.lang}">`,
    `<title>${xmlEscape(details.title)}</title>`,
    `<subtitle>${xmlEscape(details.description)}</subtitle>`,
    `<link href="${xmlEscape(self)}" rel="self" type="application/atom+xml"/>`,
    `<link href="${xmlEscape(details.home)}" rel="alternate" type="text/html" hreflang="${details.lang}"/>`,
    `<id>${xmlEscape(self)}</id>`,
    `<updated>${updated}</updated>`,
    `<author><name>${xmlEscape(details.author)}</name></author>`,
    entries, "</feed>"
  ].join("");
}

function buildRssFeed(config, posts, lang) {
  const details = feedDetails(config, lang);
  const updated = latestChange(posts);
  const items = posts.map(post => {
    const url = xmlEscape(canonicalUrl(config, post.path));
    const { summary, content } = entryContent(config, post);
    return [
      "<item>", `<title>${xmlEscape(post.title || "Untitled")}</title>`,
      `<link>${url}</link>`, `<guid isPermaLink="true">${url}</guid>`,
      `<pubDate>${new Date(isoDate(post.date)).toUTCString()}</pubDate>`,
      `<description>${summary}</description>`, `<content:encoded>${content}</content:encoded>`, "</item>"
    ].join("");
  }).join("");
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>", `<title>${xmlEscape(details.title)}</title>`,
    `<link>${xmlEscape(details.home)}</link>`, `<description>${xmlEscape(details.description)}</description>`,
    `<language>${details.lang}</language>`,
    updated ? `<lastBuildDate>${updated.toUTCString()}</lastBuildDate>` : "",
    `<atom:link href="${xmlEscape(canonicalUrl(config, details.rssPath))}" rel="self" type="application/rss+xml"/>`,
    items, "</channel>", "</rss>"
  ].join("");
}

function feedRoutes(config, allPosts, now = Date.now()) {
  return languages.flatMap(lang => {
    const details = feedDetails(config, lang);
    const posts = feedPosts(config, allPosts, lang, now);
    return [
      { path: details.atomPath, data: buildAtomFeed(config, posts, lang) },
      { path: details.rssPath, data: buildRssFeed(config, posts, lang) }
    ];
  });
}

module.exports = { feedDetails, feedRoutes };
