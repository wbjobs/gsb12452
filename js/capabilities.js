// 运行环境与三个 API 的能力检测 / 基础操作适配层

export const env = {
  secure: typeof window.isSecureContext === 'boolean' ? window.isSecureContext : true,
  url: location.href,
  userAgent: navigator.userAgent
};

/* ---------------- Fullscreen（含 webkit 前缀兼容，如旧版 Safari/iOS） ---------------- */

export const fullscreen = {
  supported() {
    return Boolean(
      document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      document.documentElement.requestFullscreen ||
      document.documentElement.webkitRequestFullscreen
    );
  },
  get element() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  },
  isActive() {
    return Boolean(this.element);
  },
  async request(el) {
    const target = el || document.documentElement;
    if (target.requestFullscreen) {
      return target.requestFullscreen();
    }
    if (target.webkitRequestFullscreen) {
      return target.webkitRequestFullscreen();
    }
    throw makeError('NotSupportedError', 'Fullscreen API 不可用');
  },
  async exit() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    throw makeError('NotSupportedError', 'Fullscreen API 不可用');
  },
  onChange(handler) {
    const names = ['fullscreenchange', 'webkitfullscreenchange'];
    names.forEach((n) => document.addEventListener(n, handler));
    return () => names.forEach((n) => document.removeEventListener(n, handler));
  }
};

/* ---------------- Screen Orientation ---------------- */

export const orientation = {
  supported() {
    // lock 必须存在才视为“支持锁定”；仅有 screen.orientation 只能读取
    return Boolean(
      screen.orientation && typeof screen.orientation.lock === 'function'
    );
  },
  readSupported() {
    return Boolean(screen.orientation && screen.orientation.type);
  },
  get type() {
    return (screen.orientation && screen.orientation.type) || 'unknown';
  },
  get angle() {
    return (screen.orientation && screen.orientation.angle) ?? 0;
  },
  async lock(mode) {
    return screen.orientation.lock(mode);
  },
  async unlock() {
    if (typeof screen.orientation.unlock === 'function') {
      return screen.orientation.unlock();
    }
  },
  onChange(handler) {
    if (screen.orientation) {
      screen.orientation.addEventListener('change', handler);
      return () => screen.orientation.removeEventListener('change', handler);
    }
    return () => {};
  }
};

/* ---------------- Picture-in-Picture（标准 API） ---------------- */

export const pip = {
  supported() {
    return typeof document.pictureInPictureEnabled === 'boolean'
      ? document.pictureInPictureEnabled
      : typeof HTMLVideoElement !== 'undefined' &&
          typeof HTMLVideoElement.prototype.requestPictureInPicture === 'function';
  },
  isActive() {
    return Boolean(document.pictureInPictureElement);
  },
  async request(video) {
    return video.requestPictureInPicture();
  },
  async exit() {
    return document.exitPictureInPicture();
  },
  onChange(handler) {
    document.addEventListener('enterpictureinpicture', handler);
    document.addEventListener('leavepictureinpicture', handler);
    return () => {
      document.removeEventListener('enterpictureinpicture', handler);
      document.removeEventListener('leavepictureinpicture', handler);
    };
  }
};

/* ---------------- Permissions API ---------------- */

// 查询单个权限名；浏览器不认识该权限名时会抛 TypeError（Chrome）或返回 rejected
export async function queryPermission(name) {
  if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
    return { state: 'unknown', supported: false };
  }
  try {
    const status = await navigator.permissions.query({ name });
    return {
      state: status.state, // granted | denied | prompt
      supported: true,
      status
    };
  } catch (err) {
    // 某些浏览器把不支持的权限名直接抛错
    return { state: 'unknown', supported: false, error: err };
  }
}

/* ---------------- 用户激活检测 ---------------- */

export function hasTransientActivation() {
  if (navigator.userActivation && typeof navigator.userActivation.isActive === 'boolean') {
    return navigator.userActivation.isActive;
  }
  // 无法检测时保守认为“有”，真正的拒绝由 API 自身的异常来反映
  return true;
}

/* ---------------- 工具 ---------------- */

export function makeError(name, message) {
  const err = new Error(message);
  err.name = name;
  return err;
}

export function isSecureContext() {
  return env.secure;
}
