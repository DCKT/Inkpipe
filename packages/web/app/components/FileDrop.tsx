import { useState, useRef, useCallback } from "react";
import { Upload, File } from "lucide-react";
import { Button } from "../ui/button";

interface FileDropProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDrop({ onFile, disabled }: FileDropProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith(".cbz")) {
        setSelectedFile(file);
      }
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    if (selectedFile && !disabled) {
      onFile(selectedFile);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`island-shell rounded-2xl p-12 text-center cursor-pointer transition-all ${
          isDragOver
            ? "border-accent bg-accent/8"
            : "border-dashed hover:border-accent-hover"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".cbz"
          onChange={handleChange}
          className="hidden"
        />
        {selectedFile ? (
          <div className="flex flex-col items-center gap-2">
            <File size={32} className="text-accent" />
            <p className="text-sm font-medium text-primary">
              {selectedFile.name}
            </p>
            <p className="text-xs text-secondary">
              {formatSize(selectedFile.size)}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={32} className="text-secondary" />
            <p className="text-sm font-medium text-primary">
              Drop your .cbz file here
            </p>
            <p className="text-xs text-secondary">
              or click to browse
            </p>
          </div>
        )}
      </div>
      {selectedFile && (
        <Button
          onClick={handleSubmit}
          disabled={disabled}
          variant="primary"
          className="rounded-xl"
        >
          Convert to EPUB
        </Button>
      )}
    </div>
  );
}
