// 入口：环境检测、权限查询、状态渲染、事件编排、历史记录、降级策略

import { isSecureContextSafe, fullscreenInfo, orientationInfo, pipInfo } from './env.js';
import { queryPermission, PERM_LABELS } from './permissions.js';
import { addHistory, listHistory, clearHistory } from './history.js';
import { enterFullscreen, exitFullscreen } from './fullscreen.js';
import {
  lockOrientation, unlockOrientation, currentOrientation, lockPrerequisites,
} from './orientation.js';
import {
  prepareDemoVideo, enterPip, exitPip, pipActive, fallbackPopup, isPrepared,
} from './pip.js';
import {
  attempt, classifyError, toast, openModal, closeModal, showRotateHint, hideRotateHint,
  hasTransientActivation, formatTime,
} from './util.js';

const $ = (id) => document.getElementById(id);

const RESULT_LABELS = {
  success: ['成功', 'res-ok'],
  denied: ['权限被拒', 'res-denied'],
  blocked: ['未交互/被阻止', 'res-blocked'],
  unsupported: ['不支持', 'res-unsupported'],
  insecure: ['非安全上下文', 'res-error'],
  fallback: ['已降级', 'res-fallback'],
  error: ['错误', 'res-error'],
};

const state = {
  perms: { fullscreen: null, orientation: null, pip: null },
};

/* ---------------- 顶部环境徽章 ---------------- */

function renderEnv() {
  const secure = isSecureContextSafe();
  const secureBadge = $('badge-secure');
  secureBadge.textContent = `安全上下文：${secure ? '是 ✅' : '否 ⚠️ 需要 HTTPS / localhost'}`;
  secureBadge.className = `badge ${secure ? 'ok' : 'err'}`;

  const onlineBadge = $('badge-online');
  const online = navigator.onLine;
  onlineBadge.textContent = `在线状态：${online ? '在线' : '离线（不影响本地能力）'}`;
  onlineBadge.className = `badge ${online ? 'ok' : 'warn'}`;

  updateGestureBadge();
}

function updateGestureBadge() {
  const active = hasTransientActivation();
  const badge = $('badge-gesture');
  if (active === 'unknown') {
    badge.textContent = '用户交互：不可探测（由浏览器裁决）';
    badge.className = 'badge warn';
  } else {
    badge.textContent = `用户交互（瞬时激活）：${active ? '是 ✅' : '否'}`;
    badge.className = `badge ${active ? 'ok' : 'warn'}`;
  }
}

/* ---------------- 通用渲染辅助 ---------------- */

function setDot(id, tone) {
  $(id).className = `dot ${tone}`;
}
function setError(id, result) {
  if (result && !result.ok) {
    $(id).textContent = `${result.errorName ? result.errorName + '：' : ''}${result.message}`;
  } else {
    $(id).textContent = '无';
  }
}
function renderPerm(elId, perm) {
  const el = $(elId);
  if (!perm) { el.textContent = '检测中…'; return; }
  if (perm.supported) {
    el.textContent = PERM_LABELS[perm.state] || perm.state;
    el.className = perm.state === 'denied' ? 'warn' : '';
  } else {
    el.textContent = PERM_LABELS.unknown;
    el.title = perm.message;
  }
}

/* ---------------- 各能力静态条件 ---------------- */

function renderFullscreenConditions() {
  const info = fullscreenInfo();
  const secure = isSecureContextSafe();
  $('fs-cond').textContent = !secure
    ? '需要安全上下文（HTTPS 或 localhost）；需要用户手势触发'
    : info.supported
      ? '支持。需要由用户手势（点击）触发，部分浏览器要求页面未被 Permissions-Policy 禁用'
      : '浏览器不提供 Fullscreen API';
  $('fs-fallback').textContent = '提示用户使用浏览器菜单 / F11 手动全屏；iOS 上使用视频内全屏按钮';
}

