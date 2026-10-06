document.addEventListener("DOMContentLoaded", () => {
  // Language belongs to the URL and the generated HTML. Explicit legacy links
  // such as /?lang=zh remain useful without redirecting by browser preferences.
  const lang = document.documentElement.lang.toLowerCase().startsWith("zh") ? "zh" : "en";
  document.documentElement.dataset.preferredLanguage = lang;
  if (!document.body.dataset.localizedCollection) return;

  const url = new URL(window.location.href);
  const requested = url.searchParams.get("lang");
  if (requested !== "en" && requested !== "zh") return;
  const target = document.querySelector(`a[data-language-switch="${requested}"]`);
  if (!target) return;
  const destination = new URL(target.href, url);
  if (destination.origin !== url.origin) return;
  url.searchParams.delete("lang");
  destination.search = url.search;
  destination.hash = url.hash;
  if (destination.pathname === url.pathname) {
    window.history.replaceState({}, "", destination);
  } else {
    window.location.replace(destination.href);
  }
});
