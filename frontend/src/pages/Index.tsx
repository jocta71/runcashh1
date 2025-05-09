import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, PackageOpen, Loader2, Copy, RefreshCw } from 'lucide-react';
import RouletteCard from '@/components/RouletteCard';
import Layout from '@/components/Layout';
import { RouletteRepository } from '../services/data/rouletteRepository';
import { RouletteData } from '@/types';
import EventService, { RouletteNumberEvent, StrategyUpdateEvent } from '@/services/EventService';
import { RequestThrottler } from '@/services/utils/requestThrottler';
import RouletteSidePanelStats from '@/components/RouletteSidePanelStats';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { 
  createAsaasCustomer, 
  createAsaasSubscription, 
  getAsaasPixQrCode, 
  findAsaasPayment, 
  checkPaymentStatus,
  SubscriptionResponse
} from '@/integrations/asaas/client';
import { useSubscription } from '@/context/SubscriptionContext';
import SubscriptionRequired from '@/components/SubscriptionRequired';
import { useDataLoading } from '@/App';



interface ChatMessage {
  id: string;
  user: {
    name: string;
    avatar?: string;
    role?: string;
    isAdmin?: boolean;
    isModerator?: boolean;
  };
  message: string;
  timestamp: Date;
}


// Adicionar área do código para persistência de roletas
interface KnownRoulette {
  id: string;
  nome: string;
  ultima_atualizacao: string;
}

// Adicionar o estilo CSS inline para o componente radio
const radioInputStyles = `
.radio-input input {
  display: none;
}

.radio-input label {
  --border-color: #a1b0d8;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  min-width: 5rem;
  margin: 1rem;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  position: relative;
  align-items: center;
  background-color: #191a1f;
}

.radio-input input:checked + label {
  --border-color: #00FF00;
  border-color: var(--border-color);
  border-width: 2px;
}

.radio-input label:hover {
  --border-color: #00FF00;
  border-color: var(--border-color);
}

.radio-input {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-direction: column;
  width: 100%;
  margin-bottom: 1.5rem;
}

.circle {
  display: inline-block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: #2a2a35;
  margin-right: 0.5rem;
  position: relative;
}

.radio-input input:checked + label span.circle::before {
  content: "";
  display: inline;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: #00FF00;
  width: 15px;
  height: 15px;
  border-radius: 50%;
}

.text {
  display: flex;
  align-items: center;
  color: white;
}

.price {
  display: flex;
  flex-direction: column;
  text-align: right;
  font-weight: bold;
  color: white;
}

.small {
  font-size: 10px;
  color: #a0a0a7;
  font-weight: 100;
}

.info {
  position: absolute;
  display: inline-block;
  font-size: 11px;
  background-color: #00FF00;
  border-radius: 20px;
  padding: 1px 9px;
  top: 0;
  transform: translateY(-50%);
  right: 5px;
  color: black;
  font-weight: bold;
}
`;

// Função para formatar CPF
const formatCPF = (value: string) => {
  // Remove todos os caracteres não numéricos
  const cleanValue = value.replace(/\D/g, '');
  
  // Aplica a máscara do CPF: XXX.XXX.XXX-XX
  if (cleanValue.length <= 3) {
    return cleanValue;
  } else if (cleanValue.length <= 6) {
    return `${cleanValue.slice(0, 3)}.${cleanValue.slice(3)}`;
  } else if (cleanValue.length <= 9) {
    return `${cleanValue.slice(0, 3)}.${cleanValue.slice(3, 6)}.${cleanValue.slice(6)}`;
  } else {
    return `${cleanValue.slice(0, 3)}.${cleanValue.slice(3, 6)}.${cleanValue.slice(6, 9)}-${cleanValue.slice(9, 11)}`;
  }
};

