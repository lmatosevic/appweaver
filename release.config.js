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

    // 2) Update versions & (optionally) publish for each package
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
        pkgRoot: 'packages/core'
      }
    ],
    [
      '@semantic-release/npm',
      {
        pkgRoot: 'packages/common'
      }
    ],
    [
      '@semantic-release/npm',
      {
        pkgRoot: 'packages/cli'
      }
    ],

    // 3) Commit updated files back
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
