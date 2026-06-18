import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListCollection } from "@ark-ui/react";
import { api } from "../hooks/useApiClient";
import type { ProwlarrResult } from "../lib/types";
import { Dialog } from "../ui/dialog";
import { Combobox } from "../ui/combobox";
import { Button } from "../ui/button";

interface FolderItem {
  label: string;
  value: string;
}

const NEW_OPTION = "[[new]]";

interface DownloadModalProps {
  items: ProwlarrResult[];
  onConfirm: (items: ProwlarrResult[], subfolder?: string, newFolder?: boolean) => void;
  onClose: () => void;
}

export default function DownloadModal({
  items,
  onConfirm,
  onClose,
}: DownloadModalProps) {
  const foldersQuery = useQuery({
    queryKey: ["copyparty-folders"],
    queryFn: () =>
      api
        .get("copyparty/folders")
        .json<{ folders: string[] }>()
        .then((r) => r.folders),
  });

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

  const [selectedValue, setSelectedValue] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isNewFolder, setIsNewFolder] = useState(false);
  const justCreatedRef = useRef(false);

  const isValidNewOption = (input: string) => {
    if (input.trim().length === 0) return false;
    return !folders.some((f) => f.toLowerCase() === input.trim().toLowerCase());
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
    setIsNewFolder(isNew);
    if (isNew) {
      remove(NEW_OPTION);
      justCreatedRef.current = true;
    }
  };

  const handleDownload = () => {
    const folder =
      selectedValue.length > 0 &&
      selectedValue[0] &&
      selectedValue[0] !== NEW_OPTION
        ? selectedValue[0]
        : undefined;
    onConfirm(items, folder, folder ? isNewFolder : undefined);
    onClose();
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(details: { open: boolean }) => {
        if (!details.open) onClose();
      }}
    >
      <Dialog.Backdrop />
      <Dialog.Content className="w-full max-w-md p-6 flex flex-col gap-5">
        <Dialog.Title>
          Download {items.length} item{items.length !== 1 ? "s" : ""}
        </Dialog.Title>

        <Combobox.Root
          collection={collection}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          allowCustomValue
          selectionBehavior="preserve"
          value={selectedValue}
          onValueChange={handleValueChange}
          onInputValueChange={handleInputChange}
          closeOnSelect={false}
        >
          <Combobox.Label>
            Subfolder{" "}
            <span className="font-normal text-[var(--sea-ink)]/60">
              (optional)
            </span>
          </Combobox.Label>

          <Combobox.Control>
            <Combobox.Input placeholder="e.g. manga/action or leave empty" />
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
                <p className="px-3 py-2 text-xs text-[var(--sea-ink)]/50">
                  No matching folders — type a name to create one.
                </p>
              </Combobox.Empty>
            </Combobox.Content>
          </Combobox.Positioner>
        </Combobox.Root>

        {foldersQuery.isLoading && (
          <p className="text-xs text-[var(--sea-ink)]/50">
            Loading existing folders…
          </p>
        )}
        {!foldersQuery.isLoading && folders.length === 0 && (
          <p className="text-xs text-[var(--sea-ink)]/50">
            No existing subfolders — type a new name to create one.
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Dialog.CloseTrigger asChild>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </Dialog.CloseTrigger>
          <Button
            variant="primary"
            className="rounded-full"
            onClick={handleDownload}
          >
            Download
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
