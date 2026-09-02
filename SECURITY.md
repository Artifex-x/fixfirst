# Política de segurança

**Português** | [English](SECURITY.en.md)

O FixFirst é uma ferramenta defensiva de verificação passiva de configurações de sites. Relatos de segurança sobre a própria aplicação são bem-vindos, especialmente quando envolvem SSRF, desvio de escopo, redirects inseguros, negação de serviço, secrets expostos ou afirmações incorretas sobre a evidência de um scan.

## Versão compatível

Antes da primeira release com tag, somente a versão atual da branch `main` recebe suporte. Versões anteriores da prévia privada podem não conter os controles mais recentes.

## Como relatar uma vulnerabilidade

Use o Private Vulnerability Reporting do GitHub depois que ele for habilitado no repositório público. Não inclua detalhes de exploração, URLs privadas, credenciais, dados pessoais ou payloads de prova de conceito em uma Issue pública.

Se o reporte privado não estiver disponível, crie uma Issue pública contendo apenas um pedido de canal privado. Aguarde o proprietário do repositório fornecer esse canal pelo GitHub. Nunca envie senha, token, API key, private key ou cookie de sessão.

Este é um projeto individual de aprendizado, portanto não existe SLA garantido de resposta. Um relato válido será analisado antes da divulgação pública de detalhes técnicos.

## Conteúdo útil no relato

Inclua a versão ou o commit afetado, o impacto de segurança, a menor reprodução segura e as condições necessárias para acionar o comportamento. Oculte domínios alvo e dados de resposta, exceto quando forem fixtures públicas de teste sob seu controle.

## O que o FixFirst verifica

O FixFirst faz uma requisição passiva e limitada à raiz de um site público. Ele avalia o transporte retornado, alguns headers da resposta, atributos visíveis de cookies, referências limitadas no HTML, configuração de CORS e sinais públicos de tecnologia. Um Retest repete a requisição e reavalia o check selecionado.

## O que o FixFirst não verifica

O FixFirst não autentica no alvo, não rastreia o site inteiro, não envia formulários, não executa payloads de exploração, não avalia o código-fonte, não testa regras de negócio e não prova que um site é seguro. O resultado vale somente para a resposta pública e a evidência observada naquele momento.

## Autorização e teste seguro

A pessoa usuária precisa confirmar que possui autorização para analisar o alvo. Essa confirmação é um controle explícito de escopo, mas o FixFirst não consegue verificar a propriedade de forma independente. Não utilize o serviço contra um site sem permissão.

Pesquisas de segurança sobre o FixFirst devem evitar indisponibilidade ou tráfego de saída para terceiros. Sempre que possível, utilize fixtures locais ou uma infraestrutura sob seu controle.

## Dados e secrets

A aplicação não possui contas de usuário, banco de dados, SDK de analytics no navegador ou secret administrativo obrigatório. O histórico recente de scans fica no `localStorage` do navegador. O analytics utiliza um identificador anônimo separado, eventos explícitos com allowlist e uma rota do mesmo domínio que permanece desativada sem a configuração de ambiente do PostHog. O servidor remove query strings das URLs retornadas e não registra intencionalmente as respostas dos alvos.

Qualquer secret futuro deve ficar em uma variável de deployment disponível apenas no servidor. Ele não deve aparecer no código do cliente, commits, logs, relatórios, screenshots ou conteúdo de Issues.

## Divulgação

Permita tempo para entender e corrigir um problema confirmado antes de publicar detalhes técnicos. A divulgação coordenada deve explicar o comportamento afetado, a correção e as limitações restantes sem expor dados não relacionados de usuários.
