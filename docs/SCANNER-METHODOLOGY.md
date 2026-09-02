# Metodologia do scanner

Última revisão: 2 de setembro de 2026

**Português** | [English](SCANNER-METHODOLOGY.en.md)

## Escopo

O FixFirst analisa a resposta da raiz de uma origem pública HTTP ou HTTPS. O scanner não rastreia outras páginas, não autentica, não executa JavaScript do navegador, não envia formulários e não tenta explorar vulnerabilidades. O resultado descreve a evidência observada naquela resposta e naquele momento.

## Findings compatíveis

| Código do finding | Fonte da evidência | Qualificação importante |
| --- | --- | --- |
| `https_missing` | Esquema final de transporte | Observação direta |
| `certificate_invalid` | Resultado da autorização TLS | Avaliado somente quando existem metadados TLS; expiração é relatada separadamente |
| `certificate_expired` | Data `validTo` do certificado | Comparação direta de data |
| `certificate_expiring` | `validTo` dentro de 21 dias | Finding preventivo, não significa certificado inválido |
| `hsts_missing` | `Strict-Transport-Security` em HTTPS | Vale somente para a resposta HTTPS analisada |
| `csp_missing` | `Content-Security-Policy` | Verifica presença; a força completa da política não é avaliada |
| `frame_protection_missing` | CSP `frame-ancestors` ou `X-Frame-Options` válido | Qualquer um dos mecanismos válidos aprova o check |
| `nosniff_missing` | Valor exato `X-Content-Type-Options: nosniff` | Ausência e valores inválidos falham |
| `referrer_policy_missing` | Token reconhecido de Referrer-Policy | Verifica presença e valor reconhecido |
| `permissions_policy_missing` | Permissions-Policy não vazia | A completude da política depende de contexto |
| `cookie_secure_missing` | Primeiros 20 valores de `Set-Cookie` | A severidade sobe quando um cookie semelhante a sessão não usa Secure |
| `cookie_httponly_missing` | Nomes semelhantes a sessão nos primeiros 20 cookies | Outros cookies não precisam automaticamente de HttpOnly |
| `cookie_samesite_missing` | Primeiros 20 valores de `Set-Cookie` | Procura um atributo SameSite explícito |
| `cors_wildcard` | `Access-Control-Allow-Origin: *` | Resultado contextual com 55% de confiança; dados públicos podem usar esse valor legitimamente |
| `mixed_content` | Valor direto `http://` em `src`, `href` ou `action` no HTML | Avaliado somente em HTML ou XHTML limitado dentro de uma página HTTPS |
| `server_disclosure` | Presença de Server ou X-Powered-By | Informativo; valores brutos não voltam como evidência do finding |

## Registro de checks

A API retorna um estado para cada código de finding compatível.

| Estado | Significado |
| --- | --- |
| `pass` | A evidência necessária estava disponível e a condição não foi identificada |
| `fail` | A condição foi identificada pela evidência disponível |
| `not_applicable` | O check não se aplica à resposta, como HSTS em HTTP |
| `not_observed` | Nenhum objeto relevante foi observado, como ausência de `Set-Cookie` |
| `not_evaluated` | A evidência necessária não estava disponível, como metadados TLS em um fetch da plataforma |
| `partial` | Somente um subconjunto documentado foi avaliado, como a lista limitada de cookies |

Esse registro impede que ausência de dados seja apresentada como aprovação.

## Confiança

Confiança descreve qualidade e proximidade da evidência. Ela não descreve impacto e não representa a probabilidade de um site ser atacado.

| Perfil da evidência | Confiança | Estado na interface |
| --- | ---: | --- |
| Observação direta do transporte | 100 | Confirmado |
| Observação direta de TLS | 100 | Confirmado |
| Header direto da resposta | 99 | Confirmado |
| Atributo direto de cookie | 92 | Alta confiança |
| Referência direta no HTML | 87 | Alta confiança |
| Heurística geral de conteúdo ou header | 70 | Provável |
| Header cujo impacto depende do negócio | 55 | Exige revisão humana |

