import { App, TFile, Platform } from "obsidian";

/**
 * Open a file the Obsidian way:
 *  - modifier (Cmd/Ctrl): open in a new vertical split
 *  - otherwise: switch to an already-open leaf, or open in the current leaf
 *  - on mobile: always use the active leaf (no splits)
 */
export async function openFile(app: App, file: TFile, modifier = false): Promise<void> {
  if (modifier && !Platform.isMobile) {
    const leaf = app.workspace.getLeaf("split");
    await leaf.openFile(file, { active: true });
    return;
  }
  const existing = app.workspace.getLeavesOfType("markdown")
    .find((l) => (l.view as any).file?.path === file.path);
  if (existing) {
    app.workspace.setActiveLeaf(existing, { focus: true });
  } else {
    const leaf = Platform.isMobile ? app.workspace.getMostRecentLeaf() : app.workspace.getLeaf(false);
    await leaf?.openFile(file, { active: true });
  }
}
