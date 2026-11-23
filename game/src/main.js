// main.js — Poly GTA: player, driving, wanted police, shooting, missions, HUD.
// Original code written for Solmar. Uses global THREE, SolmarWorld, SolmarVehicles.
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 180, 420);
  var camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- world ----
  var params = new URLSearchParams(window.location.search);
  var seed = parseInt(params.get('seed') || '7', 10) || 7;
  var shot = params.get('shot') || '';
  var world = SolmarWorld.buildWorld(scene, seed);

  // Seeded rng for traffic / pedestrians (independent stream).
  function rngStream(s) {
    var a = s >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rng = rngStream(seed * 31 + 5);

  var traffic = SolmarVehicles.makeTraffic(scene, world, 10, rng);
  var walkers = SolmarVehicles.makePedestrians(scene, 22, rng);
  // Parked stealable cars from the city builder, plus a few on roads.
  var parked = [];
  world.carSpawns.slice(0, 8).forEach(function (s) {
    parked.push(SolmarVehicles.makeCar(scene, s.x, s.z, s.angle, [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6][parked.length % 4], false));
  });
  var cops = [];

  // ---- player ----
  function makePlayerMesh() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2e6fdb }));
    body.position.y = 1.15; body.castShadow = true; g.add(body);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55),
      new THREE.MeshLambertMaterial({ color: 0xf5cd30 }));
    head.position.y = 2.05; g.add(head);
    var hair = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    hair.position.y = 2.38; g.add(hair);
    var legMat = new THREE.MeshLambertMaterial({ color: 0x2e8b3a });
    var l1 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.9, 0.32), legMat);
    l1.position.set(-0.22, 0.45, 0); g.add(l1);
    var l2 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.9, 0.32), legMat);
    l2.position.set(0.22, 0.45, 0); g.add(l2);
    scene.add(g);
    return g;
  }
  var playerMesh = makePlayerMesh();

  var state = {
    running: false, paused: false, over: false, won: false,
    x: 0, z: 30, angle: 0, speed: 0, onFoot: true, inCar: null,
    cash: 0, score: 0, health: 100, wanted: 0, wantedTimer: 0,
    mission: 0, missionDone: [false, false, false],
    camYaw: 0.6, camPitch: 0.42, time: 0
  };

  var MISSIONS = [
    { name: 'Job 1 — First Wheels', text: 'Steal a car and drive to the golden beacon at the docks.', target: 'docks' },
    { name: 'Job 2 — Beach Run', text: 'Deliver the package to the green beacon on the pier.', target: 'pier' },
    { name: 'Job 3 — Heat Wave', text: 'Escape to the blue beacon at the safehouse. Lose the police!', target: 'safehouse' }
  ];

  // ---- audio: tiny WebAudio beeps, no files ----
  var audioCtx = null;
  function beep(freq, dur, type) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.08, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (dur || 0.12));
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + (dur || 0.12));
    } catch (e) { /* audio is optional */ }
  }

  // ---- input ----
  var keys = {};
  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'KeyE') tryEnterCar();
    if (e.code === 'KeyF') shoot();
    if (e.code === 'KeyH') beep(220, 0.25, 'sawtooth');
    if (e.code === 'KeyP') togglePause();
    if (['Space', 'ArrowUp', 'ArrowDown'].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  var dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('mousedown', function (e) { dragging = true; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener('mouseup', function () { dragging = false; });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    state.camYaw -= (e.clientX - lastX) * 0.005;
    state.camPitch = Math.max(0.12, Math.min(1.1, state.camPitch + (e.clientY - lastY) * 0.003));
    lastX = e.clientX; lastY = e.clientY;
  });

  // ---- HUD ----
  var el = {};
  ['stars', 'scoreVal', 'cashVal', 'speedVal', 'missionName', 'missionText',
   'healthBar', 'toast', 'titleScreen', 'pauseScreen', 'gameOverScreen',
   'winScreen', 'bestLine', 'gameOverText', 'winText'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });
  var minimap = document.getElementById('minimap');
  var mctx = minimap.getContext('2d');
  var toastTimer = 0;
  function toast(msg, ms) {
    el.toast.textContent = msg;
    toastTimer = ms || 2600;
  }
  function refreshHud() {
    var s = '';
    for (var i = 0; i < 5; i++) s += '<span class="' + (i < state.wanted ? '' : 'off') + '">★</span>';
    el.stars.innerHTML = s;
    el.scoreVal.textContent = Math.floor(state.score);
    el.cashVal.textContent = state.cash;
    el.healthBar.style.width = Math.max(0, state.health) + '%';
    el.healthBar.style.background = state.health > 50 ? '#3ddc5f' : (state.health > 25 ? '#ffd94d' : '#e74c3c');
    var m = MISSIONS[state.mission];
    el.missionName.textContent = m ? m.name : 'Solmar';
    el.missionText.textContent = m ? m.text : 'All jobs done.';
    el.speedVal.textContent = state.onFoot ? 'On foot — find a car (E)' : ('Driving — ' + Math.round(Math.abs(state.speed) * 3.6) + ' km/h');
  }

  function drawMinimap() {
    var S = 190, B = world.bounds;
    mctx.clearRect(0, 0, S, S);
    mctx.fillStyle = '#274b2f'; mctx.fillRect(0, 0, S, S);
    mctx.fillStyle = '#3a3f4a';
    for (var i = -4; i <= 4; i++) {
      mctx.fillRect((i * 40 / (B * 2) + 0.5) * S - 2, 0, 4, S);
      mctx.fillRect(0, (i * 40 / (B * 2) + 0.5) * S - 2, S, 4);
    }
    // beach strip at the bottom (south = -Z)
    mctx.fillStyle = '#f0d9a0'; mctx.fillRect(0, S - 12, S, 12);
    mctx.fillStyle = '#2f8fc9'; mctx.fillRect(0, S - 6, S, 6);
    function dot(x, z, col, r) {
      mctx.fillStyle = col;
      mctx.beginPath();
      mctx.arc((x / (B * 2) + 0.5) * S, (z / (B * 2) + 0.5) * S, r, 0, Math.PI * 2);
      mctx.fill();
    }
    var t = world.targets[MISSIONS[state.mission] ? MISSIONS[state.mission].target : 'docks'];
    if (t && !state.won) dot(t.x, t.z, '#ffd94d', 6);
    traffic.forEach(function (c) { dot(c.x, c.z, '#ddd', 2); });
    cops.forEach(function (c) { dot(c.x, c.z, '#ff3333', 3); });
    dot(state.x, state.z, '#7dff9a', 4);
  }

  // ---- collision: keep the player out of buildings ----
  function collide(x, z, radius) {
    var bs = world.buildings;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      var dx = Math.max(Math.abs(x - b.x) - b.w / 2, 0);
      var dz = Math.max(Math.abs(z - b.z) - b.d / 2, 0);
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }

  function nearestCar(maxDist) {
    var best = null, bestD = maxDist;
    var all = parked.concat(traffic);
    for (var i = 0; i < all.length; i++) {
      var d = Math.hypot(all[i].x - state.x, all[i].z - state.z);
      if (d < bestD) { bestD = d; best = all[i]; }
    }
    return best;
  }

  function tryEnterCar() {
    if (!state.running || state.paused || state.over) return;
    if (!state.onFoot) {
      // Get out on the driver's side; if that spot is inside a building, try the other side.
      var c = state.inCar;
      state.onFoot = true; state.inCar = null;
      var side = Math.PI / 2;
      var ox = c.x + Math.sin(c.angle + side) * 3;
      var oz = c.z + Math.cos(c.angle + side) * 3;
      if (collide(ox, oz, 1)) {
        ox = c.x + Math.sin(c.angle - side) * 3;
        oz = c.z + Math.cos(c.angle - side) * 3;
      }
      state.x = ox; state.z = oz;
      playerMesh.visible = true;
      toast('Out of the car');
      return;
    }
    var car = nearestCar(6);
    if (!car) { toast('No car close enough — walk to one'); return; }
    state.onFoot = false; state.inCar = car;
    playerMesh.visible = false;
    if (car.isPolice) { addWanted(1); }
    else if (parked.indexOf(car) >= 0) {
      addWanted(1);
      toast('Car stolen! Wanted level up');
      beep(660, 0.15);
      parked.splice(parked.indexOf(car), 1);
    } else {
      toast('Car jacked!');
      addWanted(1);
      traffic.splice(traffic.indexOf(car), 1);
    }
    state.score += 25;
    checkMission();
  }

  function addWanted(n) {
    state.wanted = Math.min(5, state.wanted + n);
    state.wantedTimer = 0;
    while (cops.length < state.wanted) {
      var a = Math.random() * Math.PI * 2;
      cops.push(SolmarVehicles.makePolice(scene, state.x + Math.sin(a) * 55, state.z + Math.cos(a) * 55));
    }
  }

  // ---- shooting: simple tracer shots forward ----
  var shots = [];
  function shoot() {
    if (!state.running || state.paused || state.over) return;
    var dir = state.onFoot ? state.angle : (state.inCar ? state.inCar.angle : 0);
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    mesh.position.set(state.x + Math.sin(dir) * 2, 1.2, state.z + Math.cos(dir) * 2);
    scene.add(mesh);
    shots.push({ mesh: mesh, x: mesh.position.x, z: mesh.position.z, dir: dir, life: 0.7 });
    beep(880, 0.08);
    state.score += 2;
  }

  function stepShots(dt) {
    for (var i = shots.length - 1; i >= 0; i--) {
      var s = shots[i];
      s.x += Math.sin(s.dir) * 60 * dt;
      s.z += Math.cos(s.dir) * 60 * dt;
      s.life -= dt;
      s.mesh.position.set(s.x, 1.2, s.z);
      s.mesh.rotation.y = s.dir;
      var hit = false;
      for (var j = 0; j < cops.length; j++) {
        if (Math.hypot(cops[j].x - s.x, cops[j].z - s.z) < 3) {
          scene.remove(cops[j].mesh); cops.splice(j, 1); hit = true;
          state.score += 100; toast('Police car down! +100'); beep(440, 0.2);
          break;
        }
      }
      if (hit || s.life <= 0) { scene.remove(s.mesh); shots.splice(i, 1); }
    }
  }

  // ---- missions ----
  function checkMission() {
    if (state.won || state.mission >= MISSIONS.length) return;
    var m = MISSIONS[state.mission];
    var t = world.targets[m.target];
    var d = Math.hypot(t.x - state.x, t.z - state.z);
    var needCar = state.mission === 0;
    if (d < 10 && (!needCar || !state.onFoot)) completeMission();
  }
  function completeMission() {
    state.missionDone[state.mission] = true;
    state.cash += 500; state.score += 500;
    beep(523, 0.15); setTimeout(function () { beep(784, 0.25); }, 140);
    if (state.mission >= MISSIONS.length - 1) {
      state.won = true;
      saveBest();
      el.winText.textContent = 'All three jobs done — $' + state.cash + ' earned, score ' + state.score + '.';
      el.winScreen.classList.remove('hidden');
      state.running = false;
      toast('You win!');
    } else {
      state.mission++;
      toast(MISSIONS[state.mission - 1].name + ' complete! +$500');
    }
    refreshHud();
  }

  function saveBest() {
    try {
      var best = parseInt(localStorage.getItem('polyGtaBest') || '0', 10) || 0;
      if (state.score > best) localStorage.setItem('polyGtaBest', String(state.score));
      var b = parseInt(localStorage.getItem('polyGtaBest') || '0', 10) || 0;
      el.bestLine.textContent = 'Best score so far: ' + b;
    } catch (e) { /* storage optional */ }
  }
  saveBest();

  // ---- screens / flow ----
  function startGame() {
    state.running = true; state.paused = false; state.over = false; state.won = false;
    el.titleScreen.classList.add('hidden');
    el.pauseScreen.classList.add('hidden');
    el.gameOverScreen.classList.add('hidden');
    el.winScreen.classList.add('hidden');
    toast('Job 1: steal a car, drive to the docks');
    refreshHud();
  }
  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    el.pauseScreen.classList.toggle('hidden', !state.paused);
  }
  function gameOver(msg) {
    state.over = true; state.running = false;
    el.gameOverText.textContent = msg;
    el.gameOverScreen.classList.remove('hidden');
    saveBest();
  }
  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('resumeBtn').addEventListener('click', togglePause);
  document.getElementById('retryBtn').addEventListener('click', function () { window.location.reload(); });
  document.getElementById('againBtn').addEventListener('click', function () { window.location.reload(); });

  // ---- movement ----
  function stepPlayer(dt) {
    var fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    var turn = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
    if (state.onFoot) {
      state.angle += turn * 3.2 * dt;
      var sp = fwd * 7;
      var nx = state.x + Math.sin(state.angle) * sp * dt;
      var nz = state.z + Math.cos(state.angle) * sp * dt;
      if (!collide(nx, nz, 1)) { state.x = nx; state.z = nz; }
      state.speed = sp;
      playerMesh.position.set(state.x, Math.abs(Math.sin(state.time * 9)) * (fwd ? 0.14 : 0), state.z);
      playerMesh.rotation.y = state.angle;
    } else if (state.inCar) {
      var car = state.inCar;
      car.angle += turn * 1.9 * dt * (car.speed >= 0 ? 1 : -1) * (fwd >= 0 ? 1 : -1);
      var accel = fwd * 22;
      if (keys.Space) accel = -car.speed * 4;
      car.speed = Math.max(-10, Math.min(car.maxSpeed, car.speed + accel * dt));
      car.speed *= (1 - 0.6 * dt);
      var cx = car.x + Math.sin(car.angle) * car.speed * dt;
      var cz = car.z + Math.cos(car.angle) * car.speed * dt;
      if (!collide(cx, cz, 2.4)) { car.x = cx; car.z = cz; }
      else { car.speed *= -0.3; state.health -= 2; beep(140, 0.15); }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.angle;
      state.x = car.x; state.z = car.z; state.speed = car.speed;
      state.score += Math.abs(car.speed) * dt * 0.2;
    }
    // Keep inside the city.
    state.x = Math.max(-world.bounds, Math.min(world.bounds, state.x));
    state.z = Math.max(-world.bounds, Math.min(world.bounds, state.z));
  }

  function stepWanted(dt) {
    if (state.wanted > 0) {
      state.wantedTimer += dt;
      // Wanted fades after 25 quiet seconds.
      if (state.wantedTimer > 25) {
        state.wanted--; state.wantedTimer = 0;
        if (state.wanted === 0) {
          cops.forEach(function (c) { scene.remove(c.mesh); });
          cops.length = 0;
          toast('You lost the police');
        }
      }
      // Police ram damage when they touch the player.
      for (var i = 0; i < cops.length; i++) {
        if (Math.hypot(cops[i].x - state.x, cops[i].z - state.z) < 3.4) {
          state.health -= 14 * dt;
          if (state.health <= 0) { state.health = 0; gameOver('The Solmar police caught up with you.'); }
        }
      }
    }
  }

  function updateCamera(dt) {
    var dist = state.onFoot ? 13 : 19;
    var h = dist * Math.tan(state.camPitch);
    var yaw = state.onFoot ? state.camYaw : (state.inCar ? state.inCar.angle + Math.PI : state.camYaw);
    // Smoothly follow behind the player/car heading.
    var tx = state.x - Math.sin(yaw) * dist;
    var tz = state.z - Math.cos(yaw) * dist;
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 5);
    camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 5);
    camera.position.y += ((h + 4) - camera.position.y) * Math.min(1, dt * 5);
    camera.lookAt(state.x, 2, state.z);
  }

  // ---- shot staging for screenshots ----
  function stageShot() {
    if (shot === 'start') {
      state.x = 0; state.z = 30; state.angle = 0;
      playerMesh.position.set(0, 0, 30);
      camera.position.set(-14, 10, 48);
      camera.lookAt(0, 2, 0);
    } else if (shot === 'play') {
      startGame();
      // Put the player in a car near the docks beacon, mid-chase.
      var car = parked[0] || traffic[0];
      if (car) {
        state.onFoot = false; state.inCar = car; playerMesh.visible = false;
        // Road intersection (-160, 140): (-140, 140) was a building block,
        // which put the car and chase camera inside a building.
        car.x = -160; car.z = 140; car.angle = Math.PI; car.speed = 0;
        // Heading north up the x=-160 road: the chase camera then sits on
        // the same road behind the car, with the docks beacon ahead.
        state.camPitch = 0.7;
        car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.angle;
        state.x = car.x; state.z = car.z;
      }
      addWanted(2);
      state.cash = 500; state.score = 525;
      camera.position.set(-160, 16, 165);
      camera.lookAt(-140, 2, 140);
      refreshHud();
    } else if (shot === 'end') {
      state.won = true; state.cash = 1500; state.score = 1800;
      el.winScreen.classList.remove('hidden');
      el.titleScreen.classList.add('hidden');
      camera.position.set(140, 18, 185);
      camera.lookAt(160, 2, 160);
      refreshHud();
    }
    window.__shotReady = true;
  }

  // ---- main loop ----
  var last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.paused) state.time += dt;
    if (state.running && !state.paused && !state.over) {
      stepPlayer(dt);
      SolmarVehicles.stepTraffic(traffic, dt, world.bounds);
      SolmarVehicles.stepPedestrians(walkers, dt, state.time, world.bounds);
      SolmarVehicles.stepPolice(cops, state.x, state.z, dt);
      stepShots(dt);
      stepWanted(dt);
      checkMission();
      if (toastTimer > 0) {
        toastTimer -= dt * 1000;
        if (toastTimer <= 0) el.toast.textContent = '';
      }
      refreshHud();
      drawMinimap();
    }
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  refreshHud();
  drawMinimap();
  if (shot) {
    // Render one frame, then mark ready for the screenshot tool.
    renderer.render(scene, camera);
    stageShot();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
})();
