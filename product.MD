# 🎧 PulseMap — Product & Engineering Spec (MVP Free Version)

## 🧠 Context

Você é um engenheiro de software sênior + product designer.

Sua tarefa é construir um MVP chamado **PulseMap** — uma plataforma para descoberta de música eletrônica underground, eventos e tendências em tempo real.

O produto deve ser:

* extremamente leve
* barato (rodar em VPS de $5)
* escalável no futuro
* focado em descoberta automática (crawler + análise)

---

# 🎯 Objetivo do Produto

Criar uma plataforma que:

* Descobre automaticamente novas tracks e DJs
* Mostra tendências (o que está emergindo antes de viralizar)
* Permite explorar música por mapa (geográfico)
* Cria um feed inteligente de descoberta musical

---

# 👤 Usuário-Alvo

* fãs de música eletrônica (techno, house, trance)
* DJs iniciantes/intermediários
* produtores musicais
* exploradores de cena underground

---

# 🧩 Funcionalidades (MVP — FREE ONLY)

## 1. 🔎 Discovery Feed

Criar um feed com:

* tracks novas descobertas automaticamente
* ordenação por:

  * trending
  * recentes
  * underground score

### Requisitos:

* endpoint: `/tracks`
* paginação simples
* cache com Redis

---

## 2. 🗺️ Mapa de Música

Mapa interativo mostrando:

* cidades com atividade musical
* densidade de tracks/eventos

### Dados:

* cidade associada ao artista ou evento
* agregação simples por região

### Requisitos:

* endpoint: `/map`
* retornar:

  * cidade
  * número de tracks
  * score de atividade

---

## 3. 🤖 Crawler de Música

Sistema automático que coleta dados de:

* SoundCloud
* YouTube

### Funções:

* buscar tracks novas
* extrair:

  * nome
  * artista
  * url
  * data

### Requisitos:

* script: `crawler.py`
* execução via cron (a cada 6h)

---

## 4. 🎧 Análise de Áudio (básica)

Processar preview das tracks para extrair:

* BPM
* energia (estimativa simples)
* duração

### Stack:

* Python
* librosa

### Output:

* salvar no banco

---

## 5. 🔥 Trending Algorithm (Simples)

Criar score baseado em:

* frequência de aparição
* recência
* fonte

### Fórmula inicial:

```
score = (recent_weight * recency) + (frequency_weight * mentions)
```

---

## 6. 📄 Página de Track

Cada track deve ter:

* player embed (SoundCloud/YouTube)
* informações básicas
* métricas:

  * BPM
  * energia
  * score

### Endpoint:

`/track/{id}`

---

## 7. ⭐ Favoritos (local storage)

Sem login (MVP simples):

* usuário pode favoritar tracks
* salvar no navegador

---

## 8. ⚡ API Backend

Construir API com:

* FastAPI

### Rotas:

```
GET /tracks
GET /track/{id}
GET /map
GET /trending
```

---

## 9. 🗄️ Banco de Dados

Usar:

* PostgreSQL

### Tabela: tracks

```
id
title
artist
source
url
bpm
energy
created_at
score
city (opcional)
```

---

## 10. ⚙️ Infraestrutura

Rodar tudo em:

* VPS 1GB RAM

### Stack:

* Backend: FastAPI
* Frontend: Next.js (build estático)
* Web server: Nginx
* Cache: Redis
* Scheduler: cron

---

## 11. 🎨 UI/UX (Design Guidelines)

Tema:

* dark mode
* estética rave / cyberpunk

Cores:

* preto (#0b0b0b)
* roxo neon
* azul elétrico

Componentes:

* cards de tracks
* mapa interativo
* feed estilo scroll infinito

---

## 12. 📁 Estrutura do Projeto

```
pulsemap/

backend/
  main.py
  routes/
  services/

frontend/
  pages/
  components/

crawler/
  crawler.py
  sources/

analysis/
  audio.py

database/
  models.py
```

---

## 13. 🚀 Requisitos Técnicos

* código modular
* baixo consumo de memória
* evitar dependências pesadas
* pronto para rodar em ambiente Linux (Ubuntu)

---

## 14. 📦 Entregáveis Esperados

Gerar:

1. Backend funcional (FastAPI)
2. Crawler básico
3. Script de análise de áudio
4. Banco de dados estruturado
5. Frontend simples (listagem + mapa)
6. README com instruções de deploy

---

## 15. 🔒 Restrições

* NÃO usar serviços pagos
* NÃO usar autenticação (por enquanto)
* NÃO usar microserviços
* tudo deve rodar em 1 servidor

---

## 16. 🧠 Futuro (NÃO implementar agora)

* login de usuários
* recomendação com IA
* app mobile
* notificações
* monetização

---

# 🎯 Objetivo Final

Gerar um MVP funcional que:

* descobre música automaticamente
* apresenta de forma visual e interativa
* roda com custo mínimo (~$5/mês)
* pronto para evolução futura

---

# ⚡ Instrução Final

Implemente o projeto completo seguindo este documento.

Priorize:

* simplicidade
* performance
* baixo custo
* clareza de código

Evite overengineering.
