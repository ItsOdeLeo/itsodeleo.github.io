const pagination = require("hexo-pagination");

const languages = ["en", "zh"];
const labels = {
  en: {
    "nav.home": "Home", "nav.posts": "Posts", "nav.archive": "Archive", "nav.search": "Search", "nav.about": "About",
    "home.title": "Latest essays", "home.metaTitle": "Essays on intelligence and reality",
    "home.description": "Personal essays and local AI experiments on intelligence, simulation, and how we understand reality.",
    "posts.title": "All essays", "posts.description": "Essays and local AI experiments on intelligence, simulation, and reality.",
    "archive.title": "Archive", "archive.description": "Browse essays by year and month.",
    "search.title": "Search", "search.description": "Find essays by title or a phrase from the text.",
    "search.label": "Search essays", "search.placeholder": "Try “intelligence” or “simulation”", "search.start": "Type a word or phrase to find an essay.",
    "empty": "No essays in this language yet.", "pagination.label": "Pagination", "pagination.prev": "Previous", "pagination.next": "Next",
    "post.translation": "Read this essay in", "post.allPosts": "All essays", "post.archive": "Archive", "post.updated": "Updated",
    "share.label": "Share", "share.copy": "Copy link", "share.x": "Share on X", "share.linkedin": "Share on LinkedIn", "share.native": "More sharing options", "share.link": "Article link",
    "share.copied": "Link copied.", "share.copyFallback": "Select the link below and copy it manually.",
    "share.fallback": "Sharing is unavailable here. You can copy the link below.", "share.preview": "Local preview: use the published page to share on X or LinkedIn. Copied links work only on this device.",
    "share.previewFeedback": "This is a local preview. Share from the live article after publication; this preview cannot be opened by other readers.",
    "language.label": "Language", "nav.label": "Primary", "search.noScript": "Search needs JavaScript. You can browse all essays instead.",
    "page": "Page"
  },
  zh: {
    "nav.home": "首页", "nav.posts": "文章", "nav.archive": "归档", "nav.search": "搜索", "nav.about": "关于",
    "home.title": "最新文章", "home.metaTitle": "关于智能与现实的思考",
    "home.description": "本地 AI 实验，以及关于智能、模拟与我们如何理解现实的个人思考。",
    "posts.title": "全部文章", "posts.description": "关于本地 AI 实验、智能、模拟与现实的个人文章。",
    "archive.title": "文章归档", "archive.description": "按年份和月份浏览文章。",
    "search.title": "搜索", "search.description": "通过标题或正文中的词句查找文章。",
    "search.label": "搜索文章", "search.placeholder": "试试搜索“智能”或“模拟”", "search.start": "输入关键词或句子来查找文章。",
    "empty": "当前语言下还没有文章。", "pagination.label": "分页", "pagination.prev": "上一页", "pagination.next": "下一页",
    "post.translation": "阅读其他语言版本：", "post.allPosts": "全部文章", "post.archive": "归档", "post.updated": "更新于",
    "share.label": "分享", "share.copy": "复制链接", "share.x": "分享到 X", "share.linkedin": "分享到 LinkedIn", "share.native": "更多分享方式", "share.link": "文章链接",
    "share.copied": "链接已复制。", "share.copyFallback": "请选中下方链接，手动复制。",
    "share.fallback": "当前无法打开分享面板，可以复制下方链接。", "share.preview": "本地预览：X 和 LinkedIn 分享需在正式上线的页面使用；复制的链接仅限本机打开。",
    "share.previewFeedback": "当前是本地预览，其他人无法打开。请在文章发布后，从正式页面分享。",
    "language.label": "语言", "nav.label": "主导航", "search.noScript": "搜索需要启用 JavaScript，也可以直接浏览全部文章。",
    "page": "页"
  }
};

