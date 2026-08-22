import { useState } from "react";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import FolderSelect from "./FolderSelect";

interface DownloadModalProps<T> {
  items: T[];
  onConfirm: (items: T[], subfolder?: string, newFolder?: boolean) => void;
  onClose: () => void;
}

export default function DownloadModal<T>({
  items,
  onConfirm,
  onClose,
}: DownloadModalProps<T>) {
  const [folder, setFolder] = useState("");
  const [isNewFolder, setIsNewFolder] = useState(false);

  const handleDownload = () => {
    onConfirm(items, folder || undefined, folder ? isNewFolder : undefined);
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
      <Dialog.Content className="max-w-md p-6 flex flex-col gap-5">
        <Dialog.Title>
          Download {items.length} item{items.length !== 1 ? "s" : ""}
        </Dialog.Title>

        <FolderSelect
          value={folder}
          onChange={(value, isNew) => {
            setFolder(value);
            setIsNewFolder(isNew);
          }}
        />

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
