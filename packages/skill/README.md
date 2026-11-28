<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The AI agent skill of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/skill" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/skill.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/skill.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/skill" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/skill.svg" alt="NPM Downloads" /></a>
<a href="https://github.com/lmatosevic/appweaver/actions/workflows/ci.yml?query=branch%3Amain" target="_blank"><img src="https://img.shields.io/github/actions/workflow/status/lmatosevic/appweaver/ci.yml?branch=main&label=CI" alt="CI Status" /></a>
<a href="https://codecov.io/gh/lmatosevic/appweaver" target="_blank"><img src="https://codecov.io/gh/lmatosevic/appweaver/graph/badge.svg" alt="Test Coverage" /></a>
<a href="https://nodejs.org" target="_blank"><img src="https://img.shields.io/node/v/@appweaver/skill.svg" alt="Node Version" /></a>
</p>

## Description

The AI agent skill of [Appweaver](https://github.com/lmatosevic/appweaver): `SKILL.md`, the framework guidelines
(`GUIDELINES.md`) and the references of every module, released with the framework.

A project created with `npm create @appweaver` has it as a dev dependency. `weaver skill sync` copies it into the
`skills/appweaver/` of the agent directories of the project (`.claude`, `.agents`, `.github`, ...), and `weaver upgrade`
runs it after upgrading the packages, so the skill always matches the installed framework version.

```bash
npm install --save-dev @appweaver/skill
npx weaver skill sync
```
