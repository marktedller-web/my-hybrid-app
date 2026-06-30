const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const CANVAS_WIDTH = 432;
const CANVAS_HEIGHT = 768;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const ROAD_WIDTH = canvas.width * 0.68;
const ROAD_X = (canvas.width - ROAD_WIDTH) / 2;
const ROAD_MARGIN = Math.max(16, canvas.width * 0.04);
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;

const player = {
  width: 46,
  height: 80,
  x: 0,
  y: canvas.height - 124,
  lane: 1,
  targetX: 0,
  tilt: 0,
  boost: 0,
  lives: 3,
  shield: false,
  smoke: 0,
};

const audioSystem = new (class {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.createAudioContext();
  }

  createAudioContext() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
    } catch (err) {
      this.ctx = null;
    }
  }

  resume() {
    if (!this.ctx) this.createAudioContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  play(type) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.master);
    gain.gain.setValueAtTime(0, now);

    if (type === 'boost') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(260, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.002, now + 0.28);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.28);
    } else if (type === 'collect') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.frequency.setValueAtTime(760, now + 0.18);
    } else if (type === 'crash') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    }

    osc.start(now);
    osc.stop(now + 0.4);
  }
});

const state = {
  enemies: [],
  buffs: [],
  particles: [],
  barriers: [],
  roadMarkers: [],
  cityLights: [],
  speedLines: [],
  keys: { left: false, right: false },
  score: 0,
  distance: 0,
  speed: 2.4,
  baseSpeed: 2.4,
  maxSpeed: 6.8,
  difficulty: 'Medium',
  trafficLevel: 'Normal',
  frame: 0,
  gameOver: false,
  soundOn: true,
  running: false,
  highScore: 0,
  streak: 0,
};

function resetGame() {
  state.enemies.length = 0;
  state.buffs.length = 0;
  state.particles.length = 0;
  state.barriers.length = 0;
  state.roadMarkers.length = 0;
  state.cityLights.length = 0;
  state.speedLines.length = 0;
  state.keys.left = false;
  state.keys.right = false;
  state.score = 0;
  state.distance = 0;
  state.speed = state.baseSpeed;
  state.frame = 0;
  state.gameOver = false;
  state.running = true;
  state.streak = 0;

  player.lane = 1;
  player.targetX = ROAD_X + player.lane * LANE_WIDTH + (LANE_WIDTH - player.width) / 2;
  player.x = player.targetX;
  player.tilt = 0;
  player.boost = 0;
  player.lives = 3;
  player.shield = false;
  player.smoke = 0;

  setupRoadMarkers();
  setupCityLights();
  updateInterface();
}

function setupRoadMarkers() {
  state.roadMarkers.length = 0;
  for (let y = -100; y < canvas.height + 100; y += 76) {
    state.roadMarkers.push({ y, alpha: Math.random() * 0.2 + 0.2 });
  }
}

function setupCityLights() {
  state.cityLights.length = 0;
  for (let i = 0; i < 18; i += 1) {
    const x = i % 2 === 0 ? ROAD_X - 40 : ROAD_X + ROAD_WIDTH + 40;
    state.cityLights.push({ x, y: 80 + i * 28, strength: Math.random() * 0.45 + 0.2 });
  }
}

function chooseDifficulty(mode) {
  state.difficulty = mode;
  if (mode === 'Easy') {
    state.baseSpeed = 2.2;
    state.maxSpeed = 5.4;
    state.trafficLevel = 'Light';
  } else if (mode === 'Medium') {
    state.baseSpeed = 2.8;
    state.maxSpeed = 6.8;
    state.trafficLevel = 'Normal';
  } else {
    state.baseSpeed = 3.3;
    state.maxSpeed = 8.2;
    state.trafficLevel = 'Heavy';
  }
  document.getElementById('difficultyLabel').textContent = state.difficulty;
  document.getElementById('trafficLevel').textContent = state.trafficLevel;
}

