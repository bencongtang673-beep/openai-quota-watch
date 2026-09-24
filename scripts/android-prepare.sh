#!/usr/bin/env bash
# 在 CI 中生成并配置 Capacitor 安卓工程（工程本身不入库，每次从模板生成，保证可重复）。
set -euo pipefail
VERSION_NAME=$(node -p "require('./package.json').version")
VERSION_CODE=${VERSION_CODE:-1}
BASE_PATH=/ npx vite build --outDir dist-apk
[ -d android ] || npx cap add android
npx cap sync android
GRADLE=android/app/build.gradle
# 版本号：versionCode 必须单调递增，否则无法覆盖安装
sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/" "$GRADLE"
sed -i -E "s/versionName \"[^\"]*\"/versionName \"${VERSION_NAME}\"/" "$GRADLE"
# 震动权限（navigator.vibrate 在 WebView 中需要）
MANIFEST=android/app/src/main/AndroidManifest.xml
grep -q 'android.permission.VIBRATE' "$MANIFEST" || sed -i 's#<uses-permission android:name="android.permission.INTERNET" />#<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.VIBRATE" />#' "$MANIFEST"
# 应用图标：用 PWA 的 512 图标生成各密度 launcher 图标
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  name=${d%%:*}; size=${d##*:}
  dir=android/app/src/main/res/mipmap-$name
  mkdir -p "$dir"
  convert public/icons/icon-512.png -resize ${size}x${size} "$dir/ic_launcher.png"
  convert public/icons/icon-512.png -resize ${size}x${size} "$dir/ic_launcher_round.png"
  # 自适应图标前景为 108dp（= 2.25 倍 48dp）
  fg=$(( size * 9 / 4 ))
  convert public/icons/maskable-512.png -resize ${fg}x${fg} "$dir/ic_launcher_foreground.png"
done
BG=android/app/src/main/res/values/ic_launcher_background.xml
[ -f "$BG" ] && sed -i -E 's#<color name="ic_launcher_background">[^<]*</color>#<color name="ic_launcher_background">\#F5F0E6</color>#' "$BG"
echo "prepared versionCode=${VERSION_CODE} versionName=${VERSION_NAME}"
