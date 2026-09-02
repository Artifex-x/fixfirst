# Controles de segurança

Última revisão: 2 de setembro de 2026

**Português** | [English](SECURITY-CONTROLS.en.md)

Este documento separa controles implementados daqueles que ainda dependem da plataforma de deployment ou de uma decisão do proprietário.

## Controles da aplicação

| Controle | Implementação | Validação |
| --- | --- | --- |
| Validação de URL no servidor | Somente HTTP e HTTPS, sem credenciais, apenas portas 80 e 443, entrada limitada a 2.048 caracteres | Testes unitários de protocolos, credenciais, portas, nomes locais e entrada inválida |
| Bloqueio de redes privadas | Rejeita loopback, private, link-local, metadata, documentação, multicast, reserved, translation e mapped ranges em IPv4 e IPv6 | Testes incluem formas diretas, mapped, compatíveis e NAT64 |
| Controle de escopo do DNS | Todas as respostas A e AAAA precisam ser públicas antes de aceitar o alvo | Testes do resolver e fixtures de transporte injetadas |
| Controle de redirects | No máximo três redirects, com repetição completa da validação de URL e DNS em cada destino | Teste de integração com redirect privado |
| DNS pinning no Node.js | O socket conecta ao IP público validado enquanto Host e SNI mantêm o hostname original | Fixture TCP local confirma Host e caminho solicitados |
| Prazo total | DNS, conexão, redirects, headers e corpo compartilham 12 segundos | Teste de integração com servidor sem resposta |
| Limites da resposta | 64 KiB de headers e 512 KiB de HTML analisado, incluindo decodificação limitada de chunked bodies | Testes de header grande e corpo chunked |
| Escopo de conteúdo | Somente HTML e XHTML com identity content encoding são inspecionados | Teste de integração com resposta JSON |
| Política da requisição de scan | Apenas JSON, máximo de 8 KiB, autorização explícita e verificação de mesma origem | Testes de tipo, origem, JSON inválido, tamanho e autorização |
| Rate limiting do scan | Seis scans em dez minutos por chave hash do cliente, com mapa limitado a 10.000 entradas | Testes unitários e da API |
| Tratamento de erros | Códigos públicos estáveis, sem stack trace nem endereço resolvido | Testes da rota e revisão da resposta |
| Política da resposta | `no-store`, HSTS, mesma origem, no-referrer, `nosniff` e CSP JSON com `default-src 'none'` | Verificações de headers e smoke tests dos runtimes |
| Headers do site | HSTS, CSP, bloqueio de frames, `nosniff`, Referrer-Policy, Permissions-Policy, COOP, CORP e DNS prefetch desativado | Teste automatizado e smoke tests de produção em Next.js e vinext |
| Tratamento de secrets | Nenhum secret administrativo obrigatório; `.env`, private keys, credenciais JSON e saídas locais ignorados | Revisão da árvore atual e do histórico relevante antes da publicação |
| Privacidade do analytics | Eventos explícitos, allowlists fechadas, UUIDs anônimos, ausência de alvo e conteúdo do scan, sem perfil pessoal, respeito a GPC e DNT | Testes automatizados do payload, cliente e rota |
| Política da rota de analytics | Mesma origem, limite de 4 KiB, rate limiter local separado, hosts fixos do PostHog e timeout curto | Testes da rota e da entrega |

## Controles de evidência

Cada check compatível recebe um estado no registro. O analisador utiliza `pass`, `fail`, `not_applicable`, `not_observed`, `not_evaluated` ou `partial`. Um check não pode virar aprovação silenciosamente quando falta a evidência necessária.

A confiança é determinada pela fonte da evidência e permanece separada da severidade potencial. Evidência contextual de CORS exige revisão humana e apresenta a validação antes da correção. IDs dos findings e valores de prioridade são determinísticos.

O Retest usa o mesmo código de finding em um novo scan completo. Somente `pass` confirma a correção. Qualquer estado parcial ou sem evidência suficiente permanece inconclusivo.

## Controles do repositório preparados localmente

| Controle | Estado preparado | Etapa externa necessária |
| --- | --- | --- |
| CI | Lint, testes, npm audit, build vinext e build Next.js | Criar o repositório e confirmar a primeira execução |
| Cadeia de fornecimento das Actions | Actions oficiais fixadas por SHAs completos | Revisar Pull Requests do Dependabot para Actions |
| Permissões do token | CI com conteúdo somente leitura; CodeQL acrescenta apenas leitura de packages e escrita de eventos de segurança | Confirmar permissões padrão dos workflows |
| Atualizações de dependências | Dependabot semanal para npm e GitHub Actions | Ativar dependency graph e security updates |
| Code scanning | Workflow CodeQL para JavaScript com consultas security-and-quality | Confirmar o primeiro upload |
| Proteção da main | Ruleset proporcional documentado | Criar o ruleset nas configurações do GitHub |
| Proteção de secrets | Revisão de arquivos, histórico relevante e regras de ignore preparadas | Ativar secret scanning e push protection quando disponíveis |

## Controles residuais antes do scanner público

O rate limiter do scanner não é compartilhado entre instâncias serverless. A publicação precisa de um limite distribuído ou no nível da plataforma para `/api/scan`. O limite local separado do analytics também não impede todo spam distribuído de métricas.

A CSP permite scripts e estilos inline para compatibilidade com a saída atual de Next.js e vinext. `object-src`, frames, URLs base, formulários e conexões do navegador continuam restritos. Remover as permissões inline exige uma estratégia testada de nonce ou hash e permanece como hardening documentado.

O fetch nativo da Cloudflare não consegue ligar a resposta de DNS validada à requisição. A prévia privada depende parcialmente do isolamento de rede da plataforma. Um deployment Node.js padrão utiliza socket fixado e precisa ser testado nesse ambiente antes da release.

O analytics de produção também exige que o proprietário confirme descarte de IP, retenção, exclusão, acesso ao dashboard e limite zero de cobrança no PostHog antes de ativar eventos.
