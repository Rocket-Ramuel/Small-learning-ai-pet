# Sprigs

A small artificial-life game in the spirit of *Creatures* (1996) — the one with
the Norns. You look after a valley of little animals that nobody scripted. They
have a body full of chemicals, a brain that learns from how that body feels, and
a genome that decides how both are wired. You teach them by pointing at things,
praising them, telling them off, and saying words until they work out what the
words mean.

It runs in a browser with no build step and no dependencies. Open `index.html`.

```
git clone <this repo> && cd Small-learning-ai-pet
open index.html          # or: npx serve .
```

`dist/sprigs.html` is the whole game bundled into one file you can email to
someone. Rebuild it with `npm run build`.

## Playing

Four things your hand can do, and a row of words you can say.

| | |
|---|---|
| **Point** | Aims a sprig's attention at something. It does *not* speak for you. |
| **Say** | Tap a word. Whatever the sprig is looking at is what the word gets attached to. |
| **Carry** | Pick things up, sprigs included. Move a cold one to the lamp, or two grown ones together. |
| **Tickle** | Praise. Whatever it was just doing, it will do more of. |
| **Scold** | Discourage. Both work through real chemistry, so they take a few seconds to land. |

Drag the ground to look around; a **Follow** button brings you back to your sprig.

Tapping a sprig points at it — which is how another sprig learns the word
*friend* — and never switches away from the one you are raising. To switch,
either tap a name in the **Looking after** row along the bottom, or press the
**Look after** tag that appears over any sprig you point at. The tag follows the
animal as it walks, so switching never means hitting a moving target.

Pointing and naming are deliberately two separate acts. If pointing spoke for
you, every sprig would only ever learn the words we chose. Instead you can point
at a berry bush, say **water**, and the sprig will believe you — it will think
"water" means the bush, and say it back to you when it is hungry.

Berries and fruiting bushes are food, pools are water, the lamp is warm, the
grotto in the west is cold. The white-flowered herb cures illness. The purple
weeds past the lamp are poisonous, and a sprig has to find that out the hard way.

Sprigs grow through baby, child, adolescent, adult and elder. Two adults who
spend time near each other may lay an egg, and the hatchling's genome is a real
mix of both parents' with mutations of its own.

Everything is saved to your browser automatically. **Inside** opens a panel
showing the selected sprig's chemistry, mind, genes and family.

## How it works

The design goal was *a bit more depth than Norns, no more difficulty for the
player*. All of the complexity below is optional to look at and none of it is
exposed as a control.

### Biochemistry (`src/chemistry.js`)

A sprig's body is 30 chemicals in a soup. Reactions run by mass action against a
snapshot, so no reaction gets first claim on a scarce reactant, and each chemical
decays with its own half-life. Nothing in the creature reads the world directly:

```
world event -> emitter -> chemical -> reaction -> receptor -> drive or body parameter
```

To make a sprig feel hungry you have to raise a chemical, and for it to act on
hunger a receptor has to read that chemical back out. Both are genes.

Some of this falls out rather than being written down. Fat storage is *second
order* in glucose (`glucose + glucose -> fat`), so it only really happens when
glucose is plentiful — a threshold effect from plain mass action, with no
threshold in the code.

### Genetics (`src/genome.js`)

A genome is a flat list of ~126 genes of six kinds: traits, reactions,
half-lives, emitters, receptors and instincts. Genes carry a stable key so two
genomes can be lined up for breeding, and a per-gene mutability so different
parts of the design drift at different speeds.

Breeding is free recombination over that key set, with occasional allele
blending, point mutation, gene duplication, gene loss, and rare rewiring that
points a receptor at a different chemical. A genome that has lost the ability to
turn food into glucose is detected at compile time and the creature hatches
frail — natural selection, made visible.

### Mind (`src/brain.js`)

Two learning systems, both small enough to watch working in the **Inside** panel.

**The decision lobe** maps a *conjunctive* situation vector — every drive crossed
with every visible category, so "hungry AND berry in sight" is a single input —
onto a score for each of eleven actions. Learning is reinforcement with
eligibility traces: acting leaves a fading fingerprint on the weights it used,
and endorphin or cortisol arriving seconds later stamps that fingerprint in or
out. That delay is exactly why praise and scolding work at all.

The trace is the policy gradient of a softmax: credit for the action taken is
scaled by `(1 - its probability)` and every rival is debited by its own. That
factor is what stops a habit running away with itself — once a sprig is already
certain, further praise teaches it nothing, and the pull of the alternatives
keeps it able to change its mind.

**The word lobe** stores each heard word as a running average of the situation it
was heard in — what was in view, what the sprig was doing, what it needed. One
memory serves both directions: hearing a word pushes attention and action, and
having a situation lets the sprig reach for the word. Early on it will get this
charmingly wrong, and the panel will tell you so ("berry — thinks it means
*friend*").

Drives reach the language lobe as departures from each sprig's own long-run
average, not as raw levels, so a sprig that has been lonely for an hour does not
decide that every word means loneliness.

### Body and behaviour (`src/creature.js`)

Attention picks what is *interesting* — near things, things that answer a loud
need, things you just named — with hysteresis, or a sprig re-picks a target sixty
times a second and vibrates between two berries. Intention then picks what is
*useful*: having decided to eat, it looks for something edible. It still has to
learn *when* to eat; only the aiming is innate.

Being in a bad way does not punish a sprig. It makes it **restless**: the worse
things are, the more willing it is to abandon what it is doing and try something
else. Punishing sustained misery would punish eating exactly as much as resting,
since both happen while starving — and an earlier version of this did precisely
that, and produced creatures that sat down and starved to death with food in
plain sight.

## Development

```
npm test              # headless viability: do sprigs survive, learn and breed?
node test/headless.js 3000 7    # 3000 simulated seconds, seed 7
npm run build         # regenerate dist/
```

The headless harness runs the whole simulation with no DOM. It exists because
almost every interesting bug here is a *balance* bug — a rate constant that
starves everyone, a reward that a creature can farm by doing nothing — and those
are invisible until you run a few thousand simulated seconds and count the meals.

| file | |
|---|---|
| `src/util.js` | seeded RNG, maths, names |
| `src/chemistry.js` | the soup and the reaction engine |
| `src/genome.js` | genes, mutation, crossover, compilation |
| `src/brain.js` | decision lobe and word lobe |
| `src/world.js` | the valley, objects, day/night, saving |
| `src/creature.js` | body, drives, actions, life cycle, breeding |
| `src/render.js` | procedural drawing — no art assets |
| `src/ui.js` | panels, tools, teaching, the Inside drawer |
| `src/main.js` | fixed-timestep loop |
