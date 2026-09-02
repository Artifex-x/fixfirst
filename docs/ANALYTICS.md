# Analytics do FixFirst

Status: produção ativa e validação inicial concluída

Última revisão: 2 de setembro de 2026

**Português** | [English](ANALYTICS.en.md)

## Objetivo

O analytics do FixFirst mede o uso real do produto e as etapas do fluxo de remediação. Ele diferencia uma visita de uma utilização efetiva do scanner e permite analisar conclusão, abertura dos guias, Retest e confirmação de correções.

Nenhum número deve ser apresentado como métrica real antes de vir do ambiente público e indicar o período analisado.

## Ferramenta escolhida

O projeto utiliza PostHog Cloud Product Analytics. Em 2 de setembro de 2026, a [documentação oficial do Product Analytics](https://posthog.com/docs/product-analytics/start-here) informa que os primeiros 1 milhão de eventos mensais são gratuitos e que não é necessário cadastrar cartão para começar. Funis e análises de retenção fazem parte do produto.

Nenhum plano pago, trial com cobrança futura ou recurso cobrado por uso deve ser ativado para o FixFirst. O limite de faturamento deve permanecer em zero enquanto o projeto estiver nesta fase.

## Arquitetura da integração

O navegador registra somente eventos explícitos e envia um envelope pequeno para `POST /api/analytics` no mesmo domínio do FixFirst. A rota valida o nome do evento, os identificadores e cada propriedade contra uma lista fechada. Somente depois dessa validação a rota envia o evento para a [Capture API oficial do PostHog](https://posthog.com/docs/api/capture#single-event).

Essa arquitetura não carrega o SDK JavaScript do PostHog no navegador. Portanto, autocapture, captura de formulários, pageviews automáticos e Session Replay não são iniciados. O navegador também não se conecta diretamente ao PostHog.

O project token utilizado pela Capture API é uma chave pública por definição do PostHog, mas o FixFirst o mantém na configuração do servidor para reduzir exposição desnecessária. Nenhuma personal API key ou chave administrativa é necessária para enviar eventos.

## Configuração

A integração utiliza duas variáveis de ambiente no servidor:

| Variável | Finalidade |
| --- | --- |
| `POSTHOG_PROJECT_TOKEN` | Project token do projeto PostHog |
| `POSTHOG_HOST` | Host regional de ingestão do PostHog Cloud |

O código aceita somente os hosts oficiais `https://us.i.posthog.com` e `https://eu.i.posthog.com`. Os valores reais não pertencem ao GitHub, ao README ou aos logs.

Sem uma configuração válida, a rota responde sem enviar dados para um serviço externo. A produção da Vercel possui a configuração válida; a prévia privada permanece sem envio externo.

## Identidade anônima e sessões

O FixFirst cria um UUID aleatório para o visitante e outro para a sessão. O UUID do visitante fica no `localStorage` do navegador para permitir contagem responsável de visitantes únicos e retornos. O UUID da sessão é renovado depois de 30 minutos sem atividade.

Os eventos são enviados com `$process_person_profile: false`. Assim, o PostHog processa eventos anônimos sem criar um perfil de pessoa. O código também envia `$geoip_disable: true` e nunca encaminha o IP do visitante ao PostHog.

Global Privacy Control e Do Not Track são respeitados. Quando um desses sinais está ativo, o FixFirst não cria os identificadores de analytics e não envia eventos.

## Eventos registrados

Cada evento corresponde a uma transição real da interface ou a uma resposta real do scanner.

| Evento | Gatilho real | Propriedades específicas permitidas |
| --- | --- | --- |
| `page_view` | A aplicação termina de carregar | `visitor_status` |
| `scan_url_submitted` | Uma URL sintaticamente válida avança para a autorização | Nenhuma |
| `scan_authorized` | O usuário confirma a autorização e aciona a análise | Nenhuma |
| `scan_started` | Uma análise inicial é enviada para a API | `scan_type` |
| `scan_completed` | A análise inicial retorna um resultado válido | `scan_type`, faixas de findings, faixa de prioridades e transporte |
| `scan_failed` | Uma análise inicial ou Retest termina com erro | `scan_type`, categoria estável do erro |
| `result_viewed` | A tela de resultado é apresentada | `scan_type`, faixas de findings e prioridades |
| `priority_viewed` | A primeira prioridade é apresentada | código do finding, prioridade e status de confiança |
| `simple_guide_opened` | A explicação simples do finding é apresentada | código do finding, prioridade e status de confiança |
| `technical_playbook_opened` | A rota técnica de correção é apresentada | código do finding e tipo de Playbook |
| `developer_message_generated` | A mensagem para desenvolvedor é gerada e exibida | código do finding |
| `report_generated` | A prévia de um relatório é gerada | tipo e idioma do relatório |
| `retest_started` | Um Retest real é enviado para a API | código do finding |
| `retest_completed` | O Retest retorna uma avaliação válida | código do finding, resultado e conclusão |
| `fix_confirmed` | O mesmo controle passa de forma conclusiva no Retest | código do finding |
| `language_changed` | O idioma da interface é alterado | idioma anterior e novo idioma |

Todos os eventos incluem somente `locale` e uma categoria ampla de dispositivo, além das propriedades listadas. A categoria do dispositivo usa apenas a largura atual da viewport: mobile, tablet ou desktop. Dimensões exatas, User Agent e fingerprint não são enviados.

Contagens de findings são agrupadas nas faixas `0`, `1`, `2_3`, `4_7` e `8_plus`. Isso responde às perguntas de produto sem transmitir o resultado técnico completo.

## Funil principal

O funil privado deve utilizar, nesta ordem:

1. `page_view`
2. `scan_url_submitted`
3. `scan_authorized`
4. `scan_started`
5. `scan_completed`
6. `result_viewed`
7. `priority_viewed`
8. `simple_guide_opened` ou `technical_playbook_opened`
9. `retest_started`
10. `retest_completed`
11. `fix_confirmed`

O ramo de erro utiliza `scan_failed`. Ele não deve ser tratado como conclusão bem sucedida.

## Dashboard privado

O dashboard privado foi criado no projeto PostHog confirmado e contém seis insights validados:

1. Visitas nos últimos 30 dias.
2. Análises iniciadas, concluídas e com falha.
3. Aberturas do guia simples e do Playbook técnico.
4. Retests iniciados, concluídos e correções confirmadas.
5. Funil entre análise iniciada e concluída, com abandono por etapa.
6. Jornada entre visita, análise concluída, Playbook, Retest e correção confirmada.

O dashboard não aparece no FixFirst, não possui compartilhamento público e usa acesso restrito. O acesso administrativo permanece na conta proprietária do projeto PostHog.

## Dados deliberadamente não coletados

| Categoria | Dados excluídos |
| --- | --- |
| Alvo do scanner | Domínio, URL, caminho, query string, fragmento, redirect e IP resolvido |
| Credenciais | Senha, token, API key privada, cookie, header de autorização, private key |
| Conteúdo do scan | Headers brutos, HTML, evidência, finding completo, certificado e corpo do relatório |
| Dados pessoais | Nome, email, telefone, conta e texto livre |
| Navegador | User Agent completo, dimensão exata da tela e fingerprint |
| Navegação | URL atual, página anterior e referrer |
| Estado interno | Stack trace, variável de ambiente, log e segredo de deployment |

A requisição do navegador usa `credentials: omit` e `referrerPolicy: no-referrer`. Isso impede que cookies e o endereço da página sejam enviados junto ao evento para a rota de analytics.

## Controles adicionais

1. A rota aceita apenas requisições do mesmo domínio.
2. O corpo JSON é limitado a 4 KiB.
3. Eventos, campos e valores usam listas fechadas.
4. O envio externo possui timeout curto e nunca bloqueia o fluxo do scanner.
5. A rota possui limitação local de volume, independente do limite do scanner.
6. O host de ingestão usa allowlist para evitar destinos arbitrários.
7. O project token não é enviado ao navegador pelo FixFirst.

Na conta PostHog, a opção **Discard client IP data** está ativada em **Settings**, **Project**, **IP data capture configuration**. A [documentação de armazenamento de dados](https://posthog.com/docs/privacy/data-storage) explica esse controle. Mesmo que a integração encaminhe apenas o IP de saída do servidor, e não o IP do visitante, o descarte deve permanecer ligado.

## Métricas derivadas

O dashboard pode calcular visitantes por dia, visitantes únicos, sessões, retorno, taxa de início, taxa de conclusão, abertura de prioridade, abertura de guia, abertura de Playbook, geração de relatórios, taxa de Retest e taxa de correção confirmada.

As métricas públicas futuras devem usar somente dados reais, indicar o intervalo de datas e explicar eventuais filtros. Nenhum dado individual deve ser publicado.

## Limitações

1. Limpar o armazenamento do navegador cria um novo identificador anônimo.
2. Navegadores e dispositivos diferentes aparecem como visitantes distintos.
3. Pessoas com Global Privacy Control ou Do Not Track não entram nas métricas.
4. Bloqueadores de conteúdo ou falhas de rede podem impedir a entrega de eventos.
5. O limite local da rota é por instância e não substitui um controle distribuído da plataforma.
6. A classificação de dispositivo é ampla e não identifica modelo ou sistema operacional.
7. Retenção e exclusão continuam sendo controles administrativos da conta proprietária e precisam de revisão periódica.

## Validação

Os testes automatizados verificam criação de identificadores anônimos, renovação de sessão, respeito a sinais de privacidade, rejeição de campos desconhecidos, ausência de URL e texto livre, payload anônimo do PostHog, allowlist de host e comportamento da rota sem configuração.

Em 2 de setembro de 2026, a rota publicada reconheceu a configuração de produção, rejeitou um envelope inválido com erro estável e o dashboard recebeu eventos reais de `page_view`. Nenhum evento sintético foi criado para preencher métricas. As contagens continuam privadas até existir um período representativo.

## Referências oficiais

1. [PostHog Product Analytics](https://posthog.com/docs/product-analytics/start-here)
2. [Capture API](https://posthog.com/docs/api/capture#single-event)
3. [Eventos anônimos](https://posthog.com/docs/data/anonymous-vs-identified-events#how-to-capture-anonymous-events)
4. [Sessões](https://posthog.com/docs/data/sessions)
5. [Controle de coleta](https://posthog.com/docs/privacy/data-collection)
6. [Controle de armazenamento](https://posthog.com/docs/privacy/data-storage)
