/* 髙橋 春喜 ポートフォリオ — 画面の動き（ライブラリなし）。3D の回路図だけ、必要になったときに circuit3d.js を読む。 */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var SCRIPT_URL = (doc.currentScript && doc.currentScript.src) || location.href;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  var $ = function (s, el) { return (el || doc).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(s)); };
  var cssVar = function (el, name) { return getComputedStyle(el).getPropertyValue(name).trim(); };

  /* ------------------------------------------------------------ ページを開いたら、いちばん上から
     リンクから新しく開いたとき（戻る・再読み込み・#付きを除く）は、ブラウザーが前の位置を
     持ち越しても、読み込みの終わりまで先頭に戻す。読む人が自分で動かしたら、それ以上は触らない。 */
  (function () {
    var nav = null;
    try { nav = performance.getEntriesByType('navigation')[0]; } catch (e) { /* 古いブラウザー */ }
    if (location.hash || !nav || nav.type !== 'navigate') return;
    var moved = false;
    var mark = function () { moved = true; };
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, mark, { passive: true, once: true }); });
    var toTop = function () {
      if (moved || window.scrollY === 0) return;
      var b = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
      root.style.scrollBehavior = b;
    };
    toTop();
    doc.addEventListener('DOMContentLoaded', toTop, { once: true });
    window.addEventListener('load', function () { toTop(); requestAnimationFrame(toTop); setTimeout(toTop, 120); }, { once: true });
  })();

  /* ------------------------------------------------------------ テーマ */
  var themeBtn = $('#theme');
  function setTheme(t, save) {
    root.setAttribute('data-theme', t);
    if (save) { try { localStorage.setItem('theme', t); } catch (e) { /* 保存できなくても動く */ } }
    if (themeBtn) themeBtn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
    doc.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  }
  if (themeBtn) {
    themeBtn.setAttribute('aria-pressed', root.getAttribute('data-theme') === 'dark' ? 'true' : 'false');
    themeBtn.addEventListener('click', function () {
      setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
    });
  }
  // 保存していない人は、OS の設定の切り替えに合わせる
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    var saved = null; try { saved = localStorage.getItem('theme'); } catch (err) { /* なし */ }
    if (!saved) setTheme(e.matches ? 'dark' : 'light', false);
  });

  /* ------------------------------------------------------------ モニターの波形 */
  // 0〜1 の位相から、-1〜1 の値を返す
  var WAVES = {
    ecg: function (p) {
      var g = function (c, w, a) { var d = (p - c) / w; return a * Math.exp(-d * d); };
      return g(.18, .035, .16) + g(.36, .012, -.18) + g(.40, .014, 1) + g(.44, .014, -.32) + g(.66, .06, .3);
    },
    pleth: function (p) {
      var up = p < .22 ? Math.sin(p / .22 * Math.PI / 2) : 0;
      var down = p >= .22 ? Math.exp(-(p - .22) * 3.6) * (1 + .22 * Math.exp(-Math.pow((p - .5) / .06, 2))) : 0;
      return (up + down) * 1.6 - .75;
    },
    digital: function (p) {
      var bits = [1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0];
      var b = bits[Math.floor(p * bits.length) % bits.length];
      return b ? .62 : -.62;
    },
    capno: function (p) {
      if (p < .12) return -.7;
      if (p < .2) return -.7 + (p - .12) / .08 * 1.3;
      if (p < .62) return .6 + (p - .2) * .28;
      if (p < .7) return .72 - (p - .62) / .08 * 1.42;
      return -.7;
    }
  };
  var PERIOD = { ecg: 74, pleth: 86, digital: 150, capno: 190 }; // 1 拍の幅（px）

  function Trace(btn) {
    this.btn = btn;
    this.cv = $('canvas', btn);
    this.kind = btn.getAttribute('data-wave') || 'ecg';
    this.fn = WAVES[this.kind] || WAVES.ecg;
    this.head = 0;
    this.phase = Math.random();
    this.period = PERIOD[this.kind] * (0.94 + Math.random() * 0.12);
    this.data = [];
    this.resize();
  }
  Trace.prototype.resize = function () {
    var r = this.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(10, Math.round(r.width)); this.h = Math.max(10, Math.round(r.height));
    this.cv.width = this.w * dpr; this.cv.height = this.h * dpr;
    this.ctx = this.cv.getContext('2d'); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.data = new Array(this.w);
    for (var x = 0; x < this.w; x++) this.data[x] = this.sample(x);
    this.head = 0;
    this.colors();
  };
  Trace.prototype.colors = function () {
    this.color = cssVar(this.btn, '--c') || '#3ee08a';
    this.glow = parseFloat(cssVar(root, '--trace-glow')) || 0;
  };
  Trace.prototype.sample = function (x) {
    var p = ((x / this.period) + this.phase) % 1;
    var jitter = this.kind === 'digital' ? 0 : (Math.random() - .5) * .03;
    return this.fn(p) + jitter;
  };
  Trace.prototype.step = function (dx) {
    for (var i = 0; i < dx; i++) {
      this.head = (this.head + 1) % this.w;
      if (this.head === 0) this.phase = (this.phase + this.w / this.period) % 1;
      this.data[this.head] = this.sample(this.head);
    }
  };
  Trace.prototype.draw = function (sweep) {
    var c = this.ctx, w = this.w, h = this.h, mid = h / 2, amp = h * .4, gap = 18;
    c.clearRect(0, 0, w, h);
    c.lineWidth = 1.8; c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = this.color;
    c.shadowColor = this.color; c.shadowBlur = this.glow * 8;
    c.beginPath();
    var started = false;
    for (var x = 0; x < w; x++) {
      if (sweep) {
        var ahead = (x - this.head + w) % w;
        if (ahead > 0 && ahead <= gap) { started = false; continue; }
      }
      var y = mid - this.data[x] * amp;
      if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
    }
    c.stroke();
    if (sweep) { // 書き込み位置の光点
      c.shadowBlur = this.glow * 14;
      c.fillStyle = this.color;
      c.beginPath(); c.arc(this.head, mid - this.data[this.head] * amp, 2.4, 0, Math.PI * 2); c.fill();
    }
    c.shadowBlur = 0;
  };

  var monitor = $('#monitor');
  if (monitor) {
    var traces = $$('.ch', monitor).map(function (b) { return new Trace(b); });
    var visible = true, last = 0, raf = 0;
    var loop = function (t) {
      raf = 0;
      if (!visible || doc.hidden || reduce.matches) return;
      var dx = last ? Math.min(6, Math.round((t - last) / 1000 * 90)) : 1;
      if (dx > 0) { last = t; traces.forEach(function (tr) { tr.step(dx); tr.draw(true); }); }
      raf = requestAnimationFrame(loop);
    };
    var start = function () {
      if (reduce.matches) { traces.forEach(function (tr) { tr.draw(false); }); return; }
      if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
    };
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) start(); }).observe(monitor);
    doc.addEventListener('visibilitychange', start);
    reduce.addEventListener('change', start);
    var rt = 0;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { traces.forEach(function (tr) { tr.resize(); tr.draw(!reduce.matches); }); }, 150); });
    doc.addEventListener('themechange', function () { traces.forEach(function (tr) { tr.colors(); tr.draw(!reduce.matches); }); });
    traces.forEach(function (tr) { tr.draw(!reduce.matches); });
    start();

    var clock = $('#mon-clock');
    var tick = function () {
      var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
      if (clock) clock.textContent = z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
    };
    tick(); setInterval(tick, 1000);
  }

  /* ------------------------------------------------------------ 絞り込み */
  var cards = $$('.proj');
  var chips = $$('.chip');
  var chBtns = $$('.ch');
  var count = $('#count'), empty = $('#empty');
  var filter = 'all';
  function applyFilter(f, fromMonitor) {
    filter = f;
    chips.forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-filter') === f ? 'true' : 'false'); });
    chBtns.forEach(function (c) {
      var on = c.getAttribute('data-ch') === f;
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
      c.classList.toggle('dim', f !== 'all' && f !== 'try' && !on);
    });
    var n = 0;
    cards.forEach(function (card) {
      var chs = (card.getAttribute('data-ch') || '').split(' ');
      var show = f === 'all' || (f === 'try' ? card.getAttribute('data-try') === '1' : chs.indexOf(f) >= 0);
      var was = !card.classList.contains('is-hidden');
      card.classList.toggle('is-hidden', !show);
      if (show) {
        if (!reduce.matches) {
          card.classList.remove('is-enter'); void card.offsetWidth;
          card.style.animationDelay = (n * 45) + 'ms';
          card.classList.add('is-enter');
        }
        n++;
      } else if (was) { pauseCard(card); }
    });
    if (count) count.querySelector('b').textContent = n;
    if (empty) empty.hidden = n > 0;
    if (fromMonitor) {
      var target = $('#projects');
      if (target) target.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
    }
    refreshInView();
  }
  chips.forEach(function (c) { c.addEventListener('click', function () { applyFilter(c.getAttribute('data-filter')); }); });
  chBtns.forEach(function (c) {
    c.addEventListener('click', function () {
      var k = c.getAttribute('data-ch');
      applyFilter(filter === k ? 'all' : k, filter !== k);
    });
  });

  /* ------------------------------------------------------------ カードの動画 */
  function playCard(card) {
    var v = $('video', card);
    if (!v || reduce.matches) return;
    card.classList.add('is-play');
    var p = v.play(); if (p && p.catch) p.catch(function () { /* 自動再生できない環境ではポスターのまま */ });
  }
  function pauseCard(card) {
    var v = $('video', card);
    card.classList.remove('is-play');
    if (v && !v.paused) v.pause();
  }
  // 画面に半分以上見えている制作物の動画だけを再生する
  var inViewObs = null;
  function refreshInView() { if (inViewObs) { cards.forEach(function (c) { inViewObs.unobserve(c); inViewObs.observe(c); }); } }
  if (cards.length && 'IntersectionObserver' in window) {
    inViewObs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && e.intersectionRatio >= .5 && !e.target.classList.contains('is-hidden')) playCard(e.target);
        else pauseCard(e.target);
      });
    }, { threshold: [0, .5, 1] });
    cards.forEach(function (c) { inViewObs.observe(c); });
  }

  /* ------------------------------------------------------------ 技術と制作物のつながり */
  var map = $('#map');
  if (map) {
    var svg = $('#map-lines'), skNodes = $$('.node.sk', map), pjNodes = $$('.node.pj', map);
    var links = [];
    pjNodes.forEach(function (pj) {
      (pj.getAttribute('data-sks') || '').split(' ').forEach(function (k) {
        var sk = map.querySelector('.node.sk[data-sk="' + k + '"]');
        if (sk) links.push({ sk: sk, pj: pj, k: k });
      });
    });
    var NS = 'http://www.w3.org/2000/svg';
    var draw = function () {
      if (getComputedStyle(svg).display === 'none') return;
      var box = map.getBoundingClientRect();
      svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      links.forEach(function (l) {
        var a = l.sk.getBoundingClientRect(), b = l.pj.getBoundingClientRect();
        var x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top;
        var x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top;
        var mx = (x1 + x2) / 2;
        // 技術は折り返して並ぶので、列の右端（線の通り道）から出す
        var colRight = l.sk.parentNode.getBoundingClientRect().right - box.left;
        var d = 'M' + x1 + ',' + y1 + ' L' + colRight + ',' + y1 + ' C' + (colRight + (x2 - colRight) * .5) + ',' + y1 + ' ' + (colRight + (x2 - colRight) * .5) + ',' + y2 + ' ' + x2 + ',' + y2;
        if (x1 > colRight - 1) d = 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2;
        var p = doc.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        p.style.setProperty('--c', getComputedStyle(l.pj).getPropertyValue('--c'));
        l.path = p;
        svg.appendChild(p);
      });
      paint();
    };
    var sel = null; // {type, el}
    var hover = null;
    var paint = function () {
      var cur = hover || sel;
      var onSk = new Set(), onPj = new Set();
      if (cur) {
        links.forEach(function (l) {
          if ((cur.type === 'sk' && l.sk === cur.el) || (cur.type === 'pj' && l.pj === cur.el)) { onSk.add(l.sk); onPj.add(l.pj); }
        });
      }
      skNodes.forEach(function (n) { n.classList.toggle('on', onSk.has(n)); n.classList.toggle('off', !!cur && !onSk.has(n)); n.setAttribute('aria-pressed', sel && sel.el === n ? 'true' : 'false'); });
      pjNodes.forEach(function (n) { n.classList.toggle('on', onPj.has(n)); n.classList.toggle('off', !!cur && !onPj.has(n)); n.setAttribute('aria-pressed', sel && sel.el === n ? 'true' : 'false'); });
      links.forEach(function (l) {
        if (!l.path) return;
        var on = cur && onSk.has(l.sk) && onPj.has(l.pj) && (cur.el === l.sk || cur.el === l.pj);
        l.path.classList.toggle('on', !!on);
        l.path.classList.toggle('off', !!cur && !on);
      });
    };
    var pick = function (type, el) { sel = sel && sel.el === el ? null : { type: type, el: el }; paint(); };
    skNodes.forEach(function (n) {
      n.addEventListener('click', function () { pick('sk', n); });
      if (finePointer.matches) {
        n.addEventListener('mouseenter', function () { hover = { type: 'sk', el: n }; paint(); });
        n.addEventListener('mouseleave', function () { hover = null; paint(); });
      }
    });
    pjNodes.forEach(function (n) {
      n.addEventListener('click', function () { pick('pj', n); });
      if (finePointer.matches) {
        n.addEventListener('mouseenter', function () { hover = { type: 'pj', el: n }; paint(); });
        n.addEventListener('mouseleave', function () { hover = null; paint(); });
      }
    });
    var mt = 0;
    var later = function () { clearTimeout(mt); mt = setTimeout(draw, 120); };
    window.addEventListener('resize', later);
    doc.addEventListener('themechange', later);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(draw);
    if ('ResizeObserver' in window) new ResizeObserver(later).observe(map);
    draw();
  }

  /* ------------------------------------------------------------ その場で試す */
  var dlg = $('#viewer');
  if (dlg) {
    var frame = $('#vw-frame'), iframe = $('#vw-iframe'), stage = $('#vw-stage'), loading = $('#vw-loading');
    var devBtns = $$('[data-device]', $('.vw-device', dlg));
    var device = 'desktop';
    var SIZES = { phone: [390, 800], desktop: [1280, 800] };
    var fit = function () {
      var sw = stage.clientWidth - 16, sh = stage.clientHeight - 16;
      var small = window.innerWidth <= 760;
      frame.classList.toggle('phone', device === 'phone' && !small);
      if (device === 'phone' && small) { // スマホでスマホ表示: 画面いっぱいに
        frame.style.width = sw + 'px'; frame.style.height = sh + 'px'; frame.style.transform = 'none';
        return;
      }
      var s = SIZES[device], border = device === 'phone' ? 20 : 0;
      var k = Math.min(1, sw / (s[0] + border), sh / (s[1] + border));
      frame.style.width = s[0] + 'px'; frame.style.height = s[1] + 'px';
      frame.style.transform = 'scale(' + k + ')';
      frame.style.margin = (-(s[1] + border) * (1 - k) / 2) + 'px ' + (-(s[0] + border) * (1 - k) / 2) + 'px';
    };
    var setDevice = function (d) {
      device = d;
      devBtns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-device') === d ? 'true' : 'false'); });
      fit();
    };
    devBtns.forEach(function (b) { b.addEventListener('click', function () { setDevice(b.getAttribute('data-device')); }); });
    var opener = null;
    var open = function (btn) {
      opener = btn;
      var url = btn.getAttribute('data-try');
      $('#vw-title').textContent = btn.getAttribute('data-title') || '';
      $('#vw-note').textContent = btn.getAttribute('data-note') || '';
      $('#vw-open').href = url;
      loading.classList.remove('done');
      var pref = btn.getAttribute('data-device') || 'desktop';
      if (window.innerWidth <= 760) pref = 'phone';
      iframe.title = btn.getAttribute('data-title') || '';
      iframe.src = url;
      doc.body.classList.add('vw-lock');
      if (typeof dlg.showModal === 'function') dlg.showModal(); else { window.open(url, '_blank', 'noopener'); return; }
      setDevice(pref);
    };
    iframe.addEventListener('load', function () { if (iframe.src && iframe.src !== 'about:blank') loading.classList.add('done'); });
    var close = function () { dlg.close(); };
    $('#vw-close').addEventListener('click', close);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    dlg.addEventListener('close', function () {
      iframe.src = 'about:blank'; // カメラなどを止める
      doc.body.classList.remove('vw-lock');
      if (opener) opener.focus();
    });
    window.addEventListener('resize', function () { if (dlg.open) fit(); });
    doc.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-try]');
      if (b) { e.preventDefault(); open(b); }
    });
  }

  /* ------------------------------------------------------------ 構成図が組み上がる */
  function flow(fig, on) {
    $$('animateMotion', fig).forEach(function (m, i) {
      try { if (on) m.beginElement(); else m.endElement(); } catch (e) { /* SMIL が無い環境 */ }
    });
    fig.classList.toggle('is-flow', on);
  }
  function runArch(fig) {
    var steps = $$('[style*="--s"]', fig).map(function (el) { return parseFloat(el.style.getPropertyValue('--s')) || 0; });
    var max = Math.max.apply(null, steps.concat([0]));
    fig.classList.add('is-on');
    clearTimeout(fig._t);
    fig._t = setTimeout(function () { flow(fig, true); }, (max * 500) + 700);
  }
  var archs = $$('.arch');
  if (archs.length) {
    if (reduce.matches || !('IntersectionObserver' in window)) {
      archs.forEach(function (f) { f.classList.add('is-on'); });
    } else {
      var aobs = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { runArch(e.target); aobs.unobserve(e.target); }
        });
      }, { threshold: .35 });
      archs.forEach(function (f) { f.classList.add('is-armed'); aobs.observe(f); });
    }
    archs.forEach(function (f) {
      var b = $('.arch-replay', f);
      if (!b) return;
      b.addEventListener('click', function () {
        flow(f, false);
        f.classList.remove('is-on');
        if (reduce.matches) { f.classList.add('is-on'); return; }
        f.classList.add('is-armed');
        void f.offsetWidth;
        requestAnimationFrame(function () { runArch(f); });
      });
    });
  }

  /* ------------------------------------------------------------ 回路図（2D の配線が引かれる・3D に切り替え） */
  var circs = $$('.circ[data-circ]');
  if (circs.length) {
    if (!reduce.matches && 'IntersectionObserver' in window) {
      var cobs = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          $$('.cw', e.target).forEach(function (w, i) {
            w.setAttribute('pathLength', '1');
            w.style.transitionDelay = (i * 60) + 'ms';
          });
          void e.target.offsetWidth;
          e.target.classList.add('is-on');
          cobs.unobserve(e.target);
        });
      }, { threshold: .3 });
      circs.forEach(function (f) {
        $$('.cw', f).forEach(function (w) { w.setAttribute('pathLength', '1'); });
        f.classList.add('is-armed'); cobs.observe(f);
      });
    }
    var mod = null;
    var load3d = function () {
      if (!mod) mod = import(new URL('circuit3d.js', SCRIPT_URL).href);
      return mod;
    };
    circs.forEach(function (f) {
      var v2 = $('.circ-2d', f), v3 = $('.circ-3d', f), segs = $$('.seg button', f);
      var view3d = null;
      segs.forEach(function (b) {
        b.addEventListener('click', function () {
          var to = b.getAttribute('data-view');
          segs.forEach(function (s) { s.setAttribute('aria-pressed', s === b ? 'true' : 'false'); });
          v2.hidden = to !== '2d'; v3.hidden = to !== '3d';
          if (to === '3d') {
            if (view3d) { view3d.show(); return; }
            var data = JSON.parse($('.circ-data', f).textContent);
            load3d().then(function (m) {
              view3d = m.mount(v3, data, { reduce: reduce.matches });
            }).catch(function () {
              var msg = $('.c3-msg', v3);
              if (msg) msg.textContent = '3D を表示できませんでした（WebGL に対応したブラウザーでご覧ください）。';
            });
          } else if (view3d) { view3d.hide(); }
        });
      });
    });
  }

  /* ------------------------------------------------------------ 目次（事例ページ） */
  var tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var tobs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          tocLinks.forEach(function (a) { a.classList.remove('on'); });
          var a = byId[e.target.id]; if (a) a.classList.add('on');
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    $$('.dsec').forEach(function (s) { tobs.observe(s); });
  }

  /* ------------------------------------------------------------ 連絡（メールアプリを開く） */
  var form = $('#contact-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = new FormData(form);
      var body = d.get('message') + '\n\n' + d.get('name') + '\n' + d.get('email');
      location.href = 'mailto:' + form.getAttribute('data-to') + '?subject=' + encodeURIComponent(form.getAttribute('data-subject')) + '&body=' + encodeURIComponent(body);
    });
  }
})();
