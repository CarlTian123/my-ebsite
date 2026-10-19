# NEXUS — Ultimate Web Gaming Platform

Hello Games Studio 的游戏在网页上的统一入口。所有游戏都在浏览器里原生运行，**不需要安装、不需要账号**，收藏与进度存在本机。

线上地址：<https://carltian123.github.io/my-ebsite/>

---

## 里面有什么

| 游戏 | 类型 | 入口 | 说明 |
| --- | --- | --- | --- |
| **PHI:NEON** · 霓虹判型 | 节奏 / 音乐 | `games/phi-neon/` | 四轨下落式节奏游戏，5 首原创曲目，每首 HD / IN 双谱面，单曲 90 秒 |
| **蓝鱼枪战** · 深海火拼 | 射击 / 动作 | `games/blue-fish/` | 波次生存射击，3 人难度，7 种水枪，3 张强化卡选 1，深海 BOSS |
| **提灯** · 一束光走进纸里 | 解谜 / 休闲 | `games/lantern/` | 纸面光路解谜，10 盏灯，无时间限制、无失败判定 |

三个游戏**互不共享引擎**：PHI:NEON 是 Canvas 节奏引擎，蓝鱼枪战是 Canvas 射击引擎，提灯是单文件 Canvas 解谜。平台不接管它们的玩法、素材与内部界面，只负责入口、路由、启动过渡与返回。

## 品牌

- **NEXUS** — 平台。标志是「四段对角短线朝中心汇聚，落在中间的菱形节点上」。
- **Hello Games Studio** — 工作室。「The Open Hello」：一圈几乎闭合的轮廓，缺口开在右上，环抱的中心节点是品牌酸橙绿。
- **Byebye Games Engine v1.0** — 进入游戏时经过的那道门，也是品牌层，不是底层技术引擎。标志「The Passing Gate」：两个错位、开放的轮廓构成一个入口。

全部标志的 SVG（独立图形 / 横向组合 / 竖向组合 / 完整名称 / 浅色 / 深色 / 单色 / 强调色 / favicon / 动态版）在 `assets/brand/`，站内的 `/studio` 页面可以预览与下载。

## 目录结构

```
index.html                 平台外壳（单页，hash 路由）
manifest.webmanifest       PWA 清单
.nojekyll                  关闭 GitHub Pages 的 Jekyll 处理
assets/
  css/   tokens base components views motion   （令牌 → 基础 → 组件 → 页面 → 动效）
  js/    core ui launch search player views app
  brand/ 两个品牌的 SVG 全形态
  fonts/ Inter Var + Noto Sans SC
  img/   cover/ thumb/ hero/（三款游戏的平台侧封面）、favicon、og.png
data/games.json            真实游戏清单（路由、详情、搜索都读这一份）
games/                     三个游戏本体，原样存放
app/                       iOS WKWebView 壳（Swift + build-ipa.sh）
dist/                      预构建的未签名 ipa
```

## 本地运行

平台用原生 ES Module 与原生 CSS，**没有构建步骤**。需要任意静态服务器（不能直接双击 `index.html`，浏览器不允许 `file://` 下的模块与 fetch）：

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080/
```

## 技术说明

- **零依赖、零构建**：7 个 ES Module + 5 个 CSS 文件，没有框架、没有打包器。
- **路由**：`#/`、`#/game/<slug>`、`#/play/<slug>`、`#/library`、`#/recent`、`#/favorites`、`#/settings`、`#/studio`。
- **持久化**：`localStorage` 键 `nexus.state.v1`（收藏、最近游玩、设置）。不可用时降级为内存，不崩。
- **启动序列**：Intent → Spatial Convergence → Brand Reveal → Portal Opening → Arrival。第五段只在真正就绪后退出，没有假进度条；可随时跳过，重复启动走加速路径，动画不阻塞游戏。
- **主题**：深色为主，浅色是完整第二套（Hero 与启动序列在浅色下仍作为「暗场」，避免浅底上摊开深色游戏画面变成灰雾）。
- **动效**：全部走 `transform` / `opacity`，尊重 `prefers-reduced-motion`（关闭视差、去空间变形、缩短转场、保留必要反馈）。
- **无障碍**：键盘全程可用，焦点可见，语义化控件，搜索浮层有焦点锁与方向键选择。
- **游戏隔离**：游戏跑在同源 iframe 里，平台只在加载真实成功后才放行；入口缺失、资源失败、iframe 运行时报错都有独立反馈（重试 / 返回详情）。

## iOS 壳

`app/` 是 WKWebView 壳，`app/build-ipa.sh` 会把平台目录下的 `games/blue-fish/` 相关文件拷贝进 App 的资源目录后打包。推送 `.ipa` 由 `.github/workflows/build-ipa.yml` 触发（改动 `app/**` 时运行）。平台重构后该脚本已同步指向 `games/blue-fish/`。

## 说明

平台文案只写可验证的信息（曲目数、关卡数、操作方式、判定参数等），不虚构评分、玩家数、开发者资料或截图。
