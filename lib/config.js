import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Function to save the updated package.json back to the file system
export const savePackageJson = (packageJson) => {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');
};

// Function to load and parse the package.json file synchronously
export const loadPackageJson = (readOnly = false) => {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        if (readOnly) {
            throw new Error('package.json not found in the current directory.');
        } else {
            console.error('package.json not found in the current directory. Please run this tool in a Node.js project root.');
            process.exit(1);
        }
    }
    try {
        const content = fs.readFileSync(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(content);
        let didUpgrade = false;

        // Upgrade envCheck from legacy formats if needed
        if (packageJson.envCheck) {
            // Upgrade 1: Array to flat object format
            if (Array.isArray(packageJson.envCheck)) {
                const upgraded = {};
                packageJson.envCheck.forEach((variable) => {
                    upgraded[variable] = { required: true };
                });
                packageJson.envCheck = upgraded;
                didUpgrade = true;
                if (!readOnly) console.log('Upgraded package.json envCheck config from Array to Object format.');
            }
            
            // Upgrade 2: Flat object format to Nested format with environments and scan
            if (!packageJson.envCheck.environments) {
                const oldConfig = { ...packageJson.envCheck };
                // Ensure we don't accidentally move existing 'scan' or other root properties as variables if it was partially formatted
                delete oldConfig.scan;
                
                packageJson.envCheck = {
                    scan: {
                        excludeDirectories: []
                    },
                    environments: {
                        default: oldConfig
                    }
                };
                
                if (packageJson.envCheckExclude && Array.isArray(packageJson.envCheckExclude)) {
                    packageJson.envCheck.scan.excludeDirectories = packageJson.envCheckExclude;
                    delete packageJson.envCheckExclude;
                }
                
                didUpgrade = true;
                if (!readOnly) console.log('Upgraded package.json envCheck config to nested environments format.');
            } else if (packageJson.envCheckExclude && Array.isArray(packageJson.envCheckExclude)) {
                // If it has environments but still has envCheckExclude at root level
                packageJson.envCheck.scan = packageJson.envCheck.scan || {};
                packageJson.envCheck.scan.excludeDirectories = packageJson.envCheckExclude;
                delete packageJson.envCheckExclude;
                didUpgrade = true;
                if (!readOnly) console.log('Migrated envCheckExclude to envCheck.scan.excludeDirectories.');
            }
        }
        
        if (didUpgrade && !readOnly) {
            savePackageJson(packageJson);
        }
        
        return packageJson;
    } catch (error) {
        console.error(`Failed to parse package.json: ${error.message}`);
        process.exit(1);
    }
};

// Function to add variables to the envCheck field in package.json
export const addEnvVars = async (varsToAdd, targetEnv = 'default') => {
    const packageJson = loadPackageJson();

    if (!packageJson.envCheck) {
        packageJson.envCheck = { scan: { excludeDirectories: [] }, environments: { default: {} } };
    }
    packageJson.envCheck.environments = packageJson.envCheck.environments || { default: {} };

    const envsToUpdate = targetEnv === 'all'
        ? Object.keys(packageJson.envCheck.environments)
        : [targetEnv];

    for (const env of envsToUpdate) {
        if (!packageJson.envCheck.environments[env]) {
            packageJson.envCheck.environments[env] = {};
        }

        const envConfig = packageJson.envCheck.environments[env];
        varsToAdd.forEach((variable) => {
            if (!envConfig[variable]) {
                envConfig[variable] = { required: true };
            }
        });
    }

    savePackageJson(packageJson);
    console.log(`Added variables: ${varsToAdd.join(', ')} to the envCheck field in package.json (Environment: ${targetEnv})`);
};

// Function to sync variables from .env to package.json
export const syncEnvVars = async (targetEnv = 'default') => {
    const currentEnvPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(currentEnvPath)) {
        console.error('.env file not found.');
        process.exit(1);
    }

    try {
        const envFileContent = fs.readFileSync(currentEnvPath);
        const parsed = dotenv.parse(envFileContent);
        const envVarsInFile = Object.keys(parsed);

        await addEnvVars(envVarsInFile, targetEnv);
        console.log(`Synced variables from .env to package.json (Environment: ${targetEnv}).`);
    } catch (error) {
        console.error(`Failed to parse .env file: ${error.message}`);
        process.exit(1);
    }
};
