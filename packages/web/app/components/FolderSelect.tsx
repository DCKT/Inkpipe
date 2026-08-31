import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListCollection } from "@ark-ui/react";
import { runApi } from "../lib/apiClient";
import { Combobox } from "../ui/combobox";

interface FolderItem {
  label: string;
  value: string;
}

const NEW_OPTION = "[[new]]";

// `value` may be a raw, never-encoded string typed by the user (a
// newly-created folder name), not just a URI-encoded name from Copyparty's
// folder listing — decodeURIComponent throws on a lone "%" or a malformed
// escape, so this must tolerate that instead of crashing the component.
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface FolderSelectProps {
  value: string;
  onChange: (value: string, isNewFolder: boolean) => void;
  label?: string;
  placeholder?: string;
  // Parent's dialog open state. FolderSelect can live inside a dialog that
  // never unmounts on close (e.g. WatchForm), so mount-time fetching alone
  // won't pick up folders created since the last time it was open — refetch
  // explicitly whenever the dialog opens.
  open?: boolean;
}

export default function FolderSelect({
  value,
  onChange,
  label = "Subfolder",
  placeholder = "e.g. manga/action or leave empty",
  open,
}: FolderSelectProps) {
  const foldersQuery = useQuery({
    queryKey: ["copyparty-folders"],
    queryFn: () =>
      runApi((client) => client.copyparty.listFolders({})).then((r) => r.folders),
  });

  useEffect(() => {
    if (open) foldersQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const folders = foldersQuery.data ?? [];

  const { collection, filter, set, upsert, remove } =
    useListCollection<FolderItem>({
      initialItems: [],
      filter: (itemText, filterText) =>
        itemText.toLowerCase().includes(filterText.toLowerCase()),
    });

  // Sync collection when folders query loads
  useEffect(() => {
    if (foldersQuery.data) {
      set(
        foldersQuery.data.map((folder) => ({
          label: decodeURIComponent(folder),
          value: folder,
        })),
      );
    }
  }, [foldersQuery.data, set]);

  const [selectedValue, setSelectedValue] = useState<string[]>(
    value ? [value] : [],
  );
  const [inputValue, setInputValue] = useState(
    value ? safeDecode(value) : "",
  );
  const justCreatedRef = useRef(false);

  // `WatchForm`'s dialog doesn't unmount on close (Ark's Dialog.Root just
  // hides content), so this can't rely on mount-time seeding alone —
  // re-sync whenever the parent's `value` changes (reopened for a different
  // watch, reset after a successful submit, an edit-mode refetch reverting
  // an abandoned change, etc.). `handleValueChange` below only ever
  // produces a `value` that matches what's already selected/typed, so this
  // is a no-op in the common case, not an echo loop. Also clear any
  // leftover filter/"create new" state from a previous session so a stale
  // filter doesn't hide items on reopen.
  useEffect(() => {
    setSelectedValue(value ? [value] : []);
    setInputValue(value ? safeDecode(value) : "");
    filter("");
    remove(NEW_OPTION);
    justCreatedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const isValidNewOption = (input: string) => {
    if (input.trim().length === 0) return false;
    const decodedInput = input.trim().toLowerCase();
    return !folders.some(
      (f) => decodeURIComponent(f).toLowerCase() === decodedInput,
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleInputChange = (details: any) => {
    const val = details.inputValue as string;
    if (details.reason === "input-change" || details.reason === "item-select") {
      if (justCreatedRef.current) {
        justCreatedRef.current = false;
      } else if (isValidNewOption(val)) {
        upsert(NEW_OPTION, { label: `+ Create "${val}"`, value: NEW_OPTION });
      } else {
        remove(NEW_OPTION);
      }
      filter(val);
    }
    setInputValue(val);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleValueChange = (details: any) => {
    const values: string[] = details.value ?? details.items ?? [];
    const isNew = values.includes(NEW_OPTION);
    const replaced = values.map((v) => (v === NEW_OPTION ? inputValue : v));
    setSelectedValue(replaced);
    if (isNew) {
      remove(NEW_OPTION);
      justCreatedRef.current = true;
    } else if (values.length > 0 && values[0] !== NEW_OPTION) {
      const folder = folders.find((f) => f === values[0]);
      if (folder) {
        setInputValue(decodeURIComponent(folder));
      }
    }
    const folder = replaced.length > 0 && replaced[0] ? replaced[0] : "";
    onChange(folder, folder ? isNew : false);
  };

  return (
    <div className="space-y-2">
      <Combobox.Root
        collection={collection}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allowCustomValue
        selectionBehavior="preserve"
        value={selectedValue}
        inputValue={inputValue}
        onValueChange={handleValueChange}
        onInputValueChange={handleInputChange}
        closeOnSelect={false}
      >
        <Combobox.Label>
          {label}{" "}
          <span className="font-normal text-primary/60">(optional)</span>
        </Combobox.Label>

        <Combobox.Control>
          <Combobox.Input placeholder={placeholder} />
          <Combobox.Trigger />
          <Combobox.ClearTrigger />
        </Combobox.Control>

        <Combobox.Positioner>
          <Combobox.Content>
            <Combobox.List>
              {collection.items.map((item) => (
                <Combobox.Item key={item.value} item={item}>
                  <Combobox.ItemText>{item.label}</Combobox.ItemText>
                </Combobox.Item>
              ))}
            </Combobox.List>
            <Combobox.Empty>
              <p className="px-3 py-2 text-xs text-primary/50">
                No matching folders — type a name to create one.
              </p>
            </Combobox.Empty>
          </Combobox.Content>
        </Combobox.Positioner>
      </Combobox.Root>

      {foldersQuery.isLoading && (
        <p className="text-xs text-primary/50">Loading existing folders…</p>
      )}
      {!foldersQuery.isLoading && folders.length === 0 && (
        <p className="text-xs text-primary/50">
          No existing subfolders — type a new name to create one.
        </p>
      )}
    </div>
  );
}
