import {
  LineCapStyle,
  LineJoinStyle,
  PDFPage,
  RGB,
  appendBezierCurve,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setDashPattern,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke,
} from 'pdf-lib';

/**
 * Primary Littlepen — Vietnamese Primary-School Cursive Vector Font
 * Faithfully modeled after Vietnam Ministry of Education standard handwriting (QĐ 31/2002)
 * and LittlePen (github.com/langmaninternet/LuyenChuTieuHoc), extended with
 * stylistically matched English characters (f, j, w, z, F, J, W, Z).
 *
 * Coordinate system (in exact Small 1-ô-ly units; Normal mode scales unit by 2×):
 *   x: 0 -> advance width (o, a, c, e ≈ 1.0 ô ly so 2×2 mm or 2.5×2.5 mm fits cleanly)
 *   y:  0.0  = primary baseline
 *       1.0  = 1 ô ly x-height (a, c, e, i, m, n, o, u, v, w, x, z)
 *       1.25 = r, s
 *       1.5  = t
 *       2.0  = d, đ and digits 0–9
 *       2.5  = tall loops (b, h, k, l, f) and UPPERCASE A–Z
 *      -1.0  = p, q
 *      -1.5  = deep loops (g, y, j, f, G, Y, J)
 *
 * Cursive connection architecture:
 *   - Every LOW-exit glyph ends at (exitX, 0.50) with unified C1 tangent slope dy/dx = 1.60.
 *   - Every HIGH-exit glyph (b, v, w, and connected o) ends at (exitX, 0.78) with smooth rightward tangent.
 *   - Connected glyphs select exact entry variants (INIT, FROM_LOW, FROM_HIGH) so pairs like
 *     tr, re, ee, ca, at, bh, hk, ke, ei, ia, bu, um, mb, bl, le, ly, er, rl join seamlessly.
 */

export type StrokeSegment =
  | { kind: 'L'; x: number; y: number }
  | { kind: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number };

export interface GlyphStroke {
  startX: number;
  startY: number;
  segments: StrokeSegment[];
  /** Optional small dot (e.g., i, j, exclamation, period, nặng) */
  isDot?: boolean;
}

export type ExitKind = 'low' | 'high' | 'oval-o' | 'stop';
export type EntryKind = 'init' | 'from-low' | 'from-high';

export interface GlyphDef {
  width: number;
  strokes: GlyphStroke[];
  /** Exit connector classification for cursive joining */
  exitKind?: ExitKind;
  /** Exact x coordinate where the exit stroke ends (at y=0.50 for 'low', y=0.78 for 'high') */
  exitX?: number;
  /** True for oval-left letters (a, c, d, đ, g, o, q) that kiss the preceding exit stroke */
  isOvalLeft?: boolean;
  /** Left contour x at y=0.50 (for LOW -> oval kiss) */
  ovalTouchLowX?: number;
  /** Left contour x at y=0.78 (for HIGH -> oval kiss) */
  ovalTouchHighX?: number;
}

const M = (startX: number, startY: number, segments: StrokeSegment[]): GlyphStroke => ({
  startX,
  startY,
  segments,
});

const L = (x: number, y: number): StrokeSegment => ({ kind: 'L', x, y });

const C = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
  y: number
): StrokeSegment => ({ kind: 'C', x1, y1, x2, y2, x, y });

const DOT = (x: number, y: number): GlyphStroke => ({
  startX: x,
  startY: y,
  segments: [],
  isDot: true,
});

/**
 * Soft upright primary oval (1.0 ô ly tall, smooth plump proportions matching LittlePen).
 * Left contour passes cleanly through (ox + 0.01, 0.50) and (ox + 0.09, 0.80).
 */
function ovalStroke(ox = 0.06, w = 0.75, h = 1.0): GlyphStroke {
  const rx = ox + w;
  const mx = ox + w * 0.5;
  return M(rx - w * 0.05, h * 0.76, [
    C(rx - w * 0.14, h * 1.02, ox + w * 0.22, h * 1.04, ox + w * 0.05, h * 0.70),
    C(ox - w * 0.03, h * 0.38, ox + w * 0.04, 0.0, mx, 0.0),
    C(rx - w * 0.10, 0.0, rx + w * 0.04, h * 0.26, rx, h * 0.54),
    C(rx - w * 0.01, h * 0.66, rx - w * 0.02, h * 0.72, rx - w * 0.05, h * 0.76),
  ]);
}

/**
 * Shared tall upper teardrop loop (nét khuyết trên, y -> 2.50 -> straight vertical spine to endY).
 * Entry at (0.0, 0.50) matches the unified C1 slope dy/dx = 2.53; HIGH entry starts at (0.0, 0.80).
 * Loop width ≈ 0.40–0.42 units (≈ 0.85 grid squares in Normal, matching LittlePen bhkeia & bumblebee).
 */
function tallUpperLoopStroke(spineEndY: number, entry: EntryKind): GlyphStroke {
  if (entry === 'from-high') {
    return M(0.0, 0.76, [
      C(0.14, 0.88, 0.58, 1.82, 0.58, 2.24),
      C(0.58, 2.51, 0.30, 2.54, 0.23, 2.26),
      C(0.19, 2.08, 0.20, 1.82, 0.20, spineEndY),
    ]);
  }
  return M(0.0, 0.50, [
    C(0.09, 0.728, 0.64, 1.82, 0.64, 2.24),
    C(0.64, 2.51, 0.34, 2.54, 0.27, 2.26),
    C(0.23, 2.08, 0.24, 1.82, 0.24, spineEndY),
  ]);
}

function tallLoopSpineX(entry: EntryKind): number {
  return entry === 'from-high' ? 0.20 : 0.24;
}

/**
 * Universal smooth bottom exit hook from vertical stem at (sx, 0.26) touching y=0.0
 * and rising purely concave-upward to (sx + 0.45, 0.50) with exact C2 slope dy/dx = 2.53.
 * Derived via exact de Casteljau subdivision of the continuous baseline-to-x-height cursive arc
 * [(0.16, 0.0), (0.26, 0.0), (0.45, 0.46), (0.63, 1.0)] at y = 0.50.
 */
const HOOK_REACH = 0.45;
function bottomHookSegments(sx: number): StrokeSegment[] {
  return [
    C(sx, 0.06, sx + 0.06, 0.0, sx + 0.16, 0.0),
    C(sx + 0.227, 0.0, sx + 0.333, 0.204, sx + HOOK_REACH, 0.50),
  ];
}

/**
 * Pure concave-upward exit arc from a rounded baseline bowl at (bx, 0.0) to (bx + reach, 0.50)
 * matching the exact unified slope dy/dx = 2.53 (used by c, e, x, z).
 */
function bowlExitSegment(bx: number, reach = 0.36): StrokeSegment {
  const s = reach / 0.36;
  return C(bx + 0.12 * s, 0.0, bx + 0.24 * s, 0.197, bx + reach, 0.50);
}

/**
 * Universal stem lead-in curve arriving cleanly at (stemX, 1.0).
 * - FROM_LOW: exact de Casteljau second half of the continuous baseline-to-stem arc
 *   (starts at (0.0, 0.50) with exact slope 2.53 & matching curvature -> C2 seamless join into t, i, u, p, w, y!).
 * - FROM_HIGH: glides smoothly from b/v/w/o top-right knot at (0.0, 0.76) into (stemX, 1.0).
 * - INIT: authentic LittlePen delicate initial nét hất from (0.0, 0.50) to (stemX, 1.0).
 */
function stemLeadIn(stemX: number, entry: EntryKind): { startX: number; startY: number; seg: StrokeSegment } {
  if (entry === 'from-low') {
    const k = stemX / 0.18;
    return {
      startX: 0.0,
      startY: 0.50,
      seg: C(0.059 * k, 0.648, 0.120 * k, 0.820, stemX, 1.0),
    };
  }
  if (entry === 'from-high') {
    return {
      startX: 0.0,
      startY: 0.76,
      seg: C(stemX * 0.38, 0.78, stemX * 0.76, 0.88, stemX, 1.0),
    };
  }
  return {
    startX: 0.0,
    startY: 0.50,
    seg: C(stemX * 0.34, 0.64, stemX * 0.72, 0.82, stemX, 1.0),
  };
}

/**
 * Shared deep teardrop descender loop (nét khuyết dưới, stemX down to -1.50,
 * crossing cleanly at y=0.0 and rising smoothly concave-up to (stemX + 0.34, 0.50) with slope 2.53).
 */
const DESC_EXIT_REACH = 0.34;
function deepDescenderLoopSegments(stemX: number): StrokeSegment[] {
  const ex = stemX + DESC_EXIT_REACH;
  return [
    L(stemX, -1.04),
    C(stemX, -1.44, stemX - 0.16, -1.52, stemX - 0.30, -1.48),
    C(stemX - 0.46, -1.42, stemX - 0.46, -1.02, stemX - 0.30, -0.70),
    C(stemX - 0.14, -0.38, stemX - 0.04, -0.14, stemX + 0.04, 0.0),
    C(stemX + 0.14, 0.17, ex - 0.10, 0.247, ex, 0.50),
  ];
}

