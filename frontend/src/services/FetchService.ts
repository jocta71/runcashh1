/**
 * Serviço para buscar dados em tempo real via polling como fallback
 * quando a conexão WebSocket falha
 */

import EventService from './EventService';
import { RouletteNumberEvent } from './EventService';
import { RequestThrottler } from './utils/requestThrottler';
import { getLogger } from './utils/logger';
import config from '@/config/env';
import { ROLETAS_PERMITIDAS } from '@/config/allowedRoulettes';

const logger = getLogger('FetchService');

// Configurações
const POLLING_INTERVAL = 5000; // 5 segundos entre cada verificação
const MAX_RETRIES = 3; // Número máximo de tentativas antes de desistir
const ALLOWED_ROULETTES = ROLETAS_PERMITIDAS;

// Mapear nomes para IDs canônicos
const NAME_TO_ID_MAP: Record<string, string> = {
  "Immersive Roulette": "2010016",
  "Brazilian Mega Roulette": "2380335",
  "Bucharest Auto-Roulette": "2010065",
  "Speed Auto Roulette": "2010096",
  "Auto-Roulette": "2010017",
  "Auto-Roulette VIP": "2010098"
};

interface FetchOptions extends RequestInit {
  skipCache?: boolean;
  cacheTime?: number;
  throttleKey?: string;
  forceRefresh?: boolean;
}

class FetchService {
  private static instance: FetchService;
  private pollingIntervalId: number | null = null;
  private lastFetchedNumbers: Map<string, { timestamp: number, numbers: number[] }> = new Map();
  private isPolling: boolean = false;
  private apiBaseUrl: string;
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  
  constructor() {
    this.apiBaseUrl = config.apiBaseUrl;
    logger.info('Inicializado com URL base:', this.apiBaseUrl);
  }
  
  public static getInstance(): FetchService {
    if (!FetchService.instance) {
      FetchService.instance = new FetchService();
    }
    return FetchService.instance;
  }
  
  /**
   * Inicia polling regular para buscar dados de roletas
   */
  public startPolling(): void {
    if (this.isPolling) {
      logger.info('Polling já está em execução');
      return;
    }
    
    logger.info('Iniciando polling regular de dados');
    this.isPolling = true;
    
    // Executar imediatamente a primeira vez
    this.fetchAllRouletteData();
    
    // Configurar intervalo para execuções periódicas
    this.pollingIntervalId = window.setInterval(() => {
      this.fetchAllRouletteData();
    }, POLLING_INTERVAL);
  }
  
  /**
   * Para o polling de dados
   */
  public stopPolling(): void {
    if (this.pollingIntervalId !== null) {
      window.clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }
    this.isPolling = false;
    logger.info('Polling parado');
  }
  
  /**
   * Busca dados de todas as roletas permitidas
   */
  private async fetchAllRouletteData(): Promise<void> {
    logger.debug('Buscando dados das roletas...');
    
    try {
      // Primeira etapa: buscar todas as roletas para obter informações básicas
      const roulettes = await this.fetchAllRoulettes();
      
      if (!roulettes || roulettes.length === 0) {
        logger.warn('Nenhuma roleta encontrada');
        return;
      }
      
      logger.debug(`Encontradas ${roulettes.length} roletas`);
      
      // Segunda etapa: para cada roleta, buscar os números mais recentes
      for (const roulette of roulettes) {
        try {
          // Ignorar roletas sem id
          if (!roulette || !roulette.id) continue;
          
          // Buscar números para esta roleta
          const roletaId = this.getCanonicalId(roulette.id, roulette.nome);
          
          // Ignorar os Ids que não estão na lista de permitidos
          if (!ALLOWED_ROULETTES.includes(roletaId)) {
            continue;
          }
          
          logger.debug(`Buscando números para ${roulette.nome || 'Roleta Desconhecida'} (ID: ${roletaId})`);
          
          const numbers = await this.fetchRouletteNumbers(roletaId);
          
          if (numbers && numbers.length > 0) {
            // Verificar se são números que ainda não vimos
            this.processNewNumbers(roulette, numbers);
          }
        } catch (error) {
          logger.error(`Erro ao buscar números para roleta ${roulette?.nome || 'desconhecida'}:`, error);
        }
      }
    } catch (error) {
      logger.error('Erro ao buscar dados das roletas:', error);
    }
  }
  
