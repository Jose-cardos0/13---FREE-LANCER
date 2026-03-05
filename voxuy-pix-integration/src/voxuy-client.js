/**
 * Cliente para enviar transações ao webhook da API Voxuy.
 * Documentação: https://intercom.help/voxuy/pt-BR/articles/6965206-api-voxuy
 */

const config = require('./config');

/** Tipos de pagamento (paymentType) */
const PAYMENT_TYPE = {
  GRATUITO: 0,
  BOLETO: 1,
  CARTAO_CREDITO: 2,
  PAYPAL: 3,
  BOLETO_PARCELADO: 4,
  DEPOSITO_BANCARIO: 5,
  DEPOSITO_CONTA: 6,
  PIX: 7,
  CARTEIRA_DIGITAL: 8,
  NENHUM: 99,
};

/** Status do pedido (status) */
const STATUS = {
  PENDENTE: 0,
  PAGAMENTO_APROVADO: 1,
  CANCELADO: 2,
  CHARGEBACK: 3,
  ESTORNADO: 4,
  EM_ANALISE: 5,
  AGUARDANDO_ESTORNO: 6,
  PROCESSANDO_CARTAO: 7,
  PARCIALMENTE_PAGO: 8,
  BLOQUEADO: 9,
  REJEITADO: 10,
  DUPLICADO: 11,
  CARRINHO_ABANDONADO: 80,
  NENHUM: 99,
};

/**
 * Converte valor em reais para centavos (integer).
 * Ex: 69.90 -> 6990
 */
function reaisParaCentavos(valorReais) {
  if (valorReais == null) return null;
  const num = typeof valorReais === 'number' ? valorReais : parseFloat(String(valorReais).replace(',', '.'));
  return Math.round(num * 100);
}

/**
 * Monta o body padrão para a API Voxuy e mescla com os dados da transação.
 * @param {Object} transacao - Dados da transação (cliente, PIX, valores, etc.)
 * @returns {Object} Body no formato esperado pelo webhook
 */
function montarBody(transacao) {
  const {
    id,
    planId,
    value,
    totalValue,
    freight,
    freightType,
    paymentType = PAYMENT_TYPE.PIX,
    status = STATUS.PENDENTE,
    customEvent,
    clientPhoneNumber,
    clientName,
    clientEmail,
    clientDocument,
    clientAddress,
    clientAddressNumber,
    clientAddressComp,
    clientAddressDistrict,
    clientAddressCity,
    clientAddressState,
    clientZipCode,
    pixQrCode,
    pixUrl,
    paymentLine,
    boletoUrl,
    checkoutUrl,
    date,
    metadata,
    agentEmail,
    dontCancelPrevious,
    shipping,
    currentShippingEvent,
    fileUrl,
  } = transacao;

  const valueInt = value != null ? (Number.isInteger(value) ? value : reaisParaCentavos(value)) : null;
  const totalValueInt = totalValue != null ? (Number.isInteger(totalValue) ? totalValue : reaisParaCentavos(totalValue)) : valueInt;
  const freightInt = freight != null ? (Number.isInteger(freight) ? freight : reaisParaCentavos(freight)) : null;

  const body = {
    apiToken: transacao.apiToken || config.apiToken,
    planId: planId || config.planId,
    paymentType: Number(paymentType),
    status: Number(status),
    id: id ?? undefined,
    value: valueInt,
    freight: freightInt,
    freightType: freightType ?? null,
    totalValue: totalValueInt,
    metadata: metadata ?? null,
    customEvent: customEvent ?? config.customEventId ?? undefined,
    date: date ? (typeof date === 'string' ? date : new Date(date).toISOString()) : undefined,
    clientName: clientName ?? null,
    clientEmail: clientEmail ?? null,
    clientPhoneNumber: clientPhoneNumber ?? null,
    clientDocument: clientDocument ?? null,
    clientAddress: clientAddress ?? null,
    clientAddressNumber: clientAddressNumber ?? null,
    clientAddressComp: clientAddressComp ?? null,
    clientAddressDistrict: clientAddressDistrict ?? null,
    clientAddressCity: clientAddressCity ?? null,
    clientAddressState: clientAddressState ?? null,
    clientZipCode: clientZipCode ?? null,
    checkoutUrl: checkoutUrl ?? null,
    paymentLine: paymentLine ?? null,
    boletoUrl: boletoUrl ?? null,
    pixQrCode: pixQrCode ?? null,
    pixUrl: pixUrl ?? null,
    fileUrl: fileUrl ?? null,
    agentEmail: agentEmail ?? undefined,
    dontCancelPrevious: dontCancelPrevious ?? undefined,
    currentShippingEvent: currentShippingEvent ?? undefined,
    shipping: shipping ?? undefined,
  };

  return body;
}

/**
 * Envia uma transação para o webhook da Voxuy.
 * @param {Object} transacao - Dados da transação (ver montarBody)
 * @param {string} [webhookUrl] - URL do webhook (usa config se não informado)
 * @returns {Promise<{ success: boolean, data?: object, error?: string, status?: number }>}
 */
async function enviarTransacao(transacao, webhookUrl = config.webhookUrl) {
  const body = montarBody(transacao);

  if (!body.clientPhoneNumber) {
    return {
      success: false,
      error: 'clientPhoneNumber é obrigatório para envio de mensagens no WhatsApp (formato: +5511999999999)',
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: data.errors || data.title || data.detail || response.statusText,
        data,
      };
    }

    return {
      success: true,
      status: response.status,
      data: data.Success !== undefined ? { Success: data.Success } : data,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Erro ao enviar para a Voxuy',
    };
  }
}

/**
 * Atalho para enviar uma cobrança PIX (pedido pendente) para a Voxuy.
 * Útil quando sua plataforma gera o PIX e você quer disparar o funil no WhatsApp.
 *
 * @param {Object} opts
 * @param {string} opts.clientPhoneNumber - Telefone com DDI, ex: +5511999999999
 * @param {string} [opts.clientName] - Nome do cliente
 * @param {string} [opts.id] - ID único da transação no seu sistema
 * @param {number|string} [opts.value] - Valor em reais (ex: 69.90) ou em centavos (6990)
 * @param {string} [opts.pixQrCode] - Código QR PIX (copia e cola)
 * @param {string} [opts.pixUrl] - URL do PIX para pagamento
 * @param {string} [opts.date] - Data da venda (ISO 8601 UTC)
 * @param {Object} [opts.metadata] - Dados extras para variáveis no funil
 */
async function enviarCobrancaPix(opts) {
  return enviarTransacao({
    ...opts,
    paymentType: PAYMENT_TYPE.PIX,
    status: opts.status != null ? opts.status : STATUS.PENDENTE,
  });
}

module.exports = {
  enviarTransacao,
  enviarCobrancaPix,
  montarBody,
  PAYMENT_TYPE,
  STATUS,
  reaisParaCentavos,
};
