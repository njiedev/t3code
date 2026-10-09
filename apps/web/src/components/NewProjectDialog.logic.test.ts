import { describe, expect, it } from "vite-plus/test";
import { projectLocation, projectNameError } from "./NewProjectDialog.logic";

describe("project dialog destinations", () => {
  it("creates a named child without doubling the separator", () => {
    expect(projectLocation("new", "/Users/me/projects/", " My app ")).toBe(
      "/Users/me/projects/My app",
    );
    expect(projectLocation("new", "~/projects", "demo")).toBe("~/projects/demo");
    expect(projectLocation("new", "C:\\Projects\\", "demo")).toBe("C:\\Projects\\demo");
  });
  it("uses an existing folder directly even when the display name differs", () => {
    expect(projectLocation("existing", " /Users/me/code ", "My project")).toBe("/Users/me/code");
  });
  it("rejects empty names and traversal in new folder names", () => {
    for (const name of ["", " ", ".", "..", "../escape", "a/b", "a\\b"]) {
      expect(projectNameError(name, "new")).not.toBeNull();
    }
    expect(projectNameError("a\nb", "new")).not.toBeNull();
    expect(projectNameError("My project", "new")).toBeNull();
    expect(projectNameError("Team / App", "existing")).toBeNull();
  });
});
