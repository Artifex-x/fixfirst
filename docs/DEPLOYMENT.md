# Plano de deployment

Status: produção pública na Vercel

Última revisão: 2 de setembro de 2026

## Estado atual

O código está publicado no GitHub e a aplicação está disponível em [fixfirst-inky.vercel.app](https://fixfirst-inky.vercel.app). A prévia privada baseada em vinext continua separada. O deployment público usa Next.js no runtime Node.js da Vercel e encaminha eventos anônimos para um dashboard privado do PostHog.

## Deployment Next.js atual

O projeto da Vercel está conectado ao repositório oficial do GitHub. O status de deployment associado ao commit público foi confirmado como bem sucedido.

| Configuração | Valor atual |
| --- | --- |
| Framework | Next.js |
| Node.js | 24.x |
| Root Directory | Raiz do repositório |
| Install Command | `npm ci` |
| Build Command | `npm run build:next` |
| Output Directory | Padrão do Next.js, sem substituição |
| Runtime da API | Node.js |
| Variáveis de analytics | `POSTHOG_PROJECT_TOKEN` e `POSTHOG_HOST` no servidor |
| Secrets administrativos | Nenhum exigido pela aplicação |

`FIXFIRST_RUNTIME` deve permanecer sem valor na Vercel para que o scanner use o transporte Node com socket fixado. A prévia Cloudflare define `cloudflare` como seletor não secreto e a aplicação também detecta o runtime Workers. O wrapper do build Next.js desativa a telemetria do framework sem exigir credencial do usuário.

## Autenticação utilizada

A importação do repositório e a configuração das variáveis foram realizadas na conta proprietária por meio do fluxo oficial da Vercel e do GitHub. Nenhuma senha, token ou API key pessoal foi solicitada pela conversa. Os valores reais das variáveis permanecem fora do repositório e da documentação.

## Gate do scanner público

O scanner aplica seis requisições em dez minutos por chave hash em cada instância, além de limite de payload, prazo total e limites de resposta. A Vercel fornece [mitigação automática de DDoS](https://vercel.com/docs/vercel-firewall/ddos-mitigation) em todos os planos. O plano Hobby também permite regras WAF gratuitas, mas o [WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) é um recurso cobrado por uso. Nenhum rate limiting pago foi ativado.

A decisão atual mantém a produção no plano Hobby gratuito com proteção DDoS da plataforma e limite local da aplicação. Um atacante distribuído ainda pode contornar o limite por instância. Se surgir abuso ou consumo anormal, a resposta segura é suspender o deployment ou fazer rollback antes de considerar um serviço distribuído, plano pago ou nova integração.

O analytics de produção está ativo com `POSTHOG_PROJECT_TOKEN` e `POSTHOG_HOST` somente no servidor. O dashboard do PostHog é privado, o descarte de IP está ligado e nenhum plano pago foi habilitado.

## Verificação executada em produção

Em 2 de setembro de 2026, a validação direta por HTTPS confirmou:

1. A página inicial respondeu `200` sem login ou convite.
2. HTTPS, HSTS, CSP, proteção contra frames, `nosniff`, Referrer-Policy e Permissions-Policy estavam presentes.
3. Uma autoanálise autorizada do próprio FixFirst respondeu `200`, usou o transporte Node com socket fixado e observou TLS 1.3 válido.
4. Uma requisição sem autorização respondeu `403 AUTHORIZATION_REQUIRED`.
5. Um destino loopback respondeu `400 BLOCKED_TARGET`.
6. Uma origem externa respondeu `403 CROSS_ORIGIN_REQUEST`.
7. `GET /api/scan` respondeu `405`.
8. A rota de analytics reconheceu a configuração e rejeitou um envelope inválido com `400 UNSUPPORTED_EVENT`.
9. Eventos reais de `page_view` chegaram ao dashboard privado. Nenhum evento sintético foi enviado.
10. O commit público recebeu status `Vercel: success` no GitHub.

Testes de interação visual, mobile, impressão e Retest não foram automatizados nesta etapa. Eles permanecem cobertos pela suíte e podem receber uma validação manual separada sem alterar a evidência acima.

## Rollback

Manter disponível o último deployment validado. Se controle de escopo, limitação de requisições, proteção de secrets, integridade da evidência ou minimização de analytics falhar, remover o acesso público ou fazer rollback antes de investigar. Um scanner vulnerável não deve permanecer público apenas para apresentação.
