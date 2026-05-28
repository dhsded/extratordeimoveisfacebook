# 🏠 Extrator de Imóveis — Facebook Groups

Sistema de coleta humanizada de dados imobiliários em grupos do Facebook.

---

## 📋 Pré-requisitos

- Node.js ≥ 18
- Python ≥ 3.10
- Docker Desktop (para PostgreSQL + Redis)

---

## 🚀 Instalação

### 1. Suba o banco de dados e o Redis

```bash
docker-compose up -d
```

### 2. Instale dependências do backend

```bash
npm install
```

### 3. Configure o banco de dados

```bash
npx prisma migrate dev --name init
```

### 4. Instale dependências Python

```bash
pip install -r requirements.txt
```

### 5. (Opcional) Instale o modelo de NLP em português

```bash
python -m spacy download pt_core_news_sm
```

### 6. Instale o frontend

```bash
cd frontend && npm install && cd ..
```

---

## 🔐 Login no Facebook (OBRIGATÓRIO — faça uma vez)

```bash
npm run login
```

- O browser abrirá automaticamente
- Faça login no Facebook normalmente
- Pressione ENTER no terminal quando terminar
- A sessão será salva em `./data/sessions/profile1`

---

## ▶️ Executar o sistema

**Terminal 1 — Backend:**
```bash
npm run dev
```

**Terminal 2 — Frontend:**
```bash
cd frontend && npm run dev
```

**Acesse:** http://localhost:5173

---

## 💻 Usando o Painel

1. Vá em **Grupos** no menu lateral
2. Cole o link do grupo do Facebook (ex: `https://www.facebook.com/groups/imoveis-sp`)
3. Clique em **🚀 Executar**
4. O browser abrirá e navegará humanamente pelo grupo
5. Acompanhe o progresso em tempo real
6. Veja os dados coletados em **Imóveis**

---

## 📊 Funcionalidades

| Feature | Descrição |
|---|---|
| 🤖 Navegação humanizada | Scroll variável, mouse curvo, pausas naturais |
| 🔍 Interceptação GraphQL | Captura dados direto da API sem seletores CSS |
| 🧠 Parser NLP | Extrai preço, quartos, bairro, telefone automaticamente |
| 📸 OCR de imagens | EasyOCR em imagens dos posts |
| 🔄 Deduplicação | 3 camadas: post_id, hash do texto, telefone+preço+bairro |
| 📊 Tabela Excel | AG Grid com filtros, ordenação e exportação CSV |
| ⚡ Tempo real | WebSocket para updates instantâneos no painel |

---

## 🗄️ Estrutura da Tabela

| Campo | Tipo | Descrição |
|---|---|---|
| `post_id` | string | ID único do Facebook |
| `author_name` | string | Nome do autor |
| `content` | text | Texto do post |
| `city` | string | Cidade detectada |
| `neighborhood` | string | Bairro detectado |
| `property_type` | enum | apartamento/casa/terreno/etc |
| `transaction_type` | enum | venda/aluguel/temporada |
| `price` | decimal | Preço extraído |
| `bedrooms` | int | Número de quartos |
| `bathrooms` | int | Número de banheiros |
| `area_m2` | decimal | Metragem |
| `phone` | string | Telefone normalizado E.164 |
| `creci` | string | Número CRECI |
| `image_urls` | array | URLs das imagens |

---

## ⚙️ Configuração (.env)

```env
DATABASE_URL="postgresql://imoveis:imoveis123@localhost:5432/imoveis"
REDIS_URL="redis://localhost:6379"
FB_SESSION_DIR="./data/sessions/profile1"
SESSION_DURATION_MIN=20
SESSION_DURATION_MAX=40
MAX_POST_AGE_DAYS=365
API_PORT=3001
```

---

## ⚠️ Boas Práticas de Segurança

- Use **IP residencial** (não datacenter)
- **Não rode 24/7** — faça sessões de 20-40 min
- **Não paralelize** grupos (um de cada vez)
- **Varie os horários** de coleta
- Mantenha o browser **visível** (headless=false)

---

## 🛠️ Scripts Disponíveis

```bash
npm run login      # Login manual no Facebook
npm run dev        # Inicia o servidor backend
npm run db:studio  # Abre o Prisma Studio (visualizador do banco)
npm run db:migrate # Aplica migrações do banco
```
