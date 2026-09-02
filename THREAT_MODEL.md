# Threat Model do FixFirst

Última revisão: 2 de setembro de 2026

**Português** | [English](THREAT_MODEL.en.md)

## Escopo

Este modelo cobre a aplicação no navegador, `POST /api/scan`, `POST /api/analytics`, validação de URLs, requisições de saída do scanner, análise da resposta, histórico local, identificadores anônimos de analytics, conteúdo de remediação e workflows do repositório. Ele representa a implementação atual e não pressupõe banco de dados ou sistema de contas de usuário.

## Ativos

| Ativo | Objetivo de segurança |
| --- | --- |
| Capacidade de rede de saída | Impedir acesso a serviços privados, locais, reservados ou fora do escopo |
| Disponibilidade do scanner | Limitar requisições caras, respostas grandes e abuso repetido |
| Integridade do resultado | Manter findings, confiança, prioridade e estado do Retest ligados à evidência observada |
| Privacidade do analytics | Medir uso sem URLs alvo, conteúdo do scan, credenciais ou perfis pessoais |
| Integridade e cota do analytics | Limitar eventos fabricados e consumo desnecessário da franquia gratuita |
| Ambiente de deployment | Impedir exposição de secrets, metadados internos e credenciais da plataforma |
| Armazenamento do navegador | Manter o histórico de scans e os identificadores anônimos no dispositivo e sob controle do navegador |
| Fluxo de desenvolvimento | Impedir que código não revisado ou automação com privilégios excessivos altere a `main` |

## Pontos de entrada e fronteiras de confiança

O ponto de entrada do scanner é uma URL controlada pelo usuário dentro de uma requisição JSON limitada a 8 KiB. Outras entradas não confiáveis chegam por respostas de DNS, redirects, status HTTP, headers, cookies e corpos HTML. O analytics aceita um envelope JSON limitado a 4 KiB e validado por um schema fechado de eventos. Pacotes de dependências e código de Pull Requests representam entradas separadas da cadeia de fornecimento de software.

A primeira fronteira de confiança fica entre o navegador e as APIs. A segunda separa a API de scan da rede pública do alvo. Uma terceira separa a rota de analytics da ingestão do PostHog. Outra fronteira existe entre o conteúdo do repositório e o GitHub Actions. O `localStorage` está fora da fronteira de confiança do servidor e poderá ser lido por outro código na mesma origem se uma falha futura de injeção no cliente existir.

## Ameaças, mitigações e riscos residuais

| Área STRIDE | Ameaça | Mitigação implementada | Risco residual |
| --- | --- | --- | --- |
| Spoofing | Uma pessoa declara autorização para um domínio que não controla | Confirmação explícita e comportamento somente passivo | A propriedade não pode ser verificada sem um desafio externo |
| Tampering | Redirect ou DNS muda o destino depois da validação | Cada etapa é validada, todas as respostas de DNS são verificadas e o transporte Node conecta ao IP selecionado | O fetch da plataforma Cloudflare não fixa a resposta de DNS validada |
| Repudiation | Uma pessoa contesta ter iniciado um scan | O resultado contém o horário da confirmação e o tipo de análise | Não existe log de auditoria durável nem identidade do usuário |
| Information disclosure | SSRF alcança localhost, metadata, redes privadas ou credenciais embutidas | Allowlists de protocolo e porta, bloqueio de hostname, validação de faixas IPv4 e IPv6, rejeição de credenciais e revalidação de redirects | O isolamento de saída do provedor permanece parte do controle na Cloudflare |
| Information disclosure | Query sensível da URL aparece na saída ou em logs | A entrada é reduzida à raiz do site, URLs retornadas removem query e fragmento e o runtime não registra alvos intencionalmente | Um alvo pode incluir texto sensível em headers ou HTML públicos; a evidência evita copiar valores brutos quando possível |
| Information disclosure | Analytics captura alvo, formulário, evidência do scan ou identidade do navegador | Eventos explícitos, campos e valores fechados, ausência de URL e referrer, `credentials: omit`, ausência de perfil pessoal e respeito a GPC e DNT | UUIDs anônimos ainda são identificadores pseudônimos armazenados no fluxo de eventos |
| Denial of service | Alvos lentos, loops de redirect, headers ou corpos grandes consomem recursos | Prazo total de 12 segundos, três redirects, 64 KiB de headers, 512 KiB de HTML, 8 KiB por requisição e limpeza de sockets | Um atacante distribuído pode contornar o rate limiter por instância |
| Denial of service | Muitos clientes preenchem o mapa do rate limiter | Mapas limitados a 10.000 entradas com remoção das expiradas | Limites reiniciam com a instância e não são compartilhados |
| Tampering | Eventos falsos distorcem métricas ou consomem a cota de analytics | Verificação de mesma origem, limite de 4 KiB, schema fechado, hosts fixos do PostHog e rate limiter local separado | Tráfego automatizado distribuído ainda pode produzir eventos aparentemente válidos |
| Elevation of privilege | Pull Request malicioso obtém acesso de escrita ou secrets de deployment | CI com permissão somente de leitura, sem credenciais de deployment, sem `pull_request_target`, SHAs imutáveis das Actions e ruleset ativo | Um bypass administrativo comprometido ainda pode contornar o fluxo normal de revisão |
| Tampering | Dependência vulnerável altera o comportamento do scanner | Dependências travadas, npm audit, Dependabot, CodeQL e builds no CI | Cobertura de advisories é incompleta e atualizações ainda exigem revisão |
| Information disclosure | Secret é commitado ou exposto ao cliente | Nenhum secret administrativo obrigatório, padrões de `.env` e chaves ignorados, histórico público sanitizado, secret scanning e push protection ativos | Detecção automática não cobre todo formato possível de segredo |
| Tampering | Resultado contextual é apresentado como confirmado | Confiança baseada em evidência, CORS curinga exige revisão humana e Retest pode ser inconclusivo | Evidência passiva não determina sozinha o contexto de negócio |

## Riscos residuais que exigem decisão de deployment

1. A produção combina limite por instância e mitigação automática de DDoS da Vercel. Como nenhum rate limiting distribuído cobrado foi autorizado, um atacante distribuído ainda pode contornar a cota local.
2. O fetch nativo da Cloudflare depende do isolamento de saída da plataforma, pois a resposta de DNS validada não pode ser ligada à conexão.
3. O scanner aceita intencionalmente uma conexão TLS inválida no transporte fixado para observar e relatar a falha do certificado. Esse resultado não deve ser tratado como conteúdo confiável.
4. Uma checkbox de autorização não prova propriedade. Uma verificação forte exigiria desafios por DNS, arquivo ou conta e está fora deste MVP.
5. Os checks passivos cobrem uma resposta. Comportamentos específicos de rota e conteúdo autenticado permanecem desconhecidos.
6. O analytics anônimo depende de um armazenamento de eventos de terceiros. O dashboard é privado e o descarte de IP está ativo, mas retenção, exclusão e acesso administrativo ainda dependem da conta proprietária.
7. Sinais de privacidade e bloqueadores de conteúdo criam subcontagem intencional.

Esses são riscos residuais documentados, e não premissas ocultas.
