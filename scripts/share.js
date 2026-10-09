const { shareMetadata } = require("../lib/share");

hexo.extend.helper.register("articleShare", function() {
  return shareMetadata(this.config, this.page);
});
