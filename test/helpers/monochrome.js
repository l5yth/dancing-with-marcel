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

/**
 * @file Monochrome checker (SPEC invariant 5): only `#000` and `#fff`, and none
 * of the effects that would produce grey (alpha, gradients, shadows, blur,
 * filters). Named colors are caught on color-carrying properties; a named
 * color inside an arbitrary custom property is a known limit.
 */

const COLOR_PROPERTY =
  /^(color|background(-color|-image)?|border(-[a-z]+)*|outline(-[a-z]+)*|fill|stroke|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?)$/;
const EFFECT_PROPERTY =
  /^(opacity|filter|backdrop-filter|box-shadow|text-shadow|mix-blend-mode|-webkit-mask(-[a-z-]+)?|mask(-[a-z-]+)?)$/;
const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color-mix|color)\(/i;
const EFFECT_VALUE =
  /\b(?:repeating-)?(?:linear|radial|conic)-gradient\(|\bblur\(|\bdrop-shadow\(/i;
const ALLOWED_COLOR =
  /^(#000|#000000|#fff|#ffffff|black|white|transparent|currentcolor|inherit|initial|unset|none|var\(--(?:fg|bg)\))$/i;
const NEUTRAL_TOKEN =
  /^(?:[\d.]+(?:px|em|rem|%|vmin|vmax|vw|vh)?|solid|dashed|dotted|double|groove|ridge|inset|outset|hidden|thin|medium|thick|auto|underline|overline|line-through|no-repeat|repeat|center|cover|contain|!important)$/i;

/**
 * Remove CSS comments.
 *
 * @param {string} css CSS source.
 * @returns {string} The source without comments.
 */
export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Every `property: value` pair in a piece of CSS. Selectors and at-rules that
 * contain a colon also match; their "property" is never a color property.
 *
 * @param {string} css CSS source.
 * @returns {{ property: string, value: string }[]} The declarations.
 */
export function declarations(css) {
  return [...stripComments(css).matchAll(/([a-zA-Z-]+)\s*:\s*([^;{}]+)/g)].map((match) => ({
    property: match[1].toLowerCase(),
    value: match[2].trim(),
  }));
}

/**
 * The CSS inside an HTML page: `<style>` blocks and `style` attributes.
 *
 * @param {string} html HTML source.
 * @returns {string} All the CSS, joined.
 */
export function collectCss(html) {
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  const attributes = [...html.matchAll(/\bstyle="([^"]*)"/gi)].map((match) => match[1]);
  return [...blocks, ...attributes].join('\n');
}

/**
 * Find everything in a piece of CSS that breaks the monochrome rule.
 *
 * @param {string} css CSS source.
 * @returns {string[]} One `property: value` line per violation.
 */
export function findViolations(css) {
  /** @type {string[]} */
  const violations = [];
  for (const { property, value } of declarations(css)) {
    const line = `${property}: ${value}`;
    if (EFFECT_PROPERTY.test(property) || EFFECT_VALUE.test(value)) {
      violations.push(line);
      continue;
    }
    for (const token of value.split(/[\s,]+/).filter(Boolean)) {
      const colorLike = COLOR_LITERAL.test(token);
      const unknownOnColorProperty =
        COLOR_PROPERTY.test(property) && !ALLOWED_COLOR.test(token) && !NEUTRAL_TOKEN.test(token);
      if ((colorLike && !ALLOWED_COLOR.test(token)) || (!colorLike && unknownOnColorProperty)) {
        violations.push(line);
        break;
      }
    }
  }
  return violations;
}
