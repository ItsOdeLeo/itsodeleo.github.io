const seo = require("../lib/seo");

function pageContext(context) {
  return { isPost: context.is_post(), isHome: context.is_home(), isArchive: context.is_archive() };
}

// Preserve authored language before Hexo adds its default lang to every page.
hexo.extend.filter.register("template_locals", function(locals) {
  locals.page.content_language = locals.page.lang || locals.page.language || "";
  return locals;
}, 5);

hexo.extend.helper.register("seoMetadata", function() {
  return seo.pageMetadata(this.config, this.page, pageContext(this));
});

hexo.extend.helper.register("seoTranslations", function() {
  if (seo.isNoindex(this.page)) return [];
  if (this.page.alternates) {
    return this.page.alternates.map(item => ({ lang: item.lang, url: seo.canonicalUrl(this.config, item.path) }));
  }
  const contents = [...this.site.posts.toArray(), ...this.site.pages.toArray()];
  return seo.translations(this.config, this.page, contents);
});

hexo.extend.helper.register("seoBreadcrumbs", function() {
  return seo.breadcrumbs(this.config, this.page, pageContext(this)).map(item => ({ ...item, path: new URL(item.url).pathname }));
});

hexo.extend.helper.register("seoStructuredData", function(meta) {
  return seo.jsonForHtml(seo.structuredData(this.config, this.page, meta, pageContext(this)));
});

hexo.extend.filter.register("after_generate", function() {
  const posts = this.locals.get("posts").toArray();
  const pages = this.locals.get("pages").toArray();
  const collections = this.locals.get("localized_pages") || [];
  const contentByPath = new Map([...posts, ...pages, ...collections].map(item => [this.route.format(item.path), item]));
  const postPaths = new Set(posts.map(post => this.route.format(post.path)));
  const entries = this.route.list().filter(path => /\.html$/.test(path)).sort().flatMap(path => {
    const content = contentByPath.get(path);
    if (seo.isNoindex(content || { path })) return [];
    return [{
      url: seo.canonicalUrl(this.config, path),
      // Static/list pages omit lastmod rather than advertising checkout/build times.
      modified: postPaths.has(path) ? seo.isoDate(content.updated || content.date) : undefined
    }];
  });
  this.route.set("sitemap.xml", seo.sitemapXml(entries));
  this.route.set("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${seo.absoluteUrl(this.config, "sitemap.xml")}\n`);
});
