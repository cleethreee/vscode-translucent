import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export function getInstallPaths() {
  const appRoot = vscode.env.appRoot;
  const workbenchDir = path.join(
    appRoot,
    "out",
    "vs",
    "code",
    "electron-browser",
    "workbench",
  );
  return {
    // VS Code 1.140 moved the window code from out/main.js into out/mainImpl.js (30 Sept 2026);
    // patch whichever this build has.
    mainJs: fs.existsSync(path.join(appRoot, "out", "mainImpl.js"))
      ? path.join(appRoot, "out", "mainImpl.js")
      : path.join(appRoot, "out", "main.js"),
    workbenchHtml: path.join(workbenchDir, "workbench.html"),
    workbenchJs: path.join(workbenchDir, "workbench.js"),
  };
}
