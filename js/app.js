(() => {
  const N = 56;
  const W = 1690, H = 1282;
  const pad = n => String(n).padStart(3, '0');
  const src = (n, size) => `img/pages/${size}/p${pad(n)}.webp`;

  const bookEl = document.getElementById('book');
  const wrap = document.getElementById('bookWrap');
  const stage = document.getElementById('portfolio');
  const counter = document.getElementById('counter');
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

  const load = n => {
    for (let i = Math.max(0, n - 3); i <= Math.min(N - 1, n + 6); i++) {
      const img = pages[i].firstChild;
      if (!img.src) img.src = src(i, 'md');
    }
  };

  const startPage = Math.min(N - 1, Math.max(0, (parseInt((location.hash.match(/page=(\d+)/) || [])[1], 10) || 1) - 1));
  load(startPage);

  const maxH = Math.round(Math.max(screen.height, screen.width) * 0.9);
  const pf = new St.PageFlip(bookEl, {
    width: W / 2, height: H / 2,
    size: 'stretch',
    minWidth: 240, minHeight: Math.round(240 * H / W),
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
    counter.textContent = i === 0 ? `Cover / ${N}` : v.map(x => x + 1).join('-') + ` / ${N}`;
    let current = null;
    chapterBtns.forEach(b => { if (+b.dataset.page <= v[v.length - 1]) current = b; });
    chapterBtns.forEach(b => b.setAttribute('aria-current', b === current && i > 0 ? 'true' : 'false'));
    history.replaceState(null, '', i > 0 ? `#page=${v[0] + 1}` : location.pathname);
  };

  const syncLayout = () => wrap.classList.toggle('single', !isSpread() || [0, N - 1].includes(pf.getCurrentPageIndex()));

  pf.on('flip', () => { update(); syncLayout(); });
  pf.on('changeOrientation', () => { syncLayout(); update(); });
  pf.on('changeState', e => { if (e.data === 'user_fold' || e.data === 'flipping') load(pf.getCurrentPageIndex()); });
  update();
  syncLayout();

  window.addEventListener('load', () => {
    const idle = window.requestIdleCallback || (f => setTimeout(f, 1200));
    idle(() => pages.forEach((p, i) => { if (!p.firstChild.src) p.firstChild.src = src(i, 'md'); }));
  });

  const prev = () => pf.flipPrev();
  const next = () => pf.flipNext();
  document.getElementById('prev').addEventListener('click', prev);
  document.getElementById('next').addEventListener('click', next);
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
  const pz = Panzoom(zImg, { maxScale: 6, minScale: 1, step: 0.4, contain: 'outside', cursor: 'grab' });
  zCanvas.addEventListener('wheel', e => pz.zoomWithWheel(e), { passive: false });
  zCanvas.addEventListener('dblclick', e => (pz.getScale() > 1.2 ? pz.reset() : pz.zoomToPoint(2.5, e)));
  let zPage = 0;

  const showZoom = n => {
    zPage = Math.min(N - 1, Math.max(0, n));
    pz.reset({ animate: false });
    zImg.src = src(zPage, 'md');
    const hd = new Image();
    hd.onload = () => { if (zImg.dataset.want === hd.src) zImg.src = hd.src; };
    hd.src = src(zPage, 'hd');
    zImg.dataset.want = hd.src;
    zImg.alt = pages[zPage].firstChild.alt;
    zCount.textContent = `Page ${zPage + 1} of ${N}`;
  };
  const openZoom = n => { showZoom(n); dlg.showModal(); };
  const closeZoom = () => dlg.close();
  dlg.addEventListener('close', () => { if (!visible(pf.getCurrentPageIndex()).includes(zPage)) pf.turnToPage(zPage); });

  document.getElementById('zoomBtn').addEventListener('click', () => openZoom(visible(pf.getCurrentPageIndex())[0]));
  document.getElementById('zPrev').addEventListener('click', () => showZoom(zPage - 1));
  document.getElementById('zNext').addEventListener('click', () => showZoom(zPage + 1));
  document.getElementById('zIn').addEventListener('click', () => pz.zoomIn());
  document.getElementById('zOut').addEventListener('click', () => pz.zoomOut());
  document.getElementById('zFit').addEventListener('click', () => pz.reset());
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
      else if (e.key === '+' || e.key === '=') pz.zoomIn();
      else if (e.key === '-') pz.zoomOut();
      return;
    }
    if (e.target.closest('input, textarea')) return;
    const r = stage.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
  });
})();
