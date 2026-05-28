#!/usr/bin/env python3
"""
OCR de imagens para extração de dados imobiliários.
Usa EasyOCR para processar imagens e extrair texto.

Uso:
  python ocr.py --url "https://..." --file ./imagem.jpg
  python ocr.py --stdin  (recebe JSON: {"urls": ["..."]})
"""

import sys
import json
import os
import argparse
import tempfile
import urllib.request
from pathlib import Path

# EasyOCR é importado lazy para não atrasar o startup
_reader = None


def get_reader():
    """Inicializa o reader EasyOCR (lazy loading)."""
    global _reader
    if _reader is None:
        import easyocr
        _reader = easyocr.Reader(['pt', 'en'], gpu=False, verbose=False)
    return _reader


def download_image(url: str, dest_dir: str) -> str | None:
    """Baixa uma imagem de uma URL para o diretório de destino."""
    try:
        # Cria nome de arquivo a partir da URL
        filename = url.split('/')[-1].split('?')[0]
        if not filename.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
            filename += '.jpg'

        dest_path = os.path.join(dest_dir, filename)

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            with open(dest_path, 'wb') as f:
                f.write(resp.read())

        return dest_path
    except Exception as e:
        print(f'[OCR] Erro ao baixar {url}: {e}', file=sys.stderr)
        return None


def ocr_image(image_path: str) -> str:
    """
    Executa OCR em uma imagem local.
    Retorna o texto extraído concatenado.
    """
    try:
        reader = get_reader()
        results = reader.readtext(image_path, detail=0, paragraph=True)
        return ' '.join(results)
    except Exception as e:
        print(f'[OCR] Erro no OCR de {image_path}: {e}', file=sys.stderr)
        return ''


def process_urls(urls: list[str], images_dir: str = './data/images') -> str:
    """
    Baixa e processa uma lista de URLs de imagens.
    Retorna o texto extraído de todas as imagens.
    """
    os.makedirs(images_dir, exist_ok=True)
    all_text = []

    for url in urls:
        if not url or not url.startswith('http'):
            continue

        image_path = download_image(url, images_dir)
        if image_path:
            text = ocr_image(image_path)
            if text.strip():
                all_text.append(text)

            # Remove a imagem após processamento para economizar espaço
            try:
                os.remove(image_path)
            except Exception:
                pass

    return ' | '.join(all_text)


# ─── Interface CLI ─────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='OCR Imobiliário')
    parser.add_argument('--url', type=str, help='URL da imagem')
    parser.add_argument('--file', type=str, help='Caminho de imagem local')
    parser.add_argument('--stdin', action='store_true', help='Lê JSON do stdin: {"urls": ["..."]}')
    parser.add_argument('--images-dir', type=str, default='./data/images')
    args = parser.parse_args()

    if args.stdin:
        data = json.loads(sys.stdin.read())
        urls = data.get('urls', [])
        text = process_urls(urls, args.images_dir)
        print(json.dumps({'text': text}, ensure_ascii=False))

    elif args.url:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = download_image(args.url, tmpdir)
            if path:
                text = ocr_image(path)
                print(json.dumps({'text': text}, ensure_ascii=False, indent=2))

    elif args.file:
        text = ocr_image(args.file)
        print(json.dumps({'text': text}, ensure_ascii=False, indent=2))

    else:
        parser.print_help()
