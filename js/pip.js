// 画中画能力：
// 1) 用 canvas + captureStream 生成一个无需联网的演示视频（带动态时钟）；
// 2) 进入 / 退出画中画；不支持时降级为普通弹窗（window.open，被拦截则页面内弹窗）。

import { pipInfo, isSecureContextSafe } from './env.js';
import { attempt, openModal } from './util.js';

const videoEl = () => document.getElementById('pip-video');

let stream = null;
let rafId = 0;
let prepared = false;

export function isPrepared() {
  return prepared;
}

/** 生成演示视频流并绑定到 <video>，返回 {ok,... } */
export async function prepareDemoVideo() {
  if (prepared && stream) {
    return { ok: true, kind: 'success', status: 'success', message: '演示视频已就绪', value: true };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  const draw = () => {
    ctx.fillStyle = '#101725';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#4f8cff';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('画中画演示', canvas.width / 2, 120);
    ctx.fillStyle = '#e6ebf5';
    ctx.font = '40px ui-monospace, Menlo, monospace';
    ctx.fillText(new Date().toLocaleTimeString(), canvas.width / 2, 220);
    ctx.fillStyle = '#93a0b5';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('这段视频由 canvas.captureStream 实时生成', canvas.width / 2, 300);
    rafId = requestAnimationFrame(draw);
  };
  draw();

  if (typeof canvas.captureStream !== 'function') {
    cancelAnimationFrame(rafId);
    return {
      ok: false, kind: 'unsupported', status: 'unsupported',
      message: '当前浏览器不支持 canvas.captureStream，无法生成演示视频',
      fallback: '可将 <video> 换成带 src 的真实视频后再试画中画',
    };
  }

  stream = canvas.captureStream(30);
  const video = videoEl();
  video.srcObject = stream;
  video.muted = true; // 静音以满足自动播放策略

  try {
    await video.play();
  } catch (err) {
    return {
      ok: false, kind: 'blocked', status: 'blocked',
      message: `视频播放被浏览器阻止：${err.message || err.name}（请通过点击按钮重试）`,
      fallback: '点击“准备演示视频”按钮后再进入画中画',
      error: err,
    };
  }

  // 等待至少一帧数据，避免 requestPictureInPicture 抛 InvalidStateError
  await new Promise((resolve) => {
    if (video.readyState >= 2) { resolve(); return; }
    video.addEventListener('loadeddata', () => resolve(), { once: true });
    setTimeout(resolve, 1500);
  });

  prepared = true;
  return { ok: true, kind: 'success', status: 'success', message: '演示视频已开始播放，可以进入画中画', value: true };
}

export function pipActive() {
  return !!pipInfo().activeElement;
}

export async function enterPip() {
  if (!isSecureContextSafe()) {
    return {
      ok: false, kind: 'insecure', status: 'insecure',
      message: '当前为非安全上下文，画中画要求 HTTPS 或 localhost',
      fallback: '请通过 HTTPS 访问本站点',
    };
  }

  const info = pipInfo();
  if (!info.supported) {
    return {
      ok: false, kind: 'unsupported', status: 'unsupported',
      message: info.reason,
      fallback: '已降级为普通弹窗展示内容',
      degrade: 'popup',
    };
  }

  const video = videoEl();
  if (!prepared || !video.srcObject) {
    return {
      ok: false, kind: 'blocked', status: 'blocked',
      message: '视频尚未准备：请先点击“1. 准备演示视频”',
      fallback: '画中画需要一个正在播放、且已有画面数据的视频元素',
    };
  }
  if (info.activeElement) {
    return { ok: true, kind: 'success', status: 'success', message: '画中画窗口已打开', value: true };
  }
  if (video.paused) {
    try { await video.play(); } catch { /* 忽略，浏览器可能在下方给出更准确的错误 */ }
  }

  const result = await attempt(() => Promise.resolve(info.enter(video)), {
    fallbackMessage: '进入画中画失败：请确认由用户手势触发，且视频正在播放',
  });

  // 权限策略（Permissions-Policy: picture-in-picture=()）会导致 SecurityError
  if (!result.ok && result.errorName === 'SecurityError' && /policy|disabled|allow/i.test(result.message)) {
    result.kind = 'denied';
    result.status = 'denied';
    result.message = '页面的 Permissions-Policy 禁止了画中画（picture-in-picture 被禁用）';
    result.fallback = '已降级为普通弹窗展示内容';
    result.degrade = 'popup';
  }
  return result;
}

export async function exitPip() {
  const info = pipInfo();
  if (!info.supported) {
    return {
      ok: false, kind: 'unsupported', status: 'unsupported',
      message: info.reason,
      fallback: '原生画中画不可用，无需退出（请关闭降级弹窗）',
    };
  }
  if (!info.activeElement) {
    return { ok: true, kind: 'success', status: 'success', message: '当前没有画中画窗口，无需退出', value: true };
  }
  return attempt(() => Promise.resolve(info.exit()), {
    fallbackMessage: '退出画中画失败：可直接点击画中画窗口上的关闭按钮',
  });
}

/**
 * 降级：普通弹窗。先尝试 window.open；被浏览器拦截时退化为页面内模态弹窗。
 */
export function fallbackPopup() {
  let win = null;
  try {
    win = window.open('', 'pip-fallback', 'width=420,height=260,resizable=yes');
  } catch {
    win = null;
  }
  if (win) {
    win.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>画中画降级弹窗</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1420;color:#e6ebf5;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}</style></head>
<body><div><h2>普通弹窗（降级）</h2><p>当前浏览器不支持或拒绝了画中画，<br>内容改由普通窗口展示。</p>
<p id="t"></p></div><script>setInterval(function(){document.getElementById('t').textContent=new Date().toLocaleTimeString()},1000);<\/script>
</body></html>`);
    return { mode: 'window', ok: true };
  }
  openModal(
    '画中画降级：页面内弹窗',
    '浏览器不支持画中画，且拦截了 window.open 弹窗，因此使用页面内弹窗承载内容。可检查浏览器的弹窗拦截设置。'
  );
  return { mode: 'modal', ok: true };
}
