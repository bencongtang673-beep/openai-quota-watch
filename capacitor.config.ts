import type { CapacitorConfig } from '@capacitor/cli';

// 安卓 APK 打包配置（M7）。网页产物以根路径 "/" 构建到 dist-apk，由 Capacitor 在 App 内离线加载。
// appId 一经发布不能再改：改了就是另一个 App，旧存档无法沿用。
const config: CapacitorConfig = {
  appId: 'io.github.bencongtang673beep.sudoku',
  appName: '数独',
  webDir: 'dist-apk',
  android: {
    // 数据（IndexedDB）保存在 App 私有目录；签名密钥固定才能覆盖安装而不丢数据
    allowMixedContent: false,
  },
};

export default config;
