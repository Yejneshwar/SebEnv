# Better ENV management

# SebEnv

`SebEnv` is a CLI tool that helps ensure your environment variables are properly set up for your Node.js projects. It allows you to specify required environment variables in your `package.json` file, add new variables, sync variables from your `.env` file, and automatically create or update the `.env` file if variables are missing.

## Features

- **Check Environment Variables**: Ensures that all specified environment variables are set.
- **Add Variables**: Add new environment variables to the `envCheck` section in `package.json`.
- **Sync Variables**: Syncs environment variables from your `.env` file to the `envCheck` section in `package.json`.
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

## Configuration

Add a section in your `package.json` file named `envCheck` where you list the environment variables that should be checked:

### Example `package.json` Configuration

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {},
  "envCheck": [
    "API_KEY",
    "DB_HOST",
    "DB_USER",
    "DB_PASS"
  ]
}
```

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.
