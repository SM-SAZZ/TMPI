// -------------------------------------------------------------
// МОДЕЛЬ: ТРЁХМЕРНЫЙ МАССИВ КООРДИНАТ ЗВЁЗД В СПИРАЛЬНОЙ ГАЛАКТИКЕ
// -------------------------------------------------------------
// В этой работе состояние сцены (трёхмерная спиральная галактика) хранится
// в трёхмерном массиве:
//   balls3D[i] = [x, y, z]
// где x, y, z – координаты звезды в пространстве (от -1 до 1).
// Таким образом массив balls3D можно рассматривать как "базу данных"
// звёзд в трёхмерном пространстве галактики.

// ПОЛУЧАЕМ ССЫЛКИ НА ЭЛЕМЕНТЫ УПРАВЛЕНИЯ
const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

const ballsCountSlider = document.getElementById("ballsCount");
const ballsCountValue = document.getElementById("ballsCountValue");
const ballSizeSlider = document.getElementById("ballSize");
const ballSizeValue = document.getElementById("ballSizeValue");
const speedSlider = document.getElementById("speed");
const speedValue = document.getElementById("speedValue");

const playPauseBtn = document.getElementById("playPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const dirButtons = document.querySelectorAll(".dir-btn");
const statsEl = document.getElementById("stats");

// -------------------------------------------------------------
// НАСТРОЙКИ СЦЕНЫ
// -------------------------------------------------------------
// Нормированный размер сцены – пространство [-1, 1] по каждой оси.
const WORLD_MIN = -1;
const WORLD_MAX = 1;

// Масштаб, скорость и прочие параметры по умолчанию
let baseBallRadius = 10; // базовый радиус в пикселях (меняется слайдером ballSize)
let globalSpeedScale = 1; // множитель скорости (меняется слайдером speed)
let rotateYDeg = 20; // угол поворота вокруг оси Y в градусах (можно крутить мышью)
let rotateXDeg = -15; // угол поворота вокруг оси X в градусах (можно крутить мышью)
const cameraZ = 3; // расстояние камеры от центра сцены (фиксированное, чтобы не искажать перспективу)
let zoomScale = 1.0; // классический зум: просто масштабируем всю сцену

// -------------------------------------------------------------
// ТРЁХМЕРНЫЙ МАССИВ СОСТОЯНИЯ
// -------------------------------------------------------------
// balls3D: массив координат звёзд, каждый элемент: [x, y, z]
// starParams: параметры орбит звёзд, каждый элемент:
//   [radius, height, baseAngle, orbitSpeed, dirSign, angleOffset]
//   radius      – радиус орбиты
//   height      – высота над плоскостью диска
//   baseAngle   – базовый фазовый угол
//   orbitSpeed  – базовая скорость вращения
//   dirSign     – направление (+1 по часовой, -1 против часовой)
//   angleOffset – дополнительный сдвиг угла, чтобы при смене направления
//                 звезда продолжала движение без рывка (из той же точки)
let balls3D = [];
let starParams = [];

// Флаг паузы анимации
let isPaused = false;

// Глобальное "время" для анимации орбит
let globalTime = 0;

// Направление закручивания по оси Y (меняется кнопками)
let dirY = 1;
// Режим хаотичного движения орбит
let isChaotic = false;

// -------------------------------------------------------------
// ИНИЦИАЛИЗАЦИЯ ГАЛАКТИКИ (НАБОР ОРБИТ ЗВЁЗД)
// -------------------------------------------------------------

/**
 * Полностью создаёт новую галактику с заданным количеством звёзд.
 * Используется при первом запуске и при нажатии "Сброс".
 * @param {number} count - сколько звёзд создать
 */
function initBalls(count) {
  balls3D = [];
  starParams = [];

  for (let i = 0; i < count; i++) {
    addOneStar();
  }
}

/**
 * Добавляет одну новую звезду в текущую галактику (не сбрасывая остальные).
 */
function addOneStar() {
  // Радиус орбиты: чем ближе к центру, тем больше плотность
  const radius = Math.sqrt(Math.random()) * 0.95;

  // Высота над плоскостью диска (немного "толщины")
  const height = randInRange(-0.25, 0.25);

  // Базовый угол (фаза орбиты)
  const baseAngle = randInRange(0, Math.PI * 2);

  // Индивидуальная скорость вращения звезды
  const orbitSpeed = randInRange(0.4, 1.4);

  // Направление звезды совпадает с текущим глобальным направлением dirY
  const dirSign = dirY;

  // Дополнительный сдвиг угла, чтобы при смене направления не было рывка
  const angleOffset = 0;

  starParams.push([
    radius,
    height,
    baseAngle,
    orbitSpeed,
    dirSign,
    angleOffset,
  ]);

  // Текущее время входит в фазу, чтобы новая звезда "вписывалась" в движение
  const angle = baseAngle + globalTime * orbitSpeed * dirSign + angleOffset;
  const x = radius * Math.cos(angle);
  const y = height;
  const z = radius * Math.sin(angle);

  balls3D.push([x, y, z]);
}

/**
 * Аккуратно подгоняет количество звёзд под требуемое число:
 * звёзды только добавляются или удаляются с конца массивов.
 * @param {number} targetCount
 */
function adjustStarCount(targetCount) {
  const current = balls3D.length;
  if (targetCount === current) return;

  if (targetCount > current) {
    const toAdd = targetCount - current;
    for (let i = 0; i < toAdd; i++) {
      addOneStar();
    }
  } else {
    const toRemove = current - targetCount;
    balls3D.splice(-toRemove, toRemove);
    starParams.splice(-toRemove, toRemove);
  }
}

/** Генерация случайного числа в диапазоне [min, max] */
function randInRange(min, max) {
  return min + Math.random() * (max - min);
}

// -------------------------------------------------------------
// ОБНОВЛЕНИЕ ПОЛОЖЕНИЙ ЗВЁЗД (ОРБИТЫ ГАЛАКТИКИ)
// -------------------------------------------------------------

/**
 * Обновляет координаты звёзд: каждая звезда движется по своей орбите,
 * заданной параметрами в starParams. Здесь мы не считаем столкновения,
 * а моделируем плавное вращение диска галактики.
 * @param {number} dt - шаг времени (в секундах, небольшое число)
 */
function updatePhysics(dt) {
  const n = balls3D.length;
  globalTime += dt * globalSpeedScale;

  for (let i = 0; i < n; i++) {
    const params = starParams[i];
    if (!params) continue;
    const radius = params[0];
    const height = params[1];
    const baseAngle = params[2];
    const orbitSpeed = params[3];
    const dirSign = params[4] ?? dirY;
    const angleOffset = params[5] ?? 0;

    // Базовый угол вращения вокруг оси Y (с учётом знака для каждой звезды)
    const angle =
      baseAngle + globalTime * orbitSpeed * dirSign + angleOffset;

    // Небольшое "волнение" орбиты по радиусу и высоте
    const radialWobble =
      0.12 * Math.sin(globalTime * 0.7 + baseAngle * 1.3);
    const verticalWobble =
      0.18 * Math.cos(globalTime * 0.5 + baseAngle * 0.9);

    const effectiveRadius = radius + radialWobble;
    const x = effectiveRadius * Math.cos(angle);
    const z = effectiveRadius * Math.sin(angle);
    const y = height + verticalWobble;

    const pos = balls3D[i];
    pos[0] = x;
    pos[1] = y;
    pos[2] = z;
  }
}

// -------------------------------------------------------------
// ПРОСТАЯ ПЕРСПЕКТИВНАЯ ПРОЕКЦИЯ 3D → 2D
// -------------------------------------------------------------

/**
 * Преобразует 3D‑координаты точки в координаты на холсте.
 * Сюда входит:
 *   - поворот вокруг оси X и Y (используем rotateXDeg и rotateYDeg),
 *   - простая перспективная проекция.
 */
function projectPoint(x, y, z, width, height) {
  // 1. Повороты вокруг осей X и Y
  const angleY = (rotateYDeg * Math.PI) / 180;
  const angleX = (rotateXDeg * Math.PI) / 180;

  const cosY = Math.cos(angleY);
  const sinY = Math.sin(angleY);
  const cosX = Math.cos(angleX);
  const sinX = Math.sin(angleX);

  // Поворот вокруг Y
  let rx = x * cosY + z * sinY;
  let rz = -x * sinY + z * cosY;
  let ry = y;

  // Поворот вокруг X
  const ry2 = ry * cosX - rz * sinX;
  const rz2 = ry * sinX + rz * cosX;
  rx = rx;
  ry = ry2;
  rz = rz2;

  // 2. Перспективная проекция (камераZ фиксирован, чтобы не менять геометрию)
  const perspective = cameraZ / (cameraZ - rz);

  const px = rx * perspective;
  const py = ry * perspective;

  // 3. Преобразуем в пиксели
  const scale = 0.45 * Math.min(width, height) * zoomScale;
  const screenX = width / 2 + px * scale;
  const screenY = height / 2 - py * scale;

  return { x: screenX, y: screenY, depth: rz };
}

// -------------------------------------------------------------
// ОТРИСОВКА КУБА И ШАРОВ
// -------------------------------------------------------------

function resizeCanvasToDisplaySize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width * dpr;
  const height = rect.height * dpr;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // масштабируем контекст
  }
}

