/* Sprigs - the panel of glass between you and the simulation.
 *
 * The rule this file tries to keep: the surface stays as simple as a pet game,
 * and everything complicated is available but folded away behind "Inside". */
(function (CG) {
  'use strict';

  var SAVE_KEY = 'sprigs.save.v1';

  /* Words you can say. Nouns match what a sprig can perceive; verbs match what
   * it can do; feelings match what it can want. Nothing else is teachable,
   * because nothing else exists inside its head. */
  var VOCAB = {
    things: ['berry', 'water', 'ball', 'plant', 'weed', 'herb', 'lamp', 'friend', 'egg', 'hand', 'nest'],
    doings: ['eat', 'drink', 'play', 'sleep', 'come', 'go', 'push', 'rest', 'call', 'love'],
    feelings: ['hungry', 'thirsty', 'tired', 'lonely', 'bored', 'cold', 'hurt', 'ill', 'good', 'no']
  };

  function el(id) { return document.getElementById(id); }

  function UI(game) {
    this.game = game;
    this.tool = 'point';
    this.selected = null;
    this.sciTab = 'chem';
    this.lastHud = 0;
    this.toastT = 0;
    this.journal = [];
    this.build();
  }

  UI.prototype.build = function () {
    var self = this, i;

    /* speed */
    Array.prototype.forEach.call(document.querySelectorAll('.speed button'), function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.speed button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        self.game.speed = Number(b.dataset.speed);
      });
    });

    /* tools */
    Array.prototype.forEach.call(document.querySelectorAll('.tools button'), function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.tools button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        self.tool = b.dataset.tool;
      });
    });

    el('btnScience').addEventListener('click', function () {
      var s = el('science');
      s.hidden = !s.hidden;
      el('btnScience').classList.toggle('on', !s.hidden);
      if (!s.hidden) self.renderScience();
    });
    el('btnCloseSci').addEventListener('click', function () {
      el('science').hidden = true;
      el('btnScience').classList.remove('on');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        self.sciTab = b.dataset.tab;
        self.renderScience();
      });
    });

    el('btnHelp').addEventListener('click', function () { el('help').hidden = false; });
    el('btnCloseHelp').addEventListener('click', function () {
      el('help').hidden = true;
      try { localStorage.setItem('sprigs.seenHelp', '1'); } catch (e) { /* private mode */ }
    });
    el('btnEgg').addEventListener('click', function () { self.game.addEgg(); });
    el('btnReset').addEventListener('click', function () {
      if (!window.confirm('Start again? This valley and everyone in it will be gone.')) return;
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* private mode */ }
      window.location.reload();
    });

    /* words */
    var wrap = el('words');
    ['things', 'doings', 'feelings'].forEach(function (group, gi) {
      if (gi) { var sep = document.createElement('div'); sep.className = 'grp'; wrap.appendChild(sep); }
      VOCAB[group].forEach(function (w) {
        var b = document.createElement('button');
        b.textContent = w;
        b.dataset.word = w;
        b.addEventListener('click', function () { self.say(w); });
        wrap.appendChild(b);
      });
    });

    this.bindCanvas();
    window.addEventListener('keydown', function (e) {
      if (e.key === ' ') { e.preventDefault(); self.togglePause(); }
      var map = { '1': 'point', '2': 'carry', '3': 'tickle', '4': 'scold' };
      if (map[e.key]) {
        document.querySelectorAll('.tools button').forEach(function (x) {
          x.classList.toggle('on', x.dataset.tool === map[e.key]);
        });
        self.tool = map[e.key];
      }
    });
  };

  UI.prototype.togglePause = function () {
    var g = this.game;
    g.speed = g.speed === 0 ? 1 : 0;
    document.querySelectorAll('.speed button').forEach(function (x) {
      x.classList.toggle('on', Number(x.dataset.speed) === g.speed);
    });
  };

  /* ---------- pointer ---------- */
  UI.prototype.bindCanvas = function () {
    var self = this, cv = el('view');
    var dragging = null;    /* an object being carried */
    var panning = null;     /* {px, cam} while the valley is being dragged */
    var lastTap = { t: 0, target: null };

    function worldPos(ev) {
      var r = cv.getBoundingClientRect();
      var px = ev.clientX - r.left, py = ev.clientY - r.top;
      var g = self.game;
      return {
        x: g.renderer.toWorld(px),
        y: g.world.groundY - (g.renderer.groundScreenY() - g.renderer.screenToViewY(py))
      };
    }

    /* Hit testing has to care about height as well as position, or a tap on the
     * open sky lands on whatever bush happens to be below it - which also robs
     * the player of the empty space they need in order to drag the view. */
    function pick(p) {
      var g = self.game, ground = g.world.groundY;
      var best = null, bestD = Infinity;

      function consider(o, halfW, top) {
        var dx = Math.abs(o.x - p.x);
        if (dx > halfW) return;
        /* objects stand on the ground and rise to `top` above it */
        if (p.y > ground + 26 || p.y < ground - top) return;
        if (dx < bestD) { bestD = dx; best = o; }
      }

      g.world.creatures.forEach(function (c) {
        if (c.alive) consider(c, 34 + 26 * c.size, 40 + 70 * c.size);
      });
      if (best) return best;
      g.world.objects.forEach(function (o) {
        if (o.eaten) return;
        consider(o, Math.max(26, o.r), o.kind === 'lamp' ? 96 : Math.max(34, o.r * 1.3));
      });
      return best;
    }

    cv.addEventListener('pointerdown', function (ev) {
      cv.setPointerCapture(ev.pointerId);
      var p = worldPos(ev), hit = pick(p);
      var hand = self.game.world.hand;
      hand.active = true;
      hand.x = p.x;
      hand.y = CG.clamp(p.y, 60, self.game.world.groundY);

      /* Two taps on the same sprig switches to it. One tap only points, so you
       * can show a sprig its friend without changing who you are looking after. */
      var now = performance.now();
      if (hit instanceof CG.Creature && lastTap.target === hit && now - lastTap.t < 420) {
        lastTap.target = null;
        self.select(hit);
        self.toast('Now looking after ' + hit.name + '.');
        return;
      }
      lastTap = { t: now, target: hit };

      if (self.tool === 'carry' && hit) {
        if (hit instanceof CG.Creature) hit.held = true;
        else if (CG.KINDS[hit.kind] && (CG.KINDS[hit.kind].movable || hit.kind === 'berry' || hit.kind === 'egg')) {
          hit.held = true;
        } else { self.toast('The ' + self.labelOf(hit) + ' is rooted to the spot.'); hit = null; }
        if (hit) { dragging = hit; hand.holding = hit; return; }
      }

      if (!hit) {
        /* Empty ground: drag to look around. This is the only way to move the
         * view on a touch screen, where there is no scroll wheel. */
        panning = { px: ev.clientX, cam: self.game.renderer.camX, moved: 0 };
        return;
      }

      if (hit instanceof CG.Creature) {
        if (self.tool === 'tickle') { hit.tickle(); self.toast('You tickled ' + hit.name + '.'); }
        else if (self.tool === 'scold') { hit.scold(); self.toast('You scolded ' + hit.name + '.'); }
        else if (self.tool === 'point') { self.pointAt(hit); }
      } else if (self.tool === 'point') {
        self.pointAt(hit);
      }
    });

    cv.addEventListener('pointermove', function (ev) {
      var g = self.game;
      if (panning) {
        var dx = ev.clientX - panning.px;
        panning.moved = Math.max(panning.moved, Math.abs(dx));
        if (panning.moved > 6) self.freeLook(true);
        g.renderer.camX = self.clampCam(panning.cam - dx / g.renderer.zoom);
        return;
      }
      var p = worldPos(ev), h = g.world.hand;
      h.active = true;
      h.x = CG.clamp(p.x, 0, g.world.w);
      h.y = CG.clamp(p.y, 60, g.world.groundY);
      if (dragging) {
        dragging.x = h.x;
        if (dragging.vx != null) dragging.vx = 0;
      }
    });

    function release() {
      if (dragging) {
        dragging.held = false;
        self.game.world.hand.holding = null;
        dragging = null;
      }
      panning = null;
    }
    cv.addEventListener('pointerleave', function () {
      if (!dragging && !panning) self.game.world.hand.active = false;
    });
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release);

    cv.addEventListener('wheel', function (ev) {
      self.freeLook(true);
      self.game.renderer.camX = self.clampCam(self.game.renderer.camX +
        (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY));
      ev.preventDefault();
    }, { passive: false });

    el('btnFollow').addEventListener('click', function () {
      self.freeLook(false);
      if (self.selected) self.toast('Following ' + self.selected.name + ' again.');
    });
  };

  UI.prototype.clampCam = function (x) {
    var r = this.game.renderer, half = r.vw / 2;
    return CG.clamp(x, half, Math.max(half, this.game.world.w - half));
  };

  /* Free look: the camera stops chasing the selected sprig until the player
   * asks it to resume. A button says so, so nobody loses their sprig. */
  UI.prototype.freeLook = function (on) {
    this.game.followSelected = !on;
    var b = el('btnFollow');
    b.hidden = !on || !this.selected;
    if (on && this.selected) b.textContent = '⤺ Follow ' + this.selected.name;
  };

  UI.prototype.labelOf = function (o) {
    if (o instanceof CG.Creature) return o.name;
    return (CG.KINDS[o.kind] && CG.KINDS[o.kind].label) || o.kind;
  };

  /* Pointing aims a sprig's attention and nothing more. It deliberately does
   * NOT say the thing's name: if pointing spoke for you, you could only ever
   * teach a sprig the words we chose, and never teach it that "water" means
   * the berry bush. Point, then say whatever you like. */
  UI.prototype.pointAt = function (obj) {
    var c = this.selected;
    if (!c || !c.alive) { this.toast('No sprig is listening.'); return; }
    if (obj === c) {
      this.toast('That is ' + c.name + '. Point at another sprig to teach “friend”.');
      return;
    }
    c.focus = obj;
    c.focusDist = Math.abs(obj.x - c.x);
    c.soup.add('curiosity', 0.25);
    /* Hold that thing at the front of its mind for a few seconds, so whatever
     * you say next attaches to this and not to everything else in view. */
    c.pointedAt = { ci: CG.CATS.indexOf(obj.cat), t: 5 };
    this.game.world.spawnEvent('spark', obj.x, this.game.world.groundY - 40);

    var label = this.labelOf(obj);
    this.suggestWord(CG.CAT_LABEL[obj.cat]);
    this.toast(c.name + ' is looking at ' + (obj instanceof CG.Creature ? label : 'the ' + label) +
      ' — now say a word.');
  };

  /* A gentle nudge toward the usual name, without ever insisting on it. */
  UI.prototype.suggestWord = function (word) {
    clearTimeout(this._suggestT);
    Array.prototype.forEach.call(document.querySelectorAll('#words button'), function (b) {
      b.classList.toggle('suggested', b.dataset.word === word);
    });
    if (!word) return;
    /* Scroll the word strip only. scrollIntoView would walk up to the document
     * and shunt the whole page sideways - an overflow:hidden root still scrolls
     * when script asks it to. */
    var chip = document.querySelector('#words button[data-word="' + word + '"]');
    var strip = el('words');
    if (chip && strip) {
      strip.scrollLeft = chip.offsetLeft - strip.clientWidth / 2 + chip.offsetWidth / 2;
    }
    this._suggestT = setTimeout(function () {
      Array.prototype.forEach.call(document.querySelectorAll('#words button'), function (b) {
        b.classList.remove('suggested');
      });
    }, 6000);
  };

  /* Saying a word aloud. Whoever is close enough hears it in whatever situation
   * they happen to be in - which is exactly how the misunderstandings happen. */
  UI.prototype.say = function (word) {
    var hand = this.game.world.hand, heard = 0, self = this;
    this.game.world.creatures.forEach(function (c) {
      if (!c.alive || c.asleep) return;
      var d = Math.abs(c.x - hand.x);
      if (c === self.selected || d < 320) {
        self.sayTo(c, word, c === self.selected ? 0.85 : 0.5);
        heard++;
      }
    });
    this.game.world.spawnEvent('call', hand.x, hand.y);
    this.suggestWord(null);
    var c = this.selected;
    if (!heard) { this.toast('Nobody was near enough to hear.'); return; }
    if (c && c.pointedAt && c.pointedAt.t > 0) {
      this.toast('“' + word + '” — while ' + c.name + ' looks at the ' +
        (CG.CAT_LABEL[CG.CATS[c.pointedAt.ci]] || 'thing') + '.');
    } else {
      this.toast('You said “' + word + '”.');
    }
  };

  UI.prototype.sayTo = function (c, word, attention) {
    c.hear(word, attention);
    this.refreshWordMarks();
  };

  UI.prototype.select = function (c) {
    this.selected = c;
    this.freeLook(false);
    this.refreshRoster();
    this.refreshWordMarks();
  };

  UI.prototype.toast = function (msg) {
    var t = el('toast');
    t.textContent = msg;
    t.hidden = false;
    this.toastT = 2.6;
  };

  UI.prototype.logLine = function (msg) {
    this.journal.push({ msg: msg, t: 5.5 });
    if (this.journal.length > 5) this.journal.shift();
    this.renderJournal();
  };

  UI.prototype.renderJournal = function () {
    var wrap = el('journal');
    wrap.innerHTML = '';
    this.journal.forEach(function (j) {
      var d = document.createElement('div');
      d.textContent = j.msg;
      d.style.opacity = CG.clamp01(j.t / 1.4);
      wrap.appendChild(d);
    });
  };

  /* ---------- per-frame chrome ---------- */
  UI.prototype.tick = function (dt) {
    var i;
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) el('toast').hidden = true;
    }
    var dirty = false;
    for (i = this.journal.length - 1; i >= 0; i--) {
      this.journal[i].t -= dt;
      if (this.journal[i].t <= 0) { this.journal.splice(i, 1); dirty = true; }
      else if (this.journal[i].t < 1.4) dirty = true;
    }
    if (dirty) this.renderJournal();

    this.lastHud += dt;
    if (this.lastHud < 0.14) return;
    this.lastHud = 0;
    this.refreshHud();
    if (!el('science').hidden) this.renderScience();
  };

  var NEED_COLOUR = {
    hunger: '#ffb26b', thirst: '#7ec8ff', fatigue: '#b7a4ff', lonely: '#ff9ec4',
    bored: '#c9d06b', cold: '#8fd8ff', hot: '#ff8f7a', pain: '#ff7a7a',
    fear: '#d0a0ff', sexdrive: '#ff9ad2', sick: '#9ee0a8'
  };

  UI.prototype.refreshHud = function () {
    var g = this.game, w = g.world;
    el('dayLabel').textContent = 'Day ' + w.dayCount() + (w.nightFactor() > 0.55 ? ' · night' : '');
    var alive = w.living().length;
    el('popLabel').textContent = alive + (alive === 1 ? ' sprig' : ' sprigs');

    var c = this.selected;
    if (!c) { this.refreshRoster(); return; }

    el('cName').textContent = c.name;
    el('cStage').textContent = c.alive ? c.stage : 'died';
    el('cSex').textContent = c.sex === 'f' ? 'she' : 'he';
    el('cStatus').textContent = c.describeState();

    var vocab = Object.keys(c.brain.words)
      .sort(function (a, b) { return c.brain.wordStrength(b) - c.brain.wordStrength(a); })
      .slice(0, 6);
    el('cVocab').textContent = vocab.length
      ? 'knows: ' + vocab.join(', ')
      : 'has not learned any words yet';

    /* Only the needs that are actually pressing, plus health. Showing eleven
     * bars at all times would be honest and useless. */
    var needs = [];
    for (var i = 0; i < CG.DRIVES.length; i++) {
      if (c.drives[i] > 0.12) needs.push({ k: CG.DRIVES[i], v: c.drives[i] });
    }
    needs.sort(function (a, b) { return b.v - a.v; });
    needs = needs.slice(0, 5);
    needs.unshift({ k: 'health', v: c.health, good: true });

    var html = '';
    needs.forEach(function (n) {
      var col = n.good ? (n.v > 0.5 ? '#7fd1a6' : '#ff8f7a') : (NEED_COLOUR[n.k] || '#aaa');
      var label = n.good ? 'health' : CG.DRIVE_LABEL[n.k].toLowerCase();
      html += '<div class="need"><i>' + label + '</i><div class="bar"><em style="width:' +
        (n.v * 100).toFixed(0) + '%;background:' + col + '"></em></div></div>';
    });
    el('needs').innerHTML = html;

    var pc = el('portrait');
    CG.drawPortrait(pc.getContext('2d'), c, pc.width, pc.height);
    this.refreshRoster();
  };

  UI.prototype.refreshRoster = function () {
    var self = this, list = el('rosterList'), w = this.game.world;
    var sig = w.creatures.map(function (c) { return c.id + (c.alive ? '1' : '0'); }).join(',') +
      '|' + (this.selected ? this.selected.id : '');
    if (sig === this._rosterSig) return;
    this._rosterSig = sig;
    list.innerHTML = '';
    w.creatures.slice(-8).forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'chip' + (c === self.selected ? ' on' : '') + (c.alive ? '' : ' dead');
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = 'hsl(' + c.C.traits.hue + ',' + (c.C.traits.sat * 100) + '%,' +
        (c.C.traits.light * 100) + '%)';
      b.appendChild(dot);
      b.appendChild(document.createTextNode(c.name));
      b.addEventListener('click', function () { self.select(c); });
      list.appendChild(b);
    });
  };

  UI.prototype.refreshWordMarks = function () {
    var c = this.selected;
    Array.prototype.forEach.call(document.querySelectorAll('#words button'), function (b) {
      var s = c ? c.brain.wordStrength(b.dataset.word) : 0;
      b.classList.toggle('known', s > 0.05);
      b.style.setProperty('--know', s.toFixed(2));
    });
  };

  /* ---------- the Inside drawer ---------- */
  UI.prototype.renderScience = function () {
    var c = this.selected, body = el('sciBody');
    if (!c) { body.innerHTML = '<p class="note">Select a sprig first.</p>'; return; }
    if (this.sciTab === 'chem') body.innerHTML = this.chemHtml(c);
    else if (this.sciTab === 'brain') body.innerHTML = this.brainHtml(c);
    else if (this.sciTab === 'genes') body.innerHTML = this.genesHtml(c);
    else body.innerHTML = this.familyHtml(c);
  };

  function bar(label, v, colour, valueText) {
    return '<div class="crow"><span>' + label + '</span><div class="bar"><em style="width:' +
      (CG.clamp01(v) * 100).toFixed(0) + '%;background:' + colour + '"></em></div><b>' +
      (valueText != null ? valueText : v.toFixed(2)) + '</b></div>';
  }

  UI.prototype.chemHtml = function (c) {
    var h = '<p class="note">Everything ' + c.name + ' feels is one of these numbers. ' +
      'Food and praise push them up; time and reactions pull them down.</p>';
    CG.CHEM_GROUPS.forEach(function (grp) {
      h += '<h4>' + grp.name + '</h4>';
      grp.chems.forEach(function (name) {
        var v = c.soup.get(name);
        if (v < 0.005 && grp.name === 'Health') return;
        h += bar(name, v, v > 0.66 ? '#ffcf7a' : '#7fd1a6');
      });
    });
    h += '<h4>Body</h4>';
    h += bar('health', c.health, c.health > 0.5 ? '#7fd1a6' : '#ff8f7a');
    h += bar('age', CG.clamp01(c.age / c.lifespan), '#9fb4ff',
      CG.fmtAge(c.age) + ' / ' + CG.fmtAge(c.lifespan));
    h += bar('warmth', CG.clamp01(0.5 - (c.temp || 0) / 2), '#8fd8ff');
    h += bar('feeling', CG.clamp01(0.5 + (c.lastReward || 0) * 2),
      (c.lastReward || 0) >= 0 ? '#7fd1a6' : '#ff8f7a', (c.lastReward || 0).toFixed(3));
    return h;
  };

  UI.prototype.brainHtml = function (c) {
    var D = CG.BRAIN_DIMS, W = c.brain.W, nA = D.nA, nC = D.nC, i, j;
    var h = '<p class="note">What ' + c.name + ' has worked out so far. Each row is a ' +
      'situation; the action shown is the one it now reaches for, and the bar is how ' +
      'sure it is. Praise and scolding move these.</p><h4>When it is…</h4>';

    /* strongest learned pairing for each drive-and-thing combination */
    var rows = [];
    for (i = 0; i < CG.DRIVES.length; i++) {
      for (j = 0; j < nC; j++) {
        var base = (D.OFF_X + i * nC + j) * nA, bestA = 0, bestV = -Infinity, tot = 0;
        for (var a = 0; a < nA; a++) {
          var v = W[base + a];
          tot += Math.abs(v);
          if (v > bestV) { bestV = v; bestA = a; }
        }
        if (bestV > 0.35) {
          rows.push({ text: CG.DRIVE_LABEL[CG.DRIVES[i]].toLowerCase() + ' + ' + CG.CAT_LABEL[CG.CATS[j]],
            act: CG.ACTIONS[bestA], v: bestV });
        }
      }
    }
    rows.sort(function (x, y) { return y.v - x.v; });
    if (!rows.length) h += '<p class="note">Nothing firm yet — it is still all instinct and guesswork.</p>';
    rows.slice(0, 14).forEach(function (r) {
      h += bar(r.text, CG.clamp01(r.v / 4), '#7fd1a6', r.act);
    });

    h += '<h4>Words</h4>';
    var words = Object.keys(c.brain.words);
    if (!words.length) h += '<p class="note">' + c.name + ' has not heard a word yet.</p>';
    words.sort(function (a, b) { return c.brain.wordStrength(b) - c.brain.wordStrength(a); });
    words.forEach(function (w) {
      var meaning = c.brain.wordMeaning(w);
      h += '<div class="wordrow"><b>' + w + '</b><span>' +
        (meaning ? 'thinks it means “' + meaning + '”' : 'no idea yet') +
        ' · heard ' + c.brain.words[w].heard + '×</span></div>';
    });

    h += '<h4>Right now</h4>';
    h += '<p class="note">restlessness ' + ((c.misery || 0)).toFixed(2) +
      ' · curiosity ' + (c.brain.explore).toFixed(2) +
      ' · learning ' + (c.brain.learnRate).toFixed(2) + '</p>';
    return h;
  };

  UI.prototype.genesHtml = function (c) {
    var g = c.genome, T = c.C.traits;
    var h = '<p class="note">Generation ' + (g.gen || 1) + ' · ' + g.genes.length +
      ' genes · <b>' + CG.genome.describe(g) + '</b></p><h4>Traits</h4><div class="genelist">';
    var shown = ['bodySize', 'lifespan', 'metabolism', 'appetite', 'learnRate', 'curiosity',
      'boldness', 'sociability', 'patience', 'immunity', 'fertility', 'tempers', 'mutability'];
    shown.forEach(function (k) {
      var d = CG.TRAITS[k];
      h += '<div class="gene"><b>' + k + '</b><span>' +
        (k === 'lifespan' ? CG.fmtAge(T[k]) : T[k].toFixed(2)) +
        ' <em style="opacity:.55">(typical ' + (k === 'lifespan' ? CG.fmtAge(d[2]) : d[2].toFixed(2)) +
        ')</em></span></div>';
    });
    h += '</div><h4>Biochemistry</h4><div class="genelist">';
    c.C.reactions.slice(0, 24).forEach(function (r) {
      var lhs = CG.CHEMS[r.a] + (r.b >= 0 ? ' + ' + CG.CHEMS[r.b] : '');
      var rhs = r.out.length ? r.out.map(function (o) { return CG.CHEMS[o[0]]; }).join(' + ') : 'nothing';
      h += '<div class="gene"><b>' + (r.k || '').replace('rx:', '') + '</b><span>' +
        lhs + ' → ' + rhs + ' <em style="opacity:.55">(rate ' + r.rate.toFixed(3) + ')</em></span></div>';
    });
    h += '</div><h4>Wiring</h4><div class="genelist">';
    c.C.receptors.slice(0, 22).forEach(function (r) {
      h += '<div class="gene"><b>' + CG.CHEMS[r.chem] + '</b><span>' +
        (r.gain < 0 ? 'lowers ' : 'raises ') + r.tgt.replace(':', ' ') +
        ' <em style="opacity:.55">(×' + Math.abs(r.gain).toFixed(2) + ')</em></span></div>';
    });
    h += '</div>';
    if (c.C.lethal) h += '<p class="note" style="color:#ff8f7a">Genetic fault: ' + c.C.lethal + '.</p>';
    return h;
  };

  UI.prototype.familyHtml = function (c) {
    var w = this.game.world;
    var h = '<h4>' + c.name + '</h4><p class="note">' +
      (c.genome.mumId ? 'Born to a pairing in this valley.' : 'Hatched from a fresh genome.') +
      ' Generation ' + (c.genome.gen || 1) + '.</p>';
    h += '<h4>A life so far</h4>';
    h += bar('meals', CG.clamp01(c.stats.eaten / 60), '#ffb26b', String(c.stats.eaten));
    h += bar('drinks', CG.clamp01(c.stats.drunk / 90), '#7ec8ff', c.stats.drunk.toFixed(0) + 's');
    h += bar('play', CG.clamp01(c.stats.played / 90), '#c9d06b', c.stats.played.toFixed(0) + 's');
    h += bar('praised', CG.clamp01(c.stats.tickles / 20), '#7fd1a6', String(c.stats.tickles));
    h += bar('scolded', CG.clamp01(c.stats.scolds / 20), '#ff8f7a', String(c.stats.scolds));
    h += bar('words heard', CG.clamp01(c.brain.wordCount / 12), '#9fb4ff', String(c.brain.wordCount));
    h += bar('offspring', CG.clamp01(c.stats.children / 6), '#ff9ec4', String(c.stats.children));

    h += '<h4>The valley</h4><p class="note">' +
      w.stats.born + ' hatched · ' + w.stats.died + ' died · ' +
      'generation ' + w.stats.generations + ' reached.</p>';

    h += '<h4>Journal</h4><div class="genelist">';
    (w.journal || []).slice(-14).reverse().forEach(function (j) {
      h += '<div class="gene"><b>day ' + (Math.floor(j.t / CG.DAY_LENGTH) + 1) + '</b><span>' + j.msg + '</span></div>';
    });
    h += '</div>';
    return h;
  };

  /* ---------- persistence ---------- */
  UI.prototype.save = function () {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.world.toJSON()));
      return true;
    } catch (e) { return false; }
  };
  UI.loadSaved = function () {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };

  CG.UI = UI;
  CG.VOCAB = VOCAB;
})(typeof window !== 'undefined' ? (window.CG = window.CG || {}) : (globalThis.CG = globalThis.CG || {}));
