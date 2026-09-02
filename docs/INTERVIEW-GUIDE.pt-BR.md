# Como explicar o FixFirst em uma entrevista

Este roteiro resume decisões que já existem no projeto. Ele não substitui a leitura do código e não apresenta deploy ou métricas como concluídos.

## Qual problema o FixFirst resolve?

O FixFirst tenta reduzir a distância entre encontrar uma configuração e saber o que fazer com ela. O scanner coleta uma resposta pública, registra a evidência, ordena os pontos com uma regra explicável e conecta cada resultado a uma orientação simples, um playbook técnico e um novo teste.

## O que é SSRF neste projeto?

SSRF aconteceria se alguém usasse o campo de URL para fazer o servidor do FixFirst acessar um destino que o usuário não deveria alcançar, como localhost, uma rede privada ou o serviço de metadados de uma nuvem. O risco existe porque a requisição sai do backend, não do navegador do usuário.

## Por que não basta bloquear 127.0.0.1?

O mesmo serviço pode ser alcançado por várias representações. Existem redes privadas IPv4, loopback IPv6, endereços link-local, IPv4 mapeado em IPv6, NAT64, faixas reservadas e nomes locais. O FixFirst valida o protocolo, a porta, o hostname e todos os endereços retornados pelo DNS.

## Por que os redirects são validados de novo?

Um domínio público pode responder com um redirect para um endereço privado. Validar apenas a primeira URL deixaria essa passagem aberta. Cada destino repete a validação completa, e a cadeia para depois de três redirects.

## Como o projeto reduz DNS rebinding?

No runtime Node.js, o scanner resolve o domínio, valida todos os resultados e conecta o socket diretamente ao IP público selecionado. O hostname original continua sendo usado no Host e no SNI. Assim, a conexão não faz uma segunda resolução silenciosa. No preview Cloudflare, a API nativa não permite o mesmo pinning, então a limitação e a dependência do isolamento de rede da plataforma ficam explícitas.

## Como Fix Priority escolhe o primeiro ponto?

A prioridade começa na severidade e recebe ajustes pela confiança da evidência, facilidade de correção, contexto observado na página e duas combinações documentadas. O cálculo é determinístico e os componentes aparecem nos detalhes técnicos. Severity e confidence continuam separados.

## Como confidence funciona?

Confidence representa a qualidade da evidência. Uma observação direta do transporte ou TLS vale mais que um sinal contextual. O wildcard de CORS, por exemplo, é observado diretamente, mas seu impacto depende dos dados da resposta. Por isso ele aparece como revisão manual e mostra validação antes de correção.

## O que significa o indicador de 0 a 100?

É um indicador relativo somente para os checks suportados. Não significa que o site está uma determinada porcentagem seguro. Cada finding desconta um valor conforme severidade, ponderado pela confiança da evidência. A fórmula e os descontos estão no próprio resultado e na metodologia.

## Como o Retest confirma uma correção?

O botão inicia uma nova requisição real. O backend executa novamente os controles e lê o status do mesmo finding no novo check ledger. Somente um `pass` confirma a correção. Se a evidência estiver indisponível, o resultado fica inconclusivo e o status anterior não muda para corrigido.

## Por que os Playbooks incluem referências técnicas?

Uma recomendação de segurança pode quebrar uma função legítima se ignorar contexto. A seção Referências do Playbook reúne documentação da OWASP, da MDN, do Next.js, do Nginx e do Apache como base técnica. Os Playbooks registram versão, data de revisão, pré-requisitos, validação e rollback. Exemplos específicos só aparecem quando a tecnologia tem confiança suficiente.

## Como os secrets são protegidos?

O MVP atual não precisa de secret. Arquivos `.env`, chaves privadas e arquivos comuns de credenciais estão ignorados. Se uma integração futura exigir um valor confidencial, ele deverá ficar em variável server-side da plataforma e nunca no frontend, no commit, no log ou na conversa.

## Como GitHub Actions foi preparado?

O workflow de CI usa permissão de leitura, não recebe credenciais de deploy e executa dependências travadas, audit, lint, testes e dois builds. As Actions oficiais estão fixadas por SHA completo. CodeQL possui um workflow separado com somente a permissão adicional necessária para enviar resultados de segurança.

## Um repositório público permite que qualquer pessoa altere o projeto?

Não. Qualquer pessoa poderá ver, clonar e criar um fork. Também poderá sugerir uma mudança por Pull Request. Alterar o repositório original depende de permissão, e o plano mantém somente a conta da proprietária com acesso direto.

## Quais métricas existem hoje?

Nenhuma métrica agregada de usuários está ativa. O projeto não inventa números. Existe um plano de eventos e minimização de dados, mas um serviço externo só será integrado depois de decisão sobre conta, custo, retenção e privacidade.

## Qual é a principal limitação antes do deploy público?

O rate limit atual funciona por instância. Em ambiente serverless, várias instâncias não compartilham o mesmo contador. Antes de abrir o scanner para a internet, ainda é necessário escolher um controle distribuído ou da própria plataforma e validar o comportamento como visitante sem login.
