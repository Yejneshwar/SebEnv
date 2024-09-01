#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import inquirer from 'inquirer';
import dotenv from 'dotenv';

// Load existing environment variables from .env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Function to dynamically import the package.json file
const loadPackageJson = async () => {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const packageJsonUrl = pathToFileURL(packageJsonPath);
    return import(packageJsonUrl.href, {
        assert: { type: 'json' }
    });
};

// Function to save the updated package.json back to the file system
const savePackageJson = (packageJson) => {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');
};

// Function to add variables to the envCheck field in package.json
const addEnvVars = async (varsToAdd) => {
    const packageJsonModule = await loadPackageJson();
    const packageJson = packageJsonModule.default;

    if (!packageJson.envCheck) {
        packageJson.envCheck = [];
    }

    // Ensure no duplicate variables are added
    varsToAdd.forEach((variable) => {
        if (!packageJson.envCheck.includes(variable)) {
            packageJson.envCheck.push(variable);
        }
    });

    savePackageJson(packageJson);
    console.log(`Added variables: ${varsToAdd.join(', ')} to the envCheck field in package.json`);
};

// Function to sync variables from .env to package.json
const syncEnvVars = async () => {
    if (!fs.existsSync(envPath)) {
        console.error('.env file not found.');
        process.exit(1);
    }

    const envFileContent = fs.readFileSync(envPath, 'utf8');
    const envVarsInFile = envFileContent.split('\n').filter(line => line.trim() && !line.startsWith('#')).map(line => line.split('=')[0]);

    await addEnvVars(envVarsInFile);
    console.log('Synced variables from .env to package.json.');
};

// Function to prompt the user for missing environment variables
const promptForEnvVars = async (missingVars) => {
    const questions = missingVars.map((variable) => ({
        type: 'input',
        name: variable,
        message: `Enter a value for ${variable}:`
    }));

    const answers = await inquirer.prompt(questions);
    return answers;
};

function hasWhiteSpace(s) {
    return (/\s/).test(s);
  }

const checkEnvVars = async () => {
    try {
        const packageJsonModule = await loadPackageJson();
        const packageJson = packageJsonModule.default;

        // Check for "envCheck" configuration in package.json
        if (!packageJson.envCheck || !Array.isArray(packageJson.envCheck)) {
            console.error('No "envCheck" configuration found in package.json.');
            process.exit(1);
        }

        const envVarsToCheck = packageJson.envCheck;

        // Check for missing environment variables
        const missingVars = envVarsToCheck.filter((variable) => !process.env[variable]);

        if (missingVars.length > 0) {
            console.log(`Missing environment variables: ${missingVars.join(', ')}`);

            // Prompt user for missing variables
            const answers = await promptForEnvVars(missingVars);

            // Append missing variables to .env file
            const envFileContent = Object.keys(answers)
                .map((key) => {
                    if(hasWhiteSpace(answers[key])){
                        return `${key}="${answers[key]}"`;
                    } else {
                        return `${key}=${answers[key]}`;
                    }
                })
                .join('\n');

            fs.appendFileSync(envPath, `\n#Auto GEN by envCheck\n${envFileContent}\n`, 'utf8');
            console.log('.env file updated successfully.');
        } else {
            console.log('All environment variables are set.');
        }
    } catch (error) {
        console.error('An error occurred:', error);
    }
};

// Main function to run the script
const main = async () => {
    const args = process.argv.slice(2);

    if (args.length > 0) {
        if (args[0] === '--add') {
            const varsToAdd = args.slice(1);
            if (varsToAdd.length === 0) {
                console.error('No variables provided to add.');
                process.exit(1);
            }
            await addEnvVars(varsToAdd);
        } else if (args[0] === '--sync') {
            await syncEnvVars();
        } else {
            console.error(`Unknown command: ${args[0]}`);
            process.exit(1);
        }
    } else {
        await checkEnvVars();
    }
};

// Execute the main function
main();
