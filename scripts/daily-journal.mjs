#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const shouldPush = !args.has("--no-push");
const shouldSkipChecks = args.has("--skip-checks");

function run(command, commandArgs, options = {}) {
  const output = execFileSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe"
  });

  return typeof output === "string" ? output.trim() : "";
}

function runCheck(command, commandArgs) {
  const startedAt = new Date();
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const durationMs = Date.now() - startedAt.getTime();

  return {
    command: [command, ...commandArgs].join(" "),
    durationMs,
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
  };
}

function assertCleanWorktree() {
  const status = run("git", ["status", "--porcelain"]);

  if (status) {
    throw new Error(
      [
        "Working tree is not clean. Daily journal stopped to avoid committing unrelated work.",
        "",
        status
      ].join("\n")
    );
  }
}

function assertMainBranch() {
  const branch = run("git", ["branch", "--show-current"]);

  if (branch !== "main") {
    throw new Error(`Daily journal only runs on main. Current branch: ${branch || "(detached)"}`);
  }
}

function formatCheck(check) {
  const status = check.ok ? "OK" : "FAILED";
  const seconds = (check.durationMs / 1000).toFixed(1);
  const tail = check.output.split("\n").slice(-10).join("\n");

  return [
    `### ${check.command}`,
    "",
    `- Status: ${status}`,
    `- Duration: ${seconds}s`,
    "",
    "```text",
    tail || "(no output)",
    "```"
  ].join("\n");
}

function countFiles(directory) {
  if (!fs.existsSync(directory)) {
    return 0;
  }

  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile()).length;
}

function buildJournalEntry(checks) {
  const now = new Date();
  const isoDate = now.toISOString().slice(0, 10);
  const localTime = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "medium",
    timeZone: "Europe/Paris"
  }).format(now);
  const latestCommit = run("git", ["rev-parse", "--short", "HEAD"]);
  const latestSubject = run("git", ["log", "-1", "--pretty=%s"]);
  const trackedFiles = run("git", ["ls-files"]).split("\n").filter(Boolean).length;
  const sourceFiles = countFiles(path.join(repoRoot, "src"));
  const publicFiles = countFiles(path.join(repoRoot, "public"));

  return {
    content: [
      `# Daily Project Journal - ${isoDate}`,
      "",
      "## Snapshot",
      "",
      `- Local time: ${localTime}`,
      "- Branch: main",
      `- Latest commit: ${latestCommit} ${latestSubject}`,
      `- Tracked files: ${trackedFiles}`,
      `- Source files: ${sourceFiles}`,
      `- Public files: ${publicFiles}`,
      "",
      "## Checks",
      "",
      checks.length > 0 ? checks.map(formatCheck).join("\n\n") : "- Checks skipped by --skip-checks.",
      "",
      "## Note",
      "",
      "Automated journal entry for the real project state of the day.",
      ""
    ].join("\n"),
    isoDate
  };
}

function buildMaintenanceEntry(isoDate) {
  const sourceFiles = run("git", ["ls-files", "src"]).split("\n").filter(Boolean);
  const testFiles = sourceFiles.filter((file) => file.endsWith(".test.ts"));
  const publicFiles = run("git", ["ls-files", "public"]).split("\n").filter(Boolean);
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const dependencies = Object.keys(packageJson.dependencies ?? {});
  const devDependencies = Object.keys(packageJson.devDependencies ?? {});
  const latestCommit = run("git", ["rev-parse", "--short", "HEAD"]);

  return [
    `# Daily Maintenance Notes - ${isoDate}`,
    "",
    "## Repository Signals",
    "",
    `- Source files: ${sourceFiles.length}`,
    `- Test files: ${testFiles.length}`,
    `- Public UI files: ${publicFiles.length}`,
    `- Runtime dependencies: ${dependencies.length}`,
    `- Development dependencies: ${devDependencies.length}`,
    `- Baseline commit inspected: ${latestCommit}`,
    "",
    "## Generated Review",
    "",
    "- Keep conversion behavior conservative when the source page is ambiguous.",
    "- Prefer deterministic extraction rules over guessing hidden site data.",
    "- Preserve PDF layout checks when changing pagination, headers, footers, or images.",
    "- Keep the web UI focused on batch conversion and clear export feedback.",
    "",
    "## Next Useful Checks",
    "",
    "- Try one single-link PDF export from the UI.",
    "- Try one multi-link ZIP export from the UI.",
    "- Review any failed links in `errors.txt` when batch conversion partially succeeds.",
    ""
  ].join("\n");
}

function writeDailyFile(content, isoDate, suffix) {
  const [year, month] = isoDate.split("-");
  const journalDir = path.join(repoRoot, "journal", year, month);
  const journalPath = path.join(journalDir, `${isoDate}${suffix}.md`);

  if (fs.existsSync(journalPath) && !args.has("--force")) {
    throw new Error(`Journal file already exists: ${path.relative(repoRoot, journalPath)}. Use --force to replace it.`);
  }

  fs.mkdirSync(journalDir, { recursive: true });
  fs.writeFileSync(journalPath, content);

  return journalPath;
}

function commitFile(filePath, message) {
  const relativePath = path.relative(repoRoot, filePath);

  run("git", ["add", relativePath]);
  run("git", ["commit", "-m", message], { stdio: "inherit" });
}

function main() {
  assertMainBranch();

  if (!isDryRun) {
    assertCleanWorktree();
    run("git", ["pull", "--ff-only", "origin", "main"], { stdio: "inherit" });
    assertCleanWorktree();
  }

  const checks = shouldSkipChecks
    ? []
    : [runCheck("npm", ["test"]), runCheck("npm", ["run", "build"])];
  const { content, isoDate } = buildJournalEntry(checks);
  const maintenanceContent = buildMaintenanceEntry(isoDate);

  if (isDryRun) {
    console.log(content);
    console.log("\n---\n");
    console.log(maintenanceContent);
    return;
  }

  const journalPath = writeDailyFile(content, isoDate, "");
  commitFile(journalPath, `journal: ${isoDate} project health check`);

  const maintenancePath = writeDailyFile(maintenanceContent, isoDate, "-maintenance");
  commitFile(maintenancePath, `journal: ${isoDate} maintenance notes`);

  if (shouldPush) {
    run("git", ["push", "origin", "main"], { stdio: "inherit" });
  }

  const failedChecks = checks.filter((check) => !check.ok);
  if (failedChecks.length > 0) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