// Função para formatar telefone
const formatPhone = (value: string) => {
  // Remove todos os caracteres não numéricos
  const cleanValue = value.replace(/\D/g, '');
  
  if (cleanValue.length <= 2) {
    return cleanValue;
  } else if (cleanValue.length <= 7) {
    return `(${cleanValue.slice(0, 2)}) ${cleanValue.slice(2)}`;
  } else {
    return `(${cleanValue.slice(0, 2)}) ${cleanValue.slice(2, 7)}-${cleanValue.slice(7, 11)}`;
  }
};

const Index = () => {
  // Obter os dados pré-carregados do contexto
  const { isDataLoaded, rouletteData, error: dataLoadingError, forceReconnect } = useDataLoading();
  
  // Estado local
  const [error, setError] = useState<string | null>(dataLoadingError);
  const [isLoading, setIsLoading] = useState(!isDataLoaded);
  const [roulettes, setRoulettes] = useState<RouletteData[]>(rouletteData || []);
  const [knownRoulettes, setKnownRoulettes] = useState<RouletteData[]>([]);
  const [dataFullyLoaded, setDataFullyLoaded] = useState<boolean>(isDataLoaded);
  const [loadingCards, setLoadingCards] = useState<boolean>(true);
  const [selectedRoulette, setSelectedRoulette] = useState<RouletteData | null>(null);
  const [historicalNumbers, setHistoricalNumbers] = useState<number[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 24;
  
  // Novos estados para o checkout
  const [showCheckout, setShowCheckout] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  
  // Estados para o formulário de pagamento
  const [checkoutStep, setCheckoutStep] = useState<'form' | 'pix'>('form');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    cpf: '',
    phone: ''
  });
  
  // Estados para o QR code PIX
  const [pixLoading, setPixLoading] = useState(false);
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [qrCodeText, setQrCodeText] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [checkStatusInterval, setCheckStatusInterval] = useState<NodeJS.Timeout | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();
  const { currentSubscription, currentPlan } = useSubscription();
  const hasActivePlan = useMemo(() => {
    return currentSubscription?.status?.toLowerCase() === 'active' || 
           currentSubscription?.status?.toLowerCase() === 'ativo';
  }, [currentSubscription]);
  
  // Referência para controlar se o componente está montado
  const isMounted = useRef(true);

  // Referência para timeout de atualização
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const navigate = useNavigate();
  
  // Escutar eventos de roletas existentes para persistência
  useEffect(() => {
    const handleRouletteExists = (event: RouletteNumberEvent | StrategyUpdateEvent) => {
      if (!event || !event.roleta_id) {
        console.log('[Index] Evento roleta_exists recebido sem ID válido:', event);
        return;
      }
      
      console.log(`[Index] Evento roleta_exists recebido para: ${event.roleta_nome} (ID: ${event.roleta_id})`);
      
      const rouletteData: RouletteData = {
        id: event.roleta_id,
        nome: event.roleta_nome,
        name: event.roleta_nome,
        numeros: [],
        lastNumbers: []
      };
      
      setKnownRoulettes(prev => {
        const updated = [...prev, rouletteData];
        console.log(`[Index] Atualizado registro de roletas conhecidas. Total: ${updated.length}`);
        return updated;
      });
    };
    
    // Registrar o listener de evento diretamente (sem usar addGlobalListener que pode não estar registrado corretamente)
    EventService.getInstance().subscribe('roleta_exists', handleRouletteExists);
    
    console.log('[Index] Listener para evento roleta_exists registrado');
    
    return () => {
      // Remover o listener ao desmontar o componente
      EventService.getInstance().unsubscribe('roleta_exists', handleRouletteExists);
      console.log('[Index] Listener para evento roleta_exists removido');
    };
  }, []);
  
  // Escutar eventos de carregamento de dados históricos
  useEffect(() => {
    // Handler para evento de dados históricos carregados
    const handleHistoricalDataLoaded = (event: RouletteNumberEvent | StrategyUpdateEvent) => {
      const data = event as unknown as { success: boolean; count?: number };
      console.log('[Index] Evento historical_data_loaded recebido:', data);
      if (data && data.success) {
        console.log(`[Index] Dados históricos carregados com sucesso para ${data.count || 0} roletas`);
        setDataFullyLoaded(true);
      }
    };
    
    // Handler para evento de dados reais carregados
    const handleRealDataLoaded = () => {
      console.log('[Index] Evento Dados reais carregados recebido');
      setDataFullyLoaded(true);
      setIsLoading(false);
    };
    
    // Registrar listeners
    EventService.getInstance().subscribe('historical_data_loaded', handleHistoricalDataLoaded);
    EventService.getInstance().subscribe('roulettes_loaded', handleRealDataLoaded);
    
    console.log('[Index] Listeners para eventos de carregamento registrados');
    
    return () => {
      // Remover listeners ao desmontar
      EventService.getInstance().unsubscribe('historical_data_loaded', handleHistoricalDataLoaded);
      EventService.getInstance().unsubscribe('roulettes_loaded', handleRealDataLoaded);
      console.log('[Index] Listeners para eventos de carregamento removidos');
    };
  }, []);
  
  // Função para mesclar roletas da API com roletas conhecidas
  const mergeRoulettes = useCallback((apiRoulettes: RouletteData[], knownRoulettes: RouletteData[]): RouletteData[] => {
    const merged: Record<string, RouletteData> = {};
    
    // Primeiro, adicionar todas as roletas da API
    apiRoulettes.forEach(roulette => {
      merged[roulette.id] = roulette;
    });
    
    // Depois, adicionar ou atualizar com roletas conhecidas
    knownRoulettes.forEach(known => {
      // Se a roleta já existe na lista da API, não precisamos fazer nada
      if (merged[known.id]) {
        console.log(`[Index] Roleta já existe na API: ${known.nome} (ID: ${known.id})`);
        return;
      }
      
      console.log(`[Index] Adicionando roleta conhecida ausente na API: ${known.nome} (ID: ${known.id})`);
      
      // Criar uma roleta a partir da roleta conhecida
      merged[known.id] = {
        id: known.id,
        nome: known.name,
        name: known.name,
        numeros: [],
        lastNumbers: [],
        estado_estrategia: '',
        vitorias: 0,
        derrotas: 0
      };
    });
    
    const result = Object.values(merged);
    console.log(`[Index] Total após mesclagem: ${result.length} roletas (API: ${apiRoulettes.length}, Conhecidas: ${knownRoulettes.length})`);
    
    return result;
  }, []);
  
  // Efeito para atualizar selectedRoulette quando roulettes for carregado ou alterado
  useEffect(() => {
    // Se já temos roletas carregadas e nenhuma roleta está selecionada, selecione a primeira
    if (roulettes.length > 0 && !selectedRoulette && !isLoading) {
      console.log('[Index] Selecionando uma roleta automaticamente');
      
      // Tentar encontrar uma roleta que tenha números/dados
      const roletaComDados = roulettes.find(roleta => {
        const temNumeros = (
          (Array.isArray(roleta.numero) && roleta.numero.length > 0) || 
          (Array.isArray(roleta.lastNumbers) && roleta.lastNumbers.length > 0) ||
          (Array.isArray(roleta.numeros) && roleta.numeros.length > 0)
        );
        return temNumeros;
      });
      
      // Se encontrou uma roleta com dados, selecione-a, caso contrário use a primeira
      setSelectedRoulette(roletaComDados || roulettes[0]);
    }
  }, [roulettes, selectedRoulette, isLoading]);
  
  // Função para carregar dados da API de forma centralizada
  const loadRouletteData = useCallback(async () => {
    if (!isMounted.current) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Usar o throttler para evitar múltiplas chamadas simultâneas
      const result = await RequestThrottler.scheduleRequest(
        'index_roulettes',
        async () => {
          console.log('📊 Buscando roletas disponíveis...');
          const response = await RouletteRepository.fetchAllRoulettesWithNumbers();
          console.log(`✅ ${response.length} roletas encontradas`);
          return response;
        }
      );
      
      if (result && Array.isArray(result)) {
        // Mesclar com roletas conhecidas
        const merged = mergeRoulettes(result, knownRoulettes);
        setRoulettes(merged);
        
        // Atualizar roletas conhecidas se tivermos novos dados
        if (result.length > 0) {
          setKnownRoulettes(prev => mergeRoulettes(prev, result));
        }
        
        // Definir que os dados foram totalmente carregados
        setDataFullyLoaded(true);
      } else {
        // Se falhar, usar roletas conhecidas
        if (knownRoulettes.length > 0) {
          console.log('⚠️ Usando roletas conhecidas como fallback');
          setRoulettes(knownRoulettes);
          setDataFullyLoaded(true);
        } else {
          setError('Não foi possível carregar as roletas disponíveis.');
        }
      }
    } catch (err: Error | unknown) {
      console.error('❌ Erro ao buscar roletas:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(`Erro ao buscar roletas: ${errorMessage}`);
      
      // Fallback para roletas conhecidas
      if (knownRoulettes.length > 0) {
        setRoulettes(knownRoulettes);
        setDataFullyLoaded(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [knownRoulettes, mergeRoulettes]);

  // Efeito para inicialização e atualização periódica
  useEffect(() => {
    // Agendar atualizações periódicas
    const scheduleUpdate = () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      
      updateTimeoutRef.current = setTimeout(() => {
        // Recarregar dados
        loadRouletteData();
      }, 60000); // A cada 60 segundos
    };
    
    // Inicialização
    loadRouletteData();
    
    // Timeout de segurança para garantir que a tela será liberada
    const safetyTimeout = setTimeout(() => {
      if (!dataFullyLoaded && isMounted.current) {
        console.log('[Index] 🔄 Liberando tela após timeout de segurança');
        setDataFullyLoaded(true);
        setIsLoading(false);
      }
    }, 10000); // 10 segundos
    
    // Programar atualização periódica
    const updateInterval = setInterval(() => {
        if (isMounted.current) {
          scheduleUpdate();
        }
    }, 60000); // 60 segundos
    
    // Limpeza ao desmontar
    return () => {
      isMounted.current = false;
      clearTimeout(safetyTimeout);
      clearInterval(updateInterval);
      
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [loadRouletteData, dataFullyLoaded, mergeRoulettes]);
  
  const topRoulettes = useMemo(() => {
    return [...roulettes].sort((a, b) => {
      const aWinRate = a.vitorias / (a.vitorias + a.derrotas) * 100 || 0;
      const bWinRate = b.vitorias / (b.vitorias + b.derrotas) * 100 || 0;
      return bWinRate - aWinRate;
    }).slice(0, 3);
  }, [roulettes]);

  // Renderiza skeletons para os cards de roleta
  const renderRouletteSkeletons = () => {
    return Array(12).fill(0).map((_, index) => (
      <div key={index} className="relative overflow-visible transition-all duration-300 backdrop-filter bg-opacity-40 bg-[#131614] border border-gray-800/30 rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center">
            <div className="h-6 w-36 bg-gray-800 rounded animate-pulse"></div>
          </div>
          <div className="h-5 w-16 bg-gray-800 rounded-full animate-pulse"></div>
        </div>
        
        <div className="flex flex-wrap gap-1 justify-center my-5 p-3 rounded-xl border border-gray-700/20 bg-[#131111]">
          {[...Array(8)].map((_, idx) => (
            <div 
              key={idx} 
              className="w-6 h-6 rounded-full bg-gray-800 animate-pulse"
            ></div>
          ))}
        </div>
      </div>
    ));
  };
  
  // Função para renderizar os cards de roleta
  const renderRouletteCards = () => {
    if (!Array.isArray(roulettes) || roulettes.length === 0) {
      console.log('[DEBUG] Não há roletas para renderizar. Array vazio ou inválido:', roulettes);
      return null;
    }
    
    return roulettes.map(roulette => {
      return (
        <div 
          key={roulette.id} 
          className={`cursor-pointer transition-all rounded-xl ${selectedRoulette?.id === roulette.id ? 'border-2 border-green-500 shadow-lg shadow-green-500/20' : 'p-0.5'}`}
          onClick={() => setSelectedRoulette(roulette)}
        >
          <RouletteCard data={roulette} />
        </div>
      );
    });
  };
  
  // Função para renderizar a paginação
  const renderPagination = () => {
    if (!Array.isArray(roulettes) || roulettes.length === 0) {
      return null;
    }
    
    const totalPages = Math.ceil(roulettes.length / itemsPerPage);
    
    return (
      <div className="flex justify-center mt-8 gap-2 mb-8 bg-gray-800 p-3 rounded-lg shadow-lg">
        <button 
          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
          className={`px-4 py-2 rounded-md ${currentPage === 1 ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
        >
          Anterior
        </button>
        
        <div className="flex items-center bg-gray-700 rounded-md px-4">
          <span className="text-white font-bold">Página {currentPage} de {totalPages || 1}</span>
        </div>
        
        <button 
          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages || 1))}
          disabled={currentPage === totalPages}
          className={`px-4 py-2 rounded-md ${currentPage === totalPages ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
        >
          Próxima
        </button>
      </div>
    );
  };

  // Atualizar dados do formulário quando o usuário mudar
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.username || prev.name,
        email: user.email || prev.email
      }));
    }
  }, [user]);
  
  // Função para processar o pagamento via Asaas
  const handlePayment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    try {
      if (!user) {
        toast({
          title: "Erro",
          description: "Usuário não autenticado!",
          variant: "destructive"
        });
        return;
      }
      
      setPixLoading(true);
      setPaymentError(null);

      // Criar ou buscar cliente no Asaas
      const customerData = {
        name: formData.name || user.username || 'Cliente',
        email: formData.email || user.email,
        cpfCnpj: formData.cpf || '',
        mobilePhone: formData.phone || '',
        userId: user.id
      };
      
      const customerId = await createAsaasCustomer(customerData);
      
      if (!customerId) {
        setPaymentError('Erro ao criar cliente no Asaas');
        setPixLoading(false);
        return;
      }

      // Criar assinatura ou pagamento único
      const planId = "basic"; // Plano fixo
      const userId = user.id;
      const paymentMethod = 'PIX';

      const subscription = await createAsaasSubscription(
        planId,
        userId,
        customerId,
        paymentMethod
      );
      
      if (!subscription || !subscription.paymentId) {
        setPaymentError('Erro ao criar assinatura');
        setPixLoading(false);
        return;
      }

      // Obter QR code PIX
      const pixData = await getAsaasPixQrCode(subscription.paymentId);
      
      if (!pixData) {
        setPaymentError('Erro ao gerar QR code PIX');
        setPixLoading(false);
        return;
      }

      // Atualizar estados com os dados do pagamento
      setQrCodeImage(pixData.qrCodeImage);
      setQrCodeText(pixData.qrCodeText);
      setPaymentId(subscription.paymentId);
      setCheckoutStep('pix');
      
      // Iniciar verificação periódica do status do pagamento
      const stopChecking = checkPaymentStatus(
        subscription.paymentId,
        (payment) => {
          // Pagamento confirmado com sucesso
          if (checkStatusInterval) {
            clearInterval(checkStatusInterval);
            setCheckStatusInterval(null);
          }
          
          setPaymentSuccess(true);
          setShowCheckout(false);
          setIsPaymentModalOpen(false);
          
          toast({
            title: "Pagamento confirmado!",
            description: "Seu pagamento foi confirmado com sucesso."
          });
          
          // Redirecionar para a página de dashboard
          navigate('/dashboard');
        },
        (error) => {
          // Erro ao verificar pagamento
          console.error('Erro ao verificar status:', error);
          toast({
            title: "Erro na verificação",
            description: error.message || "Erro ao verificar pagamento",
            variant: "destructive"
          });
        }
      );
      
      setPixLoading(false);
    } catch (error) {
      console.error('Erro ao processar pagamento:', error);
      setPaymentError(typeof error === 'string' ? error : 'Erro ao processar pagamento');
      setPixLoading(false);
    }
  };

  // Função para verificar manualmente o status do pagamento
  const checkPaymentStatusManually = async (id: string | null) => {
    if (!id) return;
    
    try {
      setVerifyingPayment(true);
      const payment = await findAsaasPayment(id, true); // Forçar atualização
      
      if (['CONFIRMED', 'RECEIVED', 'AVAILABLE', 'BILLING_AVAILABLE'].includes(payment.status)) {
        // Pagamento confirmado
        if (checkStatusInterval) {
          clearInterval(checkStatusInterval);
          setCheckStatusInterval(null);
        }
        
        setPaymentSuccess(true);
        setShowCheckout(false);
        
        toast({
          title: "Pagamento confirmado!",
          description: "Seu pagamento foi confirmado com sucesso."
        });
        
        // Redirecionar para a página de dashboard
        navigate('/dashboard');
      } else {
        toast({
          title: "Verificação de pagamento",
          description: "Ainda não identificamos seu pagamento. Por favor, aguarde ou tente novamente em alguns instantes."
        });
      }
      setVerifyingPayment(false);
    } catch (error) {
      console.error('Erro ao verificar status do pagamento:', error);
      toast({
        title: "Erro",
        description: "Erro ao verificar pagamento",
        variant: "destructive"
      });
      setVerifyingPayment(false);
    }
  };

  // Função para copiar o código PIX
  const copyPIXCode = () => {
    if (qrCodeText && toast) {
      navigator.clipboard.writeText(qrCodeText)
        .then(() => {
          toast({
            title: "Código copiado!",
            description: "O código PIX foi copiado para a área de transferência.",
          });
        })
        .catch(err => {
          console.error('Erro ao copiar código:', err);
        });
    }
  };

  // Limpar intervalos quando o componente for desmontado
  useEffect(() => {
    return () => {
      if (checkStatusInterval) {
        clearInterval(checkStatusInterval);
      }
    };
  }, [checkStatusInterval]);

  // Handler para mudanças no formulário
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'cpf') {
      setFormData(prev => ({ ...prev, [name]: formatCPF(value) }));
    } else if (name === 'phone') {
      setFormData(prev => ({ ...prev, [name]: formatPhone(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Usar os dados pré-carregados do contexto se disponíveis
  useEffect(() => {
    if (rouletteData && rouletteData.length > 0) {
      console.log(`[Index] Usando ${rouletteData.length} roletas do contexto global`);
      
      // Transformar os dados para o formato esperado pelos cards
      const formattedData = rouletteData.map(roleta => {
        // Extrair números com segurança
        let safeNumbers: number[] = [];
        
        // Verificar se tem dados em roleta.numero (prioridade 1)
        if (Array.isArray(roleta.numero) && roleta.numero.length > 0) {
          safeNumbers = roleta.numero
            .filter(item => item !== null && item !== undefined)
            .map(item => {
              // Se for um objeto com propriedade numero (formato {numero: 12})
              if (typeof item === 'object' && item !== null && 'numero' in item) {
                return Number(item.numero);
              }
              // Se for número diretamente
              return Number(item);
            })
            .filter(num => !isNaN(num)); // Filtrar apenas números válidos
        } 
        // Verificar se tem dados em roleta.lastNumbers (prioridade 2)
        else if (Array.isArray(roleta.lastNumbers) && roleta.lastNumbers.length > 0) {
          safeNumbers = roleta.lastNumbers
            .filter(n => n !== null && n !== undefined)
            .map(Number)
            .filter(num => !isNaN(num));
        } 
        // Verificar se tem dados em roleta.numeros (prioridade 3)
        else if (Array.isArray(roleta.numeros) && roleta.numeros.length > 0) {
          safeNumbers = roleta.numeros
            .filter(n => n !== null && n !== undefined)
            .map(Number)
            .filter(num => !isNaN(num));
        }
        
        // Criar objeto padronizado
        return {
          id: roleta.id || roleta._id || '',
          _id: roleta._id || roleta.id || '',
          nome: roleta.nome || roleta.name || 'Roleta sem nome',
          name: roleta.nome || roleta.name || 'Roleta sem nome',
          numeros: safeNumbers,
          lastNumbers: safeNumbers,
          numero: Array.isArray(roleta.numero) ? roleta.numero : [],
          vitorias: typeof roleta.vitorias === 'number' ? roleta.vitorias : 0,
          derrotas: typeof roleta.derrotas === 'number' ? roleta.derrotas : 0,
          estado_estrategia: roleta.estado_estrategia || '',
          online: true
        };
      });
      
      setRoulettes(formattedData);
      setIsLoading(false);
      setLoadingCards(false);
      setDataFullyLoaded(true);
    } else if (dataLoadingError) {
      setError(dataLoadingError);
      setIsLoading(false);
    }
  }, [isDataLoaded, rouletteData, dataLoadingError]);

  // Função de reconexão manual
  const handleManualReconnect = () => {
    setLoadingCards(true);
    forceReconnect();
    // Dar um tempo para mostrar o indicador de carregamento
    setTimeout(() => setLoadingCards(false), 3000);
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 pt-4 md:pt-8 min-h-[80vh] relative">
        {/* Mensagem de erro */}
        {error && (
          <div className="bg-red-900/30 border border-red-500 p-4 mb-6 rounded-lg flex items-center z-50 relative">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            <p className="text-red-100">{error}</p>
          </div>
        )}
        
        {/* Reset de estilo para evitar conflitos */}
        <style>{radioInputStyles}</style>
        
        {/* Resto do conteúdo... */}
        <div className="relative">
          {/* Layout principal */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Cards de roleta à esquerda */}
            <div className="w-full lg:w-1/2">
              <div className="mb-4 p-4 bg-[#131614] rounded-lg border border-gray-800/30">
                <div className="flex justify-between items-center">
                  <div className="text-white font-bold">
                    Roletas Disponíveis
                  </div>
                  <div className="flex items-center gap-3">
                    {loadingCards && (
                      <div className="text-xs bg-yellow-600/20 px-2 py-1 rounded-full text-yellow-400 flex items-center">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Atualizando...
                      </div>
                    )}
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs flex items-center gap-1 bg-gray-800 border-gray-700 hover:bg-gray-700"
                      onClick={handleManualReconnect}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Reconectar
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoading ? renderRouletteSkeletons() : renderRouletteCards()}
              </div>
            </div>
            
            {/* Painel lateral */}
            <div className="w-full lg:w-1/2">
              {selectedRoulette ? (
                <RouletteSidePanelStats
                  roletaId={selectedRoulette.id || ''}
                  roletaNome={selectedRoulette.nome || selectedRoulette.name || 'Roleta'}
                  lastNumbers={Array.isArray(selectedRoulette.lastNumbers) ? selectedRoulette.lastNumbers : []}
                  wins={typeof selectedRoulette.vitorias === 'number' ? selectedRoulette.vitorias : 0}
                  losses={typeof selectedRoulette.derrotas === 'number' ? selectedRoulette.derrotas : 0}
                  providers={[]} // Se houver uma lista de provedores disponível, passe aqui
                />
              ) : isLoading ? (
                <div className="bg-[#131614] rounded-lg border border-gray-800/30 p-8 flex flex-col items-center justify-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-4 border-muted border-t-[hsl(142.1,70.6%,45.3%)] mb-4"></div>
                  <p className="text-gray-400">Carregando estatísticas...</p>
                </div>
              ) : (
                <div className="bg-[#131614] rounded-lg border border-gray-800/30 p-4 flex items-center justify-center h-48">
                  <p className="text-gray-400">Selecione uma roleta para ver suas estatísticas</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Index;