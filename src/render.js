/* Sprigs - drawing.
 *
 * Nothing here is an image file. Every sprig is drawn from its own genes, so
 * two siblings look like siblings and a mutation is something you can see
 * across the valley without opening a panel. */
(function (CG) {
  'use strict';

  function Renderer(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.camX = 600;
    this.dpr = 1;
    this.zoom = 1.4;    /* the valley is drawn a little larger than life */
    this.w = 800; this.h = 480;
    this.vw = 800; this.vh = 480;
    this.resize();
  }

  Renderer.prototype.resize = function () {
    var c = this.canvas, rect = c.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(320, Math.round(rect.width));
    this.h = Math.max(240, Math.round(rect.height));
    c.width = Math.round(this.w * this.dpr);
    c.height = Math.round(this.h * this.dpr);
    /* Drawing happens in "view" units, which are zoom times larger than screen
     * pixels. Everything below works in those units and never sees the zoom. */
    this.zoom = CG.clamp(Math.min(this.w / 520, this.h / 330), 1.2, 2.4);
    this.vw = this.w / this.zoom;
    this.vh = this.h / this.zoom;
    this.ctx.setTransform(this.dpr * this.zoom, 0, 0, this.dpr * this.zoom, 0, 0);
  };

  Renderer.prototype.follow = function (target, dt, snap) {
    if (!target) return;
    var want = CG.clamp(target.x, this.vw / 2, Math.max(this.vw / 2, this.world.w - this.vw / 2));
    if (snap) this.camX = want;
    else this.camX += (want - this.camX) * CG.clamp01(dt * 2.4);
  };

  /* px is a real screen pixel; view units are what the drawing code uses. */
  Renderer.prototype.toWorld = function (px) { return px / this.zoom + this.camX - this.vw / 2; };
  Renderer.prototype.toScreen = function (wx) { return wx - this.camX + this.vw / 2; };
  Renderer.prototype.screenToViewY = function (py) { return py / this.zoom; };

  /* ---------- sky ---------- */
  function skyColours(night) {
    /* day -> dusk -> night, interpolated in plain rgb */
    var day = [[152, 205, 235], [206, 232, 244]];
    var dusk = [[92, 96, 152], [232, 148, 122]];
    var nite = [[14, 18, 44], [38, 44, 84]];
    var a, b, t;
    if (night < 0.5) { a = day; b = dusk; t = night / 0.5; }
    else { a = dusk; b = nite; t = (night - 0.5) / 0.5; }
    function mix(i) {
      return 'rgb(' + Math.round(CG.lerp(a[i][0], b[i][0], t)) + ',' +
        Math.round(CG.lerp(a[i][1], b[i][1], t)) + ',' +
        Math.round(CG.lerp(a[i][2], b[i][2], t)) + ')';
    }
    return [mix(0), mix(1)];
  }

  Renderer.prototype.drawSky = function () {
    var ctx = this.ctx, w = this.vw, h = this.vh, world = this.world;
    var night = world.nightFactor();
    var cols = skyColours(night);
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, cols[0]);
    g.addColorStop(1, cols[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (night > 0.35) {
      ctx.save();
      ctx.globalAlpha = (night - 0.35) / 0.65;
      ctx.fillStyle = '#fff';
      for (var i = 0; i < 60; i++) {
        var sx = ((i * 977) % 1600) - this.camX * 0.15;
        sx = ((sx % 1600) + 1600) % 1600;
        var sy = (i * 613) % Math.max(1, Math.round(h * 0.55));
        var tw = 0.5 + 0.5 * Math.sin(world.time * 1.4 + i);
        ctx.globalAlpha = ((night - 0.35) / 0.65) * (0.35 + 0.5 * tw);
        ctx.fillRect(sx, sy, 1.6, 1.6);
      }
      ctx.restore();
    }

    /* sun and moon ride the same arc, half a day apart */
    var p = (world.time % CG.DAY_LENGTH) / CG.DAY_LENGTH;
    this.drawOrb(p, '#ffe9a8', 20, 1 - night);
    this.drawOrb((p + 0.5) % 1, '#e8eef8', 14, night);
  };

  Renderer.prototype.drawOrb = function (p, colour, r, alpha) {
    if (alpha <= 0.02) return;
    var ctx = this.ctx;
    var x = this.vw * (p * 1.6 - 0.15);
    var y = this.vh * 0.62 - Math.sin(p * Math.PI * 1.15) * this.vh * 0.5;
    ctx.save();
    ctx.globalAlpha = CG.clamp01(alpha);
    ctx.fillStyle = colour;
    ctx.shadowColor = colour; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    ctx.restore();
  };

  Renderer.prototype.drawHills = function () {
    var ctx = this.ctx, h = this.vh, w = this.vw, world = this.world;
    var night = world.nightFactor();
    var gy = this.groundScreenY();
    var layers = [
      { par: 0.25, amp: 34, base: gy - 58, col: 'rgba(96,132,104,' + (0.55 - night * 0.25) + ')', step: 190 },
      { par: 0.45, amp: 26, base: gy - 26, col: 'rgba(74,112,86,' + (0.7 - night * 0.3) + ')', step: 140 }
    ];
    for (var l = 0; l < layers.length; l++) {
      var L = layers[l];
      ctx.fillStyle = L.col;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (var x = -20; x <= w + 20; x += 8) {
        var wx = (x + this.camX * L.par) / L.step;
        var y = L.base - Math.sin(wx) * L.amp - Math.sin(wx * 2.3) * L.amp * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath(); ctx.fill();
    }
  };

  Renderer.prototype.groundScreenY = function () {
    return Math.round(this.vh * 0.74);
  };

  Renderer.prototype.drawGround = function () {
    var ctx = this.ctx, w = this.vw, h = this.vh;
    var gy = this.groundScreenY(), night = this.world.nightFactor();
    var g = ctx.createLinearGradient(0, gy - 10, 0, h);
    g.addColorStop(0, 'rgb(' + Math.round(112 - night * 60) + ',' + Math.round(158 - night * 88) + ',' + Math.round(88 - night * 46) + ')');
    g.addColorStop(1, 'rgb(' + Math.round(64 - night * 34) + ',' + Math.round(92 - night * 50) + ',' + Math.round(56 - night * 30) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, gy, w, h - gy);

    /* the cold grotto in the west reads as a blue chill on the ground */
    var gx = this.toScreen(0), gw = this.toScreen(240) - gx;
    if (gw > 0 && gx < w) {
      var cg = ctx.createLinearGradient(gx, 0, gx + gw, 0);
      cg.addColorStop(0, 'rgba(150,205,255,0.34)');
      cg.addColorStop(1, 'rgba(150,205,255,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(gx, gy - 90, gw, h - gy + 90);
    }

    /* grass tufts, deterministic so they do not crawl about */
    ctx.strokeStyle = 'rgba(40,78,44,' + (0.5 - night * 0.25) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    var start = Math.floor((this.camX - w / 2) / 26) * 26;
    for (var wx = start; wx < this.camX + w / 2 + 26; wx += 26) {
      var sx = this.toScreen(wx);
      var lean = ((wx * 37) % 11) / 11 - 0.5;
      ctx.moveTo(sx, gy + 4);
      ctx.lineTo(sx + lean * 7, gy - 8 - ((wx * 17) % 7));
    }
    ctx.stroke();
  };

  /* ---------- objects ---------- */
  Renderer.prototype.drawObject = function (o) {
    var ctx = this.ctx, x = this.toScreen(o.x), gy = this.groundScreenY();
    if (x < -80 || x > this.vw + 80) return;
    var night = this.world.nightFactor(), dim = 1 - night * 0.45;
    ctx.save();

    switch (o.kind) {
      case 'bush': {
        var sway = Math.sin(this.world.time * 0.8 + o.phase) * 2;
        ctx.fillStyle = 'rgb(' + Math.round(52 * dim) + ',' + Math.round(94 * dim) + ',' + Math.round(56 * dim) + ')';
        ctx.beginPath();
        ctx.ellipse(x + sway, gy - 26, 40, 30, 0, 0, 6.2832); ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x - 20 + sway, gy - 14, 24, 20, 0, 0, 6.2832); ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 22 + sway, gy - 16, 22, 19, 0, 0, 6.2832); ctx.fill();
        for (var b = 0; b < o.berries; b++) {
          var bx = x + sway + Math.cos(b * 2.1 + o.phase) * 26;
          var by = gy - 26 + Math.sin(b * 2.7 + o.phase) * 16;
          ctx.fillStyle = 'rgb(' + Math.round(214 * dim) + ',' + Math.round(66 * dim) + ',' + Math.round(96 * dim) + ')';
          ctx.beginPath(); ctx.arc(bx, by, 5, 0, 6.2832); ctx.fill();
        }
        break;
      }
      case 'berry':
        ctx.fillStyle = 'rgb(' + Math.round(220 * dim) + ',' + Math.round(70 * dim) + ',' + Math.round(100 * dim) + ')';
        ctx.beginPath(); ctx.arc(x, gy - 6, 6, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(40,90,40,' + dim + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, gy - 11); ctx.lineTo(x + 3, gy - 16); ctx.stroke();
        break;
      case 'pool': {
        var pg = ctx.createLinearGradient(0, gy - 12, 0, gy + 16);
        pg.addColorStop(0, 'rgba(' + Math.round(120 * dim) + ',' + Math.round(196 * dim) + ',' + Math.round(232 * dim) + ',0.95)');
        pg.addColorStop(1, 'rgba(' + Math.round(46 * dim) + ',' + Math.round(110 * dim) + ',' + Math.round(160 * dim) + ',0.95)');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.ellipse(x, gy + 4, o.r, 15, 0, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.4;
        for (var i = 0; i < 3; i++) {
          var ry = gy + 1 + i * 4;
          var ph = Math.sin(this.world.time * 1.6 + i * 1.7 + o.phase) * 6;
          ctx.beginPath();
          ctx.ellipse(x + ph, ry, o.r * (0.62 - i * 0.16), 3.5 - i, 0, 0, 3.1416);
          ctx.stroke();
        }
        break;
      }
      case 'ball': {
        var roll = o.x * 0.06;
        ctx.save();
        ctx.translate(x, gy - 14); ctx.rotate(roll);
        ctx.fillStyle = 'rgb(' + Math.round(238 * dim) + ',' + Math.round(190 * dim) + ',' + Math.round(72 * dim) + ')';
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(180,90,40,' + dim + ')'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, 6.2832); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'weed':
        if (o.eaten) { ctx.restore(); return; }
        ctx.strokeStyle = 'rgb(' + Math.round(108 * dim) + ',' + Math.round(76 * dim) + ',' + Math.round(140 * dim) + ')';
        ctx.lineWidth = 3;
        for (var s = -1; s <= 1; s++) {
          ctx.beginPath();
          ctx.moveTo(x + s * 5, gy);
          ctx.quadraticCurveTo(x + s * 14, gy - 16, x + s * 7, gy - 30);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgb(' + Math.round(160 * dim) + ',' + Math.round(96 * dim) + ',' + Math.round(190 * dim) + ')';
        ctx.beginPath(); ctx.arc(x, gy - 32, 6, 0, 6.2832); ctx.fill();
        break;
      case 'herb':
        if (o.eaten) { ctx.restore(); return; }
        ctx.strokeStyle = 'rgb(' + Math.round(84 * dim) + ',' + Math.round(168 * dim) + ',' + Math.round(120 * dim) + ')';
        ctx.lineWidth = 2.4;
        for (var k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(x, gy);
          ctx.quadraticCurveTo(x + k * 12, gy - 14, x + k * 9, gy - 26);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * dim) + ')';
        ctx.beginPath(); ctx.arc(x, gy - 27, 4.5, 0, 6.2832); ctx.fill();
        break;
      case 'lamp': {
        var glow = ctx.createRadialGradient(x, gy - 60, 8, x, gy - 60, 130);
        glow.addColorStop(0, 'rgba(255,214,138,' + (0.5 + night * 0.35) + ')');
        glow.addColorStop(1, 'rgba(255,214,138,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 140, gy - 190, 280, 210);
        ctx.strokeStyle = '#6b5540'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - 52); ctx.stroke();
        ctx.fillStyle = '#ffd98a';
        ctx.beginPath(); ctx.arc(x, gy - 62, 15, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = '#8a6a48'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, gy - 62, 15, 0, 6.2832); ctx.stroke();
        break;
      }
      case 'nest':
        ctx.fillStyle = 'rgb(' + Math.round(146 * dim) + ',' + Math.round(112 * dim) + ',' + Math.round(66 * dim) + ')';
        ctx.beginPath(); ctx.ellipse(x, gy - 2, 42, 13, 0, Math.PI, 0, true); ctx.fill();
        ctx.strokeStyle = 'rgba(96,70,40,' + dim + ')'; ctx.lineWidth = 2;
        for (var t = -3; t <= 3; t++) {
          ctx.beginPath();
          ctx.moveTo(x + t * 11, gy - 1);
          ctx.lineTo(x + t * 13, gy - 12);
          ctx.stroke();
        }
        break;
      case 'egg': {
        var wob = Math.sin(this.world.time * 3 + o.phase) * (o.hatch < 12 ? 3 : 0.6);
        ctx.save();
        ctx.translate(x, gy - 12); ctx.rotate(wob * 0.05);
        ctx.fillStyle = 'rgb(' + Math.round(246 * dim) + ',' + Math.round(238 * dim) + ',' + Math.round(214 * dim) + ')';
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 15, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(190,170,140,' + dim + ')';
        for (var d = 0; d < 5; d++) {
          ctx.beginPath();
          ctx.arc(Math.cos(d * 2.4) * 6, Math.sin(d * 1.9) * 8, 1.8, 0, 6.2832);
          ctx.fill();
        }
        ctx.restore();
        break;
      }
    }
    ctx.restore();
  };

  /* ---------- creatures ---------- */
  function hsl(h, s, l, a) {
    return 'hsla(' + (((h % 360) + 360) % 360).toFixed(0) + ',' + (s * 100).toFixed(0) + '%,' +
      (l * 100).toFixed(0) + '%,' + (a == null ? 1 : a) + ')';
  }

  Renderer.prototype.drawCreature = function (c, selected) {
    var ctx = this.ctx, T = c.C.traits;
    var x = this.toScreen(c.x), gy = this.groundScreenY();
    if (x < -120 || x > this.vw + 120) return;
    var night = this.world.nightFactor(), dim = 1 - night * 0.35;

    var S = 26 * c.size;                       /* body radius unit */
    var walk = Math.abs(c.vx) > 4 ? Math.sin(c.bob * 2.2) : 0;
    var breathe = Math.sin(c.bob * 0.7) * 0.03;
    var lift = c.asleep ? 0 : Math.abs(walk) * 3;
    var bodyY = gy - S * (0.95 + breathe) * T.legLen - lift;
    var face = c.facing;

    if (!c.alive) { this.drawGhost(c, x, gy, S); return; }

    ctx.save();
    ctx.translate(x, 0);

    /* shadow */
    ctx.fillStyle = 'rgba(0,0,0,' + (0.22 * dim) + ')';
    ctx.beginPath();
    ctx.ellipse(0, gy + 2, S * 0.85, S * 0.2, 0, 0, 6.2832); ctx.fill();

    var hue = T.hue, hue2 = T.hue2, sat = T.sat, light = T.light * dim;
    /* illness and poor health drain the colour out of a sprig */
    var ill = CG.clamp01(c.soup.get('sickness') * 0.8 + (1 - c.health) * 0.6);
    sat = sat * (1 - ill * 0.65);
    light = light * (1 - ill * 0.18);

    /* legs */
    ctx.strokeStyle = hsl(hue, sat, light * 0.7);
    ctx.lineWidth = Math.max(2.5, S * 0.16);
    ctx.lineCap = 'round';
    for (var l = 0; l < 2; l++) {
      var ph = walk * (l === 0 ? 1 : -1);
      var lx = (l === 0 ? -1 : 1) * S * 0.35;
      ctx.beginPath();
      ctx.moveTo(lx, bodyY + S * 0.55);
      ctx.lineTo(lx + ph * S * 0.3, gy - 1);
      ctx.stroke();
    }

    /* tail */
    if (T.tailLen > 0.15) {
      ctx.strokeStyle = hsl(hue, sat, light * 0.85);
      ctx.lineWidth = Math.max(2, S * 0.13);
      ctx.beginPath();
      ctx.moveTo(-face * S * 0.6, bodyY + S * 0.1);
      ctx.quadraticCurveTo(
        -face * S * (0.6 + T.tailLen * 0.7), bodyY - S * 0.1 + Math.sin(c.bob * 1.6) * S * 0.2,
        -face * S * (0.5 + T.tailLen * 1.1), bodyY - S * (0.35 + T.tailLen * 0.3));
      ctx.stroke();
    }

    /* body */
    var bodyGrad = ctx.createLinearGradient(0, bodyY - S, 0, bodyY + S);
    bodyGrad.addColorStop(0, hsl(hue, sat, Math.min(0.92, light + 0.14)));
    bodyGrad.addColorStop(1, hsl(hue, sat, light * 0.78));
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, bodyY, S * 0.72 * T.bodySize, S * 0.66 * T.bodySize, 0, 0, 6.2832);
    ctx.fill();

    /* markings */
    var pat = Math.floor(T.pattern);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, bodyY, S * 0.72 * T.bodySize, S * 0.66 * T.bodySize, 0, 0, 6.2832);
    ctx.clip();
    ctx.fillStyle = hsl(hue2, sat * 0.9, light * 0.82, 0.75);
    if (pat === 1) {
      for (var sp = 0; sp < 5; sp++) {
        var a = sp * 1.9 + 0.4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * S * 0.4, bodyY + Math.sin(a) * S * 0.34, S * 0.15 * (0.6 + T.spots), 0, 6.2832);
        ctx.fill();
      }
    } else if (pat === 2) {
      for (var st = -2; st <= 2; st++) {
        ctx.fillRect(st * S * 0.28 - S * 0.06, bodyY - S, S * 0.12 * (0.5 + T.spots), S * 2);
      }
    } else if (pat === 3) {
      ctx.beginPath();
      ctx.ellipse(0, bodyY + S * 0.35, S * 0.6, S * 0.3, 0, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();

    /* head */
    var headY = bodyY - S * 0.6 * T.headSize;
    var headX = face * S * 0.22;
    var HS = S * 0.5 * T.headSize;
    ctx.fillStyle = hsl(hue, sat, Math.min(0.94, light + 0.08));
    ctx.beginPath();
    ctx.ellipse(headX, headY, HS, HS * 0.92, 0, 0, 6.2832);
    ctx.fill();

    /* ears */
    ctx.fillStyle = hsl(hue, sat * 0.95, light * 0.9);
    for (var e = 0; e < 2; e++) {
      var ex = headX + (e === 0 ? -1 : 1) * HS * 0.55;
      var droop = c.asleep ? 0.5 : (c.drives[CG.DRIVES.indexOf('fear')] > 0.4 ? 0.7 : 0);
      ctx.save();
      ctx.translate(ex, headY - HS * 0.55);
      ctx.rotate((e === 0 ? -0.35 : 0.35) + droop * (e === 0 ? -0.7 : 0.7) + Math.sin(c.bob) * 0.05);
      ctx.beginPath();
      ctx.ellipse(0, -HS * 0.5 * T.earLen, HS * 0.24, HS * 0.62 * T.earLen, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    /* snout */
    ctx.fillStyle = hsl(hue, sat * 0.8, Math.min(0.95, light + 0.16));
    ctx.beginPath();
    ctx.ellipse(headX + face * HS * 0.6 * T.snout, headY + HS * 0.28, HS * 0.34 * T.snout, HS * 0.26, 0, 0, 6.2832);
    ctx.fill();

    /* eyes - they follow whatever the sprig is attending to */
    var lookX = 0;
    if (c.focus) lookX = CG.clamp((c.focus.x - c.x) / 120, -1, 1);
    var ES = HS * 0.26 * T.eyeSize;
    for (var i2 = 0; i2 < 2; i2++) {
      var eox = headX + (i2 === 0 ? -0.34 : 0.34) * HS + face * HS * 0.16;
      var eoy = headY - HS * 0.1;
      if (c.asleep) {
        ctx.strokeStyle = 'rgba(30,30,40,0.8)';
        ctx.lineWidth = Math.max(1.5, ES * 0.4);
        ctx.beginPath();
        ctx.arc(eox, eoy, ES, 0.15, Math.PI - 0.15);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(eox, eoy, ES, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#1b2030';
        ctx.beginPath();
        ctx.arc(eox + lookX * ES * 0.42, eoy + ES * 0.1, ES * 0.52, 0, 6.2832);
        ctx.fill();
      }
    }

    /* mouth follows mood */
    var net = c.soup.get('endorphin') - c.soup.get('cortisol');
    ctx.strokeStyle = 'rgba(30,30,40,0.75)';
    ctx.lineWidth = Math.max(1.4, HS * 0.09);
    ctx.beginPath();
    var mx = headX + face * HS * 0.5 * T.snout, my = headY + HS * 0.45;
    if (c.asleep) { ctx.moveTo(mx - HS * 0.1, my); ctx.lineTo(mx + HS * 0.1, my); }
    else ctx.arc(mx, my - (net < -0.05 ? -HS * 0.3 : HS * 0.16), HS * 0.26,
      net < -0.05 ? Math.PI : 0.15, net < -0.05 ? 6.2832 : Math.PI - 0.15);
    ctx.stroke();

    /* pregnancy */
    if (c.gravid > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-face * S * 0.15, bodyY + S * 0.2, S * 0.3, S * 0.26, 0, 0, 6.2832);
      ctx.stroke();
    }

    if (selected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -this.world.time * 14;
      ctx.beginPath();
      ctx.ellipse(0, gy + 2, S * 0.95, S * 0.28, 0, 0, 6.2832);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    if (c.asleep) this.drawZzz(x + face * S * 0.6, bodyY - S * 1.2, c.bob);
    if (c.speech) this.drawSpeech(x, bodyY - S * 1.5, c.speech, c.speechT);
  };

  Renderer.prototype.drawGhost = function (c, x, gy, S) {
    var ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#dfe6ef';
    ctx.beginPath();
    ctx.ellipse(x, gy - S * 0.5, S * 0.6, S * 0.5, 0, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = '#2b3245';
    ctx.font = 'bold ' + Math.round(S * 0.4) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('x  x', x, gy - S * 0.45);
    ctx.restore();
  };

  Renderer.prototype.drawZzz = function (x, y, phase) {
    var ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '13px system-ui, sans-serif';
    for (var i = 0; i < 3; i++) {
      var t = (phase * 0.3 + i * 0.33) % 1;
      ctx.globalAlpha = 0.8 * (1 - t);
      ctx.fillText('z', x + t * 14, y - t * 26);
    }
    ctx.restore();
  };

  Renderer.prototype.drawSpeech = function (x, y, text, life) {
    var ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = CG.clamp01(life / 0.6);
    ctx.font = '600 13px system-ui, sans-serif';
    var w = ctx.measureText(text).width + 18;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    roundRect(ctx, x - w / 2, y - 26, w, 22, 11);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 1, y + 2); ctx.lineTo(x + 5, y - 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#20263a';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y - 10);
    ctx.restore();
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- transient feedback ---------- */
  var EVENT_GLYPH = { heart: '♥', note: '♪', spark: '✦', bolt: '!', call: '≈', drop: '·', crumb: '·', puff: '○' };
  var EVENT_COLOUR = { heart: '#ff7b9c', note: '#ffe28a', spark: '#fff2a8', bolt: '#ff9a6a', call: '#cfe6ff', drop: '#a9dcf5', crumb: '#f0c88a', puff: '#e8e8ee' };

  Renderer.prototype.drawEvents = function () {
    var ctx = this.ctx, gy = this.groundScreenY();
    for (var i = 0; i < this.world.events.length; i++) {
      var e = this.world.events[i];
      var t = e.t / e.life;
      var x = this.toScreen(e.x);
      if (x < -40 || x > this.vw + 40) continue;
      var y = (e.y != null ? gy - (this.world.groundY - e.y) : gy) - t * 34;
      ctx.save();
      ctx.globalAlpha = CG.clamp01(1 - t);
      ctx.fillStyle = EVENT_COLOUR[e.type] || '#fff';
      ctx.font = 'bold ' + (e.type === 'heart' ? 20 : 16) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(EVENT_GLYPH[e.type] || '*', x + Math.sin(t * 6) * 5, y);
      ctx.restore();
    }
  };

  Renderer.prototype.drawHand = function () {
    var h = this.world.hand, ctx = this.ctx;
    if (h.x == null || !h.active) return;
    var x = this.toScreen(h.x), gy = this.groundScreenY();
    var y = gy - (this.world.groundY - h.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,244,232,0.96)';
    ctx.strokeStyle = 'rgba(60,50,44,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 16, -0.2, 0, 6.2832);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-9, -10, 4.5, 8, -0.7, 0, 6.2832);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  Renderer.prototype.render = function (selected) {
    var w = this.world, i;
    this.drawSky();
    this.drawHills();
    this.drawGround();

    var objs = w.objects.slice().sort(function (a, b) { return a.r - b.r; });
    for (i = 0; i < objs.length; i++) this.drawObject(objs[i]);
    for (i = 0; i < w.creatures.length; i++) this.drawCreature(w.creatures[i], w.creatures[i] === selected);
    this.drawEvents();
    this.drawHand();
  };

  /* A face for the roster and the status card, drawn from the same genes. */
  function drawPortrait(ctx, c, w, h) {
    ctx.clearRect(0, 0, w, h);
    var T = c.C.traits, S = Math.min(w, h) * 0.46;
    var cx = w / 2, cy = h * 0.56;
    var ill = CG.clamp01(c.soup.get('sickness') * 0.8 + (1 - c.health) * 0.6);
    var sat = T.sat * (1 - ill * 0.65), light = T.light;

    var bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(255,255,255,0.06)');
    bg.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (!c.alive) ctx.globalAlpha = 0.4;

    /* ears */
    ctx.fillStyle = hsl(T.hue, sat, light * 0.9);
    for (var e = 0; e < 2; e++) {
      ctx.save();
      ctx.translate(cx + (e ? 1 : -1) * S * 0.55, cy - S * 0.55);
      ctx.rotate((e ? 0.35 : -0.35));
      ctx.beginPath();
      ctx.ellipse(0, -S * 0.5 * T.earLen, S * 0.24, S * 0.62 * T.earLen, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }
    /* head */
    ctx.fillStyle = hsl(T.hue, sat, Math.min(0.94, light + 0.08));
    ctx.beginPath(); ctx.ellipse(cx, cy, S, S * 0.92, 0, 0, 6.2832); ctx.fill();
    /* markings */
    if (Math.floor(T.pattern) === 1) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(cx, cy, S, S * 0.92, 0, 0, 6.2832); ctx.clip();
      ctx.fillStyle = hsl(T.hue2, sat * 0.9, light * 0.8, 0.7);
      for (var d = 0; d < 3; d++) {
        ctx.beginPath();
        ctx.arc(cx + Math.cos(d * 2.2) * S * 0.45, cy + Math.sin(d * 2.2) * S * 0.4, S * 0.2, 0, 6.2832);
        ctx.fill();
      }
      ctx.restore();
    }
    /* snout */
    ctx.fillStyle = hsl(T.hue, sat * 0.8, Math.min(0.95, light + 0.16));
    ctx.beginPath();
    ctx.ellipse(cx, cy + S * 0.34, S * 0.36 * T.snout, S * 0.26, 0, 0, 6.2832);
    ctx.fill();
    /* eyes */
    var ES = S * 0.24 * T.eyeSize;
    for (var i = 0; i < 2; i++) {
      var ex = cx + (i ? 0.35 : -0.35) * S;
      if (c.asleep || !c.alive) {
        ctx.strokeStyle = 'rgba(20,22,32,.85)'; ctx.lineWidth = Math.max(1.5, ES * 0.4);
        ctx.beginPath(); ctx.arc(ex, cy - S * 0.1, ES, 0.15, Math.PI - 0.15); ctx.stroke();
      } else {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex, cy - S * 0.1, ES, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#1b2030';
        ctx.beginPath(); ctx.arc(ex, cy - S * 0.06, ES * 0.55, 0, 6.2832); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  CG.drawPortrait = drawPortrait;
  CG.Renderer = Renderer;
})(typeof window !== 'undefined' ? (window.CG = window.CG || {}) : (globalThis.CG = globalThis.CG || {}));
