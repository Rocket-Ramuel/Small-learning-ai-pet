/* Sprigs - biochemistry.
 *
 * A sprig's body is a soup of 30 chemicals. Nothing in the creature reads the
 * world directly: events raise chemicals (emitters), chemicals turn into other
 * chemicals (reactions), and chemicals are finally read back out as drives and
 * body parameters (receptors). All three tables live in the genome, so a
 * mutation can rewire the metabolism of a whole bloodline. */
(function (CG) {
  'use strict';

  var CHEMS = [
    /* 0  */ 'glucose',    /* usable energy */
    /* 1  */ 'starch',     /* slow food store, digests into glucose */
    /* 2  */ 'water',
    /* 3  */ 'fat',        /* long term reserve */
    /* 4  */ 'protein',    /* needed to grow */
    /* 5  */ 'hungersig',
    /* 6  */ 'thirstsig',
    /* 7  */ 'fatiguesig',
    /* 8  */ 'lonelysig',
    /* 9  */ 'boredsig',
    /* 10 */ 'fearsig',
    /* 11 */ 'painsig',
    /* 12 */ 'coldsig',
    /* 13 */ 'heatsig',
    /* 14 */ 'reward',     /* raw praise, becomes endorphin */
    /* 15 */ 'punish',     /* raw scolding, becomes cortisol */
    /* 16 */ 'adrenaline',
    /* 17 */ 'endorphin',  /* the learning signal, positive half */
    /* 18 */ 'cortisol',   /* the learning signal, negative half */
    /* 19 */ 'growth',
    /* 20 */ 'sexdrive',
    /* 21 */ 'toxin',
    /* 22 */ 'antitoxin',
    /* 23 */ 'sickness',
    /* 24 */ 'antibody',
    /* 25 */ 'sleepiness',
    /* 26 */ 'wakeful',
    /* 27 */ 'affection',
    /* 28 */ 'anger',
    /* 29 */ 'curiosity'
  ];
  var CI = {};
  for (var i = 0; i < CHEMS.length; i++) CI[CHEMS[i]] = i;

  /* Chemicals a player might reasonably want to look at, in reading order. */
  var CHEM_GROUPS = [
    { name: 'Fuel', chems: ['glucose', 'starch', 'water', 'fat', 'protein'] },
    { name: 'Needs', chems: ['hungersig', 'thirstsig', 'fatiguesig', 'lonelysig', 'boredsig', 'coldsig', 'heatsig', 'painsig', 'fearsig'] },
    { name: 'Feelings', chems: ['endorphin', 'cortisol', 'adrenaline', 'affection', 'anger', 'curiosity', 'sexdrive'] },
    { name: 'Health', chems: ['toxin', 'antitoxin', 'sickness', 'antibody', 'growth', 'sleepiness', 'wakeful'] }
  ];

  function Soup() {
    this.c = new Float32Array(CHEMS.length);
  }
  Soup.prototype.get = function (name) { return this.c[CI[name]]; };
  Soup.prototype.set = function (name, v) { this.c[CI[name]] = CG.clamp01(v); };
  Soup.prototype.add = function (name, v) {
    var i = CI[name];
    this.c[i] = CG.clamp01(this.c[i] + v);
  };
  Soup.prototype.addIdx = function (i, v) { this.c[i] = CG.clamp01(this.c[i] + v); };

  /* Scratch snapshot shared by every soup: the sim is single threaded and a
   * step never yields, so one buffer is enough and it keeps Soup serialisable. */
  var SNAP = new Float32Array(CHEMS.length);

  /* One simulation step of the whole soup.
   * reactions: [{a,b,ca,cb,out:[[idx,amt],..],rate}]  (b < 0 means unimolecular)
   * halfLife:  Float32Array, seconds for each chemical to halve (0 = stable) */
  Soup.prototype.step = function (dt, reactions, halfLife) {
    var c = this.c, n = c.length, k, r, amount, j;

    /* Reactions are evaluated against a snapshot so ordering inside the genome
     * cannot give an early gene an unfair claim on a scarce reactant. */
    SNAP.set(c);

    for (k = 0; k < reactions.length; k++) {
      r = reactions[k];
      /* Mass action: unimolecular is first order in A, bimolecular second order. */
      amount = r.rate * dt * SNAP[r.a];
      if (r.b >= 0) amount *= SNAP[r.b];
      if (amount <= 1e-7) continue;
      /* Never consume more of either reactant than the body actually holds. */
      amount = Math.min(amount, SNAP[r.a] / r.ca);
      if (r.b >= 0) amount = Math.min(amount, SNAP[r.b] / r.cb);
      c[r.a] = Math.max(0, c[r.a] - amount * r.ca);
      if (r.b >= 0) c[r.b] = Math.max(0, c[r.b] - amount * r.cb);
      for (j = 0; j < r.out.length; j++) {
        c[r.out[j][0]] = CG.clamp01(c[r.out[j][0]] + amount * r.out[j][1]);
      }
    }

    for (k = 0; k < n; k++) {
      var hl = halfLife[k];
      if (hl > 0 && c[k] > 0) c[k] *= Math.pow(0.5, dt / hl);
      if (c[k] < 1e-6) c[k] = 0;
    }
  };

  CG.CHEMS = CHEMS;
  CG.CI = CI;
  CG.CHEM_GROUPS = CHEM_GROUPS;
  CG.Soup = Soup;
})(typeof window !== 'undefined' ? (window.CG = window.CG || {}) : (globalThis.CG = globalThis.CG || {}));
