document.addEventListener("DOMContentLoaded", async () => {
  const input = document.getElementById("search-input");
  const results = document.getElementById("search-results");
  const storageKey = "preferred-language";

  if (!input || !results) {
    return;
  }

  const searchUrl = results.dataset.searchUrl;
  const escapeHtml = (value) =>
    value.replace(/[&<>"']/g, (char) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return entities[char];
    });

  const normalize = (value) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean);

  const resolveLink = (item) => {
    if (item.url) {
      return item.url;
    }

    if (item.path) {
      return item.path.startsWith("/") ? item.path : `/${item.path}`;
    }

    return "#";
  };

  const renderEmpty = (message) => {
    results.innerHTML = `<p class="search-empty">${escapeHtml(message)}</p>`;
  };

  const getLanguage = () => {
    const saved = window.localStorage.getItem(storageKey);
    return saved === "zh" || saved === "en" ? saved : document.documentElement.dataset.preferredLanguage || "en";
  };

  const emptyMessages = {
    en: {
      start: "Start typing to search your posts.",
      failed: "The search index could not be loaded.",
      noMatches: (query) => `No matches for “${query}”.`
    },
    zh: {
      start: "开始输入关键词来搜索文章。",
      failed: "搜索索引加载失败。",
      noMatches: (query) => `没有找到“${query}”相关的文章。`
    }
  };

  let posts = [];

  try {
    const response = await fetch(searchUrl);
    posts = await response.json();
    renderEmpty(emptyMessages[getLanguage()].start);
  } catch (error) {
    renderEmpty(emptyMessages[getLanguage()].failed);
    return;
  }

  const renderMatches = (matches, query) => {
    const lang = getLanguage();

    if (!query) {
      renderEmpty(emptyMessages[lang].start);
      return;
    }

    if (!matches.length) {
      renderEmpty(emptyMessages[lang].noMatches(query));
      return;
    }

    results.innerHTML = matches
      .map((item) => {
        const snippet = item.snippet.length > 200 ? `${item.snippet.slice(0, 200)}…` : item.snippet;
        return `
          <article class="search-result">
            <h2 class="search-result-title">
              <a href="${escapeHtml(resolveLink(item))}">${escapeHtml(item.title || "Untitled")}</a>
            </h2>
            <p class="post-meta">${escapeHtml(item.dateLabel || "")}</p>
            <p class="search-result-snippet">${escapeHtml(snippet)}</p>
          </article>
        `;
      })
      .join("");
  };

  input.addEventListener("input", () => {
    const query = input.value.trim();
    const tokens = normalize(query);
    const lang = getLanguage();

    if (!tokens.length) {
      renderMatches([], "");
      return;
    }

    const matches = posts
      .map((item) => {
        const title = item.title || "";
        const content = (item.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const haystack = `${title} ${content}`.toLowerCase();
        const itemLang = item.lang || "en";

        let score = 0;
        for (const token of tokens) {
          if (title.toLowerCase().includes(token)) {
            score += 3;
          }
          if (haystack.includes(token)) {
            score += 1;
          }
        }

        return {
          ...item,
          score: itemLang === lang ? score : 0,
          snippet: content
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((item) => ({
        ...item,
        dateLabel: item.date ? new Date(item.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : ""
      }));

    renderMatches(matches, query);
  });

  window.addEventListener("languagechange", () => {
    if (!input.value.trim()) {
      renderMatches([], "");
      return;
    }
    input.dispatchEvent(new Event("input"));
  });
});
