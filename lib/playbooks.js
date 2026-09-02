const text = (pt, en, es) => ({ "pt-BR": pt, en, es });
const pick = (value, locale) => value?.[locale] || value?.["pt-BR"] || value;
const PLAYBOOK_VERSION = "1.0.0";
const LAST_REVIEWED_AT = "2026-09-02";

const SOURCES = {
  owaspHeaders: { label: "OWASP: HTTP Headers Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html" },
  owaspTls: { label: "OWASP: Transport Layer Security Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html" },
  mdnTls: { label: "MDN: Transport Layer Security (TLS)", url: "https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Transport_Layer_Security" },
  mdnHsts: { label: "MDN: Strict-Transport-Security", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security" },
  mdnCsp: { label: "MDN: Content Security Policy (CSP)", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP" },
  mdnCspReport: { label: "MDN: Content-Security-Policy-Report-Only", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy-Report-Only" },
  mdnFrame: { label: "MDN: X-Frame-Options", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options" },
  mdnNosniff: { label: "MDN: X-Content-Type-Options", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options" },
  mdnReferrer: { label: "MDN: Referrer-Policy", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy" },
  mdnPermissions: { label: "MDN: Permissions-Policy", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy" },
  mdnCookies: { label: "MDN: Secure cookie configuration", url: "https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies" },
  mdnCors: { label: "MDN: Cross-Origin Resource Sharing (CORS)", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS" },
  mdnMixed: { label: "MDN: Mixed content", url: "https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content" },
  nextHeaders: { label: "Next.js: Headers", url: "https://nextjs.org/docs/app/api-reference/config/next-config-js/headers" },
  nextCookies: { label: "Next.js: Cookies", url: "https://nextjs.org/docs/app/api-reference/functions/cookies" },
  nextPowered: { label: "Next.js: poweredByHeader", url: "https://nextjs.org/docs/app/api-reference/config/next-config-js/poweredByHeader" },
  nginxHeaders: { label: "Nginx: ngx_http_headers_module", url: "https://nginx.org/en/docs/http/ngx_http_headers_module.html" },
  nginxTokens: { label: "Nginx: server_tokens", url: "https://nginx.org/en/docs/http/ngx_http_core_module.html#server_tokens" },
  apacheHeaders: { label: "Apache: mod_headers", url: "https://httpd.apache.org/docs/current/mod/mod_headers.html" },
  apacheTokens: { label: "Apache: ServerTokens", url: "https://httpd.apache.org/docs/current/mod/core.html#servertokens" },
};

const PLAYBOOKS = {
  https_missing: {
    prerequisites: [text("Confirmar que o domínio e os subdomínios necessários apontam para a hospedagem correta e podem receber um certificado.", "Confirm that the domain and required subdomains point to the correct host and can receive a certificate.", "Confirma que el dominio y los subdominios necesarios apuntan al alojamiento correcto y pueden recibir un certificado.")],
    steps: [
      text("Emitir um certificado válido pela hospedagem ou pelo CDN e manter a renovação automática ativa.", "Issue a valid certificate through the host or CDN and keep automatic renewal enabled.", "Emite un certificado válido mediante el alojamiento o CDN y mantén activa la renovación automática."),
      text("Redirecionar HTTP para HTTPS preservando o caminho e revisar links, formulários e recursos internos.", "Redirect HTTP to HTTPS while preserving the path, then review internal links, forms, and resources.", "Redirige HTTP a HTTPS conservando la ruta y revisa enlaces, formularios y recursos internos."),
      text("Ativar HSTS somente depois que todo o tráfego necessário funcionar por HTTPS.", "Enable HSTS only after all required traffic works over HTTPS.", "Activa HSTS solo después de que todo el tráfico necesario funcione por HTTPS."),
    ],
    validation: [text("Abrir as versões HTTP e HTTPS, confirmar o redirecionamento e verificar que o navegador não apresenta alerta de certificado.", "Open the HTTP and HTTPS versions, confirm the redirect, and verify that the browser shows no certificate warning.", "Abre las versiones HTTP y HTTPS, confirma la redirección y verifica que el navegador no muestre alertas del certificado.")],
    rollback: [text("Se HTTPS falhar, corrigir certificado, DNS ou hospedagem antes de remover temporariamente o redirecionamento. Nunca orientar visitantes a ignorar alertas.", "If HTTPS fails, fix the certificate, DNS, or hosting before temporarily removing the redirect. Never ask visitors to bypass warnings.", "Si HTTPS falla, corrige el certificado, DNS o alojamiento antes de retirar temporalmente la redirección. Nunca pidas ignorar alertas.")],
    sourceIds: ["owaspTls", "mdnTls"],
  },
  certificate_invalid: {
    prerequisites: [text("Registrar o código de validação e confirmar o nome de domínio que o certificado deve cobrir.", "Record the validation code and confirm the hostname the certificate must cover.", "Registra el código de validación y confirma el nombre de dominio que debe cubrir el certificado.")],
    steps: [
      text("Reemitir o certificado para o domínio correto usando uma autoridade confiável.", "Reissue the certificate for the correct hostname through a trusted authority.", "Vuelve a emitir el certificado para el dominio correcto mediante una autoridad de confianza."),
      text("Instalar a cadeia completa e remover certificados antigos ou autoassinados da rota pública.", "Install the complete chain and remove old or self-signed certificates from the public route.", "Instala la cadena completa y retira certificados antiguos o autofirmados de la ruta pública."),
      text("Confirmar data e hora do servidor e a configuração SNI quando vários domínios compartilham o mesmo endereço.", "Confirm server time and SNI configuration when several domains share one address.", "Confirma la hora del servidor y la configuración SNI cuando varios dominios comparten una dirección."),
    ],
    validation: [text("Validar o domínio em um navegador atualizado e executar novamente a análise.", "Validate the hostname in an up-to-date browser and run the analysis again.", "Valida el dominio en un navegador actualizado y vuelve a ejecutar el análisis.")],
    rollback: [text("Manter o certificado anterior apenas se ele ainda for válido para o mesmo domínio; não desativar a validação TLS.", "Keep the previous certificate only if it is still valid for the same hostname; do not disable TLS validation.", "Mantén el certificado anterior solo si sigue siendo válido para el mismo dominio; no desactives la validación TLS.")],
    sourceIds: ["owaspTls", "mdnTls"],
  },
  certificate_expired: {
    prerequisites: [text("Confirmar quem administra o certificado e se a renovação automática falhou.", "Confirm who manages the certificate and whether automatic renewal failed.", "Confirma quién administra el certificado y si falló la renovación automática.")],
    steps: [text("Renovar ou reemitir o certificado imediatamente, instalar a cadeia completa e reiniciar somente o serviço necessário.", "Renew or reissue the certificate immediately, install the complete chain, and restart only the required service.", "Renueva o vuelve a emitir el certificado de inmediato, instala la cadena completa y reinicia solo el servicio necesario."), text("Corrigir a causa da falha de renovação e criar um alerta antes do próximo vencimento.", "Fix the renewal failure and add an alert before the next expiration.", "Corrige el fallo de renovación y crea una alerta antes del próximo vencimiento.")],
    validation: [text("Confirmar a nova validade, o nome do domínio e a cadeia de confiança antes do reteste.", "Confirm the new validity period, hostname, and trust chain before retesting.", "Confirma la nueva validez, el dominio y la cadena de confianza antes de volver a probar.")],
    rollback: [text("Se a emissão falhar, restaurar somente um certificado anterior ainda válido. Não servir o site com validação desativada.", "If issuance fails, restore only a previous certificate that is still valid. Do not serve the site with validation disabled.", "Si la emisión falla, restaura solo un certificado anterior que siga siendo válido. No sirvas el sitio con la validación desactivada.")],
    sourceIds: ["owaspTls", "mdnTls"],
  },
  certificate_expiring: {
    prerequisites: [text("Confirmar a data de vencimento e o responsável pela renovação.", "Confirm the expiration date and the owner of the renewal process.", "Confirma la fecha de vencimiento y el responsable de la renovación.")],
    steps: [text("Executar a renovação antes da janela de risco e verificar que o novo certificado será selecionado pelo serviço público.", "Renew before the risk window and verify that the public service will select the new certificate.", "Renueva antes de la ventana de riesgo y verifica que el servicio público seleccione el nuevo certificado."), text("Testar a renovação automática e configurar aviso com antecedência suficiente.", "Test automatic renewal and configure an early warning.", "Prueba la renovación automática y configura un aviso con suficiente antelación.")],
    validation: [text("Executar novo teste após a emissão e confirmar que a validade observada mudou.", "Run a new test after issuance and confirm that the observed validity period changed.", "Ejecuta una nueva prueba tras la emisión y confirma que cambió la validez observada.")],
    rollback: [text("Manter o certificado atual enquanto ele for válido caso a nova emissão apresente erro.", "Keep the current certificate while it remains valid if the new issuance has a problem.", "Mantén el certificado actual mientras siga siendo válido si la nueva emisión presenta un error.")],
    sourceIds: ["owaspTls", "mdnTls"],
  },
  hsts_missing: {
    prerequisites: [text("Confirmar que o domínio inteiro funciona por HTTPS. Não incluir subdomínios antes de verificar cada um.", "Confirm that the entire hostname works over HTTPS. Do not include subdomains before checking each one.", "Confirma que todo el dominio funciona mediante HTTPS. No incluyas subdominios antes de revisar cada uno.")],
    steps: [text("Publicar Strict-Transport-Security inicialmente com um max-age curto, como 300 segundos.", "Publish Strict-Transport-Security first with a short max-age such as 300 seconds.", "Publica Strict-Transport-Security primero con un max-age corto, como 300 segundos."), text("Acompanhar erros e aumentar gradualmente para 31536000 depois da validação.", "Monitor errors and increase gradually to 31536000 after validation.", "Supervisa errores y aumenta gradualmente a 31536000 después de validar."), text("Adicionar includeSubDomains ou preload somente após revisão específica e decisão consciente.", "Add includeSubDomains or preload only after a dedicated review and an explicit decision.", "Añade includeSubDomains o preload solo tras una revisión específica y una decisión consciente.")],
    validation: [text("Verificar o cabeçalho em uma resposta HTTPS, testar subdomínios relevantes e executar o reteste.", "Check the header on an HTTPS response, test relevant subdomains, and run the retest.", "Comprueba el encabezado en una respuesta HTTPS, prueba los subdominios relevantes y ejecuta la nueva prueba.")],
    rollback: [text("Reduzir max-age para 0 por HTTPS se for necessário remover a política. Navegadores que já receberam a política podem levar tempo para atualizar.", "Send max-age=0 over HTTPS if the policy must be removed. Browsers that already received it may take time to update.", "Envía max-age=0 mediante HTTPS si debes retirar la política. Los navegadores que ya la recibieron pueden tardar en actualizarse.")],
    sourceIds: ["mdnHsts", "owaspHeaders"],
  },
  csp_missing: {
    prerequisites: [text("Inventariar scripts, estilos, imagens, fontes, frames e conexões realmente usados pelo site.", "Inventory the scripts, styles, images, fonts, frames, and connections the site actually uses.", "Inventaría los scripts, estilos, imágenes, fuentes, marcos y conexiones que realmente usa el sitio.")],
    steps: [text("Criar uma política mínima e começar com Content-Security-Policy-Report-Only.", "Create a minimum policy and begin with Content-Security-Policy-Report-Only.", "Crea una política mínima y empieza con Content-Security-Policy-Report-Only."), text("Corrigir violações legítimas sem liberar origens amplas e evitar unsafe-inline sempre que a arquitetura permitir.", "Resolve legitimate violations without broad source allowances and avoid unsafe-inline when the architecture permits.", "Corrige las violaciones legítimas sin permitir orígenes amplios y evita unsafe-inline cuando la arquitectura lo permita."), text("Migrar para Content-Security-Policy em modo de aplicação e continuar acompanhando violações.", "Move to enforcing Content-Security-Policy and continue monitoring violations.", "Pasa a Content-Security-Policy en modo de aplicación y sigue supervisando las violaciones.")],
    validation: [text("Percorrer páginas e fluxos importantes, observar o console e confirmar que recursos legítimos continuam funcionando.", "Exercise important pages and flows, inspect the console, and confirm legitimate resources still work.", "Recorre páginas y flujos importantes, revisa la consola y confirma que los recursos legítimos siguen funcionando.")],
    rollback: [text("Voltar temporariamente ao modo Report-Only se uma função legítima quebrar, mantendo a política para investigação.", "Return temporarily to Report-Only if a legitimate feature breaks, keeping the policy available for investigation.", "Vuelve temporalmente a Report-Only si se rompe una función legítima, conservando la política para investigarla.")],
    sourceIds: ["mdnCsp", "mdnCspReport", "owaspHeaders"],
  },
  frame_protection_missing: {
    prerequisites: [text("Confirmar se alguma página precisa ser incorporada por outro domínio.", "Confirm whether any page must be embedded by another origin.", "Confirma si alguna página debe incrustarse desde otro origen.")],
    steps: [text("Adicionar frame-ancestors 'none' à CSP quando nenhuma incorporação for necessária, ou listar somente origens autorizadas.", "Add frame-ancestors 'none' to CSP when embedding is not needed, or list only authorized origins.", "Añade frame-ancestors 'none' a CSP cuando no se necesite incrustación, o enumera solo los orígenes autorizados."), text("Usar X-Frame-Options: DENY ou SAMEORIGIN como compatibilidade quando adequado.", "Use X-Frame-Options: DENY or SAMEORIGIN as a compatibility layer when appropriate.", "Usa X-Frame-Options: DENY o SAMEORIGIN como capa de compatibilidad cuando corresponda.")],
    validation: [text("Tentar incorporar a página em um ambiente de teste autorizado e confirmar que integrações legítimas continuam funcionando.", "Try embedding the page in an authorized test environment and confirm legitimate integrations still work.", "Intenta incrustar la página en un entorno de prueba autorizado y confirma que las integraciones legítimas siguen funcionando.")],
    rollback: [text("Ajustar a lista de frame-ancestors para a origem legítima em vez de remover toda a proteção.", "Adjust frame-ancestors for the legitimate origin instead of removing all protection.", "Ajusta frame-ancestors para el origen legítimo en vez de retirar toda la protección.")],
    sourceIds: ["mdnFrame", "mdnCsp", "owaspHeaders"],
  },
  nosniff_missing: {
    prerequisites: [text("Confirmar que arquivos são servidos com Content-Type correto.", "Confirm that files are served with the correct Content-Type.", "Confirma que los archivos se sirven con el Content-Type correcto.")],
    steps: [text("Corrigir tipos MIME incorretos e adicionar X-Content-Type-Options: nosniff em todas as respostas aplicáveis.", "Correct invalid MIME types and add X-Content-Type-Options: nosniff to applicable responses.", "Corrige los tipos MIME incorrectos y añade X-Content-Type-Options: nosniff a las respuestas aplicables.")],
    validation: [text("Testar scripts, estilos, downloads e uploads; depois confirmar o cabeçalho no reteste.", "Test scripts, styles, downloads, and uploads, then confirm the header in the retest.", "Prueba scripts, estilos, descargas y cargas; después confirma el encabezado en la nueva prueba.")],
    rollback: [text("Corrigir o Content-Type do recurso que quebrou. Não remover nosniff como solução permanente.", "Fix the Content-Type of the resource that broke. Do not remove nosniff as a permanent workaround.", "Corrige el Content-Type del recurso que falló. No retires nosniff como solución permanente.")],
    sourceIds: ["mdnNosniff", "owaspHeaders"],
  },
  referrer_policy_missing: {
    prerequisites: [text("Verificar se integrações dependem do endereço completo enviado como referência.", "Check whether integrations depend on receiving the full referring URL.", "Comprueba si alguna integración depende de recibir la URL de referencia completa.")],
    steps: [text("Adicionar Referrer-Policy: strict-origin-when-cross-origin como ponto de partida e reduzir mais quando possível.", "Add Referrer-Policy: strict-origin-when-cross-origin as a starting point and reduce further when possible.", "Añade Referrer-Policy: strict-origin-when-cross-origin como punto de partida y reduce más cuando sea posible.")],
    validation: [text("Testar navegação interna e externa e confirmar que URLs sensíveis não são enviadas a terceiros.", "Test internal and external navigation and confirm sensitive URLs are not sent to third parties.", "Prueba la navegación interna y externa y confirma que las URL sensibles no se envían a terceros.")],
    rollback: [text("Escolher uma política compatível mais restritiva que a ausência de política, documentando a exceção.", "Choose a compatible policy that is still stricter than no policy and document the exception.", "Elige una política compatible que siga siendo más restrictiva que no tener política y documenta la excepción.")],
    sourceIds: ["mdnReferrer", "owaspHeaders"],
  },
  permissions_policy_missing: {
    prerequisites: [text("Listar recursos do navegador usados diretamente e por frames autorizados.", "List browser features used directly and by authorized frames.", "Enumera las funciones del navegador usadas directamente y por marcos autorizados.")],
    steps: [text("Negar câmera, microfone, geolocalização e outros recursos não usados; permitir somente as origens necessárias.", "Deny camera, microphone, geolocation, and other unused features; allow only required origins.", "Deniega cámara, micrófono, geolocalización y otras funciones no usadas; permite solo los orígenes necesarios.")],
    validation: [text("Testar permissões legítimas e conteúdo incorporado antes do reteste.", "Test legitimate permissions and embedded content before retesting.", "Prueba los permisos legítimos y el contenido incrustado antes de volver a analizar.")],
    rollback: [text("Liberar somente o recurso e a origem que apresentaram necessidade comprovada.", "Allow only the feature and origin with a demonstrated need.", "Permite solo la función y el origen cuya necesidad esté demostrada.")],
    sourceIds: ["mdnPermissions", "owaspHeaders"],
  },
  cookie_secure_missing: {
    prerequisites: [text("Confirmar que toda a aplicação usa HTTPS e identificar quais cookies mantêm sessão ou autenticação.", "Confirm the whole application uses HTTPS and identify session or authentication cookies.", "Confirma que toda la aplicación usa HTTPS e identifica las cookies de sesión o autenticación.")],
    steps: [text("Definir Secure na criação do cookie e revisar Domain e Path para reduzir o alcance.", "Set Secure when creating the cookie and review Domain and Path to reduce scope.", "Define Secure al crear la cookie y revisa Domain y Path para reducir su alcance."), text("Considerar o prefixo __Host- para cookies de host quando os requisitos forem compatíveis.", "Consider the __Host- prefix for host cookies when its requirements are compatible.", "Considera el prefijo __Host- para cookies de host cuando sus requisitos sean compatibles.")],
    validation: [text("Autenticar em ambiente de teste, inspecionar Set-Cookie e confirmar que a sessão continua funcionando somente por HTTPS.", "Authenticate in a test environment, inspect Set-Cookie, and confirm the session continues to work only over HTTPS.", "Autentícate en un entorno de prueba, revisa Set-Cookie y confirma que la sesión funciona solo mediante HTTPS.")],
    rollback: [text("Se a sessão quebrar, corrigir HTTPS, domínio ou caminho do cookie. Não manter cookies de sessão sem Secure.", "If the session breaks, fix HTTPS, cookie domain, or path. Do not leave session cookies without Secure.", "Si se rompe la sesión, corrige HTTPS, el dominio o la ruta de la cookie. No dejes cookies de sesión sin Secure.")],
    sourceIds: ["mdnCookies"],
  },
  cookie_httponly_missing: {
    prerequisites: [text("Confirmar se o JavaScript do navegador realmente precisa ler o cookie.", "Confirm whether browser JavaScript genuinely needs to read the cookie.", "Confirma si JavaScript en el navegador necesita realmente leer la cookie.")],
    steps: [text("Definir HttpOnly para cookies de sessão, autenticação e outros valores que não precisam estar no JavaScript.", "Set HttpOnly on session, authentication, and other cookies that do not need to be available to JavaScript.", "Define HttpOnly en cookies de sesión, autenticación y otros valores que no deban estar disponibles para JavaScript."), text("Mover dados de interface que precisam ser lidos para outro mecanismo que não contenha o segredo da sessão.", "Move UI data that must be read to another mechanism that does not contain the session secret.", "Mueve los datos de interfaz que deban leerse a otro mecanismo que no contenga el secreto de sesión.")],
    validation: [text("Confirmar que document.cookie não expõe o cookie e que login, renovação e logout continuam funcionando.", "Confirm document.cookie does not expose the cookie and that sign-in, renewal, and sign-out still work.", "Confirma que document.cookie no expone la cookie y que inicio, renovación y cierre de sesión siguen funcionando.")],
    rollback: [text("Reverter apenas o cookie que possui dependência legítima de JavaScript e redesenhar essa dependência.", "Revert only the cookie with a legitimate JavaScript dependency and redesign that dependency.", "Revierte solo la cookie con una dependencia legítima de JavaScript y rediseña esa dependencia.")],
    sourceIds: ["mdnCookies"],
  },
  cookie_samesite_missing: {
    prerequisites: [text("Mapear login federado, pagamentos, frames e outros fluxos iniciados por sites diferentes.", "Map federated sign-in, payments, frames, and other flows initiated by different sites.", "Mapea inicio de sesión federado, pagos, marcos y otros flujos iniciados desde sitios distintos.")],
    steps: [text("Usar SameSite=Lax como padrão, Strict quando o fluxo permitir e None somente quando a integração entre sites exigir.", "Use SameSite=Lax by default, Strict when the flow permits, and None only when cross-site integration requires it.", "Usa SameSite=Lax por defecto, Strict cuando el flujo lo permita y None solo cuando la integración entre sitios lo exija."), text("Sempre combinar SameSite=None com Secure.", "Always combine SameSite=None with Secure.", "Combina siempre SameSite=None con Secure.")],
    validation: [text("Testar autenticação, links externos, pagamentos e integrações entre sites em navegadores atuais.", "Test authentication, external links, payments, and cross-site integrations in current browsers.", "Prueba autenticación, enlaces externos, pagos e integraciones entre sitios en navegadores actuales.")],
    rollback: [text("Ajustar somente o cookie e o fluxo afetados; não remover SameSite dos demais cookies.", "Adjust only the affected cookie and flow; do not remove SameSite from other cookies.", "Ajusta solo la cookie y el flujo afectados; no retires SameSite de las demás cookies.")],
    sourceIds: ["mdnCookies"],
  },
  cors_wildcard: {
    prerequisites: [text("Identificar quais origens consomem a resposta e se ela contém dados públicos, autenticados ou sensíveis.", "Identify which origins consume the response and whether it contains public, authenticated, or sensitive data.", "Identifica qué orígenes consumen la respuesta y si contiene datos públicos, autenticados o sensibles.")],
    steps: [text("Manter * somente para recursos comprovadamente públicos e sem credenciais.", "Keep * only for resources proven to be public and credential-free.", "Mantén * solo para recursos demostrablemente públicos y sin credenciales."), text("Para respostas restritas, validar Origin contra uma lista explícita no servidor e devolver somente a origem aprovada.", "For restricted responses, validate Origin against an explicit server-side allowlist and return only the approved origin.", "Para respuestas restringidas, valida Origin con una lista explícita en el servidor y devuelve solo el origen aprobado."), text("Adicionar Vary: Origin quando a resposta muda conforme a origem.", "Add Vary: Origin when the response changes by origin.", "Añade Vary: Origin cuando la respuesta cambia según el origen.")],
    validation: [text("Testar uma origem autorizada e outra não autorizada, com e sem credenciais, antes do reteste.", "Test one authorized and one unauthorized origin, with and without credentials, before retesting.", "Prueba un origen autorizado y otro no autorizado, con y sin credenciales, antes de volver a analizar.")],
    rollback: [text("Restaurar temporariamente apenas a origem necessária enquanto a lista é corrigida; não voltar a * para respostas sensíveis.", "Temporarily restore only the required origin while fixing the allowlist; do not return to * for sensitive responses.", "Restaura temporalmente solo el origen necesario mientras corriges la lista; no vuelvas a * para respuestas sensibles.")],
    sourceIds: ["mdnCors"],
  },
  mixed_content: {
    prerequisites: [text("Localizar a referência HTTP observada e confirmar que o recurso possui uma versão HTTPS válida.", "Locate the observed HTTP reference and confirm that the resource has a valid HTTPS version.", "Localiza la referencia HTTP observada y confirma que el recurso tenga una versión HTTPS válida.")],
    steps: [text("Trocar URLs HTTP de scripts, estilos, imagens, formulários e integrações por HTTPS.", "Replace HTTP URLs for scripts, styles, images, forms, and integrations with HTTPS.", "Sustituye las URL HTTP de scripts, estilos, imágenes, formularios e integraciones por HTTPS."), text("Hospedar localmente ou substituir o fornecedor quando o recurso não oferecer HTTPS.", "Host the resource locally or replace the provider when HTTPS is unavailable.", "Aloja el recurso localmente o sustituye al proveedor cuando no ofrezca HTTPS."), text("Usar upgrade-insecure-requests apenas como apoio de migração, não como substituto da correção das URLs.", "Use upgrade-insecure-requests only as migration support, not as a substitute for fixing URLs.", "Usa upgrade-insecure-requests solo como apoyo a la migración, no como sustituto de corregir las URL.")],
    validation: [text("Percorrer páginas importantes, verificar o console do navegador e confirmar que não há solicitações HTTP.", "Exercise important pages, inspect the browser console, and confirm there are no HTTP requests.", "Recorre las páginas importantes, revisa la consola y confirma que no haya solicitudes HTTP.")],
    rollback: [text("Restaurar o recurso anterior somente em ambiente de teste enquanto uma alternativa HTTPS é preparada.", "Restore the previous resource only in a test environment while preparing an HTTPS alternative.", "Restaura el recurso anterior solo en un entorno de prueba mientras preparas una alternativa HTTPS.")],
    sourceIds: ["mdnMixed", "mdnCsp"],
  },
  server_disclosure: {
    prerequisites: [text("Confirmar que monitoramento e suporte não dependem do cabeçalho público com produto ou versão.", "Confirm that monitoring and support do not depend on the public product or version header.", "Confirma que la supervisión y el soporte no dependan del encabezado público con producto o versión.")],
    steps: [text("Desativar o cabeçalho do framework e reduzir tokens de versão no servidor ou proxy.", "Disable the framework header and minimize version tokens at the server or proxy.", "Desactiva el encabezado del framework y reduce los datos de versión en el servidor o proxy."), text("Não criar um cabeçalho falso; remover somente detalhes desnecessários.", "Do not create a deceptive header; remove only unnecessary detail.", "No crees un encabezado falso; elimina solo detalles innecesarios.")],
    validation: [text("Verificar a resposta pública e confirmar que operações, cache e observabilidade continuam funcionando.", "Check the public response and confirm operations, caching, and observability still work.", "Comprueba la respuesta pública y confirma que operaciones, caché y observabilidad sigan funcionando.")],
    rollback: [text("Restaurar apenas o mínimo necessário para uma ferramenta operacional documentada.", "Restore only the minimum needed for a documented operational tool.", "Restaura solo lo mínimo necesario para una herramienta operativa documentada.")],
    sourceIds: ["owaspHeaders"],
  },
};

const HEADER_RECIPES = {
  hsts_missing: ["Strict-Transport-Security", "max-age=300"],
  csp_missing: ["Content-Security-Policy-Report-Only", "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"],
  frame_protection_missing: ["X-Frame-Options", "DENY"],
  nosniff_missing: ["X-Content-Type-Options", "nosniff"],
  referrer_policy_missing: ["Referrer-Policy", "strict-origin-when-cross-origin"],
  permissions_policy_missing: ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
};

function localizedList(items, locale) {
  return (items || []).map((item) => pick(item, locale));
}

function technologyExamples(code, technologyEvidence, locale) {
  const detected = new Set((technologyEvidence || []).filter(({ confidence }) => confidence >= 80).map(({ name }) => name));
  const examples = [];
  const recipe = HEADER_RECIPES[code];

  if (recipe) {
    const [header, value] = recipe;
    examples.push({
      label: pick(text("Resposta HTTP esperada", "Expected HTTP response", "Respuesta HTTP esperada"), locale),
      code: `${header}: ${value}`,
      note: pick(text("Valor inicial. Ajuste somente depois de validar os requisitos do playbook.", "Initial value. Adjust only after validating the playbook requirements.", "Valor inicial. Ajústalo solo después de validar los requisitos del playbook."), locale),
    });
    if (detected.has("Next.js")) examples.push({ label: "Next.js", code: `{ key: "${header}", value: "${value.replaceAll('"', '\\"')}" }`, sourceId: "nextHeaders" });
    if (detected.has("Nginx")) examples.push({ label: "Nginx", code: `add_header ${header} "${value}" always;`, sourceId: "nginxHeaders" });
    if (detected.has("Apache")) examples.push({ label: "Apache", code: `Header always set ${header} "${value}"`, sourceId: "apacheHeaders" });
  }

  if (["cookie_secure_missing", "cookie_httponly_missing", "cookie_samesite_missing"].includes(code) && detected.has("Next.js")) {
    examples.push({
      label: "Next.js",
      code: "const store = await cookies();\nstore.set(\"session\", value, {\n  secure: true,\n  httpOnly: true,\n  sameSite: \"lax\",\n  path: \"/\"\n});",
      note: pick(text("Ajuste o nome, o valor e SameSite ao fluxo real. Execute somente no servidor.", "Adjust the name, value, and SameSite setting to the real flow. Run this on the server only.", "Ajusta el nombre, valor y SameSite al flujo real. Ejecútalo solo en el servidor."), locale),
      sourceId: "nextCookies",
    });
  }

  if (code === "mixed_content") {
    examples.push({ label: "HTML", code: "<!-- antes -->\n<script src=\"http://cdn.example/app.js\"></script>\n\n<!-- depois -->\n<script src=\"https://cdn.example/app.js\"></script>" });
  }

  if (code === "server_disclosure") {
    if (detected.has("Next.js")) examples.push({ label: "Next.js", code: "export default { poweredByHeader: false };", sourceId: "nextPowered" });
    if (detected.has("Nginx")) examples.push({ label: "Nginx", code: "server_tokens off;", sourceId: "nginxTokens" });
    if (detected.has("Apache")) examples.push({ label: "Apache", code: "ServerTokens Prod\nServerSignature Off", sourceId: "apacheTokens" });
  }

  return examples;
}

export function getPlaybook(code, locale = "pt-BR", technologyEvidence = []) {
  const entry = PLAYBOOKS[code];
  if (!entry) return null;
  const examples = technologyExamples(code, technologyEvidence, locale);
  const sourceIds = [...new Set([...entry.sourceIds, ...examples.map(({ sourceId }) => sourceId).filter(Boolean)])];
  const supportedTechnology = (technologyEvidence || [])
    .filter(({ name, confidence }) => confidence >= 80 && ["Next.js", "Nginx", "Apache"].includes(name))
    .sort((a, b) => b.confidence - a.confidence)[0] || null;
  const technology = supportedTechnology?.name || "generic";
  return {
    id: `${code}:${technology.toLowerCase().replaceAll(".", "")}:${locale}:v1`,
    finding: code,
    technology,
    technologyConfidence: supportedTechnology?.confidence || null,
    version: PLAYBOOK_VERSION,
    locale,
    lastReviewedAt: LAST_REVIEWED_AT,
    prerequisites: localizedList(entry.prerequisites, locale),
    steps: localizedList(entry.steps, locale),
    validation: localizedList(entry.validation, locale),
    rollback: localizedList(entry.rollback, locale),
    examples: examples.map(({ sourceId, ...example }) => example),
    sources: sourceIds.map((sourceId) => SOURCES[sourceId]).filter(Boolean),
    retest: { method: "same_passive_check", finding: code },
  };
}

export const playbookCodes = Object.freeze(Object.keys(PLAYBOOKS));
