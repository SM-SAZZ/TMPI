const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

const speedSlider = document.getElementById("speed");
const speedValue = document.getElementById("speedValue");
const playPauseBtn = document.getElementById("playPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const statsEl = document.getElementById("stats");
const planetLegend = document.getElementById("planetLegend");

// Scene configuration and projection limits.
const FOCAL_LENGTH = 6.4;
const DEFAULT_CAMERA_DISTANCE = 6.4;
const DEFAULT_VIEW = { x: -24, y: 32 };
const SCENE_SCALE_RATIO = 0.29;
const BODY_WORLD_SCALE = 0.08;
const ORBIT_SEGMENTS = 144;
const BACKGROUND_STAR_COUNT = 180;
const DRAG_THRESHOLD = 6;
const CAMERA_ROTATE_SENSITIVITY = 0.35;
const CAMERA_DISTANCE_MIN = 4.1;
const CAMERA_DISTANCE_MAX = 13.5;
const SUN_KEY = "sun";
const DAMAGE_COLOR = "#ff3b30";
const HEAL_COLOR = "#22c55e";
const IMPACT_BURST_COLOR = "#ff8a1f";
const TARGET_RETICLE_COLOR = "#ff3b30";

const sun = {
  key: SUN_KEY,
  name: "Солнце",
  color: "#f7b500",
  size: 2.2,
};

const planets = createPlanets([
  {
    name: "Меркурий",
    color: "#9aa0ac",
    size: 0.42,
    orbitA: 0.28,
    orbitB: 0.23,
    orbitSpeed: 1.58,
    inclination: 7,
    node: 18,
    phase: 0.4,
  },
  {
    name: "Венера",
    color: "#d8b36a",
    size: 0.58,
    orbitA: 0.42,
    orbitB: 0.38,
    orbitSpeed: 1.16,
    inclination: 3.4,
    node: 48,
    phase: 1.3,
  },
  {
    name: "Земля",
    color: "#3d84ff",
    size: 0.62,
    orbitA: 0.58,
    orbitB: 0.54,
    orbitSpeed: 1,
    inclination: 0,
    node: 0,
    phase: 2.4,
  },
  {
    name: "Марс",
    color: "#d46a44",
    size: 0.5,
    orbitA: 0.74,
    orbitB: 0.67,
    orbitSpeed: 0.82,
    inclination: 1.8,
    node: 78,
    phase: 1.8,
  },
  {
    name: "Юпитер",
    color: "#c79b62",
    size: 1.16,
    orbitA: 0.98,
    orbitB: 0.9,
    orbitSpeed: 0.44,
    inclination: 1.3,
    node: 34,
    phase: 0.8,
  },
  {
    name: "Сатурн",
    color: "#dcc88d",
    size: 1.02,
    orbitA: 1.23,
    orbitB: 1.11,
    orbitSpeed: 0.32,
    inclination: 2.5,
    node: 92,
    phase: 2.9,
    hasRing: true,
  },
  {
    name: "Уран",
    color: "#8ed5dd",
    size: 0.76,
    orbitA: 1.46,
    orbitB: 1.34,
    orbitSpeed: 0.23,
    inclination: 0.8,
    node: 152,
    phase: 4.1,
  },
  {
    name: "Нептун",
    color: "#4d7dff",
    size: 0.74,
    orbitA: 1.68,
    orbitB: 1.56,
    orbitSpeed: 0.18,
    inclination: 1.8,
    node: 214,
    phase: 5.2,
  },
]);

const state = {
  globalSpeedScale: 1,
  rotateXDeg: DEFAULT_VIEW.x,
  rotateYDeg: DEFAULT_VIEW.y,
  cameraDistance: DEFAULT_CAMERA_DISTANCE,
  isPaused: false,
  globalTime: 0,
  lastTime: 0,
  activeBodyKey: null,
  dragDistance: 0,
  isDragging: false,
  lastPointerX: 0,
  lastPointerY: 0,
  backgroundStars: [],
  planetPositions: planets.map(() => [0, 0, 0]),
  planetDamaged: planets.map(() => false),
  asteroidImpacts: [],
  planetBursts: [],
  projectedBodies: [],
  hitTestBodies: [],
  legendElements: new Map(),
};

// Utility helpers used across animation, projection and effects.
function toRadians(value) {
  return (value * Math.PI) / 180;
}

function randInRange(min, max) {
  return min + Math.random() * (max - min);
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function bodyKeyForPlanet(index) {
  return `planet:${index}`;
}

function planetIndexFromKey(key) {
  return typeof key === "string" && key.startsWith("planet:")
    ? Number(key.slice("planet:".length))
    : -1;
}

function getSceneScale(width, height) {
  return SCENE_SCALE_RATIO * Math.min(width, height);
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function setActiveBodyKey(nextKey) {
  if (state.activeBodyKey === nextKey) {
    return;
  }

  state.activeBodyKey = nextKey;
  syncLegendState();
}

function createPlanets(definitions) {
  return definitions.map((planet, index) => ({
    ...planet,
    index,
    key: bodyKeyForPlanet(index),
    orbitPoints: buildOrbitPoints(planet),
  }));
}

// Orbit geometry is static, so it is cached once and only projected per frame.
function buildOrbitPoints(planet) {
  return Array.from({ length: ORBIT_SEGMENTS + 1 }, (_, index) => {
    const angle = (index / ORBIT_SEGMENTS) * Math.PI * 2;
    return computeOrbitPoint(planet, angle);
  });
}

function computeOrbitPoint(planet, angle) {
  const localX = planet.orbitA * Math.cos(angle);
  const localZ = planet.orbitB * Math.sin(angle);
  const node = toRadians(planet.node);
  const inclination = toRadians(planet.inclination);

  const x1 = localX * Math.cos(node) + localZ * Math.sin(node);
  const z1 = -localX * Math.sin(node) + localZ * Math.cos(node);

  return [x1, -z1 * Math.sin(inclination), z1 * Math.cos(inclination)];
}

// The camera transform is calculated once per frame and reused everywhere.
function buildCamera(width, height) {
  const angleY = toRadians(state.rotateYDeg);
  const angleX = toRadians(state.rotateXDeg);

  return {
    width,
    height,
    sceneScale: getSceneScale(width, height),
    cosY: Math.cos(angleY),
    sinY: Math.sin(angleY),
    cosX: Math.cos(angleX),
    sinX: Math.sin(angleX),
  };
}

function projectPoint(x, y, z, camera) {
  let rx = x * camera.cosY + z * camera.sinY;
  let rz = -x * camera.sinY + z * camera.cosY;
  let ry = y;

  const rotatedY = ry * camera.cosX - rz * camera.sinX;
  const rotatedZ = ry * camera.sinX + rz * camera.cosX;
  ry = rotatedY;
  rz = rotatedZ;

  const perspective = FOCAL_LENGTH / (state.cameraDistance - rz);

  return {
    x: camera.width / 2 + rx * perspective * camera.sceneScale,
    y: camera.height / 2 - ry * perspective * camera.sceneScale,
    depth: rz,
    perspective,
  };
}

// Размер сферы зависит только от глубины центра, а не от того, под каким
// углом камера смотрит на мировую ось X/Y/Z.
function projectSphere(x, y, z, size, camera) {
  const center = projectPoint(x, y, z, camera);

  return {
    ...center,
    radius: Math.max(
      2,
      size * BODY_WORLD_SCALE * center.perspective * camera.sceneScale
    ),
  };
}

function resizeCanvasToDisplaySize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function createBackgroundStars(count) {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: 0.8 + Math.random() * 1.8,
    alpha: 0.2 + Math.random() * 0.65,
    twinkle: Math.random() * Math.PI * 2,
  }));
}

