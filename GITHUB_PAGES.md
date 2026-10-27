# 山河志 · GitHub Pages 发布

本轮只优化山河志中国版，保留原有 81 个地点、山脉河流、摄影及高清地图数据。寰游的网站、仓库和模型资源不变。

- 源码仓库：<https://github.com/mastiusbkbk-max/china-atlas>
- 优化源码分支：`codex/shanhe-pc-performance-20`
- 已发布网站：<https://mastiusbkbk-max.github.io/china-atlas/>
- Pages 来源：`gh-pages` 分支的根目录，沿用原有 legacy Pages 设置。

## 构建和必要检查

```sh
npm ci
npm test
npm run build
node scripts/prepare-pages.mjs dist
```

Vite 的默认基路径 `/china-atlas/` 与正式网站一致。校验脚本确认存在非空入口、产物总量小于 1 GB、单文件小于 Git 的 100 MiB 限制，并阻止符号链接、Git 元数据和 `node_modules` 进入发布目录；检查成功后写入空的 `.nojekyll`。它不删除文件，不缩小、重编码或改动任何摄影、地图瓦片和地理数据。

## 发布与回退

由已登录本机的 GitHub 凭据将源码提交到上述优化分支，再将完整 `dist/` 内容提交到 `gh-pages` 并正常推送。发布提交应保留 `gh-pages` 原有历史，不使用强制推送；仅替换站点构建产物。推送后检查 `pages-build-deployment` 的结果，并在正式域名核对入口及其引用的带哈希脚本、CSS 和代表性地图资源。

本轮不新增使用 `GITHUB_TOKEN` 推送 `gh-pages` 的工作流：此类提交通常不会触发现有 legacy Pages 构建。沿用本机授权推送即可，不需要额外 PAT secret 或切换 Pages 发布模式。

原发布提交为 `57cf61c2ef8ed8ae3c0dcceec25ac26cec1fd162`。需要回退时，在 `gh-pages` 上通过一个新提交恢复该提交的完整站点文件，再正常推送；不要改写分支历史。保留优化源码分支，便于继续测试或修改。

## 公网测量口径

GitHub Pages 决定线上缓存和压缩策略；本地服务器的 Brotli/gzip 或毫秒级基准不能直接充当公网实测。上传 `.br`、`.gz` 副本不意味着 Pages 会自动进行内容协商。本轮在不依赖自定义服务器响应头的前提下发布，原始资源与来源许可保留。

浏览器重新测试时分别观察清空 HTTP 缓存后的首次导航、保留缓存后的真实刷新，以及地点点击和连续旋转；BFCache 返回不能记作缓存刷新。实际结果需注明设备、视口、DPR、网络与样本数量。
