# FixFirst

**Português** | [English](README.en.md)

Website Security Advisor

O FixFirst é uma aplicação web defensiva que transforma um conjunto objetivo de verificações passivas de segurança em um fluxo ordenado de correção. Ele registra a evidência de cada finding, separa severidade de confiança, explica por que um item deve ser tratado primeiro, apresenta orientações de remediação com fontes e executa novamente o controle relevante depois de uma alteração.

O projeto foi construído como um MVP honesto. Ele não afirma substituir um pentest nem medir toda a segurança de um site.

## Problema

Muitos scanners encerram o trabalho depois de apresentar uma saída técnica. O responsável por um site ainda precisa entender se o resultado tem evidência suficiente, o que merece atenção primeiro, quem pode corrigir e como confirmar a mudança.

O FixFirst atua nesse espaço entre detecção e ação.

## Solução

O fluxo implementado funciona assim:

1. A pessoa informa um site público e confirma que possui autorização.
2. O servidor valida a URL e aplica controles à requisição de saída.
3. Uma requisição passiva e limitada coleta a resposta pública.
4. O analisador cria findings e um registro de checks a partir da evidência observada.
5. Regras determinísticas de confiança e prioridade ordenam os findings.
6. A interface apresenta uma explicação simples e um Playbook técnico com fontes.
7. O Retest faz uma nova requisição e reavalia o mesmo controle.
8. Os relatórios utilizam apenas o resultado retornado pelo scanner.

## Live Demo

