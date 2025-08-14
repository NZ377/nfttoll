const FAMILY_SYNONYMS: Record<string, string[]> = {
  black: ["black"],
  white: ["white"],
  gray: ["gray", "grey", "charcoal", "silver", "ash", "slate"],
  brown: ["brown", "beige", "tan", "chocolate", "umber", "sepia", "khaki", "camel", "sand"],
  red: ["red", "maroon", "crimson", "burgundy", "scarlet", "ruby"],
  orange: ["orange", "amber", "tangerine", "apricot", "carrot"],
  yellow: ["yellow", "gold", "golden", "mustard", "lemon"],
  green: ["green", "olive", "lime", "chartreuse", "emerald", "jade", "mint"],
  teal: ["teal", "turquoise", "aqua", "cyan", "aquamarine"],
  blue: ["blue", "navy", "azure", "cobalt", "cerulean", "sapphire", "indigo"],
  purple: ["purple", "violet", "lavender", "plum", "lilac"],
  pink: ["pink", "magenta", "fuchsia", "rose", "salmon"],
}

const ALIAS_TO_FAMILY: Record<string, string> = Object.entries(FAMILY_SYNONYMS).reduce(
  (acc, [family, words]) => {
    words.forEach((w) => (acc[w] = family))
    return acc
  },
  {} as Record<string, string>,
)

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\-_\s]/gu, " ")
    .split(/[\s\-_]+/g)
    .filter(Boolean)
}

export function colorFamilyFromName(name: string): string | null {
  const tokens = tokenize(name)

  // exact token match first
  for (const t of tokens) {
    if (ALIAS_TO_FAMILY[t]) return ALIAS_TO_FAMILY[t]
  }

  // substring fallback (e.g., "silvered" -> gray)
  for (const t of tokens) {
    for (const alias in ALIAS_TO_FAMILY) {
      if (t.includes(alias) || alias.includes(t)) {
        return ALIAS_TO_FAMILY[alias]
      }
    }
  }

  return null
}
