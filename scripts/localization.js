const localization = require("../lib/localization");

hexo.extend.helper.register("localText", function(key, lang = this.page.lang) {
  return localization.text(key, lang);
});

hexo.extend.helper.register("localizedPath", function(section, lang = this.page.lang) {
  return localization.localizedPath(section, lang, this.config);
});

hexo.extend.helper.register("localizedDate", function(value, style = "long", lang = this.page.lang) {
  return localization.localizedDate(value, style, lang, this.config.timezone);
});

// Built-in generators paginate both languages together. Replace them so every
// locale has complete static HTML and pagination follows its own essay list.
hexo.extend.generator.register("archive", () => []);
hexo.extend.generator.register("index", function(locals) {
  const routes = localization.collectionRoutes(this.config, locals.posts.toArray(), this.model("Post").Query);
  this.locals.set("localized_pages", () => routes.map(route => ({ ...route.data, path: route.path })));
  return routes;
});
