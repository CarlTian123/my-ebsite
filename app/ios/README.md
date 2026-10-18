# iOS 包装（WKWebView）

把 `fish-shooter` 的网页版整个塞进一个 WKWebView，做成原生 App。

## 目录

```
app/
├── build-ipa.sh                  # 一键：拷网页 → xcodegen → xcodebuild → 打 ipa
└── ios/
    ├── project.yml               # XcodeGen 工程描述（不用手写 .xcodeproj）
    ├── App/
    │   ├── AppDelegate.swift     # 横屏锁定、禁止息屏
    │   ├── ViewController.swift  # 全屏 WKWebView + 震动桥
    │   ├── Assets.xcassets       # App 图标（由 hero 图合成）
    │   └── www/                  # ← 构建时从仓库根拷进来的网页（不提交）
    └── Support/Info.plist        # 横屏、全屏、隐藏状态栏、显示名"蓝鱼枪战"
```

## 本机构建（需要 Xcode，不是只有命令行工具）

```bash
brew install xcodegen
./app/build-ipa.sh
# → app/dist/BlueFish-unsigned.ipa
```

## 云端构建（没有 Xcode 时）

仓库里的 `.github/workflows/build-ipa.yml` 会在 GitHub Actions 的 macOS runner 上跑同一套脚本，
构建完把 ipa 作为 artifact 上传，同时复制一份到 `dist/` 提交回仓库。下载地址：
`https://github.com/CarlTian123/my-ebsite/actions`

## 装到 iPhone

`BlueFish-unsigned.ipa` **没有签名**，iPhone 不会直接装。三种办法：

1. **Xcode 直装（最省事）**：`open app/ios/BlueFish.xcodeproj`，选中你的 iPhone，
   Signing & Capabilities 里把 Team 选成你自己的 Apple ID（免费账号就行，证书 7 天有效），Run。
2. **Sideloadly / AltStore / 爱思助手**：把 ipa 拖进去，填 Apple ID 自动签名后安装。
3. **付费开发者账号**：用自己的证书重签，可以长期使用。

## 已知限制

- WebView 里的 canvas 性能比 Safari 略低，游戏内已自适应降分辨率（`PERF` 机制）。
- 音频走 WKWebView 的 WebAudio，首次点击后才出声（和网页版一致）。
- 震动通过 `webkit.messageHandlers.haptic` 桥接：网页侧 `haptic('tick'|'light'|'medium'|'heavy')` 会映射到
  `UIImpactFeedbackGenerator` 的 light/medium/heavy（开火轻点、击杀短震、冲刺中震、受伤与 Boss 倒地重震）。

