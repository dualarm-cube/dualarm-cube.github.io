// Histograms and summary numbers for the batch-simulation results (static/sim/stats.json).
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const tip = document.getElementById('tip');

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  // Smallest 1/2/5 x 10^k step that covers v in at most five ticks.
  function niceTicks(v) {
    for (let k = 0; ; k++) {
      for (const m of [1, 2, 5]) {
        const step = m * Math.pow(10, k);
        if (Math.ceil(v / step) <= 5) return { step, count: Math.ceil(v / step) };
      }
    }
  }

  // Bar with a rounded top, square at the baseline.
  function barPath(x, y, w, h) {
    const r = Math.min(3, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  // The bins are computed once. The SVG is drawn at the container's own pixel
  // width (and redrawn when that changes), so its labels stay 12px on any screen.
  function histogram(container, values, opts) {
    const { binWidth, unit, fmtBin, labelEvery = 1 } = opts;
    const lo = Math.floor(Math.min(...values) / binWidth) * binWidth;
    const hi = Math.floor(Math.max(...values) / binWidth) * binWidth;
    const bins = [];
    for (let b = lo; b <= hi + 1e-9; b += binWidth) bins.push({ start: b, count: 0 });
    for (const v of values) bins[Math.min(bins.length - 1, Math.floor((v - lo) / binWidth + 1e-9))].count++;
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const ticks = niceTicks(Math.max(...bins.map((b) => b.count)));
    const yMax = ticks.step * ticks.count;
    const title = container.querySelector('h3').textContent;

    function draw() {
      const old = container.querySelector('svg');
      if (old) old.remove();
      const W = Math.max(260, Math.round(container.clientWidth));
      const H = Math.round(Math.max(190, Math.min(250, W * 0.42)));
      const m = { l: 34, r: 4, t: 24, b: 30 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const svg = el('svg', {
        viewBox: `0 0 ${W} ${H}`, role: 'img',
        'aria-label': `${title}: histogram of ${values.length} solves, median ${fmtBin(median, true)}`,
      }, container);
      const g = el('g', { transform: `translate(${m.l},${m.t})` }, svg);
      for (let i = 0; i <= ticks.count; i++) {
        const y = ih - (ih * i) / ticks.count;
        el('line', { x1: 0, x2: iw, y1: y, y2: y, class: i ? 'grid' : 'axl' }, g);
        el('text', { x: -10, y: y + 4, 'text-anchor': 'end', class: 'ax' }, g).textContent = ticks.step * i;
      }
      const slot = iw / bins.length;
      const gap = Math.min(4, Math.max(1, slot * 0.16));
      const every = Math.max(labelEvery, Math.ceil(26 / slot));
      const xOf = (v) => ((v - lo) / binWidth) * slot;
      bins.forEach((b, i) => {
        const h = (b.count / yMax) * ih;
        const bar = b.count ? el('path', { d: barPath(i * slot + gap / 2, ih - h, slot - gap, h), class: 'bar' }, g) : null;
        if (i % every === 0) {
          el('text', { x: i * slot + slot / 2, y: ih + 20, 'text-anchor': 'middle', class: 'ax' }, g).textContent = fmtBin(b.start);
        }
        const hit = el('rect', { x: i * slot, y: 0, width: slot, height: ih, class: 'hit' }, g);
        const show = (ev) => {
          const pct = ((100 * b.count) / values.length).toFixed(1);
          tip.innerHTML = `<b>${fmtBin(b.start, false, binWidth)}</b> ${unit}: ${b.count} solves (${pct}%)`;
          tip.style.left = ev.clientX + 'px';
          tip.style.top = ev.clientY + 'px';
          tip.style.opacity = 1;
          if (bar) bar.classList.add('hover');
        };
        hit.addEventListener('pointermove', show);
        hit.addEventListener('pointerenter', show);
        hit.addEventListener('pointerleave', () => {
          tip.style.opacity = 0;
          if (bar) bar.classList.remove('hover');
        });
      });
      const mx = xOf(median) + (binWidth === 1 ? slot / 2 : 0);
      el('line', { x1: mx, x2: mx, y1: -8, y2: ih, class: 'med' }, g);
      const flip = mx + 90 > iw;
      el('text', { x: flip ? mx - 6 : mx + 6, y: -10, 'text-anchor': flip ? 'end' : 'start', class: 'medl' }, g)
        .textContent = `median ${fmtBin(median, true)}`;
    }

    draw();
    if ('ResizeObserver' in window) {
      let lastW = container.clientWidth;
      new ResizeObserver(() => {
        const w = container.clientWidth;
        if (Math.abs(w - lastW) >= 8) {
          lastW = w;
          draw();
        }
      }).observe(container);
    }
  }

  fetch('static/sim/stats.json')
    .then((r) => {
      if (!r.ok) throw new Error(`stats.json: HTTP ${r.status}`);
      return r.json();
    })
    .then((d) => {
      const col = (k) => d.rows.map((row) => row[d.columns.indexOf(k)]);
      const med = (k) => d.summary[k].median;

      // Every number on the page that comes from the batch run.
      const numbers = {
        n: d.n,
        solved: Math.round(d.solvedFraction * d.n),
        scrambleLength: d.scrambleLength,
        htm: med('htm'),
        qtm: med('qtm'),
        rolls: med('reorients'),
        packets: med('wirePackets'),
        solveMs: Math.round(med('solveMs')),
      };
      for (const [k, v] of Object.entries(numbers)) {
        document.querySelectorAll(`[data-stat="${k}"]`).forEach((node) => (node.textContent = v));
      }

      histogram(document.getElementById('c-htm'), col('htm'), { binWidth: 1, unit: 'face turns', fmtBin: (v) => `${v}` });
      histogram(document.getElementById('c-qtm'), col('qtm'), { binWidth: 1, unit: 'quarter turns', fmtBin: (v) => `${v}`, labelEvery: 2 });
      histogram(document.getElementById('c-rolls'), col('reorients'), { binWidth: 1, unit: 'rolls', fmtBin: (v) => `${v}`, labelEvery: 3 });
      histogram(document.getElementById('c-packets'), col('wirePackets'), {
        binWidth: 40, unit: 'packets', labelEvery: 2,
        fmtBin: (v, exact, w) => (exact ? `${v}` : w ? `${v}–${v + w - 1}` : `${v}`),
      });

      const rows = [
        ['Face turns (Kociemba)', 'htm'], ['Quarter turns executed', 'qtm'], ['Whole-cube rolls', 'reorients'],
        ['Controller primitives', 'primitives'], ['Serial packets', 'wirePackets'],
        ['Kociemba solve time (ms)', 'solveMs'],
      ];
      const f = (v) => (Number.isInteger(v) ? v : v.toFixed(1));
      document.getElementById('stats-table').innerHTML =
        '<table><thead><tr><th>Per solve</th><th>median</th><th>mean</th><th>95th pct.</th><th>min</th><th>max</th></tr></thead><tbody>' +
        rows.map(([label, k]) => {
          const s = d.summary[k];
          return `<tr><td>${label}</td><td>${f(s.median)}</td><td>${f(s.mean)}</td><td>${f(s.p95)}</td><td>${f(s.min)}</td><td>${f(s.max)}</td></tr>`;
        }).join('') + '</tbody></table>';
    })
    .catch((err) => {
      const first = document.getElementById('c-htm');
      if (first) {
        const p = document.createElement('p');
        p.className = 'note';
        p.textContent = 'Could not load the results file.';
        first.appendChild(p);
      }
      console.error(err);
    });
})();
