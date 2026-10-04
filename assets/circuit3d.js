// 回路図の 3D 表示。2D の回路図と同じデータ（部品の位置・端子・配線の経路）から、基板・部品・ジャンパー線を立体に組み立てる。
// three.js（MIT ライセンス）は assets/vendor/three/ に同梱。
import * as THREE from './vendor/three/three.module.js';

const S = 0.01;              // 2D の 1px → 3D の長さ
const PIN_IN = 6;            // 端子は、部品の縁から少し内側に立てる（px）
const FONT = '"IBM Plex Sans JP", "Hiragino Sans", "Noto Sans JP", sans-serif';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeBack = (t) => { t = Math.min(1, Math.max(0, t)); const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

function palette() {
  return {
    pwr: css('--w-pwr'), gnd: css('--w-gnd'), ana: css('--w-ana'), dig: css('--w-dig'), i2c: css('--w-i2c'), ser: css('--w-ser'),
    ink: css('--ink'), muted: css('--muted'), line: css('--line2'), accent: css('--accent'), bg: css('--bg'),
  };
}

// ---------------------------------------------------------------- 文字の面（シルク印刷）
function labelCanvas(part, ink, sub) {
  const k = Math.min(4, 2048 / Math.max(part.w, part.h));
  const c = document.createElement('canvas');
  c.width = Math.round(part.w * k); c.height = Math.round(part.h * k);
  const g = c.getContext('2d');
  g.scale(k, k);
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = `700 14px ${FONT}`;
  g.fillText(part.title, part.w / 2, 21, part.w - 16);
  if (part.sub) { g.globalAlpha = .78; g.font = `500 10.5px ${FONT}`; g.fillStyle = sub; g.fillText(part.sub, part.w / 2, part.h - 10, part.w - 16); g.globalAlpha = 1; }
  g.font = `600 10.5px ${FONT}`; g.fillStyle = ink;
  for (const [px, py, label, side] of part.pins) {
    if (!label) continue;
    const x = px - part.x, y = py - part.y;
    if (side === 'right') { g.textAlign = 'right'; g.fillText(label, x - 18, y + 4); }
    else if (side === 'left') { g.textAlign = 'left'; g.fillText(label, x + 18, y + 4); }
    else if (side === 'bottom') { g.textAlign = 'center'; g.fillText(label, x, y - 18); }
    else { g.textAlign = 'center'; g.fillText(label, x, y + 26); }
  }
  return c;
}

function spriteTexture(text, color) {
  const c = document.createElement('canvas'), k = 4;
  const g = c.getContext('2d');
  g.font = `600 ${12 * k}px ${FONT}`;
  const w = Math.ceil(g.measureText(text).width + 14 * k), h = 22 * k;
  c.width = w; c.height = h;
  g.font = `600 ${12 * k}px ${FONT}`;
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + k);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, w: w / k, h: h / k };
}

function textSprite(text, color) {
  const { tex, w, h } = spriteTexture(text, color);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(w * S * 1.1, h * S * 1.1, 1);
  sp.userData.text = text;
  return sp;
}

