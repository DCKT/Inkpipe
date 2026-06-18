# FilterGroup DSL for Watch title matching

The Watch feature needs a title filter language. We chose a simplified model of groups AND'd together, where each group has an AND/OR mode for its substrings, rather than a full boolean expression parser (`"(a AND b) OR (c AND d)"`).

The group model (`[[a, b] AND], [[c, d] OR]` — all groups AND'd) covers the common use case (must contain X, and also one of Y/Z) without requiring a parser, parentheses, or operator precedence handling. It is also trivially representable as JSON for API and SQLite storage.

If future needs demand arbitrary nesting, the schema would need migration. This trade-off accepts that risk in favor of simplicity.
