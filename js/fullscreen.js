// 全屏能力：进入 / 退出 / 状态监听，含非安全上下文、被拒、未手势的分类处理

import { fullscreenInfo, isSecureContextSafe } from './env.js';
import { attempt } from './util.js';

export async function enterFullscreen() {
  if (!isSecureContextSafe()) {
    return {
      ok: false, kind: 'insecure', status: 'insecure',
      message: '当前为非安全上下文，全屏 API 要求 HTTPS 或 localhost',
      fallback: '请通过 HTTPS 访问本站点，或在本机使用 localhost 调试',
    };
  }
  const info = fullscreenInfo();
  if (!info.supported) {
    return {
      ok: false, kind: 'unsupported', status: 'unsupported',
      message: info.reason,
      fallback: 'iOS 设备可尝试在视频播放器内使用系统全屏按钮',
    };
  }
  if (info.active) {
    return { ok: true, kind: 'success', status: 'success', message: '当前已处于全屏状态', value: true };
  }
  const result = await attempt(() => {
    const p = info.request();
    // 部分旧 webkit 实现不返回 Promise
    return p && typeof p.then === 'function' ? p : Promise.resolve();
  }, {
    fallbackMessage: '浏览器拒绝进入全屏：请确认是由点击等用户手势触发；或使用 F11 / 浏览器菜单手动全屏',
  });
  return result;
}

export async function exitFullscreen() {
  const info = fullscreenInfo();
  if (!info.supported) {
    return {
      ok: false, kind: 'unsupported', status: 'unsupported',
      message: info.reason || '浏览器不支持 Fullscreen API',
      fallback: '请按 Esc 键或使用浏览器菜单退出全屏',
    };
  }
  if (!info.active) {
    // 退出全屏的幂等处理：没在全屏时不视为崩溃
    return { ok: true, kind: 'success', status: 'success', message: '当前不在全屏，无需退出', value: true };
  }
  return attempt(() => {
    const p = info.exit();
    return p && typeof p.then === 'function' ? p : Promise.resolve();
  }, {
    fallbackMessage: '退出全屏失败：请尝试按 Esc 键退出',
  });
}

export function onFullscreenChange(handler) {
  const info = fullscreenInfo();
  if (info.changeEvent) {
    document.addEventListener(info.changeEvent, handler);
  }
}
