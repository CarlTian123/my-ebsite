#!/usr/bin/env bash
# 用 XcodeGen + xcodebuild 把网页版打成未签名的 .ipa（Payload/BlueFish.app）
#
# 需要：macOS + Xcode（命令行工具不够）、xcodegen（brew install xcodegen）
# 用法：./app/build-ipa.sh
# 产物：app/dist/BlueFish-unsigned.ipa
#
# 这个 ipa 没有签名，装到 iPhone 上要先自己签（Sideloadly / AltStore / 爱思助手），
# 或者用 Xcode 打开 app/ios/BlueFish.xcodeproj 选真机直接跑（会自动用你的 Apple ID 签）。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
APP_SRC="$HERE/ios/App"
WWW="$APP_SRC/www"
DIST="$HERE/dist"

echo "==> 1/5 拷贝网页文件到 App Bundle"
rm -rf "$WWW"
mkdir -p "$WWW"
# NEXUS 改版后网页游戏本体在 games/blue-fish/，平台外壳不参与打包
GAME="$ROOT/games/blue-fish"
for f in index.html style.css game.js audio.js icons.js icons.css boot.js boot.css; do
  cp "$GAME/$f" "$WWW/$f"
done
mkdir -p "$WWW/assets"
cp -R "$GAME/assets/fonts" "$WWW/assets/fonts"
cp -R "$GAME/assets/img" "$WWW/assets/img"
# 游戏里用不到的自检页就不打包了
rm -f "$WWW/assets/img/preview.html"
du -sh "$WWW"

echo "==> 2/5 生成 Xcode 工程"
cd "$HERE/ios"
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "缺少 xcodegen，尝试 brew install xcodegen ..."
  brew install xcodegen
fi
xcodegen generate --spec project.yml

echo "==> 3/5 编译（不签名）"
xcodebuild \
  -project BlueFish.xcodeproj \
  -scheme BlueFish \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath "$HERE/build" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  -destination "generic/platform=iOS" \
  build 2>&1 | tail -60

APP_PATH="$HERE/build/Build/Products/Release-iphoneos"
echo "==> 4/5 打包 ipa"
mkdir -p "$DIST"
rm -rf "$HERE/build/Payload" "$DIST/BlueFish-unsigned.ipa"
mkdir -p "$HERE/build/Payload"
cp -R "$APP_PATH"/*.app "$HERE/build/Payload/"
cd "$HERE/build"
zip -qry "$DIST/BlueFish-unsigned.ipa" Payload

echo "==> 5/5 完成"
ls -lh "$DIST/BlueFish-unsigned.ipa"
echo
echo "安装方式（任选其一）："
echo "  A. Xcode：打开 app/ios/BlueFish.xcodeproj，选你的 iPhone，Signing 里选自己的 Apple ID，Run。"
echo "  B. Sideloadly / AltStore / 爱思助手：把上面这个 ipa 拖进去，用你的 Apple ID 自动签名后安装。"
