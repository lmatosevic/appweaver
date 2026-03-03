require('dotenv/config');

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
    [
      '@semantic-release/npm',
      {
        pkgRoot: 'packages/core',
        npmPublish: false
      }
    ],
    [
      '@semantic-release/npm',
      {
        pkgRoot: 'packages/common',
        npmPublish: false
      }
    ],
    [
      '@semantic-release/npm',
      {
        pkgRoot: 'packages/cli',
        npmPublish: false
      }
    ],

    // 3) Copy packages with updated versions
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'node ./tools/copy-packages.js'
      }
    ],

    // 4) Publish all packages
    [
      '@semantic-release/exec',
      {
        publishCmd: 'cd packages/core/dist && npm publish'
      }
    ],
    [
      '@semantic-release/exec',
      {
        publishCmd: 'cd packages/common/dist && npm publish'
      }
    ],
    [
      '@semantic-release/exec',
      {
        publishCmd: 'cd packages/cli/dist && npm publish'
      }
    ],

    // 5) Commit updated files to the repository
    [
      '@semantic-release/git',
      {
        assets: [
          'CHANGELOG.md',
          'package.json',
          'package-lock.json',
          'packages/core/package.json',
          'packages/common/package.json',
          'packages/cli/package.json'
        ],
        message:
          'chore(release): version ${nextRelease.version}\n\n${nextRelease.notes}'
      }
    ]
  ]
};