function drawScene() {
  resizeCanvasToDisplaySize();

  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  // Очистка фона
  ctx.clearRect(0, 0, width, height);

  // Рисуем "плоскость" позади (ради лёгкого 3D‑эффекта)
  const grd = ctx.createRadialGradient(
    width * 0.2,
    height * 0.2,
    0,
    width / 2,
    height / 2,
    Math.max(width, height)
  );
  grd.addColorStop(0, "#020617");
  grd.addColorStop(1, "#000000");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);

  // Рисуем оси координат (X, Y, Z) и "диск" галактики
  drawAxes(width, height);
  drawGalaxyDisk(width, height);

  // Проецируем все шары, сортируем по глубине, рисуем от дальних к ближним
  const projected = [];
  for (let i = 0; i < balls3D.length; i++) {
    const [x, y, z] = balls3D[i];
    const p = projectPoint(x, y, z, width, height);
    projected.push({
      index: i,
      x: p.x,
      y: p.y,
      depth: p.depth,
    });
  }

  projected.sort((a, b) => a.depth - b.depth);

  for (const p of projected) {
    const depthNorm = (p.depth - WORLD_MIN) / (WORLD_MAX - WORLD_MIN);
    const brightness = 0.4 + 0.5 * (1 - depthNorm);

    const radius = baseBallRadius * (0.7 + 0.6 * (1 - depthNorm));

    const color = `rgba(${Math.floor(96 + 80 * brightness)}, ${Math.floor(
      165 + 60 * brightness
    )}, ${Math.floor(250)}, 0.95)`;

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.shadowColor = "rgba(59,130,246,0.8)";
    ctx.shadowBlur = 18;
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();
  }
}

