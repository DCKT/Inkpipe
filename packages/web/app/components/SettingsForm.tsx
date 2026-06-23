import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AppConfig, KomgaLibrary } from "../lib/types";
import { api } from "../hooks/useApiClient";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Select, createListCollection } from "../ui/select";
import { Field } from "../ui/field";
import { Input } from "../ui/input";

interface SettingsFormProps {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
  isSaving: boolean;
}

interface KomgaDefaultLibrarySelectProps {
  savedConfig: AppConfig;
  value: string;
  onChange: (id: string) => void;
}

function KomgaDefaultLibrarySelect({
  savedConfig,
  value,
  onChange,
}: KomgaDefaultLibrarySelectProps) {
  const hasCredentials = !!(savedConfig.komga.url && savedConfig.komga.apiKey);

  const librariesQuery = useQuery({
    queryKey: ["komga-libraries"],
    queryFn: () => api.post("komga/libraries").json<KomgaLibrary[]>(),
    staleTime: 5 * 60 * 1000,
    enabled: hasCredentials,
    retry: false,
  });

  const libraries = librariesQuery.data ?? [];
  const items = [{ id: "", name: "All libraries" }, ...libraries];
  const collection = createListCollection({
    items,
    itemToString: (item) => (item as { id: string; name: string }).name,
  });

  return (
    <Field.Root>
      <Field.Label>Default Library</Field.Label>
      <Select.Root
        collection={collection}
        value={[value]}
        onValueChange={(details: { items: string[] }) =>
          onChange(details.items[0] ?? "")
        }
        disabled={
          !hasCredentials || librariesQuery.isLoading || librariesQuery.isError
        }
      >
        <Select.Trigger>
          <Select.ValueText
            placeholder={
              !hasCredentials
                ? "Save URL & API key first"
                : librariesQuery.isLoading
                  ? "Loading libraries..."
                  : librariesQuery.isError
                    ? "Failed to load libraries"
                    : "All libraries"
            }
          />
          <Select.Indicator>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className="text-secondary"
            >
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Select.Indicator>
        </Select.Trigger>
        <Select.Positioner>
          <Select.Content>
            {items.map((lib) => (
              <Select.Item key={lib.id} item={lib}>
                <Select.ItemText>{lib.name}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Select.Root>
    </Field.Root>
  );
}

const kccFormatItems = ["Auto", "MOBI", "EPUB", "CBZ", "KFX", "PDF"];
const croppingItems = [
  { value: "0", label: "Disabled" },
  { value: "1", label: "Standard" },
  { value: "2", label: "Aggressive" },
];
const splitterItems = [
  { value: "0", label: "Disabled" },
  { value: "1", label: "Rotate" },
  { value: "2", label: "Split" },
];
const batchSplitItems = [
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

export default function SettingsForm({
  config,
  onSave,
  isSaving,
}: SettingsFormProps) {
  const [form, setForm] = useState<AppConfig>(config);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  const setKcc = (patch: Partial<AppConfig["kcc"]>) =>
    setForm({ ...form, kcc: { ...form.kcc, ...patch } });

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-2 items-start  gap-4"
    >
      <fieldset className="island-shell rounded-2xl p-6">
        <legend className="island-kicker mb-3 px-1">Prowlarr</legend>
        <div className="space-y-4">
          <Field.Root>
            <Field.Label>URL</Field.Label>
            <Field.Input
              type="url"
              placeholder="http://localhost:9696"
              value={form.prowlarr.url}
              onChange={(e) =>
                setForm({
                  ...form,
                  prowlarr: { ...form.prowlarr, url: e.target.value },
                })
              }
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>API Key</Field.Label>
            <Field.Input
              type="password"
              placeholder="Your Prowlarr API key"
              value={form.prowlarr.apiKey}
              onChange={(e) =>
                setForm({
                  ...form,
                  prowlarr: { ...form.prowlarr, apiKey: e.target.value },
                })
              }
            />
          </Field.Root>
        </div>
      </fieldset>

      <fieldset className="island-shell rounded-2xl p-6">
        <legend className="island-kicker mb-3 px-1">AllDebrid</legend>
        <Field.Root>
          <Field.Label>API Key</Field.Label>
          <Field.Input
            type="password"
            placeholder="Your AllDebrid API key"
            value={form.alldebrid.apiKey}
            onChange={(e) =>
              setForm({
                ...form,
                alldebrid: { ...form.alldebrid, apiKey: e.target.value },
              })
            }
          />
        </Field.Root>
      </fieldset>

      <fieldset className="island-shell rounded-2xl p-6">
        <legend className="island-kicker mb-3 px-1">KCC</legend>
        <div className="space-y-4">
          <p className={subheadingClass}>Device &amp; Format</p>
          <Field.Root>
            <Field.Label>Docker Image</Field.Label>
            <Input
              type="text"
              placeholder="ghcr.io/ciromattia/kcc:latest"
              value={form.kcc.dockerImage}
              onChange={(e) => setKcc({ dockerImage: e.target.value })}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Profile</Field.Label>
            <Input
              type="text"
              placeholder="KoBO"
              value={form.kcc.profile}
              onChange={(e) => setKcc({ profile: e.target.value })}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Format</Field.Label>
            <Select.Root
              collection={formatCollection}
              value={[form.kcc.format]}
              onValueChange={(details: { items: string[] }) =>
                setKcc({
                  format: details.items[0] as AppConfig["kcc"]["format"],
                })
              }
            >
              <Select.Trigger>
                <Select.ValueText />
                <Select.Indicator>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="text-secondary"
                  >
                    <path
                      d="M3 4.5L6 7.5L9 4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Select.Indicator>
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
            checked={form.kcc.mangaStyle}
            onCheckedChange={(details) =>
              setKcc({ mangaStyle: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>Manga Style (right-to-left)</Checkbox.Label>
          </Checkbox.Root>
          <Checkbox.Root
            checked={form.kcc.webtoon}
            onCheckedChange={(details) =>
              setKcc({ webtoon: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>Webtoon mode</Checkbox.Label>
          </Checkbox.Root>
          <Checkbox.Root
            checked={form.kcc.twoPanel}
            onCheckedChange={(details) =>
              setKcc({ twoPanel: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>Two-panel mode</Checkbox.Label>
          </Checkbox.Root>

          <p className={subheadingClass}>Image Processing</p>
          <Checkbox.Root
            checked={form.kcc.upscale}
            onCheckedChange={(details) =>
              setKcc({ upscale: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>Upscale</Checkbox.Label>
          </Checkbox.Root>
          <Checkbox.Root
            checked={form.kcc.stretch}
            onCheckedChange={(details) =>
              setKcc({ stretch: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>Stretch</Checkbox.Label>
          </Checkbox.Root>
          <Checkbox.Root
            checked={form.kcc.hq}
            onCheckedChange={(details) => setKcc({ hq: !!details.checked })}
          >
            <Checkbox.Control />
            <Checkbox.Label>High quality</Checkbox.Label>
          </Checkbox.Root>
          <Checkbox.Root
            checked={form.kcc.forceColor}
            onCheckedChange={(details) =>
              setKcc({ forceColor: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>Force color</Checkbox.Label>
          </Checkbox.Root>
          <Checkbox.Root
            checked={form.kcc.forcePng}
            onCheckedChange={(details) =>
              setKcc({ forcePng: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>Force PNG</Checkbox.Label>
          </Checkbox.Root>
          <Checkbox.Root
            checked={form.kcc.noAutoContrast}
            onCheckedChange={(details) =>
              setKcc({ noAutoContrast: !!details.checked })
            }
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
              value={form.kcc.gamma}
              onChange={(e) =>
                setKcc({ gamma: parseFloat(e.target.value) || 1.0 })
              }
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Cropping</Field.Label>
            <Select.Root
              collection={croppingCollection}
              value={[form.kcc.cropping]}
              onValueChange={(details: { items: string[] }) =>
                setKcc({ cropping: details.items[0] as "0" | "1" | "2" })
              }
            >
              <Select.Trigger>
                <Select.ValueText />
                <Select.Indicator>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="text-secondary"
                  >
                    <path
                      d="M3 4.5L6 7.5L9 4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Select.Indicator>
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
              value={form.kcc.croppingPower}
              onChange={(e) =>
                setKcc({ croppingPower: parseFloat(e.target.value) || 1.0 })
              }
            />
          </Field.Root>

          <p className={subheadingClass}>Borders</p>
          <Checkbox.Root
            checked={form.kcc.blackBorders}
            onCheckedChange={(details) =>
              setKcc({ blackBorders: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>Black borders</Checkbox.Label>
          </Checkbox.Root>
          <Checkbox.Root
            checked={form.kcc.whiteBorders}
            onCheckedChange={(details) =>
              setKcc({ whiteBorders: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>White borders</Checkbox.Label>
          </Checkbox.Root>

          <p className={subheadingClass}>Advanced</p>
          <Field.Root>
            <Field.Label>Splitter</Field.Label>
            <Select.Root
              collection={splitterCollection}
              value={[form.kcc.splitter]}
              onValueChange={(details: { items: string[] }) =>
                setKcc({ splitter: details.items[0] as "0" | "1" | "2" })
              }
            >
              <Select.Trigger>
                <Select.ValueText />
                <Select.Indicator>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="text-secondary"
                  >
                    <path
                      d="M3 4.5L6 7.5L9 4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Select.Indicator>
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
            checked={form.kcc.noProcessing}
            onCheckedChange={(details) =>
              setKcc({ noProcessing: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>No processing</Checkbox.Label>
          </Checkbox.Root>
          <Checkbox.Root
            checked={form.kcc.eraseRainbow}
            onCheckedChange={(details) =>
              setKcc({ eraseRainbow: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>Erase rainbow</Checkbox.Label>
          </Checkbox.Root>
          <Checkbox.Root
            checked={form.kcc.coverFill}
            onCheckedChange={(details) =>
              setKcc({ coverFill: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>Cover fill</Checkbox.Label>
          </Checkbox.Root>

          <p className={subheadingClass}>Output</p>
          <Field.Root>
            <Field.Label>Batch Split</Field.Label>
            <Select.Root
              collection={batchSplitCollection}
              value={[form.kcc.batchSplit]}
              onValueChange={(details: { items: string[] }) =>
                setKcc({ batchSplit: details.items[0] as "0" | "1" | "2" })
              }
            >
              <Select.Trigger>
                <Select.ValueText />
                <Select.Indicator>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="text-secondary"
                  >
                    <path
                      d="M3 4.5L6 7.5L9 4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Select.Indicator>
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
              value={form.kcc.targetSize}
              onChange={(e) =>
                setKcc({ targetSize: parseInt(e.target.value) || 0 })
              }
            />
          </Field.Root>

          <p className={subheadingClass}>Device-specific</p>
          <Field.Root>
            <Field.Label>Custom Width (0 = auto)</Field.Label>
            <Field.Input
              type="number"
              min="0"
              value={form.kcc.customWidth}
              onChange={(e) =>
                setKcc({ customWidth: parseInt(e.target.value) || 0 })
              }
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Custom Height (0 = auto)</Field.Label>
            <Field.Input
              type="number"
              min="0"
              value={form.kcc.customHeight}
              onChange={(e) =>
                setKcc({ customHeight: parseInt(e.target.value) || 0 })
              }
            />
          </Field.Root>
          <Checkbox.Root
            checked={form.kcc.noKepub}
            onCheckedChange={(details) =>
              setKcc({ noKepub: !!details.checked })
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>Disable Kepub</Checkbox.Label>
          </Checkbox.Root>
        </div>
      </fieldset>

      <fieldset className="island-shell rounded-2xl p-6">
        <legend className="island-kicker mb-3 px-1">Copyparty</legend>
        <div className="space-y-4">
          <Field.Root>
            <Field.Label>URL</Field.Label>
            <Field.Input
              type="url"
              placeholder="http://localhost:3923"
              value={form.copyparty.url}
              onChange={(e) =>
                setForm({
                  ...form,
                  copyparty: { ...form.copyparty, url: e.target.value },
                })
              }
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Upload Path</Field.Label>
            <Field.Input
              type="text"
              placeholder="/"
              value={form.copyparty.uploadPath}
              onChange={(e) =>
                setForm({
                  ...form,
                  copyparty: { ...form.copyparty, uploadPath: e.target.value },
                })
              }
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Password (leave empty if none)</Field.Label>
            <Field.Input
              type="password"
              placeholder="Password"
              value={form.copyparty.password}
              onChange={(e) =>
                setForm({
                  ...form,
                  copyparty: { ...form.copyparty, password: e.target.value },
                })
              }
            />
          </Field.Root>
        </div>
      </fieldset>

      <fieldset className="island-shell rounded-2xl p-6">
        <legend className="island-kicker mb-3 px-1">Komga</legend>
        <div className="space-y-4">
          <Field.Root>
            <Field.Label>URL</Field.Label>
            <Field.Input
              type="url"
              placeholder="https://komga.example.com"
              value={form.komga.url}
              onChange={(e) =>
                setForm({
                  ...form,
                  komga: { ...form.komga, url: e.target.value },
                })
              }
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>API Key</Field.Label>
            <Field.Input
              type="password"
              placeholder="Your Komga API key"
              value={form.komga.apiKey}
              onChange={(e) =>
                setForm({
                  ...form,
                  komga: { ...form.komga, apiKey: e.target.value },
                })
              }
            />
          </Field.Root>
          <KomgaDefaultLibrarySelect
            savedConfig={config}
            value={form.komga.defaultLibraryId}
            onChange={(id) =>
              setForm({
                ...form,
                komga: { ...form.komga, defaultLibraryId: id },
              })
            }
          />
        </div>
      </fieldset>

      <Button
        type="submit"
        variant="submit"
        disabled={isSaving}
        className="col-span-2"
      >
        {isSaving ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}
