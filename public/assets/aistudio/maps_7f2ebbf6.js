(function (DL) {
  'use strict';

  const TAU = Math.PI * 2;
  const LANE = DL.config.lane;

  /* ---- outlines: closed clockwise paths, first point = player one's tip ---- */

  function ellipse(a, b) {
    const out = [];
    for (let i = 0; i < 4000; i++) {
      const t = (i / 4000) * TAU;
      out.push({ x: -a * Math.cos(t), y: -b * Math.sin(t) });
    }
    return out;
  }

  function polygon(verts) {
    const out = [];
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5));
      for (let k = 0; k < steps; k++) {
        const f = k / steps;
        out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      }
    }
    return out;
  }

  // Two equal-radius circular loops tangent at the centre, forming a clean figure-eight route.
  function twinCircles(radius) {
    const out = [];
    const half = 2000;
    const separation = radius * 1.176;
    const d = separation / 2;
    const alpha = Math.acos(d / radius);
    for (let i = 0; i < half; i++) {
      const t = alpha - (i / half) * TAU;
      out.push({ x: -d + radius * Math.cos(t), y: radius * Math.sin(t) });
    }
    for (let i = 0; i < half; i++) {
      const t = Math.PI - alpha + (i / half) * TAU;
      out.push({ x: d + radius * Math.cos(t), y: radius * Math.sin(t) });
    }
    return out;
  }



  const SQ3 = Math.sqrt(3) / 2;
  const R = 300;

  const DEFS = [
    {
      id: 'orbit', name: 'Orbit', tile: 'circle', n: 40, gate: 10, start: 0,
      blurb: 'A true circular route with one constant radius and a clean, classic feel.',
      outline: () => ellipse(300, 300)
    },
    {
      id: 'citadel', name: 'Citadel', tile: 'square', n: 48, gate: 12, start: 0,
      blurb: 'A precise square route with four equal sides and matching diagonals.',
      outline: () => polygon([{ x: -300, y: -300 }, { x: 300, y: -300 }, { x: 300, y: 300 }, { x: -300, y: 300 }])
    },
    {
      id: 'infinity', name: 'Infinity', tile: 'circle', n: 40, gate: 5, start: 16, junctionPairs: [[0, 20], [6, 26]],
      blurb: 'Two equal-radius circular loops intersect at two shared crossroads.',
      outline: () => twinCircles(150)
    }
  ];

  function resample(dense, n) {
    const m = dense.length;
    const cum = [0];
    for (let i = 1; i <= m; i++) {
      const a = dense[i - 1];
      const b = dense[i % m];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const total = cum[m];
    const pts = [];
    let j = 0;
    for (let k = 0; k < n; k++) {
      const target = (k * total) / n;
      while (j < m - 1 && cum[j + 1] < target) j++;
      const a = dense[j];
      const b = dense[(j + 1) % m];
      const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
      pts.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    }
    return { pts, total };
  }

  function build(id, portrait) {
    const def = DEFS.find((d) => d.id === id) || DEFS[0];
    let dense = def.outline();
    if (portrait) dense = dense.map((p) => ({ x: p.y, y: -p.x }));

    const { pts, total } = resample(dense, def.n);
    const n = def.n;
    const spacing = total / n;
    const tileId = Array.from({ length: n }, (_, i) => i);
    const junction = new Set();
    const junctionSkip = new Set();
    const junctionPairs = def.junctionPairs || (def.junction ? [def.junction] : []);
    junctionPairs.forEach(([a, b]) => {
      pts[b] = { x: pts[a].x, y: pts[a].y };
      junction.add(a); junction.add(b); junctionSkip.add(b);
      tileId[b] = tileId[a];
    });

    const ang = pts.map((_, i) => {
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      return Math.atan2(b.y - a.y, b.x - a.x);
    });

    // The starting tile is also the player's home-lane gate. A token must complete
    // all n outer tiles and return to this same tile before entering its home lane.
    const s0 = ((def.start || 0) - def.gate + n) % n;
    const start = [s0, (s0 + n / 2) % n];
    const entry = start.slice();
    const rl = n + 1; // progress 0..n includes the full lap and the return to the gate
    const len = rl + LANE;

    const lanes = entry.map((e) => {
      const p = pts[e];
      const dist = Math.hypot(p.x, p.y);
      const dir = { x: -p.x / dist, y: -p.y / dist };
      const step = Math.min(spacing * 1.15, (0.8 * dist) / LANE);
      return Array.from({ length: LANE }, (_, i) => ({
        x: p.x + dir.x * step * (i + 1),
        y: p.y + dir.y * step * (i + 1)
      }));
    });
    const laneDir = entry.map((e, p) => {
      const a = pts[e];
      const b = lanes[p][0];
      return Math.atan2(b.y - a.y, b.x - a.x);
    });

    const a = Math.round(n * 0.2);
    const b = Math.round(n * 0.3);
    const safe = new Set([0, n / 2, a, b, a + n / 2, b + n / 2].map((r) => (s0 + r) % n));
    const bo = Math.round(n * 0.075);
    const bp = Math.round(n * 0.425);
    const boost = new Set([bo, bp, bo + n / 2, bp + n / 2].map((r) => (s0 + r) % n));

    const tileR = spacing * 0.36;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    dense.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    const pad = tileR * 2.2;
    const extent = Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY)) + pad;

    return {
      id: def.id, name: def.name, blurb: def.blurb, tile: def.tile, portrait: !!portrait,
      n, gate: def.gate, rl, len, home: len - 1, lane: LANE,
      pts, ang, tileId, junction, junctionSkip, start, entry, lanes, laneDir, safe, boost,
      spacing, tileR, dense,
      // Every map is centered inside an identical square design frame; the route itself is never stretched.
      bounds: { minX: -extent, maxX: extent, minY: -extent, maxY: extent }
    };
  }

  DL.Maps = {
    list: DEFS.map((d) => ({ id: d.id, name: d.name, blurb: d.blurb, tile: d.tile })),
    build
  };
})(globalThis.DL = globalThis.DL || {});