/**
 * Soft, petite top-right ribbon knot (nét thắt trên) for b, v, w matching LittlePen's bhkeia & bumblebee.
 * Curves gently inward from the rounded cheek up to a delicate crest (y = 0.93),
 * loops softly counter-clockwise down to y = 0.73, and glides smoothly out to (rx + 0.14, 0.76).
 */
const HIGH_KNOT_REACH = 0.14;
function topRightKnotSegments(rx: number): StrokeSegment[] {
  return [
    C(rx - 0.03, 0.82, rx - 0.09, 0.94, rx - 0.16, 0.93),
    C(rx - 0.23, 0.91, rx - 0.23, 0.75, rx - 0.12, 0.73),
    C(rx - 0.02, 0.71, rx + 0.06, 0.73, rx + HIGH_KNOT_REACH, 0.76),
  ];
}

// ============================================================
// CONTEXT-AWARE LOWERCASE GLYPH BUILDER (a–z + f, j, w, z)
// ============================================================
function buildLowercaseGlyph(ch: string, entry: EntryKind, nextConnects: boolean, nextIsOval: boolean): GlyphDef | null {
  const sp = tallLoopSpineX(entry);

  switch (ch) {
    case 'a': {
      const stemX = 0.81;
      const ex = stemX + HOOK_REACH;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        isOvalLeft: true,
        ovalTouchLowX: 0.07,
        ovalTouchHighX: 0.15,
        strokes: [
          ovalStroke(0.06, 0.75, 1.0),
          M(stemX, 1.0, [L(stemX, 0.26), ...bottomHookSegments(stemX)]),
        ],
      };
    }

    case 'b': {
      // Soft, organic LittlePen 'b': plump bottom bowl (no stiff vertical right wall)
      // flowing smoothly into an airy teardrop ribbon knot touching y=0.98 and gliding out at y=0.80.
      const rx = sp + 0.70;
      const ex = rx + HIGH_KNOT_REACH;
      const loop = tallUpperLoopStroke(0.52, entry);
      return {
        width: ex,
        exitKind: 'high',
        exitX: ex,
        strokes: [
          M(loop.startX, loop.startY, [
            ...loop.segments,
            C(sp, 0.16, sp + 0.12, 0.0, sp + 0.34, 0.0),
            C(sp + 0.56, 0.0, rx + 0.03, 0.26, rx - 0.01, 0.64),
            ...topRightKnotSegments(rx),
          ]),
        ],
      };
    }

    case 'c': {
      const ex = 0.45 + 0.36;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        isOvalLeft: true,
        ovalTouchLowX: 0.09,
        ovalTouchHighX: 0.19,
        strokes: [
          M(0.76, 0.82, [
            C(0.66, 1.02, 0.26, 1.04, 0.13, 0.68),
            C(0.04, 0.36, 0.14, 0.0, 0.45, 0.0),
            bowlExitSegment(0.45, 0.36),
          ]),
        ],
      };
    }

    case 'd': {
      const stemX = 0.81;
      const ex = stemX + HOOK_REACH;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        isOvalLeft: true,
        ovalTouchLowX: 0.07,
        ovalTouchHighX: 0.15,
        strokes: [
          ovalStroke(0.06, 0.75, 1.0),
          M(stemX, 2.0, [L(stemX, 0.26), ...bottomHookSegments(stemX)]),
        ],
      };
    }

    case 'e': {
      if (entry === 'from-low') {
        // Seamlessly continues the incoming C1 slope (dy/dx = 2.53) from (0.0, 0.50)
        // up into e's graceful open teardrop eye, loops softly over y=1.0, crosses cleanly to baseline,
        // and sweeps out concave-upward to (0.68, 0.50) with exact matching slope 2.53.
        const bx = 0.30;
        const ex = bx + 0.38;
        return {
          width: ex,
          exitKind: 'low',
          exitX: ex,
          strokes: [
            M(0.0, 0.50, [
              C(0.075, 0.69, 0.27, 0.83, 0.28, 0.92),
              C(0.29, 1.03, 0.07, 1.04, -0.02, 0.74),
              C(-0.10, 0.44, 0.02, 0.0, bx, 0.0),
              bowlExitSegment(bx, 0.38),
            ]),
          ],
        };
      }
      if (entry === 'from-high') {
        // Flowing from b/v/w/o top-right ribbon knot at (0.0, 0.76) (e.g., "be" in bumblebee, "we" in flower):
        // glides softly downward into e's lower eye with zero upward bump.
        const bx = 0.48;
        const ex = bx + 0.36;
        return {
          width: ex,
          exitKind: 'low',
          exitX: ex,
          strokes: [
            M(0.0, 0.76, [
              C(0.08, 0.74, 0.14, 0.56, 0.28, 0.60),
              C(0.40, 0.64, 0.52, 0.78, 0.52, 0.90),
              C(0.52, 1.03, 0.28, 1.04, 0.18, 0.74),
              C(0.08, 0.44, 0.20, 0.0, bx, 0.0),
              bowlExitSegment(bx, 0.36),
            ]),
          ],
        };
      }
      // Initial 'e'
      const bx = 0.52;
      const ex = bx + 0.36;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          M(0.02, 0.08, [
            C(0.28, 0.22, 0.68, 0.56, 0.68, 0.84),
            C(0.68, 1.03, 0.38, 1.04, 0.22, 0.74),
            C(0.06, 0.42, 0.18, 0.0, bx, 0.0),
            bowlExitSegment(bx, 0.36),
          ]),
        ],
      };
    }

    case 'f': {
      // Stylistically matched LittlePen 'f': identical tall loop + harmonious g/y descender + crossbar at y=1.0
      const ex = sp + DESC_EXIT_REACH;
      const loop = tallUpperLoopStroke(0.0, entry);
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          M(loop.startX, loop.startY, [
            ...loop.segments,
            ...deepDescenderLoopSegments(sp),
          ]),
          M(sp - 0.18, 1.0, [L(sp + 0.34, 1.0)]),
        ],
      };
    }

    case 'g': {
      const stemX = 0.81;
      const ex = stemX + DESC_EXIT_REACH;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        isOvalLeft: true,
        ovalTouchLowX: 0.07,
        ovalTouchHighX: 0.15,
        strokes: [
          ovalStroke(0.06, 0.75, 1.0),
          M(stemX, 1.0, deepDescenderLoopSegments(stemX)),
        ],
      };
    }

    case 'h': {
      const stem2 = sp + 0.64;
      const ex = stem2 + HOOK_REACH;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          tallUpperLoopStroke(0.0, entry),
          M(sp, 0.44, [
            C(sp + 0.08, 0.86, sp + 0.30, 1.02, sp + 0.48, 1.0),
            C(stem2 - 0.02, 0.98, stem2, 0.80, stem2, 0.64),
            L(stem2, 0.26),
            ...bottomHookSegments(stem2),
          ]),
        ],
      };
    }

    case 'i': {
      const stemX = entry === 'from-low' ? 0.18 : entry === 'from-high' ? 0.22 : 0.24;
      const lead = stemLeadIn(stemX, entry);
      const ex = stemX + HOOK_REACH;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          M(lead.startX, lead.startY, [lead.seg, L(stemX, 0.26), ...bottomHookSegments(stemX)]),
          DOT(stemX, 1.34),
        ],
      };
    }

    case 'j': {
      const stemX = entry === 'from-low' ? 0.22 : entry === 'from-high' ? 0.26 : 0.42;
      const lead = stemLeadIn(stemX, entry);
      const ex = stemX + DESC_EXIT_REACH;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          M(lead.startX, lead.startY, [lead.seg, ...deepDescenderLoopSegments(stemX)]),
          DOT(stemX, 1.34),
        ],
      };
    }

    case 'k': {
      const stem2 = sp + 0.66;
      const ex = stem2 + HOOK_REACH;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          tallUpperLoopStroke(0.0, entry),
          M(sp, 0.44, [
            C(sp + 0.12, 0.88, sp + 0.36, 1.02, sp + 0.54, 1.0),
            C(sp + 0.70, 0.98, sp + 0.72, 0.72, sp + 0.56, 0.56),
            C(sp + 0.44, 0.44, sp + 0.30, 0.46, sp + 0.30, 0.55),
            C(sp + 0.30, 0.64, sp + 0.50, 0.62, sp + 0.60, 0.48),
            C(stem2, 0.38, stem2, 0.28, stem2, 0.24),
            ...bottomHookSegments(stem2),
          ]),
        ],
      };
    }

    case 'l': {
      const ex = sp + HOOK_REACH;
      const loop = tallUpperLoopStroke(0.26, entry);
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          M(loop.startX, loop.startY, [...loop.segments, ...bottomHookSegments(sp)]),
        ],
      };
    }

    case 'm': {
      const s1 = entry === 'init' ? 0.44 : entry === 'from-high' ? 0.38 : 0.40;
      const s2 = s1 + 0.50;
      const s3 = s2 + 0.50;
      const ex = s3 + HOOK_REACH;
      const firstArch =
        entry === 'from-low'
          ? M(0.0, 0.50, [
              C(0.06, 0.652, 0.16, 1.02, s1 - 0.08, 1.0),
              C(s1 - 0.01, 0.98, s1, 0.86, s1, 0.76),
              L(s1, 0.0),
            ])
          : entry === 'from-high'
            ? M(0.0, 0.76, [
                C(0.08, 1.0, s1 - 0.08, 1.04, s1, 0.78),
                L(s1, 0.0),
              ])
            : M(0.04, 0.76, [
                C(0.10, 1.0, 0.36, 1.04, s1, 0.78),
                L(s1, 0.0),
              ]);
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          firstArch,
          M(s1, 0.58, [C(s1 + 0.08, 0.96, s2 - 0.08, 1.04, s2, 0.78), L(s2, 0.0)]),
          M(s2, 0.58, [
            C(s2 + 0.08, 0.96, s3 - 0.08, 1.04, s3, 0.78),
            L(s3, 0.26),
            ...bottomHookSegments(s3),
          ]),
        ],
      };
    }

    case 'n': {
      const s1 = entry === 'init' ? 0.44 : entry === 'from-high' ? 0.38 : 0.40;
      const s2 = s1 + 0.50;
      const ex = s2 + HOOK_REACH;
      const firstArch =
        entry === 'from-low'
          ? M(0.0, 0.50, [
              C(0.06, 0.652, 0.16, 1.02, s1 - 0.08, 1.0),
              C(s1 - 0.01, 0.98, s1, 0.86, s1, 0.76),
              L(s1, 0.0),
            ])
          : entry === 'from-high'
            ? M(0.0, 0.76, [
                C(0.08, 1.0, s1 - 0.08, 1.04, s1, 0.78),
                L(s1, 0.0),
              ])
            : M(0.04, 0.76, [
                C(0.10, 1.0, 0.36, 1.04, s1, 0.78),
                L(s1, 0.0),
              ]);
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          firstArch,
          M(s1, 0.58, [
            C(s1 + 0.08, 0.96, s2 - 0.08, 1.04, s2, 0.78),
            L(s2, 0.26),
            ...bottomHookSegments(s2),
          ]),
        ],
      };
    }

    case 'o': {
      // When followed by a non-oval lowercase letter (on, om, oi, ot, or, oe, ol...),
      // add a delicate LittlePen top-right connecting bridge ending cleanly at y=0.80.
      if (nextConnects && !nextIsOval) {
        const ex = 0.95;
        return {
          width: ex,
          exitKind: 'high',
          exitX: ex,
          isOvalLeft: true,
          ovalTouchLowX: 0.07,
          ovalTouchHighX: 0.15,
          strokes: [
            ovalStroke(0.06, 0.75, 1.0),
            M(0.77, 0.84, [
              C(0.70, 0.78, 0.74, 0.72, 0.84, 0.73),
              C(0.89, 0.74, 0.92, 0.75, ex, 0.76),
            ]),
          ],
        };
      }
      return {
        width: 0.89,
        exitKind: 'oval-o',
        exitX: 0.87,
        isOvalLeft: true,
        ovalTouchLowX: 0.07,
        ovalTouchHighX: 0.15,
        strokes: [ovalStroke(0.06, 0.75, 1.0)],
      };
    }

    case 'p': {
      const stemX = entry === 'from-low' ? 0.18 : entry === 'from-high' ? 0.22 : 0.24;
      const stem2 = stemX + 0.58;
      const ex = stem2 + HOOK_REACH;
      const lead = stemLeadIn(stemX, entry);
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          M(lead.startX, lead.startY, [lead.seg, L(stemX, -1.0)]),
          M(stemX, 0.56, [
            C(stemX + 0.08, 0.96, stem2 - 0.10, 1.04, stem2, 0.78),
            L(stem2, 0.26),
            ...bottomHookSegments(stem2),
          ]),
        ],
      };
    }

    case 'q': {
      return {
        width: 0.97,
        exitKind: 'stop',
        exitX: 0.95,
        isOvalLeft: true,
        ovalTouchLowX: 0.07,
        ovalTouchHighX: 0.15,
        strokes: [ovalStroke(0.06, 0.75, 1.0), M(0.81, 1.0, [L(0.81, -1.0)])],
      };
    }

    case 'r': {
      if (entry === 'from-low') {
        // Seamlessly climbs from (0.0, 0.50) at exact unified slope 2.53 into r's petite open top knot
        const stemX = 0.60;
        const ex = stemX + HOOK_REACH;
        return {
          width: ex,
          exitKind: 'low',
          exitX: ex,
          strokes: [
            M(0.0, 0.50, [
              C(0.06, 0.652, 0.18, 0.98, 0.20, 1.15),
              C(0.22, 1.25, 0.09, 1.26, 0.08, 1.14),
              C(0.07, 1.01, 0.30, 0.95, 0.48, 0.98),
              C(0.56, 0.99, stemX, 0.92, stemX, 0.74),
              L(stemX, 0.26),
              ...bottomHookSegments(stemX),
            ]),
          ],
        };
      }
      if (entry === 'from-high') {
        const stemX = 0.56;
        const ex = stemX + HOOK_REACH;
        return {
          width: ex,
          exitKind: 'low',
          exitX: ex,
          strokes: [
            M(0.0, 0.76, [
              C(0.09, 0.84, 0.18, 1.02, 0.20, 1.14),
              C(0.22, 1.24, 0.10, 1.25, 0.09, 1.14),
              C(0.08, 1.02, 0.28, 0.97, 0.44, 0.98),
              C(0.53, 0.99, stemX, 0.92, stemX, 0.74),
              L(stemX, 0.26),
              ...bottomHookSegments(stemX),
            ]),
          ],
        };
      }
      // Initial 'r'
      const stemX = 0.66;
      const ex = stemX + HOOK_REACH;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          M(0.02, 0.04, [
            C(0.14, 0.38, 0.26, 0.90, 0.28, 1.14),
            C(0.30, 1.24, 0.18, 1.25, 0.17, 1.14),
            C(0.16, 1.02, 0.36, 0.97, 0.52, 0.98),
            C(0.62, 0.99, stemX, 0.92, stemX, 0.74),
            L(stemX, 0.26),
            ...bottomHookSegments(stemX),
          ]),
        ],
      };
    }

    case 's': {
      if (entry === 'from-low') {
        return {
          width: 0.80,
          exitKind: 'stop',
          exitX: 0.76,
          strokes: [
            M(0.0, 0.50, [
              C(0.06, 0.652, 0.20, 0.98, 0.22, 1.14),
              C(0.24, 1.24, 0.12, 1.25, 0.11, 1.14),
              C(0.10, 1.02, 0.28, 0.92, 0.46, 0.80),
              C(0.66, 0.66, 0.72, 0.40, 0.64, 0.18),
              C(0.56, 0.0, 0.32, -0.02, 0.16, 0.06),
              C(0.06, 0.12, 0.08, 0.24, 0.18, 0.24),
            ]),
          ],
        };
      }
      if (entry === 'from-high') {
        return {
          width: 0.78,
          exitKind: 'stop',
          exitX: 0.74,
          strokes: [
            M(0.0, 0.76, [
              C(0.09, 0.84, 0.19, 1.02, 0.21, 1.14),
              C(0.23, 1.24, 0.11, 1.25, 0.10, 1.14),
              C(0.09, 1.02, 0.27, 0.92, 0.45, 0.80),
              C(0.65, 0.66, 0.71, 0.40, 0.63, 0.18),
              C(0.55, 0.0, 0.31, -0.02, 0.15, 0.06),
              C(0.05, 0.12, 0.07, 0.24, 0.17, 0.24),
            ]),
          ],
        };
      }
      return {
        width: 0.90,
        exitKind: 'stop',
        exitX: 0.86,
        strokes: [
          M(0.02, 0.04, [
            C(0.18, 0.38, 0.32, 0.90, 0.34, 1.14),
            C(0.36, 1.24, 0.24, 1.25, 0.23, 1.14),
            C(0.22, 1.02, 0.38, 0.92, 0.56, 0.80),
            C(0.76, 0.66, 0.82, 0.40, 0.74, 0.18),
            C(0.66, 0.0, 0.42, -0.02, 0.26, 0.06),
            C(0.16, 0.12, 0.18, 0.24, 0.28, 0.24),
          ]),
        ],
      };
    }

    case 't': {
      // Authentic LittlePen 't' (3 ô ly tall in Normal = 1.50 units, crossbar on x-height y=1.0):
      // From LOW (e.g., "cat", "butterfly"): continues the exact C2 concave-upward arc into (0.18, 1.00)
      // with zero kink or gap, then crisp straight stem 1.50->0.26 + smooth concave-upward exit hook.
      const stemX = entry === 'from-low' ? 0.18 : entry === 'from-high' ? 0.22 : 0.24;
      const lead = stemLeadIn(stemX, entry);
      const ex = stemX + HOOK_REACH;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          M(lead.startX, lead.startY, [lead.seg]),
          M(stemX, 1.50, [L(stemX, 0.26), ...bottomHookSegments(stemX)]),
          M(stemX - 0.21, 1.0, [L(stemX + 0.22, 1.0)]),
        ],
      };
    }

    case 'u': {
      const stem1 = entry === 'from-low' ? 0.18 : entry === 'from-high' ? 0.22 : 0.24;
      const stem2 = stem1 + 0.56;
      const ex = stem2 + HOOK_REACH;
      const lead = stemLeadIn(stem1, entry);
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          M(lead.startX, lead.startY, [
            lead.seg,
            L(stem1, 0.32),
            C(stem1, 0.04, stem1 + 0.16, 0.0, stem1 + 0.30, 0.0),
            C(stem1 + 0.44, 0.0, stem2 - 0.04, 0.22, stem2, 0.58),
          ]),
          M(stem2, 1.0, [L(stem2, 0.26), ...bottomHookSegments(stem2)]),
        ],
      };
    }

    case 'v': {
      const s1 = entry === 'init' ? 0.38 : entry === 'from-high' ? 0.32 : 0.36;
      const rx = s1 + 0.58;
      const ex = rx + HIGH_KNOT_REACH;
      const entrySegs: StrokeSegment[] =
        entry === 'from-low'
          ? [
              C(0.06, 0.652, 0.16, 1.02, s1 - 0.06, 1.0),
              C(s1 - 0.01, 0.98, s1, 0.86, s1, 0.76),
            ]
          : entry === 'from-high'
            ? [C(0.08, 1.0, s1 - 0.06, 1.04, s1, 0.76)]
            : [C(0.10, 1.0, 0.34, 1.04, s1, 0.76)];
      const startX = entry === 'init' ? 0.04 : 0.0;
      const startY = entry === 'from-low' ? 0.50 : entry === 'from-high' ? 0.76 : 0.76;
      return {
        width: ex,
        exitKind: 'high',
        exitX: ex,
        strokes: [
          M(startX, startY, [
            ...entrySegs,
            L(s1, 0.44),
            C(s1, 0.12, s1 + 0.12, 0.0, s1 + 0.28, 0.0),
            C(s1 + 0.46, 0.0, rx + 0.02, 0.24, rx - 0.01, 0.64),
            ...topRightKnotSegments(rx),
          ]),
        ],
      };
    }

    case 'w': {
      const stem1 = entry === 'from-low' ? 0.18 : entry === 'from-high' ? 0.22 : 0.24;
      const stem2 = stem1 + 0.56;
      const rx = stem2 + 0.58;
      const ex = rx + HIGH_KNOT_REACH;
      const lead = stemLeadIn(stem1, entry);
      return {
        width: ex,
        exitKind: 'high',
        exitX: ex,
        strokes: [
          M(lead.startX, lead.startY, [
            lead.seg,
            L(stem1, 0.34),
            C(stem1, 0.04, stem1 + 0.16, 0.0, stem1 + 0.30, 0.0),
            C(stem1 + 0.44, 0.0, stem2 - 0.04, 0.24, stem2, 0.64),
          ]),
          M(stem2, 1.0, [
            L(stem2, 0.44),
            C(stem2, 0.12, stem2 + 0.14, 0.0, stem2 + 0.30, 0.0),
            C(stem2 + 0.48, 0.0, rx + 0.02, 0.24, rx - 0.01, 0.64),
            ...topRightKnotSegments(rx),
          ]),
        ],
      };
    }

    case 'x': {
      const cx = entry === 'init' ? 0.56 : 0.46;
      const leftEntry =
        entry === 'from-low'
          ? M(0.0, 0.50, [
              C(0.06, 0.652, 0.14, 1.02, cx - 0.12, 1.0),
              C(cx - 0.02, 0.98, cx, 0.78, cx, 0.50),
              C(cx, 0.02, cx - 0.32, -0.04, cx - 0.46, 0.18),
            ])
          : entry === 'from-high'
            ? M(0.0, 0.76, [
                C(0.12, 1.02, cx - 0.02, 1.0, cx, 0.50),
                C(cx, 0.02, cx - 0.32, -0.04, cx - 0.46, 0.18),
              ])
            : M(0.12, 0.80, [
                C(0.24, 1.04, 0.54, 1.0, cx, 0.50),
                C(cx, 0.02, 0.24, -0.04, 0.08, 0.18),
              ]);
      const bx = cx + 0.26;
      const ex = bx + 0.34;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          leftEntry,
          M(cx + 0.44, 0.80, [
            C(cx + 0.32, 1.04, cx + 0.02, 1.0, cx, 0.50),
            C(cx, 0.12, cx + 0.12, 0.0, bx, 0.0),
            bowlExitSegment(bx, 0.34),
          ]),
        ],
      };
    }

    case 'y': {
      const stem1 = entry === 'from-low' ? 0.18 : entry === 'from-high' ? 0.22 : 0.24;
      const stem2 = stem1 + 0.56;
      const ex = stem2 + DESC_EXIT_REACH;
      const lead = stemLeadIn(stem1, entry);
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          M(lead.startX, lead.startY, [
            lead.seg,
            L(stem1, 0.32),
            C(stem1, 0.04, stem1 + 0.16, 0.0, stem1 + 0.30, 0.0),
            C(stem1 + 0.44, 0.0, stem2 - 0.04, 0.22, stem2, 0.58),
          ]),
          M(stem2, 1.0, deepDescenderLoopSegments(stem2)),
        ],
      };
    }

    case 'z': {
      const off = entry === 'init' ? 0.0 : 0.06;
      const bx = 0.56 + off;
      const ex = bx + 0.36;
      const topEntry: StrokeSegment[] =
        entry === 'from-low'
          ? [C(0.06, 0.652, 0.14, 0.98, 0.32, 0.98), C(0.48, 0.98, 0.64, 0.96, 0.78, 0.98)]
          : entry === 'from-high'
            ? [C(0.14, 0.98, 0.46, 0.96, 0.78, 0.98)]
            : [C(0.20, 1.02, 0.52, 0.96, 0.74, 0.98)];
      const startX = entry === 'init' ? 0.08 : 0.0;
      const startY = entry === 'from-low' ? 0.50 : entry === 'from-high' ? 0.76 : 0.82;
      return {
        width: ex,
        exitKind: 'low',
        exitX: ex,
        strokes: [
          M(startX, startY, [
            ...topEntry,
            C(0.52 + off, 0.66, 0.28 + off, 0.34, 0.10 + off, 0.04),
            C(0.26 + off, 0.0, 0.44 + off, 0.0, bx, 0.0),
            bowlExitSegment(bx, 0.36),
          ]),
        ],
      };
    }

    default:
      return null;
  }
}

