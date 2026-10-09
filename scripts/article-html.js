const { enhanceArticleHtml } = require("../lib/article-html");

hexo.extend.filter.register("after_post_render", function(data) {
  data.content = enhanceArticleHtml(data.content, data.lang || data.language || this.config.language);
  return data;
});
