document.addEventListener("DOMContentLoaded", () => {
  const storageKey = "preferred-language";
  const defaultLang = document.body.dataset.defaultLanguage || "en";
  const contentLanguage = document.body.dataset.contentLanguage || "";
  const contentUiLanguage = contentLanguage.toLowerCase().startsWith("zh") ? "zh" : "en";
  const labels = {
    en: {
      "nav.home": "Home",
      "nav.posts": "Posts",
      "nav.archive": "Archive",
      "nav.search": "Search",
      "nav.about": "About",
      "home.title": "Latest essays",
      "home.description": "Personal essays on intelligence, simulation, and how we understand reality.",
      "home.empty": "No posts yet. Add a Markdown file in source/_posts to get started.",
      "posts.title": "All posts",
      "posts.description": "Essays in English and Chinese.",
      "posts.empty": "No posts yet.",
      "archive.title": "Archive",
      "archive.description": "Browse posts by year and month.",
      "archive.empty": "No posts yet.",
      "search.title": "Search",
      "search.description": "Search across titles and post content, entirely in your browser.",
      "search.label": "Search posts",
      "search.hint": "The index is generated at build time. No backend required.",
      "search.start": "Start typing to search your posts.",
      "post.eyebrow": "Post",
      "post.translation": "Read this post in",
      "post.allPosts": "All posts",
      "post.archive": "Archive",
      "filter.empty": "No posts available in this language yet."
    },
    zh: {
      "nav.home": "首页",
      "nav.posts": "文章",
      "nav.archive": "归档",
      "nav.search": "搜索",
      "nav.about": "关于",
      "home.title": "最新文章",
      "home.description": "关于智能、模拟与我们如何理解现实的个人思考。",
      "home.empty": "还没有文章。先在 source/_posts 里添加一个 Markdown 文件。",
      "posts.title": "全部文章",
      "posts.description": "中英文文章。",
      "posts.empty": "还没有文章。",
      "archive.title": "归档",
      "archive.description": "按年份和月份浏览文章。",
      "archive.empty": "还没有文章。",
      "search.title": "搜索",
      "search.description": "直接在浏览器中搜索文章标题和正文内容。",
      "search.label": "搜索文章",
      "search.hint": "搜索索引在构建时生成，不需要后端。",
      "search.start": "开始输入关键词来搜索文章。",
      "post.eyebrow": "文章",
      "post.translation": "切换到",
      "post.allPosts": "全部文章",
      "post.archive": "归档",
      "filter.empty": "当前语言下还没有可显示的文章。"
    }
  };

  const getStoredLanguage = () => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved === "zh" || saved === "en" ? saved : defaultLang;
    } catch (error) {
      return defaultLang;
    }
  };

  const storeLanguage = (lang) => {
    try {
      window.localStorage.setItem(storageKey, lang);
    } catch (error) {
      // Language switching still works when browser storage is unavailable.
    }
  };

  const getQueryLanguage = () => {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get("lang");
    return lang === "zh" || lang === "en" ? lang : null;
  };

  const setQueryLanguage = (lang) => {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", lang);
    window.history.replaceState({}, "", url);
  };

  const applyTranslations = (lang) => {
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.dataset.i18n;
      const message = labels[lang][key];
      if (message) {
        element.textContent = message;
      }
    });

    document.querySelectorAll("[data-placeholder-en][data-placeholder-zh]").forEach((element) => {
      element.setAttribute("placeholder", lang === "zh" ? element.dataset.placeholderZh : element.dataset.placeholderEn);
    });

    document.querySelectorAll("[data-language-url-en][data-language-url-zh]").forEach((element) => {
      element.setAttribute("href", lang === "zh" ? element.dataset.languageUrlZh : element.dataset.languageUrlEn);
    });
  };

  const applyLanguageFilter = (lang) => {
    document.querySelectorAll("[data-language-list]").forEach((list) => {
      const items = Array.from(list.querySelectorAll("[data-post-lang]"));
      let visibleCount = 0;

      items.forEach((item) => {
        const visible = !item.dataset.postLang || item.dataset.postLang === lang;
        item.hidden = !visible;
        if (visible) {
          visibleCount += 1;
        }
      });

      const empty = list.nextElementSibling && list.nextElementSibling.matches("[data-language-empty]") ? list.nextElementSibling : null;
      if (empty) {
        empty.hidden = visibleCount !== 0;
      }
    });
  };

  const updateButtons = (lang) => {
    document.querySelectorAll("[data-language-switch]").forEach((button) => {
      const active = button.dataset.languageSwitch === lang;
      button.classList.toggle("active", active);
      if (button.tagName === "A") {
        if (active) {
          button.setAttribute("aria-current", "page");
        } else {
          button.removeAttribute("aria-current");
        }
      } else {
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    });
  };

  const applyLanguage = (language, updatePreference = false) => {
    const lang = contentLanguage ? contentUiLanguage : language;
    document.documentElement.lang = contentLanguage || lang;
    document.documentElement.dataset.preferredLanguage = lang;
    if (updatePreference) {
      storeLanguage(lang);
      setQueryLanguage(lang);
    }
    updateButtons(lang);
    applyTranslations(lang);
    applyLanguageFilter(lang);
    window.dispatchEvent(new CustomEvent("languagechange", { detail: { lang } }));
  };

  const initialLanguage = contentLanguage ? contentUiLanguage : (getQueryLanguage() || getStoredLanguage());

  document.querySelectorAll("[data-language-switch]").forEach((button) => {
    button.addEventListener("click", () => {
      const lang = button.dataset.languageSwitch;
      if (contentLanguage) {
        // Real translation links retain native navigation, including new-tab clicks.
        if (button.tagName === "A" && button.getAttribute("href")) {
          storeLanguage(lang);
        }
        return;
      }
      applyLanguage(lang, true);
    });
  });

  applyLanguage(initialLanguage);
});
