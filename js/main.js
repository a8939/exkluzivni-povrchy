(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Posuvník PŘED / PO ---------- */

  document.querySelectorAll('[data-compare]').forEach((el) => {
    const range = el.querySelector('input[type="range"]');
    let pointerId = null;
    let moved = false;
    let hintFrame = 0;

    const set = (value) => {
      const v = Math.max(0, Math.min(100, value));
      el.style.setProperty('--pos', v + '%');
      range.value = Math.round(v);
    };
    const setFromEvent = (e) => {
      const r = el.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    };
    const stopHint = () => cancelAnimationFrame(hintFrame);

    el.addEventListener('pointerdown', (e) => {
      stopHint();
      pointerId = e.pointerId;
      moved = false;
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
      // Myš posune čáru hned; u prstu počkáme, jestli uživatel neroluje stránkou.
      if (e.pointerType === 'mouse') setFromEvent(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      moved = true;
      setFromEvent(e);
    });
    const end = (e) => {
      if (e.pointerId !== pointerId) return;
      if (e.type === 'pointerup' && !moved) setFromEvent(e); // klepnutí prstem
      pointerId = null;
      el.classList.remove('is-dragging');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    range.addEventListener('input', () => { stopHint(); set(+range.value); });

    // Jednou krátce „zahýbeme“ čarou, aby bylo vidět, že se dá posouvat.
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      const keys = [[0, 50], [450, 28], [1150, 72], [1650, 50]];
      let start = 0;
      const ease = (t) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      const step = (now) => {
        if (!start) start = now + 400;
        const t = now - start;
        if (t < 0) { hintFrame = requestAnimationFrame(step); return; }
        const i = keys.findIndex(([k]) => k > t);
        if (i === -1) { set(50); return; }
        const [t0, v0] = keys[i - 1];
        const [t1, v1] = keys[i];
        set(v0 + (v1 - v0) * ease((t - t0) / (t1 - t0)));
        hintFrame = requestAnimationFrame(step);
      };
      hintFrame = requestAnimationFrame(step);
    }, { threshold: 0.6 });
    io.observe(el);
  });

  /* ---------- Karusel realizací ---------- */
  // Fotky jedou dokola: na obou koncích jsou kopie, takže za poslední
  // plynule najede první. Po dojetí na kopii se nepozorovaně skočí na originál.

  const reel = document.querySelector('.reel');
  const viewport = reel.querySelector('.reel__viewport');
  const track = reel.querySelector('.reel__track');
  const dotsBox = reel.querySelector('.reel__dots');
  const originals = [...track.children];
  const count = originals.length;
  const CLONES = 2;

  originals.forEach((slide, i) => {
    slide.dataset.i = i;
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'snímek');
    slide.setAttribute('aria-label', `${i + 1} z ${count}`);
  });
  const cloneOf = (slide) => {
    const copy = slide.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.removeAttribute('role');
    copy.querySelector('.thumb').tabIndex = -1;
    return copy;
  };
  originals.slice(-CLONES).reverse().forEach((s) => track.prepend(cloneOf(s)));
  originals.slice(0, CLONES).forEach((s) => track.append(cloneOf(s)));
  const slides = [...track.children];

  const dots = originals.map((slide, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'reel__dot';
    dot.setAttribute('aria-label', `Fotka ${i + 1}: ${slide.querySelector('.thumb__title').textContent}`);
    dot.appendChild(document.createElement('span'));
    dot.addEventListener('click', () => goTo(i));
    dotsBox.appendChild(dot);
    return dot;
  });

  let pos = CLONES;                       // index v pásu včetně kopií
  const real = () => (pos - CLONES + count) % count;
  const offsetFor = (p) => viewport.clientWidth / 2 - (slides[p].offsetLeft + slides[p].offsetWidth / 2);

  function place(animate, extra = 0) {
    track.classList.toggle('is-animating', animate);
    track.style.transform = `translate3d(${offsetFor(pos) + extra}px, 0, 0)`;
  }

  function markActive() {
    const r = real();
    slides.forEach((s) => s.classList.toggle('is-active', +s.dataset.i === r));
    originals.forEach((s, i) => { s.querySelector('.thumb').tabIndex = i === r ? 0 : -1; });
    dots.forEach((d, i) => {
      d.setAttribute('aria-current', i === r ? 'true' : 'false');
      // plnění tečky vždy od začátku
      const fill = d.firstChild;
      fill.style.animation = 'none';
      void fill.offsetWidth;
      fill.style.animation = '';
    });
  }

  // Stojíme na kopii? Tiše přeskočit na originál.
  function normalize() {
    if (pos >= CLONES && pos < CLONES + count) return;
    pos = real() + CLONES;
    slides.forEach((s) => s.classList.add('no-anim'));
    place(false);
    void track.offsetWidth;
    slides.forEach((s) => s.classList.remove('no-anim'));
  }

  function move(delta) {
    normalize();
    pos += delta;
    place(true);
    markActive();
  }
  function goTo(i) {
    normalize();
    let target = i + CLONES;
    // přes konec je to blíž? jeď kratší cestou (kopie to dovolí)
    if (real() === count - 1 && i === 0) target = CLONES + count;
    else if (real() === 0 && i === count - 1) target = CLONES - 1;
    move(target - pos);
  }
  track.addEventListener('transitionend', (e) => {
    if (e.target === track) normalize();
  });

  window.addEventListener('resize', () => { normalize(); place(false); });
  place(false);
  markActive();

  reel.querySelectorAll('.reel__arrow').forEach((btn) => {
    btn.addEventListener('click', () => move(+btn.dataset.dir));
  });
  reel.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    move(e.key === 'ArrowRight' ? 1 : -1);
    if (viewport.contains(document.activeElement)) {
      originals[real()].querySelector('.thumb').focus({ preventScroll: true });
    }
  });

  // Tažení myší i prstem.
  let drag = null;
  let justDragged = false;
  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moving: false };
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moving) {
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(e.clientY - drag.y)) return;
      drag.moving = true;
      normalize();
      viewport.setPointerCapture(e.pointerId);
      viewport.classList.add('is-dragging');
      setPaused();
    }
    place(false, dx);
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const wasMoving = drag.moving;
    const dx = e.clientX - drag.x;
    const fast = Math.abs(dx) / (performance.now() - drag.t) > 0.4;   // rychlé švihnutí
    drag = null;
    if (!wasMoving) return;
    viewport.classList.remove('is-dragging');
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    const width = slides[pos].offsetWidth;
    let step = e.type === 'pointercancel' ? 0 : -Math.round(dx / width);
    if (step === 0 && e.type !== 'pointercancel' && (fast || Math.abs(dx) > width * 0.15)) step = dx < 0 ? 1 : -1;
    step = Math.max(-CLONES, Math.min(CLONES, step));
    if (step) move(step); else { place(true); markActive(); }
    setPaused();
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  // Klik na vedlejší fotku ji přisune doprostřed, klik na prostřední ji zvětší.
  viewport.addEventListener('click', (e) => {
    const slide = e.target.closest('.reel__item');
    if (!justDragged && slide && slide.classList.contains('is-active')) return;
    e.preventDefault();
    e.stopPropagation();
    if (!justDragged && slide) move(slides.indexOf(slide) - pos);
  }, true);

  // Automatický posun řídí plnicí se tečka: až se naplní, přijde další fotka.
  // Stojí, když je nad karuselem myš, když je v něm fokus, při tažení,
  // když je otevřená zvětšená fotka nebo když karusel není vidět.
  let hovering = false;
  let focused = false;
  let visible = true;
  function setPaused() {
    reel.classList.toggle('is-paused', hovering || focused || !visible || !!drag ||
      document.querySelector('.lightbox').open);
  }
  dotsBox.addEventListener('animationend', (e) => {
    if (e.target.parentElement.getAttribute('aria-current') === 'true') move(1);
  });

  reel.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    hovering = true;
    setPaused();
  });
  reel.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    hovering = false;
    setPaused();
  });
  reel.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) { focused = true; setPaused(); } });
  reel.addEventListener('focusout', (e) => { if (!reel.contains(e.relatedTarget)) { focused = false; setPaused(); } });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; setPaused(); }, { threshold: 0.3 }).observe(reel);
  }

  /* ---------- Zvětšení fotky ---------- */

  const box = document.querySelector('.lightbox');
  const boxImg = box.querySelector('.lightbox__img');
  const boxCaption = box.querySelector('.lightbox__caption');

  document.querySelectorAll('[data-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      boxImg.src = btn.dataset.zoom;
      boxImg.alt = btn.querySelector('img').alt;
      boxCaption.textContent = btn.dataset.caption || '';
      box.showModal();
      setPaused();
    });
  });
  // klepnutí mimo fotku zavře okno
  box.addEventListener('click', (e) => { if (e.target === box) box.close(); });
  box.addEventListener('close', setPaused);

  /* ---------- Mobil: tlačítko Zavolat, když hlavička zmizí ---------- */

  const callbar = document.querySelector('.callbar');
  const top = document.querySelector('.contact');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      callbar.classList.toggle('is-visible', !entry.isIntersecting);
    }).observe(top);
  }
})();
