# PulseWaveX - Intelligence Remains Index (Last 30 Changes)

Este arquivo serve como o Log de Auditoria de Elite do projeto para consulta rápida do Gemini.

1.  **Modularização Frontend**: Separação em componentes HTML (`sidebar.html`, `hud.html`, `login.html`).
2.  **Sunset Flask**: Remoção total do servidor Python e migração 100% para Node.js/TypeScript.
3.  **Blade Runner Aesthetics**: Restauração do design neon, efeito glitch no logo e scanlines CRT.
4.  **Glassmorphism HUD**: Implementação de HUD semi-transparente (30% opacity, 10px blur).
5.  **Aggregator Matrix**: Novo motor de notícias consumindo 10 fontes RSS simultâneas.
6.  **News Sync Worker**: Robô de background que atualiza notícias a cada 15 min via `news_data.json`.
7.  **Sidebar Scroll Fix**: Implementação de overflow-y independente para o feed de notícias.
8.  **Icon Dock Design**: Sistema de colapso da sidebar para uma barra de 95px com ícones circulares.
9.  **Neural Favorites**: Sistema de persistência de clubes favoritos via `localStorage`.
10. **Active Scanning Engine**: Filtro tático em tempo real que isola baladas abertas no mapa.
11. **High-Precision GPS**: Calibragem das coordenadas das baladas principais de SP.
12. **Expansão Interior (Campinas/Valinhos)**: Mapeamento de picos como Laroc, Ame e Caos.
13. **Expansão Litoral (Guarujá/Maresias)**: Mapeamento do Sirena e Laroc Guarujá.
14. **HUD Metadata Restore**: Recuperação de campos de Endereço, Telefone e Instagram.
15. **Target Lock-On**: Anel de seleção dourado pulsante ao clicar em qualquer ponto do mapa.
16. **Neural Pulse "P"**: Correção da visibilidade e animação do logo "P" no modo dock.
17. **Docks de 64px**: Redesenho dos ícones do dock com anéis dourados e hover scale.
18. **Multi-Binding (0.0.0.0)**: Configuração do servidor para acesso via rede local e mobile.
19. **RA GraphQL Bridge**: Implementação de coleta via API GraphQL da Resident Advisor.
20. **Shotgun Discovery**: Serviço de descoberta automática de eventos via Shotgun.
21. **Resource Watchdog**: Monitor de RAM para evitar crashes por memory leak (800MB threshold).
22. **Leaflet Load Priority**: Mapa agora inicializa antes dos componentes para evitar tela preta.
23. **CSS Style Isolation**: Sidebar CSS movido para `/styles/sidebar.css` para evitar regressões.
24. **HUD Diagnostic Status**: Exibição de `SYSTEM: ACTIVE` ou `OFF` baseado em horários reais.
25. **Saturday Early Open Logic**: Ajuste para casas que abrem à tarde (16h) aos sábados.
26. **API Cache Buster**: Injeção de timestamp nas requisições para forçar dados novos.
27. **Ghost Marker Visibility**: Ajuste da opacidade dos clubes inativos para 0.4 (visíveis mas apagados).
28. **WhatsApp Dynamic Links**: Geração automática de links wa.me a partir do telefone no JSON.
29. **Statewide Auto-Zoom**: Cálculo dinâmico de `fitBounds` cobrindo todo o estado de SP.
30. **Golden List Seed (34 Venues)**: Consolidação de 34 baladas de elite no banco de dados.
