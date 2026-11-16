// Top bar state, section highlighting, scroll reveals, the hero video toggle
// and the BibTeX copy button.
(function () {
  const bar = document.getElementById('bar');
  const links = [...bar.querySelectorAll('.links a')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const darkSections = [...document.querySelectorAll('section.dark')];

  // ------------------------------------------------------------ top bar
  let queued = false;
  function update() {
    queued = false;
    const y = window.scrollY;
    bar.classList.toggle('scrolled', y > 4);

    const probe = bar.offsetHeight / 2;
    bar.classList.toggle('over-dark', darkSections.some((s) => {
      const r = s.getBoundingClientRect();
      return r.top <= probe && r.bottom >= probe;
    }));

    let current = null;
    const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 2;
    if (atBottom && sections.length) current = sections[sections.length - 1];
    else for (const s of sections) if (s.getBoundingClientRect().top <= 120) current = s;
    links.forEach((a) => a.classList.toggle('on', !!current && a.getAttribute('href') === '#' + current.id));
  }
  const schedule = () => {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();

  // ------------------------------------------------------------ reveals
  const items = [...document.querySelectorAll('.reveal')];
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    items.forEach((n) => io.observe(n));
    // Anything already above the fold (or jumped past via an anchor) shows at once.
    window.addEventListener('load', () => {
      items.forEach((n) => { if (n.getBoundingClientRect().top < window.innerHeight) n.classList.add('in'); });
    });
  } else {
    items.forEach((n) => n.classList.add('in'));
  }

  // ------------------------------------------------------------ hero video
  const video = document.getElementById('hero-video');
  const toggle = document.getElementById('hero-toggle');
  const PLAY = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.5 2.8v10.4l8.5-5.2z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1"/><rect x="9.5" y="2.5" width="3" height="11" rx="1"/></svg>';
  if (video && toggle) {
    const sync = () => {
      const playing = !video.paused;
      toggle.innerHTML = playing ? PAUSE : PLAY;
      toggle.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.removeAttribute('autoplay');
      video.pause();
    }
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    toggle.addEventListener('click', () => (video.paused ? video.play() : video.pause()));
    sync();
  }

  // ------------------------------------------------------------ BibTeX
  const copy = document.getElementById('copy-bib');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById('bibtex').textContent);
      copy.textContent = 'Copied';
    } catch (e) {
      copy.textContent = 'Select and copy';
    }
    setTimeout(() => (copy.textContent = 'Copy'), 1600);
  });
})();
