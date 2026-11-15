#!/usr/bin/env node
/**
 * AMU ARCHIVE · static site builder
 * 零依赖：Node 22+，只读 content/ 与 assets/，输出 dist/。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SITE_DIR = path.resolve(__dirname, '..')
const OUT = path.join(SITE_DIR, 'dist')
const SITE_URL = (process.env.SITE_URL || 'https://amu263.github.io/').replace(/\/+$/, '') + '/'

const SITE = {
  name: 'AMU ARCHIVE',
  cn: '阿木的档案',
  desc: '阿木的个人档案：生活、游戏、音乐、AI 折腾，全部归档。',
  author: '阿木',
  handle: 'amu263',
  bilibili: 'https://space.bilibili.com/233594416',
  github: 'https://github.com/amu263',
  netease: 'https://music.163.com/#/user/home?id=1695448500',
  repo: 'https://github.com/amu263/dsgentherag',
}

const NAV = [
  { key: 'posts', href: 'posts/', cn: '档案', en: 'ARCHIVE', num: '01' },
  { key: 'gallery', href: 'gallery/', cn: '影像', en: 'GALLERY', num: '02' },
  { key: 'listen', href: 'listen/', cn: '音轨', en: 'SOUNDTRACK', num: '03' },
  { key: 'projects', href: 'projects/', cn: '委托', en: 'PROJECTS', num: '04' },
  { key: 'friends', href: 'friends/', cn: '关系', en: 'LINKS', num: '05' },
  { key: 'about', href: 'about/', cn: '关于', en: 'ABOUT', num: '06' },
]

const SECTION = {
  posts:   { num: '01', cn: '档案', en: 'ARCHIVE',    accent: 'lime' },
  gallery: { num: '02', cn: '影像', en: 'GALLERY',    accent: 'pink-hot' },
  listen:  { num: '03', cn: '音轨', en: 'SOUNDTRACK', accent: 'mint' },
  projects:{ num: '04', cn: '委托', en: 'PROJECTS',   accent: 'amber' },
  friends: { num: '05', cn: '关系', en: 'LINKS',      accent: 'magenta' },
  about:   { num: '06', cn: '关于', en: 'ABOUT',      accent: 'orange' },
}

const SOCIAL = [
  { label: 'GitHub', en: 'CODE', href: SITE.github },
  { label: '哔哩哔哩', en: 'BILIBILI', href: SITE.bilibili },
  { label: '网易云音乐', en: 'NETEASE', href: SITE.netease },
]

// ---------------------------------------------------------------- utilities
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, '')
const rel = (depth, target) => {
  if (!target) return ''
  if (/^(https?:)?\/\//.test(target) || target.startsWith('mailto:') || target.startsWith('#')) return target
  return '../'.repeat(depth) + target.replace(/^\//, '')
}
const img = (p) => (p ? p.replace(/^\/images\//, '/assets/images/') : p)
const fmtDate = (iso) => String(iso).slice(0, 10)
const fmtDot = (iso) => String(iso).slice(0, 10).replace(/-/g, '.')
const cnDate = (iso) => {
  const [y, m, d] = fmtDate(iso).split('-')
  return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`
}
const pad = (n) => String(n).padStart(2, '0')
const readingMinutes = (text) => {
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length
  const words = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9_]+/g) || []).length
  return Math.max(1, Math.round(cjk / 380 + words / 210))
}
const pageUrl = (p) => SITE_URL + String(p).replace(/^\//, '')

function readFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { data: {}, body: raw }
  const data = {}
  let key = null
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue
    const listItem = line.match(/^\s*-\s+(.*)$/)
    if (listItem && key) {
      if (!Array.isArray(data[key])) data[key] = []
      data[key].push(unquote(listItem[1]))
      continue
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!kv) continue
    key = kv[1]
    const val = kv[2].trim()
    if (!val) { data[key] = []; continue }
    if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val.slice(1, -1).split(',').map((x) => unquote(x.trim())).filter(Boolean)
    } else {
      data[key] = unquote(val)
    }
  }
  return { data, body: raw.slice(m[0].length) }
}
function unquote(v) {
  v = String(v).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    const inner = v.slice(1, -1)
    if (v.startsWith('"')) {
      try { return JSON.parse(v) } catch { /* fall through */ }
    }
    return inner.replace(/\\"/g, '"')
  }
  return v
}

