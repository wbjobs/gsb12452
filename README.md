# 屏幕能力控制台（无框架原生实现）

在一个页面里控制并观测 **全屏（Fullscreen API）**、**屏幕方向锁定（Screen Orientation API）**、
**画中画（Picture-in-Picture API）**，并用 **Permissions API** 展示权限状态、
**IndexedDB** 持久化操作历史。纯 HTML + CSS + ES Modules，无任何框架与依赖。

## 运行

这些能力要求**安全上下文**，请通过 `localhost` 或 HTTPS 访问（直接双击 `file://` 打开会被判为非安全上下文）：

```bash
# 任选其一，在项目根目录执行
python3 -m http.server 8080
npx serve .
# 然后打开 http://localhost:8080
```

移动端真机调试需用 HTTPS（如 `python3 -m http.server` + 内网穿透/自签证书，或部署到静态托管）。

## 文件结构

- `index.html` — 页面结构：环境徽章、三张能力卡片、异常测试、历史表格、降级遮罩/弹窗
- `styles.css` — 深色响应式样式
- `js/env.js` — 安全上下文与三种能力的厂商前缀兼容检测
- `js/permissions.js` — Permissions API 封装（`fullscreen` / `orientation-lock` / `picture-in-picture`，不可查询时优雅降级）
- `js/util.js` — 错误统一分类（denied / blocked / unsupported / insecure / error）、`attempt` 安全调用、toast、旋转提示、弹窗
- `js/fullscreen.js` — 进入/退出全屏（含 webkit 前缀、幂等退出）
- `js/orientation.js` — 横屏/竖屏锁定、解锁、当前方向推断、前置条件（桌面浏览器需先全屏）
- `js/pip.js` — `canvas.captureStream` 生成免联网演示视频、进入/退出画中画、降级普通弹窗
- `js/history.js` — IndexedDB 历史（上限 500 条；IndexedDB 不可用时自动降级内存，绝不阻塞主流程）
- `js/main.js` — 状态渲染、事件编排、结果提示、历史落库、降级触发

## 异常与降级矩阵

| 场景 | 行为 |
| --- | --- |
| 非安全上下文 | 顶部红色徽章 + 进入页面弹窗提示；三种能力均直接返回 `insecure` 并写入历史 |
| 浏览器不支持 | 卡片红点与“可用条件”说明；能力调用返回 `unsupported` |
| 方向锁定不支持/失败 | 降级为**全屏旋转提示遮罩**，引导用户手动旋转到横/竖屏 |
| 画中画不支持/被 Permissions-Policy 禁用 | 降级为 `window.open` **普通弹窗**；弹窗被拦截再退化为**页面内模态弹窗** |
| 权限被拒 | 展示 `NotAllowedError/SecurityError` 原文与可操作建议，历史记 `denied` |
| 用户未交互 | “异常与降级测试”卡片在 6 秒后的 `setTimeout`（无瞬时激活）中发起调用，被捕获并提示“需要用户手势”，页面不崩 |
| 退出全屏/画中画异常 | 幂等处理（本就退出时算成功）；失败时提示按 Esc 或点画中画关闭按钮 |

所有能力调用都经过两层防护：能力模块内部 `attempt()` 不抛错，`main.js` 编排层再兜底一次，
顶层 `init()` 也有安全网，保证任何路径下页面都不会白屏崩溃。

## 操作历史

每次操作记录：时间、能力、操作、结果分类、详情/失败原因（含降级建议）、是否来自用户手势。
存于 IndexedDB（库 `screen-console`，表 `history`），支持刷新与清空。

## 已知浏览器差异

- **iOS Safari**：不支持 `screen.orientation.lock`（走手动旋转降级）；全屏仅支持视频元素内的 webkit 全屏；PiP 支持 `webkitSetPresentationMode` 路径，设备不支持时走弹窗降级。
- **桌面 Chrome/Edge**：方向锁定通常要求文档先处于全屏，失败原因中会明确提示。
- **Firefox**：Permissions API 不支持查询这三个权限名，状态显示“不可查询，调用时裁决”；PiP 需视频元素。
- Permissions-Policy：被 `fullscreen=()` / `picture-in-picture=()` 禁用时按“被拒”处理并触发降级。
