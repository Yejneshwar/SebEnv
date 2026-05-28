import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { hasWhiteSpace } from '../lib/utils.js';
import { extractDestructuredVars, scanSourceForEnvVars } from '../lib/scanner.js';
import { updateOrAppendEnv } from '../lib/envFile.js';
import { addEnvVars, syncEnvVars, loadPackageJson } from '../lib/config.js';
import { checkEnvVars, ciCheck } from '../lib/validator.js';
import { validateEnv } from '../index.js';

test('hasWhiteSpace should detect whitespace correctly', () => {
    assert.strictEqual(hasWhiteSpace('hello world'), true);
    assert.strictEqual(hasWhiteSpace('hello\tworld'), true);
    assert.strictEqual(hasWhiteSpace('hello\nworld'), true);
    assert.strictEqual(hasWhiteSpace('helloworld'), false);
    assert.strictEqual(hasWhiteSpace(123), false);
    assert.strictEqual(hasWhiteSpace(null), false);
    assert.strictEqual(hasWhiteSpace(undefined), false);
});

test('extractDestructuredVars should parse destructuring syntaxes', () => {
    // Basic
    assert.deepStrictEqual(extractDestructuredVars('PORT, DATABASE_URL'), ['PORT', 'DATABASE_URL']);
    
    // With rename and defaults
    assert.deepStrictEqual(
        extractDestructuredVars('PORT: portNumber = 3000, DATABASE_URL: dbUrl, REDIS_HOST = "localhost"'),
        ['PORT', 'DATABASE_URL', 'REDIS_HOST']
    );
    
    // With newlines and spaces
    assert.deepStrictEqual(
        extractDestructuredVars(`
            PORT,
            DATABASE_URL
        `),
        ['PORT', 'DATABASE_URL']
    );

    // With comments
    assert.deepStrictEqual(
        extractDestructuredVars(`
            PORT, // port number
            /* database url */ DATABASE_URL,
            REDIS_HOST
        `),
        ['PORT', 'DATABASE_URL', 'REDIS_HOST']
    );
});

test('updateOrAppendEnv should update .env variables in place and append new ones', () => {
    const tempEnvPath = path.join(tmpdir(), `env-check-test-${Date.now()}.env`);
    
    try {
        // Create initial .env
        const initialContent = `# Init comment
API_KEY=existing_value

PORT=

# Some other comment`;
        fs.writeFileSync(tempEnvPath, initialContent, 'utf8');

        // Update empty key and add new ones
        updateOrAppendEnv(tempEnvPath, {
            PORT: '3000',
            SESSION_SECRET: 'secret key here',
            NEW_VAR: 'value'
        });

        const updatedContent = fs.readFileSync(tempEnvPath, 'utf8');
        
        // Assert PORT is updated in-place
        assert.ok(updatedContent.includes('PORT=3000'));
        // Assert SESSION_SECRET is escaped and appended under Auto GEN
        assert.ok(updatedContent.includes('SESSION_SECRET="secret key here"'));
        assert.ok(updatedContent.includes('NEW_VAR=value'));
        assert.ok(updatedContent.includes('#Auto GEN by envCheck'));
        // Assert existing keys are preserved
        assert.ok(updatedContent.includes('API_KEY=existing_value'));
        assert.ok(updatedContent.includes('# Init comment'));
        
        // Second update to verify in-place update of an existing auto-gen variable
        updateOrAppendEnv(tempEnvPath, {
            PORT: '4000',
            NEW_VAR: 'newValue'
        });

        const finalContent = fs.readFileSync(tempEnvPath, 'utf8');
        assert.ok(finalContent.includes('PORT=4000'));
        assert.ok(finalContent.includes('NEW_VAR=newValue'));
        
        // Ensure no duplicate definitions
        const lines = finalContent.split(/\r?\n/).map(l => l.trim());
        const portLines = lines.filter(l => l.startsWith('PORT='));
        assert.strictEqual(portLines.length, 1);
    } finally {
        if (fs.existsSync(tempEnvPath)) {
            fs.unlinkSync(tempEnvPath);
        }
    }
});

