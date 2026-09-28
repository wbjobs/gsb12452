// 入口：环境检测、权限状态、事件绑定、历史渲染
import {
  env, fullscreen, orientation, pip, queryPermission
} from './capabilities.js';
import {
  toggleFullscreen, lockOrientation, unlockOrientation,
  togglePip, openPopupFallback, modeLabel
} from './actions.js';
import { addHistory, getHistory, clearHistory, getStorageMode } from './db.js';
import { toast, renderPill, setReason, showRotateModal, startStageSource } from './ui.js';

const $ = (id) => document.getElementById(id);

const els = {
  insecureBanner: $('insecureBanner'),
  stage: $('stage'),
  pipCanvas: $('pipCanvas'),
  pipVideo: $('pipVideo'),
  stageHint: $('stageHint'),
  envStatus: $('envStatus'),
  noGestureDemo: $('noGestureDemo'),

  fsPermPill: $('fsPermPill'),
  fsState: $('fsState'),
  fsReason: $('fsReason'),
  fsFallback: $('fsFallback'),
  fsToggle: $('fsToggle'),

  oriPermPill: $('oriPermPill'),
  oriState: $('oriState'),
  oriLockState: $('oriLockState'),
  oriReason: $('oriReason'),
  oriFallback: $('oriFallback'),
  oriLockLandscape: $('oriLockLandscape'),
  oriLockPortrait: $('oriLockPortrait'),
  oriUnlock: $('oriUnlock'),

  pipPermPill: $('pipPermPill'),
  pipState: $('pipState'),
  pipReason: $('pipReason'),
  pipFallback: $('pipFallback'),
  pipToggle: $('pipToggle'),
  pipPopupFallback: $('pipPopupFallback'),

  historyStorage: $('historyStorage'),
  historyClear: $('historyClear'),
  historyList: $('historyList')
};

// 本地维护“方向锁定”状态（API 无直接查询接口）
let orientationLocked = false;
let fullscreenPermStatus = null;
let pipPermStatus = null;

/* ---------------- 历史 ---------------- */

const OUTCOME_META = {
  success: { cls: 'tag-success', label: '成功' },
  fail: { cls: 'tag-fail', label: '失败' },
  fallback: { cls: 'tag-fallback', label: '降级' },
  info: { cls: 'tag-info', label: '信息' }
};

const CAP_LABEL = {
  fullscreen: '全屏',
  orientation: '方向锁定',
  pip: '画中画',
  system: '系统'
};

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function logEvent(capability, action, outcome, detail) {
  try {
    await addHistory({ capability, action, outcome, detail });
  } catch (err) {
    console.warn('[history] 记录失败：', err);
  }
  renderHistory();
}

async function renderHistory() {
  const records = await getHistory();
  els.historyList.innerHTML = '';
  if (!records.length) {
    const li = document.createElement('li');
    li.className = 'history-empty';
    li.textContent = '暂无操作记录';
    els.historyList.appendChild(li);
  } else {
    records.forEach((r) => {
      const li = document.createElement('li');
      const time = document.createElement('span');
      time.className = 't';
      time.textContent = fmtTime(r.time);
      const tag = document.createElement('span');
      const meta = OUTCOME_META[r.outcome] || OUTCOME_META.info;
      tag.className = `tag ${meta.cls}`;
      tag.textContent = meta.label;
      const body = document.createElement('span');
      body.textContent = `[${CAP_LABEL[r.capability] || r.capability}] ${r.action}${
        r.detail ? ` — ${r.detail}` : ''
      }`;
      li.append(time, tag, body);
      els.historyList.appendChild(li);
    });
  }
  const mode = getStorageMode();
  els.historyStorage.textContent = mode === 'indexeddb'
    ? '存储：IndexedDB（持久化）'
    : '存储：内存（IndexedDB 不可用，刷新即失）';
}

/* ---------------- 状态渲染 ---------------- */

