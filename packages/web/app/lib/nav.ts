export interface NavItem {
  numeral: string;
  label: string;
  path: string;
  end?: boolean;
}

/** Primary spine nav items (numerals I-VI). Order matters — mirrors the sidebar. */
export const NAV_ITEMS: NavItem[] = [
  { numeral: "I", label: "Search", path: "/", end: true },
  { numeral: "II", label: "Latest", path: "/latest" },
  { numeral: "III", label: "Komga", path: "/komga" },
  { numeral: "IV", label: "Jobs", path: "/jobs" },
  { numeral: "V", label: "Watches", path: "/watches" },
  { numeral: "VI", label: "Convert", path: "/convert" },
];

/** Settings sits below the divider as numeral VII, visually quieter. */
export const SETTINGS_NAV_ITEM: NavItem = {
  numeral: "VII",
  label: "Settings",
  path: "/settings",
};
