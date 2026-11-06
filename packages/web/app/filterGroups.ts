import type { FilterGroup, FilterGroupMode } from "@inkpipe/shared"
import { Array as Arr, String as Str } from "effect"

// Pure edits on a watch's filter groups (see ADR 0006: groups are AND'd together,
// each group matches its substrings with ALL or ANY).

export const emptyGroup: FilterGroup = { mode: "AND", substrings: [""] }

export const addGroup = (groups: ReadonlyArray<FilterGroup>): ReadonlyArray<FilterGroup> => [
  ...groups,
  emptyGroup,
]

export const removeGroup = (
  groups: ReadonlyArray<FilterGroup>,
  index: number,
): ReadonlyArray<FilterGroup> => groups.filter((_, position) => position !== index)

const mapGroup = (
  groups: ReadonlyArray<FilterGroup>,
  index: number,
  change: (group: FilterGroup) => FilterGroup,
): ReadonlyArray<FilterGroup> =>
  groups.map((group, position) => (position === index ? change(group) : group))

export const setMode = (
  groups: ReadonlyArray<FilterGroup>,
  index: number,
  mode: FilterGroupMode,
): ReadonlyArray<FilterGroup> => mapGroup(groups, index, (group) => ({ ...group, mode }))

export const setSubstring = (
  groups: ReadonlyArray<FilterGroup>,
  groupIndex: number,
  substringIndex: number,
  value: string,
): ReadonlyArray<FilterGroup> =>
  mapGroup(groups, groupIndex, (group) => ({
    ...group,
    substrings: group.substrings.map((substring, position) =>
      position === substringIndex ? value : substring,
    ),
  }))

export const addSubstring = (
  groups: ReadonlyArray<FilterGroup>,
  groupIndex: number,
): ReadonlyArray<FilterGroup> =>
  mapGroup(groups, groupIndex, (group) => ({ ...group, substrings: [...group.substrings, ""] }))

export const removeSubstring = (
  groups: ReadonlyArray<FilterGroup>,
  groupIndex: number,
  substringIndex: number,
): ReadonlyArray<FilterGroup> =>
  mapGroup(groups, groupIndex, (group) => ({
    ...group,
    substrings: group.substrings.filter((_, position) => position !== substringIndex),
  }))

/** What gets saved: blank substrings dropped, then groups left with nothing dropped. */
export const cleanGroups = (groups: ReadonlyArray<FilterGroup>): ReadonlyArray<FilterGroup> =>
  groups
    .map((group) => ({
      ...group,
      substrings: group.substrings.filter((substring) => Str.trim(substring) !== ""),
    }))
    .filter((group) => Arr.isReadonlyArrayNonEmpty(group.substrings))