function renderEnvironment() {
  const rows = [
    ['安全上下文', env.secure ? '是（能力可用）' : '否（能力被禁用，仅降级可用）'],
    ['页面地址', env.url],
    ['Fullscreen API', fullscreen.supported() ? '支持' : '不支持'],
    ['Orientation 锁定', orientation.supported() ? '支持 lock()' : '不支持（可读取方向）'],
    ['Picture-in-Picture', pip.supported() ? '支持' : '不支持'],
    ['Permissions API', navigator.permissions ? '支持查询' : '不支持'],
    ['IndexedDB', typeof indexedDB !== 'undefined' ? '可用' : '不可用（历史降级内存）']
  ];
  const esc = (str) => String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  els.envStatus.innerHTML = rows
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join('');

  els.insecureBanner.hidden = env.secure;
  if (!env.secure) {
    [els.fsFallback, els.oriFallback, els.pipFallback].forEach((el) => { el.hidden = false; });
  }
}

function renderFullscreenState() {
  const active = fullscreen.isActive();
  els.fsState.textContent = active
    ? `全屏中（元素：${fullscreen.element.id || fullscreen.element.tagName.toLowerCase()}）`
    : '未全屏';
  els.fsToggle.textContent = active ? '退出全屏' : '申请全屏';
}

function renderOrientationState() {
  const o = orientation.readSupported()
    ? `${orientation.type}（${orientation.angle}°）`
    : '无法读取（Screen Orientation API 缺失）';
  els.oriState.textContent = o;
  els.oriLockState.textContent = orientationLocked ? '已锁定' : '未锁定';
  els.oriUnlock.disabled = !orientationLocked || !orientation.supported();
}

function renderPipState() {
  els.pipState.textContent = pip.isActive() ? '画中画播放中' : '未开启';
  els.pipToggle.textContent = pip.isActive() ? '退出画中画' : '申请画中画';
}

function permText(state, supportedLabel) {
  switch (state) {
    case 'granted': return '权限：已授予';
    case 'prompt': return `权限：默认（每次需手势${supportedLabel}）`;
    case 'denied': return '权限：已被拒绝';
    case 'unsupported': return '权限：无法查询';
    default: return '权限：状态未知';
  }
}

function renderPermissionPills() {
  // 全屏：优先用 Permissions API 实测；拿不到时依据 secure/support 推导
  if (fullscreenPermStatus && fullscreenPermStatus.supported) {
    renderPill(els.fsPermPill, fullscreenPermStatus.state, permText(fullscreenPermStatus.state, ''));
  } else if (!env.secure) {
    renderPill(els.fsPermPill, 'denied', '权限：非安全上下文，不可用');
  } else if (fullscreen.supported()) {
    renderPill(els.fsPermPill, 'prompt', '权限：默认（点击即请求，无持久授权）');
  } else {
    renderPill(els.fsPermPill, 'unsupported', '权限：API 不支持');
  }

  // 方向锁定没有标准化的 Permissions 名称
  if (!env.secure) {
    renderPill(els.oriPermPill, 'denied', '权限：非安全上下文，不可用');
  } else if (orientation.supported()) {
    renderPill(els.oriPermPill, 'prompt', '权限：默认（点击即请求，常需全屏）');
  } else {
    renderPill(els.oriPermPill, 'unsupported', '权限：不可查询/不支持');
  }

  // 画中画：Chromium 暴露 'picture-in-picture' 权限名
  if (pipPermStatus && pipPermStatus.supported) {
    renderPill(els.pipPermPill, pipPermStatus.state, permText(pipPermStatus.state, ''));
  } else if (!env.secure) {
    renderPill(els.pipPermPill, 'denied', '权限：非安全上下文，不可用');
  } else if (pip.supported()) {
    renderPill(els.pipPermPill, 'prompt', '权限：默认（点击即请求）');
  } else {
    renderPill(els.pipPermPill, 'unsupported', '权限：无法查询/不支持');
  }
}

/* ---------------- 失败统一处理 ---------------- */

// capability 失败：展示原因、执行/提示降级、写历史、弹 toast
function handleFailure(result, action, fallbackKind) {
  const { classified } = result;
  const reasonText = `${classified.reason}｜建议：${classified.advice}`;

  if (result.capability === 'fullscreen') setReason(els.fsReason, reasonText);
  if (result.capability === 'orientation') setReason(els.oriReason, reasonText);
  if (result.capability === 'pip') setReason(els.pipReason, reasonText);

  toast(classified.reason, 'error');
  logEvent(result.capability, action, 'fail', classified.reason);

  const kind = fallbackKind || classified.fallback;

  if (kind === 'rotate') {
    const label = action.includes('横屏') ? '横屏' : action.includes('竖屏') ? '竖屏' : '目标方向';
    els.oriFallback.hidden = false;
    showRotateModal(label);
    logEvent('orientation', '降级：手动旋转提示', 'fallback', `请手动旋转到${label}`);
  } else if (kind === 'popup') {
    els.pipFallback.hidden = false;
    const popup = openPopupFallback('pip');
    if (popup.opened) {
      toast('画中画不可用，已用普通弹窗替代', 'warn');
      logEvent('pip', '降级：普通弹窗', 'fallback', '已打开独立小窗');
    } else {
      toast('弹窗也被浏览器拦截，请允许本站弹窗后重试', 'error');
      logEvent('pip', '降级：普通弹窗', 'fail', '弹窗被拦截');
    }
  } else {
    els.fsFallback.hidden = false;
    logEvent(result.capability, '降级提示', 'fallback', classified.advice);
  }
}