function spawnEnemy() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const width = 38 + Math.random() * 18;
  const height = 68 + Math.random() * 22;
  const colors = ['#ff4f8b', '#ffbf13', '#4dffb5', '#76c7ff', '#ff8b4f'];
  const shape = Math.random() > 0.62 ? 'truck' : 'car';

  state.enemies.push({
    x: ROAD_X + lane * LANE_WIDTH + (LANE_WIDTH - width) / 2,
    y: -height - 30,
    width,
    height,
    lane,
    type: shape,
    color: colors[Math.floor(Math.random() * colors.length)],
    flash: Math.random() > 0.5,
    wobble: Math.random() * 0.5 - 0.25,
  });
}

function spawnBuff() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const types = ['coin', 'boost', 'shield'];
  const type = types[Math.floor(Math.random() * types.length)];
  state.buffs.push({
    x: ROAD_X + lane * LANE_WIDTH + LANE_WIDTH / 2,
    y: -60,
    radius: 15,
    type,
    lane,
    angle: 0,
    glow: Math.random() * 0.8 + 0.4,
  });
}

function spawnBarrier() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  state.barriers.push({
    x: ROAD_X + lane * LANE_WIDTH + 10,
    y: -90,
    width: LANE_WIDTH - 20,
    height: 18,
    lane,
  });
}

function drawRoad() {
  const roadGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  roadGradient.addColorStop(0, '#07101a');
  roadGradient.addColorStop(0.5, '#08151d');
  roadGradient.addColorStop(1, '#02070f');
  ctx.fillStyle = roadGradient;
  ctx.fillRect(ROAD_X, 0, ROAD_WIDTH, canvas.height);

  ctx.strokeStyle = '#0d1f37';
  ctx.lineWidth = 18;
  ctx.strokeRect(ROAD_X + 6, 0, ROAD_WIDTH - 12, canvas.height);

  ctx.strokeStyle = 'rgba(111, 241, 255, 0.12)';
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 26]);
  for (let i = 0; i < LANE_COUNT + 1; i += 1) {
    const x = ROAD_X + i * LANE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(ROAD_X + 7, 0, 8, canvas.height);
  ctx.fillRect(ROAD_X + ROAD_WIDTH - 15, 0, 8, canvas.height);
}

