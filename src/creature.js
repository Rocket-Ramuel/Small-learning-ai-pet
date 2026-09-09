/* Sprigs - the creature.
 *
 * Order of business each tick:
 *   look -> body conditions -> emitters -> chemistry -> receptors -> drives
 *   -> how much better or worse life just got -> learn -> choose -> act
 *
 * Nothing here reaches around the biochemistry. If you want a sprig to feel
 * hungry you have to raise a chemical, and if you want it to act on hunger a
 * receptor has to read that chemical back out. */
(function (CG) {
  'use strict';

  var CI = CG.CI, nD = CG.DRIVES.length, nC = CG.CATS.length;
  var A = {};
  for (var ai = 0; ai < CG.ACTIONS.length; ai++) A[CG.ACTIONS[ai]] = ai;

  var STAGES = [
    { name: 'baby',       until: 0.06, size: 0.45, tempCurve: 1.4, learn: 1.5 },
    { name: 'child',      until: 0.17, size: 0.62, tempCurve: 1.2, learn: 1.35 },
    { name: 'adolescent', until: 0.29, size: 0.82, tempCurve: 1.2, learn: 1.1 },
    { name: 'adult',      until: 0.72, size: 1.00, tempCurve: 1.0, learn: 1.0 },
    { name: 'elder',      until: 1.10, size: 0.96, tempCurve: 0.9, learn: 0.7 }
  ];

  /* How badly each drive hurts, used to turn drive changes into feelings. */
  var DRIVE_WEIGHT = { hunger: 1.0, thirst: 1.0, fatigue: 0.8, lonely: 0.7, bored: 0.6,
    cold: 0.8, hot: 0.8, pain: 1.2, fear: 1.0, sexdrive: 0.5, sick: 1.0 };
  var DW = CG.DRIVES.map(function (d) { return DRIVE_WEIGHT[d] || 1; });

  /* Which category tends to answer which need. A newborn's attention is drawn
   * this way; what it then *does* about it is entirely learned. */
  var RELEVANCE = {
    hunger: 'food', thirst: 'drink', bored: 'toy', sick: 'medicine',
    lonely: 'creature', cold: 'warmth', sexdrive: 'creature', fatigue: 'nest'
  };

  function Creature(genome, rng, x, world) {
    this.id = CG.uid('c');
    this.genome = genome;
    this.C = CG.genome.compile(genome);
    this.rng = rng;
    this.world = world;
    this.name = CG.makeName(rng);
    this.sex = rng.chance(0.5) ? 'f' : 'm';
    this.cat = 'creature';   /* how everyone else perceives this thing */
    this.kind = 'creature';

    this.soup = new CG.Soup();
    /* Hatchlings carry a yolk: enough of everything to be clumsy for a while. */
    this.soup.set('glucose', 0.85); this.soup.set('water', 0.85);
    this.soup.set('starch', 0.5); this.soup.set('protein', 0.5);
    this.soup.set('fat', 0.4);
    this.soup.set('growth', 0.4);

    this.brain = new CG.Brain(this.C, rng.fork());

    this.x = x; this.y = world.groundY; this.vx = 0; this.facing = 1;
    this.age = 0; this.alive = true; this.cause = null;
    this.health = 1; this.stageIdx = 0; this.stage = STAGES[0].name;
    this.size = STAGES[0].size;

    this.drives = new Float32Array(nD);
    this.prevDrives = new Float32Array(nD);
    this.cats = new Float32Array(nC);
    this.params = { speed: 1, learnRate: 1, metabolism: 1, boldness: 1, growth: 1, focus: 1 };

    this.focus = null; this.focusDist = 999;
    this.action = A.rest; this.actionTime = 0; this.actionDur = 1;
    this.actionOk = true;
    this.asleep = false; this.awakeTime = 0;
    this.stimulation = 0.6; this.social = 0.5;
    this.scolded = 0; this.tickled = 0;
    this.gravid = 0; this.pendingGenome = null; this.mateCooldown = 20;
    this.rewardBase = 0; this.lastReward = 0;
    this.speech = null; this.speechT = 0;
    this.pointedAt = null;
    this.bob = rng.range(0, 6.28);
    this.held = false;
    this.nearby = [];
    this.lifespan = this.C.traits.lifespan;
    this.eyeTarget = 0;
    this.driveMean = new Float32Array(nD);
    this.driveNews = new Float32Array(nD);
    this.stats = { eaten: 0, drunk: 0, played: 0, slept: 0, words: 0, children: 0, scolds: 0, tickles: 0 };
    this.lastActionName = 'rest';
    this.actionCount = new Float32Array(CG.ACTIONS.length);
    if (this.C.lethal) { this.health = 0.25; this.frail = this.C.lethal; }
  }

  /* ---------- perception ---------- */
  /* Salience is refreshed every tick, but the thing being *attended to* is
   * sticky. Without that a sprig re-picks a target sixty times a second and
   * spends its life vibrating between two berries. Attention shifts when the
   * current target is gone, when a decision is due, or when something much more
   * interesting turns up. */
  Creature.prototype.look = function (allowShift) {
    var range = 430 + 150 * (this.C.traits.curiosity - 1);
    var list = this.world.near(this.x, range * 1.7, this.nearby);
    var i, o, d, prox, ci, best = null, bestScore = 0, focusValid = false;
    for (i = 0; i < nC; i++) this.cats[i] = 0;

    for (i = 0; i < list.length; i++) {
      o = list[i];
      if (o === this) continue;
      if (o.eaten || (o.alive === false)) continue;
      d = Math.abs(o.x - this.x);
      /* A moving animal catches the eye from much further off than a bush. */
      var reach = (o.cat === 'creature' || o.cat === 'hand') ? range * 1.7 : range;
      if (d > reach) continue;
      prox = CG.clamp01(1 - d / reach);
      ci = CG.CATS.indexOf(o.cat);
      if (ci < 0) continue;
      if (prox > this.cats[ci]) this.cats[ci] = prox;
      if (o === this.focus) focusValid = true;

      /* Near things win; things that answer a loud need win more; and a word
       * just spoken by the player tilts the whole competition. */
      var rel = 0;
      for (var k = 0; k < nD; k++) {
        if (RELEVANCE[CG.DRIVES[k]] === o.cat) rel = Math.max(rel, this.drives[k]);
      }
      var score = prox * (0.5 + rel * 1.1) * (0.85 + 0.3 * this.rng.next() * this.C.traits.curiosity);
      if (this.brain.heard && this.brain.heardAge < 3) {
        var wm = this.brain.words[this.brain.heard];
        if (wm) score *= 1 + wm.w[ci] * 1.8;
      }
      if (o === this.focus) score *= 1.9;    /* stickiness */
      if (score > bestScore) { bestScore = score; best = o; }
    }

    if (!focusValid) this.focus = null;
    if (allowShift || !this.focus) this.focus = best;
    this.focusDist = this.focus ? Math.abs(this.focus.x - this.x) : 999;
    return list;
  };

  /* ---------- body ---------- */
  Creature.prototype.bodyConditions = function (dt) {
    var s = this.soup, w = this.world;
    var temp = w.temperature(this.x);
    var pref = this.C.traits.tempPref;
    var crowd = 0;
    for (var i = 0; i < this.nearby.length; i++) {
      var o = this.nearby[i];
      if (o !== this && o.alive && Math.abs(o.x - this.x) < 90) crowd++;
    }
    this.crowd = crowd;
    if (crowd > 0) this.social = CG.clamp01(this.social + dt * 0.16 * this.C.traits.sociability);
    else this.social = CG.clamp01(this.social - dt * 0.006);

    /* Going somewhere is mildly interesting in itself, which keeps a healthy
     * sprig off the floor of boredom without anything having to happen. */
    this.stimulation = CG.clamp01(this.stimulation - dt * 0.008 + Math.abs(this.vx) * dt * 0.00035);
    this.awakeTime += this.asleep ? -dt * 3 : dt;
    if (this.awakeTime < 0) this.awakeTime = 0;
    this.scolded = Math.max(0, this.scolded - dt * 0.5);
    this.tickled = Math.max(0, this.tickled - dt * 0.5);

    var stageC = STAGES[this.stageIdx];
    return {
      lowGlucose: 1 - s.get('glucose'),
      lowWater: 1 - s.get('water'),
      awake: CG.clamp01(this.awakeTime / 260),
      alone: 1 - this.social,
      unstimulated: 1 - this.stimulation,
      threat: CG.clamp01(this.scolded * 0.8 + (w.nightFactor() > 0.6 && crowd === 0 ? 0.18 : 0)),
      injury: 1 - this.health,
      chilly: CG.clamp01((pref - temp) * 1.6 * stageC.tempCurve),
      sweaty: CG.clamp01((temp - pref) * 1.6 * stageC.tempCurve),
      mature: CG.clamp01(this.age / (this.lifespan * 0.3)),
      exertion: CG.clamp01(Math.abs(this.vx) / 60),
      night: w.nightFactor(),
      sickLoad: s.get('sickness'),
      toxLoad: s.get('toxin'),
      crowded: CG.clamp01(crowd / 3)
    };
  };

  Creature.prototype.metabolise = function (dt) {
    var s = this.soup, C = this.C;
    var rate = C.traits.metabolism * this.params.metabolism * (0.55 + 0.9 * CG.clamp01(Math.abs(this.vx) / 60));
    if (this.asleep) rate *= 0.45;
    /* Small bodies burn faster per unit of body, as small bodies do. */
    rate *= (1.25 - 0.35 * this.size);
    s.add('glucose', -0.0026 * rate * dt);
    s.add('water', -0.0013 * rate * dt);
    if (this.stageIdx < 3) s.add('protein', -0.0008 * dt);

    /* Emitters, chemistry, then read the soup back out as drives. */
    var cond = this.bodyConditions(dt);
    var em = C.emitters, i, g, v;
    for (i = 0; i < em.length; i++) {
      g = em[i];
      v = cond[g.src];
      if (v == null) continue;
      if (g.invert) v = 1 - v;
      if (v > g.thresh) s.addIdx(g.chem, (v - g.thresh) * g.gain * dt);
    }

    s.step(dt, C.reactions, C.halfLife);

    var acc = this._acc || (this._acc = {});
    var k;
    for (k in this.params) if (Object.prototype.hasOwnProperty.call(this.params, k)) acc[k] = 0;
    for (i = 0; i < nD; i++) { this.prevDrives[i] = this.drives[i]; this.drives[i] = 0; }

    var rc = C.receptors;
    for (i = 0; i < rc.length; i++) {
      g = rc[i];
      v = s.c[g.chem];
      if (g.invert) v = 1 - v;
      if (v <= g.thresh) continue;
      var contrib = (v - g.thresh) * g.gain;
      if (g.tgt.charCodeAt(0) === 100) {           /* 'drive:' */
        var di = CG.DRIVES.indexOf(g.tgt.slice(6));
        if (di >= 0) this.drives[di] += contrib;
      } else {
        var pk = g.tgt.slice(6);
        if (acc[pk] != null) acc[pk] += contrib;
      }
    }
    for (i = 0; i < nD; i++) this.drives[i] = CG.clamp01(this.drives[i]);
    for (k in acc) if (Object.prototype.hasOwnProperty.call(acc, k)) this.params[k] = CG.clamp(1 + acc[k], 0.15, 3);

    this.temp = cond.chilly > cond.sweaty ? -cond.chilly : cond.sweaty;
  };

  Creature.prototype.healthTick = function (dt) {
    var s = this.soup, dmg = 0;
    if (s.get('glucose') < 0.05) dmg += 0.009 * (0.05 - s.get('glucose')) / 0.05;
    if (s.get('water') < 0.05) dmg += 0.011 * (0.05 - s.get('water')) / 0.05;
    if (s.get('sickness') > 0.5) dmg += (s.get('sickness') - 0.5) * 0.011 / Math.max(0.3, this.C.traits.immunity);
    var over = this.age - this.lifespan;
    if (over > 0) dmg += 0.004 + over / this.lifespan * 0.03;
    dmg += Math.max(0, Math.abs(this.temp || 0) - 0.75) * 0.02;

    if (dmg > 0) this.health -= dmg * dt;
    else if (this.drives[0] < 0.3 && this.drives[1] < 0.3 && s.get('sickness') < 0.15) {
      this.health = Math.min(1, this.health + 0.008 * dt);
    }

    if (this.health <= 0 && this.alive) this.die(this.deathCause());
  };

  Creature.prototype.deathCause = function () {
    var s = this.soup;
    if (this.age > this.lifespan) return 'old age';
    if (s.get('water') < 0.05) return 'thirst';
    if (s.get('glucose') < 0.05) return 'hunger';
    if (s.get('sickness') > 0.4) return 'illness';
    if (this.frail) return 'a fault in its genes';
    return 'poor health';
  };

  Creature.prototype.die = function (cause) {
    this.alive = false;
    this.cause = cause;
    this.health = 0;
    this.world.stats.died++;
    this.world.spawnEvent('puff', this.x, this.y - 20);
    this.world.log(this.name + ' died of ' + cause + ', aged ' + CG.fmtAge(this.age) + '.');
  };

  /* ---------- feelings ---------- */
  /* Life getting better is the reward. Everything else - praise, a full belly,
   * a friend arriving - reaches the brain through this one number. */
  Creature.prototype.feel = function (dt) {
    var better = 0, worse = 0, i, d;
    for (i = 0; i < nD; i++) {
      d = this.prevDrives[i] - this.drives[i];
      if (d > 0) better += d * DW[i]; else worse += -d * DW[i];
    }
    var s = this.soup;
    s.add('reward', better * 2.2);
    s.add('punish', worse * 0.85);

    /* Change alone is not enough to live by. A sprig whose hunger has been
     * pinned at maximum for a minute gets no signal from change - it has
     * nowhere left to rise - and would happily sit still and starve.
     *
     * The fix is not to punish it harder; that would punish eating just as
     * much as resting, since both happen while starving. What being in a bad
     * way actually does is make a creature restless: the worse things are, the
     * more willing it is to abandon whatever it is doing and try something
     * else. So misery is fed to exploration, not to the reward. */
    var worst = 0, mean = 0, totw = 0;
    for (i = 0; i < nD; i++) {
      var lvl = this.drives[i] * this.drives[i] * DW[i];
      if (lvl > worst) worst = lvl;
      mean += lvl; totw += DW[i];
    }
    this.misery = CG.clamp01(worst * 0.7 + (mean / totw) * 0.3);

    var net = s.get('endorphin') - s.get('cortisol');
    /* Compare against a slow baseline so a permanently happy sprig still has
     * something left to learn from. */
    this.rewardBase += (net - this.rewardBase) * (1 - Math.exp(-dt / 90));
    var signal = net - this.rewardBase * 0.6;
    this.lastReward = signal;

    /* What a word refers to should be whatever stands out right now. A sprig
     * that has been lonely for an hour is not talking about loneliness, so
     * drives are reported to the language lobe as departures from their own
     * long run average rather than as raw levels. */
    var relax = 1 - Math.exp(-dt / 120);
    for (i = 0; i < nD; i++) {
      this.driveMean[i] += (this.drives[i] - this.driveMean[i]) * relax;
      this.driveNews[i] = CG.clamp01((this.drives[i] - this.driveMean[i]) * 1.6);
    }

    this.brain.learnRate = STAGES[this.stageIdx].learn * this.params.learnRate;
    this.brain.explore = CG.clamp(
      (0.13 * this.C.traits.curiosity) / (1 + this.stageIdx * 0.55) + this.misery * 0.42,
      0.05, 0.5);
    this.brain.reinforce(signal, dt);
  };

  /* ---------- acting ---------- */
  Creature.prototype.reach = function () { return 30 + 26 * this.size; };

  Creature.prototype.chooseAction = function () {
    var b = this.brain;
    /* A fresh decision gets a fresh look at the world. */
    this.look(true);
    var prox = this.focus ? CG.clamp01(1 - this.focusDist / 430) : 0;
    b.sense(this.drives, this.cats, prox, this.held ? 1 : 0, this.world.nightFactor());
    /* Young and bored sprigs try random things; focused adults commit. */
    var t = 0.32 * this.C.traits.curiosity * this.params.focus
      * (this.stageIdx === 0 ? 1.25 : this.stageIdx === 1 ? 1.12 : 1)
      * (1 + this.drives[CG.DRIVES.indexOf('bored')] * 0.5)
      * (1 + (this.misery || 0) * 0.8);
    var a = b.decide(t);
    b.commit(a);
    this.retarget(a);
    this.action = a;
    this.lastActionName = CG.ACTIONS[a];
    this.actionCount[a]++;
    this.actionTime = 0;
    this.actionDur = this.durationFor(a);
    this.actionOk = true;
    this.startAction(a);
  };

  /* Having decided to eat, look for something edible. Attention picks what is
   * interesting; intention then picks what is useful. Without this a sprig
   * spends its life trying to eat a ball it happens to be looking at.
   * It still has to learn *when* to eat - only the aiming is innate. */
  var WANTS = {};
  WANTS[A.eat] = ['food', 'medicine', 'weed'];
  WANTS[A.drink] = ['drink'];
  WANTS[A.play] = ['toy', 'creature'];
  WANTS[A.push] = ['toy'];
  WANTS[A.mate] = ['creature'];

  Creature.prototype.retarget = function (a) {
    var want = WANTS[a];
    if (!want) return;
    if (this.focus && want.indexOf(this.focus.cat) >= 0) return;
    var best = null, bestD = Infinity;
    for (var i = 0; i < this.nearby.length; i++) {
      var o = this.nearby[i];
      if (o === this || o.eaten || o.alive === false) continue;
      if (want.indexOf(o.cat) < 0) continue;
      var d = Math.abs(o.x - this.x);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (best) { this.focus = best; this.focusDist = bestD; }
  };

  Creature.prototype.durationFor = function (a) {
    switch (a) {
      case A.sleep: return 24;
      case A.rest: return 2.2;
      case A.eat: case A.drink: return 2.4;
      case A.play: return 3.2;
      case A.approach: case A.retreat: return 2.6;
      case A.wander: return 2.6 * this.C.traits.patience;
      case A.call: return 1.4;
      case A.mate: return 2.6;
      default: return 1.6;
    }
  };

  Creature.prototype.startAction = function (a) {
    if (a === A.wander) this.wanderDir = this.rng.chance(0.5) ? -1 : 1;
    if (a === A.sleep) {
      /* Lying down wide awake achieves nothing and the body says so. */
      if (this.soup.get('sleepiness') < 0.12) { this.frustrate(0.02); this.asleep = false; }
      else { this.asleep = true; this.stats.slept++; }
    } else this.asleep = false;
    if (a === A.call) this.callOut();
  };

  /* End the current action early - but never sooner than MIN_ACT, or a sprig
   * whose action fails on contact will re-decide every single tick and hammer
   * its own weights flat. */
  var MIN_ACT = 0.5;
  Creature.prototype.endAction = function () {
    this.actionDur = Math.max(this.actionTime, MIN_ACT);
  };
  Creature.prototype.frustrate = function (amount) {
    /* An action that cannot work keeps failing on every tick until its minimum
     * time is up. Charge for the disappointment once, not five times over. */
    if (!this.actionOk) { this.endAction(); return; }
    this.soup.add('punish', amount);
    this.actionOk = false;
    this.endAction();
  };

  Creature.prototype.act = function (dt) {
    var f = this.focus, s = this.soup, w = this.world;
    var speed = 52 * this.params.speed * (0.55 + 0.45 * this.size) * (this.C.traits.stamina || 1);
    var inReach = f && this.focusDist <= this.reach() + (f.r || 12);
    this.vx = 0;

    switch (this.action) {
      case A.rest:
        s.add('wakeful', 0.02 * dt);
        break;

      case A.sleep:
        s.add('sleepiness', -0.09 * dt);
        s.add('fatiguesig', -0.12 * dt);
        s.add('wakeful', 0.03 * dt);
        if (s.get('sleepiness') < 0.04 || this.drives[0] > 0.85 || this.drives[1] > 0.85) {
          this.asleep = false; this.endAction();
        }
        break;

      case A.eat:
        if (!f || !this.edible(f)) { this.frustrate(0.03); break; }
        if (!inReach) { this.frustrate(0.008); break; }   /* right idea, too far */
        this.consume(f);
        this.endAction();
        break;

      case A.drink:
        if (!f || f.cat !== 'drink') { this.frustrate(0.03); break; }
        if (!inReach) { this.frustrate(0.008); break; }
        s.add('water', 0.30 * dt);
        this.stats.drunk += dt;
        if (this.drives[1] > 0.2) s.add('reward', 0.12 * dt);
        w.spawnEvent('drop', this.x, this.y - 14 * this.size);
        break;

      case A.play:
        if (!f || (f.cat !== 'toy' && f.cat !== 'creature')) { this.frustrate(0.03); break; }
        if (!inReach) { this.frustrate(0.008); break; }
        var boredom = this.drives[CG.DRIVES.indexOf('bored')];
        s.add('boredsig', -0.22 * dt);
        s.add('reward', 0.22 * boredom * dt);   /* fun is only fun when you were bored */
        s.add('curiosity', -0.1 * dt);
        this.stimulation = CG.clamp01(this.stimulation + 0.32 * dt);
        this.stats.played += dt;
        if (f.kind === 'ball') f.vx += (f.x > this.x ? 1 : -1) * 55 * dt;
        if (f.cat === 'creature' && f.alive) {
          f.stimulation = CG.clamp01(f.stimulation + 0.22 * dt);
          f.soup.add('boredsig', -0.12 * dt);
          f.social = CG.clamp01(f.social + 0.2 * dt);
        }
        if (this.rng.chance(dt * 1.2)) w.spawnEvent('note', this.x, this.y - 40 * this.size);
        break;

      case A.approach:
        if (!f) { this.frustrate(0.015); break; }
        /* Already there. Walking to something you are standing on is a habit
         * worth losing, so it stings very slightly. */
        /* Already there. Walking to something you are standing on is a habit
         * worth losing, so it stings slightly - and attention moves on. */
        if (inReach) { this.frustrate(0.02); this.look(true); break; }
        this.vx = (f.x > this.x ? 1 : -1) * speed;
        break;

      case A.retreat:
        if (!f) { this.frustrate(0.015); break; }
        this.vx = (f.x > this.x ? -1 : 1) * speed * 1.1;
        break;

      case A.wander:
        this.vx = this.wanderDir * speed * 0.7;
        if (this.x < 40) this.wanderDir = 1;
        if (this.x > w.w - 40) this.wanderDir = -1;
        break;

      case A.call:
        break;   /* the shout happens once, at action start */

      case A.push:
        if (!f || !inReach || !CG.KINDS[f.kind] || !CG.KINDS[f.kind].movable) { this.frustrate(0.02); break; }
        f.vx += (f.x > this.x ? 1 : -1) * 170 * dt;
        this.stimulation = CG.clamp01(this.stimulation + 0.12 * dt);
        break;

      case A.mate:
        if (!f || f.cat !== 'creature' || !inReach) { this.frustrate(0.02); break; }
        this.tryMate(f);
        this.endAction();
        break;

    }

    if (this.vx !== 0) this.facing = this.vx > 0 ? 1 : -1;
    this.x = CG.clamp(this.x + this.vx * dt, 24, w.w - 24);
  };

  Creature.prototype.edible = function (o) {
    return !!(CG.KINDS[o.kind] && CG.KINDS[o.kind].edible && !o.eaten);
  };

  Creature.prototype.consume = function (o) {
    var s = this.soup, hungry = this.drives[0];
    if (o.kind === 'bush') {
      if (o.berries <= 0) { this.frustrate(0.02); return; }
      o.berries--;
      o.cat = o.berries > 0 ? 'food' : 'plant';
      o.regrow = Math.max(o.regrow, 14);
      s.add('starch', 0.30); s.add('water', 0.14); s.add('protein', 0.12);
    } else if (o.kind === 'berry') {
      s.add('starch', 0.34); s.add('water', 0.16); s.add('protein', 0.14);
      this.world.remove(o);
    } else if (o.kind === 'herb') {
      s.add('antitoxin', 0.55); s.add('antibody', 0.5); s.add('starch', 0.05);
      o.eaten = true; o.regrow = 70;
    } else if (o.kind === 'weed') {
      s.add('starch', 0.16); s.add('toxin', 0.55);
      o.eaten = true; o.regrow = 55;
    } else { this.frustrate(0.02); return; }
    /* Taste is its own small reward, and it arrives instantly. The real lesson
     * comes minutes later when the toxin - or the full belly - is felt. */
    s.add('reward', 0.05 + hungry * 0.55);
    this.stats.eaten++;
    this.stimulation = CG.clamp01(this.stimulation + 0.12);
    this.world.spawnEvent('crumb', o.x, o.y - 10);
    if (this.focus === o) this.focus = null;
  };

  Creature.prototype.callOut = function () {
    var word = this.brain.findWord(this.cats, this.action, this.driveNews, 0.38);
    this.say(word || '...');
    this.world.spawnEvent('call', this.x, this.y - 46 * this.size);
    var list = this.world.near(this.x, 380);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === this || !o.alive) continue;
      /* Hearing a voice is a comfort, but only a small one. If shouting were
       * as good as company, two lonely sprigs would call across the valley
       * forever and never actually walk over to each other. */
      o.social = CG.clamp01(o.social + 0.07);
      o.soup.add('lonelysig', -0.05);
      o.soup.add('curiosity', 0.12);
      /* A shout turns heads. This is how two sprigs in a big valley ever find
       * each other, and it is why a lonely one calls in the first place. */
      if (o.drives[CG.DRIVES.indexOf('lonely')] > 0.3 || o.rng.chance(0.4)) {
        o.focus = this; o.focusDist = Math.abs(this.x - o.x);
      }
      if (word) o.hear(word, 0.35);
    }
    this.social = CG.clamp01(this.social + 0.05);
    this.soup.add('lonelysig', -0.04);
  };

  Creature.prototype.say = function (word) {
    this.speech = word;
    this.speechT = 2.6;
  };

  Creature.prototype.hear = function (word, attention) {
    if (!this.alive || this.asleep) return;
    var known = this.brain.words[word];
    this.brain.hearWord(word, this.attendedCats(), this.action, this.driveNews,
      attention == null ? 0.6 : attention);
    if (!known) this.stats.words++;
    /* Being spoken to is mildly nice; it is also how a sprig learns that words
     * are worth attending to at all. */
    this.soup.add('curiosity', 0.08);
  };

  /* What the creature counts as "in view" for the purpose of learning a word.
   * Normally that is everything it can see, which is why words picked up in
   * passing are vague. But when something has just been pointed out, that thing
   * crowds out the rest for a few seconds - so a deliberate lesson lands on the
   * thing you meant, even if it is the wrong name for it. */
  Creature.prototype.attendedCats = function () {
    if (!this.pointedAt || this.pointedAt.t <= 0 || this.pointedAt.ci < 0) return this.cats;
    var sharp = this._sharp || (this._sharp = new Float32Array(nC));
    for (var i = 0; i < nC; i++) sharp[i] = this.cats[i] * 0.2;
    sharp[this.pointedAt.ci] = 1;
    return sharp;
  };

  Creature.prototype.tryMate = function (other) {
    if (!other.alive || other.sex === this.sex) { this.frustrate(0.02); return; }
    if (this.stageIdx < 3 || other.stageIdx < 3) { this.frustrate(0.02); return; }
    if (this.mateCooldown > 0 || other.mateCooldown > 0) { this.frustrate(0.02); return; }
    var willing = this.drives[CG.DRIVES.indexOf('sexdrive')] > 0.22 &&
      other.drives[CG.DRIVES.indexOf('sexdrive')] > 0.15;
    if (!willing) { this.frustrate(0.02); return; }

    var mum = this.sex === 'f' ? this : other;
    var dad = this.sex === 'f' ? other : this;
    if (mum.gravid > 0) { this.frustrate(0.01); return; }
    mum.pendingGenome = CG.genome.crossover(mum.genome, dad.genome, this.rng);
    mum.gravid = 26;
    this.mateCooldown = other.mateCooldown = 90;
    this.soup.add('reward', 0.6); other.soup.add('reward', 0.6);
    this.soup.add('sexdrive', -0.9); other.soup.add('sexdrive', -0.9);
    this.soup.add('affection', 0.5); other.soup.add('affection', 0.5);
    this.stats.children++; other.stats.children++;
    this.world.spawnEvent('heart', (this.x + other.x) / 2, this.y - 50);
    this.world.log(mum.name + ' and ' + dad.name + ' are expecting.');
  };

  /* ---------- player touch ---------- */
  Creature.prototype.tickle = function () {
    this.soup.add('reward', 0.55);
    this.soup.add('affection', 0.35);
    this.tickled = 1;
    this.stimulation = CG.clamp01(this.stimulation + 0.25);
    this.social = CG.clamp01(this.social + 0.3);
    this.asleep = false;
    this.stats.tickles++;
    this.world.spawnEvent('heart', this.x, this.y - 48 * this.size);
  };
  Creature.prototype.scold = function () {
    this.soup.add('punish', 0.55);
    this.soup.add('fearsig', 0.2);
    this.scolded = 1;
    this.asleep = false;
    this.stats.scolds++;
    this.world.spawnEvent('bolt', this.x, this.y - 48 * this.size);
  };

  /* ---------- main tick ---------- */
  Creature.prototype.update = function (dt) {
    if (!this.alive) return;
    this.age += dt;
    this.bob += dt * (2.4 + Math.abs(this.vx) * 0.05);
    if (this.speechT > 0) { this.speechT -= dt; if (this.speechT <= 0) this.speech = null; }
    if (this.mateCooldown > 0) this.mateCooldown -= dt;
    if (this.pointedAt) {
      this.pointedAt.t -= dt;
      if (this.pointedAt.t <= 0) this.pointedAt = null;
    }

    /* life stage */
    var frac = this.age / this.lifespan, si = 0;
    while (si < STAGES.length - 1 && frac > STAGES[si].until) si++;
    if (si !== this.stageIdx) {
      this.stageIdx = si; this.stage = STAGES[si].name;
      this.world.log(this.name + ' is now ' + (si === 4 ? 'an ' : 'a ') + this.stage + '.');
    }
    var targetSize = STAGES[si].size * this.C.traits.bodySize * CG.clamp(0.6 + this.soup.get('growth'), 0.6, 1.15);
    this.size += (targetSize - this.size) * CG.clamp01(dt * 0.4);

    this.look(false);
    this.metabolise(dt);
    this.healthTick(dt);
    if (!this.alive) return;
    this.feel(dt);

    if (this.gravid > 0) {
      this.gravid -= dt;
      if (this.gravid <= 0 && this.pendingGenome) {
        this.world.layEgg(this.pendingGenome, this.x);
        this.world.log(this.name + ' laid an egg.');
        this.pendingGenome = null;
        this.soup.add('reward', 0.4);
      }
    }

    if (this.held) { this.vx = 0; return; }

    this.actionTime += dt;
    if (this.asleep) {
      this.act(dt);
      if (!this.asleep) this.endAction();
    } else {
      if (this.actionTime >= Math.max(MIN_ACT, this.actionDur)) this.chooseAction();
      this.act(dt);
    }

    /* Once in a while, say the word that fits. This is the whole point of
     * teaching, and it is how you find out what a sprig has understood. */
    if (!this.speech && !this.asleep && this.rng.chance(dt * 0.16 * this.C.traits.sociability)) {
      var w = this.brain.findWord(this.cats, this.action, this.driveNews, 0.5);
      if (w) this.say(w);
    }
  };

  /* ---------- readouts ---------- */
  Creature.prototype.topDrive = function () {
    var bi = -1, bv = 0.18;
    for (var i = 0; i < nD; i++) if (this.drives[i] > bv) { bv = this.drives[i]; bi = i; }
    return bi;
  };

  Creature.prototype.moodFace = function () {
    var net = this.soup.get('endorphin') - this.soup.get('cortisol');
    if (!this.alive) return 'x_x';
    if (this.asleep) return 'zzz';
    if (net > 0.18) return ':D';
    if (net < -0.18) return ':(';
    if (this.topDrive() >= 0) return ':|';
    return ':)';
  };

  /* One plain sentence describing what is going on inside. */
  Creature.prototype.describeState = function () {
    if (!this.alive) return this.name + ' has died of ' + this.cause + '.';
    if (this.asleep) return this.name + ' is fast asleep.';
    var d = this.topDrive();
    var need = d >= 0 ? CG.DRIVE_LABEL[CG.DRIVES[d]].toLowerCase() : 'content';
    var name = CG.ACTIONS[this.action];
    var directed = !!CG.ACTION_AT[name];
    var target = (directed && this.focus) ? this.focus : null;
    var at = '';
    if (target) {
      /* A friend has a name; everything else takes an article. */
      at = ' ' + (target.cat === 'creature'
        ? target.name
        : 'the ' + (CG.KINDS[target.kind] ? CG.KINDS[target.kind].label : target.kind));
    }
    var doing;
    if (!this.actionOk) doing = 'trying to ' + CG.ACTION_TRY[name];
    else doing = (target ? CG.ACTION_AT[name] : CG.ACTION_LABEL[name]);
    return this.name + ' is ' + need + ' and ' + doing + at + '.';
  };

  Creature.prototype.toJSON = function () {
    return {
      id: this.id, name: this.name, sex: this.sex, genome: this.genome, age: this.age,
      x: this.x, health: this.health, alive: this.alive, cause: this.cause,
      soup: Array.prototype.slice.call(this.soup.c), brain: this.brain.serialize(),
      stats: this.stats, social: this.social, stimulation: this.stimulation,
      awakeTime: this.awakeTime, gravid: this.gravid, pendingGenome: this.pendingGenome,
      mateCooldown: this.mateCooldown, seed: this.rng.s
    };
  };

  Creature.fromJSON = function (data, world) {
    var c = new Creature(data.genome, new CG.RNG(data.seed || 1), data.x, world);
    c.id = data.id; c.name = data.name; c.sex = data.sex; c.age = data.age;
    c.health = data.health; c.alive = data.alive; c.cause = data.cause;
    if (data.soup) c.soup.c.set(data.soup);
    c.brain.load(data.brain);
    if (data.stats) c.stats = data.stats;
    c.social = data.social; c.stimulation = data.stimulation;
    c.awakeTime = data.awakeTime || 0; c.gravid = data.gravid || 0;
    c.pendingGenome = data.pendingGenome || null;
    c.mateCooldown = data.mateCooldown || 0;
    return c;
  };

  CG.Creature = Creature;
  CG.STAGES = STAGES;
  CG.ACT = A;
})(typeof window !== 'undefined' ? (window.CG = window.CG || {}) : (globalThis.CG = globalThis.CG || {}));
