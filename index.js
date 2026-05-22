#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { addEnvVars, syncEnvVars } from './lib/config.js';
import { scanAndAddVars } from './lib/prompter.js';
import { checkEnvVars } from './lib/validator.js';

// Load existing environment variables from .env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Re-exports
export { validateEnv } from './lib/validator.js';

// Main function to run the script
export const main = async () => {
    const args = process.argv.slice(2);
    
    // Parse global flags like --env
    let targetEnv = null;
    let cliExclude = [];
    const commandArgs = [];
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--env' || args[i] === '-e') {
            if (i + 1 < args.length) {
                targetEnv = args[i + 1];
                i++;
            }
        } else if (args[i] === '--exclude') {
            if (i + 1 < args.length) {
                const parts = args[i + 1].split(',').map(d => d.trim());
                cliExclude.push(...parts);
                i++;
            }
        } else {
            commandArgs.push(args[i]);
        }
    }

    if (commandArgs.length > 0) {
        if (commandArgs[0] === '--add') {
            const varsToAdd = commandArgs.slice(1);
            if (varsToAdd.length === 0) {
                console.error('No variables provided to add.');
                process.exit(1);
            }
            await addEnvVars(varsToAdd, targetEnv || 'default');
        } else if (commandArgs[0] === '--sync') {
            await syncEnvVars(targetEnv || 'default');
        } else if (commandArgs[0] === '--scan' || commandArgs[0] === '--find') {
            await scanAndAddVars(cliExclude, targetEnv);
        } else {
            console.error(`Unknown command: ${commandArgs[0]}`);
            process.exit(1);
        }
    } else {
        await checkEnvVars(targetEnv);
    }
};

// Only execute the main function if executed directly as the entrypoint
const runMain = () => {
    try {
        const entryPath = fs.realpathSync(process.argv[1]);
        const currentPath = fileURLToPath(import.meta.url);
        return entryPath === currentPath;
    } catch {
        return false;
    }
};

if (runMain()) {
    main();
}
