// 公開ページの 3D 星系（試作 /mnt/project-files/design/public-prototype.html を移植）
// - 中心の恒星 = 83Products、枝 = カテゴリ、公転する星 = 公開アイテム
// - スクロールでカメラが一周 → 一周後に星表（index.astro がサーバー側で描画）と連動
// - ロケット / 中継衛星 / コロニー / 連絡船 / 流れ星 / 彗星 / UFO / ソナーはアクセント
import * as THREE from 'three';

/**
 * @param {{ slug: string, name: string, name_en: string, color: string,
 *           items: { key: string, code: string, title: string, released_on: string | null, featured: boolean }[] }[]} DATA
 */
export function initSpace(DATA) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const all = DATA.flatMap((c) => c.items.map((it) => ({ ...it, cat: c })))
    .sort((a, b) => (b.released_on ?? '').localeCompare(a.released_on ?? ''));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isNarrow = () => innerWidth < 760;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------- Star catalog table (rows are server-rendered) ----------
  const tbody = document.getElementById('rows'), peek = document.getElementById('peek');
  /** @type {Record<string, HTMLElement>} */
  const rowEls = {};
  let listHotId = null;
  tbody?.querySelectorAll('tr.r').forEach((tr) => {
    const key = tr.dataset.key, color = tr.dataset.color, thumb = tr.dataset.thumb;
    rowEls[key] = tr;
    const on = () => {
      listHotId = key;
      peek.style.background = thumb
        ? `center / cover no-repeat url("${thumb.replace(/"/g, '%22')}"), #0d1236`
        : `radial-gradient(120% 90% at 20% 10%, ${color}, transparent 60%), radial-gradient(90% 80% at 90% 100%, #2B175E, transparent 70%), #0d1236`;
      peek.textContent = tr.dataset.label;
      peek.classList.add('on');
    };
    const off = () => { if (listHotId === key) listHotId = null; peek.classList.remove('on'); };
    tr.addEventListener('pointerenter', on); tr.addEventListener('pointerleave', off);
    tr.addEventListener('focus', on); tr.addEventListener('blur', off);
    tr.addEventListener('click', (e) => { const a = tr.querySelector('a'); if (a && e.target !== a) a.click(); });
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') tr.querySelector('a')?.click(); });
  });
  addEventListener('pointermove', (e) => { peek.style.left = Math.min(e.clientX + 20, innerWidth - 216) + 'px'; peek.style.top = (e.clientY - 66) + 'px'; });

  const filterEl = document.getElementById('filter');
  filterEl?.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    filterEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    tbody.querySelectorAll('tr').forEach((tr) => (tr.hidden = !(b.dataset.key === 'all' || tr.dataset.cat === b.dataset.key)));
  });

  // ---------- Three.js ----------
  const canvas = document.getElementById("scene");
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { canvas.remove(); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  // 試作（three r128）と同じ色の出方にする
  THREE.ColorManagement.enabled = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  const world = new THREE.Group(); scene.add(world);
  const ADD = THREE.AdditiveBlending;

  const tex = (draw, s = 128) => { const cv = document.createElement("canvas"); cv.width = cv.height = s; draw(cv.getContext("2d"), s); return new THREE.CanvasTexture(cv); };
  const glowTex = tex((g, s) => { const r = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(.15, "rgba(255,255,255,.8)"); r.addColorStop(.45, "rgba(255,255,255,.18)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, s, s); });
  const spikeTex = tex((g, s) => {
    g.translate(s/2, s/2);
    [0, Math.PI / 2].forEach(a => { g.save(); g.rotate(a); const l = g.createLinearGradient(-s/2, 0, s/2, 0); l.addColorStop(0, "rgba(255,255,255,0)"); l.addColorStop(.5, "rgba(255,255,255,.95)"); l.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = l; g.fillRect(-s/2, -1, s, 2); g.restore(); });
  }, 256);
  const sprite = (map, color, size, op = 1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, blending: ADD, transparent: true, depthWrite: false, opacity: op })); s.scale.setScalar(size); s.userData.base = size; return s; };
  const lineMat = (color, op) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, blending: ADD, depthWrite: false });

  // Root star
  const rootGlow = sprite(glowTex, "#FFC98A", 3, .55);
  const rootSpike = sprite(spikeTex, "#FFE7C2", 6, .3);
  world.add(rootGlow, sprite(glowTex, "#FFFFFF", .9, .85), rootSpike);

  // Orbit ring
  const ringPts = Array.from({ length: 161 }, (_, i) => { const a = i / 160 * Math.PI * 2; return new THREE.Vector3(Math.sin(a) * 6.2, 0, Math.cos(a) * 6.2); });
  world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), lineMat("#B8C0FF", .1)));

  const R = 6.2, YS = [1.0, -0.9, 1.6, -1.3, 0.3];
  const picks = [], cats = [], spriteById = {}, spikes = [];
  DATA.forEach((c, i) => {
    const phi = i / DATA.length * Math.PI * 2;
    const pos = new THREE.Vector3(Math.sin(phi) * R, YS[i % YS.length], Math.cos(phi) * R);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(pos.x * .45, pos.y + 2.2, pos.z * .45), pos);
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), lineMat("#B8C0FF", .2)));

    const g = new THREE.Group(); g.position.copy(pos); world.add(g);
    const glow = sprite(glowTex, c.color, 1.7, .6); glow.userData.kind = "cat"; glow.userData.cat = c;
    const sp = sprite(spikeTex, c.color, 3, .3); spikes.push(sp);
    g.add(glow, sprite(glowTex, "#FFFFFF", .5), sp);
    picks.push(glow);

    const orbit = new THREE.Group();
    orbit.rotation.x = 0.5 + i * 0.23; orbit.rotation.z = (i % 2 ? -1 : 1) * 0.35;
    g.add(orbit);
    const pts = [];
    c.items.forEach((it, j) => {
      const a = j / c.items.length * Math.PI * 2 + i, r = 1.9 + (j % 2) * 0.35;
      const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      const size = it.featured ? 1.15 : 0.8;
      const s = sprite(glowTex, c.color, size * .85, .65); s.position.copy(p); s.userData.kind = "item"; s.userData.item = it; s.userData.cat = c;
      const core = sprite(glowTex, "#FFFFFF", it.featured ? .26 : .18); core.position.copy(p);
      orbit.add(s, core);
      if (it.featured) { const fs = sprite(spikeTex, c.color, 1.8, .3); fs.position.copy(p); orbit.add(fs); spikes.push(fs); }
      picks.push(s); spriteById[it.key] = s;
      pts.push(new THREE.Vector3(), p);
    });
    orbit.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat("#B8C0FF", .2)));
    const oc = Array.from({ length: 65 }, (_, k) => { const a = k / 64 * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * 2.05, 0, Math.sin(a) * 2.05); });
    orbit.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(oc), lineMat("#B8C0FF", .12)));
    cats.push({ data: c, group: g, orbit, phi, y: YS[i % YS.length], speed: 0.12 + i * 0.03 });
  });


  // ---------- Nebula: procedural (domain-warped fBm), baked once into a cube map ----------
  {
    const NOISE = `
      vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
      vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
      float snoise(vec3 v){ const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
        vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx); vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g;
        vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy); vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
        i=mod289(i); vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
        float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
        vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
        vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.)); vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
        vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
        vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
        vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
        return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3))); }
      float fbm(vec3 p){ float f=0., a=.5; for(int i=0;i<6;i++){ f+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return f; }`;
    const nebMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: NOISE + `
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 axis = normalize(vec3(.28, 1., .38));                 // galactic plane normal
          float lat = dot(d, axis);
          float band = exp(-lat*lat*3.2);                             // milky-way band
          vec3 p = d * 1.05;
          vec3 q = vec3(fbm(p), fbm(p + vec3(5.2,1.3,2.8)), fbm(p + vec3(2.1,7.3,4.4)));
          vec3 r = vec3(fbm(p + 1.3*q + vec3(1.7,9.2,.4)), fbm(p + 1.3*q + vec3(8.3,2.8,5.1)), 0.);
          float n = fbm(p + 1.5*r.xyy);
          float mask = .35 + .65 * smoothstep(-.4, .35, fbm(d * .55 + 4.));            // where the big clouds live
          float gas = pow(smoothstep(-.6, .9, n), 2.4) * (.35 + 1.3*band) * mask;
          float haze = smoothstep(-.5, .6, fbm(p * .5 + q * .6 + 2.)) * (.4 + band);   // soft large-scale glow
          float wisps = pow(smoothstep(.15, .85, fbm(p*2.2 + 2.*q)), 3.) * band * mask;
          float dust = smoothstep(.1, .5, fbm(p*1.7 + q*1.2 + 11.)) * smoothstep(.15, .8, band);
          vec3 deep = vec3(.03, .022, .06);
          vec3 teal = vec3(.32, .4, .72), magenta = vec3(1., .45, .42), violet = vec3(.62, .36, .82), rose = vec3(1., .62, .5), gold = vec3(1., .78, .5);
          float h1 = smoothstep(-.3, .4, q.x), h2 = smoothstep(-.1, .55, r.y);
          vec3 col = mix(teal, violet, h1);
          col = mix(col, magenta, h2 * .8);
          col = mix(col, gold, smoothstep(.2, .7, n) * .35);
          vec3 c = deep + col * gas * .38 + col * haze * .1 + rose * wisps * .13;
          float core = pow(max(n, 0.), 3.) * band * mask;
          c += gold * core * .55 + vec3(.85,.9,1.) * pow(band, 8.) * .06 * (.5 + mask);
          c *= 1. - dust * .3;
          c += vec3(.01,.015,.05) * (1. - band);
          c = 1. - exp(-c * 1.35);                                   // soft tone map
          gl_FragColor = vec4(c, 1.);
        }`
    });
    const nebScene = new THREE.Scene();
    nebScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), nebMat));
    const cubeRT = new THREE.WebGLCubeRenderTarget(isNarrow() ? 512 : 1024, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cubeCam = new THREE.CubeCamera(1, 200, cubeRT);
    cubeCam.update(renderer, nebScene);
    scene.background = cubeRT.texture;
    nebMat.dispose();
  }
  // Starfield: two layers, a few bright stars with spikes
  const N = isNarrow() ? 2000 : 4500;
  const sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const u = Math.random()*2-1, t = Math.random()*Math.PI*2, r = 35 + Math.random()*70, s = Math.sqrt(1-u*u); sp[i*3] = r*s*Math.cos(t); sp[i*3+1] = r*u; sp[i*3+2] = r*s*Math.sin(t); }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ map: glowTex, size: .95, color: "#FFFFFF", transparent: true, blending: ADD, depthWrite: false, opacity: 1 }));
  scene.add(stars);
  {
    const M = isNarrow() ? 3000 : 7000, mp = new Float32Array(M * 3), mc = new Float32Array(M * 3);
    const axis = new THREE.Vector3(.28, 1, .38).normalize(), t1 = new THREE.Vector3(1, 0, 0).cross(axis).normalize(), t2 = axis.clone().cross(t1);
    const tint = [new THREE.Color("#FFFFFF"), new THREE.Color("#CFE0FF"), new THREE.Color("#FFE2C0"), new THREE.Color("#BFD0FF")];
    for (let i = 0; i < M; i++) {
      const a = Math.random() * Math.PI * 2, g = (Math.random() + Math.random() + Math.random() - 1.5) * .22, r = 60 + Math.random() * 30;
      const v = t1.clone().multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a)).addScaledVector(axis, g).normalize().multiplyScalar(r);
      mp.set([v.x, v.y, v.z], i * 3); const c = tint[i % 4]; mc.set([c.r, c.g, c.b], i * 3);
    }
    const mg = new THREE.BufferGeometry(); mg.setAttribute("position", new THREE.BufferAttribute(mp, 3)); mg.setAttribute("color", new THREE.BufferAttribute(mc, 3));
    {
      const F = isNarrow() ? 3000 : 8000, fp = new Float32Array(F * 3);
      for (let i = 0; i < F; i++) { const u = Math.random()*2-1, t = Math.random()*Math.PI*2, r = 70 + Math.random()*25, s = Math.sqrt(1-u*u); fp[i*3] = r*s*Math.cos(t); fp[i*3+1] = r*u; fp[i*3+2] = r*s*Math.sin(t); }
      const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(fp, 3));
      stars.add(new THREE.Points(fg, new THREE.PointsMaterial({ map: glowTex, size: .5, color: "#E6EAFF", transparent: true, blending: ADD, depthWrite: false, opacity: .85 })));
    }
    stars.add(new THREE.Points(mg, new THREE.PointsMaterial({ map: glowTex, size: .8, vertexColors: true, transparent: true, blending: ADD, depthWrite: false, opacity: 1 })));
  }
  for (let i = 0; i < 14; i++) {
    const u = Math.random()*2-1, t = Math.random()*Math.PI*2, r = 40 + Math.random()*30, s = Math.sqrt(1-u*u);
    const b = sprite(spikeTex, "#DDE3FF", 2.5 + Math.random() * 2.5, .4); b.position.set(r*s*Math.cos(t), r*u, r*s*Math.sin(t)); stars.add(b);
  }

  // Labels
  const labelsEl = document.getElementById("labels");
  cats.forEach(c => { const el = document.createElement("div"); el.className = "node-label"; el.innerHTML = `<b>${esc(c.data.name_en)}</b> · ${String(c.data.items.length).padStart(2, "0")}`; labelsEl.appendChild(el); c.label = el; });


  // ---------- Spacecraft accents (each has a job) ----------
  const craftBody = new THREE.MeshBasicMaterial({ color: "#0b0f2e" });
  const edges = (geo, col, op = .95) => new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, blending: ADD, depthWrite: false }));
  const part = (geo, col, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.add(new THREE.Mesh(geo, craftBody), edges(geo, col)); g.position.set(x, y, z); return g; };
  const hitbox = (size, data) => { const h = sprite(glowTex, "#000000", size, 0.001); Object.assign(h.userData, data); picks.push(h); return h; };
  const crafts = [];

  // Rocket: carries the newest work from the core star out to its branch
  const newest = all[0] ?? null;
  const rocket = new THREE.Group();
  const rk = new THREE.Group(); rocket.add(rk);
  rk.add(part(new THREE.CylinderGeometry(.13, .17, .85, 10), "#E8ECFF"));
  rk.add(part(new THREE.ConeGeometry(.13, .38, 10), "#E8ECFF", 0, .62, 0));
  [0, 1, 2].forEach(k => { const f = part(new THREE.BoxGeometry(.02, .26, .2), newest?.cat.color ?? '#7CF2D8', 0, -.36, 0); f.rotation.y = k / 3 * Math.PI * 2; f.children.forEach(c => c.position.z = .17); rk.add(f); });
  const flame = sprite(glowTex, "#FFB46B", .9, .95); flame.position.y = -.6; rk.add(flame);
  rocket.add(hitbox(1.4, { kind: "rocket", item: newest }));
  rocket.scale.setScalar(.43);
  world.add(rocket);
  const trail = Array.from({ length: 48 }, () => { const t = sprite(glowTex, "#FFC98A", .3, 0); world.add(t); t.userData.life = 0; return t; });
  let trailI = 0;
  const rocketCat = newest ? cats.find(c => c.data === newest.cat) : null;
  if (!rocketCat) rocket.visible = false;
  const rv = new THREE.Vector3(), rv2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  // Relay satellites: one per broadcasting branch (YouTube / X / Discord)
  const sats = DATA.filter(c => ["youtube", "x", "discord"].includes(c.slug.toLowerCase()) || ["youtube", "x", "discord"].includes(String(c.name_en).toLowerCase())).map((c, i) => {
    const s = new THREE.Group();
    s.add(part(new THREE.BoxGeometry(.24, .24, .34), "#E8ECFF"));
    s.add(part(new THREE.BoxGeometry(.62, .015, .24), c.color, .46, 0, 0), part(new THREE.BoxGeometry(.62, .015, .24), c.color, -.46, 0, 0));
    const dish = part(new THREE.ConeGeometry(.14, .1, 12, 1, true), "#E8ECFF", 0, .18, 0); s.add(dish);
    const blink = sprite(glowTex, c.color, .5); blink.position.set(0, .3, 0); s.add(blink); s.userData.blink = blink;
    s.add(hitbox(1.3, { kind: "sat", cat: c }));
    s.scale.setScalar(.45);
    world.add(s);
    return { obj: s, cat: c, phase: i / 3 * Math.PI * 2 };
  });

  // Colony: a slowly turning ring station = the "about this site" place
  const colony = new THREE.Group();
  const ring = new THREE.TorusGeometry(1.25, .13, 8, 48);
  colony.add(part(ring, "#E8ECFF"));
  colony.add(part(new THREE.CylinderGeometry(.18, .18, .7, 12), "#E8ECFF"));
  [0, 1, 2, 3].forEach(k => { const sp = part(new THREE.CylinderGeometry(.025, .025, 1.1, 6), "#B8C0FF", 0, 0, 0); sp.rotation.z = Math.PI / 2; sp.rotation.y = k / 4 * Math.PI; sp.children.forEach(c => c.position.y = 0); colony.add(sp); });
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const w = sprite(glowTex, k % 3 ? "#FFE2B0" : "#7CF2D8", .28, .9); w.position.set(Math.cos(a) * 1.25, Math.sin(a) * 1.25, .12); colony.add(w); }
  const colonyBox = new THREE.Group(); colonyBox.add(colony);
  colonyBox.add(hitbox(3.2, { kind: "colony" }));
  colonyBox.position.set(9.5, 4.6, -9); colonyBox.rotation.set(.4, -.6, 0);
  world.add(colonyBox);


  // ---------- Ambient gimmicks (things that happen while you just watch) ----------
  const streakTex = tex((g, s) => { const l = g.createLinearGradient(0, 0, s, 0); l.addColorStop(0, "rgba(255,255,255,0)"); l.addColorStop(.85, "rgba(255,255,255,.9)"); l.addColorStop(1, "rgba(255,255,255,1)"); g.fillStyle = l; g.fillRect(0, s/2 - 2, s, 4); }, 256);
  const ringTex = tex((g, s) => { g.strokeStyle = "rgba(255,255,255,1)"; g.lineWidth = 3; g.beginPath(); g.arc(s/2, s/2, s/2 - 4, 0, Math.PI * 2); g.stroke(); });
  const camR = new THREE.Vector3(), camU = new THREE.Vector3(), camF = new THREE.Vector3();
  // 1) shooting stars
  const meteors = Array.from({ length: 3 }, () => { const m = sprite(streakTex, "#FFFFFF", 1, 0); m.scale.set(5, .12, 1); scene.add(m); m.userData.life = 0; return m; });
  let nextMeteor = 2;
  // 2) comet with a long tail, every ~30 s
  const comet = sprite(glowTex, "#CFF6FF", 1.6, 0); scene.add(comet);
  const cometTail = Array.from({ length: 70 }, () => { const t = sprite(glowTex, "#9FE8FF", .6, 0); scene.add(t); t.userData.life = 0; return t; });
  let cometT = -1, nextComet = 9, cometTailI = 0; const cometFrom = new THREE.Vector3(), cometTo = new THREE.Vector3();
  // 3) shuttle commuting between the colony and a random branch
  const shuttle = new THREE.Group();
  shuttle.add(part(new THREE.ConeGeometry(.1, .36, 6), "#7CF2D8"));
  const sGlow = sprite(glowTex, "#7CF2D8", .5, .9); sGlow.position.y = -.22; shuttle.add(sGlow);
  shuttle.add(hitbox(1, { kind: "shuttle" }));
  world.add(shuttle);
  const shTrail = Array.from({ length: 30 }, () => { const t = sprite(glowTex, "#7CF2D8", .12, 0); world.add(t); t.userData.life = 0; return t; });
  let shTarget = cats[0], shT = 0, shI = 0;
  const sv = new THREE.Vector3(), sv2 = new THREE.Vector3(), sDir = new THREE.Vector3();
  // 4) click empty space -> sonar ping
  const pings = Array.from({ length: 4 }, () => { const r = sprite(ringTex, "#7CF2D8", 1, 0); world.add(r); r.userData.life = 0; return r; });
  let pingI = 0;
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
  function ping() {
    ray.setFromCamera(mouse, camera);
    if (!ray.ray.intersectPlane(plane, hitP)) return;
    world.worldToLocal(hitP);
    for (let k = 0; k < 2; k++) { const r = pings[pingI++ % pings.length]; r.position.copy(hitP); r.userData.life = 1 + k * .35; }
  }

  // 5) UFO pair: rare rendezvous flight (spiral around each other, zigzag, warp out). Click = they flee.
  function makeUfo(col) {
    const u = new THREE.Group();
    const disc = new THREE.SphereGeometry(.6, 24, 12); disc.scale(1, .22, 1);
    u.add(part(disc, "#E8ECFF"));
    const dome = new THREE.SphereGeometry(.26, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const d = part(dome, col, 0, .08, 0); u.add(d);
    const lights = [];
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const l = sprite(glowTex, k % 2 ? col : "#FFE2B0", .22, .9); l.position.set(Math.cos(a) * .6, -.02, Math.sin(a) * .6); u.add(l); lights.push(l); }
    const beam = sprite(glowTex, col, 1.4, 0); beam.position.y = -.2; u.add(beam);
    u.add(hitbox(1.8, { kind: "ufo" }));
    u.userData = { lights, beam }; u.visible = false; world.add(u); return u;
  }
  const ufos = [makeUfo("#7CF2D8"), makeUfo("#FF8FD0")];
  let ufoT = -1, nextUfo = 8, ufoFlee = 0;
  const uA = new THREE.Vector3(), uB = new THREE.Vector3(), uC = new THREE.Vector3();
  function startUfo() {
    ufoT = 0; ufoFlee = 0;
    const side = Math.random() < .5 ? -1 : 1;
    uA.set(side * 14, 2 + Math.random() * 3, -4 + Math.random() * 6);
    uB.set(-side * 3, 3.5 + Math.random() * 2, 4 + Math.random() * 3);
    uC.set(-side * 15, 6 + Math.random() * 3, -8);
  }
  function tickUfo(t, dt) {
    if (ufoT < 0) { if (t > nextUfo) startUfo(); else return; }
    ufoT += dt / (ufoFlee ? 1.2 : 16);
    const T = Math.min(ufoT, 1);
    // path: approach (0-.35), rendezvous loops around B (.35-.75), zigzag dash out (.75-1)
    const c = new THREE.Vector3();
    if (T < .35) { const e = T / .35; c.lerpVectors(uA, uB, e * e * (3 - 2 * e)); }
    else if (T < .75) { c.copy(uB); c.y += Math.sin((T - .35) / .4 * Math.PI * 2) * .6; }
    else { const e = (T - .75) / .25; c.lerpVectors(uB, uC, e * e); c.x += Math.sin(e * 18) * .8 * (1 - e); }
    const spin = T < .35 ? T * 6 : T < .75 ? 2.1 + (T - .35) * 40 : 18 + T * 10;
    const rad = T < .35 ? 1.6 : T < .75 ? 1.1 + Math.sin((T - .35) * 12) * .35 : .9;
    const fade = Math.min(1, T / .04, (1 - T) / .04);
    ufos.forEach((u, i) => {
      const a = spin + i * Math.PI;
      u.visible = fade > .01;
      u.position.set(c.x + Math.cos(a) * rad, c.y + Math.sin(a * .5) * .25 * (i ? 1 : -1), c.z + Math.sin(a) * rad);
      u.rotation.y = t * 4; u.rotation.z = Math.sin(a) * .25;
      u.scale.setScalar(.62 * fade);
      u.userData.lights.forEach((l, k) => l.material.opacity = ((Math.floor(t * 10) + k) % 4 === 0) ? 1 : .25);
      u.userData.beam.material.opacity = (T > .45 && T < .7) ? .35 + Math.sin(t * 8) * .15 : 0;
      u.userData.beam.scale.set(1.4, (T > .45 && T < .7) ? 3 : 1.4, 1);
    });
    if (ufoT >= 1) { ufoT = -1; nextUfo = t + 45 + Math.random() * 30; ufos.forEach(u => u.visible = false); }
  }
  function tickGimmicks(t, dt) {
    camera.matrixWorld.extractBasis(camR, camU, camF);
    // meteors
    if (t > nextMeteor) {
      const m = meteors.find(x => x.userData.life <= 0);
      if (m) {
        const a = -Math.PI / 5 - Math.random() * .5 + (Math.random() < .5 ? 0 : -Math.PI / 2.4);
        m.userData.dir = camR.clone().multiplyScalar(Math.cos(a)).addScaledVector(camU, Math.sin(a));
        m.position.copy(camera.position).addScaledVector(camF, -40).addScaledVector(camR, (Math.random() - .5) * 40).addScaledVector(camU, 6 + Math.random() * 14);
        m.material.rotation = a; m.userData.life = 1; m.userData.speed = 26 + Math.random() * 18;
      }
      nextMeteor = t + 2.5 + Math.random() * 4.5;
    }
    meteors.forEach(m => { if (m.userData.life > 0) { m.userData.life -= dt * 1.4; m.position.addScaledVector(m.userData.dir, m.userData.speed * dt); m.material.opacity = Math.sin(Math.max(m.userData.life, 0) * Math.PI) * .9; } });
    // comet
    if (cometT < 0 && t > nextComet) {
      cometT = 0;
      cometFrom.copy(camera.position).addScaledVector(camF, -60).addScaledVector(camR, -45).addScaledVector(camU, 18);
      cometTo.copy(camera.position).addScaledVector(camF, -55).addScaledVector(camR, 45).addScaledVector(camU, 6);
    }
    if (cometT >= 0) {
      cometT += dt / 14;
      comet.position.lerpVectors(cometFrom, cometTo, cometT);
      comet.material.opacity = Math.sin(Math.min(cometT, 1) * Math.PI);
      if (Math.random() < .8) { const tl = cometTail[cometTailI++ % cometTail.length]; tl.position.copy(comet.position).add(new THREE.Vector3((Math.random() - .5) * .3, (Math.random() - .5) * .3, 0)); tl.userData.life = 1; }
      if (cometT >= 1) { cometT = -1; nextComet = t + 24 + Math.random() * 12; comet.material.opacity = 0; }
    }
    cometTail.forEach(tl => { if (tl.userData.life > 0) { tl.userData.life -= dt * .45; tl.position.addScaledVector(camU, dt * .25); tl.material.opacity = Math.max(tl.userData.life, 0) * .45 * comet.material.opacity; tl.scale.setScalar(.5 + (1 - tl.userData.life) * 1.4); } });
    // shuttle: 0..1 out, 1..2 back
    if (!cats.length) { shuttle.visible = false; } else {
    shT += dt / 6;
    if (shT >= 2) { shT = 0; shTarget = cats[Math.floor(Math.random() * cats.length)]; }
    colonyBox.getWorldPosition(sv); world.worldToLocal(sv);
    shTarget.group.getWorldPosition(sv2); world.worldToLocal(sv2);
    const leg = shT < 1 ? shT : 2 - shT, e = leg * leg * (3 - 2 * leg);
    const prev = shuttle.position.clone();
    shuttle.position.lerpVectors(sv, sv2, e); shuttle.position.y += Math.sin(e * Math.PI) * 2.2;
    sDir.subVectors(shuttle.position, prev); if (sDir.lengthSq() > 1e-6) shuttle.quaternion.setFromUnitVectors(up, sDir.normalize());
    shuttle.visible = e > .04 && e < .96;
    if (shuttle.visible && Math.random() < .7) { const tr = shTrail[shI++ % shTrail.length]; tr.position.copy(shuttle.position); tr.userData.life = 1; }
    }
    shTrail.forEach(tr => { if (tr.userData.life > 0) { tr.userData.life -= dt * 1.2; tr.material.opacity = Math.max(tr.userData.life, 0) * .5; } });
    tickUfo(t, dt);
    // pings
    pings.forEach(r => { if (r.userData.life > 0) { r.userData.life -= dt * .8; const l = Math.min(r.userData.life, 1); r.scale.setScalar(.4 + (1 - l) * 3.6); r.material.opacity = l * .6; } });
  }

  // ---------- Scroll mapping ----------
  const intro = document.getElementById("intro"), bar = document.querySelector(".bar");
  const hero = document.getElementById("hero"), caption = document.getElementById("caption"), finale = document.getElementById("finale");
  const capIdx = document.getElementById("cap-idx"), capName = document.getElementById("cap-name"), capSub = document.getElementById("cap-sub");
  const lapEl = document.getElementById("lap"), progEl = document.getElementById("progress");
  const introEnd = () => intro.offsetHeight - innerHeight;
  document.getElementById("skip").addEventListener("click", () => scrollTo({ top: introEnd() + innerHeight * 0.6, behavior: reduceMotion ? "auto" : "smooth" }));

  let curCap = -1;
  function setCaption(i) {
    if (i === curCap) return; curCap = i;
    if (i < 0) { caption.style.opacity = 0; return; }
    const c = DATA[i];
    capIdx.textContent = `Branch ${i + 1} / ${DATA.length}`;
    capName.innerHTML = `${esc(c.name_en)}<span class="dot" style="background:${c.color};color:${c.color}"></span>`;
    capSub.textContent = `${c.name} · ${c.items.length} 作品`;
    caption.style.opacity = 1;
  }
  const cam = { theta: 0, r: 17, h: 4, x: 0, ly: 0 }, tgt = { ...cam };
  function readScroll() {
    const end = introEnd();
    const p = clamp(scrollY / end, 0, 1), post = clamp((scrollY - end) / (innerHeight * 0.8), 0, 1);
    tgt.theta = p * Math.PI * 2;
    tgt.r = 17 - 6 * Math.sin(Math.PI * p) + post * (isNarrow() ? 4 : 1);
    tgt.h = 3.2 + 3.5 * Math.sin(Math.PI * p) + post * 2;
    tgt.x = isNarrow() ? 0 : post * 6;
    tgt.ly = -2.4 * (1 - smooth(0, 0.1, p));
    bar.classList.toggle("solid", scrollY > end + innerHeight * 0.3);
    hero.style.opacity = 1 - smooth(0.015, 0.07, p);
    hero.style.transform = `translateY(${-smooth(0, 0.08, p) * 40}px)`;
    finale.style.opacity = smooth(0.9, 0.97, p) * (1 - smooth(0.1, 0.5, post));
    if (p > 0.06 && p < 0.88) {
      let best = 0, bd = 9;
      cats.forEach((c, i) => { const d = Math.abs(((tgt.theta - c.phi) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI); if (d < bd) { bd = d; best = i; } });
      setCaption(best);
    } else setCaption(-1);
    lapEl.textContent = `LAP ${String(Math.round(p * 360)).padStart(3, "0")}°`;
    progEl.style.transform = `scaleX(${p})`;
  }
  addEventListener("scroll", readScroll, { passive: true });

  // ---------- Hover / click ----------
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(-9, -9), tip = document.getElementById("tip");
  addEventListener("pointermove", e => {
    mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - 250) + "px"; tip.style.top = (e.clientY + 14) + "px";
  });
  const pickAt = () => { ray.setFromCamera(mouse, camera); const vis = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; }; const h = ray.intersectObjects(picks, false).find(x => vis(x.object)); return h ? h.object : null; };
  canvas.addEventListener("click", () => {
    const o = pickAt(); if (!o) { if (!reduceMotion) ping(); return; }
    if (o.userData.kind === "shuttle") return;
    if (o.userData.kind === "ufo") { if (!ufoFlee) { ufoFlee = 1; uC.set(uC.x * 2, uC.y + 12, -30); ufoT = Math.max(ufoT, .75); } return; }
    if (o.userData.kind === "colony") { document.getElementById("about").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); return; }
    const row = (o.userData.kind === "item" || o.userData.kind === "rocket") ? rowEls[o.userData.item.key] : tbody.querySelector(`tr[data-cat="${CSS.escape(o.userData.cat.slug)}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    row.classList.add("hot"); setTimeout(() => row.classList.remove("hot"), 1600);
  });

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.fov = isNarrow() ? 58 : 45; camera.updateProjectionMatrix();
    readScroll();
  }
  addEventListener("resize", resize); resize();
  Object.assign(cam, tgt);

  const v = new THREE.Vector3(), t0 = performance.now();
  let last = t0;
  function frame() {
    const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05), t = (now - t0) / 1000;
    last = now;
    const k = reduceMotion ? 1 : 1 - Math.pow(0.0015, dt);
    for (const key in cam) cam[key] += (tgt[key] - cam[key]) * k;
    const sway = reduceMotion ? 0 : Math.sin(t * 0.15) * 0.08;
    camera.position.set(Math.sin(cam.theta + sway) * cam.r, cam.h, Math.cos(cam.theta + sway) * cam.r);
    camera.lookAt(0, 0.2 + cam.ly, 0);
    world.position.x = cam.x * Math.cos(cam.theta); world.position.z = -cam.x * Math.sin(cam.theta);
    if (!reduceMotion) {
      cats.forEach(c => { c.orbit.rotation.y = t * c.speed; c.group.position.y = c.y + Math.sin(t * 0.6 + c.phi) * 0.12; });
      stars.rotation.y = t * 0.004;
      rootGlow.scale.setScalar(3 + Math.sin(t * 1.4) * 0.12);
      rootSpike.material.rotation = Math.sin(t * .2) * .05;
      spikes.forEach((s, i) => s.material.opacity = .26 + Math.sin(t * 1.7 + i) * .07);
    }
    // crafts
    {
      if (rocketCat) {
      const cycle = 8, tt = reduceMotion ? 0.62 * cycle : (t % cycle), f = clamp(tt / 4.6, 0, 1);
      rocketCat.group.getWorldPosition(rv2); world.worldToLocal(rv2);
      const ctrl = new THREE.Vector3(rv2.x * .35, rv2.y + 4.2, rv2.z * .35);
      const ease = f * f * (3 - 2 * f), u = .04 + ease * .9;
      const q = (a, b, c, x) => (1 - x) * (1 - x) * a + 2 * (1 - x) * x * b + x * x * c;
      rocket.position.set(q(0, ctrl.x, rv2.x, u), q(0, ctrl.y, rv2.y, u), q(0, ctrl.z, rv2.z, u));
      rv.set(q(0, ctrl.x, rv2.x, u + .01), q(0, ctrl.y, rv2.y, u + .01), q(0, ctrl.z, rv2.z, u + .01)).sub(rocket.position).normalize();
      rk.quaternion.setFromUnitVectors(up, rv);
      rocket.visible = tt < 5.4;
      flame.scale.setScalar(.7 + Math.random() * .4);
      if (!reduceMotion && rocket.visible && f < 1) { const tr = trail[trailI++ % trail.length]; tr.position.copy(rocket.position).addScaledVector(rv, -.45); tr.userData.life = 1; }
      }
      trail.forEach(tr => { if (tr.userData.life > 0) { tr.userData.life -= dt * .9; tr.material.opacity = Math.max(tr.userData.life, 0) * .6; tr.scale.setScalar(.25 + (1 - tr.userData.life) * .5); } });
      sats.forEach((sa, i) => {
        const a = (reduceMotion ? 0 : t * .07) + sa.phase;
        sa.obj.position.set(Math.cos(a) * 10, Math.sin(a) * 2.2 + 1.5, Math.sin(a) * 10 * .8);
        sa.obj.rotation.y = a * 2; sa.obj.rotation.z = .3;
        sa.obj.userData.blink.material.opacity = (Math.sin(t * 3 + i * 2) > .6) ? 1 : .15;
      });
      if (!reduceMotion) { colony.rotation.z = t * .12; colonyBox.position.y = 4.6 + Math.sin(t * .4) * .25; }
    }
    if (!reduceMotion) tickGimmicks(t, dt);
    const hovered = pickAt();
    canvas.style.cursor = hovered ? "pointer" : "";
    if (hovered) {
      const d = hovered.userData;
      tip.innerHTML =
        d.kind === "item" ? `<span class="id">${esc(d.item.code)}</span>${esc(d.item.title)}` :
        d.kind === "rocket" ? `<span class="id">LAUNCH · 最新作</span>${esc(d.item.title)} を ${esc(d.item.cat.name_en)} へ運搬中` :
        d.kind === "sat" ? `<span class="id">RELAY SATELLITE</span>${esc(d.cat.name_en)} の発信を中継中` :
        d.kind === "colony" ? `<span class="id">COLONY 83</span>このサイトについて` :
        d.kind === "ufo" ? `<span class="id">UNIDENTIFIED</span>正体不明。クリックすると逃げます` :
        d.kind === "shuttle" ? `<span class="id">SHUTTLE</span>コロニーと${esc(shTarget?.data.name_en)}を往復中` :
        `<span class="id">BRANCH</span>${esc(d.cat.name_en)} · ${esc(d.cat.name)}`;
      tip.style.opacity = 1;
    } else tip.style.opacity = 0;
    const listHot = listHotId && spriteById[listHotId];
    picks.forEach(s => { if (s.material.opacity < .01) return; const goal = s.userData.base * ((s === hovered || s === listHot) ? 1.8 : 1); s.scale.setScalar(s.scale.x + (goal - s.scale.x) * (reduceMotion ? 1 : 0.18)); });
    cats.forEach(c => {
      c.group.getWorldPosition(v); v.y -= 1.2; v.project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      c.label.style.opacity = vis ? 1 : 0;
      c.label.style.transform = `translate(${(v.x * .5 + .5) * innerWidth}px, ${(-v.y * .5 + .5) * innerHeight}px) translate(-50%, 0)`;
    });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