// ---------------------------------------------------------------- 本体
export function mount(container, data, opts = {}) {
  const stage = container.querySelector('.c3-stage');
  const reduce = !!opts.reduce;
  const W = data.w * S, D = data.h * S;
  const toX = (x) => (x - data.w / 2) * S, toZ = (y) => (y - data.h / 2) * S;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '回路図の 3D 表示。ドラッグか矢印キーで回転、プラスとマイナスのキーで拡大と縮小。');
  const msg = stage.querySelector('.c3-msg');
  if (msg) msg.remove();
  stage.appendChild(canvas);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
  const target = new THREE.Vector3(0, 0.12, 0);

  // 光
  const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-W * .35, Math.max(W, D) * 1.1, D * .55);
  sun.castShadow = true;
  const half = Math.max(W, D) * .7;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: .1, far: Math.max(W, D) * 4 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x88ccff, .5);
  rim.position.set(W, D * .4, -D);
  scene.add(rim);

  // 床（影だけ）と方眼
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, D * 3), new THREE.ShadowMaterial({ opacity: .2 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  const gridMinor = [], gridMajor = [];
  const gx = W * .6 + .4, gz = D * .6 + .4;
  for (let v = -Math.ceil(gx / .2) * .2; v <= gx; v += .2) {
    const arr = Math.abs(Math.round(v / .2)) % 5 === 0 ? gridMajor : gridMinor;
    arr.push(v, 0, -gz, v, 0, gz);
  }
  for (let v = -Math.ceil(gz / .2) * .2; v <= gz; v += .2) {
    const arr = Math.abs(Math.round(v / .2)) % 5 === 0 ? gridMajor : gridMinor;
    arr.push(-gx, 0, v, gx, 0, v);
  }
  const mkGrid = (arr, op) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ transparent: true, opacity: op, depthWrite: false }));
    ls.position.y = .001; scene.add(ls); return ls;
  };
  const gMinor = mkGrid(gridMinor, .25), gMajor = mkGrid(gridMajor, .55);

  // 共通の材質
  const M = {
    pcb: new THREE.MeshStandardMaterial({ color: 0x0f6276, roughness: .55, metalness: .1 }),
    mod: new THREE.MeshStandardMaterial({ color: 0x1d2b33, roughness: .6, metalness: .1 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: .45, metalness: .2 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc7ccd1, roughness: .28, metalness: .9 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: .3, metalness: .95 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: .7 }),
    standoff: new THREE.MeshStandardMaterial({ color: 0xb8a77a, roughness: .4, metalness: .6 }),
    bodyPC: new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: .4, metalness: .6 }),
  };
  const box = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; return m; };

  const partsGroup = new THREE.Group(); scene.add(partsGroup);
  const anims = [];        // 部品が降りてくる動き
  const labelJobs = [];    // フォントの読み込み後に文字を描く
  const pinTops = [];      // 端子の位置（配線の始点・終点に使う）
  const ledMats = [];
  const screens = [];

  function addLabel(group, part, top, ink, sub) {
    const geo = new THREE.PlaneGeometry(part.w * S, part.h * S);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2; plane.position.y = top + .0015;
    group.add(plane);
    labelJobs.push({ part, mat, ink, sub });
  }

  function addHeader(group, part, top, px, py, side) {
    const lx = toX(px) - group.position.x, lz = toZ(py) - group.position.z;
    let ix = 0, iz = 0;
    if (side === 'right') ix = -PIN_IN * S; else if (side === 'left') ix = PIN_IN * S;
    else if (side === 'bottom') iz = -PIN_IN * S; else iz = PIN_IN * S;
    const base = box(.085, .085, .085, M.plastic); base.position.set(lx + ix, top + .0425, lz + iz); group.add(base);
    const pin = box(.024, .07, .024, M.gold); pin.position.set(lx + ix, top + .12, lz + iz); group.add(pin);
    return { x: toX(px) + ix, z: toZ(py) + iz, y: top + .1 };
  }

  function edgeSide(part, x, y) {
    const d = [['left', Math.abs(x - part.x)], ['right', Math.abs(x - part.x - part.w)], ['top', Math.abs(y - part.y)], ['bottom', Math.abs(y - part.y - part.h)]];
    d.sort((a, b) => a[1] - b[1]);
    return d[0][0];
  }

  // 配線の端に、部品の一覧にない端子があれば加える
  const extraPins = data.parts.map(() => []);
  for (const w of data.wires) {
    for (const [x, y] of [w.pts[0], w.pts[w.pts.length - 1]]) {
      data.parts.forEach((p, i) => {
        if (x >= p.x - 1 && x <= p.x + p.w + 1 && y >= p.y - 1 && y <= p.y + p.h + 1) {
          const known = p.pins.concat(extraPins[i]).some(([px, py]) => Math.abs(px - x) < 1.5 && Math.abs(py - y) < 1.5);
          if (!known) extraPins[i].push([x, y, '', edgeSide(p, x, y)]);
        }
      });
    }
  }

  data.parts.forEach((p, i) => {
    const g = new THREE.Group();
    const cx = toX(p.x + p.w / 2), cz = toZ(p.y + p.h / 2), pw = p.w * S, pd = p.h * S;
    g.position.set(cx, 0, cz);
    partsGroup.add(g);
    let top = 0;
    const silk = '#eef3f3', silkSub = '#b9c9cc';
    if (p.look === 'cloud') {
      const h = .34;
      const mat = new THREE.MeshStandardMaterial({ color: 0x8aa0ff, transparent: true, opacity: .1, roughness: .2, depthWrite: false });
      const b = new THREE.Mesh(new THREE.BoxGeometry(pw, h, pd), mat); b.position.y = h / 2 + .04; g.add(b);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(pw, h, pd)), new THREE.LineDashedMaterial({ dashSize: .05, gapSize: .04, transparent: true, opacity: .8 }));
      edges.computeLineDistances(); edges.position.y = h / 2 + .04; g.add(edges);
      g.userData.cloud = { mat, edges };
      top = h + .04;
      addLabel(g, p, top, 'ink', 'muted');
    } else if (p.look === 'pc') {
      const base = box(pw, .05, pd * .62, M.bodyPC); base.position.set(0, .025, pd * .19); g.add(base);
      const scr = box(pw * .96, pd * .6, .03, M.bodyPC); scr.position.set(0, pd * .3 + .05, -pd * .2); scr.rotation.x = -.18; g.add(scr);
      const disp = new THREE.Mesh(new THREE.PlaneGeometry(pw * .88, pd * .5), new THREE.MeshBasicMaterial({ color: 0x0b1a22, toneMapped: false }));
      disp.position.set(0, 0, .016); scr.add(disp);
      screens.push(makeScreen(disp, pw * .88, pd * .5));
      top = .05;
      const lp = Object.assign({}, p, { pins: [] });
      const lbl = new THREE.Group(); lbl.position.set(0, 0, 0); g.add(lbl);
      addLabel(lbl, Object.assign(lp, { h: p.h }), top, 'ink', 'muted');
      lbl.position.z = pd * .19; lbl.scale.set(1, 1, .62);
    } else {
      const board = p.look === 'board';
      const th = board ? .06 : .045, lift = board ? .06 : .035;
      const pcb = box(pw, th, pd, board ? M.pcb : M.mod); pcb.position.y = lift + th / 2; g.add(pcb);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const so = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, lift, 10), M.standoff);
        so.position.set(sx * (pw / 2 - .07), lift / 2, sz * (pd / 2 - .07)); so.castShadow = true; g.add(so);
      }
      top = lift + th;
      if (board) {
        const chip = box(.5, .035, Math.min(.9, pd * .28), M.chip); chip.position.set(0, top + .0175, pd * .06); g.add(chip);
        if (/ESP32/.test(p.title)) {
          const can = box(Math.min(pw * .55, 1), .05, Math.min(pd * .3, .8), M.metal); can.position.set(0, top + .025, -pd * .2); g.add(can);
        } else {
          // USB と電源の端子は、奥の縁から少しはみ出す（手前の文字を隠さない）
          const usb = box(.42, .2, .46, M.metal); usb.position.set(-pw * .18, top + .1, -pd / 2 - .16); g.add(usb);
          const jack = box(.32, .22, .4, M.plastic); jack.position.set(pw * .2, top + .11, -pd / 2 - .13); g.add(jack);
        }
      } else if (p.look === 'buttons') {
        const caps = [0xe0484f, 0x3f8cff, 0xf3f3f3, 0xf3f3f3, 0xf3f3f3, 0xf3f3f3];
        p.pins.filter(([, , l]) => l !== 'GND').forEach(([px, py], k) => {
          const bx = toX(px) - cx + (p.pins[k][3] === 'left' ? 1.15 : -1.15), bz = toZ(py) - cz;
          const b0 = box(.2, .05, .2, M.plastic); b0.position.set(bx, top + .025, bz); g.add(b0);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(.065, .07, .06, 20), new THREE.MeshStandardMaterial({ color: caps[k] || 0xf3f3f3, roughness: .35 }));
          cap.position.set(bx, top + .08, bz); cap.castShadow = true; g.add(cap);
        });
      } else if (p.look === 'led') {
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff3355, emissiveIntensity: 1.6, roughness: .15, transparent: true, opacity: .92 });
        const lens = new THREE.Mesh(new THREE.SphereGeometry(.11, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(.11, .12, .14, 24), mat);
        body.position.set(pw * .12, top + .07, 0); lens.position.set(pw * .12, top + .14, 0);
        g.add(body, lens); ledMats.push(mat);
        const glow = new THREE.PointLight(0xff3355, .6, 1.2); glow.position.set(pw * .12, top + .3, 0); g.add(glow);
        mat.userData.light = glow;
      } else if (p.look === 'buzzer') {
        const bz = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .14, 32), M.chip); bz.position.set(pw * .33, top + .07, pd * .05); bz.castShadow = true; g.add(bz);
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .002, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        hole.position.set(pw * .33, top + .141, pd * .05); g.add(hole);
      } else if (p.look === 'oled') {
        const frame = box(pw * .62, .03, pd * .4, M.chip); frame.position.set(pw * .08, top + .015, pd * .06); g.add(frame);
        const disp = new THREE.Mesh(new THREE.PlaneGeometry(pw * .56, pd * .32), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
        disp.rotation.x = -Math.PI / 2; disp.position.set(pw * .08, top + .031, pd * .06); g.add(disp);
        screens.push(makeScreen(disp, pw * .56, pd * .32));
      } else {
        const chip = box(Math.min(.32, pw * .3), .03, Math.min(.32, pd * .3), M.chip); chip.position.set(pw * .08, top + .015, 0); g.add(chip);
      }
      addLabel(g, p, top, silk, silkSub);
    }
    if (p.look !== 'cloud') for (const [px, py, , side] of p.pins.concat(extraPins[i])) pinTops.push(addHeader(g, p, top, px, py, side));
    else for (const [px, py] of p.pins.concat(extraPins[i])) pinTops.push({ x: toX(px), z: toZ(py), y: .2 });
    anims.push({ g, delay: i * .1 });
  });

  // 小さな画面（OLED・PC）に流れる波形
  function makeScreen(mesh, w, h) {
    const c = document.createElement('canvas'); c.width = 256; c.height = Math.max(64, Math.round(256 * h / w));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    mesh.material.map = tex; mesh.material.needsUpdate = true;
    return { c, g: c.getContext('2d'), tex, x: 0 };
  }
  function drawScreens(t) {
    for (const s of screens) {
      const { c, g } = s, w = c.width, h = c.height;
      g.fillStyle = '#04121a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#5cf2ff'; g.lineWidth = 3; g.shadowColor = '#5cf2ff'; g.shadowBlur = 8;
      g.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const p = ((x / 90) + t * .9) % 1;
        const e = (q, c0, wd, a) => a * Math.exp(-Math.pow((q - c0) / wd, 2));
        const y = h / 2 - (e(p, .4, .02, 1) + e(p, .2, .05, .18) - e(p, .44, .02, .3) + e(p, .66, .07, .3)) * h * .34;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke(); g.shadowBlur = 0;
      s.tex.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- 配線
  const nearestPin = (x, y) => {
    const X = toX(x), Z = toZ(y);
    let best = null, bd = 1e9;
    for (const p of pinTops) { const d = Math.hypot(p.x - X, p.z - Z); if (d < bd) { bd = d; best = p; } }
    return bd < (PIN_IN + 4) * S ? best : { x: X, z: Z, y: .12 };
  };
  const wires = [];
  const pal0 = palette();
  data.wires.forEach((w, i) => {
    const flat = w.k === 'gnd' || w.k === 'pwr';
    const H = flat ? (w.k === 'gnd' ? .26 : .29) : .32 + (i % 6) * .035;
    const a = nearestPin(...w.pts[0]), b = nearestPin(...w.pts[w.pts.length - 1]);
    const pts = [new THREE.Vector3(a.x, a.y + .02, a.z), new THREE.Vector3(a.x, H, a.z)];
    const mid = w.pts.slice(1, -1).map(([x, y]) => new THREE.Vector3(toX(x), H, toZ(y)));
    // 端子は内側にずれているので、最初と最後の折れ点の高さをそろえる
    if (mid.length) {
      if (Math.abs(w.pts[1][1] - w.pts[0][1]) < 1) mid[0].z = a.z;
      if (Math.abs(w.pts[1][0] - w.pts[0][0]) < 1) mid[0].x = a.x;
      const L = mid.length - 1, n = w.pts.length;
      if (Math.abs(w.pts[n - 2][1] - w.pts[n - 1][1]) < 1) mid[L].z = b.z;
      if (Math.abs(w.pts[n - 2][0] - w.pts[n - 1][0]) < 1) mid[L].x = b.x;
    }
    pts.push(...mid, new THREE.Vector3(b.x, H, b.z), new THREE.Vector3(b.x, b.y + .02, b.z));
    // 角を丸める
    const path = new THREE.CurvePath();
    const clean = pts.filter((p, k) => k === 0 || p.distanceTo(pts[k - 1]) > 1e-4);
    let cur = clean[0].clone();
    for (let k = 1; k < clean.length - 1; k++) {
      const p = clean[k], n = clean[k + 1];
      const r = Math.min(.07, p.distanceTo(cur) / 2, p.distanceTo(n) / 2);
      const pin = p.clone().add(cur.clone().sub(p).setLength(r));
      const pout = p.clone().add(n.clone().sub(p).setLength(r));
      if (pin.distanceTo(cur) > 1e-4) path.add(new THREE.LineCurve3(cur, pin));
      path.add(new THREE.QuadraticBezierCurve3(pin, p.clone(), pout));
      cur = pout;
    }
    path.add(new THREE.LineCurve3(cur, clean[clean.length - 1]));
    const len = path.getLength();
    const seg = Math.max(24, Math.ceil(len * 70)), radial = 8;
    const geo = new THREE.TubeGeometry(path, seg, .016, radial, false);
    const wireless = w.label === 'Wi-Fi';
    const mat = new THREE.MeshStandardMaterial({ color: pal0[w.k] || '#888', roughness: .38, metalness: .05, transparent: wireless, opacity: wireless ? .28 : 1 });
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = !wireless;
    scene.add(mesh);
    const total = geo.index.count, perSeg = radial * 6;
    const item = { mesh, mat, k: w.k, total, perSeg, seg, path, len, delay: 0, pulse: null };
    if (!flat) {
      const pm = new THREE.MeshBasicMaterial({ color: pal0[w.k], toneMapped: false });
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(wireless ? .045 : .03, 14, 10), pm);
      pulse.visible = false; scene.add(pulse); item.pulse = pulse; item.speed = .9 / Math.max(.5, len); item.off = Math.random();
    }
    if (w.label) {
      const sp = textSprite(w.label, pal0.ink);
      const m = path.getPointAt(.5); sp.position.set(m.x, H + .16, m.z); scene.add(sp); item.sprite = sp;
    }
    wires.push(item);
  });

  // ---------------------------------------------------------------- 色（テーマ）
  function applyTheme() {
    const pal = palette(), dark = isDark();
    hemi.intensity = dark ? .75 : 1.15;
    hemi.groundColor.set(dark ? 0x10202a : 0x8a7a76);
    sun.intensity = dark ? 2.0 : 2.4;
    floor.material.opacity = dark ? .45 : .16;
    gMinor.material.color.set(pal.line); gMajor.material.color.set(pal.line);
    gMinor.material.opacity = dark ? .22 : .35; gMajor.material.opacity = dark ? .5 : .7;
    renderer.toneMappingExposure = dark ? 1.0 : 1.08;
    for (const w of wires) {
      w.mat.color.set(pal[w.k] || '#888');
      if (w.pulse) w.pulse.material.color.set(pal[w.k] || '#888');
      if (w.sprite) {
        const m = w.sprite.material; m.map.dispose();
        m.map = spriteTexture(w.sprite.userData.text, pal.ink).tex; m.needsUpdate = true;
      }
    }
    partsGroup.traverse((o) => {
      if (o.userData.cloud) { o.userData.cloud.edges.material.color.set(pal.accent); o.userData.cloud.mat.color.set(pal.accent); }
    });
    drawLabels();
    requestRender();
  }
  function drawLabels() {
    const pal = palette();
    for (const j of labelJobs) {
      const ink = j.ink === 'ink' ? pal.ink : j.ink, sub = j.sub === 'muted' ? pal.muted : j.sub;
      const c = labelCanvas(j.part, ink, sub);
      if (j.mat.map) j.mat.map.dispose();
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso;
      j.mat.map = tex; j.mat.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- 視点（ドラッグで回す）
  // 画面の縦横比に合わせて、全体が収まる距離を求める
  let R0 = 10, zoomed = false;
  const fitR = (az) => {
    const v = camera.fov * Math.PI / 180, hz = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
    const sw = Math.abs(W * Math.cos(az)) + Math.abs(D * Math.sin(az)), sd = Math.abs(W * Math.sin(az)) + Math.abs(D * Math.cos(az));
    return Math.max((sw * .5 + .2) * 1.04 / Math.tan(hz / 2), (sd * .5 + .3) * .8 / Math.tan(v / 2)) + .2;
  };
  // 縦長の画面（スマホ）では、横長の回路を 90 度回して、縦方向に並べる
  const homeAz = () => (camera.aspect < .95 && W > D ? -Math.PI / 2 + .22 : -.26);
  const HOME = { az: -.26, pol: .74, r: R0 };
  const view = { az: HOME.az, pol: HOME.pol, r: HOME.r };
  const goal = { ...HOME };
  const clampView = () => {
    goal.pol = Math.min(1.36, Math.max(.12, goal.pol));
    goal.r = Math.min(R0 * 1.9, Math.max(R0 * .38, goal.r));
  };
  function placeCamera() {
    const sp = Math.sin(view.pol);
    camera.position.set(target.x + Math.sin(view.az) * sp * view.r, target.y + Math.cos(view.pol) * view.r, target.z + Math.cos(view.az) * sp * view.r);
    camera.lookAt(target);
  }

  const pointers = new Map();
  let pinch0 = 0, r0 = 0;
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType !== 'touch') canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch0 = Math.hypot(p.x - q.x, p.y - q.y); r0 = goal.r; stage.classList.add('is-active'); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (pinch0 > 0) { zoomed = true; goal.r = r0 * pinch0 / d; clampView(); requestRender(); }
      return;
    }
    const dx = cur.x - prev.x, dy = cur.y - prev.y;
    goal.az -= dx * .008;
    if (e.pointerType !== 'touch') goal.pol -= dy * .006;
    clampView(); requestRender();
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) { pinch0 = 0; stage.classList.remove('is-active'); } };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') up(e); });
  canvas.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey && !e.altKey) return; // ふつうのホイールはページのスクロールに使う
    e.preventDefault();
    zoomed = true; goal.r *= Math.exp(e.deltaY * .0025); clampView(); requestRender();
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') goal.az += .15; else if (k === 'ArrowRight') goal.az -= .15;
    else if (k === 'ArrowUp') goal.pol -= .1; else if (k === 'ArrowDown') goal.pol += .1;
    else if (k === '+' || k === '=') { zoomed = true; goal.r *= .88; } else if (k === '-') { zoomed = true; goal.r *= 1.14; }
    else return;
    e.preventDefault(); clampView(); requestRender();
  });

  // ---------------------------------------------------------------- 組み上がる動き
  let t0 = 0, clock = 0, shown = true, onScreen = true;
  const partsEnd = anims.length * .1 + .6;
  wires.forEach((w, i) => { w.delay = partsEnd + i * .07; });
  const allEnd = partsEnd + wires.length * .07 + .9;

  function setProgress(t) {
    for (const a of anims) {
      const k = reduce ? 1 : easeBack((t - a.delay) / .6);
      a.g.position.y = (1 - k) * .9;
      a.g.visible = reduce || t >= a.delay;
      const s = .92 + .08 * Math.min(1, k); a.g.scale.setScalar(s);
    }
    for (const w of wires) {
      const k = reduce ? 1 : ease((t - w.delay) / .8);
      const n = Math.round(k * w.seg) * w.perSeg;
      w.mesh.geometry.setDrawRange(0, Math.min(w.total, n));
      w.mesh.visible = n > 0;
      if (w.sprite) w.sprite.visible = k > .6;
    }
  }
  function replay() {
    t0 = performance.now() / 1000;
    if (!reduce) { view.az = HOME.az - .9; view.pol = HOME.pol + .35; view.r = HOME.r * 1.25; Object.assign(goal, HOME); }
    requestRender();
  }

  // ---------------------------------------------------------------- 描画
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const before = R0, az = homeAz(), turned = az !== HOME.az;
    HOME.az = az;
    R0 = HOME.r = fitR(az);
    if (!zoomed) { goal.r = R0; view.r *= R0 / before; }
    if (turned && !zoomed) { goal.az = az; view.az = az; }
  }
  let rafId = 0;
  function requestRender() { if (!rafId && shown && onScreen) rafId = requestAnimationFrame(frame); }
  function frame(now) {
    rafId = 0;
    const t = now / 1000 - t0;
    clock = now / 1000;
    setProgress(t);
    // 視点を滑らかに追いかける
    const f = reduce ? 1 : .14;
    view.az += (goal.az - view.az) * f; view.pol += (goal.pol - view.pol) * f; view.r += (goal.r - view.r) * f;
    if (!reduce && t < allEnd) { // 組み立て中は、ゆっくり正面へ回り込む
      const k = ease(t / allEnd);
      view.az += (HOME.az - view.az) * .04 * k; view.pol += (HOME.pol - view.pol) * .04 * k;
    }
    placeCamera();
    const live = !reduce && t > allEnd - .4;
    for (const w of wires) {
      if (!w.pulse) continue;
      w.pulse.visible = live;
      if (live) { const u = ((clock * w.speed) + w.off) % 1; w.pulse.position.copy(w.path.getPointAt(u)); }
    }
    for (const m of ledMats) {
      const c = reduce ? new THREE.Color(0xff3355) : new THREE.Color().setHSL((clock * .12) % 1, 1, .55);
      m.emissive.copy(c); if (m.userData.light) m.userData.light.color.copy(c);
    }
    if (screens.length && (!reduce || !frame.drewScreens)) { drawScreens(reduce ? 0 : clock); frame.drewScreens = true; }
    renderer.render(scene, camera);
    const settling = Math.abs(goal.az - view.az) + Math.abs(goal.pol - view.pol) + Math.abs(goal.r - view.r) > 1e-3;
    if (!reduce || settling || t < allEnd) requestRender();
  }

  const ro = new ResizeObserver(() => { resize(); requestRender(); });
  ro.observe(stage);
  const io = new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; if (onScreen) requestRender(); });
  io.observe(stage);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestRender(); });
  document.addEventListener('themechange', applyTheme);

  container.querySelector('.c3-replay')?.addEventListener('click', replay);
  container.querySelector('.c3-reset')?.addEventListener('click', () => { zoomed = false; Object.assign(goal, HOME); requestRender(); });

  resize();
  applyTheme();
  const fontsReady = document.fonts?.load ? Promise.all([document.fonts.load(`700 14px ${FONT}`, '回路図'), document.fonts.load(`500 10px ${FONT}`, 'A0')]).catch(() => {}) : Promise.resolve();
  fontsReady.then(() => { drawLabels(); requestRender(); });
  replay();

  return {
    show() { shown = true; resize(); requestRender(); },
    hide() { shown = false; },
  };
}