function renderOrientationConditions() {
  const info = orientationInfo();
  const secure = isSecureContextSafe();
  const pre = lockPrerequisites();
  const parts = [];
  parts.push(secure ? '安全上下文 ✅' : '需要安全上下文（HTTPS / localhost）');
  parts.push(info.lockSupported ? 'screen.orientation.lock 可用 ✅' : 'screen.orientation.lock 不可用');
  if (pre.note) parts.push(pre.note);
  parts.push('需要用户手势触发');
  $('ori-cond').innerHTML = '';
  $('ori-cond').textContent = parts.join('；');
  $('ori-fallback').textContent = '不支持 / 锁定失败时降级为全屏旋转提示遮罩，引导用户手动旋转设备';
}

function renderPipConditions() {
  const info = pipInfo();
  const secure = isSecureContextSafe();
  const parts = [];
  parts.push(secure ? '安全上下文 ✅' : '需要安全上下文（HTTPS / localhost）');
  parts.push(info.supported ? '画中画 API 可用 ✅' : '画中画 API 不可用');
  parts.push('需要一个正在播放、且已有画面的 <video>');
  parts.push('需要用户手势触发');
  $('pip-cond').textContent = parts.join('；');
  $('pip-fallback').textContent = '不支持 / 被策略禁用时降级为 window.open 普通弹窗；弹窗被拦截则使用页面内模态弹窗';
}

/* ---------------- 动态状态 ---------------- */

function renderFullscreenState() {
  const info = fullscreenInfo();
  $('fs-state').textContent = !info.supported
    ? '浏览器不支持'
    : info.active ? '● 全屏中' : '○ 已退出全屏';
  setDot('fs-dot', info.active ? 'ok' : info.supported ? 'warn' : 'err');
  renderPerm('fs-perm', state.perms.fullscreen);
}

function renderOrientationState() {
  const info = orientationInfo();
  const cur = currentOrientation();
  $('ori-current').textContent = `${cur.type}（角度 ${cur.angle}°${cur.inferred ? '，按视口推断' : ''}）`;
  if (!info.lockSupported) {
    $('ori-state').textContent = '× 方向锁定不支持（可手动旋转）';
    setDot('ori-dot', 'err');
  } else {
    $('ori-state').textContent = '○ 方向锁定可用（当前未锁定）';
    setDot('ori-dot', 'warn');
  }
  renderPerm('ori-perm', state.perms.orientation);
}

function renderPipState() {
  const info = pipInfo();
  const active = info.supported && pipActive();
  $('pip-source').textContent = isPrepared() ? 'canvas 实时演示流（播放中）' : '未准备';
  $('pip-state').textContent = !info.supported
    ? '× 浏览器不支持画中画'
    : active ? '● 画中画窗口已打开' : '○ 未打开画中画';
  setDot('pip-dot', active ? 'ok' : info.supported ? 'warn' : 'err');
  renderPerm('pip-perm', state.perms.pip);
}

/* ---------------- 历史 ---------------- */

