import React, { useEffect, useState } from 'react';
import { fetchRoulettesWithNumbers } from '../integrations/api/rouletteApi';
import GlowingCubeLoader from '@/components/GlowingCubeLoader';
import SimpleAuthTester from '@/components/SimpleAuthTester';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RouletteData {
  id: string;
  nome: string;
  _id?: string;
  name?: string;
  numero?: any[];
  canonicalId?: string;
  estado_estrategia?: string;
  vitorias?: number;
  derrotas?: number;
}

const TestPage: React.FC = () => {
  const [roulettes, setRoulettes] = useState<RouletteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("roletas");

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Buscar as roletas com números incluídos
        console.log('Buscando dados das roletas com números incluídos...');
        const data = await fetchRoulettesWithNumbers(20); // Buscar 20 números por roleta
        
        if (Array.isArray(data)) {
          setRoulettes(data);
          console.log('Dados recebidos com sucesso:', data);
        } else {
          setError('Formato de resposta inválido');
        }
      } catch (err) {
        console.error('Erro ao buscar dados:', err);
        setError('Falha ao carregar dados. Verifique o console para mais detalhes.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  const RouletteTest = () => {
    if (loading) {
      return <div className="flex justify-center items-center h-[50vh]">
        <GlowingCubeLoader />
      </div>;
    }
    
    if (error) {
      return <div className="error">{error}</div>;
    }
    
    return (
      <div>
        <h2 className="text-xl font-semibold mt-6 mb-2">Roletas com Números Incluídos:</h2>
        
        {roulettes.map(roleta => (
          <div key={roleta.id} className="mb-6 border p-4 rounded">
            <h3 className="font-semibold">{roleta.nome || roleta.name}</h3>
            <div className="mb-2">
              <p>ID: {roleta.id}</p>
              <p>ID Canônico: {roleta.canonicalId}</p>
            </div>
            
            <h4 className="text-lg font-medium mb-2">Informações da Roleta:</h4>
            <pre className="bg-gray-100 p-4 rounded overflow-auto mb-4">
              {JSON.stringify({
                id: roleta.id,
                nome: roleta.nome || roleta.name,
                canonicalId: roleta.canonicalId,
                estado_estrategia: roleta.estado_estrategia,
                vitorias: roleta.vitorias,
                derrotas: roleta.derrotas
              }, null, 2)}
            </pre>
            
            <h4 className="text-lg font-medium mb-2">Números da Roleta:</h4>
            <pre className="bg-gray-100 p-4 rounded overflow-auto">
              {JSON.stringify(roleta.numero || [], null, 2)}
            </pre>
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Página de Testes</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 mb-4">
          <TabsTrigger value="roletas">Teste de Roletas</TabsTrigger>
          <TabsTrigger value="auth">Teste de Autenticação JWT</TabsTrigger>
        </TabsList>
        
        <TabsContent value="roletas">
          <RouletteTest />
        </TabsContent>
        
        <TabsContent value="auth">
          <SimpleAuthTester />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TestPage; 