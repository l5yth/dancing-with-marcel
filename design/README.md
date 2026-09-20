<!--
SPDX-FileCopyrightText: 2026 Afri Blanck (@l5yth)
SPDX-License-Identifier: Apache-2.0
-->

# Sprite art

The art comes from the owner's design project **ASCII punk dance sprites**,
`claude.ai/design/p/fa69fed7-ee3f-41ec-8774-a44cd3a96513`.

`gen.js` is that project's generator, byte for byte. It is not this project's
code and carries no header; it is the body of a function, not a module.

## Regenerate

```
node design/render.mjs
```

Writes `src/sprites/`. Nothing else reads `design/`, and the page never
loads it.

## The one repair

`gen.js` renders the cigarette with `{ tone: 0.12, shin: 0.1, spec: 6 }`. That
material has no `alb` and is not marked `flat`, so `shade()` computes
`undefined * number`, the tone becomes `NaN`, and the ramp lookup returns
`undefined`. Ten rows of `smoke_drag` and `smoke_exhale` carry the literal text
`undefined` in the design project's own exports.

`render.mjs` repairs it at load time, as a visible one-line replacement: a
material that has a `tone` but no `alb` is treated as flat. The repair changes
only those two frames; the other 30 render byte for byte as the design project
has them.

Fixing this upstream, in the design project, would make the repair unnecessary.
