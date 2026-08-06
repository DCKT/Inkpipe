export interface NavLink {
  type: "link";
  numeral: string;
  label: string;
  path: string;
  end?: boolean;
}

export interface NavSubLink {
  label: string;
  path: string;
  end?: boolean;
}

export interface NavSection {
  type: "section";
  numeral: string;
  label: string;
  children: NavSubLink[];
}

export type NavEntry = NavLink | NavSection;

/** Primary spine nav entries (numerals I-VI). Order matters — mirrors the sidebar. */
export const NAV_ITEMS: NavEntry[] = [
  {
    type: "section",
    numeral: "I",
    label: "Search",
    children: [
      { label: "Prowlarr", path: "/", end: true },
      { label: "Anna's Archive", path: "/annas-archive" },
    ],
  },
  { type: "link", numeral: "II", label: "Komga", path: "/komga" },
  { type: "link", numeral: "III", label: "Watches", path: "/watches" },
  {
    type: "section",
    numeral: "IV",
    label: "Utils",
    children: [{ label: "CBZ to EPUB", path: "/convert" }],
  },
];

/** Settings sits below the divider as numeral VI, visually quieter. */
export const SETTINGS_NAV_ITEM: NavLink = {
  type: "link",
  numeral: "VI",
  label: "Settings",
  path: "/settings",
};

/** Flattens sections into their children — used by flat presentations (mobile tab strip). */
export function flattenNavEntries(entries: NavEntry[]): NavSubLink[] {
  return entries.flatMap((entry) =>
    entry.type === "section"
      ? entry.children
      : [{ label: entry.label, path: entry.path, end: entry.end }],
  );
}
