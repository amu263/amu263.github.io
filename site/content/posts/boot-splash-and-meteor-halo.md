---
title: "给博客装一个开机仪式：首访启动动画、头像归位与方格彗星的实现"
slug: boot-splash-and-meteor-halo
date: 2026-09-15
category: 建站实践
tags: ["Vue", "CSS 动画", "前端", "启动动画"]
summary: "把 Steam 客户端那种开机仪式感搬进网页：首访启动帘幕、头像归位与方格彗星，全部 CSS 动画加原生 DOM 计算，零动画库。"
---

我一直觉得 Steam 客户端开机那一下很有味道：全屏暗场、系统日志一行行滚出来、最后"啪"地交接到主界面。我想在自己的博客上也做出类似的开机感，但**不用它的任何素材、图形或启动库**。

现在的效果是：首次进站时全屏启动帘幕，五行系统启动日志依次出现、进度条走满；结束时帷幕溶解，帘幕中央的头像**飞向首页右侧的肖像并放大贴合**；落位之后，肖像外围由十节小方块组成的彗星开始逐格环绕——同一套做法在启动帘幕里也跑了一遍，颜色逐像素一致。

这篇把两件事的实现方法写清楚：**首访启动动画（含头像归位交接）** 与 **方格彗星**。没有引入任何动画库，全是 CSS `@keyframes` + `offset-path` 加一点原生 DOM 计算。

## 0. 先立约束，再写代码

| 约束 | 为什么 |
| --- | --- |
| 只在首次进入时播一次 | 每次刷新都看一遍会很烦 |
| 不阻塞 SSG 首屏 | 内容是构建期就生成好的静态 HTML，不能被一段动画拖住 |
| 不能 hydration mismatch | 项目是 ViteSSG 预渲染 + 客户端 hydrate |
| 帘幕绝不能永久卡住 | JS 挂了、bundle 加载失败，它也必须自己让开 |
| 零新依赖 | 建站纪律里写着不引第三方动画库 |

## 1. 帘幕为什么不放进 Vue 组件

最关键的一个决定：启动帘幕**不是 Vue 组件**，而是 `index.html` 里的一个静态节点 `#app-loading`，写在 `<div id="app"></div>` 的**外面**。

~~~html
<body>
  <div id="app"></div>
  <div id="app-loading" role="status" aria-live="polite" aria-label="AMU LIVE STYLE 正在启动">
    ...
  </div>
  <script type="module" src="/src/entry-client.ts"></script>
</body>
~~~

三个好处：

1. **首帧就有画面**：浏览器解析到这段 HTML 就画帘幕，不用等 JS bundle 下载执行完；
2. **结构上不可能 hydration mismatch**：Vue 只 hydrate `#app` 里的内容，帘幕从来不在它的管辖范围里；
3. **样式可以抢跑**：帘幕的关键 CSS 直接内联在 `<head>`，而且**故意不放进 `@layer`**——CSS 层叠里无层声明赢过所有 `@layer` 里的规则，所以即使打包好的样式表还没到，帘幕的颜色精度也已经是对的。

颜色全部消费博客已有的设计 token，并带同主题字面 fallback：

