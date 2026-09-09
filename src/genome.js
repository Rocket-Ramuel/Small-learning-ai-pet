/* Sprigs - genetics.
 *
 * A genome is a flat list of genes. Six kinds exist:
 *   trait     - a single number: body shape, colour, metabolism, temperament
 *   reaction  - one chemical reaction in the body
 *   halflife  - how fast a chemical drains away
 *   emitter   - a body/world condition that pours a chemical into the soup
 *   receptor  - a chemical that is read back out as a drive or body parameter
 *   instinct  - a hardwired nudge in the brain, present from birth
 *
 * Genes carry a stable key so two genomes can be lined up for breeding, and a
 * per-gene mutability so some parts of the design drift faster than others. */
(function (CG) {
  'use strict';

  var CI = CG.CI;

  /* Drives are the creature's felt needs. The brain sees exactly these. */
  var DRIVES = ['hunger', 'thirst', 'fatigue', 'lonely', 'bored', 'cold', 'hot', 'pain', 'fear', 'sexdrive', 'sick'];
  var DRIVE_LABEL = {
    hunger: 'Hungry', thirst: 'Thirsty', fatigue: 'Sleepy', lonely: 'Lonely', bored: 'Bored',
    cold: 'Cold', hot: 'Too hot', pain: 'Hurt', fear: 'Scared', sexdrive: 'Amorous', sick: 'Ill'
  };

  /* Body conditions an emitter gene is allowed to watch. */
  var EMITTER_SOURCES = ['lowGlucose', 'lowWater', 'awake', 'alone', 'unstimulated', 'threat',
    'injury', 'chilly', 'sweaty', 'mature', 'exertion', 'night', 'sickLoad', 'toxLoad', 'crowded'];

  /* What a receptor gene is allowed to drive. */
  var RECEPTOR_TARGETS = DRIVES.map(function (d) { return 'drive:' + d; })
    .concat(['param:speed', 'param:learnRate', 'param:metabolism', 'param:boldness', 'param:growth', 'param:focus']);

  /* trait key: [min, max, default, mutability] */
  var TRAITS = {
    /* looks */
    hue: [0, 360, 120, 26], hue2: [0, 360, 40, 26], sat: [0.2, 0.95, 0.55, 0.07], light: [0.35, 0.75, 0.55, 0.05],
    bodySize: [0.6, 1.6, 1.0, 0.07], headSize: [0.6, 1.5, 1.0, 0.07], earLen: [0.1, 2.0, 0.9, 0.12],
    legLen: [0.5, 1.7, 1.0, 0.09], eyeSize: [0.5, 1.6, 1.0, 0.08], snout: [0.2, 1.6, 0.8, 0.1],
    tailLen: [0.0, 2.0, 0.8, 0.14], pattern: [0, 3.99, 1.0, 0.35], spots: [0, 1, 0.4, 0.12],
    /* body */
    metabolism: [0.4, 2.2, 1.0, 0.09], digestRate: [0.4, 2.2, 1.0, 0.09], appetite: [0.5, 1.8, 1.0, 0.09],
    lifespan: [900, 5400, 2400, 0.11], immunity: [0.2, 2.0, 1.0, 0.12], fertility: [0.2, 2.0, 1.0, 0.13],
    tempPref: [0.25, 0.8, 0.5, 0.08], stamina: [0.5, 1.6, 1.0, 0.08],
    /* mind */
    learnRate: [0.25, 2.2, 1.0, 0.11], curiosity: [0.2, 2.0, 1.0, 0.13], boldness: [0.2, 2.0, 1.0, 0.13],
    sociability: [0.2, 2.0, 1.0, 0.13], patience: [0.3, 2.0, 1.0, 0.12], forgetRate: [0.3, 2.0, 1.0, 0.1],
    tempers: [0.2, 2.0, 1.0, 0.14], wordMemory: [0.3, 2.2, 1.0, 0.12],
    /* meta */
    mutability: [0.25, 3.0, 1.0, 0.16]
  };

  function traitGene(key, value) {
    var d = TRAITS[key];
    return { t: 'trait', k: 'trait:' + key, key: key, v: CG.clamp(value, d[0], d[1]), mut: d[3] };
  }

  /* ---------- the wild-type genome ---------- */
  /* Hand-authored so a fresh sprig is viable; every number is still a gene and
   * every gene is still free to mutate away from here. */
  function wildType(rng) {
    var g = [], k;

    for (k in TRAITS) {
      if (!Object.prototype.hasOwnProperty.call(TRAITS, k)) continue;
      var d = TRAITS[k];
      /* Individuals start scattered around the wild-type value. */
      var spread = (d[1] - d[0]) * 0.13;
      g.push(traitGene(k, d[2] + rng.gauss() * spread));
    }
    /* Colour is worth scattering widely so a starting pair looks unrelated. */
    g[0].v = rng.range(0, 360); g[1].v = rng.range(0, 360);

    function rx(name, a, ca, b, cb, out, rate) {
      g.push({ t: 'reaction', k: 'rx:' + name, a: CI[a], ca: ca, b: b ? CI[b] : -1, cb: cb, rate: rate, mut: 0.1,
        out: out.map(function (o) { return [CI[o[0]], o[1]]; }) });
    }
    /* digestion and energy */
    rx('digest', 'starch', 1, 'water', 0.2, [['glucose', 1.6]], 0.14);
    /* Storing fat is second order in glucose, so it only really happens when
     * glucose is plentiful - a threshold effect from plain mass action. */
    rx('store', 'glucose', 1, 'glucose', 1, [['fat', 0.5]], 0.006);
    rx('mobilise', 'fat', 1, null, 0, [['glucose', 0.9]], 0.008);
    rx('build', 'protein', 1, 'glucose', 0.4, [['growth', 1.2]], 0.02);
    /* feelings: raw praise and scolding are refined into learning signals */
    rx('praise', 'reward', 1, null, 0, [['endorphin', 1.1], ['affection', 0.5]], 1.2);
    rx('scold', 'punish', 1, null, 0, [['cortisol', 1.1], ['anger', 0.35]], 1.2);
    rx('rush', 'fearsig', 1, null, 0, [['adrenaline', 0.8]], 0.5);
    rx('temper', 'painsig', 1, null, 0, [['anger', 0.5], ['adrenaline', 0.4]], 0.35);
    rx('comfort', 'endorphin', 1, 'cortisol', 1, [], 0.9);
    /* illness */
    rx('poison', 'toxin', 1, null, 0, [['sickness', 0.9], ['painsig', 0.4]], 0.09);
    rx('detox', 'toxin', 1, 'antitoxin', 1, [], 1.4);
    rx('immune', 'sickness', 1, 'antibody', 1, [], 1.1);
    rx('malaise', 'sickness', 1, 'glucose', 0.3, [['fatiguesig', 0.5]], 0.15);
    /* sleep pressure */
    rx('rouse', 'sleepiness', 1, 'wakeful', 1, [], 1.0);
    rx('doze', 'sleepiness', 1, null, 0, [['fatiguesig', 0.8]], 0.4);

    function hl(chem, seconds) {
      g.push({ t: 'halflife', k: 'hl:' + chem, c: CI[chem], hl: seconds, mut: 0.12 });
    }
    hl('glucose', 0); hl('starch', 0); hl('water', 0); hl('fat', 0); hl('protein', 0);
    hl('hungersig', 12); hl('thirstsig', 12); hl('fatiguesig', 20); hl('lonelysig', 25);
    hl('boredsig', 18); hl('fearsig', 6); hl('painsig', 14); hl('coldsig', 8); hl('heatsig', 8);
    hl('reward', 1.2); hl('punish', 1.2); hl('adrenaline', 8); hl('endorphin', 5); hl('cortisol', 7);
    hl('growth', 30); hl('sexdrive', 45); hl('toxin', 90); hl('antitoxin', 25); hl('sickness', 240);
    hl('antibody', 60); hl('sleepiness', 40); hl('wakeful', 30); hl('affection', 40); hl('anger', 20);
    hl('curiosity', 15);

    function em(src, chem, thresh, gain, invert) {
      g.push({ t: 'emitter', k: 'em:' + src + '>' + chem, src: src, chem: CI[chem],
        thresh: thresh, gain: gain, invert: !!invert, mut: 0.12 });
    }
    em('lowGlucose', 'hungersig', 0.42, 0.85);
    em('lowWater', 'thirstsig', 0.4, 0.85);
    em('awake', 'sleepiness', 0.45, 0.4);
    em('night', 'sleepiness', 0.5, 0.35);
    em('alone', 'lonelysig', 0.5, 0.25);
    em('crowded', 'boredsig', 0.9, 0.2, true);
    em('unstimulated', 'boredsig', 0.45, 0.22);
    em('unstimulated', 'curiosity', 0.35, 0.35);
    em('threat', 'fearsig', 0.15, 1.1);
    em('injury', 'painsig', 0.05, 1.0);
    em('chilly', 'coldsig', 0.2, 0.55);
    em('sweaty', 'heatsig', 0.2, 0.55);
    em('mature', 'sexdrive', 0.6, 0.16);
    em('mature', 'growth', 0.85, 0.1, true);
    em('exertion', 'wakeful', 0.35, 0.35);
    em('sickLoad', 'antibody', 0.1, 0.35);
    em('toxLoad', 'antitoxin', 0.12, 0.3);

    function rc(chem, tgt, thresh, gain, invert) {
      g.push({ t: 'receptor', k: 'rc:' + chem + '>' + tgt, chem: CI[chem], tgt: tgt,
        thresh: thresh, gain: gain, invert: !!invert, mut: 0.12 });
    }
    rc('hungersig', 'drive:hunger', 0, 1.0);
    rc('thirstsig', 'drive:thirst', 0, 1.0);
    rc('fatiguesig', 'drive:fatigue', 0, 1.0);
    rc('lonelysig', 'drive:lonely', 0, 1.0);
    rc('boredsig', 'drive:bored', 0, 1.0);
    rc('coldsig', 'drive:cold', 0, 1.0);
    rc('heatsig', 'drive:hot', 0, 1.0);
    rc('painsig', 'drive:pain', 0, 1.0);
    rc('fearsig', 'drive:fear', 0, 1.0);
    rc('sexdrive', 'drive:sexdrive', 0.15, 1.0);
    rc('sickness', 'drive:sick', 0.08, 1.0);
    rc('adrenaline', 'param:speed', 0, 0.5);
    rc('glucose', 'param:speed', 0.15, 0.35);
    rc('endorphin', 'param:learnRate', 0, 0.9);
    rc('cortisol', 'param:learnRate', 0, 0.7);
    rc('anger', 'param:boldness', 0, 0.6);
    rc('cortisol', 'param:boldness', 0, -0.5);
    rc('growth', 'param:growth', 0, 1.0);
    rc('curiosity', 'param:focus', 0, -0.6);
    rc('sickness', 'param:metabolism', 0, -0.35);

    /* Instincts: what a newborn already half-knows. Weak on purpose - they are
     * a starting bias, not a solution, and learning overwrites them. */
    function inst(cue, action, w) {
      g.push({ t: 'instinct', k: 'in:' + cue + '>' + action, cue: cue, action: action, w: w, mut: 0.2 });
    }
    inst('hunger+food', 'eat', 3.0);
    inst('hunger+food', 'approach', 2.2);
    inst('thirst+drink', 'drink', 3.0);
    inst('thirst+drink', 'approach', 2.2);
    inst('fatigue+any', 'sleep', 1.8);
    inst('bored+toy', 'play', 1.2);
    inst('bored+toy', 'approach', 0.7);
    inst('lonely+creature', 'approach', 1.6);
    inst('lonely+creature', 'call', 1.2);
    inst('fear+any', 'retreat', 2.0);
    inst('sick+medicine', 'eat', 1.8);
    inst('sexdrive+creature', 'mate', 1.6);
    inst('sexdrive+creature', 'approach', 1.2);
    inst('any+none', 'wander', 0.5);
    inst('hunger+none', 'wander', 1.1);
    inst('thirst+none', 'wander', 1.1);
    inst('bored+any', 'wander', 0.6);

    return { id: CG.uid('gn'), gen: 1, genes: g, born: 0 };
  }

  /* ---------- mutation ---------- */
  function jitter(rng, v, amount, lo, hi) {
    var span = (hi - lo);
    return CG.clamp(v + rng.gauss() * amount * span * 0.25, lo, hi);
  }

  function mutateGene(gene, rng, strength) {
    var g = CG.shallow(gene), i;
    var m = (gene.mut || 0.1) * strength;
    if (gene.t === 'trait') {
      var d = TRAITS[gene.key];
      if (!d) return g;
      g.v = jitter(rng, g.v, m, d[0], d[1]);
    } else if (gene.t === 'reaction') {
      g.rate = CG.clamp(g.rate * Math.exp(rng.gauss() * m), 0.001, 4);
      if (rng.chance(0.15 * strength)) g.ca = CG.clamp(g.ca * Math.exp(rng.gauss() * m), 0.05, 3);
      if (rng.chance(0.15 * strength) && g.b >= 0) g.cb = CG.clamp(g.cb * Math.exp(rng.gauss() * m), 0.05, 3);
      if (rng.chance(0.2 * strength)) {
        g.out = g.out.map(function (o) { return [o[0], CG.clamp(o[1] * Math.exp(rng.gauss() * m), 0.02, 3)]; });
      }
      /* rare rewiring: a product is redirected to a different chemical */
      if (rng.chance(0.03 * strength) && g.out.length) {
        g.out = g.out.slice();
        i = rng.int(g.out.length);
        g.out[i] = [rng.int(CG.CHEMS.length), g.out[i][1]];
        g.k = g.k + '*';
      }
    } else if (gene.t === 'halflife') {
      g.hl = g.hl === 0 ? 0 : CG.clamp(g.hl * Math.exp(rng.gauss() * m), 0.4, 900);
    } else if (gene.t === 'emitter' || gene.t === 'receptor') {
      g.thresh = CG.clamp(g.thresh + rng.gauss() * m * 0.25, 0, 0.95);
      g.gain = CG.clamp(g.gain * Math.exp(rng.gauss() * m), -3, 3);
      if (rng.chance(0.02 * strength)) { g.invert = !g.invert; g.k = g.k + '*'; }
      if (rng.chance(0.03 * strength)) {
        /* rewire: point this gene at a different chemical */
        g.chem = rng.int(CG.CHEMS.length);
        g.k = (gene.t === 'emitter' ? 'em:' + g.src : 'rc:' + CG.CHEMS[g.chem]) + '>' + (g.tgt || CG.CHEMS[g.chem]) + '~' + rng.int(9999);
      }
    } else if (gene.t === 'instinct') {
      g.w = CG.clamp(g.w + rng.gauss() * m * 0.6, -2.5, 3);
    }
    return g;
  }

  function structuralMutation(genes, rng, strength) {
    var out = genes.slice(), i, g;
    /* duplication - the main way genomes gain new machinery */
    if (rng.chance(0.06 * strength)) {
      i = rng.int(out.length);
      g = mutateGene(out[i], rng, 3);
      g.k = g.k + '#' + rng.int(9999);
      out.push(g);
    }
    /* loss - usually harmless, occasionally fatal, which is the point */
    if (rng.chance(0.05 * strength) && out.length > 40) {
      i = rng.int(out.length);
      if (out[i].t !== 'trait') out.splice(i, 1);
    }
    /* a brand new reflex arc appears out of nowhere */
    if (rng.chance(0.03 * strength)) {
      out.push({ t: 'receptor', k: 'rc:new' + rng.int(99999),
        chem: rng.int(CG.CHEMS.length), tgt: rng.pick(RECEPTOR_TARGETS),
        thresh: rng.range(0, 0.5), gain: rng.range(-1, 1.4), invert: rng.chance(0.2), mut: 0.2 });
    }
    if (rng.chance(0.03 * strength)) {
      out.push({ t: 'emitter', k: 'em:new' + rng.int(99999),
        src: rng.pick(EMITTER_SOURCES), chem: rng.int(CG.CHEMS.length),
        thresh: rng.range(0, 0.6), gain: rng.range(0.05, 0.9), invert: rng.chance(0.2), mut: 0.2 });
    }
    return out;
  }

  function mutate(genome, rng, strength) {
    strength = strength == null ? 1 : strength;
    var genes = genome.genes.map(function (g) {
      return rng.chance(0.16 * strength) ? mutateGene(g, rng, strength) : g;
    });
    genes = structuralMutation(genes, rng, strength);
    return { id: CG.uid('gn'), gen: genome.gen, genes: genes, born: 0,
      mumId: genome.mumId, dadId: genome.dadId };
  }

  /* ---------- breeding ---------- */
  function crossover(a, b, rng) {
    var byKey = {}, order = [], i, g, key;
    function index(genome, slot) {
      for (i = 0; i < genome.genes.length; i++) {
        g = genome.genes[i]; key = g.k;
        if (!byKey[key]) { byKey[key] = { a: null, b: null }; order.push(key); }
        byKey[key][slot] = g;
      }
    }
    index(a, 'a'); index(b, 'b');

    var genes = [];
    for (i = 0; i < order.length; i++) {
      var pair = byKey[order[i]];
      if (pair.a && pair.b) {
        /* Both parents carry this gene. Usually take one intact allele; now and
         * then the two blend, which lets quantitative traits drift smoothly. */
        if (rng.chance(0.25) && pair.a.t === pair.b.t) genes.push(blend(pair.a, pair.b, rng));
        else genes.push(rng.chance(0.5) ? pair.a : pair.b);
      } else {
        /* Carried by one parent only - inherited about half the time. */
        if (rng.chance(0.5)) genes.push(pair.a || pair.b);
      }
    }
    var strength = 0.5 * (traitOf(a, 'mutability') + traitOf(b, 'mutability'));
    var child = mutate({ id: '', gen: 0, genes: genes }, rng, strength);
    child.gen = Math.max(a.gen || 1, b.gen || 1) + 1;
    child.mumId = a.id; child.dadId = b.id;
    return child;
  }

  function blend(x, y, rng) {
    var g = CG.shallow(x), t = rng.range(0.3, 0.7);
    if (x.t === 'trait') g.v = CG.lerp(x.v, y.v, t);
    else if (x.t === 'reaction') g.rate = CG.lerp(x.rate, y.rate, t);
    else if (x.t === 'halflife') g.hl = CG.lerp(x.hl, y.hl, t);
    else if (x.t === 'instinct') g.w = CG.lerp(x.w, y.w, t);
    else { g.gain = CG.lerp(x.gain, y.gain, t); g.thresh = CG.lerp(x.thresh, y.thresh, t); }
    return g;
  }

  function traitOf(genome, key) {
    for (var i = 0; i < genome.genes.length; i++) {
      if (genome.genes[i].t === 'trait' && genome.genes[i].key === key) return genome.genes[i].v;
    }
    return TRAITS[key] ? TRAITS[key][2] : 0;
  }

  /* ---------- compiling ---------- */
  /* Turns the gene list into the flat tables the body reads every tick. */
  function compile(genome) {
    var out = {
      traits: {}, reactions: [], halfLife: new Float32Array(CG.CHEMS.length),
      emitters: [], receptors: [], instincts: [], lethal: null
    };
    var k;
    for (k in TRAITS) if (Object.prototype.hasOwnProperty.call(TRAITS, k)) out.traits[k] = TRAITS[k][2];

    var i, g;
    for (i = 0; i < genome.genes.length; i++) {
      g = genome.genes[i];
      switch (g.t) {
        case 'trait':
          if (TRAITS[g.key]) out.traits[g.key] = CG.clamp(g.v, TRAITS[g.key][0], TRAITS[g.key][1]);
          break;
        case 'reaction': out.reactions.push(g); break;
        case 'halflife': out.halfLife[g.c] = g.hl; break;
        case 'emitter': out.emitters.push(g); break;
        case 'receptor': out.receptors.push(g); break;
        case 'instinct': out.instincts.push(g); break;
      }
    }
    /* A genome that cannot turn food into energy makes a creature that starves
     * in the egg. Better to know that up front than to watch it puzzle players. */
    var canDigest = false;
    for (i = 0; i < out.reactions.length; i++) {
      var r = out.reactions[i];
      for (var j = 0; j < r.out.length; j++) if (r.out[j][0] === CI.glucose) canDigest = true;
    }
    if (!canDigest) out.lethal = 'cannot digest food';
    return out;
  }

  /* A short readable summary of how this genome differs from wild type. */
  function describe(genome) {
    var c = compile(genome), notes = [], k;
    var interesting = { metabolism: ['slow burning', 'fast burning'], learnRate: ['slow to learn', 'quick to learn'],
      curiosity: ['incurious', 'curious'], boldness: ['timid', 'bold'], sociability: ['solitary', 'sociable'],
      appetite: ['light eater', 'big eater'], lifespan: ['short lived', 'long lived'],
      immunity: ['frail', 'hardy'], tempers: ['placid', 'temperamental'], patience: ['impatient', 'patient'],
      fertility: ['barely fertile', 'very fertile'], bodySize: ['small', 'large'] };
    for (k in interesting) {
      if (!Object.prototype.hasOwnProperty.call(interesting, k)) continue;
      var d = TRAITS[k], v = c.traits[k], mid = d[2];
      var rel = (v - mid) / (d[1] - d[0]);
      if (rel < -0.16) notes.push(interesting[k][0]);
      else if (rel > 0.16) notes.push(interesting[k][1]);
    }
    if (!notes.length) notes.push('unremarkable');
    return notes.slice(0, 4).join(', ');
  }

  CG.DRIVES = DRIVES;
  CG.DRIVE_LABEL = DRIVE_LABEL;
  CG.TRAITS = TRAITS;
  CG.EMITTER_SOURCES = EMITTER_SOURCES;
  CG.RECEPTOR_TARGETS = RECEPTOR_TARGETS;
  CG.genome = {
    wildType: wildType, mutate: mutate, crossover: crossover, compile: compile,
    traitOf: traitOf, describe: describe
  };
})(typeof window !== 'undefined' ? (window.CG = window.CG || {}) : (globalThis.CG = globalThis.CG || {}));
