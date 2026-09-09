/* Sprigs - the mind.
 *
 * Two learning systems, both small enough to watch working:
 *
 * 1. Decision lobe. A one-layer network from a *conjunctive* situation vector
 *    (every drive crossed with every visible category: "hungry AND berry in
 *    sight") to an action score. Learning is reinforcement with eligibility
 *    traces: acting leaves a fading fingerprint on the weights it used, and
 *    when endorphin or cortisol arrives seconds later it stamps that
 *    fingerprint in or out. That delay is why praise and scolding work.
 *
 * 2. Word lobe. Each heard word keeps a running average of the situation it was
 *    heard in - what was in view, what the creature was doing, what it needed.
 *    That single memory serves both directions: hearing a word pushes attention
 *    and action, and having a situation lets the creature reach for the word. */
(function (CG) {
  'use strict';

  /* What a sprig can perceive things as. */
  var CATS = ['food', 'drink', 'toy', 'plant', 'weed', 'medicine', 'warmth', 'creature', 'egg', 'hand', 'nest'];
  var CAT_LABEL = {
    food: 'berry', drink: 'water', toy: 'ball', plant: 'plant', weed: 'weed', medicine: 'herb',
    warmth: 'lamp', creature: 'friend', egg: 'egg', hand: 'hand', nest: 'nest'
  };

  /* What a sprig can do. Order matters: creature.js switches on these. */
  var ACTIONS = ['rest', 'eat', 'drink', 'play', 'sleep', 'approach', 'retreat', 'wander', 'call', 'push', 'mate'];
  var ACTION_LABEL = {
    rest: 'resting', eat: 'eating', drink: 'drinking', play: 'playing', sleep: 'sleeping',
    approach: 'going to', retreat: 'backing away', wander: 'wandering', call: 'calling out',
    push: 'pushing', mate: 'courting'
  };

  var nD = CG.DRIVES.length, nC = CATS.length, nA = ACTIONS.length;
  var nConj = nD * nC;
  var EXTRA = 4;                       /* proximity, held, nothing-in-view, night */
  var nIn = nD + nC + nConj + EXTRA + 1;   /* + bias */
  var OFF_D = 0, OFF_C = nD, OFF_X = nD + nC, OFF_E = nD + nC + nConj, OFF_BIAS = nIn - 1;

  var WORD_LEN = nC + nA + nD;         /* a word's meaning lives in three sections */
  var MAX_WORDS = 40;

  function Brain(compiled, rng) {
    this.rng = rng;
    this.W = new Float32Array(nIn * nA);
    this.elig = new Float32Array(nIn * nA);
    this.x = new Float32Array(nIn);
    this.scores = new Float32Array(nA);
    this.words = {};        /* word -> {w:Float32Array, heard, last} */
    this.wordCount = 0;
    this.heard = null;      /* word currently ringing in the ears */
    this.heardAge = 99;
    this.lastAction = -1;
    this.learnRate = 1;
    this.explore = 0.08;
    this.traits = compiled.traits;
    this.installInstincts(compiled.instincts);
  }

  /* Instincts write directly into the decision weights at birth. They are weak:
   * a nudge toward the right idea, not a solution. Experience overwrites them. */
  Brain.prototype.installInstincts = function (instincts) {
    for (var i = 0; i < instincts.length; i++) {
      var g = instincts[i];
      var a = ACTIONS.indexOf(g.action);
      if (a < 0) continue;
      var parts = String(g.cue).split('+');
      var dName = parts[0], cName = parts[1];
      var d = CG.DRIVES.indexOf(dName), c = CATS.indexOf(cName);
      var idx = -1;
      if (d >= 0 && c >= 0) idx = OFF_X + d * nC + c;
      else if (d >= 0) idx = OFF_D + d;
      else if (c >= 0) idx = OFF_C + c;
      else if (cName === 'none') idx = OFF_E + 2;
      else idx = OFF_BIAS;
      this.W[idx * nA + a] += g.w;
    }
  };

  /* Build the situation vector. Salience is per category (the strongest thing
   * of that kind in view), so "there is food nearby" is a first class fact. */
  Brain.prototype.sense = function (drives, catSalience, prox, held, night) {
    var x = this.x, i, j;
    for (i = 0; i < nIn; i++) x[i] = 0;
    for (i = 0; i < nD; i++) x[OFF_D + i] = drives[i];
    for (i = 0; i < nC; i++) x[OFF_C + i] = catSalience[i];

    /* Hearing a word tilts perception: say "berry" and berries stand out. */
    if (this.heard && this.words[this.heard] && this.heardAge < 4) {
      var wm = this.words[this.heard].w, fade = 1 - this.heardAge / 4;
      for (i = 0; i < nC; i++) x[OFF_C + i] = CG.clamp01(x[OFF_C + i] + wm[i] * 0.6 * fade);
    }

    for (i = 0; i < nD; i++) {
      var dv = x[OFF_D + i];
      if (dv < 0.02) continue;
      for (j = 0; j < nC; j++) x[OFF_X + i * nC + j] = dv * x[OFF_C + j];
    }
    var anything = 0;
    for (i = 0; i < nC; i++) anything = Math.max(anything, x[OFF_C + i]);
    x[OFF_E + 0] = prox;
    x[OFF_E + 1] = held;
    x[OFF_E + 2] = 1 - anything;
    x[OFF_E + 3] = night;
    x[OFF_BIAS] = 1;
    return x;
  };

  /* Score every action, add the pull of any word just heard, and sample. */
  Brain.prototype.decide = function (temperature) {
    var x = this.x, W = this.W, s = this.scores, i, a, sum;
    for (a = 0; a < nA; a++) {
      sum = 0;
      for (i = 0; i < nIn; i++) { if (x[i] !== 0) sum += x[i] * W[i * nA + a]; }
      s[a] = sum;
    }
    if (this.heard && this.words[this.heard] && this.heardAge < 4) {
      var wm = this.words[this.heard].w, fade = 1 - this.heardAge / 4;
      for (a = 0; a < nA; a++) s[a] += wm[nC + a] * 2.2 * fade;
    }

    /* Scores are divided by the length of the situation vector so that a rich
     * scene and a bare one are judged on the same scale. */
    var norm = 0;
    for (i = 0; i < nIn; i++) norm += x[i] * x[i];
    norm = CG.clamp(Math.sqrt(norm), 1, 2.2);   /* a busy scene must not drown out a loud need */
    for (a = 0; a < nA; a++) s[a] /= norm;

    var t = Math.max(0.12, temperature), best = -Infinity;
    for (a = 0; a < nA; a++) if (s[a] > best) best = s[a];
    var tot = 0, p = this.p || (this.p = new Float32Array(nA));
    for (a = 0; a < nA; a++) { p[a] = Math.exp((s[a] - best) / t); tot += p[a]; }
    /* A floor of curiosity under every action. Without it a confident sprig
     * becomes a certain one: the policy gradient goes to zero, learning stops,
     * and it will repeat one mistake until it dies. The floor keeps a little
     * doubt alive, which is the only thing that lets a habit be unlearned. */
    var eps = this.explore;
    for (a = 0; a < nA; a++) p[a] = (1 - eps) * (p[a] / tot) + eps / nA;
    var r = this.rng.next();
    for (a = 0; a < nA; a++) { r -= p[a]; if (r <= 0) return a; }
    return nA - 1;
  };

  /* Remember that this action was taken in this situation, so a reward arriving
   * a few seconds later knows which weights to credit.
   *
   * The trace is the policy gradient of a softmax: credit for the action taken
   * is scaled by (1 - its probability), and every rival action is debited by its
   * own probability. That factor is what stops a habit running away with itself
   * - once a sprig is already certain, further praise teaches it nothing, and
   * the pull of the alternatives keeps it able to change its mind. */
  Brain.prototype.commit = function (action) {
    var x = this.x, e = this.elig, p = this.p, i, b, xi, base, norm = 0;
    for (i = 0; i < nIn; i++) norm += x[i] * x[i];
    norm = 1 / Math.sqrt(Math.max(norm, 1e-6));
    for (i = 0; i < nIn; i++) {
      xi = x[i];
      if (xi === 0) continue;
      xi *= norm;
      base = i * nA;
      for (b = 0; b < nA; b++) {
        e[base + b] = CG.clamp(e[base + b] + xi * ((b === action ? 1 : 0) - p[b]), -3, 3);
      }
    }
    this.lastAction = action;
  };

  /* reward > 0 for endorphin, < 0 for cortisol. Called every tick. */
  Brain.prototype.reinforce = function (reward, dt) {
    var e = this.elig, W = this.W, n = e.length, i;
    var decay = Math.exp(-dt / 6);
    var lr = 0.09 * this.learnRate * (this.traits.learnRate || 1);
    var forget = 1 - 0.0012 * dt * (this.traits.forgetRate || 1);
    if (Math.abs(reward) > 1e-4) {
      var step = lr * reward * dt * 14;
      for (i = 0; i < n; i++) {
        if (e[i] !== 0) W[i] = CG.clamp(W[i] + step * e[i], -4, 4);
      }
    }
    for (i = 0; i < n; i++) {
      e[i] *= decay;
      if (e[i] !== 0 && e[i] < 1e-4 && e[i] > -1e-4) e[i] = 0;
      W[i] *= forget;   /* unused ideas fade, which keeps old habits revisable */
    }
    if (this.heard) {
      this.heardAge += dt;
      if (this.heardAge > 6) this.heard = null;
    }
  };

  /* ---------- language ---------- */
  function ctxVector(brain, catSalience, action, drives) {
    var v = new Float32Array(WORD_LEN), i, m = 0;
    for (i = 0; i < nC; i++) { v[i] = catSalience[i]; }
    if (action >= 0) v[nC + action] = 0.8;
    for (i = 0; i < nD; i++) v[nC + nA + i] = drives[i] * 0.7;
    for (i = 0; i < WORD_LEN; i++) m = Math.max(m, v[i]);
    if (m > 0) for (i = 0; i < WORD_LEN; i++) v[i] /= m;
    return v;
  }

  /* Hearing a word: nudge its stored meaning toward the situation it arrived in.
   * Attention (from pointing, or from a strong drive) makes the lesson stick. */
  Brain.prototype.hearWord = function (word, catSalience, action, drives, attention) {
    if (!word) return;
    var rec = this.words[word];
    if (!rec) {
      if (this.wordCount >= MAX_WORDS) this.forgetWeakestWord();
      rec = this.words[word] = { w: new Float32Array(WORD_LEN), heard: 0, last: 0 };
      this.wordCount++;
    }
    var ctx = ctxVector(this, catSalience, action, drives);
    var lr = CG.clamp(0.28 * (this.traits.wordMemory || 1) * (0.4 + attention), 0.02, 0.85);
    for (var i = 0; i < WORD_LEN; i++) rec.w[i] += (ctx[i] - rec.w[i]) * lr;
    rec.heard++;
    this.heard = word;
    this.heardAge = 0;
  };

  Brain.prototype.forgetWeakestWord = function () {
    var worst = null, worstScore = Infinity, k;
    for (k in this.words) {
      if (!Object.prototype.hasOwnProperty.call(this.words, k)) continue;
      if (this.words[k].heard < worstScore) { worstScore = this.words[k].heard; worst = k; }
    }
    if (worst) { delete this.words[worst]; this.wordCount--; }
  };

  /* Reaching for a word that fits the moment. Returns null when nothing fits,
   * which is most of the time early on - and that silence is the point. */
  Brain.prototype.findWord = function (catSalience, action, drives, threshold) {
    var ctx = ctxVector(this, catSalience, action, drives);
    var best = null, bestScore = threshold == null ? 0.42 : threshold, k, i, dot, mag;
    for (k in this.words) {
      if (!Object.prototype.hasOwnProperty.call(this.words, k)) continue;
      var w = this.words[k].w;
      dot = 0; mag = 0;
      for (i = 0; i < WORD_LEN; i++) { dot += w[i] * ctx[i]; mag += w[i] * w[i]; }
      if (mag < 1e-6) continue;
      var score = dot / Math.sqrt(mag);
      /* A word heard twice is a guess; heard ten times it is knowledge. */
      score *= CG.clamp01(this.words[k].heard / 4);
      if (score > bestScore) { bestScore = score; best = k; }
    }
    return best;
  };

  /* How well does this creature know this word? 0..1, for the UI. */
  Brain.prototype.wordStrength = function (word) {
    var rec = this.words[word];
    if (!rec) return 0;
    var mag = 0;
    for (var i = 0; i < WORD_LEN; i++) mag += rec.w[i] * rec.w[i];
    return CG.clamp01(Math.sqrt(mag) * CG.clamp01(rec.heard / 6));
  };

  /* What the creature currently believes a word points at, for the science panel. */
  Brain.prototype.wordMeaning = function (word) {
    var rec = this.words[word];
    if (!rec) return null;
    var best = -1, bi = 0, i;
    for (i = 0; i < WORD_LEN; i++) if (rec.w[i] > best) { best = rec.w[i]; bi = i; }
    if (best < 0.15) return null;
    if (bi < nC) return CAT_LABEL[CATS[bi]];
    if (bi < nC + nA) return ACTION_LABEL[ACTIONS[bi - nC]];
    return CG.DRIVE_LABEL[CG.DRIVES[bi - nC - nA]].toLowerCase();
  };

  Brain.prototype.serialize = function () {
    var words = {}, k;
    for (k in this.words) {
      if (!Object.prototype.hasOwnProperty.call(this.words, k)) continue;
      words[k] = { w: Array.prototype.slice.call(this.words[k].w), heard: this.words[k].heard };
    }
    return { W: Array.prototype.slice.call(this.W), words: words };
  };
  Brain.prototype.load = function (data) {
    if (!data) return;
    if (data.W && data.W.length === this.W.length) this.W.set(data.W);
    this.words = {}; this.wordCount = 0;
    for (var k in data.words) {
      if (!Object.prototype.hasOwnProperty.call(data.words, k)) continue;
      var rec = data.words[k];
      if (!rec.w || rec.w.length !== WORD_LEN) continue;
      this.words[k] = { w: Float32Array.from(rec.w), heard: rec.heard || 1, last: 0 };
      this.wordCount++;
    }
  };

  CG.CATS = CATS; CG.CAT_LABEL = CAT_LABEL;
  CG.ACTIONS = ACTIONS; CG.ACTION_LABEL = ACTION_LABEL;
  CG.Brain = Brain;
  CG.BRAIN_DIMS = { nIn: nIn, nA: nA, nC: nC, nD: nD, OFF_D: OFF_D, OFF_C: OFF_C, OFF_X: OFF_X, OFF_E: OFF_E };
})(typeof window !== 'undefined' ? (window.CG = window.CG || {}) : (globalThis.CG = globalThis.CG || {}));
