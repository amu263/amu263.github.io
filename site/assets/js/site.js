/* AMU ARCHIVE · site.js — 原生 JS，无依赖 */
(() => {
  'use strict'

  const $ = (sel, root = document) => root.querySelector(sel)
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const root = document.body?.dataset.root || ''
  const isHome = document.body?.classList.contains('page--home')

  /* ---------------------------------------------------------- boot */
  const boot = $('#boot')
  if (boot && document.documentElement.dataset.boot === 'on') {
    document.documentElement.classList.add('booting')
    const finish = () => {
      if (!boot.isConnected || boot.classList.contains('is-done')) return
      boot.classList.add('is-done')
      document.documentElement.classList.remove('booting')
      try { sessionStorage.setItem('amu-boot', '1') } catch { /* private mode */ }
      setTimeout(() => boot.remove(), 480)
    }
    const timer = setTimeout(finish, 1450)
    window.addEventListener('load', () => setTimeout(finish, 900), { once: true })
    boot.addEventListener('click', () => { clearTimeout(timer); finish() })
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === ' ') { clearTimeout(timer); finish() } }, { once: true })
    if (reduced()) { clearTimeout(timer); finish() }
  } else if (boot) {
    boot.remove()
  }

  /* ---------------------------------------------------------- mobile menu */
  const menu = $('#mobile-menu')
  const toggle = $('[data-menu-toggle]')
  const closeBtn = $('[data-menu-close]')
  const shellParts = [$('main'), $('.foot'), $('.nav')].filter(Boolean)
  const openMenu = () => {
    if (!menu) return
    menu.hidden = false
    toggle?.setAttribute('aria-expanded', 'true')
    document.documentElement.style.overflow = 'hidden'
    shellParts.forEach((el) => { el.inert = true })
    closeBtn?.focus()
  }
  const closeMenu = () => {
    if (!menu) return
    menu.hidden = true
    toggle?.setAttribute('aria-expanded', 'false')
    document.documentElement.style.overflow = ''
    shellParts.forEach((el) => { el.inert = false })
    toggle?.focus()
  }
  toggle?.addEventListener('click', openMenu)
  closeBtn?.addEventListener('click', closeMenu)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu && !menu.hidden) closeMenu()
  })

  /* ---------------------------------------------------------- search */
  const search = $('#search')
  const input = $('.search__input', search || document)
  const results = $('.search__results', search || document)
  const empty = $('.search__empty', search || document)
  let index = null
  let loading = false
  let active = -1
  let entries = []

  const openSearch = async () => {
    if (!search || typeof search.showModal !== 'function') return
    if (!search.open) search.showModal()
    input?.focus()
    if (!index && !loading) {
      loading = true
      try {
        const res = await fetch(`${root}search-index.json`, { cache: 'force-cache' })
        index = await res.json()
        render(input?.value || '')
      } catch {
        index = []
      }
      loading = false
    }
  }
  const closeSearch = () => {
    if (search?.open) search.close()
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  function render(q) {
    if (!results) return
    const query = q.trim().toLowerCase()
    active = -1
    if (!query) {
      entries = (index || []).slice(0, 6)
    } else {
      const terms = query.split(/\s+/).filter(Boolean)
      entries = (index || [])
        .map((e) => {
          const hay = `${e.t} ${e.d} ${e.c} ${(e.tags || []).join(' ')} ${e.k}`.toLowerCase()
          let score = 0
          for (const t of terms) {
            if (!hay.includes(t)) return null
            if (e.t.toLowerCase().includes(t)) score += 6
            if ((e.tags || []).join(' ').toLowerCase().includes(t)) score += 3
            if (e.d.toLowerCase().includes(t)) score += 1
          }
          return { ...e, score }
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 9)
    }
    results.innerHTML = entries.map((e, i) => `<li role="option" aria-selected="${i === 0}">
      <a href="${root}${e.u}" data-result index="${i}">
        <span class="search__kind">${esc(e.k)}</span>
        <span><span class="search__title">${esc(e.t)}</span><span class="search__sub">${esc(e.d)}</span></span>
      </a>
    </li>`).join('')
    if (empty) empty.hidden = entries.length > 0
    if (entries.length) setActive(0)
  }
  function setActive(i) {
    const links = $$('[data-result]', results || document)
    if (!links.length) return
    active = (i + links.length) % links.length
    links.forEach((l, k) => {
      l.classList.toggle('is-active', k === active)
      l.setAttribute('aria-selected', String(k === active))
    })
    links[active]?.scrollIntoView({ block: 'nearest' })
  }

  $$('[data-search-open]').forEach((b) => b.addEventListener('click', openSearch))
  $('[data-search-close]')?.addEventListener('click', closeSearch)
  input?.addEventListener('input', (e) => render(e.target.value))
  search?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1) }
    if (e.key === 'Enter') {
      const link = $$('[data-result]', results || document)[active]
      if (link) { e.preventDefault(); link.click() }
    }
    if (e.key === 'Escape') closeSearch()
  })
  search?.addEventListener('click', (e) => { if (e.target === search) closeSearch() })
  window.addEventListener('keydown', (e) => {
    const tag = (document.activeElement?.tagName || '').toLowerCase()
    const typing = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openSearch() }
    else if (e.key === '/' && !typing) { e.preventDefault(); openSearch() }
  })

  /* ---------------------------------------------------------- wipe transition */
  const wipe = $('.wipe')
  if (wipe && !reduced()) {
    window.addEventListener('pageshow', () => wipe.classList.remove('is-on'))
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]')
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      if (a.target === '_blank' || a.hasAttribute('download')) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin) return
      if (url.pathname === location.pathname && url.hash) return
      e.preventDefault()
      wipe.classList.add('is-on')
      setTimeout(() => { location.href = a.href }, 360)
    })
  }

  /* ---------------------------------------------------------- scroll spy + accent */
  const sections = $$('[data-pager]').map((b) => ({ btn: b, el: $(b.dataset.pager) })).filter((x) => x.el)
  const setAccent = (accent) => {
    if (!accent || document.body.dataset.zzzAccent === accent) return
    document.body.dataset.zzzAccent = accent
  }
  if (sections.length && 'IntersectionObserver' in window) {
    const spy = new IntersectionObserver((obs) => {
      for (const o of obs) {
        if (!o.isIntersecting) continue
        const item = sections.find((s) => s.el === o.target)
        if (!item) continue
        $$('[data-pager]').forEach((b) => {
          const on = b === item.btn
          b.classList.toggle('is-active', on)
          if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current')
        })
        setAccent(item.el.dataset.accent)
      }
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 })
    sections.forEach((s) => spy.observe(s.el))
  }
  $$('[data-pager]').forEach((b) => b.addEventListener('click', () => {
    const target = $(b.dataset.pager)
    target?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' })
  }))
  if (sections.length) {
    const first = sections.find((s) => s.el.dataset.accent)
    if (first) setAccent(first.el.dataset.accent)
  }

  /* ---------------------------------------------------------- reveal */
  const revealTargets = $$('.postcard, .albumcard, .projrow, .friendcard, .photo, .article__kv, .listenrow, .friendnote, .indexcallout > div, .char__info, .char__art')
  if (!reduced() && 'IntersectionObserver' in window) {
    revealTargets.forEach((el, i) => { el.classList.add('reveal'); el.style.setProperty('--i', String(i % 4)) })
    const io = new IntersectionObserver((obs) => {
      obs.forEach((o) => { if (o.isIntersecting) { o.target.classList.add('is-in'); io.unobserve(o.target) } })
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' })
    revealTargets.forEach((el) => io.observe(el))
  }

  /* ---------------------------------------------------------- parallax ghost */
  const ghosts = $$('.hero__bgtype, .ahead__ghost, .article__ghost, .panel__ghost, .char__ghost')
  if (ghosts.length && !reduced() && window.matchMedia('(min-width: 900px)').matches) {
    let ticking = false
    const apply = () => {
      const y = window.scrollY
      ghosts.forEach((g) => { g.style.transform = `translate3d(0, ${Math.min(y * 0.09, 140)}px, 0)` })
      ticking = false
    }
    window.addEventListener('scroll', () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(apply)
    }, { passive: true })
  }

  /* ---------------------------------------------------------- post filter */
  const grid = $('[data-postgrid]')
  if (grid) {
    const cards = $$('.postcard', grid)
    const tabs = $$('.tab')
    const count = $('[data-count]')
    const emptyEl = $('[data-empty]')
    const total = cards.length
    const applyFilter = (cat = 'all', tag = '') => {
      let shown = 0
      cards.forEach((c) => {
        const okCat = cat === 'all' || c.dataset.cat === cat
        const okTag = !tag || (c.dataset.tags || '').split('|').includes(tag)
        const ok = okCat && okTag
        c.hidden = !ok
        if (ok) shown++
      })
      tabs.forEach((t) => {
        const on = t.dataset.cat === cat && !tag
        t.classList.toggle('is-active', on)
        t.setAttribute('aria-selected', String(on))
      })
      if (count) count.textContent = tag ? `TAGGED: ${tag} · ${String(shown).padStart(2, '0')}` : `SHOWING ${String(shown).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
      if (emptyEl) emptyEl.hidden = shown > 0
    }
    tabs.forEach((t, tabIndex) => t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      e.preventDefault()
      const next = tabs[(tabIndex + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
      next.focus()
      next.click()
    }))
    tabs.forEach((t) => t.addEventListener('click', () => {
      applyFilter(t.dataset.cat, '')
      const url = new URL(location.href)
      if (t.dataset.cat === 'all') url.searchParams.delete('cat'); else url.searchParams.set('cat', t.dataset.cat)
      url.searchParams.delete('tag')
      history.replaceState(null, '', url)
    }))
    const params = new URLSearchParams(location.search)
    applyFilter(params.get('cat') || 'all', params.get('tag') || '')
  }

  /* ---------------------------------------------------------- lightbox */
  const lb = $('#lightbox')
  if (lb) {
    const items = $$('[data-lightbox]')
    const img = $('[data-lb-img]', lb)
    const cap = $('[data-lb-cap]', lb)
    const exif = $('[data-lb-exif]', lb)
    const counter = $('[data-lb-count]', lb)
    let cur = 0
    const show = (i) => {
      cur = (i + items.length) % items.length
      const b = items[cur]
      img.src = b.dataset.src
      img.alt = b.dataset.alt || ''
      cap.textContent = b.dataset.caption || ''
      exif.textContent = b.dataset.exif || ''
      counter.textContent = `${String(cur + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`
    }
    items.forEach((b, i) => b.addEventListener('click', () => {
      show(i)
      if (typeof lb.showModal === 'function') lb.showModal()
      else lb.setAttribute('open', '')
      document.documentElement.style.overflow = 'hidden'
    }))
    const close = () => {
      if (lb.open) lb.close(); else lb.removeAttribute('open')
      document.documentElement.style.overflow = ''
    }
    $('[data-lb-close]', lb)?.addEventListener('click', close)
    $('[data-lb-prev]', lb)?.addEventListener('click', () => show(cur - 1))
    $('[data-lb-next]', lb)?.addEventListener('click', () => show(cur + 1))
    lb.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(cur - 1)
      if (e.key === 'ArrowRight') show(cur + 1)
      if (e.key === 'Escape') close()
    })
    lb.addEventListener('click', (e) => { if (e.target === lb) close() })
  }

  /* ---------------------------------------------------------- reading progress + toc spy */
  const bar = $('[data-progress]')
  if (bar) {
    const update = () => {
      const h = document.documentElement.scrollHeight - innerHeight
      const p = h > 0 ? Math.min(1, Math.max(0, scrollY / h)) : 0
      bar.style.width = `${(p * 100).toFixed(2)}%`
    }
    addEventListener('scroll', update, { passive: true })
    addEventListener('resize', update)
    update()
  }

  const tocLinks = $$('.toc a')
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const heads = tocLinks.map((a) => ({ a, el: document.getElementById(a.getAttribute('href').slice(1)) })).filter((x) => x.el)
    const spy = new IntersectionObserver((obs) => {
      obs.forEach((o) => {
        if (!o.isIntersecting) return
        const item = heads.find((h) => h.el === o.target)
        tocLinks.forEach((a) => a.classList.toggle('is-active', a === item?.a))
      })
    }, { rootMargin: '-90px 0px -70% 0px', threshold: 0 })
    heads.forEach((h) => spy.observe(h.el))
  }

  /* ---------------------------------------------------------- copy code */
  $$('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
    const code = btn.closest('.codeblock')?.querySelector('code')?.textContent || ''
    try {
      await navigator.clipboard.writeText(code)
      const old = btn.textContent
      btn.textContent = 'COPIED'
      setTimeout(() => { btn.textContent = old }, 1400)
    } catch { /* clipboard unavailable */ }
  }))

  /* ---------------------------------------------------------- dialog backdrop guard */
  $$('dialog').forEach((d) => d.addEventListener('cancel', () => {
    if (d.classList.contains('lightbox')) document.documentElement.style.overflow = ''
  }))
})()