~~~css
#app-loading {
  --boot-bg: var(--theme-background, #090b0e);
  --boot-ink: var(--theme-on-background, #d4d8e0);
  --boot-accent: var(--theme-primary, #e8a83e);
  --boot-grid: rgba(232, 168, 62, 0.30);
}

html.v-theme--light #app-loading {
  --boot-bg: var(--theme-background, #f0f2f5);
  --boot-ink: var(--theme-on-background, #1a1d24);
  --boot-accent: var(--theme-primary, #2fb5a0);
  /* 青绿在浅底上对比度只有 2.2:1，往墨色混一点推成 AA 级 */
  --boot-accent-ink: color-mix(in srgb, var(--theme-primary, #2fb5a0) 50%, var(--theme-on-background, #1a1d24));
}
~~~

暗色主题里小字走 `--theme-on-background`（约 12.6:1），亮色下青绿太浅，所以带强调色的文字用 `color-mix()` 从主色推一个更深的值（约 5.4:1）——不是硬编码一套脱离站点的配色，而是从 token 派生。

## 2. 首绘之前就把「播不播」定下来

如果等 Vue 挂载后再决定播不播，刷新时会先闪一下帘幕再撤。所以判定写在 `<head>` 的同步脚本里，首绘前执行：

~~~js
const THEME_KEY = 'amuboke-no.zero:theme'
const SPLASH_KEY = 'amuboke-no.zero:boot-splash'
const root = document.documentElement

// ?boot=full 是显式重放入口：绕过标记强制播放，且不写标记（预览不消耗首访）
const forced = /[?&]boot=full(&|$)/.test(window.location.search)
let play = true
if (!forced) {
  try {
    if (window.sessionStorage.getItem(SPLASH_KEY) === '1') play = false
    else window.sessionStorage.setItem(SPLASH_KEY, '1')
  } catch (_) {}
}

if (!play) {
  root.classList.add('boot-splash-off')
} else {
  root.classList.add('booting')
  // 兜底：即使应用永远没挂载，帘幕也必须自己让开
  window.setTimeout(() => {
    root.classList.remove('booting')
    root.classList.add('boot-splash-off')
  }, 6000)
}
~~~

三个细节值得说：

- `sessionStorage` 决定「本 tab 会话是否首次进入」。新开标签页会播，**刷新不播**（同一会话），而 SPA 路由切换本来就不会重新跑这段脚本；想再看一遍就开新标签页。
- `?boot=full` 是给自己用的重放入口。它**不写**标记，所以预览一次不会把首访"消费"掉；静态站点没有后端，查询参数就是最省事的开关。
- 6 秒 watchdog + `<noscript>` 规则：bundle 挂了或者 JS 被禁，帘幕也会让开。SSG 的静态内容本来就在帘幕背后，只是被盖住而已。

## 3. 3.8 秒的节奏表

帘幕里的东西全是 CSS 动画：中央头像 + 环绕它的一条方格彗星 + 一圈静态虚线锁定环 + 一条进度条 + 五行启动日志。

~~~css
.boot-progress__fill {
  width: 0;
  animation: boot-progress 3800ms cubic-bezier(0.35, 0.08, 0.2, 1) forwards;
}
.boot-log li { opacity: .72; animation: boot-log-in 420ms ease both; }
.boot-log li:nth-child(1) { animation-delay: 500ms; }
.boot-log li:nth-child(2) { animation-delay: 1250ms; }
.boot-log li:nth-child(3) { animation-delay: 2000ms; }
.boot-log li:nth-child(4) { animation-delay: 2700ms; }
.boot-log li:nth-child(5) { animation-delay: 3300ms; }
~~~

**坑一：延迟出现的元素必须用 `fill-mode: both`，不能用 `forwards`。**

我一开始写的是 `forwards`，结果五行日志在**首帧就全部可见**——因为基础样式里写了 `opacity: .72`，而 `forwards` 在 delay 期间**不应用起始帧**，所以 delay 到点那一刻它们才"啪"地掉到 0 再淡回来，纯粹的抖动。换成 `both` 之后，delay 期间停在 `from`（opacity 0），错落出现才是真的。凡是带 `animation-delay` 的元素我都会顺手查这一条。

## 4. 撤帘那一刻：一个类名兼两份工

撤帘时序没有写"延时 1.4 秒然后移除"，因为 bundle 加载慢的时候那样等于人为多等。基准改用 `performance.now()`——它的原点就是 navigation start：

~~~ts
const hold = BOOT_SPLASH_MIN_VISIBLE_MS - performance.now()
if (hold > 0) await wait(hold)

if (overlay.isConnected) {
  overlay.classList.add('boot-splash--leaving')  // 只动 opacity
  root.classList.remove('booting')               // 解冻 + 解锁滚动
  await wait(BOOT_SPLASH_FADE_MS)
}
overlay.remove()
~~~

`<html>` 上的 `booting` 这一个类名兼了两份工：

1. **滚动锁**：`html.booting { overflow: hidden }`；
2. **冻结页面入场动画**：`html.booting #app * { animation-play-state: paused !important }`。

第二点是这套方案里我最满意的一处。主页自己有一套入场序列（词标、引言、通道、统计依次浮起），如果不管它，它会整段在帘幕背后播完——读者首访**根本看不到**。把 `#app` 里的动画先冻住、在**淡出开始**那一刻解冻，读者看到的就是「帘幕化开的同时，主页自己组装起来」。

作用域必须是 `#app`：帘幕在 `#app` 之外，所以它自己照常动。`!important` 也是必须的——组件 `<style>` 是无层样式，无层普通声明会盖过任何 `@layer` 里的规则。

释放时机不能再晚：入场动画大量使用 `animation-fill-mode: both`，冻过头会让帘幕淡出后露出一个停在 `opacity: 0` 的空页面。

## 5. 头像归位：把帘幕头像当共享元素飞过去

这一段的思路是"共享元素转场"（业界常叫 FLIP）：帘幕中央那颗头像，和首页右侧那张肖像是**同一张图**，那就别淡出淡入，直接让它飞过去。

~~~ts
function startDock(overlay: HTMLElement) {
  const avatar = overlay.querySelector<HTMLElement>('.boot-core__avatar')
  const target = document.querySelector<HTMLImageElement>('[data-boot-dock]')

  const from = avatar.getBoundingClientRect()   // 帘幕头像此刻的矩形
  const visible = containedRect(target)         // 目标「真正可见」的图矩形
  const offset = settledOffset(target)          // 减掉入场动画冻结帧的位移
  const scale = visible.width / from.width      // 要放大多少倍

  avatar.style.setProperty('--dock-x', (visible.left - offset.dx + visible.width / 2 - (from.left + from.width / 2)).toFixed(2) + 'px')
  avatar.style.setProperty('--dock-y', (visible.top - offset.dy + visible.height / 2 - (from.top + from.height / 2)).toFixed(2) + 'px')
  avatar.style.setProperty('--dock-scale', scale.toFixed(4))
  overlay.classList.add('boot-splash--docking')
}
~~~

~~~css
#app-loading.boot-splash--docking .boot-core__avatar {
  animation: boot-dock 1150ms cubic-bezier(.24, .72, .14, 1) forwards;
}

@keyframes boot-dock {
  0%   { transform: none; border-radius: 50%; }
  58%  { transform: translate(var(--dock-x), var(--dock-y))
                    scale(calc(var(--dock-scale) * .76)); border-radius: 32%; }
  100% { transform: translate(var(--dock-x), var(--dock-y))
                    scale(var(--dock-scale)); border-radius: var(--dock-radius, 0px); }
}
~~~

58% 那个关键帧是"先滑到位、再展开贴合"的手感来源：位移按时到达，缩放故意落后，于是看起来是**飞过去之后原地长大**，而不是一路边飞边吹气球。

五条几何要点，每一条我都是踩了才写下来的：

1. **目标不能用元素盒子。** 首页肖像容器比图高，`object-fit: contain` 会留出 letterbox，盒子里有一圈空白。落点得按 `naturalWidth / naturalHeight` 自己算出「contain 之后真正可见的矩形」，否则头像会停在相框的空白上。
2. **必须补偿「冻结帧 → 终态」。** 量落点的时候，主页入场动画还冻在起始帧（`translateY(8px)`），直接量每次都差 8px。做法是沿祖先链累加 `getComputedStyle(...).transform` 的 `e/f`，把矩形还原成"动画跑完后"的位置。
3. **圆角要除以缩放，而且百分比要先解析成 px。** `transform: scale()` 会把 `border-radius` 一起放大，所以写进去的得是 `目标半径 / scale`；更阴的是 `getComputedStyle(el).borderTopLeftRadius` 对 `border-radius: 50%` **返回字符串 `"50%"`**，`parseFloat` 会把它当 50px 用——我第一版圆框落地只剩 3% 圆角，像被啃过的方片。
4. **父级不能淡出。** 飞行中的头像在帘幕里，帘幕整体 `opacity` 淡出会把它一起带走。所以帘幕的不透明背景挪到了 `::before`（`z-index: -1`，仍在帘幕自己的层叠上下文里），淡出只作用于这层"帷幕"和环、文字、HUD。
5. **落地必须复测。** 飞行这一秒里页面还在跑入场，目标会继续挪——实测桌面漂 0px、移动端漂 **12px**（窄屏 hero 是堆叠布局，热区高度还在变）。所以飞完要**再量一次**，用一段 160ms 的过渡把差值补掉：先 `cancel()` 掉动画、用行内样式接住当前姿态（同一任务里不触发绘制，看不出换手），再过渡到新值。

交接那一帧也有讲究：飞行期间首页肖像用 `visibility: hidden` 等着（保留布局盒，才能量），落地时**同一个 tick** 里恢复可见 + 移除帘幕 → 浏览器一次绘制完成，既不会"两张图都在"，也不会"都不在"。

顺便：如果没有落点目标（比如首访直接落在 `/posts`），这条自动退化成整帘淡出——`:not(.boot-splash--docking)` 就是为这条留的。锚点用的是 `[data-boot-dock]` 这个 data 属性而不是 class，免得以后样式重构把交接契约改坏。

## 6. 方格彗星：不要外框，只要一条"贪吃蛇"

第一版我做的是「刻度环 + 平滑流星」：`::before` 画 30 格刻度逆时针转，`::after` 画一条渐隐彗尾顺时针转。上线后自己越看越不对——均匀重复的刻度在环半径上是整个 hero 里元素密度最高的东西，而且对称轮盘转起来**没有任何信息量**（静态截图里根本看不出它在转），画面等于有两个主角。

于是整个外框砍掉，只留一条**由方块组成的彗尾**绕肖像爬：

~~~css
/* 十节小方块共用一条圆轨道 */
.home-page__portrait-orbit { position: absolute; inset: -22px; }

.home-page__portrait-orbit i {
  position: absolute;
  left: 0; top: 0;
  width: var(--snake-cell, 6px);
  height: var(--snake-cell, 6px);
  border-radius: 1px;
  background: var(--portrait-aqua);
  opacity: calc(1 - var(--i) * 0.085);        /* 越往尾越淡 */
  offset-path: circle(calc(50% - 3px) at 50% 50%);
  offset-rotate: 0deg;                        /* 关键：方块永远正着 */
  offset-anchor: 50% 50%;
  animation: portrait-snake 6.4s steps(48, end) infinite;
  animation-delay: calc(var(--i) * 133.33ms); /* 每节晚一个步长出发 */
}

@keyframes portrait-snake {
  from { offset-distance: 0%; }
  to   { offset-distance: 100%; }
}
~~~

三条要点，每条都是踩了才写下来的。

**一、方块必须永远"正着"，靠的是 `offset-rotate: 0deg`。**

常规做法是把方块摆到轨道上：`transform: rotate(A) translateY(-R)`。但那样方块自己也被转了，走到 45° 位置就变成**菱形**，"方格"两个字直接不成立。`offset-path` 负责定位、`offset-rotate: 0deg` 保证**朝向恒定**，于是方块永远和页面网格对齐。验证很便宜：量方块的 `getBoundingClientRect()`——正着是 6.000px，倾斜 45° 会变成 8.49px。

**二、`steps()` 才是"贪吃蛇"，`linear` 只是"流星"。**

`animation: portrait-snake 6.4s steps(48, end)` 让整条链一圈跳 48 次、每次 7.5°；相邻两节的延时正好差一个步长，于是看起来是蛇一节节往前拱。把 `steps(48)` 换回 `linear`，同一套 DOM 立刻退化成一条平滑滑行的彗星——两种手感由同一个参数决定。实测 26 次采样里，蛇头只落在 7.5° 的整数倍上，每次恰好 +7.5°，这就是"逐格"的证据。

**三、负延时会让尾巴跑到头前面——这次实测才抓到。**

第一版我写的是 `animation-delay: calc(var(--i) * -133.33ms)`，以为"负延时 = 落后"。恰恰相反：负延时是让动画**提前起跑**，于是第 1 节比蛇头还超前，整条淡尾跑到了头前面——看上去是一颗**倒着飞**的彗星。改成正延时（每节晚一个步长出发）才对：头在前、尾在后。

这个 bug 在运动里用肉眼很难判断，**冻结动画、逐节读角度**一秒就暴露——相邻角度差必须全部为正。动画开头 1.2s 会把尾巴逐渐拉开，那段时间还在启动帘幕后面，看不见。

**坑二：`radial-gradient` 默认是 `farthest-corner`。**（这一版已经不用环形遮罩了，但坑是真的，留个记号。）

第一版的光环是用 `radial-gradient` 把 conic 渐变裁成一圈窄环带的。我按"半径百分比"写（`transparent 78%, #000 79%, #000 84%`），以为百分比按半径算——其实默认 `farthest-corner` 是按**对角**距离算，于是环带的实际半径超出正方形内切圆，**正交方向一个像素都看不到**，只有四个角上有点东西。修法是显式 `circle closest-side`，让 100% 等于元素半径，带宽用 `calc(100% - Npx)` 表达，位置就和元素尺寸解耦。

**颜色与缩放的顺带好处。** `--portrait-aqua` 从现有 token 混出来（`accent` 52% + `info`），暗色偏青、亮色自动跟上；启动帘幕里那条同样的蛇用**同一个公式**，所以首访动画和首页那条颜色逐字相同（实测两边 computed color 完全一致）。另外 `circle(calc(50% - 3px) at 50% 50%)` 里的百分比相对**容器**解析，肖像在窄屏缩小时轨道自动跟着缩，不需要任何媒体查询。

## 7. 没有 Playwright 怎么验证动画

环境里没有 Playwright，也不想为了截图给项目加依赖。Node 24 自带全局 `WebSocket` 和 `fetch`，直接连 Chrome 的 CDP 就够了：

~~~js
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl)
// 然后就是标准的 send({ id, method, params }) / 监听 message
~~~

**坑三：这套 headless 只对「样式 / DOM 变化」出帧。** 同一相位间隔 1.6 秒连拍两张截图，得到的是**逐像素相同**的结果（`diff_ratio = 0`），可同一时刻 `getAnimations()[0].currentTime` 明明在走、`::after` 的 computed transform 明明在转。所以「截图没变」**不能**当成「动画没跑」的证据。要拿证据就两条路：

- 读 `currentTime`，以及 `getComputedStyle(el, '::after').transform` 反解出来的旋转角度（确定性，不依赖帧）；
- 真要截图，先把 `Emulation.setDeviceMetricsOverride` 的高度改 1px，逼整页重绘一次再拍。

实测数据留个档：

| 项目 | 实测 |
| --- | --- |
| 彗星节数 / 轨道半径 | 10 节 / 249px（照片半径 230px）|
| 相邻节角度差 | 恒为 7.5°（= 360/48，正好一个步长）|
| 方块朝向 | 6.000px 方框（倾斜 45° 会是 8.49px）→ 正着 |
| 逐格跳 | 26 次采样只落在 7.5° 整数倍上，每次恰好 +7.5° |
| 亮度梯度 | 头 opacity 1 → 尾 0.235（像素：头 #5abfe0 vs 尾 #1a333c）|
| 归位落点误差 | 桌面 0.00px / 移动端 0.00px（四项全 0）|
| 启动日志错落 | 0/5 → 1/5 → 2/5 → 3/5 → 4/5 → 5/5 |

**坑四：headless Chrome 永远上报 `prefers-reduced-motion: reduce`**，加 `--force-prefers-reduced-motion=no-preference` 也没用。要看真实动效必须走 CDP 的 `Emulation.setEmulatedMedia` 强制 `no-preference`。

## 8. 踩坑速查

| 坑 | 症状 | 修法 |
| --- | --- | --- |
| `animation-fill-mode: forwards` + delay | 元素首帧就可见，到点才闪一下 | 改 `both` |
| `radial-gradient` 默认 `farthest-corner` | 环形遮罩只在四个角上有，正交方向看不见 | 显式 `circle closest-side` + `calc(100% - Npx)`（第一版光环踩到）|
| 方块被路径带偏成菱形 | 「方格」变成斜方块 | `offset-rotate: 0deg` 锁住朝向 |
| 负 `animation-delay` | 尾巴跑到蛇头前面，彗星倒着飞 | 改正值延时；冻结动画逐节量角度验证 |
| `getComputedStyle` 读百分比圆角 | 拿到字符串 `"50%"`，当 50px 用 | 按盒子尺寸解析百分比 |
| 父级 `opacity` 淡出 | 飞行中的头像跟着一起变透明 | 把不透明背景挪到 `::before` |
| 冻结入场动画冻过头 | 帘幕淡出后露出空页面 | 解冻时机钉在"淡出开始"那一帧 |
| headless 截图看起来"没动" | 误判动画没跑 | 读 `currentTime` / computed transform；或改 1px 视口逼重绘 |

## 9. 现在的首访时序

| 时刻 | 发生什么 |
| --- | --- |
| 0ms | 帘幕上屏（此时 JS bundle 可能还没到），方格彗星开始逐格爬行 |
| 500 → 3300ms | 五行启动日志依次出现 |
| 0 → 3800ms | 进度条走满 |
| 3800ms | 帷幕开始溶解（600ms）· 头像起飞（1150ms）· 主页入场动画解冻 |
| ~4950ms | 落点复测 + 160ms 微调 |
| ~5100ms | 同一帧交接：肖像显形、帘幕移除 |

## 写在最后

这活儿技术上不难，难的是"不露馅"：落点差 12px、延迟元素提前可见、环带画到角上，这些**都不会报错**，只会让成品看起来"差一点，但说不上哪差"。所以我把每条都落成可验证的数字——0.00px、9s、-144.7°、5/5——改完立刻跑一遍，比肉眼盯半天靠谱。

最后一个取舍要交代清楚：启动帘幕**故意不参与 `prefers-reduced-motion` 降级**。原因是我的 Windows 关掉了"动画效果"，浏览器就一直上报 `reduce`，于是"按规范降级"直接等于"作者永远看不到自己写的功能"。站内其它动效（主页入场、路由加载环）仍然各自遵守 reduce；哪天想恢复，把那段媒体查询加回去就行。