  /**
   * Busca todas as roletas disponíveis
   */
  private async fetchAllRoulettes(): Promise<any[]> {
    try {
      const response = await this.get<any[]>(`${this.apiBaseUrl}/roulettes`, {
        throttleKey: 'all_roulettes',
        forceRefresh: false
      });
      
      if (response && Array.isArray(response)) {
        return response;
      }
      
      throw new Error(`Resposta inválida ao buscar roletas`);
    } catch (error) {
      logger.error('Erro ao buscar lista de roletas:', error);
      return [];
    }
  }
  
  /**
   * Busca números para uma roleta específica
   */
  private async fetchRouletteNumbers(roletaId: string): Promise<number[]> {
    try {
      // Usar o endpoint único /api/ROULETTES e filtrar a roleta desejada
      try {
        const response = await this.get<any[]>(`${this.apiBaseUrl}/ROULETTES`, {
          throttleKey: 'all_roulettes_data',
          forceRefresh: false
        });
        
        if (response && Array.isArray(response)) {
          // Encontrar a roleta específica pelo ID canônico
          const targetRoulette = response.find((roleta: any) => {
            // Verificar se roleta existe e tem propriedades antes de acessá-las
            if (!roleta) return false;
            
            // Usar valores padrão seguros se as propriedades forem undefined
            const roletaId = roleta.id || '';
            const roletaNome = roleta.nome || '';
            
            const roletaCanonicalId = roleta.canonical_id || 
              this.getCanonicalId(roletaId, roletaNome);
            
            return roletaCanonicalId === roletaId || roleta.id === roletaId;
          });
          
          if (targetRoulette && targetRoulette.numero && Array.isArray(targetRoulette.numero)) {
            // Extrair apenas os números numéricos do array de objetos
            return targetRoulette.numero.map((item: any) => {
              // Verificar se o item é um objeto com propriedade numero
              if (typeof item === 'object' && item !== null && 'numero' in item) {
                if (typeof item.numero === 'number' && !isNaN(item.numero)) {
                  return item.numero;
                } else if (typeof item.numero === 'string' && item.numero.trim() !== '') {
                  const parsedValue = parseInt(item.numero, 10);
                  if (!isNaN(parsedValue)) return parsedValue;
                }
              } 
              // Caso o item seja diretamente um número
              else if (typeof item === 'number' && !isNaN(item)) {
                return item;
              }
              
              // Se chegou aqui, é um valor inválido, retornar 0
              logger.warn(`Valor inválido de número para ${roletaId}: ${JSON.stringify(item)}, usando 0`);
              return 0;
            });
          }
        }
      } catch (error) {
        logger.warn(`Erro no endpoint principal para ${roletaId}, tentando fallback:`, error);
      }
      
      // Se falhar, tentar o endpoint de roletas legado (mais lento)
      const response = await this.get<any>(`${this.apiBaseUrl}/roulettes/${roletaId}`, {
        throttleKey: `roulette_${roletaId}`,
        forceRefresh: false
      });
      
      if (response && response.numeros && Array.isArray(response.numeros)) {
        return response.numeros;
      }
      
      throw new Error(`Resposta inválida ao buscar números para roleta ${roletaId}`);
    } catch (error) {
      logger.error(`Erro ao buscar números para roleta ${roletaId}:`, error);
      return [];
    }
  }
  
