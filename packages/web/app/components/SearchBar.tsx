import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
}

export default function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <Input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a book or comic..."
        className=" px-4 py-3"
      />
      <div>
        <Button
          type="submit"
          variant="submit"
          disabled={isLoading || !query.trim()}
          className=" px-6 py-3 disabled:hover:translate-y-0"
        >
          {isLoading ? "Searching..." : "Search"}
        </Button>
      </div>
    </form>
  );
}
