# 应用名字 & 图标（小白版）

## 改显示名称（桌面上的名字）

编辑项目根目录的 `capacitor.config.json`：

```json
{
  "appId": "com.kwiwi.draft",
  "appName": "Draft",
  "webDir": "www"
}
```

- **`appName`**：手机桌面上看到的名字，改成例如 `"草稿本"` 即可。
- **`appId`**：应用唯一 ID（像身份证）。**已经装过的手机上如果改它，会变成另一个应用**（旧的还在）。  
  一般用反向域名：`com.你的名字.draft`。

改完后重新构建 APK（推 git 或本地 `npx cap sync`）才会生效。

网页标题还可改 `index.html` 里的 `<title>Draft</title>`（不影响桌面图标名）。

## 改图标

1. 准备一张 **正方形 PNG**，建议 **1024×1024**（不要太小）。
2. **覆盖**本目录的 `icon.png`（文件名必须是 `icon.png`）。
3. 可选：同时替换 `splash.png`（启动图；没有精细要求可用纯色）。
4. 重新跑构建。GitHub Actions 会在生成 Android 工程后自动根据 `resources/icon.png` 生成各种尺寸图标。

### 本地一键生成图标资源

```bash
npm install
npm run resources
```

这会调用 `@capacitor/assets`，把 `resources/icon.png` 同步到 `android/` 各分辨率目录。

## 常见问题

| 问题 | 原因 |
|------|------|
| 改了名字但手机还是旧的 | 没重装 APK，或只改了网页 title |
| 两个 Draft 同时存在 | 改过 `appId`，系统当成新应用 |
| 图标没变 | 手机启动器缓存；卸了重装，或等几分钟 |
| 图标四周有白边 | 源图本身有白底；用透明底 PNG 更好 |
