// 屏幕方向锁定：横屏 / 竖屏 / 解锁
// 注意：多数桌面浏览器要求文档先进入全屏；iOS Safari 全系不支持 lock，降级为旋转提示。

import { orientationInfo, isSecureContextSafe, fullscreenInfo } from './env.js';
import { attempt } from './util.js';

// 记录“期望锁定”的方向，API 不可用时仍可据此提示用户
let wantedLock = null; // 'landscape' | 'portrait' | null

export function getWantedLock() { return wantedLock; }

export async function lockOrientation(mode /* 'landscape' | 'portrait' */) {
  const orientation = mode === 'landscape' ? 'landscape' : 'portrait';
  wantedLock = orientation;

  if (!isSecureContextSafe()) {
    return {
      ok: false, kind: 'insecure', status: 'insecure',
      message: '当前为非安全上下文，屏幕方向锁定要求 HTTPS 或 localhost',
      fallback: '请通过 HTTPS 访问；或手动旋转设备到期望方向',
    };
  }

  const info = orientationInfo();
  if (!info.lockSupported) {
    return {
      ok: false, kind: 'unsupported', status: 'unsupported',
      message: info.reason,
      fallback: orientation === 'landscape'
        ? '已降级：请手动旋转设备至横屏（已显示旋转提示）'
        : '已降级：请手动旋转设备至竖屏（已显示旋转提示）',
      degrade: 'rotate-hint',
    };
  }

  // 桌面 Chrome/Edge 要求文档处于全屏，否则抛 SecurityError / NotSupportedError
  const lockMode = orientation === 'landscape' ? 'landscape' : 'portrait';

  const result = await attempt(() => {
    // 部分浏览器 lock() 在非全屏时立刻 reject；不在这里自动全屏，
  // 而是把先决条件作为失败原因展示，避免隐式改变屏幕状态。
    return Promise.resolve(info.lock(lockMode));
  }, {
    fallbackMessage: '方向锁定失败：多数桌面浏览器要求先进入全屏；移动端请确认浏览器允许方向控制',
  });

  if (!result.ok && /fullscreen|full-screen/.test(result.message || '')) {
    result.fallback = '请先点击“进入全屏”，再进行方向锁定；或手动旋转设备';
  }
  if (!result.ok) {
    // 锁定失败不保留“期望锁”，避免状态展示误导
    wantedLock = null;
  }
  return result;
}

export async function unlockOrientation() {
  wantedLock = null;
  const info = orientationInfo();
  if (!info.lockSupported) {
    return {
      ok: true, kind: 'success', status: 'success',
      message: '当前环境本就不支持方向锁定，期望状态已清除',
      value: true,
    };
  }
  return attempt(() => Promise.resolve(info.unlock()), {
    fallbackMessage: '解除锁定失败：通常在退出全屏时会自动解除',
  });
}

export function currentOrientation() {
  const info = orientationInfo();
  if (!info.supported) {
    // 最旧的兜底：用 viewport 宽高推断
    const inferred = window.innerWidth > window.innerHeight ? 'landscape-primary' : 'portrait-primary';
    return { type: inferred, angle: 0, inferred: true };
  }
  return { type: info.type, angle: info.angle, inferred: false };
}

export function lockPrerequisites() {
  const secure = isSecureContextSafe();
  const fs = fullscreenInfo();
  return {
    secure,
    fullscreenActive: fs.active,
    fullscreenSupported: fs.supported,
    note: fs.supported && !fs.active ? '桌面浏览器通常需要先进入全屏才能锁定方向' : '',
  };
}
