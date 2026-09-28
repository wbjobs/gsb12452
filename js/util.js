// 通用工具：错误分类、安全调用、用户手势判断、轻提示 / 弹窗 / 旋转遮罩

/**
 * 把底层异常归因为统一类别，便于展示“失败原因”与决定降级策略。
 * 分类：denied（被拒） | blocked（未交互/不允许） | unsupported | insecure | error
 */
export function classifyError(err) {
  if (!err) return { kind: 'error', name: 'UnknownError', message: '未知错误' };

  const name = err.name || '';
  const message = String(err.message || '');
  const text = `${name} ${message}`.toLowerCase();

  if (name === 'SecurityError' || /secure context|insecure|https/.test(text)) {
    // SecurityError 也可能由未手势触发导致，需结合调用点；这里标记为安全类
    if (/secure context|insecure context|must be served|https/.test(text)) {
      return { kind: 'insecure', name, message: message || '非安全上下文（需要 HTTPS 或 localhost）' };
    }
  }
  // Permissions-Policy 显式禁用某能力（如 fullscreen=() / picture-in-picture=()）
  if (/permissions?[ -]?policy|disabled by|feature policy/.test(text)) {
    return { kind: 'denied', name, message: message || '该能力被页面的 Permissions-Policy 禁用' };
  }
  if (name === 'NotAllowedError' ||
      /permission denied|not allowed|denied|user gesture|transient activation|user activation|gesture/.test(text)) {
    // 未交互 / 需要手势 与 权限被拒在部分浏览器里同样抛 NotAllowedError
    if (/gesture|activation|interact/.test(text)) {
      return { kind: 'blocked', name, message: message || '需要由用户手势（点击等）触发，当前没有用户交互' };
    }
    return { kind: 'denied', name, message: message || '权限被拒绝' };
  }
  // 部分浏览器（桌面/部分安卓 Chrome）用 SecurityError + 该文案表示锁定能力不可用
  if (/not available on this device|orientation lock is not/.test(text)) {
    return { kind: 'unsupported', name, message: message || '当前设备不支持屏幕方向锁定' };
  }
  if (name === 'NotSupportedError' || /not supported|unsupported|not implemented/.test(text)) {
    return { kind: 'unsupported', name, message: message || '当前浏览器不支持该能力' };
  }
  if (name === 'AbortError') {
    return { kind: 'error', name, message: message || '操作被中止' };
  }
  return { kind: 'error', name, message: message || name || '未知错误' };
}

/**
 * 安全执行一个能力调用：永不抛出（满足“用户未交互时调用不能崩”）。
 * @returns 统一结果对象 { ok, kind, status, message, error, fallback }
 */
export async function attempt(fn, { fallbackMessage = '' } = {}) {
  try {
    const value = await fn();
    return { ok: true, kind: 'success', status: 'success', message: '操作成功', value, fallback: '' };
  } catch (err) {
    const info = classifyError(err);
    return {
      ok: false,
      kind: info.kind,
      status: info.kind,
      message: info.message,
      errorName: info.name,
      error: err,
      fallback: fallbackMessage,
    };
  }
}

/** 当前是否处于“短暂用户激活”窗口（点击后约 5 秒内） */
export function hasTransientActivation() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userActivation && typeof navigator.userActivation.isActive === 'boolean') {
    return navigator.userActivation.isActive;
  }
  // 无法探测时交给浏览器自身裁决；这里返回 unknown 由调用点处理
  return 'unknown';
}

/* ---------------- 轻提示 toast ---------------- */

let toastTimer = null;
export function toast(message, tone = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast ${tone}`.trim();
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ---------------- 页面内普通弹窗（画中画降级用） ---------------- */

export function openModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  document.getElementById('fallback-modal').hidden = false;
}
export function closeModal() {
  document.getElementById('fallback-modal').hidden = true;
}

/* ---------------- 旋转设备提示遮罩（方向锁定降级用） ---------------- */

export function showRotateHint(orientation) {
  const wantLandscape = orientation === 'landscape';
  document.getElementById('rotate-icon').textContent = wantLandscape ? '📱↪️' : '📱↩️';
  document.getElementById('rotate-text').textContent = wantLandscape
    ? '当前设备不支持方向锁定，请手动将设备旋转至横屏'
    : '当前设备不支持方向锁定，请手动将设备旋转至竖屏';
  document.getElementById('rotate-overlay').hidden = false;
}
export function hideRotateHint() {
  document.getElementById('rotate-overlay').hidden = true;
}

export function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
