### Project Guidelines

#### 1. Build & Configuration

The project is a TypeScript monorepo using `tsc -b` for builds.

- **Initial Setup**: Run `npm install` to install all dependencies.
- **Building**: Run `npm run build` from the root. This performs:
    - `clean:packages`: Removes `dist` folders from all packages.
    - `tsc -b`: Incremental build of all packages.
    - `postbuild`: Cleans `node_modules/@appweaver` and copies built packages there via `tools/copy-packages.js` to
      allow packages to reference each other during development.
- **Development Mode**: Run `npm run build:dev` to watch for changes and rebuild automatically.

#### 2. Testing

Tests are located in `packages/*/test` and use **Jest** with **SWC** for fast execution.

- **Running all tests**: `npm test`
- **Running specific tests**: `npx jest path/to/test.spec.ts`
- **Adding new tests**:
    - Create a file with `.spec.ts` or `.test.ts` extension in the `test` directory of the relevant package.
    - Follow the standard `describe`/`test`/`expect` pattern.

**Example Test Case**:

```typescript
describe('Feature Verification', () => {
  test('should perform expected action', () => {
    const result = someFunction();
    expect(result).toBe(true);
  });
});
```

#### 3. Development Information

- **Code Style**:
    - **Formatting**: The project uses **Prettier**. Run `npm run format` to format the codebase.
    - **Linting**: The project uses **ESLint**. Run `npm run lint` to check for issues and `npm run lint -- --fix` to
      automatically fix what's possible.
- **Architecture**:
    - `packages/common`: Shared utilities and base types.
    - `packages/core`: Core application logic.
    - `packages/cli`: Command-line interface tool.
- **Dependency Management**: Packages are linked locally in `node_modules/@appweaver` after the build. Ensure you run
  `npm run build` after making changes to shared packages if they are used by other packages or the sample application.
