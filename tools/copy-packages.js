const fs = require('fs');
const path = require('path');
const {
  packagesDir,
  moduleFiles,
  nodeModulesDir,
  distDir,
  moduleName
} = require('./constants');

for (const pkgName of fs.readdirSync(packagesDir)) {
  const fullPath = path.join(packagesDir, pkgName);

  let stat;
  try {
    stat = fs.statSync(fullPath);
  } catch {
    continue; // skip if cannot stat
  }

  if (!stat.isDirectory()) {
    continue;
  }

  for (const file of moduleFiles) {
    const fileSourcePath = path.join(fullPath, file);
    // Copy miscellaneous files to the dist directory in the current package
    if (fs.existsSync(fileSourcePath)) {
      const distPath = path.join(fullPath, 'dist', file);
      fs.cpSync(fileSourcePath, distPath, {
        recursive: true,
        force: true
      });
    }
  }

  // Copy a dist content to node_modules so it can be imported by other modules
  const fileDestPath = path.join(nodeModulesDir, moduleName, pkgName);
  fs.cpSync(path.join(fullPath, distDir), fileDestPath, {
    recursive: true,
    force: true
  });

  // Create .bin shims for packages that declare a "bin" field
  const pkgJsonPath = path.join(fileDestPath, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    if (pkgJson.bin) {
      const binDir = path.join(nodeModulesDir, '.bin');
      fs.mkdirSync(binDir, { recursive: true });
      for (const [binName, binFile] of Object.entries(pkgJson.bin)) {
        const targetPath = path.resolve(fileDestPath, binFile);

        // Unix shell script
        const shPath = path.join(binDir, binName);
        fs.writeFileSync(shPath, `#!/bin/sh\nnode "${targetPath}" "$@"\n`);

        // Windows .cmd shim
        const cmdPath = path.join(binDir, `${binName}.cmd`);
        fs.writeFileSync(
          cmdPath,
          `@IF EXIST "%~dp0\\node.exe" (\r\n  "%~dp0\\node.exe" "${targetPath}" %*\r\n) ELSE (\r\n  node "${targetPath}" %*\r\n)\r\n`
        );

        // Windows PowerShell shim
        const ps1Path = path.join(binDir, `${binName}.ps1`);
        fs.writeFileSync(
          ps1Path,
          `#!/usr/bin/env pwsh\n& node "${targetPath}" $args\n`
        );
      }
    }
  }
}
