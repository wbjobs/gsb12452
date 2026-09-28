// Permissions API 封装：
// fullscreen / orientation-lock / picture-in-picture 的 permission state 都是
// "prompt | granted | denied"，但很多浏览器不支持查询这些名称，需优雅处理。

export async function queryPermission(name) {
  if (typeof navigator === 'undefined' || !navigator.permissions || typeof navigator.permissions.query !== 'function') {
    return {
      name,
      state: 'unknown',
      supported: false,
      message: '当前浏览器不支持 Permissions API，无法查询，调用时由浏览器裁决',
    };
  }
  try {
    const status = await navigator.permissions.query({ name });
    return {
      name,
      state: status.state, // granted | denied | prompt
      supported: true,
      status,
      message: '',
    };
  } catch (err) {
    // Firefox 等会对不认识的 permission name 抛 TypeError
    return {
      name,
      state: 'unknown',
      supported: false,
      message: `浏览器不支持查询 "${name}"：${err.name || 'Error'}。该能力通常在调用时临时授权`,
      error: err,
    };
  }
}

export const PERM_LABELS = {
  granted: '✅ 已允许（granted）',
  denied: '⛔ 已拒绝（denied）',
  prompt: '❓ 使用时询问（prompt，需用户手势触发）',
  unknown: '❔ 不可查询（调用时由浏览器裁决）',
};
