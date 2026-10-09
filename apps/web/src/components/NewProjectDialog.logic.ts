import { ensureBrowseDirectoryPath } from "../lib/projectPaths";

export function projectNameError(name: string, mode: "new" | "existing"): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a project name.";
  if (
    mode === "new" &&
    (trimmed === "." ||
      trimmed === ".." ||
      /[\\/]/.test(trimmed) ||
      Array.from(trimmed).some((character) => character.charCodeAt(0) < 32))
  ) {
    return "Use a folder name without slashes or control characters.";
  }
  return null;
}

export function projectLocation(mode: "new" | "existing", folder: string, name: string): string {
  return mode === "new"
    ? `${ensureBrowseDirectoryPath(folder.trim())}${name.trim()}`
    : folder.trim();
}
