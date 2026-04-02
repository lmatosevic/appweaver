require('dotenv/config');

const packages = ['core', 'common', 'cli', 'create-weaver-app'];

module.exports = {
  branches: ['main'],
  repositoryUrl: 'https://gitlab.com/app-weaver/appweaver.git',
  preset: 'conventionalcommits',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',

    // 1) Generate changelog
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md'
      }
    ],

    // 2) Update versions without publishing
    [
      '@semantic-release/npm',
      {
        pkgRoot: '.',
        npmPublish: false
      }
    ],
    ...packages.map((pkg) => [
      '@semantic-release/npm',
      {
        pkgRoot: `packages/${pkg}`,
        npmPublish: false
      }
    ]),

    // 3) Copy packages with updated versions
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'node ./tools/copy-packages.js'
      }
    ],

    // 4) Publish all packages
    ...packages.map((pkg) => [
      '@semantic-release/exec',
      {
        publishCmd: `cd packages/${pkg}/dist && npm publish`
      }
    ]),

    // 5) Commit updated files to the repository
    [
      '@semantic-release/git',
      {
        assets: [
          'CHANGELOG.md',
          'package.json',
          'package-lock.json',
          ...packages.map((pkg) => `packages/${pkg}/package.json`)
        ],
        message:
          'chore(release): version ${nextRelease.version}\n\nInitial 1.0.0 release.'
      }
    ]
  ]
};
