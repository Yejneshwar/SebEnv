import fs from 'fs';
import path from 'path';

export const scanDirectory = (dir, ignoredDirs, extensions) => {
    let files = [];
    try {
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const fullPath = path.resolve(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                if (ignoredDirs.includes(file)) continue;
                files = files.concat(scanDirectory(fullPath, ignoredDirs, extensions));
            } else if (stat.isFile()) {
                const ext = path.extname(file);
                if (extensions.includes(ext)) {
                    files.push(fullPath);
                }
            }
        }
    } catch (err) {
        // Ignore folder read errors (like permissions) silently
    }
    return files;
};

// Helper function to extract destructured variables
export const extractDestructuredVars = (destructuredStr) => {
    const cleanStr = destructuredStr
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '');
    const vars = [];
    const parts = cleanStr.split(',');
    for (let part of parts) {
        part = part.trim();
        if (!part) continue;
        // Handle default assignment: e.g. PORT = 3000
        if (part.includes('=')) {
            part = part.split('=')[0].trim();
        }
        // Handle renaming: e.g. API_KEY: apiKey
        if (part.includes(':')) {
            part = part.split(':')[0].trim();
        }
        // Validate variable name format
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part)) {
            vars.push(part);
        }
    }
    return vars;
};

// Main function to scan source files and extract process.env variables
export const scanSourceForEnvVars = (customIgnoreDirs = []) => {
    const srcPath = path.resolve(process.cwd(), 'src');
    let scanPath = process.cwd();
    
    // If src directory exists, use it. Otherwise scan cwd recursively (with ignores)
    if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
        scanPath = srcPath;
    }

    const defaultIgnored = ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'out', 'coverage', '.cache'];
    const ignoredDirs = [...defaultIgnored, ...customIgnoreDirs];
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte'];

    console.log(`Scanning directory: ${scanPath}...`);
    const files = scanDirectory(scanPath, ignoredDirs, extensions);
    
    const foundVars = new Set();
    const dotRegex = /\bprocess\.env\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    const bracketRegex = /\bprocess\.env\s*\[\s*['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]\s*\]/g;
    const destructureRegex = /(?:const|let|var)\s*\{\s*([^}]+)\s*\}\s*=\s*process\.env/g;

    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            // Strip comments to avoid finding process.env in comments
            const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
            
            // 1. Match dot notation
            for (const match of cleanContent.matchAll(dotRegex)) {
                foundVars.add(match[1]);
            }
            
            // 2. Match bracket notation
            for (const match of cleanContent.matchAll(bracketRegex)) {
                foundVars.add(match[1]);
            }
            
            // 3. Match destructuring
            for (const match of cleanContent.matchAll(destructureRegex)) {
                const extracted = extractDestructuredVars(match[1]);
                for (const v of extracted) {
                    foundVars.add(v);
                }
            }
        } catch (err) {
            // Ignore individual file reading errors
        }
    }

    return Array.from(foundVars);
};
