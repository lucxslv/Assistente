"""Ponto de entrada Serverless da Vercel para o Charlie Cloud Brain."""

import os
import sys

# Garante que a raiz do repositório esteja no sys.path para todos os módulos
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from api.main import app
