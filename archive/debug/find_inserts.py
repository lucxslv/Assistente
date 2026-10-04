import re
with open('.venv/Lib/site-packages/chainlit/data/chainlit_data_layer.py', 'r', encoding='utf-8') as f:
    text = f.read()
    print('INSERT INTO User:', re.findall(r'INSERT INTO "User" \((.*?)\)', text))
    print('INSERT INTO Thread:', re.findall(r'INSERT INTO "Thread" \(\{", "\.join\([^)]+\)\}\)', text))
    # It seems Thread columns are dynamic!
    for line in text.split('\n'):
        if 'columns =' in line or 'columns=' in line:
            print(line.strip())