async function refreshHistory() {
  const records = await listHistory();
  const body = $('history-body');
  $('history-count').textContent = `共 ${records.length} 条（仅展示最近 ${Math.min(records.length, 200)} 条）`;
  if (records.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="hint">暂无记录</td></tr>';
    return;
  }
  body.textContent = '';
  for (const r of records) {
    const tr = document.createElement('tr');
    const [label, cls] = RESULT_LABELS[r.result] || [r.result, ''];
    tr.innerHTML =
      `<td>${formatTime(r.time)}</td>` +
      `<td>${featureLabel(r.feature)}</td>` +
      `<td>${escapeHtml(r.action)}</td>` +
      `<td class="${cls}">${label}</td>` +
      `<td>${escapeHtml(r.message || '')}</td>`;
    body.appendChild(tr);
  }
}
function featureLabel(f) {
  return ({ fullscreen: '全屏', orientation: '方向', pip: '画中画', system: '系统' })[f] || f;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** 统一的动作执行 + 结果提示 + 历史落库 */
async function runAction(feature, action, fn, { degradedResult } = {}) {
  const gesture = hasTransientActivation();
  // 能力模块自身会返回标准化结果对象；这里只做最后的 throw 兜底，
  // 不能用 attempt 包裹，否则 {ok:false} 的返回值会被误判为成功。
  let result;
  try {
    result = await fn();
    if (!result || typeof result.ok !== 'boolean') {
      result = { ok: true, status: 'success', kind: 'success', message: '操作成功' };
    }
  } catch (err) {
    const info = classifyError(err);
    result = { ok: false, status: info.kind, kind: info.kind, message: info.message, errorName: info.name };
  }
  let finalResult = result;
  let tone = result.ok ? 'ok' : 'err';

  if (!result.ok && degradedResult) {
    const degraded = await attempt(degradedResult.run);
    if (degraded.ok) {
      finalResult = {
        ok: true,
        kind: 'fallback',
        status: 'fallback',
        message: `${result.message} → 已执行降级：${degradedResult.label}`,
      };
      tone = 'warn';
    } else {
      finalResult.fallback = `${result.fallback || degradedResult.label}（降级也失败：${degraded.message}）`;
    }
  }

  await addHistory({
    feature,
    action,
    result: finalResult.status || (finalResult.ok ? 'success' : 'error'),
    message: finalResult.ok
      ? finalResult.message
      : `${finalResult.errorName ? finalResult.errorName + '：' : ''}${finalResult.message}` +
        (finalResult.fallback ? `｜降级建议：${finalResult.fallback}` : ''),
    fromGesture: gesture,
  });

  toast(finalResult.message + (finalResult.ok ? '' : (finalResult.fallback ? `（${finalResult.fallback}）` : '')), tone);
  renderAll();
  refreshHistory();
  return finalResult;
}

/* ---------------- 动作处理 ---------------- */

const actions = {
  'fs-enter': () => runAction('fullscreen', '申请进入全屏', () => enterFullscreen()),
  'fs-exit': () => runAction('fullscreen', '退出全屏', async () => {
    const result = await exitFullscreen();
    if (!result.ok && result.kind !== 'unsupported') {
      // 退出全屏异常：给出手动退出的明确指引，但不崩
      result.fallback = result.fallback || '请按 Esc 键，或切换到其他窗口后再试';
    }
    return result;
  }),

  'ori-lock-landscape': () => runAction('orientation', '锁定横屏', () => lockOrientation('landscape'), {
    degradedResult: { label: '显示手动旋转提示', run: () => { showRotateHint('landscape'); return Promise.resolve(); } },
  }),
  'ori-lock-portrait': () => runAction('orientation', '锁定竖屏', () => lockOrientation('portrait'), {
    degradedResult: { label: '显示手动旋转提示', run: () => { showRotateHint('portrait'); return Promise.resolve(); } },
  }),
  'ori-unlock': () => runAction('orientation', '解除方向锁定', () => unlockOrientation()),

  'pip-prepare': () => runAction('pip', '准备演示视频', () => prepareDemoVideo()),
  'pip-enter': () => runAction('pip', '申请进入画中画', () => enterPip(), {
    degradedResult: { label: '打开普通弹窗', run: () => fallbackPopup() },
  }),
  'pip-exit': () => runAction('pip', '退出画中画', () => exitPip()),

  'history-refresh': () => refreshHistory().then(() => toast('历史已刷新', 'ok')),
  'history-clear': async () => {
    await clearHistory();
    toast('历史已清空', 'warn');
    refreshHistory();
  },

  // —— 无用户交互上下文测试（setTimeout 回调中没有瞬时激活）——
  'test-fs': () => testWithoutGesture('fullscreen', '无交互尝试进入全屏', () => enterFullscreen()),
  'test-ori': () => testWithoutGesture('orientation', '无交互尝试锁定横屏',
    () => lockOrientation('landscape'),
    { label: '显示手动旋转提示', run: () => { showRotateHint('landscape'); return Promise.resolve(); } }),
  'test-pip': () => testWithoutGesture('pip', '无交互尝试进入画中画', async () => {
    const prep = await prepareDemoVideo();
    if (!prep.ok) return prep;
    return enterPip();
  }, { label: '打开普通弹窗', run: () => fallbackPopup() }),
  'test-all': async () => {
    await actions['test-fs']();
    await actions['test-ori']();
    await actions['test-pip']();
  },
};

/**
 * 在无瞬时激活的回调中执行能力调用：
 * 按钮点击的激活会在 await setTimeout(300) 后过期（Chrome 窗口约 5s，这里用 6s 保守等待）。
 * 整个链路全部被 attempt 包裹，任何异常都不会导致页面崩溃。
 */
async function testWithoutGesture(feature, label, fn, degraded) {
  toast('将在 6 秒后于“无用户交互”上下文中发起调用（期间请勿操作页面）…', 'warn');
  await addHistory({
    feature: 'system', action: label, result: 'blocked',
    message: '测试开始：等待用户瞬时激活过期后再发起调用', fromGesture: true,
  });
  refreshHistory();

  setTimeout(() => {
    runAction(feature, label, fn, degraded ? { degradedResult: degraded } : undefined);
  }, 6000);
}

/* ---------------- 初始化 ---------------- */

function renderAll() {
  renderEnv();
  renderFullscreenConditions();
  renderOrientationConditions();
  renderPipConditions();
  renderFullscreenState();
  renderOrientationState();
  renderPipState();
}

async function queryAllPermissions() {
  // 三个能力的权限名都可能不被浏览器支持，逐个独立查询、互不影响
  const [fullscreen, orientation, pip] = await Promise.all([
    queryPermission('fullscreen'),
    queryPermission('orientation-lock'),
    queryPermission('picture-in-picture'),
  ]);
  state.perms.fullscreen = fullscreen;
  state.perms.orientation = orientation;
  state.perms.pip = pip;
  renderFullscreenState();
  renderOrientationState();
  renderPipState();
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    const handler = actions[btn.dataset.action];
    if (handler) {
      // 点击本身就是用户手势；handler 内部若先 await 再调用 API 会丢失激活（test 场景故意如此）
      attempt(handler);
    }
  });

  // 手势徽章：各类用户输入都刷新一次（仅读取，不改变行为）
  ['pointerdown', 'keydown', 'touchstart'].forEach((type) => {
    window.addEventListener(type, () => updateGestureBadge(), { passive: true });
  });

  document.addEventListener('fullscreenchange', () => renderFullscreenState());
  document.addEventListener('webkitfullscreenchange', () => renderFullscreenState());
  document.addEventListener('MSFullscreenChange', () => renderFullscreenState());

  const so = orientationInfo().instance;
  if (so && typeof so.addEventListener === 'function') {
    so.addEventListener('change', () => renderOrientationState());
  }
  window.addEventListener('resize', () => renderOrientationState());

  document.addEventListener('enterpictureinpicture', () => renderPipState());
  document.addEventListener('leavepictureinpicture', () => renderPipState());

  window.addEventListener('online', renderEnv);
  window.addEventListener('offline', renderEnv);

  $('rotate-dismiss').addEventListener('click', hideRotateHint);
  $('modal-close').addEventListener('click', closeModal);
  $('fallback-modal').addEventListener('click', (e) => {
    if (e.target === $('fallback-modal')) closeModal();
  });
}

async function init() {
  renderAll();
  bindEvents();
  // 权限查询与历史加载失败都不影响页面主功能
  attempt(queryAllPermissions);
  attempt(refreshHistory);

  if (!isSecureContextSafe()) {
    openModal(
      '非安全上下文',
      '当前页面不是通过 HTTPS 或 localhost 访问，全屏 / 方向锁定 / 画中画等能力可能被浏览器整体禁用。请改用 HTTPS 部署，或在本机以 localhost 打开。'
    );
    await addHistory({
      feature: 'system', action: '环境检测', result: 'insecure',
      message: '非安全上下文：window.isSecureContext === false', fromGesture: false,
    });
    refreshHistory();
  }
}

// 顶层再包一层安全网：初始化过程出现任何意外错误也只提示、不白屏
init().catch((err) => {
  toast(`初始化异常（已兜底，页面仍可使用）：${err && err.message ? err.message : err}`, 'err');
});
