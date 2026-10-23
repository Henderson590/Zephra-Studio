import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { api } from "../api/ipc";
import { StudioAddonView as View } from "../types";

type Props = {
  addonName: string;
  view: View;
  rootPath: string | null;
  grantedRoot: string | null;
  permissions: string[];
  onClose: () => void;
  onNotify: (message: string) => void;
};

type AddonRequest = {
  channel: "zephra-studio-addon";
  id: string;
  method: string;
  path?: string;
  contents?: string;
  message?: string;
};

const PERMISSION_BY_METHOD: Record<string, string> = {
  "workspace.getRoot": "workspace.info",
  "workspace.readFile": "workspace.read",
  "workspace.writeFile": "workspace.write",
  "ui.notify": "ui.notify",
};

const CONTENT_SECURITY_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

function requireGrantedWorkspace(
  rootPath: string | null,
  grantedRoot: string | null,
): string {
  if (!rootPath || rootPath !== grantedRoot) {
    throw new Error(
      "The workspace changed or is no longer open. Reload the add-on to grant access to this workspace.",
    );
  }
  return rootPath;
}

export default function StudioAddonView({
  addonName,
  view,
  rootPath,
  grantedRoot,
  permissions,
  onClose,
  onNotify,
}: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const requestTimesRef = useRef<number[]>([]);
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${view.html}</body></html>`,
    [view.html],
  );

  const reply = useCallback((id: string, result?: unknown, error?: string) => {
    frameRef.current?.contentWindow?.postMessage(
      { channel: "zephra-studio-host", id, result, error },
      "*",
    );
  }, []);

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const request = event.data as Partial<AddonRequest> | null;
      if (
        !request ||
        typeof request !== "object" ||
        request.channel !== "zephra-studio-addon" ||
        typeof request.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,80}$/.test(request.id) ||
        typeof request.method !== "string"
      ) {
        return;
      }

      try {
        const now = Date.now();
        requestTimesRef.current = requestTimesRef.current.filter(
          (timestamp) => now - timestamp < 60_000,
        );
        if (requestTimesRef.current.length >= 60) {
          throw new Error(
            "Add-on view API rate limit exceeded (60 requests per minute).",
          );
        }
        requestTimesRef.current.push(now);
        const requiredPermission = PERMISSION_BY_METHOD[request.method];
        if (!requiredPermission) throw new Error("Unsupported IDE API method.");
        if (!permissions.includes(requiredPermission)) {
          throw new Error(
            `Add-on permission not granted: ${requiredPermission}`,
          );
        }
        switch (request.method) {
          case "workspace.getRoot": {
            const workspace = requireGrantedWorkspace(rootPath, grantedRoot);
            reply(request.id, workspace);
            return;
          }
          case "workspace.readFile": {
            if (typeof request.path !== "string") {
              throw new Error("Workspace file path must be a relative string.");
            }
            const workspace = requireGrantedWorkspace(rootPath, grantedRoot);
            const result = await api.addonApi.workspaceRead(
              workspace,
              request.path,
            );
            if ("error" in result) throw new Error(result.error);
            reply(request.id, result.data);
            return;
          }
          case "workspace.writeFile": {
            if (
              typeof request.path !== "string" ||
              typeof request.contents !== "string"
            ) {
              throw new Error(
                "Workspace write requires a relative path and text contents.",
              );
            }
            const workspace = requireGrantedWorkspace(rootPath, grantedRoot);
            const result = await api.addonApi.workspaceWrite(
              workspace,
              request.path,
              request.contents,
            );
            if ("error" in result) throw new Error(result.error);
            reply(request.id, result.success);
            return;
          }
          case "ui.notify":
            if (
              typeof request.message !== "string" ||
              request.message.length > 10000
            ) {
              throw new Error(
                "IDE notification must be text up to 10000 characters.",
              );
            }
            onNotify(request.message);
            reply(request.id, true);
            return;
          default:
            throw new Error("Unsupported IDE API method.");
        }
      } catch (error) {
        reply(request.id, undefined, String(error));
      }
    },
    [grantedRoot, onNotify, permissions, reply, rootPath],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  return (
    <div className="addon-view-backdrop" role="presentation">
      <section
        className="addon-view-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${addonName}: ${view.label}`}
      >
        <header className="addon-view-header">
          <div>
            <strong>{view.label}</strong>
            <span>{addonName}</span>
          </div>
          <button
            className="dialog-close"
            onClick={onClose}
            aria-label="Close add-on view"
          >
            ×
          </button>
        </header>
        <iframe
          ref={frameRef}
          className="addon-view-frame"
          title={`${addonName}: ${view.label}`}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
        />
      </section>
    </div>
  );
}
