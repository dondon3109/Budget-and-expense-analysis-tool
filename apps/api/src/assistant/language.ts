/**
 * The Tagalog and Taglish function words every language check shares, so a word added for
 * one check is seen by the others. Topic modules append their own vocabulary through
 * `tagalogWordPattern`, which keeps domain words next to the pattern that needs them.
 */
const TAGALOG_CORE_WORDS =
  "mga|ang|ng|sa|ko|akin|aking|ako|mo|inyo|kanila|ano|magkano|alin|saan|bakit|paano|kumusta|gastos|nagastos|nagasta|kinita|kita|sweldo|sahod|pera|bangko|utang|badyet|buwan|taon|araw|kahapon|ngayon|kanina|subukan|ipakita|pakita|hanapin|meron|mayroon|walang|kabuuan";

/**
 * Builds the whole-word Tagalog check for one module. Callers compile it once at module
 * scope and reuse the regular expression.
 */
export function tagalogWordPattern(...extraWords: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${[TAGALOG_CORE_WORDS, ...extraWords].join("|")})\\b`, "i");
}
