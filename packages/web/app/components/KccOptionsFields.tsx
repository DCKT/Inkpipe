import type { KccConfig } from "../lib/types";
import { Checkbox } from "../ui/checkbox";
import { Select, createListCollection } from "../ui/select";
import { Field } from "../ui/field";
import { Input } from "../ui/input";

interface KccOptionsFieldsProps {
  value: KccConfig;
  onChange: (patch: Partial<KccConfig>) => void;
  excludeDockerImage?: boolean;
}

export const kccFormatItems = ["Auto", "MOBI", "EPUB", "CBZ", "KFX", "PDF"];
export const croppingItems = [
  { value: "0", label: "Disabled" },
  { value: "1", label: "Standard" },
  { value: "2", label: "Aggressive" },
];
export const splitterItems = [
  { value: "0", label: "Disabled" },
  { value: "1", label: "Rotate" },
  { value: "2", label: "Split" },
];
export const batchSplitItems = [
  { value: "0", label: "Disabled" },
  { value: "1", label: "Into chapters" },
  { value: "2", label: "Into volumes" },
];

const formatCollection = createListCollection({ items: kccFormatItems });
const croppingCollection = createListCollection({
  items: croppingItems,
  itemToString: (item) => (item as { value: string; label: string }).label,
});
const splitterCollection = createListCollection({
  items: splitterItems,
  itemToString: (item) => (item as { value: string; label: string }).label,
});
const batchSplitCollection = createListCollection({
  items: batchSplitItems,
  itemToString: (item) => (item as { value: string; label: string }).label,
});

const subheadingClass =
  "text-xs font-semibold uppercase tracking-wider text-secondary mt-4 mb-2";

const selectIndicator = (
  <Select.Indicator>
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-secondary">
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </Select.Indicator>
);

