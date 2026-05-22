import fs from 'fs';
import { hasWhiteSpace } from './utils.js';

// Helper to update environment variables in .env file in-place or append them if they don't exist
export const updateOrAppendEnv = (envPath, newVars) => {
    let content = '';
    if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf8');
    }

    let lines = content.split(/\r?\n/);
    const updatedKeys = new Set();

    for (const key of Object.keys(newVars)) {
        const val = newVars[key];
        const formattedLine = hasWhiteSpace(val) ? `${key}="${val}"` : `${key}=${val}`;
        
        // Try to find and replace existing key definition (excluding comments)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Match key=... but not commented out lines
            if (!line.startsWith('#') && (line.startsWith(`${key}=`) || line.replace(/\s+/g, '').startsWith(`${key}=`))) {
                lines[i] = formattedLine;
                updatedKeys.add(key);
                break;
            }
        }
    }

    // Identify keys that were not updated (meaning they are completely new)
    const varsToAppend = {};
    for (const key of Object.keys(newVars)) {
        if (!updatedKeys.has(key)) {
            varsToAppend[key] = newVars[key];
        }
    }

    if (Object.keys(varsToAppend).length > 0) {
        const appendContent = Object.keys(varsToAppend)
            .map((key) => {
                const val = varsToAppend[key];
                return hasWhiteSpace(val) ? `${key}="${val}"` : `${key}=${val}`;
            })
            .join('\n');

        const needsLeadingNewline = content.length > 0 && !content.endsWith('\n') && !content.endsWith('\r');
        const leading = needsLeadingNewline ? '\n' : '';
        content = lines.join('\n') + leading + `\n#Auto GEN by envCheck\n${appendContent}\n`;
    } else {
        content = lines.join('\n') + '\n';
    }

    fs.writeFileSync(envPath, content, 'utf8');
};
