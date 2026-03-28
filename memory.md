# Memória da Sessão

## Configuração Geral
- Responder sempre em português do Brasil (pt-BR).
- Priorizar manter viva a especificação em `product.MD` e o contexto do projeto PulseMap.
- Apresentar opções claras quando solicitado (apenas as opções).
- Manter em mente que o projeto roda via Docker Compose com nginx em 8443.
- Design futurista (cores preto/âmbar/gold/marrom/cinza/matrix) permanece como guia.

## Índice do Projeto
- **PROJECT_INDEX.md** criado com estrutura completa do PulseWaveX
- **PROJECT_DEEP_UNDERSTANDING.md** criado com entendimento profundo
- MVP para descoberta de música eletrônica underground
- Arquitetura: Next.js + FastAPI + PostgreSQL + Redis + Nginx
- Foco em baixo custo (~$5/mês) e simplicidade

## Entendimento Profundo do Projeto

### 🎨 Paleta de Cores (Old Money Palette)
1. **Preto**: `#0B0B0B` (background)
2. **Creme**: `#F5F5DC` (texto)  
3. **Gold**: `#D4AF37` (accent)
4. **Âmbar**: `#FFBF00` (destaques)
5. **Marrom**: `#8B6B2A` (secundário)

### Mapeamento Pulse Score → Cor
- score ≥ 0.90: `#FFD966` (Gold brilhante)
- score ≥ 0.80: `#D4AF37` (Gold clássico)
- score ≥ 0.70: `#C47C00` (Âmbar escuro)
- score ≥ 0.60: `#B38B00` (Bronze)
- score < 0.60: `#8B6B2A` (Marrom)

### 🧠 Inteligências Implementadas
1. **Localização**: Mapeamento clubes SP (techno, hard, minimal, deep, afro-house, melodic, experimental)
2. **Data Sanitizer**: Limpeza/normalização dados (pt/en)
3. **Venue Card**: Enriquecimento dados clubes (APIs externas + cache)
4. **Music Discovery**: Agregação APIs música (MusicBrainz, Discogs, Spotify, Last.fm, Genius)

### ⚙️ Regras e Restrições
- NÃO usar serviços pagos
- NÃO usar autenticação complexa (MVP)
- NÃO usar microserviços complexos
- Tudo roda em 1 servidor VPS 1GB RAM
- Dark mode rave/cyberpunk obrigatório
- Font: Orbitron (futurista)

### 🏗️ Arquitetura Técnica
- Frontend: Next.js + Tailwind + Leaflet + WebSocket
- Backend: FastAPI + SQLAlchemy + Redis Pub/Sub  
- Database: PostgreSQL
- Cache: Redis
- Gateway: Nginx (HTTPS 8443)
- Crawler: Python + APScheduler (14h/19h)

### 🔄 Estado Atual
✅ **IMPLEMENTADO**:
- Gateway Nginx HTTPS 8443
- Frontend Next.js com mapa Leaflet
- Backend FastAPI + WebSocket
- Crawler básico funcionando
- PostgreSQL + Redis integrados
- 4 módulos inteligência funcionais
- Autenticação simples (hCaptcha teste)
- Internacionalização (pt-BR + en)

⏳ **EM DESENVOLVIMENTO** (product.MD):
- Endpoint `/tracks` com paginação
- Crawler música (SoundCloud/YouTube)
- Análise áudio (BPM + energia)
- Trending algorithm
- Páginas track individuais
- Favoritos local storage
- API completa

### 📊 Próximos Passos (Prioridades)
1. Implementar endpoint `/tracks` (feed principal)
2. Desenvolver crawler música (SoundCloud/YouTube)
3. Adicionar análise áudio (librosa)
4. Criar trending algorithm
5. Implementar páginas track
6. Adicionar favoritos local storage
7. Completar API product.MD

## Informações de Sessão
- Data: 2026-03-19
- Modelo: deepseek-chat (deepseek/deepseek-chat)
- Diretório: /home/mobnix/pulsewavex
- Usuário: mobnix
- Sistema: Linux
- Projeto: PulseWaveX (MVP música eletrônica)
- Status: Produção parcial, desenvolvimento ativo
