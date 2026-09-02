# Plano de deployment

Status: prévia privada

Última revisão: 2 de setembro de 2026

## Estado atual

O projeto possui uma prévia privada baseada em vinext. A aplicação e a instrumentação de analytics foram validadas localmente, mas ainda não foram publicadas no GitHub, na Vercel ou em uma URL pública.

## Destino Next.js padrão

O deployment futuro na Vercel deve usar o repositório oficial do GitHub somente depois da preparação para publicação.

| Configuração | Valor planejado |
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

## Por que a autenticação da Vercel será necessária

Importar o repositório, definir produção, consultar logs, configurar rate limiting no nível da plataforma, adicionar variáveis de analytics e alterar acesso são ações na conta do proprietário. Elas exigem login ou OAuth oficial da Vercel. Nenhuma senha, token ou API key deve ser solicitada pela conversa.

## Gate do scanner público

O limiter por instância não é suficiente como único controle para um scanner na internet. Antes de abrir produção, é necessário escolher uma opção gratuita e adequada de firewall ou rate limiting na Vercel, ou aprovar um limiter externo durável. A decisão precisa considerar limites, custo, retenção, tratamento de IP e comportamento entre deployments.

O código de analytics está presente, mas inativo sem `POSTHOG_PROJECT_TOKEN` e `POSTHOG_HOST`. O projeto e o dashboard privado do PostHog exigem autorização oficial separada. Publicar o scanner não autoriza outro produto de analytics nem plano pago.

## Verificação depois do deployment

Após um deployment aprovado, verificar em uma sessão privada ou sem login:

1. A página inicial abre sem GitHub, ChatGPT, Vercel, convite ou senha.
2. HTTPS está válido e direciona para a URL canônica.
3. Os headers de segurança aparecem nas páginas e APIs.
4. Um site público controlado conclui o scan.
5. Localhost, IPv4 privado, loopback IPv6, protocolos inválidos, portas alternativas e redirects privados continuam bloqueados.
6. Um alvo lento recebe timeout e uma resposta grande permanece limitada.
7. O Retest faz nova requisição e pode retornar corrigido, pendente ou inconclusivo.
8. PT-BR, inglês, espanhol, mobile, desktop, relatório para impressão e histórico local funcionam.
9. Nenhuma query string, secret, resposta bruta ou stack trace aparece em logs ou analytics.
10. Eventos reais chegam ao dashboard privado com propriedades permitidas.
11. A URL pública funciona fora da sessão do proprietário.

Somente depois dessas verificações a URL real deve entrar no README, no campo Website do GitHub e na apresentação do projeto.

## Rollback

Manter disponível o último deployment validado. Se controle de escopo, limitação de requisições, proteção de secrets, integridade da evidência ou minimização de analytics falhar, remover o acesso público ou fazer rollback antes de investigar. Um scanner vulnerável não deve permanecer público apenas para apresentação.
