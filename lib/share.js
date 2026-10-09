const { canonicalUrl, plainText } = require("./seo");

function shareMetadata(config, page) {
  const url = canonicalUrl(config, page.path);
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  const local = host === "localhost" || host.endsWith(".localhost") ||
    host === "[::1]" || /^127\./.test(host);
  const preview = page.published === false || /(?:^|[/\\])_drafts[/\\]/.test(page.source || "") ||
    parsed.protocol !== "https:" || local;
  const title = plainText(page.title);
  const intent = new URL("https://x.com/intent/tweet");
  intent.searchParams.set("url", url);
  intent.searchParams.set("text", title);
  const linkedin = new URL("https://www.linkedin.com/sharing/share-offsite/");
  linkedin.searchParams.set("url", url);
  return { url, title, preview, xUrl: preview ? null : intent.href, linkedinUrl: preview ? null : linkedin.href };
}

module.exports = { shareMetadata };
