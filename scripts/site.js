const { stripHTML } = require("hexo-util");
const { feedDetails, feedRoutes } = require("../lib/feeds");

function getPostLang(post, fallback = "en") {
  return post.lang || fallback;
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

hexo.extend.helper.register("feedDetails", function() {
  return feedDetails(this.config, this.page.content_language || this.page.lang || this.config.language);
});

hexo.extend.generator.register("canonical-feeds", function(locals) {
  return feedRoutes(hexo.config, locals.posts.toArray());
});