test('scanDirectory and file scanning should find all process.env occurrences while ignoring comments', () => {
    const originalCwd = process.cwd();
    const tempProjectDir = path.join(tmpdir(), `env-check-project-${Date.now()}`);
    const srcDir = path.join(tempProjectDir, 'src');
    
    try {
        fs.mkdirSync(tempProjectDir, { recursive: true });
        fs.mkdirSync(srcDir, { recursive: true });
        
        // Write mock files
        const jsFile = `
            const a = process.env.DOT_VAR;
            const b = process.env['BRACKET_VAR'];
            const { DESTRUCT_VAR } = process.env;
            
            // process.env.IGNORED_LINE_VAR = 1;
            /*
            process.env.IGNORED_BLOCK_VAR = 2;
            */
            const url = "https://example.com"; // shouldn't match URLs or comments
        `;
        fs.writeFileSync(path.join(srcDir, 'app.js'), jsFile, 'utf8');
        
        // Change process.cwd to run the scanner on our temp project
        process.chdir(tempProjectDir);
        
        // Run scan
        const found = scanSourceForEnvVars();
        
        assert.ok(found.includes('DOT_VAR'), 'Should find dot notation variables');
        assert.ok(found.includes('BRACKET_VAR'), 'Should find bracket notation variables');
        assert.ok(found.includes('DESTRUCT_VAR'), 'Should find destructured variables');
        assert.strictEqual(found.includes('IGNORED_LINE_VAR'), false, 'Should ignore line comment variables');
        assert.strictEqual(found.includes('IGNORED_BLOCK_VAR'), false, 'Should ignore block comment variables');
        assert.strictEqual(found.length, 3, 'Should find exactly 3 variables');
    } finally {
        process.chdir(originalCwd);
        try {
            fs.rmSync(tempProjectDir, { recursive: true, force: true });
        } catch {
            // ignore cleanup errors
        }
    }
});