// ============================================================
// UPPERCASE GLYPHS (A–Z at exact 2.5 ô ly height — QĐ 31/2002 Chữ Hoa)
// Faithfully modeled after langmaninternet/LuyenChuTieuHoc/Hướng dẫn chữ hoa
// ============================================================
const UPPERCASE: Record<string, GlyphDef> = {
  A: {
    width: 1.84,
    strokes: [
      M(0.42, 0.88, [
        C(0.10, 0.84, 0.04, 0.36, 0.20, 0.10),
        C(0.38, -0.08, 0.68, 0.04, 0.82, 0.58),
        C(0.96, 1.18, 1.12, 2.02, 1.24, 2.50),
      ]),
      M(1.24, 2.50, [
        C(1.28, 1.88, 1.30, 0.84, 1.32, 0.28),
        C(1.34, 0.0, 1.56, -0.04, 1.78, 0.42),
      ]),
      M(0.44, 0.96, [C(0.76, 1.12, 1.18, 1.12, 1.54, 0.96)]),
    ],
  },
  B: {
    width: 1.66,
    strokes: [
      M(0.92, 2.48, [
        C(0.84, 1.76, 0.76, 0.82, 0.64, 0.26),
        C(0.56, -0.04, 0.20, -0.04, 0.14, 0.26),
        C(0.08, 0.52, 0.34, 0.66, 0.54, 0.44),
      ]),
      M(0.30, 2.04, [
        C(0.14, 2.26, 0.44, 2.54, 0.92, 2.50),
        C(1.32, 2.46, 1.46, 2.14, 1.38, 1.78),
        C(1.30, 1.44, 0.98, 1.32, 0.80, 1.36),
        C(0.72, 1.38, 0.74, 1.24, 0.90, 1.24),
        C(1.30, 1.22, 1.56, 0.88, 1.50, 0.42),
        C(1.44, 0.0, 1.06, -0.04, 0.86, 0.16),
        C(0.76, 0.26, 0.84, 0.44, 0.98, 0.38),
      ]),
    ],
  },
  C: {
    width: 1.54,
    strokes: [
      M(0.74, 2.48, [
        C(0.32, 2.52, 0.10, 2.12, 0.16, 1.76),
        C(0.22, 1.42, 0.68, 1.42, 1.02, 1.82),
        C(1.26, 2.10, 1.34, 2.42, 1.14, 2.50),
        C(0.92, 2.56, 0.58, 2.20, 0.48, 1.44),
        C(0.38, 0.64, 0.62, 0.0, 1.04, 0.0),
        C(1.36, 0.0, 1.48, 0.40, 1.36, 0.74),
        C(1.24, 1.02, 0.94, 0.94, 0.96, 0.70),
      ]),
    ],
  },
  D: {
    width: 1.66,
    strokes: [
      M(0.92, 2.50, [
        C(0.84, 1.74, 0.74, 0.68, 0.56, 0.18),
        C(0.46, -0.06, 0.12, -0.02, 0.12, 0.12),
        C(0.12, 0.24, 0.36, 0.18, 0.64, 0.08),
        C(0.96, -0.04, 1.48, 0.04, 1.56, 0.88),
        C(1.64, 1.76, 1.34, 2.50, 0.76, 2.50),
        C(0.30, 2.50, 0.08, 2.16, 0.16, 1.82),
        C(0.22, 1.56, 0.50, 1.54, 0.58, 1.74),
      ]),
    ],
  },
  E: {
    width: 1.42,
    strokes: [
      M(0.76, 2.48, [
        C(0.34, 2.52, 0.10, 2.16, 0.16, 1.84),
        C(0.22, 1.52, 0.66, 1.54, 0.98, 1.88),
        C(1.20, 2.12, 1.26, 2.42, 1.08, 2.50),
        C(0.88, 2.56, 0.54, 2.24, 0.54, 1.72),
        C(0.54, 1.42, 0.74, 1.24, 0.90, 1.34),
        C(0.98, 1.40, 0.90, 1.54, 0.74, 1.48),
        C(0.42, 1.36, 0.32, 0.68, 0.52, 0.24),
        C(0.70, -0.06, 1.18, -0.04, 1.30, 0.36),
        C(1.38, 0.68, 1.16, 0.96, 0.94, 0.84),
        C(0.84, 0.76, 0.88, 0.62, 1.00, 0.62),
      ]),
    ],
  },
  F: {
    width: 1.60,
    strokes: [
      M(0.14, 2.16, [
        C(0.28, 2.52, 0.92, 2.36, 1.48, 2.48),
        C(1.56, 2.50, 1.46, 2.32, 1.30, 2.30),
      ]),
      M(0.90, 2.42, [
        C(0.82, 1.72, 0.74, 0.78, 0.64, 0.24),
        C(0.56, -0.04, 0.20, -0.04, 0.14, 0.26),
        C(0.08, 0.52, 0.34, 0.64, 0.52, 0.44),
      ]),
      M(0.42, 1.26, [C(0.72, 1.32, 1.04, 1.32, 1.28, 1.26)]),
    ],
  },
  G: {
    width: 1.66,
    strokes: [
      M(0.74, 2.48, [
        C(0.32, 2.52, 0.10, 2.12, 0.16, 1.76),
        C(0.22, 1.42, 0.68, 1.42, 1.02, 1.82),
        C(1.26, 2.10, 1.34, 2.42, 1.14, 2.50),
        C(0.92, 2.56, 0.58, 2.20, 0.48, 1.44),
        C(0.38, 0.64, 0.64, 0.0, 1.02, 0.04),
        C(1.18, 0.06, 1.26, 0.24, 1.26, 0.54),
      ]),
      M(1.26, 1.06, deepDescenderLoopSegments(1.26)),
    ],
  },
  H: {
    width: 1.76,
    strokes: [
      M(0.14, 2.12, [
        C(0.10, 2.48, 0.44, 2.56, 0.66, 2.34),
        C(0.76, 2.22, 0.74, 1.66, 0.66, 0.96),
        C(0.58, 0.34, 0.46, 0.0, 0.24, 0.02),
        C(0.08, 0.04, 0.08, 0.34, 0.26, 0.46),
        C(0.38, 0.54, 0.52, 0.44, 0.56, 0.32),
      ]),
      M(1.34, 2.48, [
        C(1.26, 1.80, 1.18, 0.80, 1.16, 0.26),
        C(1.16, 0.0, 1.44, -0.04, 1.70, 0.42),
      ]),
      M(0.42, 1.26, [C(0.74, 1.34, 1.06, 1.34, 1.36, 1.26)]),
    ],
  },
  I: {
    width: 1.30,
    strokes: [
      M(0.54, 2.16, [
        C(0.36, 2.38, 0.56, 2.56, 0.80, 2.48),
        C(0.96, 2.42, 1.06, 2.38, 1.14, 2.48),
      ]),
      M(1.14, 2.48, [
        C(1.06, 1.78, 1.00, 0.88, 0.94, 0.34),
        C(0.88, -0.02, 0.48, -0.06, 0.34, 0.22),
        C(0.24, 0.42, 0.44, 0.66, 0.68, 0.50),
      ]),
    ],
  },
  J: {
    width: 1.44,
    strokes: [
      M(0.46, 2.16, [
        C(0.28, 2.38, 0.48, 2.56, 0.72, 2.48),
        C(0.88, 2.42, 0.98, 2.38, 1.06, 2.48),
      ]),
      M(1.06, 2.48, [L(1.00, 0.20), ...deepDescenderLoopSegments(1.00)]),
    ],
  },
  K: {
    width: 1.76,
    strokes: [
      M(0.14, 2.12, [
        C(0.10, 2.48, 0.44, 2.56, 0.66, 2.34),
        C(0.76, 2.22, 0.74, 1.66, 0.66, 0.96),
        C(0.58, 0.34, 0.46, 0.0, 0.24, 0.02),
        C(0.08, 0.04, 0.08, 0.34, 0.26, 0.46),
        C(0.38, 0.54, 0.52, 0.44, 0.56, 0.32),
      ]),
      M(1.48, 2.28, [
        C(1.56, 2.48, 1.32, 2.56, 1.14, 2.34),
        C(0.94, 2.08, 0.88, 1.52, 0.70, 1.32),
        C(0.60, 1.22, 0.62, 1.14, 0.76, 1.20),
        C(1.02, 1.26, 1.14, 0.86, 1.24, 0.28),
        C(1.28, 0.0, 1.50, -0.04, 1.72, 0.42),
      ]),
    ],
  },
  L: {
    width: 1.56,
    strokes: [
      M(0.64, 2.46, [
        C(0.28, 2.48, 0.10, 2.12, 0.16, 1.80),
        C(0.22, 1.50, 0.62, 1.52, 0.94, 1.90),
        C(1.16, 2.16, 1.24, 2.44, 1.08, 2.50),
        C(0.92, 2.56, 0.82, 2.30, 0.76, 1.92),
        C(0.68, 1.34, 0.62, 0.52, 0.46, 0.16),
        C(0.38, -0.04, 0.10, -0.02, 0.12, 0.12),
        C(0.14, 0.26, 0.44, 0.18, 0.78, 0.06),
        C(1.12, -0.06, 1.36, 0.04, 1.50, 0.42),
      ]),
    ],
  },
  M: {
    width: 2.18,
    strokes: [
      M(0.32, 0.56, [
        C(0.10, 0.58, 0.06, 0.26, 0.20, 0.08),
        C(0.38, -0.08, 0.64, 0.08, 0.74, 0.74),
        C(0.84, 1.38, 0.92, 2.08, 1.00, 2.50),
      ]),
      M(1.00, 2.50, [
        L(1.06, 0.04),
        C(1.24, 0.88, 1.42, 1.82, 1.56, 2.50),
      ]),
      M(1.56, 2.50, [
        C(1.58, 1.80, 1.60, 0.78, 1.62, 0.26),
        C(1.64, 0.0, 1.86, -0.04, 2.10, 0.44),
      ]),
    ],
  },
  N: {
    width: 1.96,
    strokes: [
      M(0.32, 0.56, [
        C(0.10, 0.58, 0.06, 0.26, 0.20, 0.08),
        C(0.38, -0.08, 0.64, 0.08, 0.74, 0.74),
        C(0.84, 1.38, 0.92, 2.08, 1.00, 2.50),
      ]),
      M(1.00, 2.50, [
        L(1.24, 0.04),
        C(1.40, 0.86, 1.56, 1.78, 1.68, 2.30),
        C(1.74, 2.52, 1.94, 2.52, 1.92, 2.26),
      ]),
    ],
  },
  O: {
    width: 1.62,
    strokes: [
      M(0.86, 2.50, [
        C(0.38, 2.52, 0.12, 1.96, 0.14, 1.24),
        C(0.16, 0.46, 0.44, 0.0, 0.84, 0.0),
        C(1.28, 0.0, 1.52, 0.54, 1.48, 1.34),
        C(1.44, 2.10, 1.18, 2.52, 0.84, 2.48),
        C(0.56, 2.44, 0.54, 2.00, 0.72, 1.78),
        C(0.86, 1.62, 1.12, 1.72, 1.12, 1.96),
      ]),
    ],
  },
  P: {
    width: 1.62,
    strokes: [
      M(0.92, 2.48, [
        C(0.84, 1.76, 0.76, 0.82, 0.64, 0.26),
        C(0.56, -0.04, 0.20, -0.04, 0.14, 0.26),
        C(0.08, 0.52, 0.34, 0.66, 0.54, 0.44),
      ]),
      M(0.28, 2.02, [
        C(0.10, 2.26, 0.42, 2.54, 0.94, 2.50),
        C(1.38, 2.46, 1.54, 2.06, 1.48, 1.64),
        C(1.42, 1.24, 1.06, 1.16, 0.92, 1.36),
        C(0.84, 1.48, 0.96, 1.62, 1.10, 1.54),
      ]),
    ],
  },
  Q: {
    width: 1.76,
    strokes: [
      M(0.86, 2.50, [
        C(0.38, 2.52, 0.12, 1.96, 0.14, 1.24),
        C(0.16, 0.46, 0.44, 0.0, 0.84, 0.0),
        C(1.28, 0.0, 1.52, 0.54, 1.48, 1.34),
        C(1.44, 2.10, 1.18, 2.52, 0.84, 2.48),
        C(0.56, 2.44, 0.54, 2.00, 0.72, 1.78),
        C(0.86, 1.62, 1.12, 1.72, 1.12, 1.96),
      ]),
      M(0.14, 0.14, [
        C(0.14, 0.32, 0.48, 0.36, 0.86, 0.16),
        C(1.18, 0.0, 1.48, -0.06, 1.68, 0.38),
      ]),
    ],
  },
  R: {
    width: 1.74,
    strokes: [
      M(0.92, 2.48, [
        C(0.84, 1.76, 0.76, 0.82, 0.64, 0.26),
        C(0.56, -0.04, 0.20, -0.04, 0.14, 0.26),
        C(0.08, 0.52, 0.34, 0.66, 0.54, 0.44),
      ]),
      M(0.28, 2.02, [
        C(0.10, 2.26, 0.42, 2.54, 0.94, 2.50),
        C(1.36, 2.46, 1.48, 2.10, 1.40, 1.70),
        C(1.32, 1.36, 1.00, 1.26, 0.82, 1.32),
        C(0.74, 1.34, 0.76, 1.22, 0.90, 1.22),
        C(1.16, 1.22, 1.26, 0.82, 1.32, 0.28),
        C(1.36, 0.0, 1.54, -0.04, 1.70, 0.42),
      ]),
    ],
  },
  S: {
    width: 1.48,
    strokes: [
      M(0.62, 2.46, [
        C(0.26, 2.48, 0.10, 2.12, 0.18, 1.78),
        C(0.26, 1.46, 0.66, 1.54, 0.98, 1.92),
        C(1.22, 2.22, 1.30, 2.46, 1.12, 2.50),
        C(0.94, 2.54, 0.78, 2.24, 0.76, 1.74),
        C(0.74, 1.18, 0.82, 0.42, 0.60, 0.12),
        C(0.44, -0.08, 0.14, -0.02, 0.12, 0.28),
        C(0.10, 0.58, 0.42, 0.70, 0.60, 0.48),
      ]),
    ],
  },
  T: {
    width: 1.62,
    strokes: [
      M(0.14, 2.16, [
        C(0.16, 2.52, 0.64, 2.52, 1.08, 2.40),
        C(1.36, 2.32, 1.50, 2.40, 1.46, 2.48),
        C(1.38, 2.54, 1.04, 2.40, 0.74, 2.08),
        C(0.38, 1.70, 0.30, 0.82, 0.48, 0.30),
        C(0.64, -0.06, 1.12, -0.06, 1.36, 0.26),
        C(1.52, 0.48, 1.44, 0.88, 1.18, 0.90),
        C(0.98, 0.92, 0.92, 0.70, 1.06, 0.60),
      ]),
    ],
  },
  U: {
    width: 1.84,
    strokes: [
      M(0.16, 2.14, [
        C(0.10, 2.46, 0.38, 2.56, 0.58, 2.38),
        C(0.68, 2.28, 0.64, 1.92, 0.62, 1.46),
        L(0.60, 0.50),
        C(0.58, 0.04, 0.86, -0.04, 1.08, 0.06),
        C(1.30, 0.16, 1.38, 0.64, 1.40, 1.32),
      ]),
      M(1.42, 2.50, [L(1.40, 0.26), C(1.40, 0.0, 1.60, -0.04, 1.80, 0.42)]),
    ],
  },
  V: {
    width: 1.68,
    strokes: [
      M(0.16, 2.14, [
        C(0.10, 2.46, 0.38, 2.56, 0.58, 2.38),
        C(0.68, 2.28, 0.64, 1.88, 0.62, 1.36),
        L(0.62, 0.46),
        C(0.62, 0.04, 0.84, -0.04, 1.02, 0.04),
        C(1.22, 0.12, 1.32, 0.68, 1.36, 1.46),
        C(1.38, 2.02, 1.38, 2.48, 1.26, 2.50),
        C(1.16, 2.52, 1.18, 2.32, 1.34, 2.30),
        C(1.48, 2.28, 1.58, 2.36, 1.62, 2.46),
      ]),
    ],
  },
  W: {
    width: 2.36,
    strokes: [
      M(0.14, 2.14, [
        C(0.08, 2.46, 0.34, 2.56, 0.52, 2.38),
        C(0.60, 2.28, 0.58, 1.84, 0.56, 1.32),
        L(0.56, 0.46),
        C(0.56, 0.04, 0.78, -0.04, 0.94, 0.04),
        C(1.12, 0.14, 1.20, 0.72, 1.24, 1.56),
        L(1.28, 2.26),
      ]),
      M(1.28, 2.26, [
        L(1.30, 0.46),
        C(1.30, 0.04, 1.52, -0.04, 1.70, 0.04),
        C(1.90, 0.14, 2.00, 0.70, 2.04, 1.48),
        C(2.06, 2.02, 2.06, 2.48, 1.94, 2.50),
        C(1.84, 2.52, 1.86, 2.32, 2.02, 2.30),
        C(2.16, 2.28, 2.26, 2.36, 2.30, 2.46),
      ]),
    ],
  },
  X: {
    width: 1.66,
    strokes: [
      M(0.24, 2.08, [
        C(0.06, 2.28, 0.24, 2.54, 0.52, 2.48),
        C(0.82, 2.40, 0.86, 1.82, 0.82, 1.24),
        C(0.78, 0.56, 0.62, 0.0, 0.28, 0.0),
        C(0.08, 0.0, 0.08, 0.34, 0.28, 0.52),
      ]),
      M(1.42, 2.08, [
        C(1.60, 2.28, 1.42, 2.54, 1.14, 2.48),
        C(0.86, 2.40, 0.82, 1.82, 0.82, 1.24),
        C(0.84, 0.56, 1.02, 0.0, 1.38, 0.0),
        C(1.58, 0.0, 1.58, 0.34, 1.38, 0.52),
      ]),
    ],
  },
  Y: {
    width: 1.82,
    strokes: [
      M(0.16, 2.14, [
        C(0.10, 2.46, 0.38, 2.56, 0.58, 2.38),
        C(0.68, 2.28, 0.64, 1.92, 0.62, 1.46),
        L(0.60, 0.50),
        C(0.58, 0.04, 0.86, -0.04, 1.08, 0.06),
        C(1.30, 0.16, 1.38, 0.64, 1.40, 1.32),
      ]),
      M(1.42, 2.50, [L(1.40, 0.20), ...deepDescenderLoopSegments(1.40)]),
    ],
  },
  Z: {
    width: 1.68,
    strokes: [
      M(0.18, 2.18, [
        C(0.36, 2.54, 1.04, 2.38, 1.50, 2.48),
        C(1.12, 1.70, 0.66, 0.86, 0.24, 0.16),
        C(0.14, -0.02, 0.34, -0.04, 0.66, 0.06),
        C(1.04, 0.18, 1.36, -0.04, 1.60, 0.36),
      ]),
      M(0.56, 1.24, [L(1.18, 1.24)]),
    ],
  },
};

