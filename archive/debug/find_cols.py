import re
with open('.venv/Lib/site-packages/chainlit/data/chainlit_data_layer.py', 'r', encoding='utf-8') as f:
    text = f.read()
    print('Thread columns:', set(re.findall(r't\."([^"]+)"', text)))
    print('Step columns:', set(re.findall(r's\."([^"]+)"', text)))
    print('User columns:', set(re.findall(r'u\."([^"]+)"', text)))