  /**
   * Processa números novos, comparando com os últimos recebidos
   */
  private processNewNumbers(roulette: any, numbers: number[]): void {
    // Verificar se temos dados válidos
    if (!roulette || !numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return;
    }
    
    // Garantir que temos um ID e nome válidos
    const roletaId = this.getCanonicalId(roulette.id, roulette.nome);
    const roletaNome = roulette.nome || 'Roleta Desconhecida';
    
    // Verificar se já temos números para esta roleta
    const lastData = this.lastFetchedNumbers.get(roletaId);
    
    if (!lastData) {
      // Primeiro conjunto de números para esta roleta
      logger.info(`Primeiros números obtidos para ${roletaNome}: [${numbers.slice(0, 5).join(', ')}...]`);
      
      this.lastFetchedNumbers.set(roletaId, {
        timestamp: Date.now(),
        numbers: [...numbers]
      });
      
      // Emitir o número mais recente como evento
      const lastNumber = numbers[0];
      if (lastNumber !== undefined && lastNumber !== null) {
        this.emitNumberEvent(roletaId, roletaNome, lastNumber);
      }
      
      return;
    }
    
    // Verificar se temos números novos comparando com os últimos salvos
    const oldNumbers = lastData.numbers || [];
    
    // Verificar se temos números para comparar
    if (oldNumbers.length === 0 || numbers.length === 0) {
      this.lastFetchedNumbers.set(roletaId, {
        timestamp: Date.now(),
        numbers: [...numbers]
      });
      return;
    }
    
    const firstNewNumber = numbers[0];
    const firstOldNumber = oldNumbers[0];
    
    if (firstNewNumber !== firstOldNumber) {
      logger.info(`Novo número detectado para ${roletaNome}: ${firstNewNumber} (anterior: ${firstOldNumber})`);
      
      // Atualizar a lista de números
      this.lastFetchedNumbers.set(roletaId, {
        timestamp: Date.now(),
        numbers: [...numbers]
      });
      
      // Emitir o novo número como evento
      this.emitNumberEvent(roletaId, roletaNome, firstNewNumber);
    } else {
      // Apenas atualizar o timestamp sem emitir evento
      logger.debug(`Nenhum número novo para ${roletaNome}, último: ${firstNewNumber}`);
      this.lastFetchedNumbers.set(roletaId, {
        timestamp: Date.now(),
        numbers: oldNumbers
      });
    }
  }
  
  /**
   * Emite um evento com o novo número para o sistema
   */
  private emitNumberEvent(roletaId: string, roletaNome: string, numero: number): void {
    // Verificar se o número é válido
    if (numero === undefined || numero === null || isNaN(numero)) {
      logger.warn(`Tentativa de emitir número inválido para ${roletaNome}: ${numero}`);
      return;
    }
    
    // Criar o evento
    const event: RouletteNumberEvent = {
      type: 'new_number',
      roleta_id: roletaId || '',
      roleta_nome: roletaNome || 'Roleta Desconhecida',
      numero: numero,
      timestamp: new Date().toISOString(),
      // Adicionar flag para indicar que este evento NÃO deve substituir dados existentes
      preserve_existing: true
    };
    
    logger.info(`Emitindo evento de novo número para ${roletaNome}: ${numero}`);
    
    // Emitir utilizando o EventService
    const eventService = EventService.getInstance();
    
    // Tentar todas as formas possíveis de emitir o evento
    if (typeof eventService.dispatchEvent === 'function') {
      eventService.dispatchEvent(event);
    }
    
    EventService.emitGlobalEvent('new_number', event);
  }
  
  /**
   * Obtém o ID canônico para uma roleta, usando o nome como fallback
   */
  private getCanonicalId(id: string = '', nome?: string): string {
    // Garantir que id seja uma string
    const safeId = id || '';
    
    // Se o ID já é canônico, retorná-lo
    if (ALLOWED_ROULETTES.includes(safeId)) {
      return safeId;
    }
    
    // Tentar mapear pelo nome, verificando se o nome está definido e existe no mapa
    if (nome && typeof nome === 'string' && NAME_TO_ID_MAP[nome]) {
      return NAME_TO_ID_MAP[nome];
    }
    
    // Retornar o ID original como último recurso
    return safeId;
  }
  
  /**
   * Força uma atualização única das roletas
   */
  public forceUpdate(): void {
    logger.info('Forçando atualização imediata das roletas');
    this.fetchAllRouletteData();
  }