// Digits (0–9 at exact 2.0 ô ly height, standard Vietnamese primary numerals) & punctuation
const EXTRA: Record<string, GlyphDef> = {
  ' ': { width: 0.95, strokes: [] },
  '-': { width: 0.80, strokes: [M(0.15, 0.55, [L(0.65, 0.55)])] },
  '\'': { width: 0.42, strokes: [M(0.22, 1.75, [L(0.18, 1.30)])] },
  '’': { width: 0.42, strokes: [M(0.22, 1.75, [L(0.18, 1.30)])] },
  '.': { width: 0.42, strokes: [DOT(0.20, 0.10)] },
  ',': { width: 0.46, strokes: [M(0.22, 0.14, [C(0.22, -0.04, 0.16, -0.20, 0.08, -0.32)])] },
  '!': { width: 0.52, strokes: [M(0.26, 2.2, [L(0.26, 0.45)]), DOT(0.26, 0.10)] },
  '?': {
    width: 0.96,
    strokes: [
      M(0.18, 1.80, [
        C(0.22, 2.22, 0.82, 2.22, 0.80, 1.68),
        C(0.78, 1.28, 0.48, 1.14, 0.48, 0.62),
      ]),
      DOT(0.48, 0.12),
    ],
  },
  '/': { width: 0.84, strokes: [M(0.72, 2.1, [L(0.12, -0.2)])] },
  '(': { width: 0.62, strokes: [M(0.48, 2.1, [C(0.16, 1.5, 0.16, 0.4, 0.48, -0.2)])] },
  ')': { width: 0.62, strokes: [M(0.14, 2.1, [C(0.46, 1.5, 0.46, 0.4, 0.14, -0.2)])] },
  '0': { width: 1.06, strokes: [ovalStroke(0.10, 0.86, 2.0)] },
  '1': { width: 0.90, strokes: [M(0.22, 1.48, [L(0.56, 2.0), L(0.56, 0.0)])] },
  '2': {
    width: 1.06,
    strokes: [
      M(0.16, 1.56, [
        C(0.22, 2.12, 0.90, 2.12, 0.88, 1.48),
        C(0.86, 0.96, 0.40, 0.44, 0.14, 0.0),
        L(0.94, 0.0),
      ]),
    ],
  },
  '3': {
    width: 1.06,
    strokes: [
      M(0.18, 1.72, [
        C(0.32, 2.10, 0.88, 2.08, 0.84, 1.52),
        C(0.80, 1.16, 0.54, 1.06, 0.36, 1.04),
        C(0.78, 1.02, 0.92, 0.70, 0.88, 0.34),
        C(0.84, -0.04, 0.30, -0.06, 0.14, 0.28),
      ]),
    ],
  },
  '4': {
    width: 1.08,
    strokes: [
      M(0.72, 2.0, [L(0.12, 0.68), L(0.96, 0.68)]),
      M(0.72, 1.42, [L(0.72, 0.0)]),
    ],
  },
  '5': {
    width: 1.06,
    strokes: [
      M(0.86, 2.0, [
        L(0.24, 2.0),
        L(0.20, 1.12),
        C(0.52, 1.32, 0.92, 1.04, 0.90, 0.50),
        C(0.88, -0.04, 0.32, -0.06, 0.16, 0.24),
      ]),
    ],
  },
  '6': {
    width: 1.06,
    strokes: [
      M(0.80, 1.94, [
        C(0.46, 2.10, 0.14, 1.46, 0.14, 0.66),
        C(0.14, -0.04, 0.88, -0.04, 0.90, 0.56),
        C(0.92, 1.10, 0.36, 1.14, 0.16, 0.72),
      ]),
    ],
  },
  '7': {
    width: 1.04,
    strokes: [
      M(0.14, 2.0, [L(0.90, 2.0), L(0.40, 0.0)]),
      M(0.32, 1.04, [L(0.76, 1.04)]),
    ],
  },
  '8': {
    width: 1.06,
    strokes: [
      M(0.54, 2.0, [
        C(0.18, 2.0, 0.16, 1.42, 0.54, 1.10),
        C(0.96, 0.76, 0.94, 0.0, 0.52, 0.0),
        C(0.12, 0.0, 0.12, 0.76, 0.54, 1.10),
        C(0.90, 1.42, 0.88, 2.0, 0.54, 2.0),
      ]),
    ],
  },
  '9': {
    width: 1.06,
    strokes: [
      M(0.86, 1.78, [
        C(0.74, 2.04, 0.22, 2.04, 0.14, 1.52),
        C(0.10, 1.02, 0.62, 0.96, 0.86, 1.38),
      ]),
      M(0.88, 1.94, [
        L(0.84, 0.46),
        C(0.82, 0.02, 0.46, -0.04, 0.24, 0.14),
      ]),
    ],
  },
};

