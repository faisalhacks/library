// Finds [[Note Title]] links in markdown. Also accepts [[Title|shown text]]
// and [[Title#Heading]]; only the title part is used.
export function parseWikiLinks(body: string): string[] {
  const titles = new Set<string>();
  for (const match of body.matchAll(/\[\[([^\[\]\n]+?)\]\]/g)) {
    const title = match[1].split("|")[0].split("#")[0].trim();
    if (title) titles.add(title);
  }
  return [...titles];
}

export function titleKey(title: string) {
  return title.trim().toLowerCase();
}