function updatePlanetPositions() {
  state.planetPositions = planets.map((planet) =>
    computeOrbitPoint(planet, planet.phase + state.globalTime * planet.orbitSpeed)
  );
}

function getPlanetDisplayColor(index) {
  return state.planetDamaged[index] ? DAMAGE_COLOR : planets[index].color;
}

function hasPendingImpact(targetIndex) {
  return state.asteroidImpacts.some((impact) => impact.targetIndex === targetIndex);
}

function getAsteroidStartPoint() {
  const angle = randInRange(0, Math.PI * 2);
  const radius = randInRange(3.05, 3.85);
  const height = randInRange(-1.05, 1.05);

  return [Math.cos(angle) * radius, height, Math.sin(angle) * radius];
}

function launchAsteroid(targetIndex) {
  state.asteroidImpacts.push({
    targetIndex,
    start: getAsteroidStartPoint(),
    progress: 0,
    duration: randInRange(0.75, 1.15),
    size: randInRange(0.05, 0.08),
    trailOffset: randInRange(0.08, 0.16),
    color: "#d7d2ca",
  });
}

function createPlanetBurst(targetIndex, mode) {
  state.planetBursts.push({
    targetIndex,
    mode,
    age: 0,
    duration: mode === "heal" ? 0.55 : 0.45,
  });
}