test('addEnvVars should not add duplicate entries to package.json envCheck list', async () => {
    const originalCwd = process.cwd();
    const tempProjectDir = path.join(tmpdir(), `env-check-add-${Date.now()}`);
    
    try {
        fs.mkdirSync(tempProjectDir, { recursive: true });
        
        // Write initial package.json with existing config
        const packageJson = {
            name: "test-dup-check",
            envCheck: ["EXISTING_VAR"]
        };
        fs.writeFileSync(path.join(tempProjectDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
        
        process.chdir(tempProjectDir);
        
        // Call addEnvVars with duplicate and new vars
        await addEnvVars(["EXISTING_VAR", "NEW_VAR", "NEW_VAR"]);
        
        // Read updated package.json
        const updated = JSON.parse(fs.readFileSync(path.join(tempProjectDir, 'package.json'), 'utf8'));
        
        assert.deepStrictEqual(updated.envCheck, {
            scan: { excludeDirectories: [] },
            environments: {
                default: {
                    EXISTING_VAR: { required: true },
                    NEW_VAR: { required: true }
                }
            }
        });
    } finally {
        process.chdir(originalCwd);
        try {
            fs.rmSync(tempProjectDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }
});

test('syncEnvVars should not add duplicate entries from .env', async () => {
    const originalCwd = process.cwd();
    const tempProjectDir = path.join(tmpdir(), `env-check-sync-${Date.now()}`);
    
    try {
        fs.mkdirSync(tempProjectDir, { recursive: true });
        
        // Write package.json and .env files
        const packageJson = {
            name: "test-sync-dup",
            envCheck: ["EXISTING_VAR"]
        };
        fs.writeFileSync(path.join(tempProjectDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
        
        const envContent = `
EXISTING_VAR=some_val
NEW_VAR=val2
NEW_VAR=val3
        `;
        fs.writeFileSync(path.join(tempProjectDir, '.env'), envContent, 'utf8');
        
        process.chdir(tempProjectDir);
        
        // Call syncEnvVars
        await syncEnvVars();
        
        // Read updated package.json
        const updated = JSON.parse(fs.readFileSync(path.join(tempProjectDir, 'package.json'), 'utf8'));
        
        assert.deepStrictEqual(updated.envCheck, {
            scan: { excludeDirectories: [] },
            environments: {
                default: {
                    EXISTING_VAR: { required: true },
                    NEW_VAR: { required: true }
                }
            }
        });
    } finally {
        process.chdir(originalCwd);
        try {
            fs.rmSync(tempProjectDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }
});

test('scanSourceForEnvVars should exclude directories specified in customIgnoreDirs', () => {
    const originalCwd = process.cwd();
    const tempProjectDir = path.join(tmpdir(), `env-check-exclude-${Date.now()}`);
    const srcDir = path.join(tempProjectDir, 'src');
    const customIgnoreDir = path.join(srcDir, 'ignored-custom');
    
    try {
        fs.mkdirSync(tempProjectDir, { recursive: true });
        fs.mkdirSync(srcDir, { recursive: true });
        fs.mkdirSync(customIgnoreDir, { recursive: true });
        
        // Write file in src
        fs.writeFileSync(
            path.join(srcDir, 'app.js'),
            'const x = process.env.KEEP_ME;',
            'utf8'
        );
        
        // Write file in ignored directory
        fs.writeFileSync(
            path.join(customIgnoreDir, 'ignored.js'),
            'const y = process.env.IGNORE_ME;',
            'utf8'
        );
        
        process.chdir(tempProjectDir);
        
        // Run scan with custom ignore
        const found = scanSourceForEnvVars(['ignored-custom']);
        
        assert.ok(found.includes('KEEP_ME'), 'Should find variables in non-ignored folders');
        assert.strictEqual(found.includes('IGNORE_ME'), false, 'Should ignore variables inside excluded folders');
    } finally {
        process.chdir(originalCwd);
        try {
            fs.rmSync(tempProjectDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }
});

test('loadPackageJson should automatically upgrade legacy array configurations to objects', () => {
    const originalCwd = process.cwd();
    const tempProjectDir = path.join(tmpdir(), `env-check-upgrade-${Date.now()}`);
    
    try {
        fs.mkdirSync(tempProjectDir, { recursive: true });
        
        const packageJson = {
            name: "test-legacy-upgrade",
            envCheck: ["VAR_A", "VAR_B"]
        };
        fs.writeFileSync(path.join(tempProjectDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
        
        process.chdir(tempProjectDir);
        
        // Call loadPackageJson which triggers the upgrade path
        const loaded = loadPackageJson();
        
        const expected = {
            scan: { excludeDirectories: [] },
            environments: {
                default: {
                    VAR_A: { required: true },
                    VAR_B: { required: true }
                }
            }
        };
        
        // Assert loaded object is upgraded
        assert.deepStrictEqual(loaded.envCheck, expected);
        
        // Assert updated package.json on disk is upgraded
        const diskContent = JSON.parse(fs.readFileSync(path.join(tempProjectDir, 'package.json'), 'utf8'));
        assert.deepStrictEqual(diskContent.envCheck, expected);
    } finally {
        process.chdir(originalCwd);
        try {
            fs.rmSync(tempProjectDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }
});

test('checkEnvVars should ignore optional variables in object configuration', async () => {
    const originalCwd = process.cwd();
    const tempProjectDir = path.join(tmpdir(), `env-check-optional-${Date.now()}`);
    
    try {
        fs.mkdirSync(tempProjectDir, { recursive: true });
        
        // Write package.json with optional variables in different formats, and one required variable that exists in process.env
        const packageJson = {
            name: "test-optional-check",
            envCheck: {
                scan: { excludeDirectories: [] },
                environments: {
                    default: {
                        EXISTING_REQUIRED: { required: true },
                        OPTIONAL_FALSE: false,
                        OPTIONAL_OBJ_FALSE: { required: false }
                    }
                }
            }
        };
        fs.writeFileSync(path.join(tempProjectDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
        
        // Create an empty .env so that it checks process.env
        fs.writeFileSync(path.join(tempProjectDir, '.env'), '', 'utf8');
        
        // Set EXISTING_REQUIRED in process.env
        process.env.EXISTING_REQUIRED = 'some_val';
        // Ensure OPTIONAL variables are NOT in process.env
        delete process.env.OPTIONAL_FALSE;
        delete process.env.OPTIONAL_OBJ_FALSE;
        
        process.chdir(tempProjectDir);
        
        // checkEnvVars should complete successfully without prompts because all required variables are set
        await checkEnvVars();
        
        assert.ok(true, 'Completed checkEnvVars without prompt');
    } finally {
        delete process.env.EXISTING_REQUIRED;
        process.chdir(originalCwd);
        try {
            fs.rmSync(tempProjectDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }
});

test('loadPackageJson should automatically upgrade flat object configurations and envCheckExclude to nested format', () => {
    const originalCwd = process.cwd();
    const tempProjectDir = path.join(tmpdir(), `env-check-upgrade-obj-${Date.now()}`);
    
    try {
        fs.mkdirSync(tempProjectDir, { recursive: true });
        
        const packageJson = {
            name: "test-flat-upgrade",
            envCheck: {
                VAR_C: { required: true },
                OPTIONAL: false
            },
            envCheckExclude: ["dist", "build"]
        };
        fs.writeFileSync(path.join(tempProjectDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
        
        process.chdir(tempProjectDir);
        
        // Call loadPackageJson which triggers the upgrade path
        const loaded = loadPackageJson();
        
        const expected = {
            scan: { excludeDirectories: ["dist", "build"] },
            environments: {
                default: {
                    VAR_C: { required: true },
                    OPTIONAL: false
                }
            }
        };
        
        // Assert loaded object is upgraded and envCheckExclude is moved
        assert.deepStrictEqual(loaded.envCheck, expected);
        assert.strictEqual(loaded.envCheckExclude, undefined, 'envCheckExclude should be removed');
        
        // Assert updated package.json on disk is upgraded
        const diskContent = JSON.parse(fs.readFileSync(path.join(tempProjectDir, 'package.json'), 'utf8'));
        assert.deepStrictEqual(diskContent.envCheck, expected);
        assert.strictEqual(diskContent.envCheckExclude, undefined);
    } finally {
        process.chdir(originalCwd);
        try {
            fs.rmSync(tempProjectDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }
});

test('validateEnv should throw error if required variables are missing and pass if set', () => {
    const originalCwd = process.cwd();
    const tempProjectDir = path.join(tmpdir(), `env-check-validate-${Date.now()}`);
    
    try {
        fs.mkdirSync(tempProjectDir, { recursive: true });
        
        const packageJson = {
            name: "test-validate",
            envCheck: {
                scan: { excludeDirectories: [] },
                environments: {
                    default: {
                        MISSING_VAR: { required: true },
                        OPTIONAL_VAR: false
                    }
                }
            }
        };
        fs.writeFileSync(path.join(tempProjectDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
        process.chdir(tempProjectDir);
        
        // Ensure variable is missing
        delete process.env.MISSING_VAR;
        
        assert.throws(
            () => { validateEnv(); },
            /SebEnv Validation Error: Missing required environment variables for environment 'default': MISSING_VAR/
        );
        
        // Set the variable, validation should now pass
        process.env.MISSING_VAR = 'exists';
        
        assert.doesNotThrow(() => { validateEnv(); });
    } finally {
        delete process.env.MISSING_VAR;
        process.chdir(originalCwd);
        try {
            fs.rmSync(tempProjectDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }
});

test('validateEnv should support validating different environments (default, dev, prod)', () => {
    const originalCwd = process.cwd();
    const tempProjectDir = path.join(tmpdir(), `env-check-multi-env-${Date.now()}`);
    
    try {
        fs.mkdirSync(tempProjectDir, { recursive: true });
        
        const packageJson = {
            name: "test-multi-env",
            envCheck: {
                environments: {
                    default: { DEFAULT_VAR: { required: true } },
                    dev: { DEV_VAR: { required: true } },
                    prod: { PROD_VAR: { required: true } }
                }
            }
        };
        fs.writeFileSync(path.join(tempProjectDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
        process.chdir(tempProjectDir);
        
        // 1. Test "default" environment (explicit and implicit)
        assert.throws(
            () => { validateEnv('default'); },
            /SebEnv Validation Error: Missing required environment variables for environment 'default': DEFAULT_VAR/
        );
        assert.throws(
            () => { validateEnv(); }, // Should fallback to 'default'
            /SebEnv Validation Error: Missing required environment variables for environment 'default': DEFAULT_VAR/
        );
        process.env.DEFAULT_VAR = '1';
        assert.doesNotThrow(() => { validateEnv('default'); });
        
        // 2. Test "dev" environment
        assert.throws(
            () => { validateEnv('dev'); },
            /SebEnv Validation Error: Missing required environment variables for environment 'dev': DEV_VAR/
        );
        process.env.DEV_VAR = '1';
        assert.doesNotThrow(() => { validateEnv('dev'); });
        
        // 3. Test "prod" environment using NODE_ENV
        process.env.NODE_ENV = 'prod';
        assert.throws(
            () => { validateEnv(); }, // Should read process.env.NODE_ENV
            /SebEnv Validation Error: Missing required environment variables for environment 'prod': PROD_VAR/
        );
        process.env.PROD_VAR = '1';
        assert.doesNotThrow(() => { validateEnv(); });
        
    } finally {
        delete process.env.DEFAULT_VAR;
        delete process.env.DEV_VAR;
        delete process.env.PROD_VAR;
        delete process.env.NODE_ENV;
        process.chdir(originalCwd);
        try {
            fs.rmSync(tempProjectDir, { recursive: true, force: true });
        } catch {}
    }
});

test('validateEnv should perform legacy upgrades in memory without mutating package.json on disk', () => {
    const originalCwd = process.cwd();
    const tempProjectDir = path.join(tmpdir(), `env-check-readonly-${Date.now()}`);
    
    try {
        fs.mkdirSync(tempProjectDir, { recursive: true });
        
        const originalPackageJson = {
            name: "test-readonly",
            envCheck: ["LEGACY_VAR"]
        };
        const initialContent = JSON.stringify(originalPackageJson, null, 2);
        fs.writeFileSync(path.join(tempProjectDir, 'package.json'), initialContent, 'utf8');
        process.chdir(tempProjectDir);
        
        process.env.LEGACY_VAR = 'exists';
        
        // Validation should pass using in-memory upgraded object
        assert.doesNotThrow(() => { validateEnv(); });
        
        // Assert file on disk remains completely unchanged
        const diskContent = fs.readFileSync(path.join(tempProjectDir, 'package.json'), 'utf8');
        assert.strictEqual(diskContent, initialContent);
    } finally {
        delete process.env.LEGACY_VAR;
        process.chdir(originalCwd);
        try {
            fs.rmSync(tempProjectDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }
});

test('ciCheck utility', async (t) => {
    await t.test('should exit with 1 if env file is not found', () => {
        const originalExit = process.exit;
        const originalError = console.error;
        let exitCode = null;
        let errorMsg = '';
        process.exit = (code) => { exitCode = code; };
        console.error = (msg) => { errorMsg += msg; };

        ciCheck('nonexistent.env');

        assert.strictEqual(exitCode, 1);
        assert.ok(errorMsg.includes('Environment file not found'));

        process.exit = originalExit;
        console.error = originalError;
    });

    await t.test('should exit with 1 if required env vars are missing', () => {
        const tempProjectDir = path.join(tmpdir(), `env-check-ci-missing-${Date.now()}`);
        fs.mkdirSync(tempProjectDir, { recursive: true });
        
        const packageJson = {
            envCheck: { environments: { default: { MISSING_CI_VAR: { required: true }, ANOTHER_VAR: { required: true } } } }
        };
        fs.writeFileSync(path.join(tempProjectDir, 'package.json'), JSON.stringify(packageJson), 'utf8');
        
        const envContent = 'MISSING_CI_VAR=123';
        fs.writeFileSync(path.join(tempProjectDir, '.env'), envContent, 'utf8');

        const originalCwd = process.cwd();
        process.chdir(tempProjectDir);

        const originalExit = process.exit;
        const originalError = console.error;
        let exitCode = null;
        let errorMsg = '';
        process.exit = (code) => { exitCode = code; };
        console.error = (msg) => { errorMsg += msg; };

        ciCheck('.env');

        assert.strictEqual(exitCode, 1);
        assert.ok(errorMsg.includes('Missing required environment variables'));
        assert.ok(errorMsg.includes('ANOTHER_VAR')); // ANOTHER_VAR is missing since we only provided MISSING_CI_VAR in .env

        process.exit = originalExit;
        console.error = originalError;
        process.chdir(originalCwd);
        try { fs.rmSync(tempProjectDir, { recursive: true, force: true }); } catch {}
    });

    await t.test('should pass if all required env vars are defined', () => {
        const tempProjectDir = path.join(tmpdir(), `env-check-ci-pass-${Date.now()}`);
        fs.mkdirSync(tempProjectDir, { recursive: true });
        
        const packageJson = {
            envCheck: { environments: { default: { EXISTING_CI_VAR: { required: true } } } }
        };
        fs.writeFileSync(path.join(tempProjectDir, 'package.json'), JSON.stringify(packageJson), 'utf8');
        
        const envContent = 'EXISTING_CI_VAR=exists';
        fs.writeFileSync(path.join(tempProjectDir, '.env'), envContent, 'utf8');

        const originalCwd = process.cwd();
        process.chdir(tempProjectDir);

        const originalExit = process.exit;
        const originalLog = console.log;
        let exitCode = null;
        let logMsg = '';
        process.exit = (code) => { exitCode = code; };
        console.log = (msg) => { logMsg += msg; };

        ciCheck('.env');

        assert.strictEqual(exitCode, null);
        assert.ok(logMsg.includes("All required environment variables for environment 'default' are defined."));

        process.exit = originalExit;
        console.log = originalLog;
        process.chdir(originalCwd);
        try { fs.rmSync(tempProjectDir, { recursive: true, force: true }); } catch {}
    });
});