  /**
   * Realiza uma requisição GET com controle de taxa
   */
  async get<T>(url: string, options: FetchOptions = {}): Promise<T | null> {
    const throttleKey = options.throttleKey || `GET_${url}`;
    
    return RequestThrottler.scheduleRequest<T>(
      throttleKey,
      async () => {
        const headers = RequestThrottler.getDefaultHeaders(options.headers as Record<string, string> || {});
        
        logger.debug(`Fazendo requisição GET para ${url}`);
        const response = await fetch(url, {
          method: 'GET',
          ...options,
          headers
        });
        
        if (!response.ok) {
          throw new Error(`Erro na requisição: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
      },
      !!options.forceRefresh,
      !!options.skipCache,
      options.cacheTime
    );
  }
  
  /**
   * Realiza uma requisição POST com controle de taxa
   */
  async post<T>(url: string, data: any, options: FetchOptions = {}): Promise<T | null> {
    const throttleKey = options.throttleKey || `POST_${url}`;
    
    return RequestThrottler.scheduleRequest<T>(
      throttleKey,
      async () => {
        const headers = RequestThrottler.getDefaultHeaders({
          'Content-Type': 'application/json',
          ...(options.headers as Record<string, string> || {})
        });
        
        logger.debug(`Fazendo requisição POST para ${url}`);
        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify(data),
          ...options,
          headers
        });
        
        if (!response.ok) {
          throw new Error(`Erro na requisição: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
      },
      !!options.forceRefresh,
      !!options.skipCache,
      options.cacheTime
    );
  }
  
  /**
   * Limpa o cache para uma URL específica
   */
  clearCache(url: string, method: string = 'GET'): void {
    const key = `${method}_${url}`;
    RequestThrottler.clearCache(key);
  }
  
  /**
   * Limpa todo o cache
   */
  clearAllCache(): void {
    RequestThrottler.clearCache();
  }

  /**
   * Obtém dados de uma URL com suporte a retry
   */
  public async fetchData<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const maxRetries = 3;
    const RETRY_INTERVAL = 1000; // Definindo a constante que estava faltando
    
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const response = await fetch(endpoint, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(options?.headers || {})
          }
        });

