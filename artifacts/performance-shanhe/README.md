# 山河志 PC 性能测量

## 本轮最终对照（2026-10-27）

当前结论以 `interleaved-cards-ten-verified.json` 及同名 summary 为准：原版、上次发布版、最终 cards 构建同场交错，每个版本每种 DPR/缓存状态 10 个样本，共 120 个导航与 60 次真实点击。偶数样本中位数取中间两值平均，p90 使用 nearest-rank；保留所有慢值和工具异常。独立冻结的 driver/probe 随 JSON 保存。

```sh
node artifacts/performance-shanhe/serve-variants.mjs 4201=dist-baseline 4202=dist-previous 4210=dist-cards
PERF_VARIANTS=original,published,cards PERF_REPEATS=10 PERF_INTERACTIONS=1 PERF_LABEL=interleaved-cards-ten-verified node artifacts/performance-shanhe/interleaved.mjs
```

先构建并冻结对应源码版本，避免构建、截图或其他 GPU 测试与计时同时进行。Chromium 路径可通过 `PERF_BROWSER_BIN` 指定。循环服务与正式 GitHub Pages 缓存/网络不同，不能将本地时延当成公网保证。

本轮最终结果不等于全目标达成：首图相对上次发布快 25.2%–47.7%，相对原版快 16.8%–19.0%；DPR2 缓存真刷新中位 83.8 ms，仍超过 80 ms。所有高清资源保留，细节与失败实验见主目录 PERFORMANCE.md。

以下为较早测量方式及历史边界。

基线为原公开中国版 `d6412a3`，保留 81 个地点、山系/水系、真实三维地形、原摄影和既有稀疏缓存。这里只添加独立测量代码，不进入生产 JavaScript。

## 本机协议

1496×900，原生 DPR1 和 DPR2，各三轮。Chromium Headless Shell 使用 ANGLE Metal 硬件 WebGL，具体设备和浏览器版本随 JSON 记录。每轮先清空 HTTP 缓存和源存储后真正导航，再保留缓存执行 `Page.reload`，核对 navigation 为 reload、pageshow.persisted 为 false。浏览器/GPU 热身另列；清网页缓存不会清除 GPU 驱动、着色器或操作系统缓存。

首屏地图要求：实际卫星纹理已经绘制（读取 WebGL 像素与源瓦片状态），当前卫星源加载完成，无该源瓦片错误，交互控件启用，再等两次 requestAnimationFrame。它是呈现时间上界，不是物理屏幕光子测量。完整首屏另要求地形启用、全部 84 个山河要素已建立、地图当前请求完成且相机不在移动。所有加载计时结束后以真实鼠标拖动验证地图可操作，不用手势改变首屏加载视野。

地点反馈使用 CDP 真实鼠标点击珠峰搜索结果，分别记录事件至图文 DOM 更新、以及后续两帧呈现上界。帧率分别记录 rAF 与实际 map render，按相同 2 秒 / +25° bearing 路径测全国与珠峰。Headless 约 120Hz 节奏不能等同于实体显示器或所有 PC 的帧率保证。

本地组主动阻断外部请求，不加网络限速，使用相同的静态服务器。未缓存的飞行中间瓦片因此产生请求失败，这些 URL 全部保留在 `blocked`；不能将该组说成完整全国所有级别均有缓存，也不能当成公网速度承诺。原地形放大 1.5 倍与源摄影像素保留，测量不修改画质配置。

## 命令

静态服务器需对相同文件开启相同缓存语义，固定 `/china-atlas/` 路径。脚本已记录本机 Chromium 路径，其他机器需调整。

```sh
ATLAS_PERF_URL=http://127.0.0.1:4191/china-atlas/ PERF_LABEL=baseline node artifacts/performance-shanhe/benchmark.mjs
ATLAS_PERF_URL=http://127.0.0.1:4192/china-atlas/ PERF_LABEL=optimized node artifacts/performance-shanhe/benchmark.mjs
node artifacts/performance-shanhe/summarize.mjs baseline optimized
```

脚本默认仅接受回环地址。显式 `--public` 才允许测实际公网，并保留所有上游请求；`--smoke` 使用 DPR1 / 一轮，对公网发布后快速核查使用。真实公网网络时延随地点和时间变化，须单列，不能混入本地前后百分比。

```sh
ATLAS_PERF_URL=https://mastiusbkbk-max.github.io/china-atlas/ PERF_LABEL=public-final node artifacts/performance-shanhe/benchmark.mjs --public --smoke
```

截图仅在 `PERF_SCREENSHOTS=1` 时启用，且不进入任何计时。首个带截图基线在 DPR2 的 CDP `Page.captureScreenshot` 遭 Metal shared-image 错误而超时，已保留 `baseline-screenshot-failure.json`。它不是已完成主对照；最终基线关闭截图重跑。自动拦截取消中的 `Invalid InterceptionId` 与网页 Runtime 异常分别记录，不能混称页面异常。

## 目标

沿用寰游目标并再缩短 20% 耗时：首次纹理地图可操作 ≤640ms、缓存后真实刷新 ≤80ms、地点反馈 ≤40ms。普通地图帧间隔缩短20%对应平均 ≥100fps。原公开中国版不含实景建筑模型，不新增该功能或伪造模型指标。
