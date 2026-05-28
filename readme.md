# Better ENV management

# SebEnv

`SebEnv` is a CLI tool that helps ensure your environment variables are properly set up for your Node.js projects. It allows you to specify required environment variables in your `package.json` file, add new variables, sync variables from your `.env` file, scan source code to find environment variables, and automatically create or update the `.env` file if variables are missing.

## Features

- **Check Environment Variables**: Ensures that all specified environment variables are set.
- **Add Variables**: Add new environment variables to the `envCheck` section in `package.json`.
- **Sync Variables**: Syncs environment variables from your `.env` file to the `envCheck` section in `package.json`.
- **Scan Source Code**: Scans project files recursively to detect `process.env` usages and adds them interactively.
- **CI/CD Validation**: Non-interactively validates environment variables in CI pipelines using strict checks.
- **Interactive CLI**: Prompts you to input missing environment variables and updates the `.env` file automatically.

## Installation

Install `SebEnv` globally using npm:

```bash
npm install -g sebenv
```

## Usage

### 1. Checking Environment Variables

To check if all required environment variables are set, simply run:

```bash
SebEnv
```

If any variables are missing, `SebEnv` will prompt you to enter the values and will update your `.env` file automatically.

If the project doesn't have an `envCheck` list configured in its `package.json`, `SebEnv` will offer to scan the project automatically to initialize it.

### 2. Adding New Variables

To add new environment variables to the `envCheck` section in `package.json`, use:

```bash
SebEnv --add VAR_NAME1 VAR_NAME2
```

This will add `VAR_NAME1` and `VAR_NAME2` to the list of required environment variables in `package.json`. The tool ensures that no duplicates are added.

### 3. Syncing Variables from `.env`

To sync all variables from your `.env` file to the `envCheck` section in `package.json`, use:

```bash
SebEnv --sync
```

This command will read all the environment variables from your `.env` file and add them to the `envCheck` section in `package.json`, ensuring that there are no duplicates.

### 4. Scanning Source Code for Environment Variables

To automatically scan your source code for any used environment variables, run:

```bash
SebEnv --scan
```
*(or the alias `SebEnv --find`)*

This scans all JS, JSX, TS, TSX, MJS, CJS, Vue, and Svelte files (recursively scanning `src/` if it exists, or the project root while ignoring common directories like `node_modules` and `dist`). It detects dot notation, bracket notation, and destructuring from `process.env`. It then presents an interactive checklist for you to select which detected variables to add to your `package.json` config.

#### Excluding specific folders

You can exclude specific folders from the scan by using the `--exclude` option followed by a comma-separated list of folder names:

```bash
SebEnv --scan --exclude tests,temp
```

You can target a specific environment by using the `--env` (or `-e`) option:

```bash
SebEnv --env prod
SebEnv --scan --env dev
SebEnv --add API_KEY --env staging
```
If `--env` is omitted, `SebEnv` checks the environment matching the `NODE_ENV` system variable, or falls back to the `default` environment.

### 5. Validating in CI Pipelines

For CI/CD environments, you need strict, non-interactive validation. Use the `--ci` flag to load an environment file and validate its variables against your `package.json` environment requirements.

```bash
# Validates the default environment by loading `.env`
SebEnv --ci

# Validates the 'prod' environment by loading `.env.prod`
SebEnv --ci .env.prod --env prod
```

If any required variables for the target environment are missing from the loaded environment file, `SebEnv` will throw an error and halt the pipeline with an exit code of `1`.

## Configuration

Add a section in your `package.json` file named `envCheck` where you define configurations and map environments.

* **Upgrading from legacy formats:** If you have an existing array-based config, a flat object config, or the deprecated `envCheckExclude` array, `SebEnv` will **automatically migrate them** to the new nested format in-place on the very first run.
* **Variable Options:**
  * To require a variable: Set its value to `{ "required": true }` or a boolean `true`.
  * To mark a variable as optional (which will be skipped during verification checks): Set its value to `{ "required": false }` or a boolean `false`.

### Example `package.json` Configuration

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {},
  "envCheck": {
    "scan": {
      "excludeDirectories": [
        "tests",
        "scripts",
        "legacy-code"
      ]
    },
    "environments": {
      "default": {
        "API_KEY": { "required": true },
        "PORT": false
      },
      "prod": {
        "API_KEY": { "required": true },
        "DB_HOST": { "required": true }
      }
    }
  }
}
```

## Runtime Validation

You can also import `SebEnv` directly into your application to validate environment variables synchronously at startup. If any required variables for the target environment (or `NODE_ENV`) are missing, it will throw a descriptive error preventing your application from running in an invalid state.

```javascript
import { validateEnv } from 'sebenv';

// Validates against NODE_ENV (or "default")
validateEnv();

// Or validate a specific environment explicitly
validateEnv('prod');
```

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.

