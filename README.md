# Li Zeng’s Blog

A text-first personal blog at [itsodeleo.github.io](https://itsodeleo.github.io), published from [ItsOdeLeo/itsodeleo.github.io](https://github.com/ItsOdeLeo/itsodeleo.github.io). The project uses Hexo with a custom minimal theme, Markdown posts, a local JSON search index, and archive pages by year and month.

## Features

- Clean, minimal, responsive layout
- Home page with title, bio, and latest posts
- Dedicated all-posts page at `/blog/`
- Post detail pages generated from Markdown
- Complete English/Chinese static pages with paired translation links
- Local search at `/search/`
- Archive index plus year and month archive pages
- Atom and RSS feeds at `/atom.xml` and `/rss2.xml`
- GitHub Pages deployment through GitHub Actions
- Per-page SEO metadata, canonical URLs, bilingual alternates, and article/author structured data
- Automatic XML sitemap and crawl rules, with SEO checks before deployment

## Project Structure

```text
.
├── .github/workflows/pages.yml
├── _config.yml
├── package.json
├── README.md
├── lib
│   ├── localization.js
│   └── seo.js
├── scripts
│   ├── site.js
│   ├── localization.js
│   └── seo.js
├── tests
│   ├── language-switcher.test.js
│   ├── crawl.test.js
│   └── seo-output.test.js
├── scaffolds/post.md
├── source
│   ├── _posts
│   │   ├── when-reality-feels-structured.md
│   │   └── when-reality-feels-structured_zh.md
│   ├── about
│   │   ├── index.md
│   │   └── zh/index.md
│   ├── 404.md
│   ├── favicon.png
│   └── favicon.svg
└── themes/paper
    ├── layout
    │   ├── archive.ejs
    │   ├── index.ejs
    │   ├── layout.ejs
    │   ├── page.ejs
    │   ├── post.ejs
    │   ├── posts.ejs
    │   ├── search.ejs
    │   └── partials
    │       ├── footer.ejs
    │       ├── head.ejs
    │       ├── header.ejs
    │       └── post-item.ejs
    └── source
        ├── css/style.css
        └── js
            ├── language-switcher.js
            └── search.js
```

## Local Development

Install dependencies:

```bash
npm ci
```

Run a local dev server:

```bash
npm run dev
```

The site will be available at `http://localhost:4000`.

Build the production site:

```bash
npm run build
```

Clean generated files if needed:

```bash
npm run clean
```

## Editing the Site

### Site title, subtitle, bio, and main URL

Edit these fields in [`_config.yml`](_config.yml):

- `title`
- `subtitle`
- `bio`
- `description`
- `url`

### Social links

Also edit [`_config.yml`](_config.yml):

```yml
social:
  x:
    label: Twitter / X
    url: https://x.com/yourhandle
  linkedin:
    label: LinkedIn
    url: https://www.linkedin.com/in/yourhandle/
```

The site also exposes subscription feeds automatically:

- `https://itsodeleo.github.io/atom.xml`
- `https://itsodeleo.github.io/rss2.xml`

### Add a new post

Create a new Markdown file in [`source/_posts`](source/_posts) or use:

```bash
npm run new "Post Title"
```

Each post should include front matter similar to:

```md
---
title: Your Post Title
date: 2026-03-23 10:00:00
slug: your-post-title
excerpt: A short summary for lists and previews.
lang: en
translation_key: your-post-series
---

Intro paragraph.

<!-- more -->

Rest of the post.
```

With the current Hexo configuration, the Markdown filename determines the post slug: `your-post-title.md` becomes `/posts/your-post-title/`. Keep published filenames stable to preserve existing links; a `slug` front-matter field does not override this filename behavior.

### Add Chinese and English versions of the same post

Create two Markdown files with the same `translation_key` and different `lang` values:

```md
---
title: My English Post
date: 2026-03-23 10:00:00
slug: my-english-post
excerpt: English summary.
lang: en
translation_key: my-first-post
---
```

```md
---
title: 我的中文文章
date: 2026-03-23 10:00:00
slug: wo-de-zhongwen-wenzhang
excerpt: 中文摘要。
lang: zh
translation_key: my-first-post
---
```

Rules:

- Use `lang: en` for English and `lang: zh` for Chinese
- Two versions of the same article should share the same `translation_key`
- English collection pages live at `/`, `/blog/`, and `/archives/`; Chinese equivalents live under `/zh/`. Search also has a localized `/zh/search/` page.
- Language links navigate real static pages; language filtering happens before pagination at build time, so lists work without JavaScript.
- A post page shows a direct link to the other language version when it exists

## GitHub Pages Deployment

This repository includes a workflow at [`pages.yml`](.github/workflows/pages.yml) that builds the Hexo site and publishes the generated `public/` directory to GitHub Pages.

The repository name must match the GitHub username: `itsodeleo.github.io` for `ItsOdeLeo`. Keep `_config.yml` set to `url: https://itsodeleo.github.io` and `root: /`.

Use **GitHub Actions** as the Pages source. “Deploy from a branch” invokes Jekyll, which cannot build this Hexo theme.

The recommended local folder is `itsodeleo.github.io`. Documentation links are relative so moving or renaming the checkout does not break them. `_multiconfig.yml` is generated by Hexo preview commands and is intentionally ignored.

### One-time GitHub setup

1. Push this repository to GitHub.
2. In the repository settings, open `Settings -> Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Under `Settings -> Actions -> General`, make sure workflows are allowed to run.
5. Push to `main` again if you need to trigger the first deployment.

### Normal publishing flow

1. Edit content locally.
2. Run `npm run check` to verify the site.
3. Commit and push to `main`.
4. GitHub Actions will build and deploy automatically.

## Extending the Blog

- Update styles in [`themes/paper/source/css/style.css`](themes/paper/source/css/style.css)
- Update templates in [`themes/paper/layout`](themes/paper/layout)
- Add more static pages in [`source`](source)

The project is intentionally small so it stays easy to maintain.

## SEO

SEO is generated at build time in `scripts/seo.js` and `lib/seo.js`; no browser JavaScript is needed to read article content or metadata.

- Every page has a title, description, self-referencing canonical URL, Open Graph, and X card metadata. Canonicals omit `index.html`, query parameters, and fragments. Each translated article keeps its own canonical URL.
- Paired articles and About pages declare reciprocal `en`/`zh` `hreflang` links using `translation_key`. English/Chinese collection landing pages also declare alternates. Each language has its own canonical URL, title, description, navigation, and list content in the generated HTML.
- Pagination is calculated separately for each language. Later slices use self-canonicals and crawlable previous/next links; they do not claim to be translations of potentially different article selections. Legacy explicit `?lang=zh` links navigate to the matching Chinese collection; storage and browser settings never override the language of a URL.
- JSON-LD identifies the website and author, describes each article as a `BlogPosting`, and marks author pages as `ProfilePage`/`AboutPage`. Author information and public handles are visible on `/about/` and `/about/zh/`. Visible navigation trails match `BreadcrumbList` markup.
- `/sitemap.xml` is generated from the actual HTML routes. It includes both article languages and excludes `noindex` pages and 404 pages. `/robots.txt` allows crawling and advertises the sitemap.
- Search has `noindex, follow`; it stays crawlable so search engines can read that instruction. Set `indexing: false` in another page's front matter to exclude it from search results and the sitemap.
- A custom `404.html` helps visitors recover while keeping the actual HTTP 404 status on GitHub Pages. Crawlable PNG/SVG favicons represent the same Li Zeng identity as the site; regenerate them with `python3 tools/generate-favicon.py`.

### Writing article metadata

`description` takes precedence over `excerpt`, then article text supplies a fallback. The text is cleaned and shortened for metadata; no keyword tag stuffing is used. Write each summary in the article's language.

```yaml
description: A concise summary of this article's actual argument.
updated: 2026-10-06 12:00:00
image: /images/my-article.jpg
image_alt: A description of what the image shows.
```

All these fields are optional. Set `updated` only after a meaningful content change, using the site's configured timezone. `updated_option: date` uses the publication date when `updated` is absent, so CI checkout times do not make old posts look newly updated. Static pages and archives omit sitemap `lastmod` rather than inventing update dates. Images must exist; if none is provided, no image URL is invented in sharing metadata or structured data.

Edit `description`, `seo.home_title`, `seo.home_title_zh`, and `seo.home_description_zh` in `_config.yml` for the site summaries. Collection labels are in `lib/localization.js`, and `scripts/localization.js` generates their routes; there are no separate Markdown sources for blog/search collections. Update the About pages, `seo.author_aliases`, and `social` links when your public profile changes.

### Search engine verification and submission

Google Search Console ownership uses the public HTML meta-tag token in `seo.google_site_verification`. Keep this token deployed after verification so ownership can be rechecked. Verification and sitemap processing status are shown in Search Console; deploying the token alone does not establish indexing. To set up or restore verification:

1. Add `https://itsodeleo.github.io/` as a URL-prefix property in [Google Search Console](https://search.google.com/search-console/).
2. Copy the HTML meta-tag verification token into `seo.google_site_verification` in `_config.yml`, deploy, then complete verification in Search Console. For Bing, use `seo.bing_site_verification` from [Bing Webmaster Tools](https://www.bing.com/webmasters/).
3. Submit `https://itsodeleo.github.io/sitemap.xml`, then inspect the homepage and both article URLs to check indexing and the canonical URL selected by the search engine.

Changing a GitHub username does not provide redirects from old `github.io` sites. This repository cannot create redirects on old domains you no longer control. Update public profile links to the current domain.

### Validation

```bash
npm run check
```

This performs a clean production build and runs generated-page SEO checks plus language-switching regression tests. `npm test` can be used after an existing build. GitHub Actions runs the tests before uploading the deployment artifact.

The checks cover canonical URLs, unique titles, descriptions, headings, JSON-LD and dates, visible breadcrumbs, reciprocal language alternates, sitemap coverage, crawl rules, asset/fragment links, image alternatives, and HTML-only reachability from the homepage. Language tests also cover unequal language counts, pagination, absent translations, and legacy query links.

### Measuring progress

Use Search Console to check indexed URLs, Google-selected canonicals, search queries, impressions, and clicks. Recheck after publishing meaningful new essays or making structural changes; a Lighthouse score only checks a limited technical baseline and does not measure ranking or topical authority.

This blog currently has one original essay in two languages. Improving search reach from here requires useful original writing for the intended audience, accurate descriptive summaries, and relevant links between related essays when those essays exist. Do not add empty topic pages, fabricated expertise, unsupported schema, or repetitive keyword text merely to increase an SEO score.

Implementation references: [Google multilingual site guidance](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites), [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article), [Profile pages](https://developers.google.com/search/docs/appearance/structured-data/profile-page), and [favicons](https://developers.google.com/search/docs/appearance/favicon-in-search).