        if (!response.ok) {
          throw new Error(`Erro na requisição: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Emitir evento sinalizando que os dados foram carregados com sucesso
        EventService.emitGlobalEvent('data_loaded', {
          endpoint,
          success: true,
          timestamp: new Date().toISOString()
        });
        
        return data as T;
      } catch (error) {
        retries++;
        logger.warn(`Erro ao buscar dados de ${endpoint}. Tentativa ${retries}/${maxRetries}: ${error.message}`);
        
        if (retries >= maxRetries) {
          logger.error(`Máximo de tentativas alcançado para ${endpoint}`);
          throw error;
        }
        
        // Aguardar antes da próxima tentativa
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
      }
    }

    throw new Error(`Não foi possível obter dados de ${endpoint} após ${maxRetries} tentativas`);
  }

  /**
   * Processa um objeto de roleta para garantir formato consistente
   */
  private processRouletteData(roulette: any): any {
    // Se não for um objeto válido, retornar como está
    if (!roulette || typeof roulette !== 'object') {
      return roulette;
    }
    
    // Criar uma cópia do objeto para não modificar o original
    const processed = { ...roulette };
    
    // Garantir que temos propriedades padronizadas
    processed.id = processed.id || processed._id || processed.roleta_id;
    processed.nome = processed.nome || processed.name || 'Roleta sem nome';
    
    // Normalizar array de números se existir
    if (processed.numeros && Array.isArray(processed.numeros)) {
      // Converter para números quando são strings
      processed.numeros = processed.numeros.map((n: any) => 
        typeof n === 'string' ? parseInt(n, 10) : n
      );
    }
    
    return processed;
  }

  /**
   * Inicia polling para buscar dados da roleta com intervalo regular
   */
  public startPolling(roletaId: string, callback: (data: any) => void, interval = 5000): void {
    if (this.pollingIntervals.has(roletaId)) {
      logger.debug(`Polling já ativo para roleta ${roletaId}. Reiniciando.`);
      this.stopPolling(roletaId);
    }

    logger.info(`Iniciando polling para roleta ${roletaId} a cada ${interval}ms`);
    
    // Função para buscar dados da roleta
    const fetchRouletteData = async () => {
      try {
        logger.debug(`Buscando dados da roleta ${roletaId} via UnifiedRouletteClient`);
        
        // Importar UnifiedRouletteClient dinamicamente para evitar dependência circular
        const UnifiedRouletteClientModule = await import('./UnifiedRouletteClient');
        const UnifiedRouletteClient = UnifiedRouletteClientModule.default;
        const unifiedClient = UnifiedRouletteClient.getInstance();
        
        // Garantir que o cliente está atualizado
        await unifiedClient.forceUpdate();
        
        // Obter todas as roletas do cliente unificado
        const allRoulettes = unifiedClient.getAllRoulettes();
        
        if (!Array.isArray(allRoulettes) || allRoulettes.length === 0) {
          logger.warn(`Resposta inválida para roleta ${roletaId}: não é um array ou está vazio`);
          return;
        }
        
        // Encontrar a roleta específica
        const roleta = allRoulettes.find(r => r.id === roletaId || r._id === roletaId);
        
        if (roleta) {
          logger.debug(`Dados obtidos para roleta ${roleta.nome || roletaId} via UnifiedRouletteClient`);
          
          // Emitir evento sinalizando que os dados foram carregados com sucesso
          EventService.emitGlobalEvent('roulettes_loaded', {
            success: true,
            count: allRoulettes.length,
            timestamp: new Date().toISOString(),
            source: 'unified_client'
          });
          
          callback(roleta);
        } else {
          logger.warn(`Roleta ${roletaId} não encontrada na resposta`);
        }
      } catch (error) {
        logger.error(`Erro ao buscar dados da roleta ${roletaId}: ${error.message}`);
      }
    };
    
    // Executar imediatamente na primeira vez
    fetchRouletteData();
    
    // Agendar execuções periódicas
    const timerId = setInterval(fetchRouletteData, interval);
    this.pollingIntervals.set(roletaId, timerId);
  }

  /**
   * Para o polling para uma roleta específica
   */
  public stopPolling(roletaId: string): void {
    const timerId = this.pollingIntervals.get(roletaId);
    if (timerId) {
      logger.info(`Parando polling para roleta ${roletaId}`);
      clearInterval(timerId);
      this.pollingIntervals.delete(roletaId);
    }
  }

  async getAllRoulettes() {
    try {
      logger.debug('Buscando todas as roletas disponíveis via UnifiedRouletteClient');
      
      // Importar UnifiedRouletteClient dinamicamente para evitar dependência circular
      const UnifiedRouletteClientModule = await import('./UnifiedRouletteClient');
      const UnifiedRouletteClient = UnifiedRouletteClientModule.default;
      const unifiedClient = UnifiedRouletteClient.getInstance();
      
      // Garantir que o cliente está conectado
      if (!unifiedClient.getStatus().isStreamConnected) {
        unifiedClient.connectStream();
      }
      
      // Obter todas as roletas do cliente unificado
      const allRoulettes = await unifiedClient.forceUpdate();
      
      if (!Array.isArray(allRoulettes)) {
        throw new Error('Resposta inválida: não é um array');
      }
      
      // Processar dados com o transformador de objetos
      const processedData = allRoulettes.map(this.processRouletteData);
      
      logger.info(`✅ Encontradas ${processedData.length} roletas via UnifiedRouletteClient`);
      
      // Emitir evento que os dados de roletas foram carregados completamente
      EventService.emitGlobalEvent('roulettes_loaded', {
        success: true,
        count: processedData.length,
        timestamp: new Date().toISOString(),
        source: 'unified_client'
      });
      
      return processedData;
    } catch (error) {
      logger.error(`Erro ao buscar roletas: ${error.message}`);
      throw error;
    }
  }
}

export default FetchService; 