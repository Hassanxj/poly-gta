// vehicles.js — low-poly cars, traffic drivers, pedestrians and police chasers.
// All meshes are plain boxes / cylinders, built from scratch. Uses global THREE.
(function () {
  'use strict';

  var CAR_COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x2c3e50, 0xe67e22];

  function makeCarMesh(color, isPolice) {
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: color, flatShading: true });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4.4), bodyMat);
    body.position.y = 0.55; body.castShadow = true;
    g.add(body);
    var cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.6, 2.2),
      new THREE.MeshLambertMaterial({ color: isPolice ? 0x111111 : 0x9fd8ff, flatShading: true })
    );
    cabin.position.set(0, 1.2, -0.2); cabin.castShadow = true;
    g.add(cabin);
    // Rear brake lights, so a car reads as a car from behind at dusk.
    var lightMat = new THREE.MeshLambertMaterial({ color: 0xcc1111 });
    var rl1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    rl1.position.set(-0.8, 0.6, -2.22); g.add(rl1);
    var rl2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    rl2.position.set(0.8, 0.6, -2.22); g.add(rl2);
    var wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
    var wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    var spots = [[-1.05, 1.45], [1.05, 1.45], [-1.05, -1.45], [1.05, -1.45]];
    for (var k = 0; k < spots.length; k++) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(spots[k][0], 0.42, spots[k][1]);
      g.add(w);
    }
    if (isPolice) {
      var bar = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.25, 0.5),
        new THREE.MeshLambertMaterial({ color: 0xff2222 })
      );
      bar.position.set(0, 1.65, -0.2);
      g.add(bar);
      var stripe = new THREE.Mesh(
        new THREE.BoxGeometry(2.25, 0.25, 4.45),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      stripe.position.y = 0.62;
      g.add(stripe);
    }
    return g;
  }

  function makeCar(scene, x, z, angle, color, isPolice) {
    var mesh = makeCarMesh(color, isPolice);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = angle || 0;
    scene.add(mesh);
    return {
      mesh: mesh, x: x, z: z, angle: angle || 0,
      speed: 0, maxSpeed: isPolice ? 26 : 16, isPolice: !!isPolice,
      driver: null
    };
  }

  // Traffic cars drive along the road grid, turning at intersections.
  function makeTraffic(scene, world, count, rng) {
    var cars = [];
    for (var i = 0; i < count; i++) {
      var lane = (Math.floor(rng() * 9) - 4) * 40 + (rng() < 0.5 ? -3 : 3);
      var along = (rng() - 0.5) * 360;
      var horizontal = rng() < 0.5;
      var x = horizontal ? along : lane;
      var z = horizontal ? lane : along;
      var angle = horizontal ? (lane > 0 ? Math.PI / 2 : -Math.PI / 2) : (lane > 0 ? Math.PI : 0);
      var c = makeCar(scene, x, z, angle, CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], false);
      c.speed = 8 + rng() * 6;
      c.horizontal = horizontal;
      c.lane = lane;
      cars.push(c);
    }
    return cars;
  }

  function stepTraffic(cars, dt, bounds) {
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      var dx = Math.sin(c.angle), dz = Math.cos(c.angle);
      c.x += dx * c.speed * dt;
      c.z += dz * c.speed * dt;
      // Turn around at the city edge instead of driving into the sea.
      if (Math.abs(c.x) > bounds || Math.abs(c.z) > bounds) {
        c.angle += Math.PI;
        c.x = Math.max(-bounds, Math.min(bounds, c.x));
        c.z = Math.max(-bounds, Math.min(bounds, c.z));
      }
      // Occasionally turn at a road crossing.
      var nearCross = Math.abs(((c.x % 40) + 40) % 40) < 1.2 && Math.abs(((c.z % 40) + 40) % 40) < 1.2;
      if (nearCross && Math.random() < 0.01) c.angle += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.angle;
    }
  }

  function makePedestrian(scene, x, z, rng) {
    var g = new THREE.Group();
    var shirt = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.1, 0.5),
      new THREE.MeshLambertMaterial({ color: [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71][Math.floor(rng() * 4)] })
    );
    shirt.position.y = 1.1; shirt.castShadow = true;
    g.add(shirt);
    var head = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.55, 0.55),
      new THREE.MeshLambertMaterial({ color: 0xf5cd9a })
    );
    head.position.y = 1.95;
    g.add(head);
    var legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    var l1 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, 0.32), legMat);
    l1.position.set(-0.22, 0.4, 0); g.add(l1);
    var l2 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, 0.32), legMat);
    l2.position.set(0.22, 0.4, 0); g.add(l2);
    g.position.set(x, 0, z);
    scene.add(g);
    return {
      mesh: g, x: x, z: z, angle: rng() * Math.PI * 2,
      speed: 1.2 + rng() * 1.2, phase: rng() * 6
    };
  }

  function makePedestrians(scene, count, rng) {
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push(makePedestrian(scene, (rng() - 0.5) * 340, (rng() - 0.5) * 340, rng));
    }
    return out;
  }

  function stepPedestrians(peds, dt, time, bounds) {
    for (var i = 0; i < peds.length; i++) {
      var p = peds[i];
      p.x += Math.sin(p.angle) * p.speed * dt;
      p.z += Math.cos(p.angle) * p.speed * dt;
      if (Math.abs(p.x) > bounds || Math.abs(p.z) > bounds || Math.random() < 0.002) {
        p.angle += (Math.random() - 0.5) * 2.4;
        p.x = Math.max(-bounds, Math.min(bounds, p.x));
        p.z = Math.max(-bounds, Math.min(bounds, p.z));
      }
      p.mesh.position.set(p.x, Math.abs(Math.sin(time * 6 + p.phase)) * 0.12, p.z);
      p.mesh.rotation.y = p.angle;
    }
  }

  // Police: spawn near the player, chase, ram, and give up when wanted drops.
  function makePolice(scene, x, z) {
    var c = makeCar(scene, x, z, 0, 0xffffff, true);
    c.maxSpeed = 27;
    return c;
  }

  function stepPolice(cops, px, pz, dt) {
    for (var i = 0; i < cops.length; i++) {
      var c = cops[i];
      var dx = px - c.x, dz = pz - c.z;
      var dist = Math.hypot(dx, dz) || 1;
      var want = Math.atan2(dx, dz);
      var diff = want - c.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      c.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      c.speed = Math.min(c.maxSpeed, c.speed + 14 * dt);
      c.x += Math.sin(c.angle) * c.speed * dt;
      c.z += Math.cos(c.angle) * c.speed * dt;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.angle;
    }
  }

  window.SolmarVehicles = {
    makeCar: makeCar, makeTraffic: makeTraffic, stepTraffic: stepTraffic,
    makePedestrians: makePedestrians, stepPedestrians: stepPedestrians,
    makePolice: makePolice, stepPolice: stepPolice
  };
})();
