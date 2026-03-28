# Minimal Hexo Blog

A text-first personal blog for GitHub Pages. The project uses Hexo with a custom minimal theme, Markdown posts, a local JSON search index, and archive pages by year and month.

## Features

- Clean, minimal, responsive layout
- Home page with title, bio, and latest posts
- Dedicated all-posts page at `/blog/`
- Post detail pages generated from Markdown
- English/Chinese language switching with paired translation links
- Local search at `/search/`
- Archive index plus year and month archive pages
- Atom and RSS feeds at `/atom.xml` and `/rss2.xml`
- GitHub Pages deployment through GitHub Actions

## Project Structure

```text
.
├── .github/workflows/pages.yml
├── _config.yml
├── package.json
├── README.md
├── scripts/site.js
├── scaffolds/post.md
├── source
│   ├── _posts
│   │   ├── a-small-blog-is-still-worth-keeping.md
│   │   ├── choosing-tools-that-stay-out-of-the-way.md
│   │   ├── walking-before-work-in-paris.md
│   │   ├── zh-a-small-blog-is-still-worth-keeping.md
│   │   ├── zh-choosing-tools-that-stay-out-of-the-way.md
│   │   └── zh-walking-before-work-in-paris.md
│   ├── blog/index.md
│   └── search/index.md
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
npm install
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

Edit these fields in [`_config.yml`](/Users/lizeng/Projects/lizeng614.github.io/_config.yml):

- `title`
- `subtitle`
- `bio`
- `description`
- `url`

### Social links

Also edit [`_config.yml`](/Users/lizeng/Projects/lizeng614.github.io/_config.yml):

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

- `https://your-site/atom.xml`
- `https://your-site/rss2.xml`

### Add a new post

Create a new Markdown file in [`source/_posts`](/Users/lizeng/Projects/lizeng614.github.io/source/_posts) or use:

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

The `slug` controls the final URL, so `slug: your-post-title` becomes `/posts/your-post-title/`.

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
- The language switch filters the home page, post list, archive, and search results
- A post page shows a direct link to the other language version when it exists

## GitHub Pages Deployment

This repository includes a workflow at [`pages.yml`](/Users/lizeng/Projects/lizeng614.github.io/.github/workflows/pages.yml) that builds the Hexo site and publishes the generated `public/` directory to GitHub Pages.

### One-time GitHub setup

1. Push this repository to GitHub.
2. In the repository settings, open `Settings -> Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Under `Settings -> Actions -> General`, make sure workflows are allowed to run.
5. Push to `main` again if you need to trigger the first deployment.

### Normal publishing flow

1. Edit content locally.
2. Run `npm run build` to verify the site.
3. Commit and push to `main`.
4. GitHub Actions will build and deploy automatically.

## Extending the Blog

- Update styles in [`themes/paper/source/css/style.css`](/Users/lizeng/Projects/lizeng614.github.io/themes/paper/source/css/style.css)
- Update templates in [`themes/paper/layout`](/Users/lizeng/Projects/lizeng614.github.io/themes/paper/layout)
- Add more static pages in [`source`](/Users/lizeng/Projects/lizeng614.github.io/source)

The project is intentionally small so it stays easy to maintain.
