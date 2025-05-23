/**
 * Rotas relacionadas a assinaturas
 */

const express = require('express');
const router = express.Router();
const { proteger } = require('../middlewares/authMiddleware');
const subscriptionMiddleware = require('../middlewares/unifiedSubscriptionMiddleware');

// Controlador temporário para assinaturas
const assinaturaController = {
  // Obter status da assinatura atual do usuário
  obterStatus: (req, res) => {
    // Se não houver assinatura, retornar status sem assinatura
    if (!req.assinatura && !req.subscription) {
      return res.status(200).json({
        success: true,
        message: 'Informações da assinatura recuperadas com sucesso',
        data: {
          possuiAssinatura: false,
          status: 'sem assinatura',
          instrucoes: 'Para acessar recursos premium, você precisa adquirir uma assinatura.'
        }
      });
    }

    // Usar req.subscription se existir, senão usar req.assinatura
    const assinatura = req.subscription || req.assinatura;

    // Se houver assinatura, retornar seus detalhes
    res.status(200).json({
      success: true,
      message: 'Informações da assinatura recuperadas com sucesso',
      data: {
        possuiAssinatura: true,
        status: assinatura.status,
        plano: assinatura.plano || assinatura.plan_id,
        dataInicio: assinatura.dataInicio || assinatura.startDate,
        validade: assinatura.validade || assinatura.expirationDate,
        renovacaoAutomatica: assinatura.renovacaoAutomatica || assinatura.autoRenew || false,
        diasRestantes: typeof assinatura.diasRestantes === 'function' ? assinatura.diasRestantes() : 
          (assinatura.expirationDate ? Math.ceil((new Date(assinatura.expirationDate) - new Date()) / (1000 * 60 * 60 * 24)) : 0)
      }
    });
  },

  // Listar planos disponíveis
  listarPlanos: (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Planos disponíveis recuperados com sucesso',
      data: {
        planos: [
          {
            id: 'mensal',
            nome: 'Plano Mensal',
            valor: 29.90,
            intervalo: 'mensal',
            descricao: 'Acesso a recursos premium por 1 mês',
            recursos: [
              'Relatórios financeiros avançados',
              'Exportação de dados',
              'Análise de tendências'
            ]
          },
          {
            id: 'trimestral',
            nome: 'Plano Trimestral',
            valor: 79.90,
            intervalo: 'trimestral',
            descricao: 'Acesso a recursos premium por 3 meses',
            recursos: [
              'Relatórios financeiros avançados',
              'Exportação de dados',
              'Análise de tendências',
              'Sugestões de investimento'
            ],
            economia: '11% de desconto em relação ao plano mensal'
          },
          {
            id: 'anual',
            nome: 'Plano Anual',
            valor: 299.90,
            intervalo: 'anual',
            descricao: 'Acesso a recursos premium por 12 meses',
            recursos: [
              'Relatórios financeiros avançados',
              'Exportação de dados',
              'Análise de tendências',
              'Sugestões de investimento',
              'Dados em tempo real',
              'Suporte prioritário'
            ],
            economia: '16% de desconto em relação ao plano mensal'
          }
        ]
      }
    });
  },

  // Simular a assinatura de um plano (para testes)
  assinarPlano: (req, res) => {
    const { plano } = req.body;
    
    if (!plano || !['mensal', 'trimestral', 'anual'].includes(plano)) {
      return res.status(400).json({
        success: false,
        message: 'Plano inválido',
        error: 'O plano fornecido não é válido'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Assinatura realizada com sucesso (simulação)',
      data: {
        plano: plano,
        status: 'ativa',
        dataInicio: new Date(),
        validade: (() => {
          const data = new Date();
          if (plano === 'mensal') data.setMonth(data.getMonth() + 1);
          if (plano === 'trimestral') data.setMonth(data.getMonth() + 3);
          if (plano === 'anual') data.setFullYear(data.getFullYear() + 1);
          return data;
        })(),
        renovacaoAutomatica: true
      }
    });
  },

  // Simular o cancelamento de uma assinatura (para testes)
  cancelarAssinatura: (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Assinatura cancelada com sucesso (simulação)',
      data: {
        status: 'cancelada',
        dataFim: new Date()
      }
    });
  }
};

// Rotas públicas (não requerem autenticação)
router.get('/planos', assinaturaController.listarPlanos);

// Rotas que requerem autenticação
router.get('/status', proteger, assinaturaController.obterStatus);
router.post('/assinar', proteger, assinaturaController.assinarPlano);
router.post('/cancelar', proteger, assinaturaController.cancelarAssinatura);

module.exports = router; 