Um finding abaixo de 65% entra primeiro por uma rota de validação. O Playbook apresenta o procedimento de validação antes das etapas de correção.

## Fix Priority

A prioridade é determinística e separada do indicador passivo.

```text
priority = clamp(
  severity base
  + evidence adjustment
  + ease adjustment
  + context adjustment
  + chain adjustment,
  0,
  100
)
```

As bases de severidade são 90 para critical, 72 para high, 50 para medium, 28 para low e 10 para informational. O ajuste de evidência usa `round((confidence - 50) × 0.16)`. Uma correção simples e documentada adiciona 6. Contexto de formulário de login, pagamento ou dados pessoais adiciona 7 aos findings relacionados.

Duas combinações adicionam 6 a cada finding participante: ausência de CSP junto com mixed content e um cookie sem Secure e HttpOnly. Essas combinações não criam novos findings.

Pontuações a partir de 78 são prioridade alta. Valores entre 48 e 77 são prioridade média. Valores menores são prioridade baixa. A ordenação usa primeiro a prioridade e depois a severidade como critério determinístico de desempate.

A interface expõe os componentes do cálculo para permitir que outra pessoa revise a recomendação.

## Indicador passivo

O valor de 0 a 100 é um indicador relativo apenas para os checks passivos disponíveis. Ele não representa uma porcentagem de segurança.

Cada finding começa com uma dedução por severidade: 25 para critical, 16 para high, 8 para medium, 3 para low e 0 para informational. Esse valor recebe o peso da confiança da evidência:

```text
finding deduction = round(severity deduction × confidence / 100)
indicator = max(0, 100 - sum(finding deductions))
```

O resultado inclui a versão do modelo, a fórmula e a tabela de severidade. Evidência contextual recebe peso menor e não altera o indicador com a mesma força de uma observação direta da mesma severidade.

## Evidência de tecnologia

Os nomes das tecnologias vêm de um conjunto pequeno de sinais públicos da resposta. Headers de plataforma podem chegar a 99% de confiança, tokens do servidor ou powered-by a 95% e marcadores no HTML a valores entre 82% e 88%. No máximo quatro sinais são retornados.

A evidência seleciona um exemplo específico de Next.js, Nginx ou Apache somente quando atinge pelo menos 80% de confiança. Os demais casos recebem o Playbook genérico. A detecção nunca serve como prova de vulnerabilidade.

## Retest

O Retest envia uma nova requisição autorizada pelos mesmos controles de URL, limites do transporte e analisador. A API consulta então o registro do mesmo código de finding.

| Novo estado | Resultado do Retest |
| --- | --- |
| `pass` | Conclusivo e corrigido |
| `fail` | Conclusivo e ainda identificado |
| Qualquer outro estado | Inconclusivo; o problema anterior não é marcado como corrigido |

O resultado registra no histórico do navegador o horário da primeira descoberta, a nova análise e se o check passou de forma conclusiva. O navegador nunca altera o estado apenas por timer ou clique no botão.

## Controles de falso positivo

O FixFirst não infere findings do corpo quando a resposta não é um HTML analisado, não interpreta ausência de cookie como cookies seguros, mantém lacunas de metadados do certificado como não avaliadas, valida valores reconhecidos de headers quando possível e trata o impacto de CORS curinga como contextual. O scanner retorna somente resumos limitados de evidência e não declara cobertura do site inteiro.

## Referências dos Playbooks

Os Playbooks utilizam principalmente [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/), [MDN Web Docs](https://developer.mozilla.org/), [documentação do Next.js](https://nextjs.org/docs), [documentação do Nginx](https://nginx.org/en/docs/) e [documentação do Apache HTTP Server](https://httpd.apache.org/docs/). Cada Playbook retorna os links exatos usados na recomendação.