// РИСУЕМ ПРОЕКЦИЮ "ДИСКА" ГАЛАКТИКИ (несколько орбитальных колец)
function drawGalaxyDisk(width, height) {
  ctx.save();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
  ctx.lineWidth = 0.8;

  const rings = [0.3, 0.55, 0.8, 1.0];
  for (const r of rings) {
    const segments = 80;
    let prev = null;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const x = r * Math.cos(t);
      const z = r * Math.sin(t);
      const y = 0;
      const p = projectPoint(x, y, z, width, height);
      if (prev) {
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      prev = p;
    }
  }

  // Ядро галактики
  const center = projectPoint(0, 0, 0, width, height);
  ctx.beginPath();
  const coreRadius = 5;
  const coreGradient = ctx.createRadialGradient(
    center.x,
    center.y,
    0,
    center.x,
    center.y,
    coreRadius * 2.5
  );
  coreGradient.addColorStop(0, "rgba(252, 211, 77, 0.95)");
  coreGradient.addColorStop(1, "rgba(250, 204, 21, 0.0)");
  ctx.fillStyle = coreGradient;
  ctx.arc(center.x, center.y, coreRadius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// РИСУЕМ ОСИ КООРДИНАТ X (красная), Y (зелёная), Z (синяя)
function drawAxes(width, height) {
  const origin = projectPoint(0, 0, 0, width, height);

  const axisLength = 1.2;
  const xPos = projectPoint(axisLength, 0, 0, width, height);
  const xNeg = projectPoint(-axisLength, 0, 0, width, height);
  const yPos = projectPoint(0, axisLength, 0, width, height);
  const yNeg = projectPoint(0, -axisLength, 0, width, height);
  const zPos = projectPoint(0, 0, axisLength, width, height);
  const zNeg = projectPoint(0, 0, -axisLength, width, height);

  ctx.save();
  ctx.lineWidth = 1.2;

  // Ось X
  ctx.strokeStyle = "rgba(248, 113, 113, 0.9)"; // красный
  ctx.beginPath();
  ctx.moveTo(xNeg.x, xNeg.y);
  ctx.lineTo(xPos.x, xPos.y);
  ctx.stroke();

  // Ось Y
  ctx.strokeStyle = "rgba(74, 222, 128, 0.9)"; // зелёный
  ctx.beginPath();
  ctx.moveTo(yNeg.x, yNeg.y);
  ctx.lineTo(yPos.x, yPos.y);
  ctx.stroke();

  // Ось Z
  ctx.strokeStyle = "rgba(96, 165, 250, 0.9)"; // синий
  ctx.beginPath();
  ctx.moveTo(zNeg.x, zNeg.y);
  ctx.lineTo(zPos.x, zPos.y);
  ctx.stroke();

  // Подписи осей (ставим ближе к положительному концу)
  ctx.fillStyle = "rgba(229, 231, 235, 0.95)";
  ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("X", xPos.x + 4, xPos.y - 2);
  ctx.fillText("Y", yPos.x + 4, yPos.y - 2);
  ctx.fillText("Z", zPos.x + 4, zPos.y - 2);

  ctx.restore();
}

// -------------------------------------------------------------
// ОБНОВЛЕНИЕ ТЕКСТОВОЙ ИНФОРМАЦИИ / СТАТИСТИКИ
// -------------------------------------------------------------

function updateStats() {
  const n = balls3D.length;
  let avgRadius = 0;

  for (let i = 0; i < starParams.length; i++) {
    const params = starParams[i];
    if (!params) continue;
    avgRadius += Math.abs(params[0]);
  }
  if (starParams.length > 0) avgRadius /= starParams.length;

  statsEl.textContent = `Звёзд: ${n} | Сред. радиус орбиты: ${avgRadius.toFixed(
    2
  )} | Скорость: ${globalSpeedScale.toFixed(
    2
  )} | Камера: X=${rotateXDeg.toFixed(0)}° Y=${rotateYDeg.toFixed(
    0
  )}° | Zoom: ${zoomScale.toFixed(2)}x`;
}

// -------------------------------------------------------------
// УПРАВЛЕНИЕ ИНТЕРФЕЙСОМ (СЛАЙДЕРЫ, КНОПКИ)
// -------------------------------------------------------------

function initUI() {
  // ЗАДАЁМ НАЧАЛЬНЫЕ ЗНАЧЕНИЯ СЛАЙДЕРОВ
  ballsCountSlider.value = 26;
  ballSizeSlider.value = baseBallRadius;
  speedSlider.value = globalSpeedScale;

  // ФУНКЦИИ ОБНОВЛЕНИЯ ПОДПИСЕЙ
  function refreshLabels() {
    ballsCountValue.textContent = ballsCountSlider.value;
    ballSizeValue.textContent = ballSizeSlider.value + " px";
    speedValue.textContent = speedSlider.value + "x";
  }

  refreshLabels();

  // СЛАЙДЕР КОЛИЧЕСТВА ЗВЁЗД – ДОБАВЛЯЕМ/УБИРАЕМ ЗВЁЗДЫ БЕЗ ПОЛНОГО СБРОСА
  ballsCountSlider.addEventListener("input", () => {
    const count = parseInt(ballsCountSlider.value, 10);
    adjustStarCount(count);
    refreshLabels();
  });

  // СЛАЙДЕР РАЗМЕРА ШАРОВ – МЕНЯЕМ РАДИУС В ОТРИСОВКЕ
  ballSizeSlider.addEventListener("input", () => {
    baseBallRadius = parseFloat(ballSizeSlider.value);
    refreshLabels();
  });

  // СЛАЙДЕР СКОРОСТИ – МЕНЯЕМ МНОЖИТЕЛЬ ДЛЯ ВЕКТОРОВ СКОРОСТЕЙ
  speedSlider.addEventListener("input", () => {
    globalSpeedScale = parseFloat(speedSlider.value);
    refreshLabels();
  });

  // КНОПКА ПАУЗЫ / ПРОДОЛЖЕНИЯ
  playPauseBtn.addEventListener("click", () => {
    isPaused = !isPaused;
    playPauseBtn.textContent = isPaused ? "Продолжить" : "Пауза";
  });

  // КНОПКА СБРОСА – ПЕРЕЗАПУСК МОДЕЛИ
  resetBtn.addEventListener("click", () => {
    const count = parseInt(ballsCountSlider.value, 10);
    initBalls(count);
  });

  // КНОПКИ ВРАЩЕНИЯ – МЕНЯЕМ НАПРАВЛЕНИЕ ВРАЩЕНИЯ / ВКЛЮЧАЕМ ХАОТИЧНЫЙ РЕЖИМ
  // ВАЖНО: мы пересчитываем baseAngle так, чтобы положение звёзд НЕ прыгало.
  dirButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode; // "cw", "ccw" или "chaos"

      if (mode === "cw" || mode === "ccw") {
        const newDirSign = mode === "cw" ? 1 : -1;
        dirY = newDirSign;
        isChaotic = false;

        for (let i = 0; i < starParams.length; i++) {
          const p = starParams[i];
          if (!p) continue;
          const baseAngle = p[2];
          const orbitSpeed = p[3];
          const oldDirSign = p[4] ?? dirY;
          const oldOffset = p[5] ?? 0;

          // Текущий угол звезды до смены направления
          const currentAngle =
            baseAngle + globalTime * orbitSpeed * oldDirSign + oldOffset;

          // Новый сдвиг угла, чтобы currentAngle сохранился,
          // но дальше звезда вращалась уже с newDirSign
          const newOffset =
            currentAngle - (baseAngle + globalTime * orbitSpeed * newDirSign);

          p[4] = newDirSign;
          p[5] = newOffset;
          starParams[i] = p;
        }
      } else if (mode === "chaos") {
        // Хаотично: для каждой звезды случайно выбираем направление (+1 или -1),
        // при этом положение тоже не прыгает.
        isChaotic = true;
        for (let i = 0; i < starParams.length; i++) {
          const p = starParams[i];
          if (!p) continue;
          const baseAngle = p[2];
          const orbitSpeed = p[3];
          const oldDirSign = p[4] ?? dirY;
          const oldOffset = p[5] ?? 0;

          const currentAngle =
            baseAngle + globalTime * orbitSpeed * oldDirSign + oldOffset;
          const randomDir = Math.random() < 0.5 ? 1 : -1;
          const newOffset =
            currentAngle -
            (baseAngle + globalTime * orbitSpeed * randomDir);

          p[4] = randomDir;
          p[5] = newOffset;
          starParams[i] = p;
        }
      }
    });
  });

  // СВОБОДНОЕ ПЕРЕМЕЩЕНИЕ КАМЕРЫ МЫШЬЮ (повороты вокруг X и Y)
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.classList.add("dragging");
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    // Чувствительность поворота
    const sensitivity = 0.4;

    rotateYDeg += dx * sensitivity;
    rotateXDeg += dy * sensitivity;

    // Ограничиваем наклон по X, чтобы не переворачиваться
    rotateXDeg = Math.max(-80, Math.min(80, rotateXDeg));
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    canvas.classList.remove("dragging");
  });

  // ЗУМ КОЛЁСИКОМ МЫШИ (приближение / отдаление камеры)
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = e.deltaY;

      // Классический зум: масштабируем всю сцену, перспективу не трогаем
      const zoomFactor = 1.08;
      if (delta > 0) {
        zoomScale /= zoomFactor;
      } else {
        zoomScale *= zoomFactor;
      }

      // Ограничиваем разумный диапазон зума
      zoomScale = Math.max(0.4, Math.min(3.5, zoomScale));
    },
    { passive: false }
  );
}

// -------------------------------------------------------------
// ЦИКЛ АНИМАЦИИ
// -------------------------------------------------------------

let lastTime = 0;
function animate(timestamp) {
  const dtMs = timestamp - lastTime;
  lastTime = timestamp;

  // Перевод миллисекунд в секунды и ограничение шага
  const dt = Math.min(dtMs / 1000, 0.03);

  if (!isPaused) {
    updatePhysics(dt);
  }

  drawScene();
  updateStats();

  requestAnimationFrame(animate);
}

// -------------------------------------------------------------
// ЗАПУСК ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// -------------------------------------------------------------

// Инициализируем трёхмерный массив и интерфейс, запускаем анимацию
window.addEventListener("load", () => {
  initUI();
  initBalls(parseInt(ballsCountSlider.value, 10));

  lastTime = performance.now();
  requestAnimationFrame(animate);
});
