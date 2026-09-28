# 屏幕能力控制台（全屏 / 屏幕方向锁定 / 画中画）

无框架的原生 Web 示例，演示如何在移动端与演示场景下安全地申请和使用
Fullscreen API、Screen Orientation API、Picture-in-Picture API，
并用 Permissions API 展示权限状态、IndexedDB 保存操作历史。

## 运行

这三个能力都要求**安全上下文**（HTTPS 或 `localhost`）。直接双击
`index.html` 用 `file://` 打开时，多数浏览器会禁用相关 API（页面会进入
降级模式并给出提示）。请用本地静态服务器访问：

```bash
cd A
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

手机真机调试时，可用任意支持 HTTPS 的内网穿透 / 本地 https 方案访问。

## 功能

- 申请 / 退出全屏（`requestFullscreen`，含 webkit 前缀兼容）。
- 锁定横屏 / 竖屏 / 解除锁定（`screen.orientation.lock/unlock`），
  移动端会先自动进入全屏以满足前置条件。
- 申请 / 退出画中画（`requestPictureInPicture`），视频源为本地
  Canvas `captureStream()` 实时动画，无需网络资源。
- 每个能力卡片展示：权限状态、当前状态、触发条件、最近一次失败原因。
- 操作历史写入 IndexedDB（库不可用时自动降级到内存），刷新可查。
- “模拟用户未交互场景”按钮：延迟 6 秒（超过用户激活有效期）后调用
  三个 API，验证无手势时不崩溃、拒绝原因准确、降级正常。

## 异常与降级策略

| 场景 | 表现 |
| --- | --- |
| 非安全上下文 | 顶部红色横幅；调用前直接拦截并展示原因；三个卡片均显示降级提示 |
| 浏览器不支持 API | 能力检测前置拦截，不调用、不抛错；方向→手动旋转模态框，画中画→普通弹窗 |
| 权限被拒 / 无用户手势（`NotAllowedError`/`SecurityError`） | 显示可读原因与操作建议，记录失败历史 |
| 方向锁定失败 | 按错误类型区分：不支持→手动旋转提示；其他错误→原因与重试建议 |
| 画中画失败 | 未就绪 / 被策略拒绝等给出具体原因；不支持类自动降级为 `popup.html` 弹窗；弹窗被拦截时提示放开弹窗权限 |
| 退出全屏异常 | 独立归类处理（如未在全屏中退出），提示可按 Esc |
| IndexedDB 不可用 | 历史自动切换内存存储并在 UI 标注 |
| 任意初始化异常 | try/catch 兜底，页面不白屏，降级功能仍可用 |

## 文件结构

```
index.html        主页面
popup.html        画中画降级用普通弹窗
css/styles.css    样式
js/main.js        入口：状态渲染、事件绑定、历史
js/capabilities.js 环境检测 + 三个 API / Permissions / 用户激活适配层
js/actions.js     动作层：前置条件检查、调用、降级触发
js/errors.js      DOMException 等异常 → 原因 / 建议 / 降级类型
js/db.js          IndexedDB 历史存储（含内存降级）
js/ui.js          toast、模态框、Canvas 动画源
```

## 备注

- Permissions API 没有覆盖方向锁定的标准权限名；全屏 / 画中画在多数浏览器
  也采用“每次手势即请求、无持久授权”模型，页面会据此展示真实状态
  （查询不到时按“默认（点击即请求）”展示，而非谎称已授权）。
- iframe 中使用时还需响应头 / `allow` 属性放开
  `fullscreen; picture-in-picture`（以及可能的 `screen-wake-lock` 等），
  否则会收到 `SecurityError`，页面会提示为 Permissions-Policy 拒绝。
