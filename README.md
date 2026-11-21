# AMU ARCHIVE

阿木的个人档案。这个 GitHub Pages 站点现在镜像三主题博客
[`amu263/amuboke-no.zero`](https://github.com/amu263/amuboke-no.zero) 的构建产物：

- **经典档案** `/`
- **新艾利都（ZZZ）** `/zzz/`
- **提瓦特（原神 UI）** `/genshin/`

## 部署

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) 会检出博客仓库、构建三套主题，并把
`apps/web/dist` 作为 GitHub Pages artifact 发布。

- 手动运行：Actions → **Deploy AMU blog to GitHub Pages** → Run workflow。
  - 默认 `amu263/amuboke-no.zero@master`；
  - 也可以填 `a11ag/amuboke-no.zero` + 分支，先预览未合并的主题。
- 每天定时从 `master` 同步一次；Cloudflare Pages（`bokezero.amuspaces.top`）仍是主站。

旧的独立 ZZZ 站点源码保留在 [`site/`](site/) 里供历史查看，但不再由 Pages 构建。
