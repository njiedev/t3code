import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { AuthOrchestrationOperateScope, type EnvironmentId } from "@t3tools/contracts";
import { FolderIcon, FolderPlusIcon, GitBranchIcon } from "lucide-react";
import { useRef, useState } from "react";

import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { findProjectByPath, inferProjectTitleFromPath } from "../lib/projectPaths";
import { newProjectId } from "../lib/utils";
import { readLocalApi } from "../localApi";
import { useProjects, waitForProject } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { projectEnvironment } from "../state/projects";
import { useEnvironmentScope } from "../state/session";
import { useAtomCommand } from "../state/use-atom-command";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { Toggle, ToggleGroup } from "./ui/toggle-group";
import { projectLocation, projectNameError } from "./NewProjectDialog.logic";

/** One form for naming a project and choosing where its files live. */
export function NewProjectDialog({
  onClose,
  onOtherSources,
}: {
  readonly onClose: () => void;
  readonly onOtherSources: () => void;
}) {
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const [environmentId, setEnvironmentId] = useState<EnvironmentId | null>(
    primaryEnvironmentId ??
      environments.find((environment) => environment.connection.phase === "connected")
        ?.environmentId ??
      null,
  );
  const environment = environments.find((item) => item.environmentId === environmentId);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const submitting = useRef(false);
  const [createdProject, setCreatedProject] = useState<ReturnType<typeof scopeProjectRef> | null>(
    null,
  );
  const projects = useProjects();
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const openThread = useNewThreadHandler();
  const canCreate = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const defaultFolder =
    environment?.serverConfig?.settings.addProjectBaseDirectory?.trim() ||
    environment?.serverConfig?.newProjectsRoot ||
    "~/projects";
  const location = folder ?? (mode === "new" ? defaultFolder : "");
  const workspaceRoot = projectLocation(mode, location, name);
  const nameError = projectNameError(name, mode);
  // A native picker can only browse this Mac. Remote environments use a typed path.
  const canBrowse =
    Boolean(window.desktopBridge) &&
    environmentId === primaryEnvironmentId &&
    environment?.serverConfig?.environment.platform.os === "darwin";
  const disabled = busy || picking;

  async function browse() {
    setPicking(true);
    setError(null);
    try {
      const picked = await readLocalApi()?.dialogs.pickFolder({ initialPath: location || "~/" });
      if (!picked) return;
      setFolder(picked);
      if (mode === "existing" && !name.trim()) setName(inferProjectTitleFromPath(picked));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the folder picker.");
    } finally {
      setPicking(false);
    }
  }

  async function submit() {
    if (
      submitting.current ||
      disabled ||
      !environmentId ||
      !canCreate ||
      environment?.connection.phase !== "connected"
    )
      return;
    if (nameError || !location.trim()) {
      setError(nameError ?? "Choose a folder for your project.");
      return;
    }
    if (!/^(?:\/|~(?:[\\/]|$)|[A-Za-z]:[\\/]|\\\\)/.test(location.trim())) {
      setError("Enter a full folder path, or a path starting with ~/.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const existing = findProjectByPath(
        projects.filter((project) => project.environmentId === environmentId),
        workspaceRoot,
      );
      let projectRef =
        createdProject ?? (existing ? scopeProjectRef(environmentId, existing.id) : null);
      if (!projectRef) {
        const projectId = newProjectId();
        const result = await createProject({
          environmentId,
          input: {
            projectId,
            title: name.trim(),
            workspaceRoot,
            createWorkspaceRootIfMissing: mode === "new",
            defaultModelSelection: null,
          },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        projectRef = scopeProjectRef(environmentId, projectId);
        // Preserve a successful create if opening its draft fails, so Retry cannot duplicate it.
        setCreatedProject(projectRef);
      }
      await waitForProject(projectRef);
      await openThread(projectRef);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the project. Please try again.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !disabled) onClose();
      }}
    >
      <DialogPopup showCloseButton={!disabled}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Give your project a name and choose where to work.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-2">
              <Label htmlFor="new-project-name">Project name</Label>
              <Input
                id="new-project-name"
                autoFocus
                placeholder="My project"
                value={name}
                disabled={disabled || createdProject !== null}
                onValueChange={(value) => {
                  setName(value);
                  setError(null);
                }}
              />
            </div>
            <ToggleGroup
              aria-label="Project folder"
              value={[mode]}
              disabled={disabled || createdProject !== null}
              onValueChange={(values) => {
                const next = values[0];
                if (next === "new" || next === "existing") {
                  setMode(next);
                  setFolder(null);
                  setError(null);
                }
              }}
            >
              <Toggle value="new">
                <FolderPlusIcon />
                Create new folder
              </Toggle>
              <Toggle value="existing">
                <FolderIcon />
                Use existing folder
              </Toggle>
            </ToggleGroup>
            {environments.length > 1 ? (
              <div className="space-y-2">
                <Label htmlFor="new-project-environment">Computer</Label>
                <Select
                  value={environmentId}
                  disabled={disabled || createdProject !== null}
                  onValueChange={(value) => {
                    const selected = environments.find((item) => item.environmentId === value);
                    if (selected) {
                      setEnvironmentId(selected.environmentId);
                      setFolder(null);
                      setError(null);
                    }
                  }}
                >
                  <SelectTrigger id="new-project-environment">
                    <SelectValue>{environment?.label ?? "Choose a computer"}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {environments.map((item) => (
                      <SelectItem
                        key={item.environmentId}
                        value={item.environmentId}
                        disabled={item.connection.phase !== "connected"}
                      >
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="new-project-folder">
                {mode === "new" ? "Location" : "Project folder"}
              </Label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    id="new-project-folder"
                    font="mono"
                    placeholder="Choose a folder"
                    value={location}
                    disabled={disabled || createdProject !== null}
                    onValueChange={(value) => {
                      setFolder(value);
                      setError(null);
                    }}
                  />
                </div>
                {canBrowse ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled || createdProject !== null}
                    onClick={() => void browse()}
                  >
                    {picking ? "Opening…" : "Browse…"}
                  </Button>
                ) : null}
              </div>
              <p className="break-all text-xs text-muted-foreground">
                {mode === "new"
                  ? `A folder will be created at ${workspaceRoot || projectLocation("new", location, "my-project")}`
                  : "Your existing files stay in this folder."}
              </p>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {!canCreate || environment?.connection.phase !== "connected" ? (
              <p role="status" className="text-sm text-muted-foreground">
                Connect to a computer with permission to add projects.
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={onOtherSources}
            >
              <GitBranchIcon />
              Clone a repository or browse other sources…
            </Button>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={disabled} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                disabled ||
                !name.trim() ||
                !location.trim() ||
                !canCreate ||
                environment?.connection.phase !== "connected"
              }
            >
              {busy
                ? "Opening project…"
                : createdProject
                  ? "Open project"
                  : mode === "new"
                    ? "Create project"
                    : "Add project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
