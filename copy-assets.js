#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const SRC_ROOT = path.join(__dirname, "src");
const DIST_ROOT = path.join(__dirname, "dist");
const UI_SRC_DIR = path.join(__dirname, "src", "react-log-viewer", "dist");
const UI_DEST_DIR = path.join(DIST_ROOT, "public", "ui");

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyJsonFiles(srcDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);

    // Skip the React app under src
    if (srcPath.startsWith(path.join(SRC_ROOT, "react-log-viewer"))) {
      continue;
    }

    if (entry.isDirectory()) {
      copyJsonFiles(srcPath);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      const relative = path.relative(SRC_ROOT, srcPath);
      const destPath = path.join(DIST_ROOT, relative);
      ensureDirSync(path.dirname(destPath));
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied asset: ${relative}`);
    }
  }
}

function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDirSync(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDirectoryRecursive(srcPath, destPath);
      } else if (entry.isFile()) {
        ensureDirSync(path.dirname(destPath));
        fs.copyFileSync(srcPath, destPath);
      }
    }
  } else if (stat.isFile()) {
    ensureDirSync(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(SRC_ROOT)) {
  console.error("src directory not found.");
  process.exit(1);
}

ensureDirSync(DIST_ROOT);
copyJsonFiles(SRC_ROOT);
console.log("Asset copy complete.");

// Copy React UI build into dist/public/ui so Express can serve it
if (fs.existsSync(UI_SRC_DIR)) {
  copyDirectoryRecursive(UI_SRC_DIR, UI_DEST_DIR);
  console.log(
    `Copied React UI build to: ${path.relative(DIST_ROOT, UI_DEST_DIR)}`
  );
} else {
  console.warn("React UI build not found. Skipping UI asset copy.");
}
