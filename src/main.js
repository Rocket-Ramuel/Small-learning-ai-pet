/* Sprigs - boot and the main loop. */
(function (CG) {
  'use strict';

  var STEP = 1 / 30;          /* fixed simulation step, in simulated seconds */
  var MAX_STEPS = 12;         /* never let a slow frame spiral */

  function Game() {
    this.speed = 1;
    this.followSelected = true;
    this.acc = 0;
    this.lastT = 0;
    this.saveT = 0;

    var saved = CG.UI.loadSaved();
    if (saved && saved.creatures && saved.creatures.length) {
      try { this.world = CG.World.load(saved); }
      catch (e) { this.world = this.freshWorld(); }
    } else {
      this.world = this.freshWorld();
    }

    this.renderer = new CG.Renderer(document.getElementById('view'), this.world);
    this.ui = new CG.UI(this);

    var self = this;
    this.world.onLog = function (msg) { self.ui.logLine(msg); };

    var first = this.world.living()[0] || this.world.creatures[0];
    if (first) this.ui.select(first);
    this.renderer.follow(first || { x: 700 }, 0, true);

    window.addEventListener('resize', function () { self.renderer.resize(); });
    /* The layout never scrolls; if some stray focus or scroll call shifts it,
     * snap it back rather than leaving the chrome clipped off screen. */
    window.addEventListener('scroll', function () {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) self.ui.save();
      self.lastT = 0;   /* do not fast forward through the time we were away */
    });

    try {
      if (!localStorage.getItem('sprigs.seenHelp')) document.getElementById('help').hidden = false;
    } catch (e) { document.getElementById('help').hidden = false; }

    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  Game.prototype.freshWorld = function () {
    var w = new CG.World((Math.random() * 1e9) | 0);
    var rng = new CG.RNG((Math.random() * 1e9) | 0);
    /* Two eggs, one of each sex, so the valley has a chance of a second
     * generation without the player having to arrange anything. */
    var a = w.layEgg(CG.genome.wildType(rng), 820);
    var b = w.layEgg(CG.genome.wildType(rng), 900);
    a.hatch = 6; a.sex = 'f';
    b.hatch = 11; b.sex = 'm';
    return w;
  };

  Game.prototype.addEgg = function () {
    var rng = new CG.RNG((Math.random() * 1e9) | 0);
    var egg = this.world.layEgg(CG.genome.wildType(rng), 860);
    egg.hatch = 20;
    this.world.log('A new egg appeared in the nest.');
  };

  Game.prototype.frame = function (now) {
    requestAnimationFrame(this.frame);
    var real = this.lastT ? Math.min((now - this.lastT) / 1000, 0.25) : 0;
    this.lastT = now;

    var simTime = real * this.speed;
    this.acc += simTime;
    var steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;

    var sel = this.ui.selected;
    if (this.followSelected && sel && sel.alive) this.renderer.follow(sel, real);
    this.renderer.render(sel);
    this.ui.tick(real || 0.016);

    this.saveT += real;
    if (this.saveT > 20) { this.saveT = 0; this.ui.save(); }
  };

  Game.prototype.step = function (dt) {
    var w = this.world, i;
    w.update(dt);
    for (i = 0; i < w.creatures.length; i++) w.creatures[i].update(dt);

    /* Forget the long dead so a hundred-generation valley stays quick. */
    if (w.creatures.length > 26) {
      for (i = 0; i < w.creatures.length; i++) {
        if (!w.creatures[i].alive && w.creatures[i] !== this.ui.selected) {
          w.creatures.splice(i, 1);
          break;
        }
      }
    }
    /* If everyone has died, keep the world alive rather than stranding the
     * player in an empty valley with no way back. */
    if (!w.living().length) {
      this.emptyFor = (this.emptyFor || 0) + dt;
      if (this.emptyFor > 12) {
        this.emptyFor = 0;
        this.addEgg();
        w.log('The valley was empty, so a new egg was left in the nest.');
      }
    } else this.emptyFor = 0;

    /* Selection should never be left pointing at nothing. */
    var sel = this.ui.selected;
    if ((!sel || (!sel.alive && w.living().length)) && w.living().length) {
      var next = w.living()[0];
      if (!sel || !sel.alive) this.ui.select(next);
    }
  };

  window.addEventListener('DOMContentLoaded', function () {
    window.game = new Game();
  });
})(typeof window !== 'undefined' ? (window.CG = window.CG || {}) : (globalThis.CG = globalThis.CG || {}));
