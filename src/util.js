/* Sprigs - shared utilities.
 * Every module attaches to the global CG namespace so the game runs from a
 * plain file:// double-click with no build step and no module loader. */
(function (CG) {
  'use strict';

  /* ---------- deterministic random ---------- */
  function RNG(seed) {
    this.s = (seed >>> 0) || 1;
  }
  RNG.prototype.next = function () {
    var a = (this.s = (this.s + 0x6D2B79F5) | 0);
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range = function (lo, hi) { return lo + this.next() * (hi - lo); };
  RNG.prototype.int = function (n) { return Math.floor(this.next() * n) % n; };
  RNG.prototype.pick = function (arr) { return arr[this.int(arr.length)]; };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  /* Box-Muller, cached second sample. */
  RNG.prototype.gauss = function () {
    if (this._g != null) { var g = this._g; this._g = null; return g; }
    var u = Math.max(1e-9, this.next()), v = this.next();
    var m = Math.sqrt(-2 * Math.log(u));
    this._g = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  };
  RNG.prototype.fork = function () { return new RNG((this.next() * 4294967296) >>> 0); };

  /* ---------- maths ---------- */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function approach(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
  function sq(x) { return x * x; }
  /* Smooth 0..1 response curve used all over the biology. */
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
  function softsat(x) { return x / (1 + Math.abs(x)); }

  /* ---------- ids and names ---------- */
  var idCounter = 1;
  function uid(prefix) { return (prefix || 'x') + (idCounter++) + '-' + Math.floor(Math.random() * 46656).toString(36); }

  var HEAD = ['b', 'br', 'c', 'd', 'f', 'g', 'j', 'k', 'l', 'm', 'n', 'p', 'pl', 'q', 'r', 's', 'sh', 't', 'th', 'tr', 'v', 'w', 'z'];
  var VOW = ['a', 'e', 'i', 'o', 'u', 'ee', 'oo', 'ai', 'ou', 'ey'];
  var TAIL = ['b', 'd', 'ff', 'k', 'l', 'm', 'n', 'p', 'sh', 't', 'x', 'z', 'ble', 'kin', 'let', 'ns'];
  function makeName(rng) {
    var n = rng.pick(HEAD) + rng.pick(VOW);
    if (rng.chance(0.55)) n += rng.pick(TAIL) + rng.pick(VOW);
    n += rng.chance(0.7) ? rng.pick(TAIL) : '';
    n = n.charAt(0).toUpperCase() + n.slice(1);
    return n.length > 9 ? n.slice(0, 9) : n;
  }

  /* ---------- misc ---------- */
  function fmtAge(seconds) {
    var m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    if (m < 60) return m + 'm ' + s + 's';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }
  function shallow(o) { var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }

  CG.RNG = RNG;
  CG.clamp = clamp; CG.clamp01 = clamp01; CG.lerp = lerp; CG.approach = approach;
  CG.sq = sq; CG.sigmoid = sigmoid; CG.softsat = softsat;
  CG.uid = uid; CG.makeName = makeName; CG.fmtAge = fmtAge; CG.shallow = shallow;
})(typeof window !== 'undefined' ? (window.CG = window.CG || {}) : (globalThis.CG = globalThis.CG || {}));
