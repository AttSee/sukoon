// Sukoon test page. Plain JS on purpose: this is "a website", not part of the extension.
(() => {
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // 2 — JS that asks matchMedia before animating (what GSAP, Framer Motion and others do).
  $('prm-js').textContent = `JS matchMedia('(prefers-reduced-motion: reduce)'): ${reduce.matches}`;
  if (!reduce.matches) {
    $('js-motion').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(120px)' }], {
      duration: 1000,
      iterations: Infinity,
      direction: 'alternate',
    });
  }

  // 3 — a web component with its own looping animation inside a shadow root.
  customElements.define(
    'spinning-badge',
    class extends HTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>
          .b { display:inline-block; padding:8px 14px; background:#1f5f4a; color:#fff; border-radius:8px;
               animation: wobble .6s ease-in-out infinite alternate; }
          @keyframes wobble { to { transform: rotate(8deg) scale(1.1); } }
        </style><span class="b" id="inner">Shadow DOM badge</span>`;
      }
    },
  );

  // 4 — Web Animations API.
  $('waapi-loop').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], {
    duration: 2000,
    iterations: Infinity,
  });
  $('waapi-once').animate([{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], {
    duration: 4000,
    fill: 'forwards',
  });

  // AOS-style reveal on scroll.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) e.target.classList.add('aos-animate');
  });
  document.querySelectorAll('[data-aos]').forEach((el) => io.observe(el));

  // 5 — JS parallax (inline transforms on scroll, like Rellax / simpleParallax).
  const layers = [...document.querySelectorAll('.parallax-layer')];
  const updateParallax = () => {
    for (const el of layers) el.style.transform = `translateY(${(window.scrollY * Number(el.dataset.speed)).toFixed(1)}px)`;
  };
  window.addEventListener('scroll', updateParallax, { passive: true });

  // 5 — a map- or chart-like widget: cancels the wheel over itself only. A page-wide guard must leave it alone.
  let zoom = 0;
  window.__widgetWheels = 0;
  $('zoom-widget').addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      window.__widgetWheels++;
      zoom += e.deltaY < 0 ? 1 : -1;
      $('zoom-level').textContent = `zoom ${zoom}`;
    },
    { passive: false },
  );
  // Plain page-level wheel listener (analytics-style, never cancels): must keep seeing wheel events.
  window.__pageWheels = 0;
  window.addEventListener('wheel', () => window.__pageWheels++, { passive: true });

  // 4 — GSAP-shaped objects (no library needed): a paused menu timeline must not be rendered at its end
  // state by the adapter, while a running intro tween should finish.
  const tween = (paused) => ({
    _p: 0,
    _paused: paused,
    paused() {
      return this._paused;
    },
    repeat() {
      return 0;
    },
    progress(v) {
      if (v === undefined) return this._p;
      this._p = v;
      return this;
    },
    pause() {
      this._paused = true;
      return this;
    },
    isActive() {
      return !this._paused && this._p < 1;
    },
  });
  window.__gsapProbe = { menuTimeline: tween(true), introTween: tween(false) };
  window.gsap = {
    globalTimeline: {
      getChildren: () => [window.__gsapProbe.menuTimeline, window.__gsapProbe.introTween],
      pause() {},
      resume() {},
    },
  };

  // 5 — a Lenis-style smooth-scroll hijacker: cancels the wheel and animates the scroll itself.
  // ?nolenisclass: the same hijacker without the tell-tale class (exercises the generic detection).
  const params = new URLSearchParams(location.search);
  if (!params.has('nohijack')) {
    if (!params.has('nolenisclass')) document.documentElement.classList.add('lenis', 'lenis-smooth');
    let target = window.scrollY;
    let animating = false;
    window.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey) return;
        e.preventDefault();
        target = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, target + e.deltaY));
        window.__hijackedWheels = (window.__hijackedWheels || 0) + 1;
        if (!animating) {
          animating = true;
          const step = () => {
            const y = window.scrollY + (target - window.scrollY) * 0.08;
            window.scrollTo(0, Math.abs(target - y) < 0.5 ? target : y);
            if (Math.abs(target - window.scrollY) >= 0.5) requestAnimationFrame(step);
            else animating = false;
          };
          requestAnimationFrame(step);
        }
      },
      { passive: false },
    );
    window.addEventListener('scroll', () => {
      if (!animating) target = window.scrollY;
    });
  }

  $('to-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  $('view-transition').addEventListener('click', () => {
    const flip = () => {
      $('vt-target').textContent = $('vt-target').textContent === 'State A' ? 'State B' : 'State A';
    };
    if (document.startViewTransition) document.startViewTransition(flip);
    else flip();
  });

  // 6 — media: a real user gesture is allowed through.
  $('play-btn').addEventListener('click', () => void $('video').play().catch(() => {}));

  // Bench only (?bench=flash): a CSS-driven flashing panel, the most common source of flashing on
  // the web. Same reduced-intensity greys as below. The calm layer should stop it; IRIS measures that.
  if (new URLSearchParams(location.search).get('bench') === 'flash') {
    const panel = document.createElement('div');
    panel.className = 'css-flash';
    panel.setAttribute('aria-hidden', 'true');
    document.body.append(panel);
  }

  // 9 — gated, reduced-intensity flash test for Flash Guard.
  // Mid greys: relative luminance ≈ 0.20 ↔ 0.45, i.e. a WCAG general flash, at 5 Hz.
  const canvas = $('flash-canvas');
  const ctx = canvas.getContext('2d');
  let flashTimer = 0;
  let on = false;
  const paint = () => {
    ctx.fillStyle = on ? '#b3b3b3' : '#7c7c7c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };
  paint();
  $('flash-start').addEventListener('click', () => {
    clearInterval(flashTimer);
    flashTimer = setInterval(() => {
      on = !on;
      requestAnimationFrame(paint);
    }, 100);
  });
  $('flash-stop').addEventListener('click', () => {
    clearInterval(flashTimer);
    on = false;
    paint();
  });
})();
