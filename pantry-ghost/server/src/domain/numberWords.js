/**
 * Spoken numbers up to "one hundred" (Req 4.2). Pure.
 */
export const ONES = Object.freeze([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
]);
export const TENS = Object.freeze({ twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 });

const ORDINAL_ONES = Object.freeze({
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  eighteenth: 18, nineteenth: 19,
});
const ORDINAL_TENS = Object.freeze({ twentieth: 20, thirtieth: 30 });

const onesValue = (w) => {
  const i = ONES.indexOf(w);
  return i >= 0 ? i : null;
};

/** Splits "twenty-four" into ["twenty", "four"] so callers see one word per token. */
function parts(token) {
  return String(token ?? '').split('-').filter(Boolean);
}

/**
 * Reads a cardinal number starting at tokens[i]: numerals ("12"), words ("twelve",
 * "twenty four", "twenty-four", "one hundred", "a hundred") and "a dozen"/"two dozen".
 * @param {string[]} tokens - lowercase tokens
 * @param {number} i
 * @returns {{ value: number, length: number } | null}
 */
export function readNumber(tokens, i) {
  const t = tokens[i];
  if (t === undefined) return null;
  if (/^\d+(\.\d+)?$/.test(t)) {
    const value = Number(t);
    if (tokens[i + 1] === 'dozen') return { value: value * 12, length: 2 };
    return { value, length: 1 };
  }

  if ((t === 'a' || t === 'an' || t === 'one') && tokens[i + 1] === 'hundred') return { value: 100, length: 2 };
  if (t === 'a' && tokens[i + 1] === 'dozen') return { value: 12, length: 2 };
  if (t === 'half' && tokens[i + 1] === 'a' && tokens[i + 2] === 'dozen') return { value: 6, length: 3 };
  if (t === 'hundred') return { value: 100, length: 1 };

  const p = parts(t);
  let value = null;
  let length = 1;
  if (p.length === 2 && TENS[p[0]] !== undefined && onesValue(p[1]) > 0 && onesValue(p[1]) < 10) {
    value = TENS[p[0]] + onesValue(p[1]);
  } else if (p.length === 1 && TENS[p[0]] !== undefined) {
    value = TENS[p[0]];
    const next = onesValue(tokens[i + 1]);
    if (next !== null && next > 0 && next < 10) {
      value += next;
      length = 2;
    }
  } else if (p.length === 1 && onesValue(p[0]) !== null) {
    value = onesValue(p[0]);
  }
  if (value === null) return null;
  if (tokens[i + length] === 'dozen') return { value: value * 12, length: length + 1 };
  return { value, length };
}

/**
 * Reads a day-of-month ordinal or cardinal: "3", "3rd", "third", "twenty third", "twenty-third", "31st".
 * @returns {{ value: number, length: number } | null}
 */
export function readDayNumber(tokens, i) {
  const t = tokens[i];
  if (t === undefined) return null;
  const m = /^(\d{1,2})(st|nd|rd|th)?$/.exec(t);
  if (m) return { value: Number(m[1]), length: 1 };

  const p = parts(t);
  if (p.length === 2 && TENS[p[0]] !== undefined && ORDINAL_ONES[p[1]] !== undefined && ORDINAL_ONES[p[1]] < 10) {
    return { value: TENS[p[0]] + ORDINAL_ONES[p[1]], length: 1 };
  }
  if (p.length === 1 && TENS[p[0]] !== undefined) {
    const next = tokens[i + 1];
    if (ORDINAL_ONES[next] !== undefined && ORDINAL_ONES[next] < 10) return { value: TENS[p[0]] + ORDINAL_ONES[next], length: 2 };
    const n = onesValue(next);
    if (n !== null && n > 0 && n < 10) return { value: TENS[p[0]] + n, length: 2 };
    return { value: TENS[p[0]], length: 1 };
  }
  if (ORDINAL_ONES[t] !== undefined) return { value: ORDINAL_ONES[t], length: 1 };
  if (ORDINAL_TENS[t] !== undefined) return { value: ORDINAL_TENS[t], length: 1 };
  if (onesValue(t) !== null) return { value: onesValue(t), length: 1 };
  return null;
}

/** 42 → "forty two" (0–100). Used by tests and spoken answers. */
export function numberToWords(n, { hyphen = false } = {}) {
  if (!Number.isInteger(n) || n < 0 || n > 100) return String(n);
  if (n === 100) return 'one hundred';
  if (n < 20) return ONES[n];
  const tens = Object.keys(TENS).find((k) => TENS[k] === n - (n % 10));
  return n % 10 === 0 ? tens : `${tens}${hyphen ? '-' : ' '}${ONES[n % 10]}`;
}

/** 3 → "third", 23 → "twenty third" (1–31). */
export function ordinalWords(n, { hyphen = false } = {}) {
  const byValue = Object.fromEntries(Object.entries({ ...ORDINAL_ONES, ...ORDINAL_TENS }).map(([k, v]) => [v, k]));
  if (byValue[n]) return byValue[n];
  const tens = Object.keys(TENS).find((k) => TENS[k] === n - (n % 10));
  return `${tens}${hyphen ? '-' : ' '}${byValue[n % 10]}`;
}
