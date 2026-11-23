// world.js — builds Solmar: ground, roads, buildings, trees, beach and job targets.
// Seeded so the same seed always builds the same city. Uses global THREE.
(function () {
  'use strict';

  // Small deterministic random generator (mulberry32 style, written from scratch).
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var PALETTE = [0xf2a65a, 0x7fb5d5, 0xf5d76e, 0xe26d5a, 0x8fd0a0, 0xc9a0dc, 0x6ec6b8, 0xf0f0f0];
  var ROOFS = [0xd94f3d, 0x3d6ed9, 0x2e8b57, 0x8a5a3b, 0x5b4a8a];

  function box(w, h, d, color, x, y, z) {
    var m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: color, flatShading: true })
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function pyramid(w, h, color, x, y, z) {
    var m = new THREE.Mesh(
      new THREE.ConeGeometry(w, h, 4),
      new THREE.MeshLambertMaterial({ color: color, flatShading: true })
    );
    m.position.set(x, y, z);
    m.rotation.y = Math.PI / 4;
    m.castShadow = true;
    return m;
  }

  function buildWorld(scene, seed) {
    var rng = makeRng(seed || 7);
    var group = new THREE.Group();
    var buildings = [];
    var carSpawns = [];
    var trees = [];

    // Lights: bright sun plus soft sky fill, the "sun-soaked" look.
    var sun = new THREE.DirectionalLight(0xfff2cc, 1.6);
    sun.position.set(120, 180, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
    sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
    group.add(sun);
    group.add(new THREE.HemisphereLight(0x9fd8ff, 0x8a6f4d, 0.9));

    // Ground: grass-green base, 440 wide.
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(440, 440),
      new THREE.MeshLambertMaterial({ color: 0x6fae5e })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);

    // Beach + sea along the south edge (negative Z is the beach side).
    var sand = new THREE.Mesh(
      new THREE.PlaneGeometry(440, 46),
      new THREE.MeshLambertMaterial({ color: 0xf0d9a0 })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.05, -197);
    sand.receiveShadow = true;
    group.add(sand);
    var sea = new THREE.Mesh(
      new THREE.PlaneGeometry(440, 60),
      new THREE.MeshLambertMaterial({ color: 0x2f8fc9 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.02, -248);
    group.add(sea);
    var pier = box(10, 1, 60, 0x8a6d4b, 150, 0.5, -230);
    group.add(pier);
    // Harbour crane at the docks, a landmark you can see from across the city.
    var craneLeg = box(3, 22, 3, 0xd94f3d, -160, 11, 150);
    group.add(craneLeg);
    var craneArm = box(26, 2, 2, 0xd94f3d, -148, 21, 150);
    group.add(craneArm);
    var craneHook = box(1.5, 5, 1.5, 0x333333, -138, 17, 150);
    group.add(craneHook);

    // Road grid: dark strips every 40 units, with pale centre dashes.
    var roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
    var dashMat = new THREE.MeshLambertMaterial({ color: 0xf5e9c8 });
    var i, j, r;
    for (i = -4; i <= 4; i++) {
      var ns = new THREE.Mesh(new THREE.PlaneGeometry(10, 400), roadMat);
      ns.rotation.x = -Math.PI / 2; ns.position.set(i * 40, 0.08, 0); group.add(ns);
      var ew = new THREE.Mesh(new THREE.PlaneGeometry(400, 10), roadMat);
      ew.rotation.x = -Math.PI / 2; ew.position.set(0, 0.08, i * 40); group.add(ew);
      for (j = -4; j <= 4; j++) {
        var dash = new THREE.Mesh(new THREE.PlaneGeometry(1, 6), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(i * 40, 0.12, j * 40 + 20);
        group.add(dash);
      }
    }

    // Buildings: one pastel block per city block, away from roads.
    // Blocks are at x,z = +/-20, +/-60, +/-100, +/-140, +/-180 (not on a road line).
    var blockCoords = [-180, -140, -100, -60, -20, 20, 60, 100, 140, 180];
    for (i = 0; i < blockCoords.length; i++) {
      for (j = 0; j < blockCoords.length; j++) {
        var bx = blockCoords[i], bz = blockCoords[j];
        if (bz < -170) continue; // keep the beach clear
        if (rng() < 0.18) continue; // some empty lots with trees instead
        var h = 8 + rng() * 22;
        var w = 14 + rng() * 10;
        var d = 14 + rng() * 10;
        var col = PALETTE[Math.floor(rng() * PALETTE.length)];
        var b = box(w, h, d, col, bx, h / 2, bz);
        group.add(b);
        var roof = pyramid(w * 0.72, 3 + rng() * 4, ROOFS[Math.floor(rng() * ROOFS.length)], bx, h + 2, bz);
        group.add(roof);
        buildings.push({ x: bx, z: bz, w: w, d: d, h: h });
        // A few parked cars near taller buildings.
        if (rng() < 0.4) carSpawns.push({ x: bx + w / 2 + 6, z: bz, angle: 0 });
      }
    }

    // Trees: cones on cylinders, scattered in lots and along the beach.
    for (i = 0; i < 46; i++) {
      var tx = (rng() - 0.5) * 380;
      var tz = (rng() - 0.5) * 380;
      if (Math.abs(tx % 40) < 9 || Math.abs(tz % 40) < 9) continue;
      var trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.9, 3, 5),
        new THREE.MeshLambertMaterial({ color: 0x6b4a2f })
      );
      trunk.position.set(tx, 1.5, tz);
      group.add(trunk);
      var top = new THREE.Mesh(
        new THREE.ConeGeometry(3.2, 7, 6),
        new THREE.MeshLambertMaterial({ color: 0x2f7d3a, flatShading: true })
      );
      top.position.set(tx, 6, tz);
      top.castShadow = true;
      group.add(top);
      trees.push({ x: tx, z: tz });
    }

    // Job targets, marked with a glowing beacon pillar.
    function beacon(x, z, color) {
      var p = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.2, 26, 8),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.45 })
      );
      p.position.set(x, 13, z);
      group.add(p);
      var pad = new THREE.Mesh(
        new THREE.CylinderGeometry(4, 4, 0.4, 12),
        new THREE.MeshLambertMaterial({ color: color })
      );
      pad.position.set(x, 0.2, z);
      group.add(pad);
      return { x: x, z: z };
    }
    var targets = {
      docks: beacon(-160, 160, 0xffd94d),
      pier: beacon(150, -205, 0x7dff9a),
      safehouse: beacon(160, 160, 0x7fb5ff)
    };

    scene.add(group);
    return {
      group: group, buildings: buildings, carSpawns: carSpawns,
      trees: trees, targets: targets, bounds: 200
    };
  }

  window.SolmarWorld = { buildWorld: buildWorld };
})();