[Abrir o FixFirst](https://fixfirst-inky.vercel.app)

O deployment público utiliza HTTPS e abre sem login. Em 2 de setembro de 2026, a página, os headers, as políticas das APIs e uma autoanálise autorizada foram verificados diretamente na produção da Vercel.

## Como funciona

Esta animação é uma demonstração real da versão pública, usando o próprio domínio do FixFirst como alvo autorizado. Ela mostra o fluxo completo: autorização, análise, priorização, evidência técnica, Fix Route, Playbook, Retest, relatório e histórico local.

![Demonstração completa do FixFirst analisando um site, priorizando findings, mostrando evidências, Playbook, Retest e relatórios](docs/images/fixfirst-readme-demo.gif)

## Funcionalidades atuais

| Área | Comportamento implementado |
| --- | --- |
| Transporte | Identifica uso de HTTP e inspeciona metadados do certificado TLS quando o runtime os disponibiliza |
| Headers | Verifica CSP, proteção contra frames, HSTS, `nosniff`, Referrer-Policy e Permissions-Policy |
| Cookies | Avalia os primeiros 20 valores de `Set-Cookie` observados para Secure, HttpOnly em cookies semelhantes a sessão e SameSite |
| Conteúdo do navegador | Procura referências diretas a recursos HTTP somente quando um corpo HTML ou XHTML limitado foi realmente analisado |
| CORS | Registra origem curinga como evidência contextual que exige revisão humana |
| Sinais de tecnologia | Relata sinais limitados do servidor, da plataforma e do HTML com valor explícito de confiança |
| Priorização | Usa severidade, confiança da evidência, facilidade, contexto observado da página e duas combinações documentadas de findings |
| Remediação | Oferece Playbooks em PT-BR, inglês e espanhol com referências da OWASP, MDN e documentação oficial de servidores ou frameworks |
| Retest | Faz uma nova requisição e marca um finding como corrigido somente quando o mesmo check passa de forma conclusiva |
| Relatórios | Produz relatórios simples e técnicos, prontos para impressão, a partir do resultado real do scan |
| Histórico local | Mantém até oito resultados recentes apenas no navegador atual |
| Product Analytics | Registra eventos anônimos e explícitos do funil por uma rota validada do mesmo domínio quando o PostHog está configurado |

As definições completas dos checks e das fórmulas estão em [Metodologia do scanner](docs/SCANNER-METHODOLOGY.md).

## Fluxo de remediação

Cada finding conecta cinco tipos de informação: evidência observada, explicação em linguagem simples, responsável recomendado, Playbook versionado e estado de uma nova verificação. Exemplos específicos de tecnologia aparecem somente quando um sinal compatível atinge pelo menos 80% de confiança. Nos demais casos, o FixFirst apresenta um guia genérico.

Evidências dependentes de contexto seguem primeiro por validação. Por exemplo, `Access-Control-Allow-Origin: *` é diretamente observável, mas seu impacto depende de a resposta ser pública, autenticada ou sensível.

## Arquitetura de segurança

O scanner recebe URLs controladas pelo usuário, por isso o caminho da requisição de saída é tratado como uma fronteira de confiança. O servidor permite somente HTTP e HTTPS nas portas 80 e 443, rejeita credenciais e hostnames locais, resolve o DNS antes de cada requisição, bloqueia faixas privadas e reservadas e revalida cada redirect.

Em um runtime Node.js padrão, o IP público selecionado é fixado no socket enquanto o hostname original é mantido no header Host e no SNI do TLS. O destino atual na Cloudflare usa o transporte fetch da plataforma depois da validação de DNS, pois esse runtime restringe sockets diretos para faixas de endereços da Cloudflare. Nesse modo, o isolamento de rede do provedor faz parte do controle e checks de TLS ficam como não avaliados quando os metadados do certificado não estão disponíveis.

As requisições compartilham um prazo total de 12 segundos. Redirects são limitados a três, headers da resposta a 64 KiB e o corpo HTML analisado a 512 KiB. A API de scan aceita no máximo 8 KiB de JSON, verifica a origem da requisição do navegador, responde com `no-store` e utiliza um rate limiter limitado por instância.

O analytics usa uma rota separada, limite de 4 KiB, listas fechadas de eventos e propriedades, identificadores anônimos, ausência de perfis pessoais, ausência da URL analisada e nenhuma credencial ou referrer do navegador.

Consulte [Arquitetura](docs/ARCHITECTURE.md), [Controles de segurança](docs/SECURITY-CONTROLS.md) e [Threat Model](THREAT_MODEL.md) para conhecer a implementação e os riscos residuais.

## Testes

A suíte automatizada cobre parsing de URLs, escopo de IPv4 e IPv6, revalidação de redirects, conexões fixadas, limites de corpo e headers, timeouts, findings positivos e negativos, prioridade determinística, tratamento de confiança, políticas das APIs, headers das páginas, integridade dos Playbooks, resultados de Retest e payloads de analytics com minimização de dados.

Para executar a verificação local completa:

```bash
npm ci
npm run lint
npm test
npm audit --audit-level=high
npm run build
npm run build:next
```

O GitHub Actions está preparado para executar as mesmas verificações com token somente de leitura. Um workflow separado do CodeQL analisa JavaScript com a suíte `security-and-quality`. As Actions estão fixadas por SHA completo e nenhum dos workflows recebe credenciais de deployment.

## Arquitetura e tecnologias

| Camada | Tecnologia |
| --- | --- |
| Aplicação | Next.js 16 App Router, React 19 e módulos JavaScript |
| Build da prévia privada | vinext com compatibilidade para Cloudflare Workers |
| Build padrão de deployment | Runtime Node.js do Next.js |
| Transporte do scanner | `net` e `tls` do Node.js, ou fetch limitado da plataforma na Cloudflare |
| Estado | Estado React e `localStorage` para histórico local e identificadores anônimos de analytics |
| Product Analytics | Eventos explícitos do mesmo domínio encaminhados à Capture API do PostHog quando existe configuração no servidor |
| Testes | Test runner do Node.js e fixtures TCP locais |
| Qualidade | ESLint, npm audit, GitHub Actions, Dependabot e CodeQL |

Não existe banco de dados, sistema de contas de usuário, armazenamento externo, SDK de analytics no navegador ou secret administrativo obrigatório. O PostHog de produção está configurado somente no servidor, e os valores reais das variáveis não aparecem no código, no navegador ou na documentação.

## Métricas de uso

O fluxo do produto está instrumentado com eventos explícitos do PostHog e listas fechadas de propriedades. A produção encaminha eventos anônimos para um dashboard privado com descarte de IP ativo. A validação inicial confirmou o recebimento de visitas reais, mas o projeto não publica contagens até existir um período representativo. O modelo de eventos, funil e regras de minimização estão documentados em [Analytics](docs/ANALYTICS.md).

## Limitações

1. O FixFirst analisa uma resposta pública da raiz do site. Ele não rastreia outras páginas, não autentica, não envia formulários e não executa payloads ofensivos.
2. A ausência de um header é evidência sobre a resposta analisada, não uma prova de que todas as rotas possuem a mesma configuração.
3. Findings de certificado TLS exigem metadados do certificado. Eles não são marcados como aprovados quando o runtime não disponibiliza essa evidência.
4. A detecção de tecnologia utiliza sinais públicos limitados e pode ser incompleta. Ela não é usada como prova de vulnerabilidade.
5. Os checks de cookies cobrem apenas cookies presentes na resposta e param depois de 20 valores.
6. O indicador passivo está limitado aos checks disponíveis. Ele não representa uma porcentagem da segurança total.
7. O rate limiter em memória funciona por processo ou instância serverless. A Vercel fornece mitigação automática de DDoS, mas nenhum rate limiting distribuído cobrado foi ativado. Tráfego distribuído ainda pode contornar o limite local.
8. O transporte fetch da Cloudflare valida o DNS antes de cada etapa, mas não consegue fixar essa resposta à requisição da plataforma. O isolamento de rede do provedor faz parte do controle.
9. O analytics pode subcontar pessoas que usam sinais de privacidade, bloqueadores de conteúdo ou limpam o armazenamento do navegador.
10. O FixFirst não substitui revisão segura de código, testes autenticados, revisão de infraestrutura ou pentest profissional.

## Roadmap

O repositório público, o deployment sem login na Vercel e o dashboard privado do PostHog estão ativos. Os próximos passos são observar o uso real, avaliar um limite distribuído que não introduza cobrança sem aprovação e validar mais ciclos de Retest. Rastreamento de várias páginas e novos findings permanecem fora do escopo até que os checks atuais tenham validação suficiente.

## O que aprendi

Construir o FixFirst transformou o próprio scanner em parte do problema de segurança. Aceitar uma URL exigiu muito mais do que bloquear `127.0.0.1`. Foi necessário considerar IPv6, metadados de cloud, redirects, mudanças de DNS, prazos de requisição, limites de resposta e a diferença entre validar um endereço e conectar exatamente a ele.

O projeto também tornou visível a qualidade da evidência. Severidade descreve impacto potencial, enquanto confiança descreve o quanto a condição foi observada diretamente pelo FixFirst. Separar esses conceitos trouxe uma priorização mais clara, tratamento mais seguro de resultados contextuais de CORS e um Retest capaz de permanecer inconclusivo em vez de declarar uma correção sem evidência.

Por fim, a remediação passou a ser uma parte mantida do produto, e não um preenchimento gerado. Os Playbooks possuem versão, data de revisão, links das fontes, pré-requisitos, etapas de validação e plano de rollback. Essa estrutura facilita testar e atualizar as recomendações sem alterar a lógica do scanner.

## Reporte de segurança

Leia [SECURITY.md](SECURITY.md) antes de relatar uma vulnerabilidade. Não publique detalhes de exploração ou informações sensíveis em uma Issue pública.

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).