// ---------------------------------------------------------------- markdown
function mdInline(text, depth) {
  let s = esc(text)
  const codes = []
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, src, title) => {
    return `<img src="${esc(rel(depth, src))}" alt="${esc(alt)}"${title ? ` title="${esc(title)}"` : ''} loading="lazy" decoding="async">`
  })
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, label, href, title) => {
    const external = /^(https?:)?\/\//.test(href)
    return `<a href="${esc(external ? href : rel(depth, href))}"${title ? ` title="${esc(title)}"` : ''}${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}${external ? '<span class="ext">↗</span>' : ''}</a>`
  })
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`)
  return s
}

function mdBlocks(src, depth) {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out = []
  const toc = []
  let i = 0
  let headingNo = 0

  const isBlockStart = (line) =>
    /^(```|~~~)/.test(line) || /^#{1,4}\s/.test(line) || /^>\s?/.test(line) ||
    /^\s*([-*+]|\d+\.)\s+/.test(line) || /^(---|\*\*\*|___)\s*$/.test(line) ||
    /^\|/.test(line)

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    const fence = line.match(/^(```|~~~)(.*)$/)
    if (fence) {
      const mark = fence[1]
      const lang = fence[2].trim().split(/\s+/)[0] || ''
      const buf = []
      i++
      while (i < lines.length && !lines[i].startsWith(mark)) { buf.push(lines[i]); i++ }
      i++
      out.push(`<figure class="codeblock"><figcaption><span>${esc(lang || 'text')}</span><button type="button" class="codeblock__copy" data-copy>COPY</button></figcaption><pre><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(buf.join('\n'))}</code></pre></figure>`)
      continue
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const rawLevel = h[1].length
      const level = Math.min(4, Math.max(2, rawLevel))
      const text = h[2].trim()
      const id = `sec-${++headingNo}`
      if (level <= 3) toc.push({ id, text: stripInline(text), level })
      out.push(`<h${level} id="${id}">${mdInline(text, depth)}<a class="anchor" href="#${id}" aria-label="本节链接">#</a></h${level}>`)
      i++
      continue
    }

    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      const prev = lines[i - 1] || ''
      const next = lines[i + 1] || ''
      if (!prev.trim() || !next.trim()) { out.push('<hr>'); i++; continue }
      i++
      continue
    }

    // table
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
      const splitRow = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
      const head = splitRow(line)
      const aligns = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''))
      i += 2
      const rows = []
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++ }
      out.push(`<div class="tablewrap"><table><thead><tr>${head.map((c, k) => `<th${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${mdInline(c, depth)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, k) => `<td${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${mdInline(c, depth)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }

    // blockquote
    if (/^>/.test(line)) {
      const buf = []
      while (i < lines.length && /^>/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++ }
      out.push(`<blockquote>${mdBlocks(buf.join('\n'), depth).html}</blockquote>`)
      continue
    }

    // list
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items = []
      while (i < lines.length) {
        const item = lines[i].match(/^\s*([-*+]|\d+\.)\s+(.*)$/)
        if (!item) break
        const sameOrder = /^\s*\d+\./.test(lines[i]) === ordered
        if (!sameOrder) break
        let text = item[2]
        i++
        while (i < lines.length && lines[i].trim() && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) && !isBlockStart(lines[i])) {
          text += ' ' + lines[i].trim()
          i++
        }
        items.push(`<li>${mdInline(text, depth)}</li>`)
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`)
      continue
    }

    // image-only paragraph
    const im = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/)
    if (im) {
      out.push(`<figure class="prose-fig"><img src="${esc(rel(depth, im[2]))}" alt="${esc(im[1])}" loading="lazy" decoding="async">${im[1] ? `<figcaption>${esc(im[1])}</figcaption>` : ''}</figure>`)
      i++
      continue
    }

    // paragraph
    const buf = [line]
    i++
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { buf.push(lines[i]); i++ }
    out.push(`<p>${mdInline(buf.join('\n'), depth)}</p>`)
  }
  return { html: out.join('\n'), toc }
}
const stripInline = (s) => stripTags(s).replace(/[`*_~]/g, '').trim()

// ---------------------------------------------------------------- data
function loadPosts() {
  const dir = path.join(SITE_DIR, 'content', 'posts')
  const posts = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8')
    const { data, body } = readFrontmatter(raw)
    const slug = data.slug || f.replace(/\.md$/, '')
    return {
      slug,
      title: data.title || slug,
      date: fmtDate(data.date || '2026-01-01'),
      category: data.category || '档案',
      tags: Array.isArray(data.tags) ? data.tags : [],
      cover: img(data.cover || ''),
      summary: data.summary || '',
      body,
      reading: readingMinutes(body),
      pinned: data.pinned === true || data.pinned === 'true',
      isAbout: slug === 'about',
    }
  }).filter((p) => !p.isAbout)
  posts.sort((a, b) => (b.pinned - a.pinned) || (a.date < b.date ? 1 : -1))
  posts.forEach((p, i) => { p.no = pad(i + 1) })
  return posts
}
function loadJsonDir(name) {
  const dir = path.join(SITE_DIR, 'content', name)
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    if (d.cover) d.cover = img(d.cover)
    if (Array.isArray(d.photos)) d.photos = d.photos.map((p) => ({ ...p, src: img(p.src) }))
    if (Array.isArray(d.friends)) d.friends = d.friends.map((p) => ({ ...p, avatar: img(p.avatar) }))
    if (d.avatar) d.avatar = img(d.avatar)
    if (d.slug) return d
    d.slug = f.replace(/\.json$/, '')
    return d
  })
}

const posts = loadPosts()
const galleries = loadJsonDir('gallery').sort((a, b) => (a.date < b.date ? 1 : -1))
const listen = loadJsonDir('listen').sort((a, b) => (a.date < b.date ? 1 : -1))
const projects = loadJsonDir('projects')
const friends = loadJsonDir('friends').map((f) => ({ ...f, avatar: img(f.avatar) }))
const aboutFile = fs.readFileSync(path.join(SITE_DIR, 'content', 'posts', 'about.md'), 'utf8')
const about = readFrontmatter(aboutFile)
const aboutMd = mdBlocks(about.body, 1)

const catCounts = [...new Set(posts.map((p) => p.category))].map((c) => ({ name: c, count: posts.filter((p) => p.category === c).length })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'))
const categories = catCounts.map((c) => c.name)
const allTags = {}
for (const p of posts) for (const t of p.tags) allTags[t] = (allTags[t] || 0) + 1
const tags = Object.entries(allTags).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))

// ---------------------------------------------------------------- components
const ICON = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 5 5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></svg>',
  chevL: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  chevR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.4 7-12A7 7 0 0 0 5 9c0 5.6 7 12 7 12z"/><circle cx="12" cy="9" r="2.4"/></svg>',
}

function navHtml(depth, active) {
  const links = NAV.map((n) => `<a class="nav__link${active === n.key ? ' is-active' : ''}" href="${rel(depth, n.href)}"${active === n.key ? ' aria-current="page"' : ''}><span>${n.cn}</span><b>${n.en}</b></a>`).join('')
  return `
  <a class="skip" href="#main">跳到正文</a>
  <header class="nav" data-nav>
    <div class="nav__inner">
      <a class="brand" href="${rel(depth, 'index.html')}" aria-label="AMU ARCHIVE 首页">
        <span class="brand__mark">AMU</span>
        <span class="brand__sub">ARCHIVE<b>/06</b></span>
      </a>
      <nav class="nav__links" aria-label="主导航">${links}</nav>
      <div class="nav__tools">
        <button class="iconbtn" type="button" data-search-open aria-label="搜索全站" aria-haspopup="dialog">${ICON.search}</button>
        <a class="nav__cta" href="${rel(depth, 'posts/')}">调阅档案${ICON.arrow}</a>
        <button class="nav__burger iconbtn" type="button" data-menu-toggle aria-expanded="false" aria-controls="mobile-menu" aria-label="打开菜单">${ICON.menu}</button>
      </div>
    </div>
  </header>
  <div class="mmenu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="移动导航" hidden>
    <div class="mmenu__top">
      <span class="brand__mark">AMU</span>
      <button class="iconbtn" type="button" data-menu-close aria-label="关闭菜单">${ICON.close}</button>
    </div>
    <nav class="mmenu__nav" aria-label="移动导航">
      ${NAV.map((n) => `<a class="mmenu__link" href="${rel(depth, n.href)}"><b>${n.num}</b><span>${n.cn}</span><i>${n.en}</i></a>`).join('')}
    </nav>
    <p class="mmenu__foot">NEW ERIDU / PERSONAL ARCHIVE<br><span>RECORDS · IMAGES · SOUND · CONNECTIONS</span></p>
  </div>`
}

function footerHtml(depth) {
  const latest = posts[0]?.date || '2026.10.02'
  return `
  <footer class="foot">
    <div class="foot__top">
      <div class="foot__brand">
        <p class="foot__logo">AMU<span>ARCHIVE</span></p>
        <p class="foot__desc">阿木的个人档案。生活、游戏、音乐与 AI 折腾，全部归档。无广告，无追踪，纯静态。</p>
        <p class="foot__barcode" aria-hidden="true"></p>
        <p class="foot__code">SYS.STATUS <b>ONLINE</b> / LAST SYNC ${latest.replace(/-/g, '.')}</p>
      </div>
      <nav class="foot__col" aria-label="站内导航">
        <p class="foot__cap">SITEMAP / 站点</p>
        ${NAV.map((n) => `<a href="${rel(depth, n.href)}">${n.cn}<span>${n.en}</span></a>`).join('')}
        <a href="${rel(depth, 'archive/')}">归档<span>INDEX</span></a>
      </nav>
      <nav class="foot__col" aria-label="外部链接">
        <p class="foot__cap">EXTERNAL / 外面</p>
        ${SOCIAL.map((s) => `<a href="${s.href}" target="_blank" rel="noopener noreferrer">${s.label}<span>${s.en}</span></a>`).join('')}
        <a href="${rel(depth, 'rss.xml')}">RSS<span>FEED</span></a>
      </nav>
      <div class="foot__col foot__col--meta">
        <p class="foot__cap">COLOPHON / 本站</p>
        <p>DESIGN — ZZZ DESIGN LANGUAGE</p>
        <p>STACK — PURE HTML / CSS / JS</p>
        <p>BUILD — NODE STATIC GENERATOR</p>
        <p>NO FRAMEWORK / NO TRACKER</p>
      </div>
    </div>
    <div class="foot__bottom">
      <p>© 2026 AMU · 内容归阿木所有 · 设计语言来自「绝区零」的视觉研究，不搬运官方素材</p>
      <p class="foot__marq" aria-hidden="true">KEEP RECORDING — KEEP RECORDING — KEEP RECORDING —</p>
      <a class="foot__toplink" href="#main">回到顶部 ↑</a>
    </div>
  </footer>`
}

function shell({ depth, page, accent, title, desc, body, bodyClass = '', active = '', ogImage = '', isHome = false, urlPath = '' }) {
  const r = (p) => rel(depth, p)
  const canonical = pageUrl(urlPath)
  const image = ogImage ? pageUrl(ogImage) : pageUrl('assets/images/portrait/amu-portrait.webp')
  return `<!doctype html>
<html lang="zh-CN"${isHome ? ' data-home="1"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="${esc(SITE.author)}">
<meta name="theme-color" content="#000000">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="zh_CN">
${page === 'notfound' ? '<meta name="robots" content="noindex">' : ''}
<link rel="canonical" href="${esc(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${r('assets/img/favicon.svg')}" type="image/svg+xml">
<link rel="preload" href="${r('assets/fonts/anton-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${r('assets/fonts/archivo-black-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${r('assets/css/zzz-tokens.css')}">
<link rel="stylesheet" href="${r('assets/css/site.css')}">
<link rel="alternate" type="application/rss+xml" title="AMU ARCHIVE RSS" href="${r('rss.xml')}">
${isHome ? `<script>if(!sessionStorage.getItem('amu-boot')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.dataset.boot='on'</script>` : ''}
</head>
<body class="page page--${page} ${bodyClass}" data-page="${page}" data-depth="${depth}" data-root="${'../'.repeat(depth)}" data-zzz-accent="${accent || 'orange'}">
${isHome ? bootHtml() : ''}
${navHtml(depth, active)}
<main id="main">
${body}
</main>
${footerHtml(depth)}
${searchHtml(depth)}
<div class="wipe" aria-hidden="true"><span>AMU / ARCHIVE</span></div>
<script src="${r('assets/js/site.js')}" defer></script>
</body>
</html>`
}

function bootHtml() {
  return `
<div class="boot" id="boot" aria-hidden="true">
  <div class="boot__inner">
    <p class="boot__logo">AMU<span>ARCHIVE</span></p>
    <p class="boot__sys">NEW ERIDU / PERSONAL ARCHIVE SYSTEM · v06</p>
    <div class="boot__meta"><span>PROXY: AMU</span><span>BOOT SEQUENCE</span></div>
    <ul class="boot__lines">
      <li><b>01</b> 载入档案索引 <span>OK</span></li>
      <li><b>02</b> 校正影像色彩 <span>OK</span></li>
      <li><b>03</b> 同步音轨元数据 <span>OK</span></li>
      <li><b>04</b> 建立关系链路 <span>OK</span></li>
    </ul>
    <div class="boot__bar"><i></i></div>
    <p class="boot__skip">点击任意处跳过 / SKIP</p>
  </div>
</div>`
}

function searchHtml(depth) {
  return `
<dialog class="search" id="search" aria-label="站内搜索">
  <div class="search__box">
    <div class="search__bar">
      <span class="search__key">⌘K</span>
      <input class="search__input" type="search" placeholder="搜索档案、影像、委托…" autocomplete="off" aria-label="搜索关键词">
      <button class="iconbtn" type="button" data-search-close aria-label="关闭搜索">${ICON.close}</button>
    </div>
    <p class="search__hint">↑↓ 选择 · ENTER 打开 · ESC 关闭</p>
    <ul class="search__results" role="listbox" aria-label="搜索结果"></ul>
    <p class="search__empty" hidden>没有找到。换个词试试，或直接翻档案。</p>
  </div>
</dialog>`
}

function gencover({ no, cat, date, tone = 'ink', extra = '' }) {
  const glyph = String(cat || '档').slice(0, 1)
  return `<div class="gencover gencover--${tone}${extra ? ` ${extra}` : ''}" aria-hidden="true">
    <i class="gencover__slash"></i>
    <span class="gencover__cat">${esc(cat)}</span>
    <span class="gencover__no">REC-${esc(no)}</span>
    <span class="gencover__glyph">${esc(glyph)}</span>
    <span class="gencover__meta">ARCHIVE / ${fmtDot(date)}</span>
    <span class="gencover__bars"></span>
  </div>`
}

function coverHtml(item, depth, cls = '') {
  if (item.cover) {
    return `<img class="${cls}" src="${rel(depth, item.cover)}" alt="${esc(item.title || item.name)}" loading="lazy" decoding="async">`
  }
  return gencover({ no: item.no || '00', cat: item.category || item.name || '档案', date: item.date || '2026-01-01' })
}

function postCard(p, depth) {
  return `<a class="postcard" href="${rel(depth, `posts/${p.slug}/`)}" data-cat="${esc(p.category)}" data-tags="${esc(p.tags.join('|'))}">
    <div class="postcard__media">${coverHtml(p, depth)}<span class="postcard__no">REC-${p.no}</span><span class="sticker postcard__cat">${esc(p.category)}</span></div>
    <div class="postcard__meta"><time datetime="${p.date}">${p.date.replace(/-/g, '.')}</time><span>${p.reading} MIN READ</span></div>
    <h2 class="postcard__title">${esc(p.title)}</h2>
    <p class="postcard__desc">${esc(p.summary)}</p>
    <span class="postcard__go" aria-hidden="true">${ICON.arrowUp}</span>
  </a>`
}

function plate(section, extraClass = '') {
  return `<div class="plate ${extraClass}" aria-hidden="true">
    <div class="plate__inner">
      <span class="plate__cn">${section.cn}</span>
      <span class="plate__en">${section.en}</span>
      <span class="plate__num">${section.num}</span>
    </div>
  </div>`
}

function ariaHead(section, { title, lead, meta = '', ghost, wedge = true }) {
  return `<header class="ahead">
    ${wedge ? '<div class="ahead__wedge" aria-hidden="true"></div>' : ''}
    <p class="ahead__ghost" aria-hidden="true">${ghost || section.en}</p>
    ${plate(section)}
    <div class="ahead__main">
      <p class="eyebrow"><b>SECTION ${section.num}</b> / ${section.en} / NEW ERIDU</p>
      <h1 class="ahead__title">${title}</h1>
      <p class="ahead__lead">${lead}</p>
      ${meta ? `<p class="ahead__meta">${meta}</p>` : ''}
    </div>
  </header>`
}

// ---------------------------------------------------------------- pages
function homePage() {
  const depth = 0
  const latest = posts.slice(0, 3)
  const friendStrip = friends.slice(0, 8)
  const stats = [
    { n: pad(posts.length), label: '档案', en: 'RECORDS' },
    { n: pad(galleries.length), label: '影像', en: 'GALLERIES' },
    { n: pad(projects.length), label: '委托', en: 'PROJECTS' },
    { n: pad(friends.length), label: '关系', en: 'LINKS' },
  ]
  const panels = [
    {
      id: 'records', num: '01', accent: 'lime', cn: '最新档案', en: 'LATEST RECORDS', note: `${pad(posts.length)} RECORDS`,
      body: `<div class="postgrid postgrid--home">${latest.map((p) => postCard(p, depth)).join('')}</div>
        <div class="panel__foot"><a class="btn btn--primary" href="${rel(depth, 'posts/')}">全部档案 <span>${pad(posts.length)}</span>${ICON.arrow}</a><p class="panel__note">RECORDS / UPDATED ${posts[0].date.replace(/-/g, '.')}</p></div>`,
    },
    {
      id: 'images', num: '02', accent: 'pink-hot', cn: '影像档案', en: 'VISUAL FILES', note: `${pad(galleries.length)} ALBUMS`,
      body: `<div class="albumstrip">${galleries.map((g, idx) => `<a class="albumcard albumcard--strip" href="${rel(depth, `gallery/${g.slug}/`)}" style="--i:${idx}">
        <div class="albumcard__media"><img src="${rel(depth, g.cover)}" alt="${esc(g.title)}" loading="lazy" decoding="async"><span class="albumcard__count">${pad(g.photos.length)} FRAMES</span><span class="tape" aria-hidden="true"></span></div>
        <p class="albumcard__meta">${fmtDot(g.date)} / ${esc(g.title)}</p>
        <h3 class="albumcard__title">${esc(g.title)}</h3>
      </a>`).join('')}</div>
      <div class="panel__foot"><a class="btn btn--primary" href="${rel(depth, 'gallery/')}">打开影像柜 ${ICON.arrow}</a><p class="panel__note">GALLERY / ${pad(galleries.length)} ALBUMS</p></div>`,
    },
    {
      id: 'sound', num: '03', accent: 'mint', cn: '音轨', en: 'SOUNDTRACK', note: `${pad(listen.length)} ALBUM / ${pad(listen.reduce((n, a) => n + a.tracks.length, 0))} TRACKS`,
      body: listen.length ? `<div class="listenpanel">
        <figure class="listenpanel__cover"><img src="${rel(depth, listen[0].cover)}" alt="${esc(listen[0].album)} 专辑封面" loading="lazy"><span class="sticker">NOW ARCHIVED</span></figure>
        <div class="listenpanel__info">
          <p class="eyebrow">ALBUM / ${listen[0].year}</p>
          <h3 class="listenpanel__album">${esc(listen[0].album)}</h3>
          <p class="listenpanel__artist">${esc(listen[0].artist)}</p>
          <p class="listenpanel__desc">${esc(listen[0].summary)}</p>
          <ul class="tracklist tracklist--compact">${listen[0].tracks.slice(0, 4).map((t, k) => `<li><b>${pad(k + 1)}</b><span>${esc(t.title)}</span><time>${esc(t.duration)}</time></li>`).join('')}</ul>
          <div class="panel__foot"><a class="btn btn--primary" href="${rel(depth, `listen/${listen[0].slug}/`)}">查看完整音轨 ${ICON.arrow}</a><a class="btn btn--ghost" href="${listen[0].links?.music || SITE.netease}" target="_blank" rel="noopener noreferrer">网易云 ${ICON.external}</a></div>
        </div>
      </div>` : '',
    },
    {
      id: 'projects', num: '04', accent: 'amber', cn: '委托', en: 'COMMISSIONS', note: `${pad(projects.length)} FILES`,
      body: `<ol class="projlist projlist--home">${projects.map((p, i) => `<li><a class="projrow" href="${rel(depth, `projects/${p.slug}/`)}">
        <span class="projrow__no">${pad(i + 1)}</span>
        <div class="projrow__main"><h3>${esc(p.name)}</h3><p>${esc(p.summary)}</p><ul class="chips">${(p.tech || []).slice(0, 4).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
        <span class="projrow__status">${esc(p.status || 'active')}</span>
        <span class="projrow__arrow" aria-hidden="true">${ICON.arrowUp}</span>
      </a></li>`).join('')}</ol>
      <div class="panel__foot"><a class="btn btn--primary" href="${rel(depth, 'projects/')}">全部委托 ${ICON.arrow}</a><p class="panel__note">PROJECTS / ${pad(projects.length)} FILES</p></div>`,
    },
    {
      id: 'links', num: '05', accent: 'magenta', cn: '关系', en: 'CONNECTIONS', note: `${pad(friends.length)} LINKS`,
      body: `<div class="friendstrip">${friendStrip.map((f, i) => `<a class="friendchip" href="${f.url}" target="_blank" rel="noopener noreferrer" style="--i:${i}">
        <img src="${rel(depth, f.avatar)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">
        <span>${esc(f.name)}</span>
      </a>`).join('')}</div>
      <div class="panel__foot"><a class="btn btn--primary" href="${rel(depth, 'friends/')}">全部关系 <span>${pad(friends.length)}</span>${ICON.arrow}</a><p class="panel__note">LINKS / ${pad(friends.length)} CONNECTIONS</p></div>`,
    },
  ]

  const body = `
<section class="hero" id="hero" data-accent="orange" aria-labelledby="hero-title">
  <div class="hero__bg" aria-hidden="true">
    <div class="hero__ring"></div>
    <div class="hero__cross hero__cross--a"></div>
    <div class="hero__cross hero__cross--b"></div>
    <p class="hero__bgtype">ARCHIVE</p>
  </div>
  <div class="hero__grid">
    <div class="hero__copy">
      <p class="eyebrow eyebrow--dark"><span class="pulse" aria-hidden="true"></span>NEW ERIDU / PERSONAL ARCHIVE / VOL.06</p>
      <h1 class="hero__title" id="hero-title"><span>白天上班</span><span class="hero__title--alt">夜里归档</span></h1>
      <p class="hero__en">WORK BY DAY · ARCHIVE BY NIGHT</p>
      <p class="hero__lead">阿木的个人档案。生活、游戏、音乐、AI 折腾，全部归档；好看、能读、随时可查。</p>
      <div class="hero__actions">
        <a class="btn btn--primary btn--lg" href="${rel(depth, 'posts/')}">调阅最新档案 ${ICON.arrow}</a>
        <a class="btn btn--ghost btn--lg" href="${rel(depth, 'about/')}">关于阿木 ${ICON.external}</a>
      </div>
      <dl class="hero__stats">${stats.map((s) => `<div class="stat"><dt>${s.en}</dt><dd>${s.n}</dd><span>${s.label}</span></div>`).join('')}</dl>
      <p class="hero__meta"><span>PROXY: AMU</span><span>EST. 2026</span><span>${pad(posts.length)} RECORDS / ${pad(galleries.length)} ALBUMS</span></p>
    </div>
    <figure class="hero__file">
      <div class="hero__filecut">
        <img class="hero__portrait" src="${rel(depth, 'assets/images/portrait/amu-portrait.webp')}" alt="阿木的肖像" width="640" height="800" fetchpriority="high">
        <span class="hero__portraitmask" aria-hidden="true"></span>
      </div>
      <figcaption class="hero__filecap"><span>FILE NO.06</span><span>PROXY / AMU</span></figcaption>
      <span class="sticker sticker--proxy" aria-hidden="true">绳匠</span>
      <span class="hero__bracket hero__bracket--tl" aria-hidden="true"></span>
      <span class="hero__bracket hero__bracket--br" aria-hidden="true"></span>
    </figure>
  </div>
  <p class="hero__rail" aria-hidden="true">SCROLL / 05 CHAPTERS</p>
  <div class="cta">
    <div class="cta__brand"><strong>AMU</strong><span>ARCHIVE / NEW ERIDU<br>PERSONAL RECORD SYSTEM</span></div>
    <p class="cta__title">把日子<br>调成档案</p>
    <p class="cta__sign">VOL.06<br>2026.11</p>
    <a class="cta__btn" href="${rel(depth, 'posts/')}">调阅档案 ${ICON.arrow}</a>
    <span class="cta__badge">NO.06</span>
  </div>
</section>

${panels.map((panel) => `<section class="panel" id="${panel.id}" data-accent="${panel.accent}" aria-labelledby="${panel.id}-title">
  <span class="panel__bignum" aria-hidden="true">${panel.num}</span>
  <div class="panel__grid">
    <header class="panel__head">
      <p class="eyebrow"><b>${panel.num}</b> / NEW ERIDU ARCHIVE</p>
      <h2 class="panel__title" id="${panel.id}-title">${panel.cn}</h2>
      <p class="panel__en">${panel.en}</p>
      <p class="panel__ghost" aria-hidden="true">${panel.en.split(' ')[0]}</p>
    </header>
    <div class="panel__body">${panel.body}</div>
  </div>
  <p class="panel__ticker" aria-hidden="true"><span>${panel.num} / ${panel.en}</span><span>AMU ARCHIVE</span><span>NEW ERIDU</span><span>${panel.note || ''}</span><span>KEEP RECORDING</span><span>2026</span></p>
</section>`).join('')}

<nav class="pager" aria-label="首页章节">
  <button class="pager__dot is-active" type="button" data-pager="#hero" aria-label="00 首页" aria-current="true"><span>00</span></button>
  ${panels.map((p) => `<button class="pager__dot" type="button" data-pager="#${p.id}" aria-label="${p.num} ${p.cn}"><span>${p.num}</span></button>`).join('')}
</nav>`

  return shell({
    depth, page: 'home', accent: 'orange', active: '',
    title: `${SITE.cn} · ${SITE.name}`,
    desc: SITE.desc,
    body, isHome: true, bodyClass: 'home', urlPath: '',
  })
}

function postsPage() {
  const depth = 1
  const section = SECTION.posts
  const meta = `<span>${pad(posts.length)} RECORDS</span><span>UPDATED ${posts[0].date.replace(/-/g, '.')}</span><span>LAST SYNC OK</span>`
  const body = `
${ariaHead(section, { title: '全部档案', lead: '建站踩坑、深夜碎碎念、游戏与音乐。按时间倒序归档，支持分类筛选。', meta, ghost: 'ARCHIVE' })}
<section class="section">
  <div class="filterbar">
    <div class="tabs" role="tablist" aria-label="按分类筛选档案">
      <button class="tab is-active" role="tab" aria-selected="true" data-cat="all" type="button">全部<b>${pad(posts.length)}</b></button>
      ${catCounts.map((c) => `<button class="tab" role="tab" aria-selected="false" data-cat="${esc(c.name)}" type="button">${esc(c.name)}<b>${pad(c.count)}</b></button>`).join('')}
    </div>
    <p class="filterbar__count" data-count aria-live="polite">SHOWING ${pad(posts.length)} / ${pad(posts.length)}</p>
  </div>
  <div class="postgrid" data-postgrid>${posts.map((p) => postCard(p, depth)).join('')}</div>
  <p class="empty" data-empty hidden>这个分类还没有档案。切回「全部」看看。</p>
</section>
<aside class="indexcallout">
  <p class="indexcallout__en" aria-hidden="true">INDEX</p>
  <div><p class="eyebrow">ANOTHER VIEW</p><h2>按时间轴翻阅</h2><p>想找某个时间段？归档页把所有记录压成一条时间线。</p><a class="btn btn--primary" href="${rel(depth, 'archive/')}">打开归档 ${ICON.arrow}</a></div>
</aside>`
  return shell({ depth, page: 'posts', accent: section.accent, active: 'posts', title: `全部档案 · ${SITE.name}`, desc: '阿木的全部博客档案，按时间倒序排列，支持分类筛选。', body, urlPath: 'posts/' })
}

function articlePage(p) {
  const depth = 2
  const section = SECTION.posts
  const html = mdBlocks(p.body, depth)
  const toc = html.toc
  const prev = posts[posts.indexOf(p) + 1]
  const next = posts[posts.indexOf(p) - 1]
  const related = posts.filter((x) => x.slug !== p.slug && x.category === p.category).slice(0, 2)
  const body = `
<article class="article">
  <div class="article__corner" aria-hidden="true"></div>
  <a class="article__back" href="${rel(depth, 'posts/')}"><span>返回</span><b>BACK</b></a>
  <p class="article__ghost" aria-hidden="true">REC-${p.no}</p>
  <header class="article__head">
    <p class="eyebrow"><b>REC-${p.no}</b> / ${esc(p.category)} / ${fmtDot(p.date)}</p>
    <h1 class="article__title">${esc(p.title)}</h1>
    <div class="crumb"><span>阿木档案 › ${esc(p.category)}</span><time datetime="${p.date}">${p.date}</time></div>
    <ul class="tagrow" aria-label="标签">${p.tags.map((t) => `<li class="sticker sticker--tag">${esc(t)}</li>`).join('')}</ul>
  </header>
  <figure class="article__kv">${coverHtml(p, depth, 'article__kvimg')}<figcaption><span>REC-${p.no} / ${esc(p.category)}</span><span>${p.reading} MIN READ</span></figcaption></figure>
  <div class="article__layout">
    <div class="prose" id="article-body">
      <p class="prose__lead">${esc(p.summary)}</p>
      ${html.html}
      <div class="prose__end" aria-hidden="true"><span>END OF RECORD</span><i></i></div>
    </div>
    <aside class="toc" aria-label="目录">
      <p class="toc__cap">CONTENTS / 目录</p>
      <ol>${toc.length ? toc.map((t) => `<li class="toc__l${t.level}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join('') : '<li class="toc__empty">这篇没有分节，直接读就好。</li>'}</ol>
      <p class="toc__meta">REC-${p.no}<br>${p.reading} MIN READ<br>${fmtDot(p.date)}</p>
    </aside>
  </div>
  <nav class="pagerrow" aria-label="继续翻阅">
    ${prev ? `<a class="pagerrow__item pagerrow__item--prev" href="${rel(depth, `posts/${prev.slug}/`)}"><span>上一篇 / PREV</span><b>${esc(prev.title)}</b></a>` : '<span></span>'}
    ${next ? `<a class="pagerrow__item pagerrow__item--next" href="${rel(depth, `posts/${next.slug}/`)}"><span>下一篇 / NEXT</span><b>${esc(next.title)}</b></a>` : '<span></span>'}
  </nav>
  ${related.length ? `<section class="related"><p class="eyebrow">SAME FILE / 同类档案</p><div class="postgrid postgrid--2">${related.map((r) => postCard(r, depth)).join('')}</div></section>` : ''}
</article>
<div class="progress" aria-hidden="true"><i data-progress></i></div>`
  return shell({
    depth, page: 'article', accent: section.accent, active: 'posts',
    title: `${p.title} · ${SITE.name}`,
    desc: p.summary,
    body, bodyClass: 'page--article', ogImage: p.cover || 'assets/images/portrait/amu-portrait.webp', urlPath: `posts/${p.slug}/`,
  })
}

function archivePage() {
  const depth = 1
  const section = SECTION.posts
  const years = {}
  for (const p of posts) (years[p.date.slice(0, 4)] ||= []).push(p)
  const body = `
${ariaHead(section, { title: '归档索引', lead: '把九篇记录压成一条时间线。每一条都保留编号、日期与分类，方便回查。', meta: `<span>${pad(posts.length)} RECORDS</span><span>2026 — PRESENT</span>`, ghost: 'INDEX' })}
<section class="section archive-list">
  ${Object.entries(years).sort((a, b) => b[0].localeCompare(a[0])).map(([year, items]) => `<div class="yearblock">
    <div class="yearblock__year"><span>${year}</span><b>${pad(items.length)} RECORDS</b></div>
    <ol class="recordlist">${items.map((p, i) => `<li><a class="recordrow" href="${rel(depth, `posts/${p.slug}/`)}">
      <span class="recordrow__no">REC-${p.no}</span>
      <time datetime="${p.date}">${p.date.replace(/-/g, '.')}</time>
      <span class="recordrow__title">${esc(p.title)}</span>
      <span class="recordrow__cat">${esc(p.category)}</span>
      <span class="recordrow__read">${p.reading} MIN</span>
      <span class="recordrow__arrow" aria-hidden="true">${ICON.arrow}</span>
    </a></li>`).join('')}</ol>
  </div>`).join('')}
</section>
<section class="tagwall" aria-labelledby="tagwall-title">
  <p class="eyebrow">TAG CLOUD / 标签</p>
  <h2 id="tagwall-title">按关键词翻</h2>
  <ul>${tags.map(([t, c], i) => `<li><a href="${rel(depth, `posts/?tag=${encodeURIComponent(t)}`)}" style="--i:${i}">${esc(t)}<b>${pad(c)}</b></a></li>`).join('')}</ul>
</section>`
  return shell({ depth, page: 'archive', accent: section.accent, active: 'posts', title: `归档索引 · ${SITE.name}`, desc: '阿木博客的时间线归档与标签索引。', body, urlPath: 'archive/' })
}

function galleryPage() {
  const depth = 1
  const section = SECTION.gallery
  const photosTotal = galleries.reduce((n, g) => n + g.photos.length, 0)
  const body = `
${ariaHead(section, { title: '影像档案', lead: '手机随手拍的夜景、AI 生成的插画舞台。每册都保留原始说明与拍摄参数。', meta: `<span>${pad(galleries.length)} ALBUMS</span><span>${pad(photosTotal)} FRAMES</span><span>LAST SYNC OK</span>`, ghost: 'GALLERY' })}
<section class="section">
  <div class="albumgrid">${galleries.map((g, i) => `<a class="albumcard" href="${rel(depth, `gallery/${g.slug}/`)}">
    <div class="albumcard__media"><img src="${rel(depth, g.cover)}" alt="${esc(g.title)}" loading="lazy" decoding="async"><span class="albumcard__count">${pad(g.photos.length)} FRAMES</span><span class="albumcard__no" aria-hidden="true">${pad(i + 1)}</span></div>
    <p class="albumcard__meta"><time datetime="${g.date}">${fmtDot(g.date)}</time><span>ALBUM ${pad(i + 1)}</span></p>
    <h2 class="albumcard__title">${esc(g.title)}</h2>
    <p class="albumcard__desc">${esc(g.summary)}</p>
  </a>`).join('')}</div>
</section>`
  return shell({ depth, page: 'gallery', accent: section.accent, active: 'gallery', title: `影像档案 · ${SITE.name}`, desc: '阿木的影像档案：手机摄影与 AI 生图图集。', body, urlPath: 'gallery/' })
}

function galleryDetail(g) {
  const depth = 2
  const section = SECTION.gallery
  const idx = galleries.indexOf(g)
  const body = `
${ariaHead(section, { title: esc(g.title), lead: esc(g.summary), meta: `<span>${fmtDot(g.date)}</span><span>${pad(g.photos.length)} FRAMES</span><span>ALBUM ${pad(idx + 1)}</span>`, ghost: 'FRAMES' })}
<section class="section photowall" data-lightbox-root>
  <div class="photowall__bar"><p class="eyebrow">CLICK TO VIEW / 点击查看大图</p><p class="photowall__hint">← → 切换 · ESC 关闭</p></div>
  <div class="photogrid">
    ${g.photos.map((ph, i) => `<figure class="photo">
      <button type="button" class="photo__btn" data-lightbox data-index="${i}" data-src="${rel(depth, ph.src)}" data-caption="${esc(ph.caption || ph.alt || '')}" data-alt="${esc(ph.alt || '')}" data-exif="${esc(Object.entries(ph.exif || {}).map(([k, v]) => `${k}: ${v}`).join(' · '))}" aria-label="查看第 ${i + 1} 张：${esc(ph.alt || '')}">
        <img src="${rel(depth, ph.src)}" alt="${esc(ph.alt || '')}" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async">
        <span class="photo__no" aria-hidden="true">${pad(i + 1)}</span>
        <span class="photo__zoom" aria-hidden="true">${ICON.search}</span>
      </button>
      <figcaption><span>${esc(ph.caption || ph.alt || '')}</span>${ph.exif ? `<b>${Object.entries(ph.exif).map(([k, v]) => `${esc(k.toUpperCase())} ${esc(v)}`).join(' / ')}</b>` : ''}</figcaption>
    </figure>`).join('')}
  </div>
</section>
<nav class="albumnav" aria-label="相册切换">
  <a href="${rel(depth, 'gallery/')}">← 全部影像</a>
  <span>${pad(idx + 1)} / ${pad(galleries.length)}</span>
</nav>
<dialog class="lightbox" id="lightbox" aria-label="影像查看器">
  <div class="lightbox__bar"><span class="lightbox__count" data-lb-count>01 / 08</span><button class="iconbtn iconbtn--light" type="button" data-lb-close aria-label="关闭">${ICON.close}</button></div>
  <div class="lightbox__stage"><img alt="" data-lb-img></div>
  <div class="lightbox__info"><p data-lb-cap></p><p data-lb-exif></p></div>
  <button class="lightbox__nav lightbox__nav--prev" type="button" data-lb-prev aria-label="上一张">${ICON.chevL}</button>
  <button class="lightbox__nav lightbox__nav--next" type="button" data-lb-next aria-label="下一张">${ICON.chevR}</button>
</dialog>`
  return shell({ depth, page: 'gallery-detail', accent: section.accent, active: 'gallery', title: `${g.title} · 影像档案 · ${SITE.name}`, desc: g.summary, body, ogImage: g.cover, urlPath: `gallery/${g.slug}/` })
}

function projectsPage() {
  const depth = 1
  const section = SECTION.projects
  const body = `
${ariaHead(section, { title: '委托档案', lead: '自己给自己派活，也自己验收。三个还在维护的项目，代码与说明都在 GitHub。', meta: `<span>${pad(projects.length)} FILES</span><span>ACTIVE / ARCHIVED</span>`, ghost: 'PROJECTS' })}
<section class="section">
  <ol class="projlist">${projects.map((p, i) => `<li><a class="projrow" href="${rel(depth, `projects/${p.slug}/`)}">
    <span class="projrow__no">${pad(i + 1)}</span>
    <div class="projrow__main">
      <h2>${esc(p.name)}</h2>
      <p>${esc(p.summary)}</p>
      <ul class="chips">${(p.tech || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>
    <span class="projrow__status projrow__status--${esc(p.status || 'active')}">${esc((p.status || 'active').toUpperCase())}</span>
    <span class="projrow__arrow" aria-hidden="true">${ICON.arrowUp}</span>
  </a></li>`).join('')}</ol>
</section>`
  return shell({ depth, page: 'projects', accent: section.accent, active: 'projects', title: `委托档案 · ${SITE.name}`, desc: '阿木的项目档案：博客、音乐工具与音乐相册框架。', body, urlPath: 'projects/' })
}

function projectDetail(p) {
  const depth = 2
  const section = SECTION.projects
  const idx = projects.indexOf(p)
  const readme = p.readme ? mdBlocks(p.readme, depth) : null
  const body = `
<article class="project">
  <div class="article__corner" aria-hidden="true"></div>
  <a class="article__back" href="${rel(depth, 'projects/')}"><span>返回</span><b>BACK</b></a>
  <p class="article__ghost" aria-hidden="true">FILE-${pad(idx + 1)}</p>
  <header class="article__head">
    <p class="eyebrow"><b>COMMISSION ${pad(idx + 1)}</b> / ${esc((p.status || 'active').toUpperCase())} / PROJECT</p>
    <h1 class="article__title">${esc(p.name)}</h1>
    <div class="crumb"><span>阿木档案 › 委托 › ${esc(p.name)}</span><time>${esc(p.status || 'active')}</time></div>
    <ul class="tagrow">${(p.tech || []).map((t) => `<li class="sticker sticker--tag">${esc(t)}</li>`).join('')}</ul>
  </header>
  <div class="project__lead"><p>${esc(p.summary)}</p>
    <div class="project__links">${p.links?.github ? `<a class="btn btn--primary" href="${p.links.github}" target="_blank" rel="noopener noreferrer">GitHub 仓库 ${ICON.external}</a>` : ''}${p.links?.demo ? `<a class="btn btn--ghost" href="${p.links.demo}" target="_blank" rel="noopener noreferrer">在线预览 ${ICON.external}</a>` : ''}</div>
  </div>
  ${readme ? `<div class="article__layout article__layout--project"><div class="prose">${readme.html}</div><aside class="toc" aria-label="目录"><p class="toc__cap">README / 目录</p><ol>${readme.toc.length ? readme.toc.map((t) => `<li class="toc__l${t.level}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join('') : '<li class="toc__empty">没有分节。</li>'}</ol><p class="toc__meta">${pad(idx + 1)} / ${pad(projects.length)}<br>${esc((p.status || 'active').toUpperCase())}</p></aside></div>` : ''}
</article>`
  return shell({ depth, page: 'project-detail', accent: section.accent, active: 'projects', title: `${p.name} · 委托档案 · ${SITE.name}`, desc: p.summary, body, urlPath: `projects/${p.slug}/` })
}

function listenPage() {
  const depth = 1
  const section = SECTION.listen
  const body = `
${ariaHead(section, { title: '音轨档案', lead: '最近反复播放的专辑。记下曲目、年份与当时的心情，算是另一种日记。', meta: `<span>${pad(listen.length)} ALBUM</span><span>${pad(listen.reduce((n, a) => n + a.tracks.length, 0))} TRACKS</span>`, ghost: 'SOUND' })}
<section class="section">
  ${listen.map((a, i) => `<a class="listenrow" href="${rel(depth, `listen/${a.slug}/`)}">
    <figure class="listenrow__cover"><img src="${rel(depth, a.cover)}" alt="${esc(a.album)} 专辑封面" loading="lazy"><span class="listenrow__no" aria-hidden="true">${pad(i + 1)}</span></figure>
    <div class="listenrow__info">
      <p class="eyebrow">${a.year} / ${a.genres.map(esc).join(' · ')}</p>
      <h2>${esc(a.album)}</h2>
      <p class="listenrow__artist">${esc(a.artist)}</p>
      <p class="listenrow__desc">${esc(a.summary)}</p>
      <span class="listenrow__cta">${ICON.play} 查看 Tracklist</span>
    </div>
  </a>`).join('')}
</section>`
  return shell({ depth, page: 'listen', accent: section.accent, active: 'listen', title: `音轨档案 · ${SITE.name}`, desc: '阿木的音乐档案：专辑、曲目与听歌记录。', body, urlPath: 'listen/' })
}

function listenDetail(a) {
  const depth = 2
  const section = SECTION.listen
  const body = `
${ariaHead(section, { title: esc(a.album), lead: esc(a.summary), meta: `<span>${esc(a.artist)}</span><span>${a.year}</span><span>${pad(a.tracks.length)} TRACKS</span>`, ghost: 'TRACKS' })}
<section class="section listen-detail">
  <div class="listen-detail__coverwrap">
    <figure class="listen-detail__cover"><img src="${rel(depth, a.cover)}" alt="${esc(a.album)} 专辑封面"><figcaption>${esc(a.album)} / ${esc(a.artist)} / ${a.year}</figcaption></figure>
    <div class="listen-detail__tags">${a.genres.map((g) => `<span class="sticker sticker--tag">${esc(g)}</span>`).join('')}</div>
    <div class="listen-detail__wave" aria-hidden="true">${Array.from({ length: 36 }, (_, i) => `<i style="--h:${(Math.sin(i * 0.7) * 0.35 + 0.55) * 100}%;--d:${i * 40}ms"></i>`).join('')}</div>
    <a class="btn btn--primary" href="${a.links?.music || SITE.netease}" target="_blank" rel="noopener noreferrer">在网易云收听 ${ICON.external}</a>
  </div>
  <div class="listen-detail__body">
    <p class="eyebrow">TRACKLIST / 曲目</p>
    <ol class="tracklist">${a.tracks.map((t, i) => `<li><b>${pad(i + 1)}</b><span>${esc(t.title)}</span><time>${esc(t.duration || '—')}</time></li>`).join('')}</ol>
    <p class="listen-detail__note">曲目信息来自专辑公开资料。本站不托管音频，听歌请前往网易云。</p>
  </div>
</section>`
  return shell({ depth, page: 'listen-detail', accent: section.accent, active: 'listen', title: `${a.album} · 音轨档案 · ${SITE.name}`, desc: a.summary, body, ogImage: a.cover, urlPath: `listen/${a.slug}/` })
}

function friendsPage() {
  const depth = 1
  const section = SECTION.friends
  const body = `
${ariaHead(section, { title: '关系网络', lead: '一起玩、一起折腾、一起把日子过得好玩的人。点开就是对门。', meta: `<span>${pad(friends.length)} LINKS</span><span>ALL SIGNALS OK</span>`, ghost: 'LINKS' })}
<section class="section">
  <div class="friendgrid">${friends.map((f, i) => `<a class="friendcard" href="${f.url}" target="_blank" rel="noopener noreferrer">
    <div class="friendcard__avatar"><img src="${rel(depth, f.avatar)}" alt="${esc(f.name)} 的头像" loading="lazy" decoding="async" onerror="this.style.display='none'"><span>${pad(i + 1)}</span></div>
    <div class="friendcard__main"><h2>${esc(f.name)}</h2><p>${esc(f.bio)}</p><ul class="chips">${(f.tags || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    <span class="friendcard__arrow" aria-hidden="true">${ICON.external}</span>
  </a>`).join('')}</div>
</section>
<aside class="friendnote"><p class="eyebrow">LINK EXCHANGE / 友链</p><p>这个页面只收录认识的人。想交换友链的话，来 GitHub 找我，或者在直播间说一声。</p><a class="btn btn--primary" href="${SITE.github}/dsgentherag/issues" target="_blank" rel="noopener noreferrer">去 GitHub ${ICON.external}</a></aside>`
  return shell({ depth, page: 'friends', accent: section.accent, active: 'friends', title: `关系网络 · ${SITE.name}`, desc: '阿木的友链：一起折腾的人。', body, urlPath: 'friends/' })
}

function aboutPage() {
  const depth = 1
  const section = SECTION.about
  const body = `
<section class="char">
  <div class="char__wedge" aria-hidden="true"></div>
  <p class="char__ghost" aria-hidden="true">PROXY</p>
  <figure class="char__art"><img src="${rel(depth, 'assets/images/portrait/amu-portrait.webp')}" alt="阿木的肖像"><figcaption><span>PROXY FILE / 06</span><span>NEW ERIDU</span></figcaption></figure>
  <div class="char__info">
    <p class="eyebrow"><b>PROXY 06</b> / PERSONAL FILE / NEW ERIDU</p>
    <h1 class="char__name">阿木</h1>
    <p class="char__en">AMU / ARCHIVE KEEPER</p>
    <div class="char__pills"><span class="pill pill--cv"><i></i>B站 UP 主</span><span class="pill">游戏菜鸡</span><span class="pill">AI 折腾者</span><span class="pill">手机摄影哥</span></div>
    <p class="char__lead">白天上班，夜里归档。把生活里值得留下的东西，做成一个能随时翻开的档案。</p>
    <p class="char__quote">「创作这回事，先把容器做好。容器好了，里面装什么都不会太难看。」</p>
    <dl class="char__stats"><div><dt>RECORDS</dt><dd>${pad(posts.length)}</dd></div><div><dt>ALBUMS</dt><dd>${pad(galleries.length)}</dd></div><div><dt>LINKS</dt><dd>${pad(friends.length)}</dd></div></dl>
    <div class="char__links"><a class="btn btn--primary" href="${SITE.bilibili}" target="_blank" rel="noopener noreferrer">哔哩哔哩 ${ICON.external}</a><a class="btn btn--ghost" href="${SITE.github}" target="_blank" rel="noopener noreferrer">GitHub ${ICON.external}</a></div>
  </div>
  <aside class="char__side" aria-label="本站信息">
    <p class="eyebrow">SITE SPEC</p>
    <dl class="spec"><div><dt>版本</dt><dd>VOL.06</dd></div><div><dt>设计</dt><dd>ZZZ DESIGN</dd></div><div><dt>引擎</dt><dd>PURE STATIC</dd></div><div><dt>托管</dt><dd>GITHUB PAGES</dd></div></dl>
    <p class="char__side-note">本站由阿木用 DeepSeek Harness 搭建，视觉语言参考「绝区零」，不搬运官方素材。</p>
    <p class="char__barcode" aria-hidden="true"></p>
  </aside>
</section>
<section class="section about-copy">
  <div class="about-copy__head"><p class="eyebrow">ONE MORE THING / 再说几句</p><h2>关于这个人和这个站</h2></div>
  <div class="prose prose--about">${aboutMd.html}</div>
  <figure class="about-fig"><img src="${rel(depth, 'assets/images/posts/about-me/cover.jpg')}" alt="开发这个博客时的心情" loading="lazy" decoding="async"><figcaption><span>FIGURE / 2026.08.23</span><span>DEVELOPING THIS SITE</span></figcaption></figure>
</section>`
  return shell({ depth, page: 'about', accent: section.accent, active: 'about', title: `关于 · ${SITE.name}`, desc: '关于阿木：B站 UP 主、游戏菜鸡、AI 折腾者，以及这个博客的来历。', body, ogImage: 'assets/images/posts/about-me/cover.jpg', urlPath: 'about/' })
}

function notFoundPage() {
  const depth = 0
  const body = `
<section class="lost">
  <div class="lost__bg" aria-hidden="true"><p>404</p></div>
  <p class="eyebrow"><span class="pulse" aria-hidden="true"></span>SIGNAL LOST / 404 / ROUTE NOT FOUND</p>
  <h1 class="lost__title">这页<br>掉进空洞了</h1>
  <p class="lost__en">LOST IN THE HOLLOW</p>
  <p class="lost__lead">地址可能写错了，或者这条档案已经被移走。回首页重新调阅，或者直接搜关键词。</p>
  <div class="lost__actions"><a class="btn btn--primary btn--lg" href="index.html">回到首页 ${ICON.arrow}</a><button class="btn btn--ghost btn--lg" type="button" data-search-open>搜索全站 ${ICON.search}</button></div>
  <p class="lost__meta">ERROR CODE: 404 / PROXY: AMU / ARCHIVE SYSTEM</p>
</section>`
  return shell({ depth, page: 'notfound', accent: 'orange', active: '', title: `404 · ${SITE.name}`, desc: '页面不存在。', body, bodyClass: 'page--lost', urlPath: '404.html' })
}

// ---------------------------------------------------------------- feeds
function rssXml() {
  const items = posts.slice(0, 20).map((p) => `<item>
    <title>${esc(p.title)}</title>
    <link>${pageUrl(`posts/${p.slug}/`)}</link>
    <guid isPermaLink="true">${pageUrl(`posts/${p.slug}/`)}</guid>
    <pubDate>${new Date(`${p.date}T00:00:00+08:00`).toUTCString()}</pubDate>
    <category>${esc(p.category)}</category>
    <description>${esc(p.summary)}</description>
  </item>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(SITE.name)}</title>
  <link>${SITE_URL}</link>
  <description>${esc(SITE.desc)}</description>
  <language>zh-CN</language>
  <atom:link href="${pageUrl('rss.xml')}" rel="self" type="application/rss+xml"/>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  ${items}
</channel>
</rss>`
}
function sitemapXml() {
  const urls = ['', 'posts/', 'archive/', 'gallery/', 'projects/', 'listen/', 'friends/', 'about/',
    ...posts.map((p) => `posts/${p.slug}/`),
    ...galleries.map((g) => `gallery/${g.slug}/`),
    ...projects.map((p) => `projects/${p.slug}/`),
    ...listen.map((a) => `listen/${a.slug}/`)]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${pageUrl(u)}</loc></url>`).join('\n')}
</urlset>`
}
function searchIndex() {
  const entries = [
    ...posts.map((p) => ({ k: '档案', t: p.title, d: p.summary, c: p.category, tags: p.tags, u: `posts/${p.slug}/` })),
    ...galleries.map((g) => ({ k: '影像', t: g.title, d: g.summary, c: 'GALLERY', tags: [], u: `gallery/${g.slug}/` })),
    ...projects.map((p) => ({ k: '委托', t: p.name, d: p.summary, c: 'PROJECT', tags: p.tech || [], u: `projects/${p.slug}/` })),
    ...listen.map((a) => ({ k: '音轨', t: a.album, d: a.summary, c: a.artist, tags: a.genres || [], u: `listen/${a.slug}/` })),
    ...friends.map((f) => ({ k: '关系', t: f.name, d: f.bio, c: 'LINK', tags: f.tags || [], u: 'friends/' })),
  ]
  return JSON.stringify(entries)
}

// ---------------------------------------------------------------- write
function write(relPath, content) {
  const full = path.join(OUT, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

write('index.html', homePage())
write('posts/index.html', postsPage())
write('archive/index.html', archivePage())
write('gallery/index.html', galleryPage())
write('projects/index.html', projectsPage())
write('listen/index.html', listenPage())
write('friends/index.html', friendsPage())
write('about/index.html', aboutPage())
write('404.html', notFoundPage())

for (const p of posts) write(`posts/${p.slug}/index.html`, articlePage(p))
for (const g of galleries) write(`gallery/${g.slug}/index.html`, galleryDetail(g))
for (const p of projects) write(`projects/${p.slug}/index.html`, projectDetail(p))
for (const a of listen) write(`listen/${a.slug}/index.html`, listenDetail(a))

write('rss.xml', rssXml())
write('sitemap.xml', sitemapXml())
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${pageUrl('sitemap.xml')}\n`)
write('search-index.json', searchIndex())

copyDir(path.join(SITE_DIR, 'assets'), path.join(OUT, 'assets'))
// favicon
fs.mkdirSync(path.join(OUT, 'assets/img'), { recursive: true })
fs.writeFileSync(path.join(OUT, 'assets/img/favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#000"/><path d="M0 0h64v20L0 44z" fill="#E23A1E"/><path d="M14 50 26 16h9l12 34h-8l-2.6-8H24l-2.6 8zm13-15h7l-3.5-11z" fill="#EFEFEF"/></svg>`)

console.log(`built ${posts.length} posts, ${galleries.length} galleries, ${projects.length} projects, ${listen.length} album(s), ${friends.length} links`)
console.log(`→ ${path.relative(process.cwd(), OUT)}`)
