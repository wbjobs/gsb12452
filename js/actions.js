// 动作层：前置条件检查 + 调用 API + 异常归类，不直接操作 DOM 状态
import {
  env, fullscreen, orientation, pip,
  hasTransientActivation, makeError
} from './capabilities.js';
import { classifyError, classifyExitError } from './errors.js';

function fail(capability, err) {
  const classified = classifyError(err, capability);
  return { ok: false, capability, classified };
}

function ok(capability, detail) {
  return { ok: true, capability, detail };
}

/* 画中画降级：普通弹窗（弹窗页自带同一段 canvas 动画） */
export function openPopupFallback(targetLabel) {
  const params = new URLSearchParams({ target: targetLabel || 'pip' });
  const w = window.open(
    `popup.html?${params.toString()}`,
    'screen-cap-popup',
    'popup=yes,width=560,height=360,resizable=yes,scrollbars=no'
  );
  if (!w) {
    return { opened: false, blocked: true };
  }
  return { opened: true, win: w };
}

/* ---------------- 全屏 ---------------- */

export async function toggleFullscreen(stageEl) {
  if (!env.secure) {
    return fail('fullscreen', makeError('SecurityError', '非安全上下文：secure context required'));
  }
  if (!hasTransientActivation()) {
    return fail('fullscreen', makeError(
      'NotAllowedError',
      'requestFullscreen 必须由用户手势触发（user activation 已过期）'
    ));
  }
  if (!fullscreen.supported()) {
    return fail('fullscreen', makeError('NotSupportedError', 'Fullscreen API 不可用'));
  }

  try {
    if (fullscreen.isActive()) {
      await fullscreen.exit();
      return ok('fullscreen', '已退出全屏');
    }
    await fullscreen.request(stageEl || document.documentElement);
    return ok('fullscreen', '已进入全屏');
  } catch (err) {
    return fail('fullscreen', err);
  }
}

// 退出全屏异常的独立入口（由 change 事件异常场景 / 外部调用）
export async function safeExitFullscreen() {
  try {
    if (fullscreen.isActive()) await fullscreen.exit();
    return { ok: true };
  } catch (err) {
    return { ok: false, classified: classifyExitError(err) };
  }
}

/* ---------------- 方向锁定 ---------------- */

const MODE_LABEL = {
  landscape: '横屏',
  'landscape-primary': '横屏',
  portrait: '竖屏',
  'portrait-primary': '竖屏'
};

export function modeLabel(mode) {
  return MODE_LABEL[mode] || mode;
}

export async function lockOrientation(mode, stageEl) {
  if (!env.secure) {
    return fail('orientation', makeError('SecurityError', '非安全上下文：secure context required'));
  }
  if (!hasTransientActivation()) {
    return fail('orientation', makeError(
      'NotAllowedError',
      'orientation.lock 必须由用户手势触发（user activation 已过期）'
    ));
  }
  if (!orientation.supported()) {
    // 不支持：直接给出手动旋转降级，不调用以免抛错
    return fail('orientation', makeError('NotSupportedError', 'Screen Orientation lock 不可用'));
  }

  try {
    // 多数移动浏览器要求锁定时页面处于全屏：先尽力进入全屏（失败不阻断，锁本身会给出真实错误）
    if (!fullscreen.isActive() && fullscreen.supported()) {
      try {
        await fullscreen.request(stageEl || document.documentElement);
      } catch {
        /* 全屏失败时仍尝试 lock，由 lock 抛出真实原因 */
      }
    }
    await orientation.lock(mode);
    return ok('orientation', `已锁定为${modeLabel(mode)}`);
  } catch (err) {
    return fail('orientation', err);
  }
}

export async function unlockOrientation() {
  if (!orientation.supported()) {
    return fail('orientation', makeError('NotSupportedError', 'Screen Orientation lock 不可用'));
  }
  try {
    await orientation.unlock();
    return ok('orientation', '已解除方向锁定');
  } catch (err) {
    return fail('orientation', err);
  }
}

/* ---------------- 画中画 ---------------- */

export async function togglePip(videoEl) {
  if (!env.secure) {
    return fail('pip', makeError('SecurityError', '非安全上下文：secure context required'));
  }
  if (!hasTransientActivation()) {
    return fail('pip', makeError(
      'NotAllowedError',
      'requestPictureInPicture 必须由用户手势触发（user activation 已过期）'
    ));
  }
  if (!pip.supported()) {
    return fail('pip', makeError('NotSupportedError', 'Picture-in-Picture API 不可用'));
  }
  if (!videoEl || !videoEl.srcObject) {
    return fail('pip', makeError('InvalidStateError', '演示视频流尚未就绪（video.srcObject 为空）'));
  }

  try {
    if (pip.isActive()) {
      await pip.exit();
      return ok('pip', '已退出画中画');
    }
    // 部分浏览器要求视频处于播放状态
    if (videoEl.readyState >= 2 && videoEl.paused) {
      try { await videoEl.play(); } catch { /* play 失败仍尝试请求 PiP */ }
    }
    await pip.request(videoEl);
    return ok('pip', '已进入画中画');
  } catch (err) {
    return fail('pip', err);
  }
}
