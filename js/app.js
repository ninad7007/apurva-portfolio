(() => {
  const N = 56;
  const W = 1680, H = 1264;
  const pad = n => String(n).padStart(3, '0');
  // hd pages are lossless crops of the PDF's own JPEGs; md are lighter previews for the book view.
  const src = (n, size) => `img/pages/${size}/p${pad(n)}.${size === 'hd' ? 'jpg' : 'webp'}`;

  const bookEl = document.getElementById('book');
  const wrap = document.getElementById('bookWrap');
  const stage = document.getElementById('portfolio');
  const counter = document.getElementById('counter');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const chapterBtns = [...document.querySelectorAll('#chapters button')];

  const pages = [];
  for (let i = 0; i < N; i++) {
    const d = document.createElement('div');
    d.className = 'page';
    d.dataset.n = i;
    if (i === 0 || i === N - 1) d.dataset.density = 'hard';
    const img = document.createElement('img');
    img.alt = i === 0 ? 'Portfolio cover' : `Portfolio page ${i + 1}`;
    img.decoding = 'async';
    img.draggable = false;
    d.append(img);
    bookEl.append(d);
    pages.push(d);
  }

  const MD = 1300;
  let needHd = false;

  // Swap in the native-resolution page once it has downloaded, so the preview never flashes blank.
  const upgrade = i => {
    const img = pages[i].firstChild;
    if (img.dataset.tier === 'hd' || img.dataset.loading) return;
    img.dataset.loading = '1';
    const hd = new Image();
    hd.onload = () => { img.src = hd.src; img.dataset.tier = 'hd'; delete img.dataset.loading; };
    hd.src = src(i, 'hd');
  };

  const load = n => {
    for (let i = Math.max(0, n - 3); i <= Math.min(N - 1, n + 6); i++) {
      const img = pages[i].firstChild;
      if (!img.src) img.src = src(i, 'md');
    }
    if (needHd) for (let i = Math.max(0, n - 2); i <= Math.min(N - 1, n + 3); i++) upgrade(i);
  };

  const startPage = Math.min(N - 1, Math.max(0, (parseInt((location.hash.match(/page=(\d+)/) || [])[1], 10) || 1) - 1));
  load(startPage);

  const maxH = Math.round(Math.max(screen.height, screen.width) * 0.9);
  // The library switches to one page per view when two pages can't each get minWidth;
  // 420px keeps spreads readable and gives portrait tablets one large page instead of a tiny spread.
  const minW = Math.min(420, wrap.clientWidth);
  const pf = new St.PageFlip(bookEl, {
    width: W / 2, height: H / 2,
    size: 'stretch',
    minWidth: minW, minHeight: Math.round(minW * H / W),
    maxWidth: Math.round(maxH * W / H), maxHeight: maxH,
    showCover: true,
    usePortrait: true,
    mobileScrollSupport: true,
    maxShadowOpacity: 0.35,
    flippingTime: 750,
    disableFlipByClick: true,
    startPage,
  });
  pf.loadFromHTML(pages);

  // page-flip 2.0.7 bug: with disableFlipByClick on, flipPrev's synthetic start point falls outside
  // the corner zone in single-page mode, so every backward turn (button, swipe, key, chapter jump)
  // is silently ignored. Lift the click guard just for that call.
  const fc = pf.getFlipController();
  const flipPrev = fc.flipPrev.bind(fc);
  fc.flipPrev = corner => {
    const s = pf.getSettings();
    s.disableFlipByClick = false;
    try { flipPrev(corner); } finally { s.disableFlipByClick = true; }
  };

  // A forward drag only completes once the finger crosses the page's left edge. In single-page view
  // that edge is the screen edge, so slow drags always sprang back; complete them past mid-page instead.
  const FORWARD = 0;
  const stopMove = fc.stopMove.bind(fc);
  fc.stopMove = () => {
    const calc = fc.getCalculation();
    if (calc && !isSpread() && calc.getDirection() === FORWARD) {
      const pos = calc.getPosition(), rect = fc.getBoundsRect();
      if (pos.x <= rect.pageWidth / 2) {
        fc.animateFlippingTo(pos, { x: -rect.pageWidth, y: calc.getCorner() === 'bottom' ? rect.height : 0 }, true);
        return;
      }
    }
    stopMove();
  };

  const isSpread = () => pf.getOrientation() === 'landscape';

  // In spread view a page index can sit on either side; resolve the visible pair.
  const visible = i => {
    if (!isSpread() || i === 0 || i === N - 1) return [i];
    const left = i % 2 ? i : i - 1;
    return [left, left + 1];
  };

  const update = () => {
    const i = pf.getCurrentPageIndex();
    load(i);
    const v = visible(i);
    counter.textContent = i === 0 ? 'Cover' : i === N - 1 ? 'Back cover' : v.map(x => x + 1).join('-') + ` / ${N}`;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === N - 1;
    let current = null;
    chapterBtns.forEach(b => { if (+b.dataset.page <= v[v.length - 1]) current = b; });
    chapterBtns.forEach(b => b.setAttribute('aria-current', b === current && i > 0 ? 'true' : 'false'));
    history.replaceState(null, '', i > 0 ? `#page=${v[0] + 1}` : location.pathname);
  };

  // In spread view the covers sit alone on one half; slide the book so they are centred.
  const syncLayout = () => {
    const i = pf.getCurrentPageIndex();
    const shift = !isSpread() ? 0 : i === 0 ? -25 : i === N - 1 ? 25 : 0;
    bookEl.style.transform = shift ? `translateX(${shift}%)` : '';
  };

  const pickTier = () => {
    needHd = pf.getBoundsRect().pageWidth * devicePixelRatio > MD;
    load(pf.getCurrentPageIndex());
  };

  pf.on('flip', () => { update(); syncLayout(); });
  pf.on('changeOrientation', () => { syncLayout(); update(); pickTier(); });
  window.addEventListener('resize', () => requestAnimationFrame(pickTier));
  document.addEventListener('fullscreenchange', () => setTimeout(pickTier, 100));
  pf.on('changeState', e => { if (e.data === 'user_fold' || e.data === 'flipping') load(pf.getCurrentPageIndex()); });
  update();
  syncLayout();
  pickTier();

  window.addEventListener('load', () => {
    const idle = window.requestIdleCallback || (f => setTimeout(f, 1200));
    idle(() => pages.forEach((p, i) => { if (!p.firstChild.src) p.firstChild.src = src(i, 'md'); }));
  });

  const prev = () => pf.flipPrev();
  const next = () => pf.flipNext();
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  chapterBtns.forEach(b => b.addEventListener('click', () => {
    const p = +b.dataset.page;
    load(p);
    pf.flip(p);
  }));

  document.getElementById('fsBtn').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.();
  });

  // Zoom viewer
  const dlg = document.getElementById('zoom');
  const zImg = document.getElementById('zoomImg');
  const zCanvas = document.getElementById('zoomCanvas');
  const zCount = document.getElementById('zoomCount');
  // Zoom state: the page is fitted into the canvas (fw x fh) and drawn at scale s, offset (x, y).
  let s = 1, x = 0, y = 0, fw = 0, fh = 0, cw = 0, ch = 0;
  // Past ~2x the source's native pixels there is no more detail, only blur, so stop there.
  const maxScale = () => Math.max(1.5, (W / (fw * devicePixelRatio)) * 2);
  const render = animate => {
    const w = fw * s, h = fh * s;
    // Smaller than the canvas on an axis: centre it. Larger: never let an edge pull inside the canvas.
    x = w <= cw ? (cw - w) / 2 : Math.min(0, Math.max(cw - w, x));
    y = h <= ch ? (ch - h) / 2 : Math.min(0, Math.max(ch - h, y));
    zImg.style.transition = animate ? 'transform .25s ease' : 'none';
    zImg.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  };
  const fit = () => {
    cw = zCanvas.clientWidth; ch = zCanvas.clientHeight;
    const k = Math.min(cw / W, ch / H);
    fw = W * k; fh = H * k;
    zImg.style.width = fw + 'px'; zImg.style.height = fh + 'px';
    s = 1; render(false);
  };
  const zoomAt = (ns, px, py, animate) => {
    ns = Math.min(maxScale(), Math.max(1, ns));
    x = px - (px - x) * ns / s; y = py - (py - y) * ns / s; s = ns;
    render(animate);
  };
  const zoomBy = f => zoomAt(s * f, cw / 2, ch / 2, true);
  const local = e => { const r = zCanvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  zCanvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(s * Math.exp(-e.deltaY * 0.0015), ...local(e)); }, { passive: false });
  zCanvas.addEventListener('dblclick', e => (s > 1.05 ? (s = 1, render(true)) : zoomAt(2.5, ...local(e), true)));

  // Drag with one pointer, pinch with two.
  const pts = new Map();
  let pinch = null;
  zCanvas.addEventListener('pointerdown', e => { zCanvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); pinch = null; });
  zCanvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const prevPt = pts.get(e.pointerId), cur = local(e);
    pts.set(e.pointerId, cur);
    if (pts.size === 1) { x += cur[0] - prevPt[0]; y += cur[1] - prevPt[1]; render(false); return; }
    const [a, b] = [...pts.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (pinch) { x += mid[0] - pinch.mid[0]; y += mid[1] - pinch.mid[1]; zoomAt(s * d / pinch.d, mid[0], mid[1], false); }
    pinch = { d, mid };
  });
  const lift = e => { pts.delete(e.pointerId); pinch = null; };
  zCanvas.addEventListener('pointerup', lift);
  zCanvas.addEventListener('pointercancel', lift);
  window.addEventListener('resize', () => { if (dlg.open) fit(); });
  let zPage = 0;

  const showZoom = n => {
    zPage = Math.min(N - 1, Math.max(0, n));
    fit();
    zImg.src = src(zPage, 'md');
    const hd = new Image();
    hd.onload = () => { if (zImg.dataset.want === hd.src) zImg.src = hd.src; };
    hd.src = src(zPage, 'hd');
    zImg.dataset.want = hd.src;
    zImg.alt = pages[zPage].firstChild.alt;
    zCount.textContent = `Page ${zPage + 1} of ${N}`;
  };
  const openZoom = n => { dlg.showModal(); showZoom(n); };
  const closeZoom = () => dlg.close();
  dlg.addEventListener('close', () => { if (!visible(pf.getCurrentPageIndex()).includes(zPage)) pf.turnToPage(zPage); });

  document.getElementById('zoomBtn').addEventListener('click', () => openZoom(visible(pf.getCurrentPageIndex())[0]));
  document.getElementById('zPrev').addEventListener('click', () => showZoom(zPage - 1));
  document.getElementById('zNext').addEventListener('click', () => showZoom(zPage + 1));
  document.getElementById('zIn').addEventListener('click', () => zoomBy(1.5));
  document.getElementById('zOut').addEventListener('click', () => zoomBy(1 / 1.5));
  document.getElementById('zFit').addEventListener('click', () => { s = 1; render(true); });
  document.getElementById('zClose').addEventListener('click', closeZoom);

  // A click (not a drag) on a page opens the zoom viewer for that page.
  let down = null;
  wrap.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; }, true);
  wrap.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    down = null;
    if (pf.getState() !== 'read') return;
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find(el => el.classList?.contains('page'));
    if (hit) openZoom(+hit.dataset.n);
  }, true);

  document.addEventListener('keydown', e => {
    if (dlg.open) {
      if (e.key === 'ArrowLeft') showZoom(zPage - 1);
      else if (e.key === 'ArrowRight') showZoom(zPage + 1);
      else if (e.key === '+' || e.key === '=') zoomBy(1.5);
      else if (e.key === '-') zoomBy(1 / 1.5);
      return;
    }
    if (e.target.closest('input, textarea')) return;
    const r = stage.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
  });
})();
