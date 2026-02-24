const fs = require('fs');
const path = require('path');
const {
  packagesDir,
  moduleFiles,
  nodeModulesDir,
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
    const fileDestPath = path.join(nodeModulesDir, moduleName, pkgName, file);
    if (fs.existsSync(fileSourcePath)) {
      // Copy a file or directory to node_modules so it can be imported by other modules
      fs.cpSync(fileSourcePath, fileDestPath, {
        recursive: true,
        force: true
      });

      // Copy miscellaneous files to the dist directory in the current package
      if (file !== 'dist') {
        const distPath = path.join(fullPath, 'dist', file);
        fs.cpSync(fileSourcePath, distPath, {
          recursive: true,
          force: true
        });
      }
    }
  }
}
