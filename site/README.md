# AMU ARCHIVE · 阿木的档案

绝区零（ZZZ）视觉语言重做的个人博客。内容与素材迁移自 `amu263/amuboke-no.zero`：
文章、图集、项目、音乐档案、友链一个不少。

- **首页**：Cinematic Dark 五章，一屏一个论点，右侧方块分页器随滚动换台换色。
- **内容页**：Archive Light 档案纸，黑条导航 + 出血章节牌 + 幽灵英文 + 对角圆角卡片。
- **一章一主色**：档案柠檬绿 / 影像荧光粉 / 音轨薄荷 / 委托橙 / 关系品红 / 关于橙红。
- 搜索（⌘K）、图集灯箱、文章目录、阅读进度、代码复制、首访启动帘幕、换台转场。
- 零框架、零运行时依赖；支持 `prefers-reduced-motion`，无 JS 也能读。

## 本地构建

需要 Node 22+（构建只用标准库）。

```bash
node site/scripts/build.mjs       # 输出 site/dist
node site/scripts/check.mjs       # 断链 / 标题 / 可访问性 / 体积自检
python3 -m http.server 8123 -d site/dist
# 打开 http://127.0.0.1:8123/
```

## 目录

```
site/
├─ content/
│  ├─ posts/*.md          文章（frontmatter + Markdown）
│  ├─ gallery/*.json      图集
│  ├─ listen/*.json       音乐档案
│  ├─ projects/*.json     项目 / 委托
│  └─ friends/*.json      友链
├─ assets/
│  ├─ css/zzz-tokens.css  设计 token（唯一色值来源）
│  ├─ css/site.css        全站样式
│  ├─ js/site.js          原生交互
│  ├─ fonts/              Anton / Archivo Black（OFL）
│  └─ images/             文章封面、图集、头像、肖像
├─ scripts/build.mjs      静态生成器
├─ scripts/check.mjs      dist 自检
└─ dist/                  构建产物（不进 git）
```

## 加一篇文章

1. 新建 `site/content/posts/<slug>.md`：

```md
---
title: "文章标题"
slug: my-new-post
date: 2026-11-20
category: 碎碎念
tags: ["随笔", "生活"]
cover: /assets/images/posts/my-new-post/cover.jpg   # 可省略，省略时生成程序化封面
summary: "一句话摘要，列表页与 SEO 会用到。"
---

正文。支持标题、表格、代码块、引用、图片、列表。
```

2. 封面图放 `site/assets/images/posts/my-new-post/`，`cover` 写 `/assets/images/...`。
3. `node site/scripts/build.mjs`，刷新即可。文章会自动出现在档案列表、首页最新档案、
   归档时间线、RSS、sitemap 与站内搜索里。

分类会按数量自动生成筛选 tab；标签会进入归档页的标签墙（链接为 `posts/?tag=标签`）。
省略 `cover` 的文章会得到一张程序化封面：主色斜切条 + 分类字 + 大号描边汉字。

## 图集 / 音乐 / 项目 / 友链

格式与旧站一致，图片路径同样写 `/assets/images/...`：

```json
// gallery/<slug>.json
{ "slug": "my-album", "title": "标题", "date": "2026-11-20", "summary": "描述",
  "cover": "/assets/images/gallery/my-album/01.jpg",
  "photos": [{ "src": "/assets/images/gallery/my-album/01.jpg", "alt": "…", "caption": "…",
               "exif": { "camera": "OnePlus ACE 2", "iso": "800", "aperture": "f/1.8" } }] }
```

- `listen/<slug>.json`：`title/artist/album/year/genres/cover/summary/links.music/tracks[]`
- `projects/<slug>.json`：`name/summary/tech[]/status/links/readme`（`readme` 支持 Markdown）
- `friends/<slug>.json`：`name/url/avatar/bio/tags[]`

## 部署

仓库已带 `.github/workflows/pages.yml`：推送到 `main` 后自动构建并部署到 GitHub Pages，
`SITE_URL` 从 Pages 的 `base_url` 读取，根站与子路径都能用。

1. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
2. 合并到 `main`，等待 Actions 完成，地址形如 `https://<owner>.github.io/<repo>/`。
3. 若要发布到用户根站 `https://<owner>.github.io/`，把 `site/dist/` 的内容复制到
   `<owner>.github.io` 仓库根目录（或把本仓库作为站点仓库）。站内链接全部是相对路径，
   不需要改任何地址。

如果站点挂在用户根站之外的自定义域名下，构建时设置 `SITE_URL=https://example.com/`，
RSS / sitemap / canonical 会使用它。

## 设计约定

- 色值只写在 `assets/css/zzz-tokens.css`，业务样式一律 `var(--zzz-*)`；中性色阶与透明叠色也在 token 文件里，`site.css` 里没有裸色值。
- 交付自检：`scripts/check.mjs` 全绿；`/绝博` 的 `check-site.mjs` 0 错误（警告为目录式 clean URL、外部社交/项目链接与少量内联 CSS 变量）。`zzz-design` 的 `audit.mjs` 会把 `og:image` 的绝对 URL 误判成外链图片，页面内实际没有外链素材。
- 每页只有一种高饱和主色，贯穿章节牌、页码、按钮、导航 CTA。
- 不允许直角矩形：章节牌、卡片、按钮至少有一处切角或对角圆角。
- 动效只用四类：换台、反色、放大、视差；全部走 token 里的缓动与时长。
- 背景永远有第二层纹理（斜条纹 / 半调网点 / 噪点），不用纯平色块。
- 纹理、幽灵字、启动帘幕都是装饰，`aria-hidden` 或 `pointer-events: none`。

## 素材与版权

文章、图集、音乐档案、项目与友链内容来自阿木自己的仓库 `amu263/amuboke-no.zero`，
版权归阿木所有。视觉语言参考「绝区零」官网的设计研究，不搬运官方立绘、Logo 或 KV。
Anton / Archivo Black 以 SIL Open Font License 使用（见 `assets/fonts/OFL-*.txt`）。
