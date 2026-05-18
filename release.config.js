require('dotenv/config');

const packages = ['core', 'common', 'cli', 'client', 'create-weaver-app'];

const preset = 'conventionalcommits';

module.exports = {
  branches: ['main'],
  repositoryUrl: 'https://github.com/lmatosevic/appweaver.git',
  plugins: [
    // 1) Analyze commits to determine version bump
    [
      '@semantic-release/commit-analyzer',
      {
        preset
      }
    ],

    // 2) Generate release notes from commits
    [
      '@semantic-release/release-notes-generator',
      {
        preset
      }
    ],

    // 3) Generate changelog
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md'
      }
    ],

    // 4) Update root package version without publishing
    [
      '@semantic-release/npm',
      {
        pkgRoot: '.',
        npmPublish: false
      }
    ],
    // 5) Update versions for all packages without publishing
    ...packages.map((pkg) => [
      '@semantic-release/npm',
      {
        pkgRoot: `packages/${pkg}`,
        npmPublish: false
      }
    ]),

    // 6) Copy packages with updated versions
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'node ./tools/copy-packages.js'
      }
    ],

    // 7) Publish all packages
    ...packages.map((pkg) => [
      '@semantic-release/exec',
      {
        publishCmd: `cd packages/${pkg}/dist && npm publish`
      }
    ]),

    // 8) Commit updated files to the repository
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
          'chore(release): version ${nextRelease.version}\n\n${nextRelease.notes}'
      }
    ],

    // 9) Update GitHub repository content
    [
      '@semantic-release/github',
      {
        assets: []
      }
    ]
  ]
};
