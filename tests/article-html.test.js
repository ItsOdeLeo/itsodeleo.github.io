const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const { enhanceArticleHtml } = require("../lib/article-html");

function fragment(html) {
  return JSDOM.fragment(html);
}

test("heading permalinks retain IDs, rendered text and markup while naming the actual section", () => {
  const html = '<h2 id="A-B"><a href="#A-B" class="headerlink" title="A > B"></a>A &gt; <em>B</em></h2>\n<p>  Text &amp; spacing. </p>';
  const result = enhanceArticleHtml(html);
  assert.equal(result, html.replace('title="A > B"', 'title="A > B" aria-label="Permanent link: A &gt; B"'));
  const document = fragment(result);
  assert.equal(document.querySelector("h2").id, "A-B");
  assert.equal(document.querySelector("h2").textContent, "A > B");
  assert.equal(document.querySelector("a").getAttribute("href"), "#A-B");
  const chinese = fragment(enhanceArticleHtml('<h3 id="判断"><a class="headerlink" href="#%E5%88%A4%E6%96%AD"></a>判断</h3>', "zh"));
  assert.equal(chinese.querySelector("a").getAttribute("aria-label"), "永久链接：判断");
});

test("only matching generated section links are annotated; authored labels and examples survive", () => {
  const html = '<h1 id="title"><a class="headerlink" href="#title"></a>Title</h1>' +
    '<h2 id="kept"><a class="headerlink" href="#kept" aria-label="Authored name"></a>Kept</h2>' +
    '<h2 id="other"><a class="headerlink" href="#wrong"></a>Other</h2>' +
    '<h2 id="bad"><a class="headerlink" href="#%invalid"></a>Bad fragment</h2>' +
    '<template><h2 id="example"><a class="headerlink" href="#example"></a>Example</h2></template>' +
    '<pre>&lt;h2 id="code"&gt;Code&lt;/h2&gt;</pre>' +
    '<script>const example = \'<h2 id="js">Example</h2>\';</script>';
  assert.equal(enhanceArticleHtml(html), html);
  assert.equal(enhanceArticleHtml(undefined), undefined);
  assert.equal(enhanceArticleHtml(""), "");
});

test("named scroll tables gain a caption and column scopes without changing results or order", () => {
  const html = '<div class="table-scroll" role="region" aria-label="模型结果" tabindex="0">\n<table>\n<thead><tr><th>模型</th><th align="right">正确率</th></tr></thead><tbody><tr><td>Gemma</td><td>75%</td></tr></tbody></table>\n</div>';
  const result = enhanceArticleHtml(html, "zh");
  const document = fragment(result);
  assert.equal(document.querySelector("caption").textContent, "模型结果");
  assert.deepEqual([...document.querySelectorAll("thead th")].map(cell => cell.scope), ["col", "col"]);
  assert.equal(document.querySelector("th[align]").getAttribute("align"), "right");
  assert.deepEqual([...document.querySelectorAll("tbody td")].map(cell => cell.textContent), ["Gemma", "75%"]);
  assert.equal(result.replace("<caption>模型结果</caption>", "").replaceAll(' scope="col"', ""), html);
  assert.equal(document.querySelector("[role=region]").getAttribute("tabindex"), "0");
});

test("existing captions, complex header scopes and unnamed tables are not reinterpreted", () => {
  const html = '<div class="table-scroll" aria-label="Container"><table><caption>Authored caption</caption><thead><tr><th colspan="2" scope="colgroup">Group</th><th rowspan="2">Spanning</th><th scope="row">Authored scope</th></tr></thead></table></div>' +
    '<table><thead><tr><th>Outside article wrapper</th></tr></thead></table>';
  assert.equal(enhanceArticleHtml(html), html);
  const unlabeled = fragment(enhanceArticleHtml('<div class="table-scroll"><table><thead><tr><th>Name</th></tr></thead></table></div>'));
  assert.equal(unlabeled.querySelector("caption"), null);
  assert.equal(unlabeled.querySelector("th").scope, "col");
});

test("text annotations cannot create HTML and repeated rendering is idempotent", () => {
  const html = '<h2 id="quotes"><a class="headerlink" href="#quotes"></a>&quot;Choices&quot; &amp; &lt;results&gt;</h2>' +
    '<div class="table-scroll" aria-label="&lt;img src=x onerror=alert(1)&gt; &amp; Results"><table><thead><tr><th>Name</th></tr></thead></table></div>';
  const result = enhanceArticleHtml(html);
  const document = fragment(result);
  assert.equal(document.querySelector("a").getAttribute("aria-label"), 'Permanent link: "Choices" & <results>');
  assert.equal(document.querySelector("caption").textContent, "<img src=x onerror=alert(1)> & Results");
  assert.equal(document.querySelector("img"), null);
  assert.equal(enhanceArticleHtml(result), result);
  assert.equal(document.querySelectorAll("caption").length, 1);
});

test("Hexo integration changes rendered content only and respects authored language", () => {
  let registered;
  const script = fs.readFileSync(path.join(__dirname, "../scripts/article-html.js"), "utf8");
  vm.runInNewContext(script, {
    require: () => ({ enhanceArticleHtml }),
    hexo: { extend: { filter: { register(name, callback) { registered = { name, callback }; } } } }
  });
  assert.equal(registered.name, "after_post_render");
  const original = '<h2 id="section"><a class="headerlink" href="#section"></a>章节</h2>';
  const data = { title: "Author title", lang: "zh", raw: "Author manuscript", content: original };
  assert.equal(registered.callback.call({ config: { language: "en" } }, data), data);
  assert.equal(data.raw, "Author manuscript");
  assert.equal(data.title, "Author title");
  assert.match(data.content, /永久链接：章节/);
});
