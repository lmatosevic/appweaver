{
  "name": "{{PACKAGE_NAME}}",
  "version": "0.1.0",
  "description": "{{DESCRIPTION}}",
  "license": "MIT",
  "keywords": ["appweaver", "appweaver-module"],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "appweaver": {
    "module": "./dist/module.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "jest",
    "prepublishOnly": "npm run build"
  },
  "peerDependencies": {
    "@appweaver/common": "^{{VERSION}}",
    "@appweaver/core": "^{{VERSION}}",
    "@sinclair/typebox": "^{{TYPEBOX_VERSION}}"
  },
  "devDependencies": {
    "@appweaver/common": "{{VERSION}}",
    "@appweaver/core": "{{VERSION}}",
    "@appweaver/testing": "{{VERSION}}",
{{DEV_DEPENDENCIES}}
  }
}