function drawRoadMarkers() {
  const laneCenter = ROAD_X + ROAD_WIDTH / 2;
  state.roadMarkers.forEach((marker) => {
    ctx.globalAlpha = marker.alpha;
    ctx.strokeStyle = 'rgba(112, 221, 255, 0.2)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(laneCenter, marker.y);
    ctx.lineTo(laneCenter, marker.y + 32);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function drawCityLights() {
  state.cityLights.forEach((light, index) => {
    const intensity = 0.2 + Math.sin((state.frame + index * 14) * 0.06) * 0.12;
    ctx.fillStyle = `rgba(79, 169, 255, ${intensity * light.strength})`;
    ctx.fillRect(light.x, light.y, 6, 24);
    ctx.fillStyle = `rgba(255, 79, 171, ${intensity * light.strength * 0.8})`;
    ctx.fillRect(light.x + (light.x < ROAD_X ? -4 : 4), light.y + 8, 4, 10);
  });
}

function drawSpeedLines() {
  state.speedLines.forEach((line) => {
    ctx.strokeStyle = `rgba(111, 241, 255, ${line.alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(line.x, line.y);
    ctx.lineTo(line.x + line.len, line.y + 4);
    ctx.stroke();
  });
}

function generateSpeedLines() {
  if (Math.random() < 0.16) {
    state.speedLines.push({
      x: ROAD_X + Math.random() * ROAD_WIDTH,
      y: canvas.height,
      len: 20 + Math.random() * 16,
      alpha: 0.15 + Math.random() * 0.15,
      speed: 6 + Math.random() * 4,
    });
  }
  state.speedLines.forEach((line) => {
    line.y -= line.speed + state.speed * 1.1;
    line.alpha -= 0.012;
  });
  state.speedLines = state.speedLines.filter((line) => line.alpha > 0);
}

function drawPlayer() {
  const x = player.x;
  const y = player.y;
  const w = player.width;
  const h = player.height;

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(player.tilt * 0.03);
  ctx.translate(-(x + w / 2), -(y + h / 2));

  const body = ctx.createLinearGradient(x, y, x + w, y + h);
  body.addColorStop(0, '#5af0ff');
  body.addColorStop(0.5, '#2ab5f8');
  body.addColorStop(1, '#0c7fff');
  ctx.fillStyle = body;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = '#d7fcff';
  ctx.fillRect(x + 10, y + 14, w - 20, 16);
  ctx.fillStyle = '#061a29';
  ctx.fillRect(x + 10, y + 34, w - 20, 14);

  ctx.fillStyle = '#65f4ff';
  ctx.fillRect(x + 6, y + h - 12, w - 12, 6);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(x + 8, y + 14, w - 24, 2);

  if (player.shield) {
    ctx.strokeStyle = 'rgba(75, 232, 255, 0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  }

  ctx.restore();

  if (player.smoke > 0) {
    for (let i = 0; i < 10; i++) {
      const offsetX = x + w / 2 + (Math.random() - 0.5) * 20;
      const offsetY = y + h + Math.random() * 14;
      ctx.fillStyle = `rgba(15, 35, 55, ${Math.random() * 0.16})`;
      ctx.beginPath();
      ctx.arc(offsetX, offsetY, 4 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawEnemy(enemy) {
  ctx.save();
  ctx.translate(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
  ctx.rotate(Math.sin(state.frame * 0.02 + enemy.wobble) * 0.04);
  ctx.translate(-(enemy.x + enemy.width / 2), -(enemy.y + enemy.height / 2));

  ctx.fillStyle = enemy.color;
  ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(enemy.x + 6, enemy.y + 12, enemy.width - 12, 8);
  ctx.fillRect(enemy.x + 8, enemy.y + enemy.height - 18, enemy.width - 16, 6);

  if (enemy.type === 'truck') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(enemy.x + enemy.width * 0.1, enemy.y + enemy.height * 0.5, enemy.width * 0.8, 10);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(enemy.x, enemy.y, enemy.width, enemy.height);
  ctx.restore();
}

function drawBuff(buff) {
  ctx.save();
  ctx.translate(buff.x, buff.y);
  ctx.rotate(buff.angle);

  if (buff.type === 'coin') {
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, buff.radius);
    gradient.addColorStop(0, '#ffd65f');
    gradient.addColorStop(1, '#ff8b00');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, buff.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 0);
  } else if (buff.type === 'boost') {
    ctx.fillStyle = '#7efcff';
    ctx.beginPath();
    ctx.moveTo(0, -buff.radius);
    ctx.lineTo(buff.radius * 0.5, 0);
    ctx.lineTo(0, buff.radius * 0.3);
    ctx.lineTo(-buff.radius * 0.4, buff.radius * 0.45);
    ctx.lineTo(0, buff.radius * 0.2);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#74ddff';
    ctx.beginPath();
    ctx.arc(0, 0, buff.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0cf';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.restore();
}

function drawBarrier(barrier) {
  ctx.fillStyle = '#344c67';
  ctx.fillRect(barrier.x, barrier.y, barrier.width, barrier.height);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 2;
  ctx.strokeRect(barrier.x, barrier.y, barrier.width, barrier.height);
}

function drawParticles() {
  state.particles.forEach((particle) => {
    ctx.fillStyle = `rgba(111, 241, 255, ${particle.alpha})`;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  });
}

function spawnParticle(x, y, vx, vy) {
  state.particles.push({
    x,
    y,
    vx,
    vy,
    size: 2 + Math.random() * 3,
    alpha: 1,
  });
}

function updateRoadMarkers() {
  state.roadMarkers.forEach((marker) => {
    marker.y += state.speed * 2.2;
    if (marker.y > canvas.height + 40) marker.y = -40;
    marker.alpha = 0.2 + Math.sin((marker.y + state.frame) * 0.03) * 0.08;
  });
}

function updateCityLights() {
  state.cityLights.forEach((light) => {
    light.y += state.speed * 0.2;
    if (light.y > canvas.height) light.y = -60;
  });
}

function updateBuffs() {
  state.buffs.forEach((buff) => {
    buff.y += 2.3 + state.speed * 0.8;
    buff.angle += 0.08;
  });
  state.buffs = state.buffs.filter((buff) => buff.y < canvas.height + buff.radius);
}

function updateBarriers() {
  state.barriers.forEach((barrier) => {
    barrier.y += 2.1 + state.speed * 0.7;
  });
  state.barriers = state.barriers.filter((barrier) => barrier.y < canvas.height + barrier.height);
}

function updateParticles() {
  state.particles.forEach((particle) => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.alpha -= 0.016;
  });
  state.particles = state.particles.filter((particle) => particle.alpha > 0);
}

function updateSpeedLines() {
  generateSpeedLines();
}

function checkCollisions() {
  const playerRect = {
    x: player.x,
    y: player.y,
    width: player.width,
    height: player.height,
  };

  state.enemies.forEach((enemy) => {
    if (rectsOverlap(playerRect, enemy)) {
      if (!player.shield) {
        state.lives -= 1;
        triggerCrash(enemy);
      }
      enemy.hit = true;
    }
  });

  state.buffs.forEach((buff) => {
    if (pointInsideRect(buff.x, buff.y, playerRect)) {
      applyBuff(buff);
      buff.collected = true;
    }
  });

  state.barriers.forEach((barrier) => {
    if (rectsOverlap(playerRect, barrier)) {
      state.lives -= 1;
      barrier.hit = true;
      triggerCrash(barrier);
    }
  });
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function pointInsideRect(px, py, rect) {
  return px > rect.x && px < rect.x + rect.width && py > rect.y && py < rect.y + rect.height;
}

function applyBuff(buff) {
  if (buff.type === 'coin') {
    state.score += 200;
    state.streak += 1;
    audioSystem.play('collect');
  } else if (buff.type === 'boost') {
    player.boost = 170;
    state.score += 320;
    audioSystem.play('boost');
  } else if (buff.type === 'shield') {
    player.shield = true;
    state.score += 230;
    audioSystem.play('collect');
    setTimeout(() => { player.shield = false; }, 2800);
  }
}

function triggerCrash(target) {
  audioSystem.play('crash');
  for (let i = 0; i < 20; i += 1) {
    spawnParticle(target.x + target.width / 2, target.y + target.height / 2, (Math.random() - 0.5) * 5, (Math.random() - 0.2) * 6);
  }
  state.score = Math.max(0, state.score - 120);
  player.smoke = 8;
}

function updateGameSpeed() {
  const speedBonus = Math.min(1.8, state.score / 900);
  state.speed = Math.min(state.maxSpeed + (player.boost > 0 ? 1.2 : 0), state.baseSpeed + speedBonus);
}

function updatePlayerPosition() {
  player.x += (player.targetX - player.x) * 0.18;
  player.tilt = (player.targetX - player.x) * 0.08;
  if (player.smoke > 0) player.smoke -= 0.16;
}

function update() {
  if (!state.running || state.gameOver) return;

  if (state.keys.left && player.lane > 0) {
    player.lane -= 1;
    state.keys.left = false;
  }
  if (state.keys.right && player.lane < LANE_COUNT - 1) {
    player.lane += 1;
    state.keys.right = false;
  }

  player.targetX = ROAD_X + player.lane * LANE_WIDTH + (LANE_WIDTH - player.width) / 2;

  updateRoadMarkers();
  updateCityLights();
  updateBuffs();
  updateBarriers();
  updateParticles();
  updateSpeedLines();
  updateGameSpeed();
  updatePlayerPosition();

  state.frame += 1;
  if (state.frame % 42 === 0) spawnEnemy();
  if (state.frame % 170 === 0 && Math.random() > 0.25) spawnBuff();
  if (state.frame % 200 === 0 && Math.random() > 0.5) spawnBarrier();

  state.enemies.forEach((enemy) => {
    enemy.y += 2 + state.speed * 1.8;
  });
  state.enemies = state.enemies.filter((enemy) => !enemy.hit && enemy.y < canvas.height + enemy.height);
  state.buffs = state.buffs.filter((buff) => !buff.collected && buff.y < canvas.height + buff.radius);
  state.barriers = state.barriers.filter((barrier) => !barrier.hit && barrier.y < canvas.height + barrier.height);

  checkCollisions();
  state.distance += state.speed * 0.62;
  state.score += Math.floor(state.speed * 0.9);

  if (state.lives <= 0) {
    endGame();
  }

  updateInterface();
  draw();
  requestAnimationFrame(update);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawRoad();
  drawRoadMarkers();
  drawCityLights();
  drawSpeedLines();
  state.enemies.forEach(drawEnemy);
  state.buffs.forEach(drawBuff);
  state.barriers.forEach(drawBarrier);
  drawParticles();
  drawPlayer();
  drawGlowMap();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#070b14');
  gradient.addColorStop(0.5, '#040814');
  gradient.addColorStop(1, '#010306');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 20; i += 1) {
    const x = (i % 10) * 48 + 12;
    const y = 24 + Math.sin((state.frame * 0.03 + i) * 0.8) * 6;
    const opacity = 0.1 + Math.sin((state.frame * 0.02 + i) * 0.6) * 0.06;
    ctx.fillStyle = `rgba(76, 222, 255, ${opacity})`;
    ctx.fillRect(x, y, 8, 24);
    ctx.fillRect(canvas.width - x - 8, y + 4, 8, 20);
  }
}

function drawGlowMap() {
  ctx.save();
  const glow = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width / 2);
  glow.addColorStop(0, 'rgba(52, 204, 255, 0.08)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function endGame() {
  state.gameOver = true;
  state.running = false;
  state.highScore = Math.max(state.highScore, state.score);
  document.getElementById('finalScore').textContent = state.score;
  document.getElementById('endHighScore').textContent = state.highScore;
  document.getElementById('finalDistance').textContent = Math.floor(state.distance);
  document.getElementById('highScore').textContent = state.highScore;
  document.getElementById('gameOverOverlay').classList.replace('hidden', 'visible');
}

function updateInterface() {
  document.getElementById('score').textContent = state.score;
  document.getElementById('distance').textContent = Math.floor(state.distance);
  document.getElementById('lives').textContent = player.lives;
  document.getElementById('boost').textContent = `${Math.floor((player.boost / 170) * 100)}%`;
  document.getElementById('boostDisplay').textContent = `${Math.floor((player.boost / 170) * 100)}%`;
  document.getElementById('livesDisplay').textContent = player.lives;
}

function engageInput(event, stateValue) {
  if (event.key === 'ArrowLeft') state.keys.left = stateValue;
  if (event.key === 'ArrowRight') state.keys.right = stateValue;
}

window.addEventListener('keydown', (event) => {
  engageInput(event, true);
  if (event.key === 'Enter' && state.gameOver) restartGame();
});

window.addEventListener('keyup', (event) => {
  engageInput(event, false);
});

window.addEventListener('blur', () => {
  state.keys.left = false;
  state.keys.right = false;
});

document.getElementById('playBtn').addEventListener('click', () => {
  audioSystem.resume();
  state.running = true;
  state.gameOver = false;
  document.getElementById('menuOverlay').classList.replace('visible', 'hidden');
  resetGame();
  update();
});

document.getElementById('restartBtn').addEventListener('click', restartGame);

document.getElementById('soundToggle').addEventListener('click', () => {
  state.soundOn = !state.soundOn;
  audioSystem.enabled = state.soundOn;
  document.getElementById('soundToggle').classList.toggle('active', state.soundOn);
  document.getElementById('soundToggle').textContent = state.soundOn ? '🔊' : '🔇';
});

document.getElementById('pauseBtn').addEventListener('click', () => {
  state.running = !state.running;
  document.getElementById('pauseBtn').textContent = state.running ? '⏸' : '▶';
  if (state.running && !state.gameOver) update();
});

document.querySelectorAll('.difficulty-btn').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.difficulty-btn').forEach((btn) => btn.classList.remove('selected'));
    button.classList.add('selected');
    chooseDifficulty(button.dataset.mode);
  });
});

document.getElementById('leftBtn').addEventListener('touchstart', () => { player.lane = Math.max(0, player.lane - 1); });

document.getElementById('rightBtn').addEventListener('touchstart', () => { player.lane = Math.min(LANE_COUNT - 1, player.lane + 1); });

function restartGame() {
  document.getElementById('gameOverOverlay').classList.replace('visible', 'hidden');
  resetGame();
  update();
}

function init() {
  audioSystem.resume();
  chooseDifficulty('Medium');
  resetGame();
  document.getElementById('highScore').textContent = state.highScore;
  document.getElementById('difficultyLabel').textContent = state.difficulty;
}

init();
