import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { loadPackageJson } from './config.js';
import { scanAndAddVars, promptForEnvVars } from './prompter.js';
import { updateOrAppendEnv } from './envFile.js';

export const checkEnvVars = async (targetEnv = null) => {
    try {
        const packageJson = loadPackageJson();
        const currentEnvPath = path.resolve(process.cwd(), '.env');

        // Check for "envCheck" configuration in package.json
        if (!packageJson.envCheck || typeof packageJson.envCheck !== 'object' || Array.isArray(packageJson.envCheck)) {
            const answer = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'shouldScan',
                    message: 'No "envCheck" configuration found in package.json. Would you like to scan your project to automatically find and add environment variables?',
                    default: true
                }
            ]);

            if (answer.shouldScan) {
                await scanAndAddVars();
                console.log('\nChecking environment variables after project scan...');
                await checkEnvVars(targetEnv);
                return;
            } else {
                console.log('Exiting. Please add "envCheck" configuration to your package.json manually.');
                process.exit(0);
            }
        }

        const envToVerify = targetEnv || process.env.NODE_ENV || 'default';
        const envConfig = (packageJson.envCheck.environments && packageJson.envCheck.environments[envToVerify]) || {};
        
        const envVarsToCheck = Object.keys(envConfig).filter((key) => {
            const val = envConfig[key];
            return val !== false && (typeof val !== 'object' || val.required !== false);
        });

        // Check for missing environment variables
        const missingVars = Array.from(new Set(envVarsToCheck.filter((variable) => !process.env[variable])));

        if (missingVars.length > 0) {
            console.log(`Missing environment variables for environment '${envToVerify}': ${missingVars.join(', ')}`);

            // Prompt user for missing variables
            const answers = await promptForEnvVars(missingVars);

            // Update or append missing variables to .env file
            updateOrAppendEnv(currentEnvPath, answers);
            console.log('.env file updated successfully.');
        } else {
            console.log(`All environment variables for environment '${envToVerify}' are set.`);
        }
    } catch (error) {
        console.error('An error occurred:', error);
    }
};

// Runtime utility function to validate environment variables synchronously
export const validateEnv = (targetEnv = null) => {
    let packageJson;
    try {
        packageJson = loadPackageJson(true); // readOnly = true
    } catch (e) {
        throw new Error(`SebEnv Validation Error: Failed to load package.json. ${e.message}`);
    }

    if (!packageJson.envCheck || typeof packageJson.envCheck !== 'object' || Array.isArray(packageJson.envCheck)) {
        console.warn('SebEnv: No valid "envCheck" configuration found in package.json. Skipping validation.');
        return;
    }

    const envToVerify = targetEnv || process.env.NODE_ENV || 'default';
    const envConfig = (packageJson.envCheck.environments && packageJson.envCheck.environments[envToVerify]) || {};
    
    const envVarsToCheck = Object.keys(envConfig).filter((key) => {
        const val = envConfig[key];
        return val !== false && (typeof val !== 'object' || val.required !== false);
    });

    const missingVars = envVarsToCheck.filter((variable) => !process.env[variable]);

    if (missingVars.length > 0) {
        throw new Error(`SebEnv Validation Error: Missing required environment variables for environment '${envToVerify}': ${missingVars.join(', ')}`);
    }
};
