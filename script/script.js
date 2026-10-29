document.fonts.ready.then(() => {   // ждём шрифты, иначе размеры плашек будут неверные
  const { Engine, Bodies, Body, Composite, Events } = Matter;

  // ====== настройки ======
  const GRAVITY       = 1.2;   // сила тяжести
  const MOUSE_RADIUS  = 120;   // радиус действия курсора, px
  const MOUSE_FORCE   = 0.025; // сила отталкивания
  const MAX_SPEED     = 25;    // ограничение скорости (чтобы не пролетали сквозь стены)
  const SCROLL_START  = 20;    // через сколько px скролла начинается падение

  const section = document.querySelector('.second');
  const hero    = section.querySelector('.tags');   // коробка физики = блок .tags
  const tagEls  = [...hero.querySelectorAll('.tag')];

  const engine = Engine.create();
  engine.gravity.y = GRAVITY;

  let W = hero.clientWidth;
  let H = hero.clientHeight;
  let released = false;
  let mouse = null;

  // ====== тела плашек ======
  const items = tagEls.map(el => {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const body = Bodies.rectangle(0, 0, w, h, {
      restitution: 0.3,   // упругость
      friction: 0.5,
      frictionAir: 0.02,
      density: 0.002,
      chamfer: { radius: 2 }
    });
    return { el, body, w, h };
  });

  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;

  // на телефоне плашки стоят внизу блока шаткой башней:
  // самые длинные снизу, каждая следующая чуть сдвинута — башня кренится и вот-вот упадёт
  const TOWER_ZIGZAG = 0.07;   // сдвиг влево-вправо между ярусами (доля ширины экрана)
  const TOWER_LEAN   = 0.025;  // постепенный крен башни вправо на каждом ярусе
  const TOWER_TILT   = 0.7;    // наклон плашек, градусы

  function placeTower() {
    const order = items.map((it, i) => i).sort((a, b) => items[b].w - items[a].w);
    let bottom = H;                       // низ текущего яруса
    order.forEach((idx, level) => {
      const { body, w, h } = items[idx];
      const tilt = (level % 2 ? 1 : -1) * TOWER_TILT * Math.PI / 180;
      // плашки чуть наклонены в разные стороны и опираются друг на друга краем
      const extent = h * Math.cos(tilt) + w * Math.abs(Math.sin(tilt)) * 0.5;
      const zig = (level % 2 ? 1 : -1) * W * TOWER_ZIGZAG * (level ? 1 : 0);
      let x = W / 2 + zig + W * TOWER_LEAN * level;
      x = Math.min(Math.max(x, w / 2 + 4), W - w / 2 - 4);
      Body.setPosition(body, { x, y: bottom - extent / 2 });
      Body.setAngle(body, tilt);
      bottom -= extent + 0.5;             // крошечный зазор, чтобы плашки не «стреляли» на старте
    });
    items.topIdx = order[order.length - 1];
  }

  function placeInitial() {
    if (isMobile()) { placeTower(); return; }
    items.forEach(({ el, body }) => {
      Body.setPosition(body, {
        x: W * parseFloat(el.dataset.x) / 100,
        y: H * parseFloat(el.dataset.y) / 100
      });
      Body.setAngle(body, (parseFloat(el.dataset.angle) || 0) * Math.PI / 180);
    });
  }
  placeInitial();
  Composite.add(engine.world, items.map(i => i.body));

  // ====== стены ======
  const T = 200; // толщина стен
  const wallOpts = { isStatic: true };
  const floor   = Bodies.rectangle(0, 0, 1, T, wallOpts);
  const ceiling = Bodies.rectangle(0, 0, 1, T, wallOpts);
  const left    = Bodies.rectangle(0, 0, T, 1, wallOpts);
  const right   = Bodies.rectangle(0, 0, T, 1, wallOpts);
  let walls = [floor, ceiling, left, right];

  function buildWalls() {
    // пересоздаём стены под текущий размер секции
    Composite.remove(engine.world, walls);
    walls = [
      Bodies.rectangle(W / 2, H + T / 2, W + T * 2, T, wallOpts), // пол
      Bodies.rectangle(W / 2, -T / 2,    W + T * 2, T, wallOpts), // потолок
      Bodies.rectangle(-T / 2,    H / 2, T, H + T * 2, wallOpts), // левая
      Bodies.rectangle(W + T / 2, H / 2, T, H + T * 2, wallOpts)  // правая
    ];
    Composite.add(engine.world, walls);
  }
  buildWalls();

  // ====== старт падения при скролле ======
  function release() {
    if (released) return;
    released = true;
    items.forEach(({ body }) => {
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.06);
    });
    if (isMobile() && items.topIdx !== undefined) {
      // на телефоне толкаем верхушку башни — конструкция теряет равновесие и рушится
      const top = items[items.topIdx].body;
      Body.setVelocity(top, { x: 3, y: 0 });
      Body.setAngularVelocity(top, 0.04);
    }
  }
  // плашки падают, когда верх блока поднялся до этой доли высоты экрана
  // (0.35 — блок уже почти целиком на экране; больше число — падают раньше)
  const DROP_AT = 0.35;
  const DROP_DELAY = 250;   // небольшая пауза, чтобы успеть увидеть плашки на месте, мс

  // на телефоне башня рушится, когда пролистали половину блока
  const DROP_AT_MOBILE = 0.5;

  function checkDrop() {
    if (released) return;
    const top = hero.getBoundingClientRect().top;
    const ready = isMobile()
      ? top <= -hero.offsetHeight * DROP_AT_MOBILE
      : top <= window.innerHeight * DROP_AT;
    if (ready) {
      window.removeEventListener('scroll', checkDrop);
      setTimeout(release, DROP_DELAY);
    }
  }
  window.addEventListener('scroll', checkDrop, { passive: true });
  checkDrop();   // если страницу открыли уже прокрученной

  // ====== курсор ======
  // события слушаем на всей секции: текст лежит поверх плашек и иначе перехватывал бы курсор
  section.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  section.addEventListener('pointerleave', () => { mouse = null; });
  ['pointerup', 'pointercancel'].forEach(ev => section.addEventListener(ev, e => {
    if (e.pointerType !== 'mouse') mouse = null;   // палец убрали — курсора больше нет
  }));

  // тап пальцем (телефон): плашки разлетаются от точки касания
  const TAP_RADIUS = 160;  // радиус «взрыва» от пальца, px
  const TAP_SPEED  = 14;   // сила разлёта
  section.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    release();
    const r = hero.getBoundingClientRect();
    const tx = e.clientX - r.left, ty = e.clientY - r.top;
    items.forEach(({ body }) => {
      const dx = body.position.x - tx, dy = body.position.y - ty;
      const d = Math.hypot(dx, dy) || 1;
      if (d > TAP_RADIUS) return;
      const k = TAP_SPEED * (1 - d / TAP_RADIUS);
      Body.setVelocity(body, {
        x: body.velocity.x + dx / d * k,
        y: body.velocity.y + dy / d * k - 4 * (1 - d / TAP_RADIUS) // чуть подбрасываем вверх
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.3);
    });
  });

  // отталкивание: ищем ближайшую к курсору точку прямоугольника
  Events.on(engine, 'beforeUpdate', () => {
    if (!mouse) return;
    items.forEach(({ body, w, h }) => {
      const a = body.angle, cos = Math.cos(a), sin = Math.sin(a);
      const dx = mouse.x - body.position.x;
      const dy = mouse.y - body.position.y;

      // курсор в локальных координатах плашки
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;

      // ближайшая точка прямоугольника (локально)
      const cx = Math.max(-w / 2, Math.min(w / 2, lx));
      const cy = Math.max(-h / 2, Math.min(h / 2, ly));

      // обратно в мировые координаты
      const px = body.position.x + cx * cos - cy * sin;
      const py = body.position.y + cx * sin + cy * cos;

      let vx = px - mouse.x, vy = py - mouse.y;
      let d = Math.hypot(vx, vy);
      if (d > MOUSE_RADIUS) return;

      if (d < 0.001) { // курсор внутри плашки — толкаем от центра
        vx = -dx; vy = -dy;
        d = Math.hypot(vx, vy) || 1;
      }

      const f = MOUSE_FORCE * (1 - Math.min(d, MOUSE_RADIUS) / MOUSE_RADIUS) * body.mass;
      Body.applyForce(body, { x: px, y: py }, { x: vx / d * f, y: vy / d * f });
    });
  });

  // ====== главный цикл ======
  function render() {
    items.forEach(({ el, body, w, h }) => {
      // ограничиваем скорость
      const v = body.velocity, s = Math.hypot(v.x, v.y);
      if (s > MAX_SPEED) Body.setVelocity(body, { x: v.x / s * MAX_SPEED, y: v.y / s * MAX_SPEED });

      const { x, y } = body.position;
      el.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${body.angle}rad)`;
      el.style.visibility = 'visible';
    });
  }

  function tick() {
    if (released) Engine.update(engine, 1000 / 60);
    render();
    requestAnimationFrame(tick);
  }
  tick();

  // ====== ресайз ======
  window.addEventListener('resize', () => {
    W = hero.clientWidth;
    H = hero.clientHeight;
    buildWalls();
    if (!released) {
      placeInitial();
    } else {
      // возвращаем плашки внутрь, если окно сузилось
      items.forEach(({ body }) => {
        Body.setPosition(body, {
          x: Math.min(Math.max(body.position.x, 20), W - 20),
          y: Math.min(body.position.y, H - 20)
        });
      });
    }
  });
});

(() => {
  const section = document.querySelector('.third');
  const stage = section.querySelector('.third-sticky');
  const spacer = section.querySelector('.eyes-spacer');
  const reveal = section.querySelector('.eyes');
  const img = section.querySelector('.eyes img');
  const red = section.querySelector('.redrectangle1');
  const title = section.querySelector('.compas');
  const text = section.querySelector('.bademotion');
  const blur = section.querySelector('.eyes-blur');
  const noise = section.querySelector('.eyes-noise');
  const text2 = section.querySelector('.eyes-text');
  const text2Top = section.querySelector('.eyes-text-top');
  const text2Bot = section.querySelector('.eyes-text-bottom');

  // ===== настройки =====
  const HOLD = 0.2; 
  const GROW_END = 0.75;  // к этому моменту картинка во всю ширину
  const TEXT_END = 0.30;  // к этому моменту текст исчез
  const RED_START = 0.3;  // когда начинает уходить красный
  const RED_END = 0.75;  // когда красный исчез
  const END_HEIGHT = null;  // высота в конце в vh (например 60), null = по пропорциям картинки
  const START_ZOOM = 1;
  const TEXT_SHIFT = 80;
  const T2_TOP_START = 0.80;  // верхний текст начинает появляться
  const T2_TOP_END = 0.90;
  const T2_BOT_START = 0.86;  // нижний — чуть позже
  const T2_BOT_END = 0.96;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  let box = {}, W = 0, H = 0, rw = 0, rh = 0, endH = 0, endInset = 0;

  // ===== телефон: полоска с глазами раскрывается в портрет badguy.png =====
  const isMob = () => window.matchMedia('(max-width: 900px)').matches;
  const FACE_CROP_W = 0.55;   // какую долю ширины портрета видно в полоске в начале
  const FACE_EYES_Y = 0.475;  // середина между зрачками на портрете (доля высоты сверху)
  const FACE_EYES_X = 0.484;  // и по горизонтали (доля ширины слева)

  function measure() {
    const s = stage.getBoundingClientRect();
    const e = spacer.getBoundingClientRect();
    W = s.width;
    H = s.height;
    box = {
      top: e.top - s.top,
      left: e.left - s.left,
      right: s.right - e.right,
      bottom: s.bottom - e.bottom,
      w: e.width,
      h: e.height
    };

    // картинка во всю ширину со своими пропорциями
    rw = W;
    rh = W * (img.naturalHeight || 1) / (img.naturalWidth || 1);

    // конечная высота окна: на телефоне — весь портрет во всю ширину, сверху и снизу белые поля
    endH = isMob() ? rh : (END_HEIGHT ? H * END_HEIGHT / 100 : rh);
    endH = Math.min(endH, H);
    endInset = (H - endH) / 2;   // поля сверху и снизу в конце
    text2.style.top = endInset + 'px';
    text2.style.height = endH + 'px';
  }

  function update() {
    const r = section.getBoundingClientRect();
    const total = section.offsetHeight - window.innerHeight;
    const raw = clamp(-r.top / total);
    const p = clamp((raw - HOLD) / (1 - HOLD));

    // --- окно: от полоски до полной ширины с полями сверху/снизу ---
    const g = ease(clamp(p / GROW_END));
    const t = lerp(box.top, endInset, g);
    const b = lerp(box.bottom, endInset, g);
    const l = lerp(box.left, 0, g);
    const rr = lerp(box.right, 0, g);
    reveal.style.clipPath = `inset(${t}px ${rr}px ${b}px ${l}px)`;

    const cx = l + (W - l - rr) / 2;
    const cy = t + (H - t - b) / 2;

    if (isMob()) {
      // --- телефон: в начале в полоске глаза с портрета, в конце — портрет целиком ---
      const s0 = (box.w / FACE_CROP_W) / W;           // масштаб, при котором глаза заполняют полоску
      const s = lerp(s0, 1, g);
      const fx = lerp(FACE_EYES_X, 0.5, g);           // точка портрета в центре окна: глаза → центр
      const fy = lerp(FACE_EYES_Y, 0.5, g);
      img.style.top = '0';
      img.style.transformOrigin = '0 0';
      img.style.transform = `translate(${cx - fx * W * s}px, ${cy - fy * rh * s}px) scale(${s})`;
    } else {
      // --- масштаб фото: в начале = полоска, в конце = вся ширина ---
      const s0 = Math.max(box.w / rw, box.h / rh) * START_ZOOM;
      const sEnd = Math.max(1, endH / rh);   // если END_HEIGHT больше пропорций — чуть приближаем
      const s = lerp(s0, sEnd, g);
      img.style.top = '';
      img.style.transformOrigin = '';
      img.style.transform =
        `translate(${cx - W / 2}px, calc(-50% + ${cy - H / 2}px)) scale(${s})`;
    }

    // --- текст уходит ---
    const f = clamp(p / TEXT_END);
    title.style.opacity = 1 - f;
    title.style.transform = `translateY(${-f * TEXT_SHIFT}px)`;
    text.style.opacity = 1 - f;
    text.style.transform = `translateY(${f * TEXT_SHIFT}px)`;

    // --- красное наложение уходит ---
    red.style.opacity = 1 - clamp((p - RED_START) / (RED_END - RED_START));
    blur.style.opacity = clamp((p - RED_START) / (RED_END - RED_START));
    noise.style.opacity = clamp((p - RED_START) / (RED_END - RED_START));
    const k1 = clamp((p - T2_TOP_START) / (T2_TOP_END - T2_TOP_START));
    const k2 = clamp((p - T2_BOT_START) / (T2_BOT_END - T2_BOT_START));
    text2Top.style.opacity = k1;
    text2Top.style.transform = `translateY(${(1 - k1) * 40}px)`;
    text2Bot.style.opacity = k2;
    text2Bot.style.transform = `translateY(${(1 - k2) * 40}px)`;
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });

  window.addEventListener('resize', () => { measure(); update(); });

  // при смене телефон/компьютер браузер подменяет картинку — пересчитываем размеры
  img.addEventListener('load', () => { measure(); update(); });

  Promise.all([document.fonts.ready, img.decode().catch(() => { })])
    .then(() => { measure(); update(); });
})();


(() => {
  const box = document.querySelector('.alone');
  const img = box.querySelector('img');
  const els = [...box.querySelectorAll('.swing')];

  // ===== настройки =====
  const OVERHANG = 2;      // на сколько px прибитый конец уходит за край
  const RADIUS = 110;       // радиус действия курсора
  const PUSH = 3;         // сила толчка
  const SPRING = 0.004;     // жёсткость пружины
  const DAMP = 0.94;      // затухание
  const SWAY = 0.00015;   // покачивание без курсора
  const MAX = 1;         // максимальное отклонение, рад

  let mouse = null;

  const items = els.map(el => ({
    el, th: 0, om: 0,
    phase: Math.random() * Math.PI * 2,
    speed: 0.8 + Math.random() * 0.5
  }));

  function layout() {
    const W = box.clientWidth;
    const H = box.clientHeight;
    items.forEach(it => {
      const { el } = it;
      it.w = el.offsetWidth;
      it.h = el.offsetHeight;
      it.rest = (parseFloat(el.dataset.angle) || 0) * Math.PI / 180;
      it.s = el.dataset.pin === 'right' ? 1 : -1;

      // точка крепления — прямо на краю
      it.px = W * parseFloat(el.dataset.x) / 100;
      it.py = H * parseFloat(el.dataset.y) / 100;

      // расстояние от гвоздика до центра плашки
      it.arm = it.w / 2 - OVERHANG;

      // ставим элемент так, чтобы гвоздик был на OVERHANG px от прибитого конца
      const ox = it.s === -1 ? OVERHANG : it.w - OVERHANG;
      el.style.left = (it.px - ox) + 'px';
      el.style.top = (it.py - it.h / 2) + 'px';
      el.style.transformOrigin = `${ox}px 50%`;
      el.style.visibility = 'visible';
    });
  }

  box.addEventListener('pointermove', e => {
    const r = box.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  box.addEventListener('pointerleave', () => { mouse = null; });

  // тап пальцем (телефон): короткий толчок от точки касания, потом плашки возвращаются
  let tapTimer = null;
  box.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const r = box.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { mouse = null; }, 220);
  });

  function tick(t) {
    items.forEach(it => {
      const a = it.rest + it.th;
      const cos = Math.cos(a), sin = Math.sin(a);

      if (mouse) {
        // центр плашки при текущем угле
        const cx = it.px - it.s * it.arm * cos;
        const cy = it.py - it.s * it.arm * sin;

        // ближайшая к курсору точка плашки
        const dx = mouse.x - cx, dy = mouse.y - cy;
        const lx = Math.max(-it.w / 2, Math.min(it.w / 2, dx * cos + dy * sin));
        const ly = Math.max(-it.h / 2, Math.min(it.h / 2, -dx * sin + dy * cos));
        const qx = cx + lx * cos - ly * sin;
        const qy = cy + lx * sin + ly * cos;

        let fx = qx - mouse.x, fy = qy - mouse.y;
        let d = Math.hypot(fx, fy);
        if (d < 0.001) { fx = cx - mouse.x; fy = cy - mouse.y; d = Math.hypot(fx, fy) || 1; }

        if (d < RADIUS) {
          const f = (1 - d / RADIUS) * PUSH;
          fx = fx / d * f;
          fy = fy / d * f;
          const rx = qx - it.px, ry = qy - it.py;
          it.om += (rx * fy - ry * fx) / (it.w * it.w);
        }
      }

      it.om += SWAY * Math.sin(t * 0.0012 * it.speed + it.phase);
      it.om += -SPRING * it.th;
      it.om *= DAMP;
      it.th = Math.max(-MAX, Math.min(MAX, it.th + it.om));

      it.el.style.transform = `rotate(${it.rest + it.th}rad)`;
    });
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', layout);

  Promise.all([document.fonts.ready, img.decode().catch(() => { })])
    .then(() => { layout(); requestAnimationFrame(tick); });
})();


(() => {
  const section = document.querySelector('.five');
  const imgs = [...section.querySelectorAll('.emo-img')];
  const texts = [...section.querySelectorAll('.emo-text')];
  const count = Math.min(imgs.length, texts.length);

  // доля отрезка каждого состояния, которая уходит на переход (остальное — пауза для чтения)
  const FADE = 0.35;
  const TEXT_SHIFT = 30; // на сколько px всплывает текст

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const mobileEmo = () => window.matchMedia('(max-width: 900px)').matches;

  function update() {
    const r = section.getBoundingClientRect();
    const total = section.offsetHeight - window.innerHeight;
    const p = clamp(-r.top / total);           // прогресс 0..1

    const pos = p * count;
    const i = Math.min(count - 1, Math.floor(pos)); // текущее состояние
    const f = pos - i;                               // где мы внутри его отрезка

    // переход к следующему — только в конце отрезка, и не у последнего
    const t = i < count - 1 ? ease(clamp((f - (1 - FADE)) / FADE)) : 0;

    imgs.forEach((img, k) => {
      let o = 0;
      if (k === i) o = 1;          // текущее фото полностью видно
      if (k === i + 1) o = t;      // следующее проявляется поверх него
      img.style.opacity = o;
    });

    texts.forEach((txt, k) => {
      let o = 0, y = TEXT_SHIFT;
      if (k === i) {               // текущий текст уходит в первой половине перехода
        const out = clamp(t * 2);
        o = 1 - out;
        y = -out * TEXT_SHIFT;
      }
      if (k === i + 1) {           // следующий всплывает во второй половине
        const inn = clamp(t * 2 - 1);
        o = inn;
        y = (1 - inn) * TEXT_SHIFT;
      }
      txt.style.opacity = o;
      // на компьютере подпись центрирована по высоте (top: 50%), на телефоне стоит сверху под фото
      txt.style.transform = mobileEmo() ? `translateY(${y}px)` : `translateY(calc(-50% + ${y}px))`;
    });
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });

  window.addEventListener('resize', update);
  update();
})();


(() => {
  const box = document.querySelector('.faces');
  const grid = box.querySelector('.faces-grid');
  const mark = box.querySelector('.faces-mark');

  // ===== настройки =====
  const FILES = 16;                  // сколько файлов emo-XX.jpg
  const PATH = 'images/emo/emo-';   // путь к лицам
  const DELAY = 1500;                // как часто квадрат прыгает, мс

  // перемешивание
  const shuffle = a => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // собираем сетку: столько лиц, чтобы хватило на всю высоту
  let cells = [];
  function build() {
    grid.innerHTML = '';
    // число колонок берём из CSS каждый раз: на телефоне их меньше
    const cols = parseInt(getComputedStyle(grid).getPropertyValue('--cols'));
    const size = grid.offsetWidth / cols;
    const rows = parseInt(getComputedStyle(grid).getPropertyValue('--rows'));
    const total = rows * cols;

    let pool = [];
    while (pool.length < total) {
      pool = pool.concat(shuffle([...Array(FILES)].map((_, i) => i + 1)));
    }

    cells = pool.slice(0, total).map(n => {
      const img = document.createElement('img');
      img.src = `${PATH}${String(n).padStart(2, '0')}.jpg`;
      img.alt = '';
      grid.appendChild(img);
      return img;
    });

    mark.style.width = mark.style.height = size + 'px';
  }

  // клетки, которые целиком видны внутри блока
  function visibleCells() {
    const b = box.getBoundingClientRect();
    return cells.filter(c => {
      const r = c.getBoundingClientRect();
      return r.left >= b.left && r.right <= b.right + 1 &&
        r.top >= b.top && r.bottom <= b.bottom + 1;
    });
  }

  let last = null;
  function jump() {
    const list = visibleCells().filter(c => c !== last);
    if (!list.length) return;
    const cell = list[Math.floor(Math.random() * list.length)];
    last = cell;

    mark.style.opacity = 0;                       // гаснет
    setTimeout(() => {
      mark.style.transform = `translate(${cell.offsetLeft}px, ${cell.offsetTop}px)`;
      mark.style.opacity = 1;                     // загорается на новом лице
    }, 300);
  }

  // квадрат прыгает только когда секция на экране
  let timer = null;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !timer) {
      jump();
      timer = setInterval(jump, DELAY);
    } else if (!e.isIntersecting && timer) {
      clearInterval(timer);
      timer = null;
    }
  }).observe(box);

  // пересобираем сетку только если изменилась ширина
  // (на телефоне высота окна меняется при каждом скролле из-за адресной строки)
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    build();
    jump();
  });
  build();
})();

// ===== стрелка на первом экране =====
(() => {
  const arrow = document.querySelector('.heroarrow');
  if (!arrow) return;

  // по клику плавно листаем к следующему блоку
  arrow.addEventListener('click', () => {
    const next = document.querySelector('.hero').nextElementSibling;
    if (next) next.scrollIntoView({ behavior: 'smooth' });
  });

  // как только начали листать — прячем стрелку, вернулись наверх — показываем снова
  const toggle = () => arrow.classList.toggle('is-hidden', window.scrollY > 40);
  window.addEventListener('scroll', toggle, { passive: true });
  toggle();
})();


// ===== одинаковые видимые промежутки между блоками =====
// Внутри каждого блока свои пустые поля сверху и снизу, поэтому одинаковый margin
// даёт на экране разные расстояния. Скрипт меряет, где кончается содержимое одного
// блока и начинается содержимое следующего, и подбирает margin-top так,
// чтобы промежуток везде был равен --visual-gap из layout.css.
(() => {
  const $ = s => document.querySelector(s);

  // расстояние от верха ancestor до верха el без учёта transform (анимации по скроллу его меняют)
  const offsetIn = (el, ancestor) => {
    let y = 0;
    while (el && el !== ancestor) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  };
  const rect = el => el.getBoundingClientRect();

  // для каждого блока: сколько пустого места над содержимым (top) и под ним (bottom)
  const edges = {
    second: () => ({ bottom: 0 }),                                   // серый фон до самого низа
    third: () => {                                                   // липкая сцена с глазами
      const st = $('.third-sticky'), txt = $('.eyes-text');
      return {
        top: offsetIn($('.compas'), st),                             // в начале — заголовок
        bottom: st.offsetHeight - (offsetIn(txt, st) + txt.offsetHeight) // в конце — серое фото
      };
    },
    fourth: () => {
      const s = rect($('.fourth')), a = rect($('.alone')), v = rect($('.volume')), f = rect($('.forma'));
      return { top: Math.min(v.top, a.top) - s.top, bottom: s.bottom - Math.max(a.bottom, f.bottom) };
    },
    five: () => {
      const st = $('.five-sticky'), em = $('.emotions');
      // подпись стоит по центру своего блока (top: 50%), в конце видна последняя — «Стыд»
      const texts = document.querySelectorAll('.emo-text');
      const last = texts[texts.length - 1];
      const mob = window.matchMedia('(max-width: 900px)').matches;
      const textBottom = offsetIn(last, st) + last.offsetHeight * (mob ? 1 : 0.5);
      const bot = Math.max(offsetIn(em, st) + em.offsetHeight, textBottom);
      return { top: offsetIn(em, st), bottom: st.offsetHeight - bot };
    },
    six: () => {
      // меряем сами заголовок, текст и сетку (на телефоне обёртка .recognize «растворена» и размеров не имеет)
      const s = rect($('.six')), t = rect($('.recognize-title')), x = rect($('.recognize-text')), f = rect($('.faces'));
      return {
        top: Math.min(t.top, x.top, f.top) - s.top,
        bottom: s.bottom - Math.max(t.bottom, x.bottom, f.bottom)
      };
    },
    seven: () => ({ top: 0 })                                        // красный фон с самого верха
  };
  const order = ['second', 'third', 'fourth', 'five', 'six', 'seven'];

  function apply() {
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--visual-gap'))
      * window.innerHeight / 100;
    const e = {};
    order.forEach(n => { e[n] = edges[n](); });
    for (let i = 1; i < order.length; i++) {
      const prev = e[order[i - 1]], cur = e[order[i]];
      const m = gap - (prev.bottom || 0) - (cur.top || 0);
      $('.' + order[i]).style.marginTop = Math.round(m) + 'px';
    }
  }

  let raf = null;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
  window.addEventListener('resize', schedule);
  // после загрузки картинок и после того, как скрипт глаз расставил финальную полосу
  window.addEventListener('load', () => { schedule(); setTimeout(schedule, 400); });
  document.fonts.ready.then(schedule);
  schedule();
})();


// ===== курсор «закипающая точка» =====
(() => {
  // только для устройств с мышью
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  // ===== настройки =====
  const DOT_PX    = 38;      // размер точки в CSS (.anger-cursor) — максимальный
  const SIZE_COLD = 12;      // диаметр в спокойном состоянии, px
  const SIZE_HOT  = 38;      // диаметр, когда «кипит», px
  const HEAT_GAIN = 0.0016;  // как быстро нагревается от скорости мыши
  const COOL      = 0.955;   // как быстро остывает (ближе к 1 — дольше)
  const COLD = [54, 54, 54];     // #363636
  const HOT  = [207, 2, 6];      // #CF0206 — тот же красный, что на сайте

  const dot = document.createElement('div');
  dot.className = 'anger-cursor';
  document.body.appendChild(dot);
  document.documentElement.classList.add('has-anger-cursor');

  let x = -100, y = -100, lastX = null, lastY = null, lastT = 0, heat = 0;

  window.addEventListener('mousemove', e => {
    x = e.clientX; y = e.clientY;
    const now = performance.now();
    if (lastX !== null) {
      const dt = Math.max(now - lastT, 1);
      const speed = Math.hypot(x - lastX, y - lastY) / dt;   // px за мс
      heat = Math.min(1, heat + speed * speed * HEAT_GAIN * dt);
    }
    lastX = x; lastY = y; lastT = now;
    dot.classList.add('is-visible');
  }, { passive: true });

  document.addEventListener('mouseleave', () => dot.classList.remove('is-visible'));
  document.addEventListener('mouseenter', () => dot.classList.add('is-visible'));

  const mix = (a, b, t) => Math.round(a + (b - a) * t);

  function tick() {
    heat *= COOL;                                  // постоянно остывает
    const t = heat * heat * (3 - 2 * heat);        // плавный переход
    const s = SIZE_COLD + (SIZE_HOT - SIZE_COLD) * t;
    dot.style.transform = `translate(${x}px, ${y}px) scale(${(s / DOT_PX).toFixed(3)})`;
    dot.style.backgroundColor = `rgb(${mix(COLD[0], HOT[0], t)}, ${mix(COLD[1], HOT[1], t)}, ${mix(COLD[2], HOT[2], t)})`;
    requestAnimationFrame(tick);
  }
  tick();
})();