export default function KccOptionsFields({
  value,
  onChange,
  excludeDockerImage,
}: KccOptionsFieldsProps) {
  return (
    <div className="space-y-4">
      <p className={subheadingClass}>Device &amp; Format</p>
      {!excludeDockerImage && (
        <Field.Root>
          <Field.Label>Docker Image</Field.Label>
          <Input
            type="text"
            placeholder="ghcr.io/ciromattia/kcc:latest"
            value={value.dockerImage}
            onChange={(e) => onChange({ dockerImage: e.target.value })}
          />
        </Field.Root>
      )}
      <Field.Root>
        <Field.Label>Profile</Field.Label>
        <Input
          type="text"
          placeholder="KoBO"
          value={value.profile}
          onChange={(e) => onChange({ profile: e.target.value })}
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>Format</Field.Label>
        <Select.Root
          collection={formatCollection}
          value={[value.format]}
          onValueChange={(details: { items: string[] }) =>
            onChange({ format: details.items[0] as KccConfig["format"] })
          }
        >
          <Select.Trigger>
            <Select.ValueText />
            {selectIndicator}
          </Select.Trigger>
          <Select.Positioner>
            <Select.Content>
              {kccFormatItems.map((f) => (
                <Select.Item key={f} item={f}>
                  <Select.ItemText>{f}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Select.Root>
      </Field.Root>

      <p className={subheadingClass}>Reading Mode</p>
      <Checkbox.Root
        checked={value.mangaStyle}
        onCheckedChange={(details) => onChange({ mangaStyle: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>Manga Style (right-to-left)</Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={value.webtoon}
        onCheckedChange={(details) => onChange({ webtoon: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>Webtoon mode</Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={value.twoPanel}
        onCheckedChange={(details) => onChange({ twoPanel: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>Two-panel mode</Checkbox.Label>
      </Checkbox.Root>

      <p className={subheadingClass}>Image Processing</p>
      <Checkbox.Root
        checked={value.upscale}
        onCheckedChange={(details) => onChange({ upscale: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>Upscale</Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={value.stretch}
        onCheckedChange={(details) => onChange({ stretch: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>Stretch</Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={value.hq}
        onCheckedChange={(details) => onChange({ hq: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>High quality</Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={value.forceColor}
        onCheckedChange={(details) => onChange({ forceColor: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>Force color</Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={value.forcePng}
        onCheckedChange={(details) => onChange({ forcePng: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>Force PNG</Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={value.noAutoContrast}
        onCheckedChange={(details) => onChange({ noAutoContrast: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>Disable auto contrast</Checkbox.Label>
      </Checkbox.Root>
      <Field.Root>
        <Field.Label>Gamma</Field.Label>
        <Field.Input
          type="number"
          step="0.1"
          min="0.1"
          value={value.gamma}
          onChange={(e) => onChange({ gamma: parseFloat(e.target.value) || 1.0 })}
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>Cropping</Field.Label>
        <Select.Root
          collection={croppingCollection}
          value={[value.cropping]}
          onValueChange={(details: { items: string[] }) =>
            onChange({ cropping: details.items[0] as "0" | "1" | "2" })
          }
        >
          <Select.Trigger>
            <Select.ValueText />
            {selectIndicator}
          </Select.Trigger>
          <Select.Positioner>
            <Select.Content>
              {croppingItems.map((it) => (
                <Select.Item key={it.value} item={it}>
                  <Select.ItemText>{it.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Select.Root>
      </Field.Root>
      <Field.Root>
        <Field.Label>Cropping Power</Field.Label>
        <Field.Input
          type="number"
          step="0.1"
          min="0.1"
          value={value.croppingPower}
          onChange={(e) => onChange({ croppingPower: parseFloat(e.target.value) || 1.0 })}
        />
      </Field.Root>

      <p className={subheadingClass}>Borders</p>
      <Checkbox.Root
        checked={value.blackBorders}
        onCheckedChange={(details) => onChange({ blackBorders: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>Black borders</Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={value.whiteBorders}
        onCheckedChange={(details) => onChange({ whiteBorders: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>White borders</Checkbox.Label>
      </Checkbox.Root>

      <p className={subheadingClass}>Advanced</p>
      <Field.Root>
        <Field.Label>Splitter</Field.Label>
        <Select.Root
          collection={splitterCollection}
          value={[value.splitter]}
          onValueChange={(details: { items: string[] }) =>
            onChange({ splitter: details.items[0] as "0" | "1" | "2" })
          }
        >
          <Select.Trigger>
            <Select.ValueText />
            {selectIndicator}
          </Select.Trigger>
          <Select.Positioner>
            <Select.Content>
              {splitterItems.map((it) => (
                <Select.Item key={it.value} item={it}>
                  <Select.ItemText>{it.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Select.Root>
      </Field.Root>
      <Checkbox.Root
        checked={value.noProcessing}
        onCheckedChange={(details) => onChange({ noProcessing: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>No processing</Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={value.eraseRainbow}
        onCheckedChange={(details) => onChange({ eraseRainbow: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>Erase rainbow</Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={value.coverFill}
        onCheckedChange={(details) => onChange({ coverFill: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>Cover fill</Checkbox.Label>
      </Checkbox.Root>

      <p className={subheadingClass}>Output</p>
      <Field.Root>
        <Field.Label>Batch Split</Field.Label>
        <Select.Root
          collection={batchSplitCollection}
          value={[value.batchSplit]}
          onValueChange={(details: { items: string[] }) =>
            onChange({ batchSplit: details.items[0] as "0" | "1" | "2" })
          }
        >
          <Select.Trigger>
            <Select.ValueText />
            {selectIndicator}
          </Select.Trigger>
          <Select.Positioner>
            <Select.Content>
              {batchSplitItems.map((it) => (
                <Select.Item key={it.value} item={it}>
                  <Select.ItemText>{it.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Select.Root>
      </Field.Root>
      <Field.Root>
        <Field.Label>Target Size (KB, 0 = auto)</Field.Label>
        <Field.Input
          type="number"
          min="0"
          value={value.targetSize}
          onChange={(e) => onChange({ targetSize: parseInt(e.target.value) || 0 })}
        />
      </Field.Root>

      <p className={subheadingClass}>Device-specific</p>
      <Field.Root>
        <Field.Label>Custom Width (0 = auto)</Field.Label>
        <Field.Input
          type="number"
          min="0"
          value={value.customWidth}
          onChange={(e) => onChange({ customWidth: parseInt(e.target.value) || 0 })}
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>Custom Height (0 = auto)</Field.Label>
        <Field.Input
          type="number"
          min="0"
          value={value.customHeight}
          onChange={(e) => onChange({ customHeight: parseInt(e.target.value) || 0 })}
        />
      </Field.Root>
      <Checkbox.Root
        checked={value.noKepub}
        onCheckedChange={(details) => onChange({ noKepub: !!details.checked })}
      >
        <Checkbox.Control />
        <Checkbox.Label>Disable Kepub</Checkbox.Label>
      </Checkbox.Root>
    </div>
  );
}
