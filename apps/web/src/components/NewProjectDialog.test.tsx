import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  open: vi.fn(),
  wait: vi.fn(),
  pick: vi.fn(),
  close: vi.fn(),
}));
vi.mock("../state/environments", () => ({
  usePrimaryEnvironmentId: () => "local",
  useEnvironments: () => ({
    environments: [
      {
        environmentId: "local",
        label: "This Mac",
        connection: { phase: "connected" },
        serverConfig: {
          settings: {},
          newProjectsRoot: "/tmp/projects",
          environment: { platform: { os: "darwin" } },
        },
      },
    ],
  }),
}));
vi.mock("../state/entities", () => ({ useProjects: () => [], waitForProject: mocks.wait }));
vi.mock("../state/projects", () => ({ projectEnvironment: { create: {} } }));
vi.mock("../state/session", () => ({ useEnvironmentScope: () => true }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => mocks.create }));
vi.mock("../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => mocks.open }));
vi.mock("../localApi", () => ({ readLocalApi: () => ({ dialogs: { pickFolder: mocks.pick } }) }));
vi.mock("./ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => children,
  DialogPopup: "section",
  DialogHeader: "header",
  DialogTitle: "h2",
  DialogDescription: "p",
  DialogPanel: "section",
  DialogFooter: "footer",
}));
vi.mock("./ui/button", () => ({ Button: "button" }));
vi.mock("./ui/input", () => ({ Input: "input" }));
vi.mock("./ui/label", () => ({ Label: "label" }));
vi.mock("./ui/toggle-group", () => ({ ToggleGroup: "nav", Toggle: "button" }));
vi.mock("./ui/select", () => ({
  Select: "select",
  SelectItem: "option",
  SelectPopup: "section",
  SelectTrigger: "button",
  SelectValue: "span",
}));

import { NewProjectDialog } from "./NewProjectDialog";
let renderer: ReactTestRenderer;
const input = (id: string) => renderer.root.findByProps({ id });
const submit = () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
const browse = () =>
  renderer.root
    .findAllByType("button")
    .find((button) => button.props.children === "Browse…")!
    .props.onClick();

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { desktopBridge: {} });
  mocks.create.mockResolvedValue({ _tag: "Success", value: {} });
  mocks.open.mockResolvedValue(undefined);
  mocks.wait.mockResolvedValue({});
  mocks.pick.mockResolvedValue(null);
  await act(async () => {
    renderer = create(<NewProjectDialog onClose={mocks.close} onOtherSources={() => {}} />);
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  vi.unstubAllGlobals();
});

describe("new project form", () => {
  it("creates in the selected parent and opens the project only after synchronization", async () => {
    await act(async () => {
      input("new-project-name").props.onValueChange("Example");
      input("new-project-folder").props.onValueChange("/tmp/chosen");
    });
    await act(async () => submit());
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          title: "Example",
          workspaceRoot: "/tmp/chosen/Example",
          createWorkspaceRootIfMissing: true,
        }),
      }),
    );
    expect(mocks.wait.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.open.mock.invocationCallOrder[0]!,
    );
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("does not create an existing folder and infers its name from the native picker", async () => {
    await act(async () => renderer.root.findByType("nav").props.onValueChange(["existing"]));
    mocks.pick.mockResolvedValue("/tmp/existing");
    await act(async () => browse());
    expect(input("new-project-name").props.value).toBe("existing");
    await act(async () => submit());
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          workspaceRoot: "/tmp/existing",
          createWorkspaceRootIfMissing: false,
        }),
      }),
    );
  });

  it("keeps the entered destination when the native picker is cancelled", async () => {
    await act(async () => input("new-project-folder").props.onValueChange("/tmp/chosen"));
    await act(async () => browse());
    expect(input("new-project-folder").props.value).toBe("/tmp/chosen");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects traversal and lets the user clear the default location", async () => {
    await act(async () => input("new-project-name").props.onValueChange("../escape"));
    await act(async () => submit());
    expect(renderer.root.findByProps({ role: "alert" }).props.children).toContain(
      "without slashes",
    );
    expect(mocks.create).not.toHaveBeenCalled();
    await act(async () => input("new-project-folder").props.onValueChange(""));
    expect(input("new-project-folder").props.value).toBe("");
  });

  it("guards repeated submits and reuses the created project when opening fails", async () => {
    let finish!: () => void;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ _tag: "Success", value: {} });
        }),
    );
    mocks.open.mockRejectedValueOnce(new Error("Connection interrupted"));
    await act(async () => input("new-project-name").props.onValueChange("Example"));
    await act(async () => {
      submit();
      submit();
    });
    expect(mocks.create).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(renderer.root.findByProps({ role: "alert" }).props.children).toBe(
      "Connection interrupted",
    );
    await act(async () => submit());
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.open).toHaveBeenCalledTimes(2);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
