import re

with open('java.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

current_func = None
matches = []

for i, line in enumerate(lines):
    func_match = re.search(r'function\s+(\w+)\s*\(', line)
    if func_match:
        current_func = func_match.group(1)
    
    if 'saveToLocalStorage()' in line:
        matches.append(f'Line {i+1}: in function {current_func}')

    # Also check if it's assigned to window or inside event listener
    # Basic matching is often enough here

for m in matches:
    print(m)
