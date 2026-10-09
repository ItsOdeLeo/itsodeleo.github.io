const { parseDocument } = require("htmlparser2");
const { escapeHTML } = require("hexo-util");

function hasClass(node, name) {
  return (node.attribs?.class || "").split(/\s+/).includes(name);
}

function textContent(node) {
  if (node.type === "text") return node.data;
  if (hasClass(node, "headerlink") || ["script", "style"].includes(node.name)) return "";
  return (node.children || []).map(textContent).join("");
}

function fragmentMatches(href, id) {
  if (!href?.startsWith("#")) return false;
  try {
    return decodeURIComponent(href.slice(1)) === id;
  } catch {
    return href.slice(1) === id;
  }
}

// Locate the opening tag's end without mistaking a quoted attribute's > for it.
function openingTagEnd(html, start) {
  let quote = null;
  for (let index = start; index < html.length; index++) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function enhanceArticleHtml(html, language = "en") {
  if (typeof html !== "string" || !html) return html;
  const document = parseDocument(html, { withStartIndices: true, withEndIndices: true });
  const insertions = [];
  const addAttribute = (node, name, value) => {
    const end = openingTagEnd(html, node.startIndex);
    if (end >= 0) insertions.push({ at: end, value: ` ${name}="${escapeHTML(value)}"` });
  };

  function visit(node) {
    if (/^h[2-6]$/.test(node.name) && node.attribs?.id) {
      const title = textContent(node).replace(/\s+/g, " ").trim();
      for (const anchor of node.children || []) {
        if (anchor.name !== "a" || !hasClass(anchor, "headerlink") ||
          !fragmentMatches(anchor.attribs.href, node.attribs.id) || anchor.attribs["aria-label"] || !title) continue;
        addAttribute(anchor, "aria-label", language === "zh" ? `永久链接：${title}` : `Permanent link: ${title}`);
      }
    }

    if (node.name === "table" && hasClass(node.parent, "table-scroll")) {
      const children = node.children || [];
      const label = node.parent.attribs["aria-label"]?.trim();
      if (label && !children.some(child => child.name === "caption")) {
        const end = openingTagEnd(html, node.startIndex);
        if (end >= 0) insertions.push({ at: end + 1, value: `<caption>${escapeHTML(label)}</caption>` });
      }
      for (const head of children.filter(child => child.name === "thead")) {
        for (const row of (head.children || []).filter(child => child.name === "tr")) {
          for (const cell of (row.children || []).filter(child => child.name === "th")) {
            // Authored scopes and spanning/group headers need their own semantics.
            if (!cell.attribs.scope && !(Number(cell.attribs.colspan) > 1) && !(Number(cell.attribs.rowspan) > 1)) {
              addAttribute(cell, "scope", "col");
            }
          }
        }
      }
    }
    // Templates contain examples, not visible article content to annotate.
    if (node.name === "template") return;
    for (const child of node.children || []) visit(child);
  }
  visit(document);

  // Preserve authored markup, whitespace, entities, heading IDs and table values.
  for (const insertion of insertions.sort((left, right) => right.at - left.at)) {
    html = html.slice(0, insertion.at) + insertion.value + html.slice(insertion.at);
  }
  return html;
}

module.exports = { enhanceArticleHtml };