function clearReason(capability) {
  if (capability === 'fullscreen') setReason(els.fsReason, '');
  if (capability === 'orientation') setReason(els.oriReason, '');
  if (capability === 'pip') setReason(els.pipReason, '');
}

function markBusy(button, busy) {
  button.classList.toggle('is-busy', busy);
  button.disabled = busy;
}

/* ---------------- 按钮处理 ---------------- */

async function onFullscreen() {
  clearReason('fullscreen');
  markBusy(els.fsToggle, true);
  const result = await toggleFullscreen(els.stage);
  markBusy(els.fsToggle, false);
  if (result.ok) {
    toast(result.detail, 'success');
    logEvent('fullscreen', result.detail.includes('退出') ? '退出全屏' : '进入全屏', 'success', result.detail);
  } else {
    handleFailure(result, '申请全屏');
  }
  renderFullscreenState();
}

async function onLock(mode) {
  clearReason('orientation');
  const btn = mode.startsWith('landscape') ? els.oriLockLandscape : els.oriLockPortrait;
  markBusy(btn, true);
  const result = await lockOrientation(mode, els.stage);
  markBusy(btn, false);
  if (result.ok) {
    orientationLocked = true;
    toast(result.detail, 'success');
    logEvent('orientation', `锁定${modeLabel(mode)}`, 'success', result.detail);
  } else {
    handleFailure(result, `锁定${modeLabel(mode)}`);
  }
  renderOrientationState();
}

async function onUnlock() {
  clearReason('orientation');
  const result = await unlockOrientation();
  if (result.ok) {
    orientationLocked = false;
    toast(result.detail, 'success');
    logEvent('orientation', '解除锁定', 'success', result.detail);
  } else {
    handleFailure(result, '解除锁定', 'rotate');
  }
  renderOrientationState();
}

async function onPip() {
  clearReason('pip');
  markBusy(els.pipToggle, true);
  const result = await togglePip(els.pipVideo);
  markBusy(els.pipToggle, false);
  if (result.ok) {
    toast(result.detail, 'success');
    logEvent('pip', result.detail.includes('退出') ? '退出画中画' : '进入画中画', 'success', result.detail);
  } else {
    handleFailure(result, '申请画中画');
  }
  renderPipState();
}

function onPopupFallback() {
  const popup = openPopupFallback('pip');
  if (popup.opened) {
    els.pipFallback.hidden = false;
    toast('已打开普通弹窗作为画中画替代', 'warn');
    logEvent('pip', '手动降级：普通弹窗', 'fallback', '用户主动选择弹窗方案');
  } else {
    toast('弹窗被浏览器拦截，请在地址栏允许本站弹窗', 'error');
    logEvent('pip', '手动降级：普通弹窗', 'fail', '弹窗被拦截');
  }
}

