#!/usr/bin/env python3
"""
Normalização e limpeza de dados imobiliários.
Padroniza valores antes de salvar no banco.
"""

import re
import hashlib
import json
import sys


def normalize_price(price) -> float | None:
    """Normaliza preço para float."""
    if price is None:
        return None
    try:
        return float(price)
    except (ValueError, TypeError):
        return None


def normalize_phone(phone: str | None) -> str | None:
    """Normaliza telefone para formato E.164 (apenas dígitos, com DDI 55)."""
    if not phone:
        return None
    digits = re.sub(r'\D', '', phone)
    if not digits:
        return None
    if not digits.startswith('55'):
        digits = '55' + digits
    # Valida comprimento mínimo (55 + DDD + número)
    if len(digits) < 12 or len(digits) > 13:
        return None
    return digits


def normalize_property_type(prop_type: str | None) -> str | None:
    """Normaliza tipo de imóvel para enum fixo."""
    valid = {'apartamento', 'casa', 'terreno', 'galpão', 'sala', 'kitnet', 'outro'}
    if prop_type and prop_type.lower() in valid:
        return prop_type.lower()
    return 'outro' if prop_type else None


def normalize_transaction_type(trans_type: str | None) -> str | None:
    """Normaliza tipo de transação."""
    valid = {'venda', 'aluguel', 'temporada'}
    if trans_type and trans_type.lower() in valid:
        return trans_type.lower()
    return None


def content_hash(text: str | None) -> str | None:
    """Gera hash SHA-256 do conteúdo para deduplicação."""
    if not text:
        return None
    # Normaliza espaços e maiúsculas antes do hash
    normalized = re.sub(r'\s+', ' ', text.strip().lower())
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


def normalize_post(post: dict) -> dict:
    """
    Aplica todas as normalizações a um post.
    Combina dados do texto + OCR de imagens.
    """
    text = post.get('content', '') or ''
    ocr_text = post.get('ocr_text', '') or ''
    combined = f"{text} {ocr_text}".strip()

    # Importa parser aqui para evitar circular
    import importlib.util
    import os
    parser_path = os.path.join(os.path.dirname(__file__), 'realestate.py')
    spec = importlib.util.spec_from_file_location('realestate', parser_path)
    realestate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(realestate)

    parsed = realestate.parse_post(combined)

    return {
        **post,
        'content_hash': content_hash(text),
        'price': normalize_price(parsed.get('price')),
        'phone': normalize_phone(parsed.get('phone')),
        'area_m2': parsed.get('area_m2'),
        'bedrooms': parsed.get('bedrooms'),
        'bathrooms': parsed.get('bathrooms'),
        'garage': parsed.get('garage'),
        'property_type': normalize_property_type(parsed.get('property_type')),
        'transaction_type': normalize_transaction_type(parsed.get('transaction_type')),
        'creci': parsed.get('creci'),
        'city': parsed.get('city'),
        'neighborhood': parsed.get('neighborhood'),
    }


if __name__ == '__main__':
    data = json.loads(sys.stdin.read())
    result = normalize_post(data)
    print(json.dumps(result, ensure_ascii=False, default=str))
