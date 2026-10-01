import os

script_content = '''# -*- coding: utf-8 -*-
with open('src/components/DevDatastorePage.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Verify initial markers
assert "export const DevDatastorePage" in text
print("File read, length:", len(text))
'''

with open('apply_updates.py', 'w') as f:
    f.write(script_content)