/* 模拟“用户未交互”：延迟超过用户激活有效期后再调用，按钮回调本身已无激活态 */
function onNoGestureDemo() {
  const seconds = 6;
  let left = seconds;
  const btn = els.noGestureDemo;
  btn.disabled = true;
  btn.textContent = `请勿点击页面，${left} 秒后尝试调用三个能力…`;
  logEvent('system', '开始模拟未交互场景', 'info', `${seconds} 秒后触发`);
  const timer = setInterval(() => {
    left -= 1;
    if (left > 0) {
      btn.textContent = `请勿点击页面，${left} 秒后尝试调用三个能力…`;
    }
  }, 1000);

  setTimeout(async () => {
    clearInterval(timer);
    btn.disabled = false;
    btn.textContent = '模拟「用户未交互」场景（6 秒后尝试调用，期间请勿点击）';

    const fs = await toggleFullscreen(els.stage);
    if (!fs.ok) {
      setReason(els.fsReason, `[未交互] ${fs.classified.reason}｜建议：${fs.classified.advice}`);
      toast('[未交互] 全屏被拒绝（符合预期）', 'warn');
      logEvent('fullscreen', '未交互调用', 'fail', fs.classified.reason);
    }

    const ori = await lockOrientation('landscape', els.stage);
    if (!ori.ok) {
      setReason(els.oriReason, `[未交互] ${ori.classified.reason}｜建议：${ori.classified.advice}`);
      toast('[未交互] 方向锁定被拒绝（符合预期）', 'warn');
      logEvent('orientation', '未交互调用', 'fail', ori.classified.reason);
    }

    const pi = await togglePip(els.pipVideo);
    if (!pi.ok) {
      setReason(els.pipReason, `[未交互] ${pi.classified.reason}｜建议：${pi.classified.advice}`);
      toast('[未交互] 画中画被拒绝（符合预期）', 'warn');
      logEvent('pip', '未交互调用', 'fail', pi.classified.reason);
    }
  }, seconds * 1000);
}

/* ---------------- 初始化 ---------------- */

async function loadPermissions() {
  // 全屏
  fullscreenPermStatus = await queryPermission('fullscreen');
  if (fullscreenPermStatus.status) {
    fullscreenPermStatus.status.onchange = () => {
      fullscreenPermStatus.state = fullscreenPermStatus.status.state;
      renderPermissionPills();
    };
  }
  // 画中画（Chromium）
  pipPermStatus = await queryPermission('picture-in-picture');
  if (pipPermStatus.status) {
    pipPermStatus.status.onchange = () => {
      pipPermStatus.state = pipPermStatus.status.state;
      renderPermissionPills();
    };
  }
  renderPermissionPills();
}

function bindEvents() {
  els.fsToggle.addEventListener('click', onFullscreen);
  els.oriLockLandscape.addEventListener('click', () => onLock('landscape'));
  els.oriLockPortrait.addEventListener('click', () => onLock('portrait-primary'));
  els.oriUnlock.addEventListener('click', onUnlock);
  els.pipToggle.addEventListener('click', onPip);
  els.pipPopupFallback.addEventListener('click', onPopupFallback);
  els.noGestureDemo.addEventListener('click', onNoGestureDemo);
  els.historyClear.addEventListener('click', async () => {
    await clearHistory();
    renderHistory();
    toast('历史已清空', 'info');
  });

  fullscreen.onChange(() => {
    renderFullscreenState();
    // 移动端退出全屏时系统会自动解除方向锁定，同步本地状态
    if (!fullscreen.isActive() && orientationLocked) {
      orientationLocked = false;
      renderOrientationState();
      logEvent('orientation', '方向锁定自动解除', 'info', '退出全屏导致系统释放锁定');
    }
  });
  orientation.onChange(() => {
    renderOrientationState();
    logEvent('orientation', '方向变化', 'info', orientation.type);
  });
  pip.onChange(() => {
    renderPipState();
    if (!pip.isActive()) {
      // 离开画中画（含用户点系统按钮），锁定状态同步
      logEvent('pip', '画中画已关闭', 'info', '由浏览器/用户触发');
    }
  });

  // 退出全屏异常兜底：监听按键 Esc 后的失败状态由各浏览器自行处理，
  // 这里监听 visibilitychange 时做一次安全检查，避免崩溃
  document.addEventListener('visibilitychange', () => {
    if (!fullscreen.isActive()) renderFullscreenState();
  });
}

async function init() {
  try {
    renderEnvironment();
    renderFullscreenState();
    renderOrientationState();
    renderPipState();

    startStageSource(els.pipCanvas, els.pipVideo);
    bindEvents();
    await renderHistory();
    await loadPermissions();

    logEvent('system', '页面初始化', 'info',
      env.secure ? '安全上下文' : '非安全上下文（降级模式）');
  } catch (err) {
    // 任何初始化异常都不能让页面崩掉
    console.error('[init] 初始化异常（已兜底）：', err);
    els.stageHint.textContent = '部分能力初始化失败，请查看控制台';
    toast('初始化出现异常，但页面仍可使用降级功能', 'error');
  }
}

init();
