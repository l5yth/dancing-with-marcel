/*
   Copyright (C) 2026 Afri Blanck (@l5yth)

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

/* ASCII punk sprite generator: the source of src/sprites/ (SPEC D10).

   It draws a lightness map. A cell's value is how much light reaches the eye
   there, so the ramp runs from blank for black to '$' for the brightest mark,
   and the sheet is painted white on black exactly as it is computed.

   NOTE: this file is the BODY of a function — it ends with `return {...}`.
   Load with:  const GEN = new Function(await readFile('gen.js'))();
   Run design/render.mjs after changing it; a test compares the two. */

/* Grid is sized for Courier/monospace at line-height 0.88em: a character cell is
   0.60em wide and 0.88em tall, i.e. aspect 0.682. */
const COLS = 168, ROWS = 128;
const CELL_H = 2.12 / ROWS;
const CELL_W = CELL_H * 0.682;
const X0 = -COLS * CELL_W / 2;
const Y_TOP = 2.09;
const SS = 3;                       // supersamples per axis
const GAMMA = 0.95;
const CONTRAST = 1.16;

const RAMP = [' ','.',"'",'`','^','"',',',':',';','I','l','!','i','>','<','~','+','_','-','?',
              ']','[','}','{','1',')','(','|','\\','/','t','f','j','r','x','n','u','v','c','z',
              'X','Y','U','J','C','L','Q','0','O','Z','m','w','q','p','d','b','k','h','a','o',
              '*','#','M','W','&','8','%','B','@','$'];

const D2R = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const up = d => [Math.sin(d * D2R), Math.cos(d * D2R)];
const rot = (v, d) => { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [v[0]*c - v[1]*s, v[0]*s + v[1]*c]; };
const add = (a, b) => [a[0]+b[0], a[1]+b[1]];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1]];
const mul = (a, s) => [a[0]*s, a[1]*s];
const len = a => Math.hypot(a[0], a[1]);
const nrm = a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0]/l, a[1]/l]; };
const lerpP = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];

