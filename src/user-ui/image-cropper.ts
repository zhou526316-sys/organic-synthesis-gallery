export interface CroppedUserImage {
  imageData: string;
  circular: boolean;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('image_read_failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image_load_failed'));
    image.src = source;
  });
}

function button(label: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.style.minHeight = '36px';
  element.style.padding = '7px 12px';
  element.style.border = '1px solid #d7deea';
  element.style.borderRadius = '10px';
  element.style.background = '#fff';
  element.style.color = '#475467';
  element.style.cursor = 'pointer';
  return element;
}

export async function cropUserImage(file: File): Promise<CroppedUserImage | null> {
  if (!file.type.startsWith('image/') || file.size > 4_000_000) return null;

  const image = await loadImage(await readFile(file));
  const size = Math.max(160, Math.min(300, window.innerWidth - 48, window.innerHeight - 240));

  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    display: 'grid',
    placeItems: 'center',
    padding: '14px',
    background: 'rgba(15,23,42,.58)',
    backdropFilter: 'blur(3px)',
  });

  const card = document.createElement('section');
  Object.assign(card.style, {
    width: 'min(430px, calc(100vw - 28px))',
    maxHeight: 'calc(100dvh - 28px)',
    overflow: 'auto',
    padding: '16px',
    borderRadius: '18px',
    background: '#fff',
    color: '#172033',
    boxShadow: '0 24px 80px rgba(15,23,42,.32)',
    font: '12px/1.45 Inter,system-ui,sans-serif',
  });

  const head = document.createElement('div');
  Object.assign(head.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '12px',
  });
  const title = document.createElement('strong');
  title.textContent = '裁切图片 / Crop image';
  title.style.fontSize = '15px';
  const close = button('×');
  close.setAttribute('aria-label', 'Close');
  Object.assign(close.style, {
    width: '30px',
    minHeight: '30px',
    height: '30px',
    padding: '0',
    border: '0',
    background: '#f2f4f7',
    fontSize: '19px',
  });
  head.append(title, close);

  const frame = document.createElement('div');
  Object.assign(frame.style, {
    position: 'relative',
    width: size + 'px',
    height: size + 'px',
    maxWidth: '100%',
    margin: '0 auto',
    overflow: 'hidden',
    borderRadius: '14px',
    background: '#eef2f7',
    touchAction: 'none',
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  Object.assign(canvas.style, {
    display: 'block',
    width: '100%',
    height: '100%',
    cursor: 'grab',
    touchAction: 'none',
  });

  const guide = document.createElement('div');
  Object.assign(guide.style, {
    pointerEvents: 'none',
    position: 'absolute',
    inset: '0',
    border: '2px solid rgba(255,255,255,.95)',
    boxShadow: 'inset 0 0 0 1px rgba(15,23,42,.18)',
    borderRadius: '12px',
  });
  frame.append(canvas, guide);

  const controls = document.createElement('div');
  Object.assign(controls.style, {
    display: 'grid',
    gap: '10px',
    marginTop: '12px',
  });

  const zoomLabel = document.createElement('label');
  zoomLabel.textContent = '缩放 / Zoom ';
  Object.assign(zoomLabel.style, {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0,1fr)',
    gap: '10px',
    alignItems: 'center',
    color: '#667085',
  });
  const zoomInput = document.createElement('input');
  zoomInput.type = 'range';
  zoomInput.min = '1';
  zoomInput.max = '3';
  zoomInput.step = '0.01';
  zoomInput.value = '1';
  zoomLabel.appendChild(zoomInput);

  const shapes = document.createElement('div');
  Object.assign(shapes.style, {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  });
  const square = button('方形 / Square');
  const circle = button('圆形 / Circle');
  shapes.append(square, circle);
  controls.append(zoomLabel, shapes);

  const footer = document.createElement('div');
  Object.assign(footer.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '14px',
  });
  const hint = document.createElement('span');
  hint.textContent = '拖动图片调整位置 / Drag to reposition';
  Object.assign(hint.style, {
    marginRight: 'auto',
    color: '#8a93a3',
    fontSize: '10px',
  });
  const cancel = button('取消 / Cancel');
  const apply = button('使用 / Apply');
  Object.assign(apply.style, {
    border: '0',
    background: '#3159bd',
    color: '#fff',
    fontWeight: '750',
  });
  footer.append(hint, cancel, apply);
  card.append(head, frame, controls, footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let circular = false;
  let drag: { x: number; y: number; offsetX: number; offsetY: number } | null = null;

  const clamp = (): void => {
    const baseScale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
    const drawWidth = image.naturalWidth * baseScale;
    const drawHeight = image.naturalHeight * baseScale;
    const maxX = Math.max(0, (drawWidth - size) / 2);
    const maxY = Math.max(0, (drawHeight - size) / 2);
    offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
    offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
  };

  const draw = (target: HTMLCanvasElement, outputSize: number): void => {
    const context = target.getContext('2d');
    if (!context) return;
    target.width = outputSize;
    target.height = outputSize;
    context.clearRect(0, 0, outputSize, outputSize);

    const ratio = outputSize / size;
    const baseScale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const scale = baseScale * zoom * ratio;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const x = (outputSize - width) / 2 + offsetX * ratio;
    const y = (outputSize - height) / 2 + offsetY * ratio;

    context.save();
    if (circular) {
      context.beginPath();
      context.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
      context.clip();
    }
    context.drawImage(image, x, y, width, height);
    context.restore();
  };

  const refresh = (): void => {
    clamp();
    draw(canvas, size);
    guide.style.borderRadius = circular ? '50%' : '12px';
    square.style.background = circular ? '#fff' : '#eef3ff';
    square.style.borderColor = circular ? '#d7deea' : '#8aa5ef';
    square.style.color = circular ? '#475467' : '#3159bd';
    circle.style.background = circular ? '#eef3ff' : '#fff';
    circle.style.borderColor = circular ? '#8aa5ef' : '#d7deea';
    circle.style.color = circular ? '#3159bd' : '#475467';
  };

  refresh();

  return new Promise<CroppedUserImage | null>(resolve => {
    const finish = (value: CroppedUserImage | null): void => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    };

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') finish(null);
    };

    document.addEventListener('keydown', onKey);
    close.addEventListener('click', () => finish(null));
    cancel.addEventListener('click', () => finish(null));
    overlay.addEventListener('pointerdown', event => {
      if (event.target === overlay) finish(null);
    });

    zoomInput.addEventListener('input', () => {
      zoom = Number(zoomInput.value) || 1;
      refresh();
    });

    square.addEventListener('click', () => {
      circular = false;
      refresh();
    });
    circle.addEventListener('click', () => {
      circular = true;
      refresh();
    });

    canvas.addEventListener('pointerdown', event => {
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
      drag = { x: event.clientX, y: event.clientY, offsetX, offsetY };
    });
    canvas.addEventListener('pointermove', event => {
      if (!drag) return;
      offsetX = drag.offsetX + event.clientX - drag.x;
      offsetY = drag.offsetY + event.clientY - drag.y;
      refresh();
    });

    const stopDrag = (event: PointerEvent): void => {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor = 'grab';
      drag = null;
    };
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);

    apply.addEventListener('click', () => {
      const output = document.createElement('canvas');
      draw(output, 192);
      const webp = output.toDataURL('image/webp', 0.9);
      finish({
        imageData: webp.startsWith('data:image/webp') ? webp : output.toDataURL('image/png'),
        circular,
      });
    });
  });
}