// Build extra diacritic strokes for Vietnamese letters via Unicode NFD decomposition
function getDiacriticStrokes(
  marks: string[],
  centerX: number,
  isUpper: boolean
): GlyphStroke[] {
  const result: GlyphStroke[] = [];
  const baseTop = isUpper ? 2.62 : 1.16;
  let hasLetterAccent = false;

  for (const mark of marks) {
    if (mark === '\u0302') {
      hasLetterAccent = true;
      result.push(
        M(centerX - 0.22, baseTop + 0.04, [
          L(centerX, baseTop + 0.26),
          L(centerX + 0.22, baseTop + 0.04),
        ])
      );
    } else if (mark === '\u0306') {
      hasLetterAccent = true;
      result.push(
        M(centerX - 0.22, baseTop + 0.24, [
          C(centerX - 0.12, baseTop, centerX + 0.12, baseTop, centerX + 0.22, baseTop + 0.24),
        ])
      );
    } else if (mark === '\u031B') {
      result.push(
        M(centerX + 0.36, isUpper ? 2.48 : 1.06, [
          C(
            centerX + 0.56,
            isUpper ? 2.44 : 1.04,
            centerX + 0.54,
            isUpper ? 2.16 : 0.78,
            centerX + 0.34,
            isUpper ? 2.14 : 0.78
          ),
        ])
      );
    }
  }

  const toneY = hasLetterAccent ? baseTop + 0.34 : baseTop + 0.10;
  for (const mark of marks) {
    if (mark === '\u0301') {
      result.push(M(centerX + 0.16, toneY + 0.24, [L(centerX - 0.08, toneY)]));
    } else if (mark === '\u0300') {
      result.push(M(centerX - 0.14, toneY + 0.24, [L(centerX + 0.10, toneY)]));
    } else if (mark === '\u0309') {
      result.push(
        M(centerX - 0.10, toneY + 0.24, [
          C(centerX + 0.16, toneY + 0.30, centerX + 0.18, toneY + 0.08, centerX - 0.02, toneY + 0.04),
          L(centerX - 0.02, toneY - 0.08),
        ])
      );
    } else if (mark === '\u0303') {
      result.push(
        M(centerX - 0.20, toneY + 0.06, [
          C(centerX - 0.08, toneY + 0.26, centerX + 0.08, toneY - 0.06, centerX + 0.22, toneY + 0.16),
        ])
      );
    } else if (mark === '\u0323') {
      result.push(DOT(centerX, -0.28));
    }
  }

  return result;
}

