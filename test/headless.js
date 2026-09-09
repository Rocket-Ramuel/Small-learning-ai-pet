/* Headless viability test: does a sprig actually stay alive, learn, and breed?
 * Run with: node test/headless.js [seconds] [seed] */
require('../src/util.js');
require('../src/chemistry.js');
require('../src/genome.js');
require('../src/brain.js');
require('../src/world.js');
require('../src/creature.js');
var CG = globalThis.CG;

var SECONDS = Number(process.argv[2] || 1800);
var SEED = Number(process.argv[3] || 1);

var world = new CG.World(SEED);
var rng = new CG.RNG(SEED * 7 + 1);
var logs = [];
world.onLog = function (m) { logs.push(m); };

for (var i = 0; i < 2; i++) {
  var g = CG.genome.wildType(rng);
  var c = new CG.Creature(g, rng.fork(), 700 + i * 200, world);
  c.sex = i === 0 ? 'f' : 'm';
  world.creatures.push(c);
}

var dt = 1 / 10, steps = Math.floor(SECONDS / dt);
var nan = false;
for (var s = 0; s < steps; s++) {
  world.update(dt);
  for (var j = 0; j < world.creatures.length; j++) {
    var cr = world.creatures[j];
    cr.update(dt);
    if (!nan && cr.alive) {
      for (var k = 0; k < cr.soup.c.length; k++) {
        if (!isFinite(cr.soup.c[k])) { nan = true; console.log('NaN chem', CG.CHEMS[k], 'in', cr.name); }
      }
      for (k = 0; k < cr.brain.W.length; k++) {
        if (!isFinite(cr.brain.W[k])) { nan = true; console.log('NaN weight in', cr.name); break; }
      }
    }
  }
  /* Teach words the way a player would: name what the first sprig is looking at. */
  if (s % 120 === 0) {
    var alive = world.living();
    if (alive.length) {
      var t = alive[0];
      if (t.focus && t.focus.cat) {
        t.hear(CG.CAT_LABEL[t.focus.cat] || t.focus.cat, 0.9);
      }
    }
  }
}

var alive = world.living();
console.log('--- after ' + SECONDS + 's (seed ' + SEED + ') ---');
console.log('alive:', alive.length, ' born:', world.stats.born, ' died:', world.stats.died,
  ' max gen:', world.stats.generations, ' eggs:', world.objects.filter(function (o) { return o.kind === 'egg'; }).length);
world.creatures.forEach(function (c) {
  console.log(' ', c.name, c.sex, c.alive ? 'alive' : 'DEAD(' + c.cause + ')',
    'age', Math.round(c.age) + 's', 'hp', c.health.toFixed(2),
    'ate', c.stats.eaten, 'drank', c.stats.drunk.toFixed(0), 'played', c.stats.played.toFixed(0),
    'words', Object.keys(c.brain.words).length,
    '| ' + (c.alive ? c.describeState() : ''));
});
console.log('NaN seen:', nan);
console.log('log tail:', logs.slice(-6).join(' / '));

/* action histogram for the longest-lived creature */
var star = world.creatures.slice().sort(function (a, b) { return b.age - a.age; })[0];
if (star) {
  var hist = Array.prototype.map.call(star.actionCount, function (n, i) { return CG.ACTIONS[i] + ':' + n; });
  console.log('actions of', star.name + ':', hist.join(' '));
}
if (star) console.log('vocabulary of', star.name + ':', Object.keys(star.brain.words).map(function (w) {
  return w + '(' + star.brain.wordStrength(w).toFixed(2) + '->' + (star.brain.wordMeaning(w) || '?') + ')';
}).join(' '));