function restorePlanet(targetIndex) {
  state.planetDamaged[targetIndex] = false;
  state.asteroidImpacts = state.asteroidImpacts.filter(
    (impact) => impact.targetIndex !== targetIndex
  );
  state.planetBursts = state.planetBursts.filter(
    (burst) => burst.targetIndex !== targetIndex
  );
  createPlanetBurst(targetIndex, "heal");
  syncLegendState();
}

// И одно и то же действие вызывается и с канваса, и из легенды.
function togglePlanetImpact(targetIndex) {
  if (state.planetDamaged[targetIndex]) {
    restorePlanet(targetIndex);
    return;
  }

  if (!hasPendingImpact(targetIndex)) {
    launchAsteroid(targetIndex);
  }
}

function updateEffects(dt) {
  state.asteroidImpacts = state.asteroidImpacts.filter((impact) => {
    impact.progress += dt / impact.duration;

    if (impact.progress >= 1) {
      state.planetDamaged[impact.targetIndex] = true;
      createPlanetBurst(impact.targetIndex, "damage");
      syncLegendState();
      return false;
    }

    return true;
  });

  state.planetBursts = state.planetBursts.filter((burst) => {
    burst.age += dt;
    return burst.age < burst.duration;
  });
}

// Rendering is split into small passes so effects and hit testing share data.
function drawBackground(camera) {
  const background = ctx.createRadialGradient(
    camera.width * 0.52,
    camera.height * 0.5,
    0,
    camera.width * 0.5,
    camera.height * 0.5,
    Math.max(camera.width, camera.height) * 0.75
  );

  background.addColorStop(0, "#16213c");
  background.addColorStop(0.38, "#09101f");
  background.addColorStop(1, "#02040a");

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, camera.width, camera.height);

  for (const star of state.backgroundStars) {
    const flicker = 0.65 + 0.35 * Math.sin(state.globalTime * 0.35 + star.twinkle);
    ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * flicker})`;
    ctx.beginPath();
    ctx.arc(star.x * camera.width, star.y * camera.height, star.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOrbit(planet, camera) {
  ctx.beginPath();

  for (let index = 0; index < planet.orbitPoints.length; index++) {
    const point3D = planet.orbitPoints[index];
    const point2D = projectPoint(point3D[0], point3D[1], point3D[2], camera);

    if (index === 0) {
      ctx.moveTo(point2D.x, point2D.y);
    } else {
      ctx.lineTo(point2D.x, point2D.y);
    }
  }

  const orbitColor = getPlanetDisplayColor(planet.index);
  const isActive = state.activeBodyKey === planet.key;

  ctx.strokeStyle = hexToRgba(orbitColor, isActive ? 0.85 : 0.42);
  ctx.lineWidth = isActive ? 2.2 : 1.15;
  ctx.stroke();
}

function drawPlanetBody(body) {
  ctx.save();

  if (body.isSun) {
    ctx.fillStyle = hexToRgba(body.color, 0.14);
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.radius * 1.55, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowColor = body.shadowColor;
  ctx.shadowBlur = body.shadowBlur;
  ctx.fillStyle = body.color;
  ctx.beginPath();
  ctx.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
  ctx.fill();

  if (body.hasRing) {
    ctx.strokeStyle = hexToRgba(body.color, 0.8);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(
      body.x,
      body.y,
      body.radius * 1.9,
      body.radius * 0.65,
      toRadians(-18),
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  ctx.restore();
}

function drawRoundedBox(x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + safeRadius, safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.arcTo(x + width, y + height, x + width - safeRadius, y + height, safeRadius);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.arcTo(x, y + height, x, y + height - safeRadius, safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.arcTo(x, y, x + safeRadius, y, safeRadius);
}

function drawActiveLabel(camera) {
  if (!state.activeBodyKey) {
    return;
  }

  const activeBody = state.projectedBodies.find(
    (body) => body.key === state.activeBodyKey
  );
  if (!activeBody) {
    return;
  }

  const textPaddingX = 10;
  const bubbleHeight = 28;
  ctx.save();
  ctx.font = "12px 'Trebuchet MS', 'Segoe UI', sans-serif";
  ctx.textBaseline = "middle";

  const textWidth = ctx.measureText(activeBody.name).width;
  const bubbleWidth = textWidth + textPaddingX * 2;
  const labelX = Math.min(
    camera.width - bubbleWidth - 14,
    Math.max(14, activeBody.x + activeBody.radius + 14)
  );
  const labelY = Math.min(
    camera.height - 20,
    Math.max(24, activeBody.y - activeBody.radius - 12)
  );

  ctx.fillStyle = "rgba(7, 14, 30, 0.88)";
  ctx.strokeStyle = hexToRgba(activeBody.color, 0.95);
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  drawRoundedBox(labelX, labelY - bubbleHeight / 2, bubbleWidth, bubbleHeight, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f8fafc";
  ctx.fillText(activeBody.name, labelX + textPaddingX, labelY);
  ctx.restore();
}

function getImpactWorldPoint(impact, extraOffset = 0) {
  const target = state.planetPositions[impact.targetIndex];
  const t = Math.max(0, Math.min(1, impact.progress - extraOffset));
  const easedT = t * t;

  return [
    lerp(impact.start[0], target[0], easedT),
    lerp(impact.start[1], target[1], easedT),
    lerp(impact.start[2], target[2], easedT),
  ];
}

function drawAsteroidImpacts(camera) {
  for (const impact of state.asteroidImpacts) {
    const head = getImpactWorldPoint(impact);
    const tail = getImpactWorldPoint(impact, impact.trailOffset);
    const headProjected = projectPoint(head[0], head[1], head[2], camera);
    const tailProjected = projectPoint(tail[0], tail[1], tail[2], camera);
    const radius = (impact.size * 18 + 1.2) * headProjected.perspective;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 163, 74, 0.55)";
    ctx.lineWidth = Math.max(1.2, radius * 0.45);
    ctx.beginPath();
    ctx.moveTo(tailProjected.x, tailProjected.y);
    ctx.lineTo(headProjected.x, headProjected.y);
    ctx.stroke();

    ctx.fillStyle = impact.color;
    ctx.shadowColor = "rgba(255, 149, 0, 0.75)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(headProjected.x, headProjected.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawAsteroidReticles(camera) {
  for (const impact of state.asteroidImpacts) {
    const target = state.planetPositions[impact.targetIndex];
    const projected = projectSphere(
      target[0],
      target[1],
      target[2],
      planets[impact.targetIndex].size,
      camera
    );
    const pulse = 0.82 + 0.18 * Math.sin(state.globalTime * 10 + impact.targetIndex);
    const radius = projected.radius * (1.55 + (1 - impact.progress) * 0.32) * pulse;
    const armLength = Math.max(8, radius * 0.42);
    const armOffset = radius + Math.max(5, projected.radius * 0.2);
    const armInner = armOffset + 2;
    const armOuter = armOffset + armLength;

    ctx.save();
    ctx.strokeStyle = hexToRgba(TARGET_RETICLE_COLOR, 0.94);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(projected.x - armOuter, projected.y);
    ctx.lineTo(projected.x - armInner, projected.y);
    ctx.moveTo(projected.x + armInner, projected.y);
    ctx.lineTo(projected.x + armOuter, projected.y);
    ctx.moveTo(projected.x, projected.y - armOuter);
    ctx.lineTo(projected.x, projected.y - armInner);
    ctx.moveTo(projected.x, projected.y + armInner);
    ctx.lineTo(projected.x, projected.y + armOuter);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlanetBursts(camera) {
  for (const burst of state.planetBursts) {
    const target = state.planetPositions[burst.targetIndex];
    const projected = projectSphere(
      target[0],
      target[1],
      target[2],
      planets[burst.targetIndex].size,
      camera
    );

    const intensity = 1 - burst.age / burst.duration;
    const radius = projected.radius * (1.8 + intensity * 1.7);
    const ringColor = burst.mode === "heal" ? HEAL_COLOR : IMPACT_BURST_COLOR;
    const fillColor = burst.mode === "heal" ? "#4ade80" : "#ffb347";

    ctx.save();
    ctx.strokeStyle = hexToRgba(ringColor, 0.22 + intensity * 0.55);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = hexToRgba(fillColor, 0.08 + intensity * 0.16);
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, radius * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function buildBodies(camera) {
  const sunProjection = projectSphere(0, 0, 0, sun.size, camera);
  const sunBody = {
    key: sun.key,
    type: "sun",
    name: sun.name,
    x: sunProjection.x,
    y: sunProjection.y,
    depth: sunProjection.depth,
    radius: sunProjection.radius,
    hitRadius: sunProjection.radius + 6,
    color: sun.color,
    shadowColor: hexToRgba(sun.color, 0.8),
    shadowBlur: 30,
    hasRing: false,
    isSun: true,
  };

  const planetBodies = planets.map((planet) => {
    const position = state.planetPositions[planet.index];
    const projection = projectSphere(
      position[0],
      position[1],
      position[2],
      planet.size,
      camera
    );

    return {
      ...planet,
      type: "planet",
      x: projection.x,
      y: projection.y,
      depth: projection.depth,
      radius: projection.radius,
      hitRadius: Math.max(projection.radius + 4, 10),
      color: getPlanetDisplayColor(planet.index),
      shadowColor: hexToRgba(getPlanetDisplayColor(planet.index), 0.62),
      shadowBlur: 14,
    };
  });

  return [sunBody, ...planetBodies];
}

function drawScene() {
  resizeCanvasToDisplaySize();

  const rect = canvas.getBoundingClientRect();
  const camera = buildCamera(rect.width, rect.height);

  ctx.clearRect(0, 0, camera.width, camera.height);
  drawBackground(camera);

  for (const planet of planets) {
    drawOrbit(planet, camera);
  }

  drawAsteroidImpacts(camera);

  const bodies = buildBodies(camera);
  state.projectedBodies = bodies;
  state.hitTestBodies = [...bodies].sort((left, right) => right.depth - left.depth);

  bodies.sort((left, right) => left.depth - right.depth);
  for (const body of bodies) {
    drawPlanetBody(body);
  }

  drawAsteroidReticles(camera);
  drawPlanetBursts(camera);
  drawActiveLabel(camera);
}

// UI updates and events stay separated from rendering code.
function refreshLabels() {
  speedValue.textContent = `${speedSlider.value}x`;
}

function updateStats() {
  const zoomValue = (DEFAULT_CAMERA_DISTANCE / state.cameraDistance).toFixed(2);
  statsEl.textContent = `${planets.length} планет | Скорость ${state.globalSpeedScale.toFixed(
    2
  )}x | Zoom ${zoomValue}x | Камера X=${state.rotateXDeg.toFixed(
    0
  )}° Y=${state.rotateYDeg.toFixed(0)}° Z=${state.cameraDistance.toFixed(2)}`;
}

function renderLegend() {
  state.legendElements = new Map();
  planetLegend.textContent = "";

  const fragment = document.createDocumentFragment();
  const items = [sun, ...planets];

  for (const item of items) {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    const label = document.createElement("span");

    li.className = "planet-legend__item";
    li.tabIndex = 0;
    li.dataset.bodyKey = item.key;

    if ("index" in item) {
      li.dataset.planetIndex = String(item.index);
    }

    swatch.className = "planet-legend__swatch";
    swatch.style.background = item.color;
    label.textContent = item.name;

    li.append(swatch, label);
    fragment.append(li);
    state.legendElements.set(item.key, li);
  }

  planetLegend.append(fragment);
  syncLegendState();
}

function syncLegendState() {
  state.legendElements.forEach((element, key) => {
    const planetIndex = planetIndexFromKey(key);
    element.classList.toggle("is-active", key === state.activeBodyKey);
    element.classList.toggle(
      "is-damaged",
      planetIndex >= 0 && state.planetDamaged[planetIndex]
    );
  });
}

function getLegendItemFromEvent(event) {
  return event.target.closest(".planet-legend__item");
}

function handleLegendEnter(event) {
  const item = getLegendItemFromEvent(event);
  if (!item || item.contains(event.relatedTarget)) {
    return;
  }

  setActiveBodyKey(item.dataset.bodyKey);
}

function handleLegendLeave(event) {
  const item = getLegendItemFromEvent(event);
  if (!item || item.contains(event.relatedTarget)) {
    return;
  }

  if (state.activeBodyKey === item.dataset.bodyKey) {
    setActiveBodyKey(null);
  }
}

function handleLegendActivate(item) {
  if (!item) {
    return;
  }

  setActiveBodyKey(item.dataset.bodyKey);

  if (item.dataset.planetIndex === undefined) {
    return;
  }

  togglePlanetImpact(Number(item.dataset.planetIndex));
}

function resetScene() {
  state.globalSpeedScale = 1;
  state.cameraDistance = DEFAULT_CAMERA_DISTANCE;
  state.globalTime = 0;
  state.isPaused = false;
  state.activeBodyKey = null;
  state.planetDamaged = planets.map(() => false);
  state.asteroidImpacts = [];
  state.planetBursts = [];
  state.rotateXDeg = DEFAULT_VIEW.x;
  state.rotateYDeg = DEFAULT_VIEW.y;

  speedSlider.value = state.globalSpeedScale;
  playPauseBtn.textContent = "Пауза";

  updatePlanetPositions();
  refreshLabels();
  syncLegendState();
}

function findBodyHit(screenX, screenY) {
  for (const body of state.hitTestBodies) {
    if (Math.hypot(screenX - body.x, screenY - body.y) <= body.hitRadius) {
      return body;
    }
  }

  return null;
}

function getCanvasCoordinates(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function bindLegendEvents() {
  planetLegend.addEventListener("mouseover", handleLegendEnter);
  planetLegend.addEventListener("mouseout", handleLegendLeave);

  planetLegend.addEventListener("focusin", (event) => {
    const item = getLegendItemFromEvent(event);
    if (item) {
      setActiveBodyKey(item.dataset.bodyKey);
    }
  });

  planetLegend.addEventListener("focusout", (event) => {
    const item = getLegendItemFromEvent(event);
    if (
      item &&
      !item.contains(event.relatedTarget) &&
      state.activeBodyKey === item.dataset.bodyKey
    ) {
      setActiveBodyKey(null);
    }
  });

  planetLegend.addEventListener("click", (event) => {
    handleLegendActivate(getLegendItemFromEvent(event));
  });

  planetLegend.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleLegendActivate(getLegendItemFromEvent(event));
  });
}

function bindCanvasEvents() {
  canvas.addEventListener("mousedown", (event) => {
    state.isDragging = true;
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    state.dragDistance = 0;
    canvas.style.cursor = "";
    canvas.classList.add("dragging");
  });

  window.addEventListener("mousemove", (event) => {
    if (!state.isDragging) {
      return;
    }

    const dx = event.clientX - state.lastPointerX;
    const dy = event.clientY - state.lastPointerY;

    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    state.dragDistance += Math.hypot(dx, dy);
    state.rotateYDeg += dx * CAMERA_ROTATE_SENSITIVITY;
    state.rotateXDeg += dy * CAMERA_ROTATE_SENSITIVITY;
    state.rotateXDeg = Math.max(-85, Math.min(20, state.rotateXDeg));
  });

  window.addEventListener("mouseup", () => {
    state.isDragging = false;
    canvas.classList.remove("dragging");
  });

  canvas.addEventListener("mousemove", (event) => {
    if (state.isDragging) {
      return;
    }

    const point = getCanvasCoordinates(event);
    const hitBody = findBodyHit(point.x, point.y);

    setActiveBodyKey(hitBody ? hitBody.key : null);
    canvas.style.cursor =
      hitBody && hitBody.type === "planet" ? "pointer" : "";
  });

  canvas.addEventListener("mouseleave", () => {
    if (!state.isDragging) {
      setActiveBodyKey(null);
      canvas.style.cursor = "";
    }
  });

  canvas.addEventListener("click", (event) => {
    if (state.dragDistance > DRAG_THRESHOLD) {
      state.dragDistance = 0;
      return;
    }

    const point = getCanvasCoordinates(event);
    const hitBody = findBodyHit(point.x, point.y);

    if (hitBody && hitBody.type === "planet") {
      togglePlanetImpact(hitBody.index);
    }
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const zoomFactor = 1.08;

      if (event.deltaY > 0) {
        state.cameraDistance *= zoomFactor;
      } else {
        state.cameraDistance /= zoomFactor;
      }

      state.cameraDistance = Math.max(
        CAMERA_DISTANCE_MIN,
        Math.min(CAMERA_DISTANCE_MAX, state.cameraDistance)
      );
    },
    { passive: false }
  );
}

function initUI() {
  speedSlider.value = state.globalSpeedScale;
  refreshLabels();
  renderLegend();
  bindLegendEvents();
  bindCanvasEvents();

  speedSlider.addEventListener("input", () => {
    state.globalSpeedScale = parseFloat(speedSlider.value);
    refreshLabels();
  });

  playPauseBtn.addEventListener("click", () => {
    state.isPaused = !state.isPaused;
    playPauseBtn.textContent = state.isPaused ? "Продолжить" : "Пауза";
  });

  resetBtn.addEventListener("click", () => {
    resetScene();
  });
}

function animate(timestamp) {
  const dt = Math.min((timestamp - state.lastTime) / 1000, 0.03);
  state.lastTime = timestamp;

  if (!state.isPaused) {
    state.globalTime += dt * state.globalSpeedScale;
    updatePlanetPositions();
    updateEffects(dt);
  }

  drawScene();
  updateStats();
  requestAnimationFrame(animate);
}

window.addEventListener("load", () => {
  state.backgroundStars = createBackgroundStars(BACKGROUND_STAR_COUNT);
  initUI();
  updatePlanetPositions();

  state.lastTime = performance.now();
  requestAnimationFrame(animate);
});
