const { stripHTML } = require("hexo-util");

function getPostLang(post, fallback = "en") {
  return post.lang || fallback;
}

function toJsDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  return new Date(value);
}

function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(value = "") {
  return `<![CDATA[${String(value).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function siteUrl(path = "") {
  const base = (hexo.config.url || "").replace(/\/+$/, "");
  const normalized = path ? `/${String(path).replace(/^\/+/, "")}` : "/";
  return `${base}${normalized}`;
}

function canonicalPosts(posts, preferredLang) {
  const groups = new Map();

  posts.forEach((post) => {
    const key = post.translation_key || `${post.source || post.slug || post.path}:${getPostLang(post, preferredLang)}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(post);
  });

  return Array.from(groups.values())
    .map((group) => group.find((post) => getPostLang(post, preferredLang) === preferredLang) || group[0])
    .sort((a, b) => b.date - a.date);
}

function cleanContent(html) {
  return (html || "").replace(/<a[^>]*class="headerlink"[^>]*>[^<]*<\/a>/g, "");
}

function buildAtomFeed(posts) {
  const updated = posts[0] && posts[0].date ? toJsDate(posts[0].date).toISOString() : new Date().toISOString();
  const feedId = siteUrl("/atom.xml");
  const siteTitle = hexo.config.title || "Blog";
  const siteDescription = hexo.config.description || "";
  const author = hexo.config.author || siteTitle;

  const entries = posts.map((post) => {
    const url = siteUrl(post.path);
    const title = xmlEscape(post.title || "Untitled");
    const cleaned = cleanContent(post.content);
    const summary = cdata(post.excerpt ? String(post.excerpt) : stripHTML(cleaned).slice(0, 280));
    const content = cdata(cleaned);
    const updatedAt = toJsDate(post.updated || post.date);
    const publishedAt = toJsDate(post.date);
    return [
      "<entry>",
      `<title>${title}</title>`,
      `<link href="${xmlEscape(url)}"/>`,
      `<id>${xmlEscape(url)}</id>`,
      `<updated>${updatedAt.toISOString()}</updated>`,
      `<published>${publishedAt.toISOString()}</published>`,
      `<author><name>${xmlEscape(author)}</name></author>`,
      `<summary type="html">${summary}</summary>`,
      `<content type="html">${content}</content>`,
      "</entry>"
    ].join("");
  }).join("");

  return [
    "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
    "<feed xmlns=\"http://www.w3.org/2005/Atom\">",
    `<title>${xmlEscape(siteTitle)}</title>`,
    `<subtitle>${xmlEscape(siteDescription)}</subtitle>`,
    `<link href="${xmlEscape(siteUrl("/atom.xml"))}" rel="self"/>`,
    `<link href="${xmlEscape(siteUrl("/"))}"/>`,
    `<id>${xmlEscape(feedId)}</id>`,
    `<updated>${updated}</updated>`,
    `<author><name>${xmlEscape(author)}</name></author>`,
    entries,
    "</feed>"
  ].join("");
}

function buildRssFeed(posts) {
  const siteTitle = hexo.config.title || "Blog";
  const siteDescription = hexo.config.description || "";
  const feedUrl = siteUrl("/rss2.xml");
  const homepage = siteUrl("/");
  const lang = (hexo.config.language || "en").split(",")[0].trim();
  const lastBuildDate = new Date().toUTCString();

  const items = posts.map((post) => {
    const url = siteUrl(post.path);
    const cleaned = cleanContent(post.content);
    const summary = cdata(post.excerpt ? String(post.excerpt) : stripHTML(cleaned).slice(0, 280));
    const content = cdata(cleaned);
    const publishedAt = toJsDate(post.date);
    return [
      "<item>",
      `<title>${xmlEscape(post.title || "Untitled")}</title>`,
      `<link>${xmlEscape(url)}</link>`,
      `<guid>${xmlEscape(url)}</guid>`,
      `<pubDate>${publishedAt.toUTCString()}</pubDate>`,
      `<description>${summary}</description>`,
      `<content:encoded>${content}</content:encoded>`,
      "</item>"
    ].join("");
  }).join("");

  return [
    "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
    "<rss version=\"2.0\" xmlns:content=\"http://purl.org/rss/1.0/modules/content/\" xmlns:atom=\"http://www.w3.org/2005/Atom\">",
    "<channel>",
    `<title>${xmlEscape(siteTitle)}</title>`,
    `<link>${xmlEscape(homepage)}</link>`,
    `<description>${xmlEscape(siteDescription)}</description>`,
    `<language>${xmlEscape(lang)}</language>`,
    `<lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    `<atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    items,
    "</channel>",
    "</rss>"
  ].join("");
}

hexo.extend.helper.register("postLang", function(post) {
  return getPostLang(post, (this.config.languages && this.config.languages.default) || "en");
});

hexo.extend.helper.register("langLabel", function(lang) {
  return lang === "zh" ? "中文" : "English";
});

hexo.extend.helper.register("translatedPost", function(post) {
  const posts = this.site.posts ? this.site.posts.toArray() : [];
  const key = post.translation_key;

  if (!key) {
    return null;
  }

  return posts.find((candidate) => candidate.translation_key === key && candidate.lang !== post.lang) || null;
});

hexo.extend.generator.register("search", function(locals) {
  const defaultLang = (hexo.config.languages && hexo.config.languages.default) || "en";
  const posts = locals.posts.sort("-date").map((post) => ({
    title: post.title,
    url: hexo.config.root + post.path,
    content: stripHTML(post.content || "").replace(/\s+/g, " ").trim(),
    date: post.date ? post.date.toISOString() : "",
    lang: getPostLang(post, defaultLang),
    translation_key: post.translation_key || "",
    excerpt: post.excerpt ? stripHTML(post.excerpt).replace(/\s+/g, " ").trim() : ""
  }));

  return {
    path: "search.json",
    data: JSON.stringify(posts)
  };
});

hexo.extend.generator.register("canonical-feeds", function(locals) {
  const defaultLang = (hexo.config.feed && hexo.config.feed.canonical_lang) || (hexo.config.languages && hexo.config.languages.default) || "en";
  const limit = (hexo.config.feed && hexo.config.feed.limit) || 20;
  const posts = canonicalPosts(locals.posts.sort("-date").toArray(), defaultLang).slice(0, limit);

  return [
    {
      path: "atom.xml",
      data: buildAtomFeed(posts)
    },
    {
      path: "rss2.xml",
      data: buildRssFeed(posts)
    }
  ];
});