const OVAL_LEFT_CHARS = new Set(['a', 'c', 'd', 'g', 'o', 'q']);

function decomposeChar(char: string): { base: string; marks: string[]; isLower: boolean; isDbar: boolean } {
  if (char === 'đ') return { base: 'd', marks: [], isLower: true, isDbar: true };
  if (char === 'Đ') return { base: 'D', marks: [], isLower: false, isDbar: true };
  const nfd = char.normalize('NFD');
  const base = nfd[0] || char;
  const marks = nfd.length > 1 ? [...nfd.slice(1)] : [];
  const isLower = base >= 'a' && base <= 'z';
  return { base, marks, isLower, isDbar: false };
}

export function resolveGlyph(
  char: string,
  entry: EntryKind = 'init',
  nextConnects = false,
  nextIsOval = false
): GlyphDef {
  const { base, marks, isLower, isDbar } = decomposeChar(char);

  if (isLower) {
    const baseGlyph = buildLowercaseGlyph(base, entry, nextConnects, nextIsOval);
    if (baseGlyph) {
      let strokes = baseGlyph.strokes;
      if (isDbar) {
        strokes = [...strokes, M(0.56, 1.50, [L(1.00, 1.50)])];
      }
      if (marks.length > 0) {
        const centerX = base === 'e' && entry !== 'init' ? 0.22 : baseGlyph.width * 0.42;
        strokes = [...strokes, ...getDiacriticStrokes(marks, centerX, false)];
      }
      return strokes === baseGlyph.strokes ? baseGlyph : { ...baseGlyph, strokes };
    }
  }

  if (UPPERCASE[base]) {
    const baseGlyph = UPPERCASE[base];
    let strokes = baseGlyph.strokes;
    if (isDbar) {
      strokes = [...strokes, M(0.24, 1.24, [L(0.92, 1.24)])];
    }
    if (marks.length > 0) {
      strokes = [...strokes, ...getDiacriticStrokes(marks, baseGlyph.width * 0.46, true)];
    }
    return strokes === baseGlyph.strokes ? baseGlyph : { ...baseGlyph, strokes };
  }

  if (EXTRA[char]) return EXTRA[char];

  return { width: 0.72, strokes: [] };
}

