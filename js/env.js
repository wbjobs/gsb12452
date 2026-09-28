// 运行环境与各能力可用性检测

export function isSecureContextSafe() {
  // window.isSecureContext 在非安全上下文中即可信地为 false；
  // localhost / 127.0.0.1 即使是 http 也算安全上下文
  if (typeof window === 'undefined') return false;
  if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
  return location.protocol === 'https:' ||
         location.hostname === 'localhost' ||
         location.hostname === '127.0.0.1';
}

function pickVendor(obj, names) {
  if (!obj) return undefined;
  for (const n of names) {
    if (typeof obj[n] === 'function') return obj[n].bind(obj);
  }
  return undefined;
}

/* ---------------- Fullscreen ---------------- */

export function fullscreenInfo() {
  const target = document.documentElement;
  const request = pickVendor(target, [
    'requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen', 'msRequestFullscreen',
  ]);
  const exit = pickVendor(document, [
    'exitFullscreen', 'webkitExitFullscreen', 'webkitCancelFullScreen', 'msExitFullscreen',
  ]);
  const fsEl =
    document.fullscreenElement ??
    document.webkitFullscreenElement ??
    document.msFullscreenElement ??
    null;
  const changeEvent = ('onfullscreenchange' in document) ? 'fullscreenchange'
    : ('onwebkitfullscreenchange' in document) ? 'webkitfullscreenchange' : null;
  const errorEvent = ('onfullscreenerror' in document) ? 'fullscreenerror'
    : ('onwebkitfullscreenerror' in document) ? 'webkitfullscreenerror' : null;

  return {
    supported: !!(request && exit),
    active: !!fsEl,
    request, exit, changeEvent, errorEvent,
    reason: request ? '' : '当前浏览器未提供 Fullscreen API（旧版 iOS Safari 仅支持视频元素的 webkitEnterFullscreen）',
  };
}

/* ---------------- Screen Orientation ---------------- */

export function orientationInfo() {
  const so = (typeof screen !== 'undefined') ? (screen.orientation || screen.mozOrientation || null) : null;
  const lock = so && typeof so.lock === 'function' ? so.lock.bind(so) : null;
  const unlock = so && typeof so.unlock === 'function' ? so.unlock.bind(so) : null;

  // iOS Safari 完全不提供 screen.orientation.lock
  const lockSupported = !!(so && lock);
  return {
    supported: !!so,
    lockSupported,
    instance: so,
    lock, unlock,
    get type() { return so ? (so.type || so.angle + '') : 'unknown'; },
    get angle() { return so ? so.angle : 0; },
    reason: lockSupported ? '' : '当前浏览器不支持 screen.orientation.lock（iOS Safari 与部分桌面浏览器不支持，需手动旋转设备或旋转显示器）',
  };
}

/* ---------------- Picture-in-Picture ---------------- */

export function pipInfo() {
  const v = document.createElement('video');
  const enter = (el) => {
    if (typeof el.requestPictureInPicture === 'function') return el.requestPictureInPicture();
    if (typeof el.webkitSetPresentationMode === 'function') {
      // Safari 旧接口
      el.webkitSetPresentationMode('inline'); // 先复位
      return el.webkitSetPresentationMode('picture-in-picture');
    }
    const err = new Error('Picture-in-Picture is not supported');
    err.name = 'NotSupportedError';
    return Promise.reject(err);
  };
  const supported =
    (typeof document !== 'undefined' && document.pictureInPictureEnabled === true) ||
    typeof v.requestPictureInPicture === 'function' ||
    typeof v.webkitSetPresentationMode === 'function';
  const autoSupported = typeof v.autoPictureInPicture === 'boolean' ? v.autoPictureInPicture : false;

  return {
    supported,
    autoSupported,
    enter,
    get activeElement() {
      return document.pictureInPictureElement || document.webkitPictureInPictureElement || null;
    },
    exit() {
      if (typeof document.exitPictureInPicture === 'function') return document.exitPictureInPicture();
      const el = document.webkitPictureInPictureElement;
      if (el && typeof el.webkitSetPresentationMode === 'function') {
        return el.webkitSetPresentationMode('inline');
      }
      const err = new Error('No Picture-in-Picture window to exit');
      err.name = 'InvalidStateError';
      return Promise.reject(err);
    },
    reason: supported ? '' : '当前浏览器未启用画中画（document.pictureInPictureEnabled 为 false，或浏览器不支持）',
  };
}
