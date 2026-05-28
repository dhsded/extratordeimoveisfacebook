#!/usr/bin/env python3
"""
Parser Imobiliário — extrai dados estruturados de posts de grupos do Facebook.
Usa regex + spaCy (pt_core_news_sm) para extrair informações imobiliárias.

Uso:
  python realestate.py --text "Vendo apartamento 2 quartos R$ 350.000 Bairro Jardim América SP"
  python realestate.py --test
"""

import re
import sys
import json
import argparse


# ─── Padrões Regex ─────────────────────────────────────────────────────────────

# Preço: R$ 350.000 | R$350000 | 350 mil | 1.2 milhão
PRICE_RE = re.compile(
    r'R\$\s*'
    r'(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)'
    r'|(\d+(?:[.,]\d+)?)\s*(mil(?:hão|hões)?|k)',
    re.IGNORECASE
)

# Telefone: (11) 99999-9999 | 11999999999 | +5511999999999 | WhatsApp
PHONE_RE = re.compile(
    r'(?:\+55\s?)?'
    r'(?:\(?\d{2}\)?\s?)?'
    r'(?:9\s?)?\d{4,5}[-\s]?\d{4}',
    re.IGNORECASE
)

# Metragem: 85m² | 120 m² | 200 metros
AREA_RE = re.compile(
    r'(\d+(?:[.,]\d+)?)\s*m[²2]?(?:\s*(?:úteis?|terreno|área))?',
    re.IGNORECASE
)

# Quartos: 2 quartos | 3 dormitórios | 4 dorms | suítes
BEDROOMS_RE = re.compile(
    r'(\d+)\s*(?:quartos?|dorm(?:itório)?s?|suítes?|suite)',
    re.IGNORECASE
)

# Banheiros: 2 banheiros | 1 WC
BATHROOMS_RE = re.compile(
    r'(\d+)\s*(?:banheiros?|wc|lavabos?)',
    re.IGNORECASE
)

# Vagas de garagem: 2 vagas | garagem p/ 3 carros
GARAGE_RE = re.compile(
    r'(\d+)\s*(?:vagas?|garagem)',
    re.IGNORECASE
)

# CRECI: CRECI 12345-F | CRECI/SP 12345
CRECI_RE = re.compile(
    r'CRECI[/\s-]?(?:[A-Z]{2}[/\s-]?)?(\d{4,6}[-/]?[A-ZJ]?)',
    re.IGNORECASE
)

# Tipos de imóvel
PROPERTY_TYPES = {
    'apartamento': ['apartamento', 'apto', 'ap.', 'flat', 'studio'],
    'casa': ['casa', 'residência', 'sobrado', 'chalé'],
    'terreno': ['terreno', 'lote', 'área', 'chácara', 'sítio'],
    'galpão': ['galpão', 'galpao', 'barracão', 'armazém'],
    'sala': ['sala', 'sala comercial', 'escritório', 'loja'],
    'kitnet': ['kitnet', 'quitinete', 'conjugado'],
}

TRANSACTION_TYPES = {
    'venda': ['vendo', 'venda', 'vende', 'à venda', 'comprar', 'oportunidade de compra'],
    'aluguel': ['aluguel', 'aluga', 'alugo', 'locação', 'para alugar'],
    'temporada': ['temporada', 'diária', 'final de semana'],
}

# Cidades brasileiras conhecidas (expandir conforme necessário)
KNOWN_CITIES = [
    'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Salvador', 'Fortaleza',
    'Curitiba', 'Manaus', 'Recife', 'Porto Alegre', 'Belém', 'Goiânia',
    'Guarulhos', 'Campinas', 'São Luís', 'Maceió', 'Natal', 'Teresina',
    'Campo Grande', 'João Pessoa', 'Aracaju', 'Cuiabá', 'Macapá',
    'Porto Velho', 'Rio Branco', 'Palmas', 'Boa Vista', 'Florianópolis',
    'Vitória', 'Macaé', 'Uberlândia', 'Contagem', 'Sorocaba', 'Ribeirão Preto',
    'Joinville', 'Londrina', 'Juiz de Fora', 'Niterói', 'Belford Roxo',
    'São Bernardo do Campo', 'Santo André', 'Osasco', 'São José dos Campos',
]

# ─── Funções de Extração ───────────────────────────────────────────────────────

