const fs = require('fs');
const path = require('path');

const moduleName = '@appweaver';
const packagesDir = 'packages';
const nodeModulesDir = 'node_modules';
const moduleFiles = ['dist', 'package.json', 'README.md', 'LICENSE'];

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
      fs.cpSync(fileSourcePath, fileDestPath, {
        recursive: true,
        force: true
      });
    }
  }
}
