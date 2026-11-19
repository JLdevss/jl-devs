(() => {
  "use strict";

  /* ---------------- Config ---------------- */
  const FRAME_COUNT = 122;
  const IMG_W = 1296, IMG_H = 640;
  const frameSrc = i => `/imobiliaria/frames/f${String(i + 1).padStart(3, "0")}.webp`;
  const FRAMES_END = 0.8;      // timeline position where the descent reaches the last frame
  const PICK_AT = 0.83;        // descent progress at which the floor picker turns on

  // Facade geometry, in final-frame pixels (1296x640), measured from the balcony light strips.
  // Two-point perspective: the tower's front corner is at cx, the horizon at y=345, and each
  // face's floor lines run from the corner to its vanishing point (vl / vr) on that horizon.
  const GEO = {
    cx: 648, horizon: 345, vl: 196, vr: 1100,
    left: y => 398 - (3 * Math.max(0, y)) / 402,
    right: y => 888 + (12 * Math.max(0, y)) / 402,
    // floor slabs at the corner, bottom to top, 50px apart; upper ones only show on the faces
    slabs: Array.from({ length: 14 }, (_, i) => 390 - 50 * i).reverse(),
    firstFloor: 4,
    tower: [[398, 0], [888, 0], [900, 402], [648, 407], [395, 402]],
    building: [[398, 0], [888, 0], [900, 404], [1028, 412], [1030, 640], [256, 640], [260, 408], [395, 402]],
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  /* ---------------- Elements ---------------- */
  const $ = s => document.querySelector(s);
  const stage = $("#stage");
  const canvas = $("#canvas");
  const ctx = canvas.getContext("2d");
  const svg = $("#facade");
  const floorsG = $("#floors");
  const sweep = $("#sweep");
  const tag = $("#tag");
  const panel = $("#panel");
  const statusBox = $("#status");
  const statusFloor = $("#statusFloor");
  const statusNote = $("#statusNote");
  const loader = $("#loader");
  const loaderText = $("#loaderText");
  const descent = $("#descida");
  const nav = $("#nav");

  /* ---------------- Frames ---------------- */
  const frames = new Array(FRAME_COUNT);
  let loaded = 0;
  let current = 0;
  let finalImg = null;

  function loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function nearestLoaded(i) {
    if (frames[i]) return frames[i];
    for (let d = 1; d < FRAME_COUNT; d++) {
      if (frames[i - d]) return frames[i - d];
      if (frames[i + d]) return frames[i + d];
    }
    return null;
  }

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = stage.clientWidth, h = stage.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    draw(current);
  }

  // How the frame sits in the stage, in CSS px. Normally "cover". On portrait screens the picker
  // eases into "fit the tower's width, bottom-aligned" (fit = 1) so every floor is reachable.
  const view = { fit: 0 };
  const TOWER_X0 = 372, TOWER_X1 = 920;
  function layout() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const sc = Math.max(W / IMG_W, H / IMG_H);
    const c = { s: sc, dx: (W - IMG_W * sc) / 2, dy: (H - IMG_H * sc) / 2 };
    if (view.fit <= 0) return c;
    const sf = W / (TOWER_X1 - TOWER_X0);
    const f = { s: sf, dx: -TOWER_X0 * sf, dy: H - IMG_H * sf - Math.min(H * 0.04, 40) };
    const t = view.fit;
    return { s: c.s + (f.s - c.s) * t, dx: c.dx + (f.dx - c.dx) * t, dy: c.dy + (f.dy - c.dy) * t };
  }

  function draw(i) {
    current = i;
    const img = (i === FRAME_COUNT - 1 && finalImg) ? finalImg : nearestLoaded(i);
    if (!img) return;
    const k = canvas.width / stage.clientWidth;   // device pixel ratio actually applied
    const L = layout();
    if (view.fit > 0) { ctx.fillStyle = "#050B16"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, L.dx * k, L.dy * k, IMG_W * L.s * k, IMG_H * L.s * k);
    // keep the facade overlay locked to the photo
    const W = stage.clientWidth, H = stage.clientHeight;
    svg.setAttribute("viewBox", `${(-L.dx / L.s).toFixed(2)} ${(-L.dy / L.s).toFixed(2)} ${(W / L.s).toFixed(2)} ${(H / L.s).toFixed(2)}`);
  }
  const portrait = () => stage.clientWidth / stage.clientHeight < 0.9;

  async function preload() {
    // first and last frame first, so the page is usable immediately and the picker has its photo
    const [first, last] = await Promise.all([loadImage(frameSrc(0)), loadImage("/imobiliaria/frames/final.webp")]);
    frames[0] = first; finalImg = last; loaded = 1;
    draw(reduceMotion ? FRAME_COUNT - 1 : current);   // the timeline may already be past frame 0

    if (reduceMotion) { finishLoader(); return; }

    // then the rest, a few at a time, evenly spread so any scroll position has a near frame early
    const order = [];
    for (let step = 32; step >= 1; step = Math.floor(step / 2)) {
      for (let i = 0; i < FRAME_COUNT; i += step) if (!order.includes(i) && i !== 0 && i !== FRAME_COUNT - 1) order.push(i);   // last frame is final.webp
      if (step === 1) break;
    }
    let idx = 0;
    const worker = async () => {
      while (idx < order.length) {
        const i = order[idx++];
        frames[i] = await loadImage(frameSrc(i));
        loaded++;
        loaderText.textContent = `Carregando o prédio ${Math.round((loaded / FRAME_COUNT) * 100)}%`;
        if (Math.abs(i - current) < 3) draw(current);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    finishLoader();
  }

  function finishLoader() {
    loaderText.textContent = "Pronto. Agora role: a obra desce.";
    setTimeout(() => loader.classList.add("is-done"), 2200);
  }

  /* ---------------- Facade geometry ---------------- */
  // y of the floor line through corner height yc, at image x
  const yAt = (yc, x) => {
    const t = x >= GEO.cx ? (x - GEO.cx) / (GEO.vr - GEO.cx) : (GEO.cx - x) / (GEO.cx - GEO.vl);
    return yc + (GEO.horizon - yc) * t;
  };
  const pts = arr => arr.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ");

  function lineAt(yc) {
    const L = 380, R = 912;
    return [[L, yAt(yc, L)], [GEO.cx, yc], [R, yAt(yc, R)]];
  }

  const bounds = GEO.slabs;   // top to bottom

  const floors = [];   // bottom-up
  for (let i = bounds.length - 2, n = GEO.firstFloor; i >= 0; i--, n++) {
    floors.push({ n, top: bounds[i], bottom: bounds[i + 1] });
  }

  const SVGNS = "http://www.w3.org/2000/svg";
  $("#towerPoly").setAttribute("points", pts(GEO.tower));
  $("#buildingPoly").setAttribute("points", pts(GEO.building));

  floors.forEach(f => {
    const top = lineAt(f.top), bottom = lineAt(f.bottom).reverse();
    const el = document.createElementNS(SVGNS, "polygon");
    el.setAttribute("points", pts([...top, ...bottom]));
    el.setAttribute("class", "floor");
    el.dataset.floor = f.n;
    f.el = el;
    floorsG.appendChild(el);
  });

  if (coarse) $("#pickerHelp").textContent = "Toque num andar do prédio ou no painel para abrir a planta.";

  /* ---------------- Elevator panel ---------------- */
  const label = n => `${n}º andar`;
  const desc = [...floors].reverse();     // highest first, like an elevator panel
  desc.forEach(f => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "floor-btn";
    b.textContent = f.n;
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", label(f.n));
    b.dataset.floor = f.n;
    f.btn = b;
    panel.appendChild(b);
  });
  const byN = n => floors.find(f => f.n === Number(n));

  /* ---------------- Hover / select ---------------- */
  let hovered = null, selected = null;

  function setHover(f) {
    if (hovered === f) return;
    if (hovered) { hovered.el.classList.remove("is-hover"); hovered.btn.classList.remove("is-hover"); }
    hovered = f;
    if (f) { f.el.classList.add("is-hover"); f.btn.classList.add("is-hover"); }
    stage.classList.toggle("is-focus", !!(f || selected));
  }

  function select(f) {
    if (selected && selected !== f) {
      selected.el.classList.remove("is-selected");
      selected.btn.setAttribute("aria-pressed", "false");
    }
    selected = f;
    if (selected) {
      selected.el.classList.add("is-selected");
      selected.btn.setAttribute("aria-pressed", "true");
      statusFloor.textContent = `${label(selected.n)} selecionado`;
      statusNote.textContent = "Final 1, 3 quartos. Clique de novo para rever a planta.";
      statusBox.classList.add("is-set");
    }
    stage.classList.toggle("is-focus", !!(hovered || selected));
  }

  function chooseFloor(f) {
    select(f);
    openPlan(f);
  }

  /* ---------------- Floor plan + room photos ---------------- */
  // Rooms in plan-image coordinates (1370x768: the native 2816x1536 plan at half size,
  // cropped to 1370 wide to drop a strip on its right edge)
  const PLAN_W = 1370, PLAN_H = 768;
  const ROOMS = [
    { id: "sala", name: "Sala de estar", box: [805, 378, 1255, 648], photo: "/imobiliaria/img/apto/sala.webp", alt: "Sala de estar em vista 360°, sofá em L cinza, TV e porta de vidro para a varanda" },
    { id: "cozinha", name: "Cozinha e jantar", box: [752, 100, 1105, 372], photo: "/imobiliaria/img/apto/cozinha.webp", alt: "Cozinha em vista 360°, armários de madeira clara, cooktop e janela sobre a pia" },
    { id: "quarto-1", name: "Quarto 1", box: [175, 100, 500, 372], photo: "/imobiliaria/img/apto/quarto-1.webp", alt: "Quarto 1, cama de casal, TV na parede, janela ampla e armário com espelho" },
    { id: "quarto-2", name: "Quarto 2", box: [505, 100, 748, 378], photo: "/imobiliaria/img/apto/quarto-2.webp", alt: "Quarto 2 em vista 360°, cama de casal, escrivaninha e porta de correr para a sacada" },
    { id: "quarto-3", name: "Quarto 3", box: [120, 385, 425, 648], photo: "/imobiliaria/img/apto/quarto-3.webp", alt: "Quarto 3, cama de casal, escrivaninha junto à janela do chão ao teto e armário de madeira" },
    { id: "banheiro", name: "Banheiro", box: [470, 462, 700, 648], photo: "/imobiliaria/img/apto/banheiro.webp", alt: "Banheiro visto de cima, box de vidro, bancada, vaso e lavadora no armário de madeira" },
  ];

  const dialog = $("#apto");
  const aptoTitle = $("#aptoTitle");
  const planRooms = $("#planRooms");
  const roomList = $("#roomList");
  const viewer = $("#viewer");
  const viewerImg = $("#viewerImg");
  const viewerName = $("#viewerName");
  const viewerCount = $("#viewerCount");
  let roomIndex = -1;
  let lastFocus = null;

  const pct = (v, total) => `${(v / total) * 100}%`;
  ROOMS.forEach((r, i) => {
    const [x1, y1, x2, y2] = r.box;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "room";
    b.dataset.room = i;
    b.style.cssText = `left:${pct(x1, PLAN_W)};top:${pct(y1, PLAN_H)};width:${pct(x2 - x1, PLAN_W)};height:${pct(y2 - y1, PLAN_H)}`;
    b.setAttribute("aria-label", `Ver foto: ${r.name}`);
    b.innerHTML = `<span class="room__tag">${r.name}</span>`;
    planRooms.appendChild(b);

    const li = document.createElement("li");
    const lb = document.createElement("button");
    lb.type = "button";
    lb.dataset.room = i;
    lb.textContent = r.name;
    li.appendChild(lb);
    roomList.appendChild(li);
    r.planBtn = b; r.listBtn = lb;
  });

  function hoverRoom(i) {
    ROOMS.forEach((r, k) => {
      r.planBtn.classList.toggle("is-hover", k === i);
      r.listBtn.classList.toggle("is-hover", k === i);
    });
  }

  function openPlan(f) {
    aptoTitle.innerHTML = `<span class="num">${f.n}º</span> andar · final 1`;
    closeRoom(false);
    lastFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    warmPhotos();
  }

  function closePlan() {
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener("close", () => {
    document.documentElement.style.overflow = "";
    closeRoom(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  });

  function showRoom(i) {
    roomIndex = (i + ROOMS.length) % ROOMS.length;
    const r = ROOMS[roomIndex];
    viewerImg.classList.remove("is-swap");
    viewerImg.onload = () => {   // on phones the photo is wider than the screen: start looking at its middle
      const pan = $("#viewerPan");
      pan.scrollLeft = (pan.scrollWidth - pan.clientWidth) / 2;
    };
    viewerImg.src = r.photo;
    viewerImg.alt = r.alt;
    void viewerImg.offsetWidth;
    viewerImg.classList.add("is-swap");
    const hint = $("#viewerHint");
    hint.style.animation = "none"; void hint.offsetWidth; hint.style.animation = "";
    viewerName.textContent = r.name;
    viewerCount.textContent = `${roomIndex + 1}/${ROOMS.length}`;
    if (viewer.hidden) { viewer.hidden = false; $("#viewerBack").focus({ preventScroll: true }); }
  }

  function closeRoom(refocus = true) {
    if (viewer.hidden) return;
    viewer.hidden = true;
    const r = ROOMS[roomIndex];
    roomIndex = -1;
    if (refocus && r) r.planBtn.focus({ preventScroll: true });
  }

  dialog.addEventListener("click", e => {
    if (e.target === dialog) { closePlan(); return; }          // click on the backdrop
    if (e.target.closest("[data-close-plan]")) { closePlan(); return; }
    const rb = e.target.closest("[data-room]");
    if (rb) showRoom(Number(rb.dataset.room));
  });
  dialog.addEventListener("pointerover", e => {
    const rb = e.target.closest("[data-room]");
    hoverRoom(rb ? Number(rb.dataset.room) : -1);
  });
  $("#viewerBack").addEventListener("click", () => closeRoom());
  $("#viewerPrev").addEventListener("click", () => showRoom(roomIndex - 1));
  $("#viewerNext").addEventListener("click", () => showRoom(roomIndex + 1));
  dialog.addEventListener("cancel", e => {                      // Esc: photo first, then the plan
    if (!viewer.hidden) { e.preventDefault(); closeRoom(); }
  });
  dialog.addEventListener("keydown", e => {
    if (viewer.hidden) return;
    if (e.key === "ArrowRight") showRoom(roomIndex + 1);
    if (e.key === "ArrowLeft") showRoom(roomIndex - 1);
  });
  // drag with the mouse to look around the panoramas (touch already scrolls natively)
  const pan = $("#viewerPan");
  let drag = null;
  pan.addEventListener("pointerdown", e => {
    if (e.pointerType !== "mouse") return;
    drag = { x: e.clientX, left: pan.scrollLeft };
    pan.classList.add("is-dragging");
    pan.setPointerCapture(e.pointerId);
  });
  pan.addEventListener("pointermove", e => { if (drag) pan.scrollLeft = drag.left - (e.clientX - drag.x); });
  const endDrag = () => { drag = null; pan.classList.remove("is-dragging"); };
  pan.addEventListener("pointerup", endDrag);
  pan.addEventListener("pointercancel", endDrag);

  // warm the photos once the plan is first opened
  let warmed = false;
  function warmPhotos() { if (warmed) return; warmed = true; ROOMS.forEach(r => { const i = new Image(); i.src = r.photo; }); }

  function moveTag(clientX, clientY, f) {
    const r = stage.getBoundingClientRect();
    tag.textContent = label(f.n);
    let x = Math.min(clientX - r.left + 16, r.width - tag.offsetWidth - 12);
    const pr = document.querySelector(".panel").getBoundingClientRect();
    const ty = clientY - r.top + 18;
    const overlapsPanel = ty + 30 > pr.top - r.top && ty < pr.bottom - r.top;
    if (overlapsPanel && r.left + x + tag.offsetWidth > pr.left - 12) x = pr.left - r.left - 12 - tag.offsetWidth;
    tag.style.transform = `translate(${x}px, ${ty}px)`;
    tag.classList.add("is-on");
  }

  function tagAtFloor(f) {
    // place the tag at the right edge of the floor band, in screen space
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = svg.createSVGPoint();
    const L = layout();
    const visibleRight = (stage.clientWidth - L.dx) / L.s - 70;   // keep the tag on screen
    const x = Math.min(GEO.right(0) + 4, visibleRight);
    p.x = x; p.y = (yAt(f.top, x) + yAt(f.bottom, x)) / 2;
    const s = p.matrixTransform(m);
    moveTag(s.x, s.y - 18, f);
  }

  floorsG.addEventListener("pointermove", e => {
    const f = byN(e.target.dataset.floor);
    if (!f) return;
    setHover(f);
    if (e.pointerType === "mouse") moveTag(e.clientX, e.clientY, f);
  });
  floorsG.addEventListener("pointerleave", () => { setHover(null); tag.classList.remove("is-on"); });
  floorsG.addEventListener("click", e => {
    const f = byN(e.target.dataset.floor);
    if (!f) return;
    tag.classList.remove("is-on");
    chooseFloor(f);
  });

  panel.addEventListener("click", e => {
    const b = e.target.closest(".floor-btn");
    if (b) chooseFloor(byN(b.dataset.floor));
  });
  panel.addEventListener("pointerover", e => {
    const b = e.target.closest(".floor-btn");
    if (b) { const f = byN(b.dataset.floor); setHover(f); tagAtFloor(f); }
  });
  panel.addEventListener("pointerleave", () => { setHover(null); tag.classList.remove("is-on"); });
  panel.addEventListener("focusin", e => {
    const b = e.target.closest(".floor-btn");
    if (b) { const f = byN(b.dataset.floor); setHover(f); tagAtFloor(f); }
  });
  panel.addEventListener("focusout", () => { setHover(null); tag.classList.remove("is-on"); });

  /* ---------------- Laser-level sweep ---------------- */
  let picking = false, swept = false, sweepTween = null;

  function runSweep() {
    if (swept || reduceMotion) { floors.forEach(f => f.el.classList.add("is-traced")); return; }
    swept = true;
    const state = { y: GEO.slabs[GEO.slabs.length - 1] + 4 };
    sweep.style.opacity = 1;
    sweepTween = gsap.to(state, {
      y: GEO.slabs[0] - 10, duration: 1.8, ease: "power2.inOut",
      onUpdate() {
        sweep.setAttribute("points", pts(lineAt(state.y)));
        floors.forEach(f => { if (state.y <= f.bottom) f.el.classList.add("is-traced"); });
      },
      onComplete() { gsap.to(sweep, { opacity: 0, duration: .5 }); },
    });
  }

  function setFit(target, animate = true) {
    if (!window.gsap || !animate || reduceMotion) { view.fit = target; draw(current); return; }
    gsap.to(view, { fit: target, duration: 1.1, ease: "power3.inOut", overwrite: true, onUpdate: () => draw(current) });
  }

  function setPicking(on) {
    if (on === picking) return;
    picking = on;
    stage.classList.toggle("is-picking", on);
    if (portrait()) setFit(on ? 1 : 0);   // the camera pulls back so the whole tower fits the phone
    if (on) runSweep();
    else { setHover(null); tag.classList.remove("is-on"); }
  }

  /* ---------------- Scroll choreography ---------------- */
  function gotoPicker(e) {
    if (e) e.preventDefault();
    const target = reduceMotion
      ? descent.offsetTop
      : descent.offsetTop + (descent.offsetHeight - window.innerHeight) * 0.9;
    window.scrollTo({ top: target, behavior: reduceMotion ? "auto" : "smooth" });
    setTimeout(() => { const first = panel.querySelector(".floor-btn"); if (first && !coarse) first.focus({ preventScroll: true }); }, reduceMotion ? 50 : 2600);
  }
  document.querySelectorAll('[data-goto="andares"]').forEach(a => a.addEventListener("click", gotoPicker));

  function setupScroll() {
    gsap.registerPlugin(ScrollTrigger);
    const proxy = { frame: 0 };

    const tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: { trigger: descent, start: "top top", end: "bottom bottom", scrub: 0.6 },
    });
    tl.to(proxy, { frame: FRAME_COUNT - 1, duration: FRAMES_END, onUpdate: () => draw(Math.round(proxy.frame)) }, 0)
      .to("#hero", { autoAlpha: 0, y: -40, duration: 0.1, ease: "power1.in" }, 0.02)
      .fromTo("#cap1", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.06, ease: "power2.out" }, 0.2)
      .to("#cap1", { autoAlpha: 0, y: -24, duration: 0.06 }, 0.38)
      .fromTo("#cap2", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.06, ease: "power2.out" }, 0.5)
      .to("#cap2", { autoAlpha: 0, y: -24, duration: 0.06 }, 0.68)
      .to("#scrimSide", { opacity: 1, duration: 0.06 }, 0.8)
      .fromTo(".picker", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.06, ease: "power2.out" }, 0.81)
      .to({}, { duration: 0.13 }, 0.87);   // hold the final frame while the visitor picks

    ScrollTrigger.create({
      trigger: descent, start: "top top", end: "bottom bottom",
      onUpdate: self => setPicking(self.progress >= PICK_AT),
    });

    ScrollTrigger.create({
      trigger: "#predio", start: () => `top ${nav.offsetHeight + 20}px`,
      onToggle: self => nav.classList.toggle("is-light", self.isActive),
      end: "max",
    });
  }

  function setupReduced() {
    gsap.set("#hero, #cap1, #cap2", { autoAlpha: 0 });
    gsap.set(".picker, #scrimSide", { autoAlpha: 1, opacity: 1 });
    setPicking(true);
    floors.forEach(f => f.el.classList.add("is-traced"));
  }

  /* ---------------- Boot ---------------- */
  window.addEventListener("resize", () => {
    view.fit = picking && portrait() ? 1 : 0;
    sizeCanvas();
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });
  sizeCanvas();
  preload();

  if (!window.gsap) {   // CDN unavailable: show the picker on the final frame so the page still works
    draw(FRAME_COUNT - 1);
    stage.classList.add("is-picking");
    document.querySelector(".picker").style.cssText = "opacity:1;visibility:visible";
    document.querySelector("#hero").style.display = "none";
    picking = true;
    return;
  }
  if (reduceMotion) setupReduced(); else setupScroll();
  document.fonts && document.fonts.ready.then(() => window.ScrollTrigger && ScrollTrigger.refresh());

  // Deep links to share over WhatsApp:
  //   #andares          -> the floor picker
  //   #andar-12         -> picker with the 12th floor lit
  //   #planta-12        -> 12th floor plan open
  //   #planta-12-sala   -> and the living-room photo open (room ids: sala, cozinha, quarto-1..3, banheiro)
  const deep = location.hash.match(/^#(?:andares|andar-(\d+)|planta-(\d+)(?:-([a-z0-9-]+))?)$/);
  if (deep) {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    requestAnimationFrame(() => {
      const top = reduceMotion ? descent.offsetTop : descent.offsetTop + (descent.offsetHeight - window.innerHeight) * 0.9;
      window.scrollTo({ top, behavior: "instant" });
      const f = byN(deep[1] || deep[2]);
      if (f && deep[1]) select(f);
      if (f && deep[2]) {
        chooseFloor(f);
        const ri = ROOMS.findIndex(r => r.id === deep[3]);
        if (ri >= 0) showRoom(ri);
      }
    });
  }
})();
