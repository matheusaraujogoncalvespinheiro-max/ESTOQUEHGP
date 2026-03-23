const fs = require('fs');
const content = fs.readFileSync('java.js', 'utf8');
const lines = content.split('\n');

let currentFunc = null;
let matches = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/function\s+(\w+)\s*\(/);
    if (match) {
        currentFunc = match[1];
    }

    if (line.includes('saveToLocalStorage()')) {
        matches.push(`Line ${i + 1}: function ${currentFunc}`);
    }
}

matches.forEach(m => console.log(m));

