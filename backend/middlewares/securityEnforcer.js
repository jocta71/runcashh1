/**
 * Middleware para garantir que rotas protegidas apliquem verificação de segurança
 * Este middleware funciona como uma camada adicional de proteção
 */

/**
 * Lista de rotas protegidas que devem verificar assinatura
 * @type {Array<string>}
 */
const SUBSCRIPTION_PROTECTED_ROUTES = [
  '/api/roulettes',
  '/api/ROULETTES',
  '/api/roulettes/historico',
  '/api/ROULETTES/historico',
  '/api/numbers/byid',
  '/api/roletas'
];

/**
 * Lista de prefixos de rota que devem ser protegidos
 * Para capturar variações como /api/ROULETTES7_I.
 * @type {Array<string>}
 */
const PROTECTED_ROUTE_PREFIXES = [
  '/api/roulettes',
  '/api/ROULETTES',
  '/api/roletas'
];

/**
 * Verificar se a rota está na lista de rotas protegidas, ignorando parâmetros de consulta
 * @param {string} path - Caminho da URL
 * @returns {boolean} Verdadeiro se a rota estiver protegida
 */
function isProtectedRoute(path) {
  // Remover parâmetros de consulta para comparar apenas o path
  const pathWithoutQuery = path.split('?')[0];
  
  // Verificar correspondência exata
  if (SUBSCRIPTION_PROTECTED_ROUTES.includes(pathWithoutQuery)) {
    return true;
  }
  
  // Verificar rotas com parâmetros
  for (const route of SUBSCRIPTION_PROTECTED_ROUTES) {
    if (route.endsWith('byid') && pathWithoutQuery.startsWith(route)) {
      return true;
    }
  }
  
  // Verificar prefixos de rota (para capturar variações)
  for (const prefix of PROTECTED_ROUTE_PREFIXES) {
    // Verificar variantes como /api/ROULETTES7_I=...
    if (pathWithoutQuery.startsWith(prefix) && 
        (pathWithoutQuery === prefix || 
         pathWithoutQuery.includes('_I=') || 
         pathWithoutQuery.includes('?_I=') ||
         /\/api\/ROULETTES\d+/.test(pathWithoutQuery) ||
         /\/api\/roulettes\d+/.test(pathWithoutQuery) ||
         /\/api\/roletas\d+/.test(pathWithoutQuery))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Middleware para forçar a verificação de segurança em rotas protegidas
 * @returns {Function} Express middleware
 */
function securityEnforcer() {
  return (req, res, next) => {
    const path = req.originalUrl || req.url || req.path; // Usa URL completa incluindo query string
    const requestId = req.requestId || Math.random().toString(36).substring(2, 15);
    
    // Ignorar requisições OPTIONS
    if (req.method === 'OPTIONS') {
      return next();
    }
    
    // Verificar se é uma rota protegida
    if (isProtectedRoute(path)) {
      console.log(`[SECURITY ${requestId}] Verificando segurança para rota protegida: ${path}`);
      
      // Verificar se a requisição passou pelo middleware de autenticação
      if (!req.hasOwnProperty('usuario')) {
        console.log(`[SECURITY ${requestId}] ALERTA! Rota protegida não passou pelo middleware de autenticação: ${path}`);
        return res.status(401).json({
          success: false,
          message: 'Acesso negado - Autenticação necessária',
          code: 'SECURITY_ENFORCER',
          path: path,
          requestId: requestId
        });
      }
      
      // Verificar se a assinatura foi validada
      if (!req.hasOwnProperty('subscription')) {
        console.log(`[SECURITY ${requestId}] ALERTA! Rota protegida não verificou assinatura: ${path}`);
        return res.status(403).json({
          success: false,
          message: 'Acesso negado - Assinatura necessária',
          code: 'SECURITY_ENFORCER',
          path: path,
          requestId: requestId
        });
      }
      
      // Verificar se tem uma assinatura válida
      if (!req.subscription) {
        console.log(`[SECURITY ${requestId}] BLOQUEIO! Acesso sem assinatura a rota protegida: ${path}`);
        return res.status(403).json({
          success: false,
          message: 'Você precisa de uma assinatura ativa para acessar este recurso',
          code: 'SUBSCRIPTION_REQUIRED',
          path: path,
          requestId: requestId
        });
      }
      
      console.log(`[SECURITY ${requestId}] Segurança verificada para rota ${path}`);
    }
    
    // Continuar para o próximo middleware
    next();
  };
}

module.exports = securityEnforcer; 