function language(value) {
  return String(value || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function text(key, lang = "en") {
  return labels[language(lang)][key] || labels.en[key] || key;
}

function localizedPath(section = "home", lang = "en", config = {}) {
  const prefix = language(lang) === "zh" ? "zh/" : "";
  const archive = (config.archive_dir || "archives").replace(/^\/+|\/+$/g, "");
  if (section === "about") return language(lang) === "zh" ? "about/zh/" : "about/";
  return prefix + ({ home: "", posts: "blog/", archive: `${archive}/`, search: "search/" }[section] ?? section.replace(/^\/+/, ""));
}

function localizedDate(value, style = "long", lang = "en", timezone = "UTC") {
  const date = value?.toDate ? value.toDate() : new Date(value);
  const formats = {
    long: { year: "numeric", month: "long", day: "numeric" },
    short: { month: "short", day: "numeric" },
    month: { month: "long" },
    yearMonth: { year: "numeric", month: "long" }
  };
  return new Intl.DateTimeFormat(language(lang) === "zh" ? "zh-CN" : "en", {
    ...(formats[style] || formats.long), timeZone: timezone || "UTC"
  }).format(date);
}

function collectionRoutes(config, allPosts, Query) {
  const routes = [];
  const families = new Map();
  const defaultLang = config.languages?.default || config.language || "en";
  const pageDirectory = config.pagination_dir || "page";

  function generate(kind, lang, posts, suffix = "", extra = {}) {
    const base = localizedPath(kind, lang, config) + suffix;
    const perPage = kind === "home" || kind === "posts" ? config.index_generator.per_page : config.archive_generator.per_page;
    const layout = { home: "index", posts: "posts", archive: "archive", search: "search" }[kind];
    const period = extra.month ? `${extra.year}/${String(extra.month).padStart(2, "0")}` : extra.year;
    const title = kind === "home" ? (lang === "zh" ? config.seo?.home_title_zh : config.seo?.home_title) || text("home.metaTitle", lang) : kind === "archive" && period ?
      (lang === "zh" ? `${period} 文章归档` : `Archive: ${period}`) : text(`${kind}.title`, lang);
    const author = config.author || config.title;
    const description = kind === "home" ? (lang === "zh" ? config.seo?.home_description_zh : config.description) || text("home.description", lang) :
      kind === "archive" && period ? (lang === "zh" ? `${author} 于 ${period} 发表的文章。` : `Essays by ${author} published in ${period}.`) :
      kind === "posts" ? (lang === "zh" ? `${author} 关于本地 AI 实验、智能、模拟与现实的个人文章。` : `Essays and local AI experiments by ${author} on intelligence, simulation, and reality.`) : text(`${kind}.description`, lang);
    const generated = pagination(base, new Query(posts), {
      perPage: posts.length && kind !== "search" ? perPage : 0,
      format: `${pageDirectory}/%d/`, layout,
      data: {
        lang, content_language: lang, localization: true, collection_kind: kind,
        title, description, layout, __index: kind === "home", archive: kind === "archive",
        indexing: kind !== "search", ...extra
      }
    });
    for (const route of generated) {
      route.data.path = route.path;
      const family = `${kind}:${suffix}`;
      if (!families.has(family)) families.set(family, []);
      families.get(family).push(route);
      routes.push(route);
    }
  }

  for (const lang of languages) {
    const posts = allPosts.filter(post => language(post.lang || defaultLang) === lang).sort((a, b) => b.date - a.date);
    generate("home", lang, posts);
    generate("posts", lang, posts);
    generate("search", lang, []);
    if (config.archive_generator.enabled === false) continue;
    generate("archive", lang, posts);
    const years = new Map();
    for (const post of posts) {
      const year = post.date.year();
      if (!years.has(year)) years.set(year, []);
      years.get(year).push(post);
    }
    for (const [year, yearPosts] of years) {
      if (config.archive_generator.yearly) generate("archive", lang, yearPosts, `${year}/`, { year });
      if (!config.archive_generator.monthly) continue;
      for (let month = 1; month <= 12; month++) {
        const monthPosts = yearPosts.filter(post => post.date.month() + 1 === month);
        if (monthPosts.length) generate("archive", lang, monthPosts, `${year}/${String(month).padStart(2, "0")}/`, { year, month });
      }
    }
  }

  for (const family of families.values()) {
    for (const route of family) {
      const peers = family.filter(candidate => candidate.data.current === route.data.current);
      // Later slices may contain different essays in each language, so only
      // language landing pages claim to be translations of one another.
      route.data.alternates = route.data.current === 1 ? peers.map(peer => ({ lang: peer.data.lang, path: peer.path })) : [];
      route.data.language_paths = Object.fromEntries(languages.map(lang => {
        const peer = peers.find(candidate => candidate.data.lang === lang) || family.find(candidate => candidate.data.lang === lang && candidate.data.current === 1);
        return [lang, peer?.path ?? localizedPath(route.data.collection_kind, lang, config)];
      }));
    }
  }
  return routes;
}

module.exports = { languages, language, text, localizedPath, localizedDate, collectionRoutes };
