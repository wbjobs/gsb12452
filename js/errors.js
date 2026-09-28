// 将各 API 抛出的 DOMException / 普通错误归类为：原因 + 可操作建议
// 返回 { category, reason, advice, fallback }

const ADVICE = {
  insecure: '请通过 HTTPS 或 http://localhost 访问本站点。',
  notAllowed: '请确认操作是在真实的点击/触摸中发起，并允许站点的相关权限。',
  notSupportedLock: '当前浏览器/平台不支持系统级方向锁定，只能提示手动旋转。',
  invalidStatePip: '请等待演示视频开始播放后再申请画中画。',
  policy: '页面被 Permissions-Policy（iframe allow / 响应头）禁用，需站点管理员放开。',
  abort: '操作被浏览器或用户中止，可以重新点击按钮再试一次。',
  unknown: '发生未预期的错误，可查看控制台获取详细信息。'
};

export function classifyError(err, capability) {
  const name = (err && err.name) || 'Error';
  const message = (err && err.message) || String(err);

  // 非安全上下文时，部分浏览器直接抛 SecurityError
  if (name === 'SecurityError') {
    if (message.includes('policy') || /fullscreen|picture-in-picture|orientation/i.test(message)) {
      return {
        category: 'policy',
        reason: '被安全策略或 Permissions-Policy 拒绝',
        advice: /secure context/i.test(message) ? ADVICE.insecure : ADVICE.policy,
        fallback: capability === 'orientation' ? 'rotate' : capability === 'pip' ? 'popup' : 'manual'
      };
    }
    return {
      category: 'denied',
      reason: `权限被拒绝（${name}）：${message}`,
      advice: ADVICE.notAllowed,
      fallback: capability === 'orientation' ? 'rotate' : capability === 'pip' ? 'popup' : 'manual'
    };
  }

  switch (name) {
    case 'NotAllowedError':
      return {
        category: 'no-gesture-or-denied',
        reason: '权限被拒绝，或调用时没有有效的用户手势（transient activation 已过期）',
        advice: ADVICE.notAllowed,
        fallback: capability === 'orientation' ? 'rotate' : capability === 'pip' ? 'popup' : 'manual'
      };
    case 'TypeError':
      return {
        category: 'unsupported',
        reason: `API 或参数不被当前浏览器支持：${message}`,
        advice: capability === 'orientation' ? ADVICE.notSupportedLock : '更换为支持该 API 的浏览器（如最新版 Chrome / Edge）。',
        fallback: capability === 'orientation' ? 'rotate' : capability === 'pip' ? 'popup' : 'manual'
      };
    case 'NotSupportedError':
      if (capability === 'orientation') {
        return {
          category: 'unsupported-lock',
          reason: '当前设备/浏览器不支持屏幕方向锁定（移动端 Chrome 通常还要求先进入全屏）',
          advice: ADVICE.notSupportedLock,
          fallback: 'rotate'
        };
      }
      if (capability === 'pip') {
        return {
          category: 'unsupported',
          reason: '当前浏览器不支持画中画',
          advice: '可使用最新版 Chrome / Edge / Safari，或使用下方普通弹窗替代。',
          fallback: 'popup'
        };
      }
      return {
        category: 'unsupported',
        reason: `当前环境不支持该操作：${message}`,
        advice: '更换支持该 API 的浏览器。',
        fallback: 'manual'
      };
    case 'InvalidStateError':
      return {
        category: 'invalid-state',
        reason: capability === 'pip'
          ? '视频尚未就绪（无可用画面）或文档状态不允许画中画'
          : `当前状态不允许该操作：${message}`,
        advice: capability === 'pip' ? ADVICE.invalidStatePip : '稍后重试。',
        fallback: capability === 'pip' ? 'popup' : 'manual'
      };
    case 'AbortError':
      return {
        category: 'abort',
        reason: '操作被中止（可能已有一个同类请求在进行，或用户切换了焦点）',
        advice: ADVICE.abort,
        fallback: capability === 'orientation' ? 'rotate' : capability === 'pip' ? 'popup' : 'manual'
      };
    case 'QuotaExceededError':
      return {
        category: 'busy',
        reason: '浏览器当前忙碌（可能已有全屏/画中画请求挂起）',
        advice: '关闭系统级其他全屏应用后重试。',
        fallback: 'manual'
      };
    default:
      return {
        category: 'unknown',
        reason: `${name}: ${message}`,
        advice: ADVICE.unknown,
        fallback: capability === 'orientation' ? 'rotate' : capability === 'pip' ? 'popup' : 'manual'
      };
  }
}

// 退出全屏的异常单独分类（验收点：退出全屏异常）
export function classifyExitError(err) {
  const name = (err && err.name) || 'Error';
  if (name === 'TypeError') {
    return { category: 'not-active', reason: '当前并不处于全屏状态，无需退出', advice: '可忽略此异常。' };
  }
  return {
    category: 'exit-failed',
    reason: `退出全屏失败：${name}: ${err.message || err}`,
    advice: '可按 Esc 键退出，或刷新页面。'
  };
}