/* ---- lighting -------------------------------------------------------- */
const n3 = v => { const l = Math.hypot(v[0],v[1],v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };
const LIGHT = n3([-0.44, 0.62, 0.65]);
const HALF  = n3([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
const RIM   = n3([0.88, -0.10, -0.32]);   // back-right stage rim, separates black on black
const RIM2  = n3([-0.86, -0.14, -0.34]);  // weaker back-left fill rim

/* materials are albedo (surface lightness 0..1) + specular strength / tightness */
const AMB = 0.42, DIF = 0.58;
const MAT = {
  skin:     { alb:0.74, shin:0.26, spec:18, rim:0.22 },
  skinDark: { alb:0.55, shin:0.20, spec:18, rim:0.18 },
  hair:     { alb:0.95, shin:0.40, spec:12, rim:0.10 },
  leather:  { alb:0.11, shin:0.30, spec:26, rim:0.40 },
  leatherHi:{ alb:0.15, shin:0.40, spec:30, rim:0.44 },
  tee:      { alb:0.88, shin:0.14, spec:8,  rim:0.16 },
  jeans:    { alb:0.15, shin:0.22, spec:24, rim:0.36 },
  boot:     { alb:0.08, shin:0.34, spec:28, rim:0.38 },
  belt:     { alb:0.09, shin:0.45, spec:20, rim:0.42 },
  metal:    { alb:0.70, shin:1.00, spec:48, rim:0.30 },
  mic:      { alb:0.18, shin:0.60, spec:22, rim:0.45 },
  glass:    { alb:0.46, shin:1.00, spec:38, rim:0.40 },
  pint:     { alb:0.14, shin:1.00, spec:44, rim:0.52 },
  beer:     { tone:0.55, flat:true },
  foam:     { tone:0.05, flat:true },
  seam:     { tone:0.97, flat:true },
  plastic:  { alb:0.55, shin:0.45, spec:18, rim:0.25 },
  ink:      { tone:0.97, flat:true },
  ink2:     { tone:0.72, flat:true },
  glow:     { tone:0.09, flat:true },
};

function shade(hit, mat) {
  /* Flat materials are given as ink: `ink` 0.97 is the blackest thing he has.
     Reading them as light keeps one scale for the whole sheet. */
  if (mat.flat) return 1 - mat.tone;
  const n = hit.n;
  const nd = Math.max(0, n[0]*LIGHT[0] + n[1]*LIGHT[1] + n[2]*LIGHT[2]);
  const nh = Math.max(0, n[0]*HALF[0] + n[1]*HALF[1] + n[2]*HALF[2]);
  const sp = Math.pow(nh, mat.spec) * (mat.shin || 0);
  const nr = Math.max(0, n[0]*RIM[0] + n[1]*RIM[1] + n[2]*RIM[2]);
  const nr2 = Math.max(0, n[0]*RIM2[0] + n[1]*RIM2[1] + n[2]*RIM2[2]);
  const rm = (Math.pow(nr, 1.6) + Math.pow(nr2, 1.8) * 0.62) * (mat.rim || 0);
  return clamp(mat.alb * (AMB + DIF * nd) + sp * 0.85 + rm, 0, 1);
}

/* ---- primitives ------------------------------------------------------ */
function capsule(p0, p1, r0, r1, mat, o) {
  o = o || {};
  const ax = sub(p1, p0), L2 = ax[0]*ax[0] + ax[1]*ax[1];
  const rm = Math.max(r0, r1);
  return {
    mat,
    bbox: [Math.min(p0[0],p1[0])-rm, Math.min(p0[1],p1[1])-rm, Math.max(p0[0],p1[0])+rm, Math.max(p0[1],p1[1])+rm],
    test(p) {
      let t = L2 > 1e-9 ? ((p[0]-p0[0])*ax[0] + (p[1]-p0[1])*ax[1]) / L2 : 0;
      t = clamp(t, 0, 1);
      const cx = p0[0]+ax[0]*t, cy = p0[1]+ax[1]*t;
      const dx = p[0]-cx, dy = p[1]-cy, d = Math.hypot(dx, dy);
      const r = r0 + (r1-r0)*t;
      if (d > r) return null;
      const s = r > 1e-9 ? d / r : 0;
      const px = d > 1e-9 ? dx/d : 1, py = d > 1e-9 ? dy/d : 0;
      return { n: [px*s, py*s, Math.sqrt(Math.max(0, 1-s*s))], din: r - d };
    }
  };
}

function ell(c, rx, ry, rotDeg, mat, o) {
  o = o || {};
  const ct = Math.cos(rotDeg*D2R), st = Math.sin(rotDeg*D2R);
  const R = Math.max(rx, ry);
  return {
    mat, soft: !!o.soft,
    bbox: [c[0]-R, c[1]-R, c[0]+R, c[1]+R],
    test(p) {
      const dx = p[0]-c[0], dy = p[1]-c[1];
      const lx = dx*ct + dy*st, ly = -dx*st + dy*ct;
      const u = lx/rx, v = ly/ry, q = u*u + v*v;
      if (q > 1) return null;
      const nx = u*ct - v*st, ny = u*st + v*ct;
      return { n: [nx, ny, Math.sqrt(Math.max(0, 1-q))], din: (1-Math.sqrt(q))*Math.min(rx,ry), q };
    }
  };
}

function poly(pts, mat, o) {
  o = o || {};
  const bulge = o.bulge != null ? o.bulge : 0.055;
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const p of pts) { a = Math.min(a,p[0]); c = Math.max(c,p[0]); b = Math.min(b,p[1]); d = Math.max(d,p[1]); }
  return {
    mat,
    bbox: [a, b, c, d],
    test(p) {
      let inside = false, best = 1e9, bn = [0,1];
      for (let i = 0, j = pts.length-1; i < pts.length; j = i++) {
        const P = pts[j], Q = pts[i];
        if (((Q[1] > p[1]) !== (P[1] > p[1])) &&
            (p[0] < (P[0]-Q[0]) * (p[1]-Q[1]) / (P[1]-Q[1]) + Q[0])) inside = !inside;
        const ex = P[0]-Q[0], ey = P[1]-Q[1], L2 = ex*ex + ey*ey || 1e-9;
        let t = clamp(((p[0]-Q[0])*ex + (p[1]-Q[1])*ey) / L2, 0, 1);
        const dx = p[0]-(Q[0]+ex*t), dy = p[1]-(Q[1]+ey*t), dd = Math.hypot(dx, dy);
        if (dd < best) { best = dd; bn = [dx, dy]; }
      }
      if (!inside) return null;
      const k = clamp(1 - best / bulge, 0, 1);
      const l = Math.hypot(bn[0], bn[1]) || 1;
      return { n: [-bn[0]/l*k, -bn[1]/l*k, Math.sqrt(Math.max(0.04, 1-k*k))], din: best };
    }
  };
}

/* merge overlapping parts into one shell so only the outer silhouette gets inked */
function uni(parts, mat, o) {
  o = o || {};
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const p of parts) { a = Math.min(a, p.bbox[0]); b = Math.min(b, p.bbox[1]); c = Math.max(c, p.bbox[2]); d = Math.max(d, p.bbox[3]); }
  return {
    mat: mat || parts[0].mat, bbox: [a, b, c, d],
    test(p) {
      let best = null;
      for (const q of parts) {
        const bb = q.bbox;
        if (p[0] < bb[0] || p[0] > bb[2] || p[1] < bb[1] || p[1] > bb[3]) continue;
        const h = q.test(p);
        if (h && (!best || h.din > best.din)) best = h;
      }
      return best;
    }
  };
}

const softBlob = (c, rx, ry, tone, rotDeg) => {
  const e = ell(c, rx, ry, rotDeg || 0, { tone, flat: true }, { soft: true });
  e.softTone = tone; return e;
};

/* ---- inverse kinematics ---------------------------------------------- */
function ik(root, target, l1, l2, flip) {
  let d = sub(target, root), dist = len(d);
  const maxd = (l1 + l2) * 0.999;
  if (dist > maxd) { d = mul(nrm(d), maxd); dist = maxd; target = add(root, d); }
  if (dist < 1e-4) dist = 1e-4;
  const a = (l1*l1 - l2*l2 + dist*dist) / (2*dist);
  const h = Math.sqrt(Math.max(0, l1*l1 - a*a));
  const u = [d[0]/dist, d[1]/dist], pp = [-u[1], u[0]];
  return { joint: [root[0]+u[0]*a + pp[0]*h*flip, root[1]+u[1]*a + pp[1]*h*flip], end: target };
}

/* ---- skeleton -------------------------------------------------------- */
const FEMUR = 0.400, TIBIA = 0.380, HUMER = 0.330, FOREA = 0.260, TORSO = 0.58;

function skeleton(P) {
  const hip = [P.hipX, P.hipY];
  const sd = up(P.lean);
  const perp = [sd[1], -sd[0]];
  const chest = add(hip, mul(sd, TORSO));
  const shR = add(add(chest, mul(perp,  P.shW + (P.shSkew||0))), mul(sd, P.shDrop || 0));
  const shL = add(add(chest, mul(perp, -P.shW + (P.shSkew||0))), mul(sd, P.shDrop || 0));
  const hipR = add(hip, mul(perp,  0.088));
  const hipL = add(hip, mul(perp, -0.088));
  const neck = add(chest, mul(sd, 0.050));
  const hd = up(P.lean + P.headTilt);
  const headC = add(neck, mul(hd, 0.150));

  const kR = P.kneeR ? { joint: P.kneeR, end: P.ftR } : ik(hipR, P.ftR, FEMUR, TIBIA, P.kflipR || 1);
  const kL = P.kneeL ? { joint: P.kneeL, end: P.ftL } : ik(hipL, P.ftL, FEMUR, TIBIA, P.kflipL || 1);
  const tR = P.rR ? [shR[0] + P.rR[0], shR[1] + P.rR[1]] : P.hR;
  const tL = P.rL ? [shL[0] + P.rL[0], shL[1] + P.rL[1]] : P.hL;
  const aR = P.elbR ? { joint: P.elbR, end: tR } : ik(shR, tR, HUMER, FOREA, P.aflipR != null ? P.aflipR : 1);
  const aL = P.elbL ? { joint: P.elbL, end: tL } : ik(shL, tL, HUMER, FOREA, P.aflipL != null ? P.aflipL : -1);

  return { hip, sd, perp, chest, shL, shR, hipL, hipR, neck, hd, headC,
           kneeR: kR.joint, ankR: kR.end, kneeL: kL.joint, ankL: kL.end,
           elbR: aR.joint, wriR: aR.end, elbL: aL.joint, wriL: aL.end };
}

/* ---- body pieces ----------------------------------------------------- */
function legParts(S, side, P) {
  const hipJ = side === 'R' ? S.hipR : S.hipL;
  const knee = side === 'R' ? S.kneeR : S.kneeL;
  const ank  = side === 'R' ? S.ankR  : S.ankL;
  const near = side === P.frontLeg;
  const k = near ? 1 : 0.9;                       // far limb reads thinner
  const o = [];
  o.push(capsule(hipJ, knee, 0.092*k, 0.072*k, MAT.jeans));
  o.push(capsule(knee, ank, 0.072*k, 0.052*k, MAT.jeans));
  const toeA = (side === 'R' ? (P.toeR||0) : (P.toeL||0));
  const low = [ank[0], ank[1]-0.042];
  const fwd = rot([1, 0], toeA);
  const toe = add(low, mul(fwd, 0.128*k));
  const heel = add(low, mul(fwd, -0.048*k));
  const calfD = nrm(sub(knee, ank));
  o.push(uni([capsule(ank, add(ank, mul(calfD, 0.140)), 0.084*k, 0.076*k, MAT.boot),
              capsule(heel, toe, 0.058*k, 0.044*k, MAT.boot)], MAT.boot));
  o.push(capsule(add(low, mul(fwd, -0.042)), add(low, mul(fwd, 0.120)), 0.022, 0.017, MAT.ink2)); // sole line
  return o;
}

function armParts(S, side, P) {
  const sh  = side === 'R' ? S.shR  : S.shL;
  const elb = side === 'R' ? S.elbR : S.elbL;
  const wri = side === 'R' ? S.wriR : S.wriL;
  const near = side === P.frontArm;
  const k = near ? 1 : 0.9;
  const o = [];
  o.push(capsule(sh, elb, 0.090*k, 0.070*k, MAT.leather));
  const cuff = lerpP(elb, wri, 0.42);
  o.push(capsule(elb, cuff, 0.072*k, 0.060*k, MAT.leather));
  const fd = nrm(sub(wri, elb));
  const fistStyle = (side === 'R' ? P.fistR : P.fistL) || 'fist';
  const hand = fistStyle === 'fist' ? ell(add(wri, mul(fd, 0.038)), 0.050*k, 0.046*k, 0, MAT.skin)
             : fistStyle === 'open' ? ell(add(wri, mul(fd, 0.050)), 0.042*k, 0.060*k, Math.atan2(fd[1], fd[0])*180/Math.PI - 90, MAT.skin)
             : ell(add(wri, mul(fd, 0.034)), 0.044*k, 0.042*k, 0, MAT.skin);
  o.push(uni([capsule(lerpP(elb, wri, 0.34), wri, 0.050*k, 0.040*k, MAT.skin), hand], MAT.skin));
  if (fistStyle === 'fist') o.push(capsule(add(wri, mul(fd, 0.055)), add(wri, mul(fd, 0.070)), 0.032, 0.028, MAT.skinDark));
  return o;
}

function torsoParts(S, P) {
  const o = [];
  const sd = S.sd, pp = S.perp;
  const outL = add(add(S.shL, mul(pp, -0.032)), mul(sd, 0.052)), outR = add(add(S.shR, mul(pp, 0.032)), mul(sd, 0.052));
  const wL = add(add(S.hipL, mul(pp, -0.012)), mul(sd, 0.03));
  const wR = add(add(S.hipR, mul(pp,  0.012)), mul(sd, 0.03));

  // bare chest / torn tee behind the open jacket
  const ch = add(S.chest, mul(sd, -0.085));
  o.push(ell(ch, 0.100, 0.175, Math.atan2(sd[0], sd[1]) * -180/Math.PI, MAT.skin));
  o.push(ell(add(add(ch, mul(pp, 0.046)), mul(sd, 0.078)), 0.044, 0.030, 0, MAT.skinDark));
  o.push(ell(add(add(ch, mul(pp,-0.046)), mul(sd, 0.078)), 0.044, 0.030, 0, MAT.skinDark));
  o.push(capsule(add(ch, mul(sd, 0.05)), add(ch, mul(sd, -0.09)), 0.007, 0.006, MAT.ink2));
  o.push(poly([add(add(ch, mul(pp,-0.082)), mul(sd,-0.10)), add(add(ch, mul(pp, 0.082)), mul(sd,-0.12)),
               add(add(ch, mul(pp, 0.090)), mul(sd,-0.26)), add(add(ch, mul(pp,-0.090)), mul(sd,-0.26))],
              MAT.tee, { bulge: 0.045 }));

  // jacket panels, open in a V
  const innerTopL = add(add(S.neck, mul(pp, -0.030)), mul(sd, 0.010));
  const innerTopR = add(add(S.neck, mul(pp,  0.030)), mul(sd, 0.010));
  const innerLowL = add(wL, mul(pp,  0.052));
  const innerLowR = add(wR, mul(pp, -0.052));
  o.push(poly([outL, innerTopL, innerLowL, wL], MAT.leather, { bulge: 0.075 }));
  o.push(poly([innerTopR, outR, wR, innerLowR], MAT.leather, { bulge: 0.075 }));
  // lapels
  o.push(poly([innerTopL, add(innerTopL, mul(pp,-0.085)), add(add(innerLowL, mul(pp,-0.02)), mul(sd,0.12)), lerpP(innerTopL, innerLowL, 0.45)], MAT.leatherHi, { bulge: 0.04 }));
  o.push(poly([innerTopR, add(innerTopR, mul(pp, 0.085)), add(add(innerLowR, mul(pp, 0.02)), mul(sd,0.12)), lerpP(innerTopR, innerLowR, 0.45)], MAT.leatherHi, { bulge: 0.04 }));
  // popped collar
  o.push(poly([add(S.neck, mul(pp,-0.045)), add(add(S.neck, mul(pp,-0.16)), mul(sd,0.055)),
               add(add(S.neck, mul(pp,-0.10)), mul(sd,0.135)), add(add(S.neck, mul(pp,-0.02)), mul(sd,0.07))], MAT.leatherHi, { bulge:0.035 }));
  o.push(poly([add(S.neck, mul(pp, 0.045)), add(add(S.neck, mul(pp, 0.16)), mul(sd,0.055)),
               add(add(S.neck, mul(pp, 0.10)), mul(sd,0.135)), add(add(S.neck, mul(pp, 0.02)), mul(sd,0.07))], MAT.leatherHi, { bulge:0.035 }));
  // zip + seams
  o.push(capsule(lerpP(innerTopR, innerLowR, 0.12), lerpP(innerTopR, innerLowR, 0.95), 0.009, 0.009, MAT.ink));
  o.push(capsule(add(outL, mul(sd,-0.02)), add(wL, mul(pp,0.02)), 0.007, 0.007, MAT.ink));
  // studs
  for (let i = 0; i < 4; i++) {
    const t = 0.18 + i*0.2;
    o.push(ell(lerpP(add(outL, mul(sd,-0.055)), add(innerTopL, mul(sd,-0.06)), t), 0.014, 0.013, 0, MAT.metal));
    o.push(ell(lerpP(add(outR, mul(sd,-0.055)), add(innerTopR, mul(sd,-0.06)), t), 0.014, 0.013, 0, MAT.metal));
  }
  // belt
  const bL = add(wL, mul(sd, -0.035)), bR = add(wR, mul(sd, -0.035));
  o.push(capsule(bL, bR, 0.040, 0.040, MAT.belt));
  for (let i = 0; i < 5; i++) o.push(ell(lerpP(bL, bR, 0.14 + i*0.18), 0.015, 0.014, 0, MAT.metal));
  o.push(ell(lerpP(bL, bR, 0.52), 0.036, 0.030, 0, MAT.metal));
  return o;
}

const SPIKES = [-62,-46,-31,-17,-4,10,24,39,55];
const SPIKE_L = [0.076,0.106,0.132,0.150,0.161,0.155,0.136,0.108,0.080];

function headParts(S, P) {
  const o = [];
  const hd = S.hd, hp = [hd[1], -hd[0]];
  const ang = Math.atan2(hd[0], hd[1]) * -180 / Math.PI;
  const turn = P.headTurn || 0;
  o.push(capsule(S.neck, add(S.neck, mul(hd, 0.09)), 0.048, 0.045, MAT.skin));
  const crown = add(S.headC, mul(hd, 0.072));
  const flick = P.hairFlick || 0;
  const back = [ell(crown, 0.096, 0.083, ang, MAT.hair)];
  for (let i = 0; i < SPIKES.length; i++) {
    const a = SPIKES[i] + flick * (0.35 + 0.65 * Math.abs(SPIKES[i]) / 82) + (turn * 0.05);
    const d = rot(hd, a);
    const tipL = SPIKE_L[i] * (1 + 0.12 * Math.sin(i * 2.4));
    back.push(capsule(add(crown, mul(d, 0.042)), add(crown, mul(d, 0.042 + tipL)), 0.024, 0.004, MAT.hair));
  }
  o.push(uni(back, MAT.hair));
  o.push(uni([ell(S.headC, 0.092, 0.118, ang, MAT.skin),
              ell(add(add(S.headC, mul(hd,-0.068)), mul(hp, turn*0.0014 + 0.010)), 0.058, 0.049, ang, MAT.skin)], MAT.skin));
  o.push(uni([poly([add(add(S.headC, mul(hp,-0.089)), mul(hd, 0.046)), add(add(S.headC, mul(hp, 0.089)), mul(hd, 0.060)),
                    add(add(S.headC, mul(hp, 0.083)), mul(hd, 0.124)), add(add(S.headC, mul(hp,-0.083)), mul(hd, 0.124))], MAT.hair, { bulge:0.04 }),
              capsule(add(add(S.headC, mul(hp,-0.088)), mul(hd, 0.050)), add(add(S.headC, mul(hp,-0.079)), mul(hd,-0.056)), 0.022, 0.011, MAT.hair),
              capsule(add(add(S.headC, mul(hp, 0.088)), mul(hd, 0.050)), add(add(S.headC, mul(hp, 0.081)), mul(hd,-0.048)), 0.022, 0.011, MAT.hair)],
             MAT.hair));   // fringe + sideburns frame the face
  o.push(ell(add(add(S.headC, mul(hd,-0.040)), mul(hp, -0.058 + turn*0.0011)), 0.026, 0.046, ang, MAT.skinDark)); // cheek
  // features
  const tx = turn * 0.0015;
  const F = (u, v) => add(add(S.headC, mul(hp, u + tx)), mul(hd, v));
  o.push(capsule(F(-0.070, 0.052), F(-0.016, 0.034), 0.013, 0.010, MAT.ink));    // brows, sneering inward
  o.push(capsule(F( 0.070, 0.052), F( 0.016, 0.034), 0.013, 0.010, MAT.ink));
  o.push(ell(F(-0.042, 0.012), 0.026, 0.0165, ang + 7, MAT.ink));                 // eyes
  o.push(ell(F( 0.042, 0.012), 0.026, 0.0165, ang - 7, MAT.ink));
  o.push(capsule(F(0.006,-0.006), F(0.012,-0.030), 0.009, 0.013, MAT.skinDark));   // nose
  const mouth = F(0.006, -0.062);
  const open = P.mouth || 0;
  o.push(ell(mouth, 0.031, 0.0135 + open*0.028, ang - 12, MAT.ink));
  o.push(ell(add(mouth, mul(hd,-0.026)), 0.020, 0.010, ang, MAT.skinDark));        // chin shadow
  return o;
}

/* ---- props ----------------------------------------------------------- */
function propParts(S, P) {
  const o = [];
  const handDir = side => nrm(sub(side === 'R' ? S.wriR : S.wriL, side === 'R' ? S.elbR : S.elbL));
  if (P.mic) {
    const w = P.mic === 'L' ? S.wriL : S.wriR, d = handDir(P.mic);
    const b = add(w, mul(d, 0.02)), t = add(w, mul(d, 0.17));
    o.push(capsule(b, t, 0.030, 0.032, MAT.mic));
    o.push(ell(add(w, mul(d, 0.21)), 0.046, 0.046, 0, MAT.mic));
    o.push(capsule(b, add(w, mul(d, -0.13)), 0.008, 0.006, MAT.ink2));
  }
  if (P.cig) {
    const hd = S.hd, hp = [hd[1], -hd[0]];
    const a = P.cig === 'mouth' ? add(add(S.headC, mul(hd, -0.060)), mul(hp, 0.030))
            : add(P.cig === 'L' ? S.wriL : S.wriR, mul(nrm(sub(P.cig === 'L' ? S.wriL : S.wriR, P.cig === 'L' ? S.elbL : S.elbR)), 0.055));
    const b = add(a, mul(nrm(P.cigDir || [1, 0.25]), 0.080));
    o.push(capsule(a, b, 0.011, 0.010, { tone: 0.12, flat: true }));
    o.push(ell(b, 0.013, 0.012, 0, MAT.ink));
    if (P.smoke) {
      const o0 = add(b, [0.01, 0.03]);
      for (let i = 0; i < P.smoke; i++) {
        const t = i / (P.smoke - 1 || 1);
        o.push(softBlob([o0[0] + Math.sin(t * 3.3) * 0.085 + t * 0.05, o0[1] + t * 0.40], 0.026 + t * 0.052, (0.026 + t * 0.052) * 0.8, 0.19 - t * 0.10));
      }
    }
  }
  if (P.bottle) {
    /* A pint, built along world up rather than along the forearm: the old
       bottle pointed wherever the arm did, so in beer_swig he drank from the
       base. Four walls and three fills. The seam between beer and foam is the
       part that matters: at this cell size a boundary inside about fifteen of
       the seventy ramp steps disappears into the shading, so the two are set
       far apart and cut with a near-black line rather than blended. */
    const w = P.bottle === 'L' ? S.wriL : S.wriR, d = handDir(P.bottle);
    const x = w[0] + (d[0] >= 0 ? 0.022 : -0.022), y = w[1];   // clear of the hip
    const IW = 0.034;                                          // inside half-width
    const floor = y - 0.040, brim = y + 0.098;
    const head = brim - 0.24 * (brim - floor), pour = head - 0.007;
    const band = (lo, hi, mat) => poly([[x-IW,lo],[x+IW,lo],[x+IW,hi],[x-IW,hi]], mat, { bulge: 0.012 });
    /* Back to front, like the rest: the walls, then what is in them, and the
       cut last of all so the boundary between beer and foam stays hard. */
    o.push(ell([x, floor - 0.006], 0.052, 0.009, 0, MAT.pint));          // base
    o.push(capsule([x, floor], [x, brim], 0.048, 0.052, MAT.pint));      // walls
    o.push(band(floor, pour, MAT.beer));                                 // beer
    o.push(band(head, brim, MAT.foam));                                  // head
    o.push(band(pour, head, MAT.seam));                                  // the cut
  }
  if (P.can) {
    const w = P.can === 'L' ? S.wriL : S.wriR, d = handDir(P.can);
    o.push(capsule(add(w, mul(d,-0.02)), add(w, mul(d,0.16)), 0.036, 0.034, MAT.metal));
    o.push(capsule(add(w, mul(d,0.16)), add(w, mul(d,0.20)), 0.020, 0.016, MAT.ink2));
    (P.spray || []).forEach(s => o.push(softBlob([s[0], s[1]], s[2], s[2]*0.8, s[3] || 0.16)));
  }
  if (P.pad) {
    const c = P.pad;
    o.push(capsule(add(c,[-0.11,0.01]), add(c,[-0.02,-0.02]), 0.036, 0.030, MAT.plastic));
    o.push(capsule(add(c,[ 0.11,0.01]), add(c,[ 0.02,-0.02]), 0.036, 0.030, MAT.plastic));
    o.push(capsule(add(c,[0,0.01]), add(c,[0,-0.09]), 0.034, 0.028, MAT.plastic));
    o.push(ell(add(c,[0,0.015]), 0.022, 0.020, 0, MAT.ink2));
  }
  (P.extra || []).forEach(f => f(o, S, P));
  return o;
}

/* ---- assembly -------------------------------------------------------- */
const BASE = {
  hipX: 0, hipY: 0.870, lean: 5, shW: 0.205, shSkew: 0, shDrop: 0,
  headTilt: -3, headTurn: 0, hairFlick: 0, mouth: 0,
  ftL: [-0.17, 0.115], ftR: [0.16, 0.115], toeL: 0, toeR: 0,
  hL: [-0.28, 0.80], hR: [0.30, 0.82],
  frontArm: 'R', frontLeg: 'R', shadow: 1,
};

function buildParts(P) {
  const S = skeleton(P);
  const back = [], front = [];
  const bl = P.frontLeg === 'R' ? 'L' : 'R', ba = P.frontArm === 'R' ? 'L' : 'R';
  /* The rasteriser reverses this list, so it is built back to front: what is
     pushed last is drawn in front. The contact line goes first, under his
     boots; the props go last, in the hand and in front of it. */
  const o = [];
  if (P.shadow) {
    /* Where he meets the floor, as one thin bright line. A soft pool under the
       boots reads as a smear of noise on a projector, and a dark one cannot be
       seen at all on black. It thins and dims as he leaves the ground. */
    const cx = (S.ankL[0] + S.ankR[0]) / 2;
    const lift = clamp(1 - Math.max(0, Math.min(S.ankL[1], S.ankR[1]) - 0.115) * 2.2, 0.35, 1);
    /* The floor stays where it is: a standing ankle sits at 0.115 and the sole
       0.055 under it, so that is the height of the line whether he is on it or
       over it. Leaving the ground only thins and dims it. */
    o.push(ell([cx, 0.060], 0.26 * lift, 0.006, 0,
               { tone: 0.10 + 0.5 * (1 - lift), flat: true }));
  }
  (P.behind || []).forEach(f => f(o, S, P));
  o.push(...legParts(S, bl, P));
  o.push(...armParts(S, ba, P));
  o.push(...torsoParts(S, P));
  o.push(...legParts(S, P.frontLeg, P));
  o.push(...headParts(S, P));
  o.push(...armParts(S, P.frontArm, P));
  o.push(...propParts(S, P));
  return o;
}

/* ---- rasteriser ------------------------------------------------------ */
function rasterise(parts) {
  const solid = [], soft = [];
  for (const p of parts) (p.soft ? soft : solid).push(p);
  solid.reverse();                                     // front to back
  const out = [];
  const inv = 1 / (SS * SS);
  for (let r = 0; r < ROWS; r++) {
    let line = '';
    const yA = Y_TOP - r * CELL_H;
    for (let c = 0; c < COLS; c++) {
      const xA = X0 + c * CELL_W;
      let acc = 0;
      for (let sy = 0; sy < SS; sy++) {
        const y = yA - (sy + 0.5) / SS * CELL_H;
        for (let sx = 0; sx < SS; sx++) {
          const x = xA + (sx + 0.5) / SS * CELL_W;
          let v = 0, done = false;
          for (let i = 0; i < solid.length; i++) {
            const pt = solid[i], bb = pt.bbox;
            if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue;
            const h = pt.test([x, y]);
            if (!h) continue;
            /* No ink outline: on black the rim lights do the separating, and
               they were built for it — leather 0.40, belt 0.42, boot 0.38. */
            v = shade(h, pt.mat);
            done = true; break;
          }
          if (!done) {
            for (let i = 0; i < soft.length; i++) {
              const pt = soft[i], bb = pt.bbox;
              if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue;
              const h = pt.test([x, y]);
              if (!h) continue;
              const t = pt.softTone * (1 - h.q);
              if (t > v) v = t;
            }
          }
          acc += v;
        }
      }
      let d = clamp(acc * inv, 0, 1);
      d = clamp(0.5 + (d - 0.5) * CONTRAST, 0, 1);
      d = Math.pow(d, GAMMA);
      line += RAMP[Math.round(d * (RAMP.length - 1))];
    }
    out.push(line.replace(/\s+$/, ''));
  }
  return out;
}

const renderPose = P => rasterise(buildParts(Object.assign({}, BASE, P)));

/* ---- poses ----------------------------------------------------------- */
const POSES = {
  /* ---------------- dance ---------------- */
  idle_a: { group:'dance', energy:1, beat:'down', hipY:0.868, lean:5, headTilt:-3,
            ftL:[-0.165,0.115], ftR:[0.155,0.115], rL:[-0.075,-0.555], rR:[0.090,-0.545], hairFlick:2 },
  idle_b: { group:'dance', energy:1, beat:'up', hipX:0.012, hipY:0.890, lean:3, headTilt:-1,
            ftL:[-0.165,0.115], ftR:[0.155,0.115], rL:[-0.065,-0.570], rR:[0.080,-0.560], hairFlick:-3 },

  sway_l: { group:'dance', energy:1, beat:'down', hipX:-0.072, hipY:0.858, lean:2, headTilt:4, headTurn:-14,
            ftL:[-0.225,0.115], ftR:[0.145,0.118], toeR:8, rL:[-0.130,-0.530], rR:[0.165,-0.495],
            hairFlick:-9, frontLeg:'L', frontArm:'L' },
  sway_r: { group:'dance', energy:1, beat:'down', hipX:0.075, hipY:0.858, lean:9, headTilt:-9, headTurn:14,
            ftL:[-0.145,0.118], ftR:[0.230,0.115], toeL:-8, rL:[-0.165,-0.495], rR:[0.130,-0.530], hairFlick:9 },

  stomp_l: { group:'dance', energy:2, beat:'down', hipX:0.040, hipY:0.850, lean:8, headTilt:-6, mouth:0.30,
             ftL:[-0.110,0.400], toeL:26, ftR:[0.165,0.115], rL:[-0.255,-0.470], rR:[0.265,-0.430],
             hairFlick:-8, frontLeg:'L', frontArm:'R' },
  stomp_r: { group:'dance', energy:2, beat:'down', hipX:-0.040, hipY:0.850, lean:2, headTilt:2, mouth:0.30,
             ftL:[-0.165,0.115], ftR:[0.140,0.410], toeR:26, rL:[-0.265,-0.430], rR:[0.265,-0.470], hairFlick:8 },

  fist_up:  { group:'dance', energy:3, beat:'down', hipY:0.882, lean:-3, headTilt:9, headTurn:8, mouth:0.55,
              ftL:[-0.210,0.115], ftR:[0.200,0.115], rL:[-0.100,-0.520], rR:[0.095,0.560], hairFlick:-11 },
  fists_up: { group:'dance', energy:3, beat:'down', hipY:0.900, lean:0, headTilt:12, mouth:0.70,
              ftL:[-0.250,0.115], ftR:[0.240,0.115], rL:[-0.115,0.550], rR:[0.125,0.570], hairFlick:-14 },

  pogo_crouch: { group:'dance', energy:3, beat:'up', hipY:0.655, lean:16, headTilt:-13, mouth:0.35,
                 ftL:[-0.200,0.115], ftR:[0.190,0.115], rL:[-0.270,-0.455], rR:[0.280,-0.475], hairFlick:-16 },
  pogo_air:    { group:'dance', energy:3, beat:'down', hipY:1.125, lean:-4, headTilt:11, mouth:0.80,
                 ftL:[-0.215,0.480], toeL:-24, ftR:[0.220,0.500], toeR:-24,
                 rL:[-0.120,0.535], rR:[0.130,0.555], hairFlick:22 },

  bang_down: { group:'dance', energy:3, beat:'down', hipY:0.805, lean:38, headTilt:26, mouth:0.40,
               ftL:[-0.225,0.115], ftR:[0.215,0.115], rL:[-0.300,-0.450], rR:[0.310,-0.480],
               hairFlick:34, frontArm:'L' },
  bang_up:   { group:'dance', energy:3, beat:'up', hipY:0.885, lean:-11, headTilt:-24, mouth:0.60,
               ftL:[-0.220,0.115], ftR:[0.210,0.115], rL:[-0.265,-0.455], rR:[0.275,-0.470], hairFlick:-30 },

  wind_1: { group:'dance', energy:3, beat:'down', hipY:0.852, lean:7, headTilt:-6,
            ftL:[-0.250,0.115], ftR:[0.240,0.115], rL:[-0.090,-0.545], rR:[0.550,0.060], hairFlick:6 },
  wind_2: { group:'dance', energy:3, beat:'and', hipY:0.860, lean:2, headTilt:2,
            ftL:[-0.250,0.115], ftR:[0.240,0.115], rL:[-0.090,-0.545], rR:[0.205,0.520], hairFlick:-6 },
  wind_3: { group:'dance', energy:3, beat:'up', hipY:0.852, lean:-4, headTilt:6, headTurn:-10,
            ftL:[-0.250,0.115], ftR:[0.240,0.115], rL:[-0.090,-0.545], rR:[-0.260,0.480], hairFlick:-14 },
  wind_4: { group:'dance', energy:3, beat:'and', hipY:0.844, lean:12, headTilt:-10,
            ftL:[-0.250,0.115], ftR:[0.240,0.115], rL:[-0.090,-0.545], rR:[-0.105,-0.540], hairFlick:10 },

  kick:  { group:'dance', energy:3, beat:'down', hipY:0.848, lean:-9, headTilt:-4, mouth:0.40,
           ftL:[-0.105,0.115], ftR:[0.520,0.500], toeR:14, rL:[-0.305,-0.450], rR:[0.300,0.450],
           hairFlick:-12, frontLeg:'R' },
  twist: { group:'dance', energy:2, beat:'and', hipX:-0.028, hipY:0.852, lean:4, shSkew:0.070,
           headTurn:20, headTilt:-6, ftL:[-0.185,0.118], toeL:-20, ftR:[0.175,0.115], toeR:18,
           rL:[0.250,-0.450], rR:[0.335,-0.400], hairFlick:12 },

  strut_1: { group:'dance', energy:2, beat:'down', hipX:0.018, hipY:0.852, lean:11, headTilt:-7, headTurn:10,
             ftL:[-0.290,0.140], toeL:16, ftR:[0.260,0.115], rL:[-0.165,-0.490], rR:[0.215,-0.460],
             hairFlick:-7, frontLeg:'R' },
  strut_2: { group:'dance', energy:2, beat:'up', hipX:-0.018, hipY:0.852, lean:11, headTilt:-5, headTurn:-8,
             ftL:[-0.265,0.115], ftR:[0.285,0.145], toeR:-16, rL:[-0.215,-0.460], rR:[0.170,-0.490],
             hairFlick:7, frontLeg:'L', frontArm:'L' },

  point: { group:'dance', energy:2, beat:'down', hipY:0.856, lean:15, headTilt:-11, headTurn:16, mouth:0.45,
           ftL:[-0.240,0.115], ftR:[0.215,0.118], rL:[-0.120,-0.520], rR:[0.555,0.095],
           fistR:'open', hairFlick:-10 },
  sing:  { group:'dance', energy:2, beat:'down', hipY:0.862, lean:9, headTilt:-8, headTurn:6, mouth:0.85,
           ftL:[-0.205,0.115], ftR:[0.195,0.115], rL:[-0.440,-0.320],
           hR:[0.350,1.450], elbR:[0.520,1.190], mic:'R', fistL:'open', hairFlick:-5 },
  sneer: { group:'dance', energy:1, beat:'up', hipX:0.028, hipY:0.872, lean:-6, headTilt:-13, headTurn:-12,
           mouth:0.15, ftL:[-0.185,0.115], ftR:[0.180,0.115], rL:[-0.085,-0.545], rR:[0.310,-0.300],
           fistR:'open', hairFlick:5 },

  /* ---------------- breaks / easter eggs ---------------- */
  smoke_drag: { group:'break', energy:0, hipX:0.018, hipY:0.860, lean:-4, headTilt:-6, headTurn:-8,
                ftL:[-0.185,0.115], ftR:[0.170,0.118], toeR:10, rL:[-0.080,-0.540],
                hR:[0.260,1.500], elbR:[0.420,1.200], fistR:'pinch', cig:'mouth', cigDir:[0.34,0.94], smoke:7, hairFlick:3 },
  smoke_exhale: { group:'break', energy:0, hipX:-0.010, hipY:0.874, lean:-9, headTilt:-19, mouth:0.30,
                ftL:[-0.195,0.115], ftR:[0.180,0.115], rL:[-0.080,-0.545], rR:[0.330,-0.320],
                fistR:'pinch', cig:'R', cigDir:[0.88,0.47], smoke:8, hairFlick:-6 },

  beer_swig: { group:'break', energy:0, hipX:0.015, hipY:0.868, lean:-12, headTilt:-23, mouth:0.25,
               ftL:[-0.205,0.115], ftR:[0.195,0.115], rL:[-0.085,-0.545],
               hR:[0.080,1.440], elbR:[0.260,1.180], bottle:'R', fistR:'pinch', hairFlick:-9 },
  beer_hold: { group:'break', energy:0, hipX:-0.038, hipY:0.860, lean:3, headTilt:-4, headTurn:-10,
               ftL:[-0.225,0.115], ftR:[0.125,0.118], toeR:12, rL:[-0.080,-0.545], rR:[0.190,-0.415],
               bottle:'R', fistR:'pinch', hairFlick:4, frontLeg:'L' },

  hairspray: { group:'break', energy:0, hipY:0.872, lean:-2, headTilt:-7, headTurn:-6,
               ftL:[-0.180,0.115], ftR:[0.170,0.115], rL:[-0.080,-0.545],
               hR:[0.340,1.580], elbR:[0.520,1.300], can:'R', fistR:'pinch', hairFlick:-4,
               spray:[[0.19,1.880,0.060,0.15],[0.070,1.945,0.076,0.13],[-0.060,1.960,0.066,0.11]] },

  lace_boot: { group:'break', energy:0, hipX:-0.015, hipY:0.425, lean:45, headTilt:16,
               ftL:[-0.240,0.115], ftR:[0.205,0.115], toeR:0,
               rL:[-0.020,-0.560], rR:[-0.245,-0.450], fistL:'pinch', fistR:'pinch',
               hairFlick:20, frontLeg:'R' },

  tune_up: { group:'break', energy:0, hipY:0.864, lean:8, headTilt:14, headTurn:-14,
             ftL:[-0.190,0.115], ftR:[0.185,0.115],
             hL:[-0.100,1.280], elbL:[-0.360,1.220], hR:[0.160,1.260], elbR:[0.460,1.180],
             fistL:'pinch', fistR:'pinch', mic:'L', hairFlick:-3 },

  n64: { group:'break', energy:0, hipX:0.070, hipY:0.300, lean:-13, shW:0.205, headTilt:-6, headTurn:-22, shadow:0,
         kneeL:[0.300,0.135], ftL:[-0.040,0.075], kneeR:[0.420,0.175], ftR:[0.050,0.060],
         rL:[0.241,-0.259], rR:[-0.159,-0.351],
         fistL:'pinch', fistR:'pinch', pad:[-0.020,0.555], frontLeg:'L',
         behind: [(o) => {
           o.push(poly([[-0.80,0.055],[-0.46,0.055],[-0.46,0.415],[-0.80,0.415]], MAT.leather, { bulge:0.038 }));
           o.push(poly([[-0.772,0.125],[-0.488,0.125],[-0.488,0.360],[-0.772,0.360]], MAT.glow, { bulge:0.022 }));
           for (let i = 0; i < 5; i++) o.push(capsule([-0.770, 0.140 + i*0.052], [-0.490, 0.140 + i*0.052], 0.007, 0.007, MAT.ink2));
           o.push(capsule([-0.760,0.090],[-0.640,0.090], 0.013, 0.013, MAT.ink2));
           o.push(capsule([-0.46,0.170],[-0.24,0.075], 0.009, 0.008, MAT.ink2));
           o.push(capsule([-0.24,0.075],[-0.045,0.440], 0.009, 0.008, MAT.ink2));
           o.push(softBlob([-0.12,0.048], 0.58, 0.044, 0.16));
         }] },

  amp_lean: { group:'break', energy:0, hipX:0.125, hipY:0.855, lean:-7, headTilt:-9, headTurn:-13,
              ftL:[-0.085,0.115], ftR:[0.205,0.120], toeR:14,
              rL:[0.299,-0.166], rR:[-0.280,-0.200],
              fistL:'pinch', fistR:'fist', frontLeg:'L', frontArm:'R', hairFlick:-5,
              behind: [(o) => {
                o.push(poly([[0.44,0.02],[0.89,0.02],[0.89,0.76],[0.44,0.76]], MAT.leather, { bulge:0.042 }));
                o.push(capsule([0.45,0.735],[0.88,0.735], 0.016, 0.016, MAT.metal));
                o.push(poly([[0.485,0.095],[0.850,0.095],[0.850,0.655],[0.485,0.655]], MAT.leatherHi, { bulge:0.03 }));
                o.push(ell([0.667,0.375], 0.150, 0.205, 0, MAT.jeans));
                o.push(ell([0.667,0.375], 0.046, 0.060, 0, MAT.metal));
                for (let i = 0; i < 4; i++) o.push(ell([0.462 + (i%2)*0.410, 0.055 + Math.floor(i/2)*0.660], 0.014, 0.013, 0, MAT.metal));
              }] },
};

const LOOPS = {
  idle:      ['idle_a','idle_b'],
  sway:      ['sway_l','idle_a','sway_r','idle_b'],
  strut:     ['strut_1','strut_2'],
  stomp:     ['stomp_l','idle_a','stomp_r','idle_b'],
  twist:     ['twist','sway_r','sneer','sway_l'],
  headbang:  ['bang_down','bang_up'],
  pogo:      ['pogo_crouch','pogo_air'],
  windmill:  ['wind_1','wind_2','wind_3','wind_4'],
  chorus:    ['fists_up','bang_down','fist_up','bang_up'],
  climax:    ['pogo_crouch','pogo_air','fists_up','kick'],
  front:     ['sing','point','sneer','sing'],
  smoke:     ['smoke_drag','smoke_exhale'],
  beer:      ['beer_hold','beer_swig'],
  n64:       ['n64'],
  backstage: ['amp_lean','hairspray','lace_boot','tune_up'],
};

/* What render.mjs and the art tests need, and nothing else: the rest was for
   the viewer pages of the project this generator was drawn in. */
return { COLS, ROWS, RAMP, POSES, LOOPS, renderPose };
