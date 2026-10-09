document.addEventListener("DOMContentLoaded", () => {
  const locationUrl = new URL(window.location.href);
  locationUrl.search = "";
  locationUrl.hash = "";
  locationUrl.pathname = locationUrl.pathname.replace(/\/index\.html$/, "/");
  const host = locationUrl.hostname.toLowerCase();
  const local = host === "localhost" || host.endsWith(".localhost") ||
    host === "[::1]" || /^127\./.test(host);

  document.querySelectorAll("[data-share]").forEach(group => {
    const copy = group.querySelector("[data-share-copy]");
    const native = group.querySelector("[data-share-native]");
    const socialLinks = group.querySelectorAll("[data-share-x], [data-share-linkedin]");
    const status = group.querySelector("[data-share-status]");
    const fallback = group.querySelector("[data-share-fallback]");
    const input = group.querySelector("[data-share-input]");
    const note = group.querySelector("[data-share-note]");
    const preview = local || group.dataset.sharePreview === "true";
    const url = preview ? locationUrl.href : group.dataset.shareUrl;
    const data = { title: group.dataset.shareTitle, url };
    input.value = url;
    copy.hidden = false;

    if (preview) {
      socialLinks.forEach(link => {
        link.removeAttribute("href");
        link.classList.add("share-action-preview");
        const explainPreview = event => {
          event.preventDefault();
          status.textContent = `${link.getAttribute("aria-label")}: ${group.dataset.previewFeedback}`;
        };
        link.addEventListener("click", explainPreview);
        if (link.tagName === "BUTTON") link.disabled = false;
        else {
          link.setAttribute("role", "button");
          link.setAttribute("tabindex", "0");
          link.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") explainPreview(event);
          });
        }
      });
      note.textContent = group.dataset.previewNote;
      note.hidden = false;
    }

    function showFallback(message) {
      fallback.hidden = false;
      status.textContent = message;
      input.focus();
      input.select();
    }

    copy.addEventListener("click", async () => {
      if (copy.disabled) return;
      copy.disabled = true;
      status.textContent = "";
      fallback.hidden = true;
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(url);
        status.textContent = group.dataset.copied;
      } catch {
        showFallback(group.dataset.copyFallback);
      } finally {
        copy.disabled = false;
      }
    });

    let supportsShare = !preview && window.isSecureContext && typeof navigator.share === "function";
    if (supportsShare && typeof navigator.canShare === "function") {
      try { supportsShare = navigator.canShare(data); } catch { supportsShare = false; }
    }
    native.hidden = !supportsShare;
    if (supportsShare) native.addEventListener("click", async () => {
      if (native.disabled) return;
      native.disabled = true;
      status.textContent = "";
      fallback.hidden = true;
      try {
        await navigator.share(data);
        // Resolving means the handoff completed, not necessarily that a post was sent.
      } catch (error) {
        if (error?.name !== "AbortError") showFallback(group.dataset.shareFallback);
      } finally {
        native.disabled = false;
      }
    });
  });
});