export interface PositionedGlyph {
  char: string;
  x: number;
  glyph: GlyphDef;
}

export function layoutVietText(text: string): { glyphs: PositionedGlyph[]; totalUnits: number } {
  const chars = [...text];
  const meta = chars.map(decomposeChar);
  const glyphs: PositionedGlyph[] = [];
  let cursor = 0;
  let prevExitKind: ExitKind | null = null;
  let prevExitAbsX = 0;

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const info = meta[i];
    const nextInfo = i + 1 < meta.length ? meta[i + 1] : null;
    const nextConnects = Boolean(nextInfo && nextInfo.isLower);
    const nextIsOval = Boolean(nextInfo && nextInfo.isLower && OVAL_LEFT_CHARS.has(nextInfo.base));

    let entry: EntryKind = 'init';
    if (info.isLower) {
      if (prevExitKind === 'low') entry = 'from-low';
      else if (prevExitKind === 'high') entry = 'from-high';
    }

    const glyph = resolveGlyph(ch, entry, nextConnects, nextIsOval);

    let gx = cursor;
    if (info.isLower && prevExitKind) {
      if (prevExitKind === 'low') {
        if (glyph.isOvalLeft) {
          // Previous bottom hook sweeps directly to kiss the left belly of a/c/d/đ/g/o/q
          gx = prevExitAbsX - (glyph.ovalTouchLowX ?? 0.07);
        } else {
          // Exact point-to-point C2 join at (prevExitAbsX, 0.50)
          gx = prevExitAbsX;
        }
      } else if (prevExitKind === 'high') {
        if (glyph.isOvalLeft) {
          // High ribbon knot (b/v/w) kisses upper-left shoulder of a/c/d/đ/g/o/q
          gx = prevExitAbsX - (glyph.ovalTouchHighX ?? 0.15);
        } else {
          // Exact point-to-point join at (prevExitAbsX, 0.80)
          gx = prevExitAbsX;
        }
      } else if (prevExitKind === 'oval-o') {
        // Pure oval 'o' followed by another oval (oo, oa, og, od, oc): crisp tight optical kiss
        gx = prevExitAbsX - 0.02;
      } else if (prevExitKind === 'stop') {
        // After q or s: clean small breathing room before next initial lowercase letter
        gx = prevExitAbsX + 0.02;
      }
    }

    glyphs.push({ char: ch, x: gx, glyph });

    if (info.isLower) {
      prevExitKind = glyph.exitKind ?? 'stop';
      prevExitAbsX = gx + (glyph.exitX ?? glyph.width);
      cursor = gx + glyph.width;
    } else {
      prevExitKind = null;
      const gap = ch === ' ' ? 0 : 0.04;
      cursor = gx + glyph.width + gap;
      prevExitAbsX = cursor;
    }
  }

  return { glyphs, totalUnits: Math.max(0, cursor) };
}

