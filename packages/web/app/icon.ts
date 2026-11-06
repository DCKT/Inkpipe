import { type Html, inertHtml as ih } from "foldkit/html"

export const inkpipeMark = (size: number): Html =>
  ih.svg(
    [
      ih.Width(String(size)),
      ih.Height(String(size)),
      ih.ViewBox("0 0 100 100"),
      ih.Fill("none"),
      ih.AriaHidden(true),
    ],
    [
      ih.path([
        ih.D(
          "M50 10 L78 46 C86 57 86 72 74 82 C63 91 50 90 42 80 C36 72 38 61 46 54 L50 50 L54 54 C58 58 58 64 54 68 C51 71 47 70 45 67",
        ),
        ih.Stroke("currentColor"),
        ih.StrokeWidth("7"),
        ih.StrokeLinecap("round"),
        ih.StrokeLinejoin("round"),
      ]),
      ih.circle([ih.Cx("50"), ih.Cy("28"), ih.R("5"), ih.Fill("var(--color-accent)")]),
    ],
  )

export const menu = (className: string): Html =>
  ih.svg(
    [
      ih.AriaHidden(true),
      ih.Class(className),
      ih.ViewBox("0 0 24 24"),
      ih.Fill("none"),
      ih.Stroke("currentColor"),
      ih.StrokeWidth("1.5"),
    ],
    [
      ih.path([
        ih.StrokeLinecap("round"),
        ih.StrokeLinejoin("round"),
        ih.D("M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"),
      ]),
    ],
  )
