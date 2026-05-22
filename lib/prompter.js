import inquirer from 'inquirer';
import { loadPackageJson, addEnvVars } from './config.js';
import { scanSourceForEnvVars } from './scanner.js';

// Function to prompt the user for missing environment variables
export const promptForEnvVars = async (missingVars) => {
    const questions = missingVars.map((variable) => ({
        type: 'input',
        name: variable,
        message: `Enter a value for ${variable}:`
    }));

    const answers = await inquirer.prompt(questions);
    return answers;
};

// Function to scan and add variables interactively
export const scanAndAddVars = async (cliExcludeDirs = [], targetEnv = null) => {
    const packageJson = loadPackageJson();
    if (!packageJson.envCheck) {
        packageJson.envCheck = { scan: { excludeDirectories: [] }, environments: { default: {} } };
    }
    
    // Safety check for older structures
    packageJson.envCheck.scan = packageJson.envCheck.scan || { excludeDirectories: [] };
    packageJson.envCheck.environments = packageJson.envCheck.environments || { default: {} };

    let packageExclude = packageJson.envCheck.scan.excludeDirectories || [];

    const mergedExclude = Array.from(new Set([...packageExclude, ...cliExcludeDirs]));
    const detectedVars = scanSourceForEnvVars(mergedExclude);
    
    let envToAddTo = targetEnv;
    
    if (!envToAddTo) {
        const availableEnvs = Object.keys(packageJson.envCheck.environments);
        const envChoices = [
            { name: 'Add to all environments', value: 'all' },
            ...availableEnvs.map(e => ({ name: `Environment: ${e}`, value: e })),
            { name: 'Create new environment...', value: 'new' }
        ];
        
        const envAnswer = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedEnv',
                message: 'Which environment would you like to add these variables to?',
                choices: envChoices
            }
        ]);
        
        if (envAnswer.selectedEnv === 'new') {
            const newEnvAnswer = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'newEnv',
                    message: 'Enter the new environment name (e.g. staging):',
                    validate: input => input ? true : 'Environment name cannot be empty.'
                }
            ]);
            envToAddTo = newEnvAnswer.newEnv;
            packageJson.envCheck.environments[envToAddTo] = {};
        } else {
            envToAddTo = envAnswer.selectedEnv;
        }
    }
    
    // Filter out variables that are already in the target environment(s)
    let missingFromConfig = [];
    if (envToAddTo === 'all') {
        const allEnvs = Object.values(packageJson.envCheck.environments);
        missingFromConfig = detectedVars.filter(variable => 
            allEnvs.some(envObj => !envObj[variable])
        );
    } else {
        const envConfig = packageJson.envCheck.environments[envToAddTo] || {};
        missingFromConfig = detectedVars.filter(variable => !envConfig[variable]);
    }

    if (missingFromConfig.length === 0) {
        console.log(`No new environment variables found in source files for ${envToAddTo === 'all' ? 'all environments' : envToAddTo}.`);
        return;
    }

    console.log(`Found ${missingFromConfig.length} new environment variable(s) in source code.`);

    const answers = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'varsToAdd',
            message: `Select the environment variables you want to add to package.json (${envToAddTo}):`,
            choices: missingFromConfig.map(v => ({ name: v, checked: true }))
        }
    ]);

    const varsToAdd = answers.varsToAdd;
    if (varsToAdd && varsToAdd.length > 0) {
        await addEnvVars(varsToAdd, envToAddTo);
    } else {
        console.log('No variables selected. No changes made.');
    }
};