def extract_price(text: str):
    """Extrai preço em float ou None."""
    matches = PRICE_RE.findall(text)
    for m in matches:
        raw, num, unit = m
        try:
            if raw:
                # Remove pontos de milhar, substitui vírgula por ponto
                clean = raw.replace('.', '').replace(',', '.')
                return float(clean)
            elif num and unit:
                val = float(num.replace(',', '.'))
                unit_lower = unit.lower()
                if 'bilh' in unit_lower:
                    val *= 1_000_000_000
                elif 'milh' in unit_lower:
                    val *= 1_000_000
                elif 'mil' in unit_lower or unit_lower == 'k':
                    val *= 1_000
                return val
        except ValueError:
            continue
    return None


def extract_phone(text: str):
    """Extrai primeiro telefone encontrado e normaliza."""
    matches = PHONE_RE.findall(text)
    if not matches:
        return None
    # Remove espaços, hífens, parênteses
    raw = re.sub(r'[\s\-().+]', '', matches[0])
    # Garante DDI 55
    if not raw.startswith('55') and len(raw) >= 10:
        raw = '55' + raw
    return raw


def extract_area(text: str):
    """Extrai metragem em float ou None."""
    m = AREA_RE.search(text)
    if m:
        try:
            return float(m.group(1).replace(',', '.'))
        except ValueError:
            return None
    return None


def extract_int(pattern, text: str):
    """Extrai primeiro inteiro de um padrão regex."""
    m = pattern.search(text)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return None
    return None


def extract_property_type(text: str):
    """Detecta tipo de imóvel."""
    text_lower = text.lower()
    for prop_type, keywords in PROPERTY_TYPES.items():
        for kw in keywords:
            if kw in text_lower:
                return prop_type
    return None


def extract_transaction_type(text: str):
    """Detecta tipo de transação (venda/aluguel/temporada)."""
    text_lower = text.lower()
    for trans_type, keywords in TRANSACTION_TYPES.items():
        for kw in keywords:
            if kw in text_lower:
                return trans_type
    return None


def extract_creci(text: str):
    """Extrai número do CRECI."""
    m = CRECI_RE.search(text)
    return m.group(1).strip() if m else None


def extract_city(text: str):
    """Extrai cidade do texto."""
    for city in KNOWN_CITIES:
        if city.lower() in text.lower():
            return city
    return None


def extract_neighborhood(text: str):
    """
    Tenta extrair bairro do texto usando padrões comuns.
    Ex: "no Jardim América", "bairro Centro", "em Copacabana"
    """
    patterns = [
        r'(?:no|na|em|bairro|região)\s+([A-ZÁÉÍÓÚÀÂÊÔ][a-záéíóúàâêô\s]{2,30}?)(?:\s*[,.-]|$)',
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return m.group(1).strip()
    return None


# ─── Parser Principal ──────────────────────────────────────────────────────────

def parse_post(text: str) -> dict:
    """
    Extrai todos os campos imobiliários de um texto de post.
    Retorna dicionário com campos estruturados.
    """
    if not text:
        return {}

    return {
        'price': extract_price(text),
        'phone': extract_phone(text),
        'area_m2': extract_area(text),
        'bedrooms': extract_int(BEDROOMS_RE, text),
        'bathrooms': extract_int(BATHROOMS_RE, text),
        'garage': extract_int(GARAGE_RE, text),
        'property_type': extract_property_type(text),
        'transaction_type': extract_transaction_type(text),
        'creci': extract_creci(text),
        'city': extract_city(text),
        'neighborhood': extract_neighborhood(text),
    }


# ─── Interface CLI ─────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Parser Imobiliário')
    parser.add_argument('--text', type=str, help='Texto para analisar')
    parser.add_argument('--stdin', action='store_true', help='Lê JSON do stdin')
    parser.add_argument('--test', action='store_true', help='Roda testes internos')
    args = parser.parse_args()

    if args.test:
        tests = [
            "Vendo apartamento 2 quartos, 85m², garagem 1 vaga. R$ 350.000. Bairro Jardim América, São Paulo. Tel: (11) 98888-7777. CRECI 12345-F",
            "Aluguel casa 3 dormitórios, 2 banheiros, 120m². R$ 2.500/mês. Em Copacabana, Rio de Janeiro. WhatsApp 21987654321",
            "Terreno 500m² à venda. 250 mil. Contato: +55 19 99876-5432",
        ]
        for t in tests:
            print(f"\n📝 Texto: {t[:80]}...")
            result = parse_post(t)
            print(json.dumps(result, ensure_ascii=False, indent=2))

    elif args.stdin:
        data = json.loads(sys.stdin.read())
        result = parse_post(data.get('text', ''))
        print(json.dumps(result, ensure_ascii=False))

    elif args.text:
        result = parse_post(args.text)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    else:
        parser.print_help()
