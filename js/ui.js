// 纯 UI 辅助：toast、徽标 class、手动旋转模态框、canvas 动画源

export function toast(message, kind = 'info', timeout = 3600) {
  const host = document.getElementById('toastHost');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, timeout);
}

const PILL_CLASS = {
  granted: 'ok',
  prompt: 'warn',
  denied: 'danger',
  unsupported: 'danger',
  unknown: 'info'
};

export function renderPill(el, state, text) {
  el.className = `pill ${PILL_CLASS[state] || 'info'}`;
  el.textContent = text;
}

export function setReason(el, text) {
  if (!text) {
    el.textContent = '—';
    el.classList.remove('has-error');
  } else {
    el.textContent = text;
    el.classList.add('has-error');
  }
}

/* 手动旋转降级模态框 */
export function showRotateModal(targetLabel) {
  const modal = document.getElementById('rotateModal');
  document.getElementById('rotateTarget').textContent = targetLabel;
  modal.hidden = false;
  const close = () => { modal.hidden = true; };
  modal.querySelectorAll('[data-close]').forEach((node) => {
    node.onclick = close;
  });
  return close;
}

/* Canvas -> MediaStream -> video，作为画中画的本地视频源 */
export function startStageSource(canvas, video) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  let raf = 0;

  function draw(ts) {
    const t = ts / 1000;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#16233d');
    g.addColorStop(1, '#0d3a4a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const x = W / 2 + Math.cos(t * 1.4) * (W * 0.28);
    const y = H / 2 + Math.sin(t * 1.4) * (H * 0.22);
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.fillStyle = '#4f8cff';
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '600 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PiP 演示画面', W / 2, 46);

    const now = new Date();
    ctx.font = '500 30px ui-monospace, Menlo, monospace';
    ctx.fillText(now.toLocaleTimeString(), W / 2, H - 30);

    raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);

  let stream = null;
  try {
    if (canvas.captureStream) {
      stream = canvas.captureStream(30);
      video.srcObject = stream;
      video.muted = true;
      video.play().catch(() => {});
    }
  } catch (err) {
    console.warn('[stage] captureStream 失败：', err);
  }

  return {
    stream,
    stop() { cancelAnimationFrame(raf); }
  };
}
