#!/usr/bin/env node
/**
 * dist 自检：断链、必需页面、基础可访问性、体积。
 * 用法：node site/scripts/check.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '..', 'dist')
const failures = []
const notes = []

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
const files = walk(DIST)
const htmlFiles = files.filter((f) => f.endsWith('.html'))
const relFiles = new Set(files.map((f) => f.slice(DIST.length + 1).split(path.sep).join('/')))

const required = ['index.html', '404.html', 'posts/index.html', 'archive/index.html', 'gallery/index.html', 'projects/index.html', 'listen/index.html', 'friends/index.html', 'about/index.html', 'rss.xml', 'sitemap.xml', 'search-index.json', 'robots.txt']
for (const f of required) if (!fs.existsSync(path.join(DIST, f))) failures.push(`缺少必需文件：${f}`)

const ids = new Map()
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8')
  const rel = path.relative(DIST, file).split(path.sep).join('/')
  ids.set(rel, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])))
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8')
  const rel = path.relative(DIST, file).split(path.sep).join('/')
  const base = path.dirname(file)
  if (!/<html[^>]+lang="zh-CN"/.test(html)) failures.push(`${rel}: html 缺少 lang="zh-CN"`)
  if (!/<title>[^<]+<\/title>/.test(html)) failures.push(`${rel}: 缺少 title`)
  if (!/name="viewport"/.test(html)) failures.push(`${rel}: 缺少 viewport`)
  if (!/name="description" content="[^"]+"/.test(html)) failures.push(`${rel}: 缺少 description`)
  if (!/<h1[\s>]/.test(html)) failures.push(`${rel}: 缺少 h1`)
  const h1s = (html.match(/<h1[\s>]/g) || []).length
  if (h1s > 1) failures.push(`${rel}: h1 数量为 ${h1s}`)
  if (/<script[^>]+src="https?:/i.test(html) || /<link[^>]+rel="stylesheet"[^>]+href="https?:/i.test(html)) failures.push(`${rel}: 引用了外部脚本或样式`)

  const refs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1])
  for (const raw of refs) {
    if (!raw || raw.startsWith('#') || /^(https?:|mailto:|data:|javascript:)/i.test(raw)) {
      if (raw.startsWith('#') && raw.length > 1) {
        const id = decodeURIComponent(raw.slice(1))
        if (!ids.get(rel)?.has(id)) notes.push(`${rel}: 页内锚点 #${id} 不存在`)
      }
      continue
    }
    const clean = decodeURIComponent(raw.split('#')[0].split('?')[0])
    if (!clean) continue
    let target = path.resolve(base, clean)
    if (clean.endsWith('/') || fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html')
    if (!fs.existsSync(target)) failures.push(`${rel}: 断链 ${raw}`)
  }
}

// image alt
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8')
  const rel = path.relative(DIST, file)
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
  for (const tag of imgs) if (!/\salt="/.test(tag)) failures.push(`${rel}: img 缺少 alt`)
  if (/\b(TODO|FIXME|lorem ipsum)\b/i.test(html)) failures.push(`${rel}: 含占位文本`)
}

const big = files.map((f) => ({ f, s: fs.statSync(f).size })).sort((a, b) => b.s - a.s).slice(0, 5)
const total = files.reduce((n, f) => n + fs.statSync(f).size, 0)
notes.push(`文件 ${files.length} 个 / 总计 ${(total / 1024 / 1024).toFixed(1)} MB`)
notes.push(`最大：${big.map((b) => `${path.relative(DIST, b.f)} ${(b.s / 1024).toFixed(0)}KB`).join(' · ')}`)

for (const n of notes) console.log(`note: ${n}`)
if (failures.length) {
  console.error(`\n${failures.length} 个问题：`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`\n✓ 自检通过：${htmlFiles.length} 个页面，无断链`)