interface MergedWorldStroke {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  segments: StrokeSegment[];
}

/**
 * Flattens positioned glyphs into world-space strokes and merges connected cursive strokes
 * whose endpoints coincide (e.g., a->t, t->r->e->e, b->u->m->b->l->e->b->e->e) into single
 * unbroken Bézier paths — preventing cap blobs and keeping dashed tracing continuous.
 */
function collectMergedStrokes(glyphs: PositionedGlyph[]): {
  paths: MergedWorldStroke[];
  dots: Array<{ x: number; y: number }>;
} {
  const paths: MergedWorldStroke[] = [];
  const dots: Array<{ x: number; y: number }> = [];
  const EPS = 0.005;

  for (const item of glyphs) {
    const gx = item.x;
    for (const s of item.glyph.strokes) {
      if (s.isDot) {
        dots.push({ x: gx + s.startX, y: s.startY });
        continue;
      }
      if (s.segments.length === 0) continue;

      const sx = gx + s.startX;
      const sy = s.startY;
      const worldSegs: StrokeSegment[] = s.segments.map((seg) =>
        seg.kind === 'L'
          ? { kind: 'L', x: gx + seg.x, y: seg.y }
          : {
              kind: 'C',
              x1: gx + seg.x1,
              y1: seg.y1,
              x2: gx + seg.x2,
              y2: seg.y2,
              x: gx + seg.x,
              y: seg.y,
            }
      );
      const lastSeg = worldSegs[worldSegs.length - 1];
      const ex = lastSeg.x;
      const ey = lastSeg.y;

      // Search recent open paths for an exact endpoint-to-startpoint cursive continuation
      let merged = false;
      for (let pIdx = paths.length - 1; pIdx >= Math.max(0, paths.length - 6); pIdx -= 1) {
        const prev = paths[pIdx];
        if (Math.abs(prev.endX - sx) <= EPS && Math.abs(prev.endY - sy) <= EPS) {
          prev.segments.push(...worldSegs);
          prev.endX = ex;
          prev.endY = ey;
          merged = true;
          break;
        }
      }

      if (!merged) {
        paths.push({ startX: sx, startY: sy, endX: ex, endY: ey, segments: worldSegs });
      }
    }
  }

  return { paths, dots };
}

export function measureVietTextUnits(text: string): number {
  return layoutVietText(text).totalUnits;
}

export interface VietDrawOptions {
  color?: string;
  pdfColor?: RGB;
  strokeWidthUnits?: number;
  dashed?: boolean;
}

// ============================================================
// HTML5 CANVAS RENDERER (Exact ô ly unit coordinates)
// ============================================================
export function drawVietTextCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  startX: number,
  baselineY: number,
  unitPx: number,
  options: VietDrawOptions = {}
): number {
  const { glyphs, totalUnits } = layoutVietText(text);
  const { paths, dots } = collectMergedStrokes(glyphs);
  const strokeColor = options.color || '#1E293B';
  const strokeW = Math.max(0.7, (options.strokeWidthUnits ?? 0.070) * unitPx);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = strokeColor;
  ctx.lineWidth = strokeW;
  if (options.dashed) {
    ctx.setLineDash([Math.max(1.4, unitPx * 0.15), Math.max(1.3, unitPx * 0.14)]);
  }

  for (const p of paths) {
    ctx.beginPath();
    ctx.moveTo(startX + p.startX * unitPx, baselineY - p.startY * unitPx);
    for (const seg of p.segments) {
      if (seg.kind === 'L') {
        ctx.lineTo(startX + seg.x * unitPx, baselineY - seg.y * unitPx);
      } else {
        ctx.bezierCurveTo(
          startX + seg.x1 * unitPx,
          baselineY - seg.y1 * unitPx,
          startX + seg.x2 * unitPx,
          baselineY - seg.y2 * unitPx,
          startX + seg.x * unitPx,
          baselineY - seg.y * unitPx
        );
      }
    }
    ctx.stroke();
  }

  for (const d of dots) {
    ctx.beginPath();
    ctx.arc(
      startX + d.x * unitPx,
      baselineY - d.y * unitPx,
      Math.max(0.85, strokeW * 0.72),
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  ctx.restore();

  return totalUnits * unitPx;
}

// ============================================================
// PDF-LIB VECTOR PATH RENDERER (Native PDF Bézier operators)
// ============================================================
export function drawVietTextPdf(
  page: PDFPage,
  text: string,
  startX: number,
  baselineY: number,
  unitPt: number,
  options: VietDrawOptions = {}
): number {
  const { glyphs, totalUnits } = layoutVietText(text);
  const { paths, dots } = collectMergedStrokes(glyphs);
  const strokeColor = options.pdfColor || rgb(0.12, 0.16, 0.24);
  const strokeW = Math.max(0.45, (options.strokeWidthUnits ?? 0.070) * unitPt);

  const ops = [
    pushGraphicsState(),
    setLineCap(LineCapStyle.Round),
    setLineJoin(LineJoinStyle.Round),
    setLineWidth(strokeW),
    setStrokingColor(strokeColor),
  ];

  if (options.dashed) {
    const dash = Math.max(0.9, unitPt * 0.15);
    const gap = Math.max(0.85, unitPt * 0.14);
    ops.push(setDashPattern([dash, gap], 0));
  }

  for (const p of paths) {
    ops.push(moveTo(startX + p.startX * unitPt, baselineY + p.startY * unitPt));
    for (const seg of p.segments) {
      if (seg.kind === 'L') {
        ops.push(lineTo(startX + seg.x * unitPt, baselineY + seg.y * unitPt));
      } else {
        ops.push(
          appendBezierCurve(
            startX + seg.x1 * unitPt,
            baselineY + seg.y1 * unitPt,
            startX + seg.x2 * unitPt,
            baselineY + seg.y2 * unitPt,
            startX + seg.x * unitPt,
            baselineY + seg.y * unitPt
          )
        );
      }
    }
    ops.push(stroke());
  }

  ops.push(popGraphicsState());
  page.pushOperators(...ops);

  for (const d of dots) {
    page.drawCircle({
      x: startX + d.x * unitPt,
      y: baselineY + d.y * unitPt,
      size: Math.max(0.55, strokeW * 0.72),
      color: strokeColor,
    });
  }

  return totalUnits * unitPt;
}

// ============================================================
// INLINE SVG PATH HELPER (for crisp UI Font Selector preview)
// ============================================================
export function vietTextToSvgData(
  text: string,
  unit = 10
): { width: number; height: number; baselineY: number; pathD: string; dots: Array<{ cx: number; cy: number }> } {
  const { glyphs, totalUnits } = layoutVietText(text);
  const { paths, dots: rawDots } = collectMergedStrokes(glyphs);
  const padX = unit * 0.35;
  const baselineY = unit * 2.8;
  const height = unit * 4.3;
  const width = Math.max(unit * 2, totalUnits * unit + padX * 2);
  const parts: string[] = [];

  for (const p of paths) {
    parts.push(`M ${(padX + p.startX * unit).toFixed(2)} ${(baselineY - p.startY * unit).toFixed(2)}`);
    for (const seg of p.segments) {
      if (seg.kind === 'L') {
        parts.push(`L ${(padX + seg.x * unit).toFixed(2)} ${(baselineY - seg.y * unit).toFixed(2)}`);
      } else {
        parts.push(
          `C ${(padX + seg.x1 * unit).toFixed(2)} ${(baselineY - seg.y1 * unit).toFixed(2)}, ${(padX + seg.x2 * unit).toFixed(2)} ${(baselineY - seg.y2 * unit).toFixed(2)}, ${(padX + seg.x * unit).toFixed(2)} ${(baselineY - seg.y * unit).toFixed(2)}`
        );
      }
    }
  }

  const dots = rawDots.map((d) => ({
    cx: padX + d.x * unit,
    cy: baselineY - d.y * unit,
  }));

  return { width, height, baselineY, pathD: parts.join(' '), dots };
}
