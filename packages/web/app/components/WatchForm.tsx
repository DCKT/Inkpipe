import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../hooks/useApiClient";
import type { Watch, FilterGroup, FilterGroupMode } from "../lib/types";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { ToastGroup } from "../ui/toast";

export function WatchFormDialog({
  existing,
  onCreated,
}: {
  existing?: Watch;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(existing?.name ?? "");
  const [query, setQuery] = useState(existing?.query ?? "");
  const [intervalSeconds, setIntervalSeconds] = useState(
    String(existing?.intervalSeconds ?? 3600),
  );
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>(
    existing?.filterGroups ? [...existing.filterGroups] : [],
  );

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setQuery(existing.query);
      setIntervalSeconds(String(existing.intervalSeconds));
      setFilterGroups([...existing.filterGroups]);
    }
  }, [existing]);

  const isEdit = !!existing;

  const createMutation = useMutation({
    mutationFn: (body: {
      name: string;
      query: string;
      intervalSeconds: number;
      filterGroups: FilterGroup[];
    }) => api.post("watches", { json: body }).json<Watch>(),
    onSuccess: () => {
      ToastGroup.create.success("Watch created");
      setOpen(false);
      onCreated();
    },
    onError: (err) => {
      ToastGroup.create.error("Failed to create watch", err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (body: {
      name: string;
      query: string;
      intervalSeconds: number;
      filterGroups: FilterGroup[];
    }) => api.put(`watches/${existing!.id}`, { json: body }).json<Watch>(),
    onSuccess: () => {
      ToastGroup.create.success("Watch updated. Restart scheduled.");
      setOpen(false);
      onCreated();
    },
    onError: (err) => {
      ToastGroup.create.error("Failed to update watch", err.message);
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const addGroup = () => {
    setFilterGroups([
      ...filterGroups,
      { mode: "AND" as FilterGroupMode, substrings: [""] },
    ]);
  };

  const removeGroup = (idx: number) => {
    setFilterGroups(filterGroups.filter((_, i) => i !== idx));
  };

  const updateGroupMode = (idx: number, mode: FilterGroupMode) => {
    setFilterGroups(
      filterGroups.map((g, i) => (i === idx ? { ...g, mode } : g)),
    );
  };

  const updateSubstring = (groupIdx: number, subIdx: number, value: string) => {
    setFilterGroups(
      filterGroups.map((g, i) =>
        i === groupIdx
          ? {
              ...g,
              substrings: g.substrings.map((s, j) =>
                j === subIdx ? value : s,
              ),
            }
          : g,
      ),
    );
  };

  const addSubstring = (groupIdx: number) => {
    setFilterGroups(
      filterGroups.map((g, i) =>
        i === groupIdx ? { ...g, substrings: [...g.substrings, ""] } : g,
      ),
    );
  };

  const removeSubstring = (groupIdx: number, subIdx: number) => {
    setFilterGroups(
      filterGroups.map((g, i) =>
        i === groupIdx
          ? { ...g, substrings: g.substrings.filter((_, j) => j !== subIdx) }
          : g,
      ),
    );
  };

  const handleSubmit = () => {
    if (!name.trim() || !query.trim()) return;
    const body = {
      name: name.trim(),
      query: query.trim(),
      intervalSeconds: Math.max(Number(intervalSeconds) || 3600, 300),
      filterGroups: filterGroups
        .map((g) => ({
          ...g,
          substrings: g.substrings.filter((s) => s.trim() !== ""),
        }))
        .filter((g) => g.substrings.length > 0),
    };
    if (isEdit) {
      updateMutation.mutate(body);
    } else {
      createMutation.mutate(body);
    }
  };

  return (
    <>
      <Button
        variant={isEdit ? "ghost" : "primary"}
        onClick={() => setOpen(true)}
      >
        {isEdit ? "Edit" : "+ New Watch"}
      </Button>
      <Dialog.Root
        open={open}
        onOpenChange={(details: { open: boolean }) => setOpen(details.open)}
      >
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content className="max-w-lg w-full max-h-[80vh] overflow-y-auto p-4">
            <Dialog.Title className="text-lg font-bold text-[var(--sea-ink)]">
              {isEdit ? "Edit Watch" : "Create Watch"}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-[var(--sea-ink-soft)] mb-4">
              Set up a recurring Prowlarr search with title filters.
            </Dialog.Description>

            <div className="space-y-4">
              <Field.Root>
                <Field.Label>Name</Field.Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  placeholder="One Piece - Digital Color"
                />
              </Field.Root>

              <Field.Root>
                <Field.Label>Prowlarr Query</Field.Label>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                  placeholder="one piece"
                />
              </Field.Root>

              <Field.Root>
                <Field.Label>Interval (seconds, min 300)</Field.Label>
                <Input
                  type="number"
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(e.currentTarget.value)}
                  placeholder="3600"
                />
              </Field.Root>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--sea-ink)]">
                    Title Filters
                  </span>
                  <button
                    className="text-xs text-[var(--lagoon)] hover:text-[var(--lagoon-deep)]"
                    onClick={addGroup}
                  >
                    + Add Group
                  </button>
                </div>

                {filterGroups.length === 0 && (
                  <p className="text-xs text-[var(--sea-ink-soft)]">
                    No filters applied — all results for this query will match.
                  </p>
                )}

                {filterGroups.map((group, gi) => (
                  <div
                    key={gi}
                    className="border border-[var(--line)] rounded-xl p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--sea-ink-soft)]">
                          Group {gi + 1}
                        </span>
                        <span className="text-xs text-[var(--sea-ink-soft)]">
                          Mode
                        </span>
                        <select
                          value={group.mode}
                          onChange={(e) =>
                            updateGroupMode(
                              gi,
                              e.currentTarget.value as FilterGroupMode,
                            )
                          }
                          className="text-xs rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1"
                        >
                          <option value="AND">AND</option>
                          <option value="OR">OR</option>
                        </select>
                      </div>
                      <button
                        className="text-xs text-red-500 hover:text-red-700"
                        onClick={() => removeGroup(gi)}
                      >
                        Remove
                      </button>
                    </div>

                    {group.substrings.map((sub, si) => (
                      <div key={si} className="flex items-center gap-2">
                        <Input
                          value={sub}
                          onChange={(e) =>
                            updateSubstring(gi, si, e.currentTarget.value)
                          }
                          placeholder="string to match..."
                          className="flex-1"
                        />
                        {group.substrings.length > 1 && (
                          <button
                            className="text-xs text-red-500 hover:text-red-700 px-1"
                            onClick={() => removeSubstring(gi, si)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      className="text-xs text-[var(--lagoon)] hover:text-[var(--lagoon-deep)]"
                      onClick={() => addSubstring(gi)}
                    >
                      + Add substring
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Dialog.CloseTrigger asChild>
                <Button variant="ghost">Cancel</Button>
              </Dialog.CloseTrigger>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending
                  ? "Saving..."
                  : isEdit
                    ? "Save Changes"
                    : "Create Watch"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </>
  );
}
