# PulseWaveX - Plataforma de Notícias e Eventos em Tempo Real

## 🚀 Visão Geral

PulseWaveX é uma plataforma futurista que combina notícias em tempo real, eventos locais e visualização geográfica em uma interface cyberpunk com tema âmbar dourado (#FFD700).

## 🏗️ Arquitetura Atual (Flask Unificada)

### **Arquitetura Simplificada**
```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTE (Browser)                    │
│  • https://localhost:8443 (HTTPS)                       │
│  • http://localhost:3000 (HTTP)                         │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                SERVIDOR FLASK UNIFICADO                 │
│  Container: pulse_flask_server                          │
│  Portas: 8443 (HTTPS), 3000 (HTTP)                      │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Flask App (app.py)                             │  │
│  │  • Rotas: /, /api/*, /socket.io                │  │
│  │  • Templates: index.html                       │  │
│  │  • Static: CSS, JS, imagens                    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Flask-SocketIO                                │  │
│  │  • Eventos em tempo real                       │  │
│  │  • Broadcast para múltiplos clientes           │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  SSL/TLS                                       │  │
│  │  • Certificado autoassinado                    │  │
│  │  • Suporte a HTTPS na porta 8443               │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                 NEWS SCRAPER (Separado)                 │
│  Container: pulse_news_scraper                          │
│  Schedule: 2x/dia (9h e 21h)                           │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Python Scraper                                │  │
│  │  • Fontes: Google News, Resident Advisor, etc. │  │
│  │  • Output: news_data.json                      │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### **Por que Flask Unificada?**
- **Simplicidade**: 1 servidor vs 6+ containers
- **Performance**: Menos overhead de rede
- **Confiabilidade**: Menos pontos de falha
- **Custo**: ~50% menos recursos

## 📁 Estrutura do Projeto

```
pulsewavex/
├── flask_server/              # Servidor Flask unificado
│   ├── app.py                # Aplicação principal
│   ├── requirements.txt      # Dependências Python
│   ├── Dockerfile           # Build do container
│   ├── static/              # Arquivos estáticos
│   │   ├── news_data.json  # Notícias coletadas
│   │   ├── css/           # Estilos
│   │   └── js/            # JavaScript
│   └── templates/          # Templates HTML
│       └── index.html     # Página principal
│
├── backend/news_scraper/    # Scraper de notícias
│   ├── scraper.py          # Coleta notícias 2x/dia
│   ├── Dockerfile          # Container com cron
│   └── requirements.txt    # Dependências Python
│
├── frontend/               # Frontend React (legado)
│   ├── components/         # Componentes React
│   │   ├── NewsFeed.js    # Cards de notícias
│   │   ├── GenreStats.js  # Estatísticas
│   │   └── Map.js         # Mapa interativo
│   ├── pages/             # Páginas Next.js
│   └── public/            # Arquivos públicos
│
├── nginx/                  # Certificados SSL (legado)
│   └── certs/             # Certificados autoassinados
│
├── docker-compose.yml      # Orquestração Docker
├── docker-compose-flask.yml # Docker Compose para Flask
└── docs/                  # Documentação
```

## 🎯 Funcionalidades Principais

### 1. **Notícias em Tempo Real**
- Scraping automático 2x ao dia (9h e 21h)
- 20 notícias principais da semana
- Cards bonitos com design futurista
- Filtros por categoria e data

### 2. **Sidebar Inteligente**
- Alternância entre Estatísticas e Notícias
- Design cyberpunk com tema âmbar dourado
- Navegação fluida e responsiva

### 3. **Mapa Interativo**
- Visualização de eventos geográficos
- Pins dourados com hover effects
- Zoom e navegação suave

### 4. **WebSocket em Tempo Real**
- Atualizações instantâneas
- Broadcast para múltiplos clientes
- Reconexão automática

## 🔌 Endpoints da API

### **Frontend**
- `GET /` - Interface principal
- `GET /static/<path>` - Arquivos estáticos

### **API REST**
- `GET /api/news/latest` - 20 notícias mais recentes
- `GET /api/events` - Lista de eventos
- `GET /api/health` - Status do sistema

### **WebSocket**
- `WS /socket.io` - Conexão WebSocket
- Eventos: `connect`, `disconnect`, `ping`, `request_events`, `new_event`

## 🚀 Como Executar

### **Opção 1: Docker Compose (Recomendado)**
```bash
# Usar arquitetura Flask unificada
docker-compose -f docker-compose-flask.yml up -d --build

# Acessar:
# HTTPS: https://localhost:8443 (certificado autoassinado)
# HTTP: http://localhost:3000
```

### **Opção 2: Arquitetura Legada (Next.js + Nginx)**
```bash
# Usar arquitetura original (pode ter problemas de Bad Request 400)
docker-compose up -d --build

# Acessar:
# HTTPS: https://localhost:8443
# HTTP: http://localhost:80
```

### **Opção 3: Desenvolvimento Local**
```bash
# Flask Server
cd flask_server
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py

# News Scraper
cd backend/news_scraper
python scraper.py
```

## 🛠️ Configuração

### **Variáveis de Ambiente**
```bash
PORT=8443                    # Porta HTTPS
HOST=0.0.0.0                 # Host
DEBUG=false                  # Modo debug
SECRET_KEY=chave-secreta     # Chave para sessões
```

### **Certificado SSL**
O servidor usa certificado autoassinado localizado em:
```
nginx/certs/
├── pulse_map.crt
└── pulse_map.key
```

## 📊 Monitoramento

### **Health Check**
```bash
curl -k https://localhost:8443/api/health
```

### **Logs**
```bash
# Docker
docker-compose -f docker-compose-flask.yml logs -f flask-server

# News Scraper
docker-compose -f docker-compose-flask.yml logs -f news-scraper
```

## 🎨 Design e Interface

### **Tema Visual**
- **Paleta**: Preto (#0B0B0B), Âmbar Dourado (#FFD700), Marrom
- **Fonte**: Orbitron (monospace futurista)
- **Efeitos**: Hover animations, glow effects, smooth transitions

### **Componentes Principais**
1. **Sidebar** - Navegação e notícias
2. **Mapa** - Visualização geográfica
3. **Status Bar** - Indicadores em tempo real
4. **News Cards** - Cards interativos com filtros

## 🔧 Troubleshooting

### **Problema: Bad Request 400 no Nginx**
**Causa**: Certificado SSL autoassinado rejeitado pelo navegador
**Solução**: Usar arquitetura Flask unificada ou aceitar certificado no navegador

### **Problema: Notícias não atualizam**
**Solução**: Verificar se o news-scraper está rodando:
```bash
docker-compose -f docker-compose-flask.yml exec news-scraper python scraper.py
```

### **Problema: WebSocket não conecta**
**Solução**: Verificar se o servidor Flask está usando async_mode='eventlet'

## 📈 Roadmap

### **Fase 1 (✅ Concluído)**
- [x] Migração para Flask unificado
- [x] Sistema de notícias com scraping automático
- [x] Interface cyberpunk com tema âmbar dourado
- [x] WebSocket em tempo real

### **Fase 2 (🚧 Em Andamento)**
- [ ] Banco de dados PostgreSQL para persistência
- [ ] Cache Redis para performance
- [ ] Autenticação JWT
- [ ] Upload de imagens

### **Fase 3 (📅 Planejado)**
- [ ] Notificações push
- [ ] PWA (Progressive Web App)
- [ ] Deploy em cloud
- [ ] API pública para desenvolvedores

## 📚 Documentação Relacionada

- [FLASK_ARCHITECTURE.md](./FLASK_ARCHITECTURE.md) - Detalhes técnicos da arquitetura Flask
- [docs/README.md](./docs/README.md) - Documentação técnica detalhada
- [docs/ESTADO_PROJETO.md](./docs/ESTADO_PROJETO.md) - Diário de bordo do projeto

## 🆘 Suporte

Para issues ou dúvidas:
1. Verificar logs: `docker-compose -f docker-compose-flask.yml logs`
2. Testar health check: `curl -k https://localhost:8443/api/health`
3. Verificar certificados: `ls -la nginx/certs/`

---

**PulseWaveX** - Simplificando a experiência de notícias e eventos em tempo real com uma arquitetura moderna e eficiente. 🚀