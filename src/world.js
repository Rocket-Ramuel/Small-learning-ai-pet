/* Sprigs - the world.
 *
 * One long side-on valley with a cold grotto at the west end and a warm lamp at
 * the east, so temperature is a place you can walk to rather than a number.
 * Everything a creature can perceive is an object with a category, which is the
 * only vocabulary the brain has for the outside. */
(function (CG) {
  'use strict';

  var WORLD_W = 1600;
  var GROUND_Y = 430;
  var DAY_LENGTH = 420;    /* seconds for a full day/night cycle */

  var KINDS = {
    bush:   { cat: 'plant',    r: 46, solid: false, label: 'bush', edible: true },
    berry:  { cat: 'food',     r: 11, solid: false, label: 'berry', edible: true },
    pool:   { cat: 'drink',    r: 90, solid: false, label: 'pool' },
    ball:   { cat: 'toy',      r: 16, solid: false, label: 'ball', movable: true },
    weed:   { cat: 'weed',     r: 18, solid: false, label: 'weed', edible: true },
    herb:   { cat: 'medicine', r: 15, solid: false, label: 'herb', edible: true },
    lamp:   { cat: 'warmth',   r: 55, solid: false, label: 'lamp' },
    nest:   { cat: 'nest',     r: 40, solid: false, label: 'nest' },
    egg:    { cat: 'egg',      r: 14, solid: false, label: 'egg' }
  };

  function Obj(kind, x, extra) {
    this.id = CG.uid('o');
    this.kind = kind;
    this.cat = KINDS[kind].cat;
    this.x = x;
    this.y = GROUND_Y;
    this.r = KINDS[kind].r;
    this.vx = 0;
    this.held = false;
    this.age = 0;
    this.phase = Math.random() * Math.PI * 2;
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) this[k] = extra[k];
  }

  function World(seed) {
    this.rng = new CG.RNG(seed || 12345);
    this.seed = seed || 12345;
    this.w = WORLD_W;
    this.groundY = GROUND_Y;
    this.time = 60;            /* start mid-morning */
    this.objects = [];
    this.creatures = [];
    this.eggs = [];
    this.events = [];          /* transient things to draw: sounds, hearts, puffs */
    this.hand = { x: 900, y: 260, down: false, holding: null };
    this.stats = { born: 0, died: 0, generations: 1 };
    this.build();
  }

  World.prototype.build = function () {
    var r = this.rng, i;
    /* A valley small enough to cross. Sprigs that live at opposite ends of a
     * huge map never meet, never breed and are lonely their whole lives, so
     * everything here is within a couple of minutes' walk. Cold grotto in the
     * west, warm lamp in the east, food and water through the middle, and the
     * weeds out past the lamp where you have to go looking for them. */
    this.add(new Obj('pool', 640));
    this.add(new Obj('pool', 1240));
    this.add(new Obj('lamp', 1480));
    this.add(new Obj('nest', 860));
    var bushX = [200, 420, 560, 700, 900, 1100, 1320];
    for (i = 0; i < bushX.length; i++) {
      this.add(new Obj('bush', bushX[i] + r.range(-18, 18), { berries: 3, regrow: 0 }));
    }
    for (i = 0; i < 3; i++) this.add(new Obj('herb', 1360 + i * 55 + r.range(-10, 10), { regrow: 0 }));
    for (i = 0; i < 3; i++) this.add(new Obj('weed', 1520 + i * 28 + r.range(-8, 8), { regrow: 0 }));
    this.add(new Obj('ball', 520));
    this.add(new Obj('ball', 980));
  };

  World.prototype.add = function (o) { this.objects.push(o); return o; };
  World.prototype.remove = function (o) {
    var i = this.objects.indexOf(o);
    if (i >= 0) this.objects.splice(i, 1);
    if (this.hand.holding === o) this.hand.holding = null;
  };

  /* Ambient warmth at a point, 0 (freezing) .. 1 (hot). */
  World.prototype.temperature = function (x) {
    var t = 0.5;
    /* the grotto in the west stays cold */
    t -= CG.clamp01((240 - x) / 240) * 0.38;
    /* lamps radiate */
    for (var i = 0; i < this.objects.length; i++) {
      var o = this.objects[i];
      if (o.kind !== 'lamp') continue;
      var d = Math.abs(o.x - x);
      if (d < 330) t += (1 - d / 330) * 0.45;
    }
    /* nights are cool */
    t -= this.nightFactor() * 0.08;
    return CG.clamp01(t);
  };

  World.prototype.nightFactor = function () {
    var p = (this.time % DAY_LENGTH) / DAY_LENGTH;   /* 0 = dawn */
    /* daylight from 0.05 to 0.62, smooth dusk and dawn */
    var light = CG.clamp01(Math.sin(Math.PI * CG.clamp01((p - 0.02) / 0.66)) * 1.6);
    if (p > 0.7 || p < 0.02) light = 0;
    return 1 - CG.clamp01(light);
  };

  World.prototype.dayCount = function () { return Math.floor(this.time / DAY_LENGTH) + 1; };

  /* Everything perceivable near x, cheapest possible: the world is small. */
  World.prototype.near = function (x, radius, out) {
    out = out || [];
    out.length = 0;
    var i, o;
    for (i = 0; i < this.objects.length; i++) {
      o = this.objects[i];
      if (Math.abs(o.x - x) <= radius) out.push(o);
    }
    for (i = 0; i < this.creatures.length; i++) {
      o = this.creatures[i];
      if (o.alive && Math.abs(o.x - x) <= radius) out.push(o);
    }
    if (Math.abs(this.hand.x - x) <= radius && this.hand.y > 120) out.push(this.handObj());
    return out;
  };

  World.prototype.handObj = function () {
    if (!this._handObj) this._handObj = { id: 'hand', kind: 'hand', cat: 'hand', r: 20, isHand: true };
    this._handObj.x = this.hand.x;
    this._handObj.y = this.hand.y;
    return this._handObj;
  };

  World.prototype.spawnEvent = function (type, x, y, extra) {
    var e = { type: type, x: x, y: y, t: 0, life: 1.2 };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) e[k] = extra[k];
    this.events.push(e);
    if (this.events.length > 80) this.events.shift();
    return e;
  };

  World.prototype.layEgg = function (genome, x) {
    var nest = null, i;
    for (i = 0; i < this.objects.length; i++) if (this.objects[i].kind === 'nest') nest = this.objects[i];
    var ex = nest ? nest.x + this.rng.range(-30, 30) : x;
    var egg = new Obj('egg', ex, { genome: genome, hatch: 55 + this.rng.range(0, 25) });
    this.add(egg);
    this.spawnEvent('spark', ex, GROUND_Y - 20);
    return egg;
  };

  World.prototype.update = function (dt) {
    this.time += dt;
    var i, o;

    for (i = this.objects.length - 1; i >= 0; i--) {
      o = this.objects[i];
      o.age += dt;

      if (o.kind === 'bush') {
        o.regrow -= dt;
        if (o.regrow <= 0 && o.berries < 4) {
          o.berries++;
          o.regrow = 22 + this.rng.range(0, 14);
        }
        /* A bush in fruit reads as food; a stripped one is just scenery. This is
         * the world telling the creature what it is looking at. */
        o.cat = o.berries > 0 ? 'food' : 'plant';
      } else if (o.kind === 'ball') {
        if (!o.held) {
          o.x += o.vx * dt;
          o.vx *= Math.pow(0.14, dt);
          if (Math.abs(o.vx) < 2) o.vx = 0;
          o.x = CG.clamp(o.x, 20, this.w - 20);
        }
      } else if (o.kind === 'berry' && !o.held) {
        o.life = (o.life == null ? 90 : o.life) - dt;
        if (o.life <= 0) this.remove(o);
      } else if (o.kind === 'egg') {
        o.hatch -= dt;
        if (o.hatch <= 0) {
          this.hatch(o);
        }
      } else if ((o.kind === 'herb' || o.kind === 'weed') && o.eaten) {
        o.regrow -= dt;
        if (o.regrow <= 0) o.eaten = false;
      }
    }

    for (i = this.events.length - 1; i >= 0; i--) {
      this.events[i].t += dt;
      if (this.events[i].t > this.events[i].life) this.events.splice(i, 1);
    }

    /* Bushes drop a berry within reach when one is ripe and none is on the ground. */
    for (i = 0; i < this.objects.length; i++) {
      o = this.objects[i];
      if (o.kind !== 'bush' || o.berries <= 0) continue;
      if (!this.anyNear('berry', o.x, 70)) {
        o.berries--;
        this.add(new Obj('berry', o.x + this.rng.range(-50, 50), { life: 120 }));
      }
    }
  };

  World.prototype.anyNear = function (kind, x, r) {
    for (var i = 0; i < this.objects.length; i++) {
      var o = this.objects[i];
      if (o.kind === kind && Math.abs(o.x - x) < r) return true;
    }
    return false;
  };

  World.prototype.hatch = function (egg) {
    this.remove(egg);
    var c = new CG.Creature(egg.genome, this.rng.fork(), egg.x, this);
    this.creatures.push(c);
    this.stats.born++;
    this.stats.generations = Math.max(this.stats.generations, egg.genome.gen || 1);
    this.spawnEvent('spark', egg.x, GROUND_Y - 30);
    this.log(c.name + ' hatched!');
    return c;
  };

  World.prototype.log = function (msg) {
    if (!this.journal) this.journal = [];
    this.journal.push({ t: this.time, msg: msg });
    if (this.journal.length > 200) this.journal.shift();
    if (this.onLog) this.onLog(msg);
  };

  World.prototype.living = function () {
    return this.creatures.filter(function (c) { return c.alive; });
  };

  CG.World = World;
  CG.WorldObj = Obj;
  CG.KINDS = KINDS;
  CG.DAY_LENGTH = DAY_LENGTH;
})(typeof window !== 'undefined' ? (window.CG = window.CG || {}) : (globalThis.CG = globalThis.CG || {}));
