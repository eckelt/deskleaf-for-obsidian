import { execFile, spawn } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { CalendarReader } from "../src/calendar-reader";
import DeskleafPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/types";

const execFileAsync = promisify(execFile);

type ShellResult = {
  stdout: string;
  stderr: string;
};

async function runBashWithInput(
  scriptPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  input: string,
): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [scriptPath], { cwd, env });
    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { stdout: stdout.join(""), stderr: stderr.join("") };
      if (code === 0) {
        resolve(result);
        return;
      }
      reject(Object.assign(new Error(`Command failed with exit code ${code}`), result));
    });

    child.stdin.end(input);
  });
}

async function createBundleRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "deskleaf-release-"));
  await writeFile(join(root, "main.js"), "console.log('deskleaf');\n");
  await writeFile(join(root, "styles.css"), ".deskleaf {}\n");
  await writeFile(join(root, "manifest.json"), JSON.stringify({ id: "obs-focal" }, null, 2));
  await writeFile(join(root, "install.sh"), "#!/bin/bash\n");
  await writeFile(join(root, "deskleaf-calendar-sync"), "#!/bin/bash\n");
  await execFileAsync("chmod", ["0755", join(root, "install.sh"), join(root, "deskleaf-calendar-sync")]);
  return root;
}

async function createReleasePackageRoot(): Promise<string> {
  const root = await createBundleRoot();
  await copyFile("deskleaf-calendar-sync", join(root, "deskleaf-calendar-sync"));
  await execFileAsync("chmod", ["0755", join(root, "deskleaf-calendar-sync")]);
  return root;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function manifestIdFromJson(json: string): string {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed) || typeof parsed.id !== "string") {
    throw new Error("manifest.json must contain a string id");
  }
  return parsed.id;
}

describe("early access release package", () => {
  it("creates a zip with the complete local plugin bundle and executable binary", async () => {
    const packageRoot = await createReleasePackageRoot();
    const zipPath = join(packageRoot, "deskleaf-for-obsidian.zip");

    await execFileAsync("bash", ["scripts/package-release.sh"], {
      env: { ...process.env, PACKAGE_ROOT: packageRoot, RELEASE_ZIP: zipPath },
    });

    const { stdout } = await execFileAsync("unzip", ["-Z", "-1", zipPath]);
    expect(stdout.trim().split("\n").sort()).toEqual([
      "deskleaf-calendar-sync",
      "install.sh",
      "main.js",
      "manifest.json",
      "styles.css",
    ]);

    const extractDir = await mkdtemp(join(tmpdir(), "deskleaf-release-unzip-"));
    await execFileAsync("unzip", ["-q", zipPath, "-d", extractDir]);
    const binaryMode = (await stat(join(extractDir, "deskleaf-calendar-sync"))).mode;
    expect(binaryMode & 0o111).not.toBe(0);

    const { stdout: fileType } = await execFileAsync("file", [join(extractDir, "deskleaf-calendar-sync")]);
    expect(fileType).toContain("Mach-O");
  });

  it("rejects an executable placeholder script instead of a macOS release binary", async () => {
    const packageRoot = await createBundleRoot();
    const zipPath = join(packageRoot, "deskleaf-for-obsidian.zip");

    await expect(
      execFileAsync("bash", ["scripts/package-release.sh"], {
        env: { ...process.env, PACKAGE_ROOT: packageRoot, RELEASE_ZIP: zipPath },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("deskleaf-calendar-sync must be a macOS release binary"),
    });
  });

  it("publishes the packaged zip from the main release workflow", async () => {
    const workflow = await readFile(".github/workflows/release.yml", "utf8");

    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("swift build -c release");
    expect(workflow).toContain(".build/apple/Products/Release/DeskleafCalendarSync");
    expect(workflow).toContain("softprops/action-gh-release");
    expect(workflow).toContain("scripts/package-release.sh");
    expect(workflow).toContain("deskleaf-for-obsidian.zip");
  });
});

describe("early access installer", () => {
  it("copies the bundle into the selected vault plugin directory using the manifest id", async () => {
    const bundleRoot = await createBundleRoot();
    const homeRoot = await mkdtemp(join(tmpdir(), "deskleaf-home-"));
    const vaultRoot = await mkdtemp(join(tmpdir(), "deskleaf-vault-"));
    await mkdir(join(vaultRoot, ".obsidian"));

    await runBashWithInput(join(process.cwd(), "install.sh"), bundleRoot, { ...process.env, HOME: homeRoot }, `${vaultRoot}\n`);

    const pluginRoot = join(vaultRoot, ".obsidian", "plugins", "obs-focal");
    await expect(stat(join(pluginRoot, "main.js"))).resolves.toBeTruthy();
    await expect(stat(join(pluginRoot, "styles.css"))).resolves.toBeTruthy();
    await expect(stat(join(pluginRoot, "manifest.json"))).resolves.toBeTruthy();
    const binaryMode = (await stat(join(pluginRoot, "deskleaf-calendar-sync"))).mode;
    expect(binaryMode & 0o111).not.toBe(0);
  });

  it("fails clearly when no vault destination is available", async () => {
    const bundleRoot = await createBundleRoot();
    const homeRoot = await mkdtemp(join(tmpdir(), "deskleaf-home-"));
    const invalidVaultRoot = await mkdtemp(join(tmpdir(), "deskleaf-invalid-vault-"));

    await expect(
      runBashWithInput(join(process.cwd(), "install.sh"), bundleRoot, { ...process.env, HOME: homeRoot }, `${invalidVaultRoot}\n`),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Obsidian vault directory is required"),
    });
    await expect(stat(join(invalidVaultRoot, ".obsidian", "plugins", "obs-focal"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(invalidVaultRoot, ".obsidian", "plugins", "obs-focal", "main.js"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("derives the plugin folder from manifest.json without private vault paths", async () => {
    const installer = await readFile("install.sh", "utf8");

    expect(installer).toContain("plugin_id_from_manifest");
    expect(installer).toContain(".obsidian/plugins/$PLUGIN_ID");
    expect(installer).not.toContain("/Users/nils");
  });

  it("installs to the directory Deskleaf uses for the default EventKit binary path", async () => {
    const bundleRoot = await createBundleRoot();
    const homeRoot = await mkdtemp(join(tmpdir(), "deskleaf-home-"));
    const vaultRoot = await mkdtemp(join(tmpdir(), "deskleaf-vault-"));
    await mkdir(join(vaultRoot, ".obsidian"));

    await runBashWithInput(join(process.cwd(), "install.sh"), bundleRoot, { ...process.env, HOME: homeRoot }, `${vaultRoot}\n`);

    const manifestId = manifestIdFromJson(await readFile(join(bundleRoot, "manifest.json"), "utf8"));
    const pluginRoot = join(vaultRoot, ".obsidian", "plugins", manifestId);
    const plugin = new DeskleafPlugin();
    plugin.settings = { ...DEFAULT_SETTINGS, binaryPath: "" };
    plugin.app = { vault: { adapter: { basePath: vaultRoot } } };
    plugin.manifest = { dir: `.obsidian/plugins/${manifestId}` };

    const reader = plugin["makeReader"]();

    expect(reader).toBeInstanceOf(CalendarReader);
    expect(reader.getPath()).toBe(join(pluginRoot, "deskleaf-calendar-sync"));
  });
});
