import re

file_path = r'C:\Users\user\Desktop\sishgp\java.js'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix common corrupted patterns in tags
# 1. < div -> <div
# 2. </ div -> </div
# 3. div > -> div>
# 4. <!-- something -- > -> <!-- something -->

# List of common HTML tags to target specifically to avoid accidental replacements in code logic
tags = ['div', 'span', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'input', 'button', 'select', 'option', 'label', 'h1', 'h2', 'h3', 'h4', 'i', 'p', 'b', 'strong', 'a', 'form', 'aside', 'nav', 'ul', 'li', 'section', 'header', 'footer']

for tag in tags:
    # Pattern: < tag
    content = re.sub(rf'< +{tag}', f'<{tag}', content, flags=re.IGNORECASE)
    # Pattern: </ tag
    content = re.sub(rf'</ +{tag}', f'</{tag}', content, flags=re.IGNORECASE)
    # Pattern: tag >
    content = re.sub(rf'{tag} +>', f'{tag}>', content, flags=re.IGNORECASE)

# Fix comments: -- > to -->
content = content.replace('-- >', '-->')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Java.js tags cleaned successfully.")
