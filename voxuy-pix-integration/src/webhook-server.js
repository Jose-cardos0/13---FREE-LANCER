/**
 * Servidor de webhook: recebe chamadas da sua plataforma de pagamento
 * e encaminha os dados para o webhook da Voxuy no formato esperado.
 *
 * Plataforma: Paradise (paradisepags.com)
 * Documentação Paradise: multi.paradisepags.com → Configurações e API
 *
 * Inicie com: npm start
 * Porta padrão: 3000 (use PORT no .env para alterar)
 */

require('dotenv').config();
const express = require('express');
const config = require('./config');
const { enviarTransacao, STATUS } = require('./voxuy-client');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/**
 * Mapeia payload da Paradise para o formato Voxuy.
 * Baseado na documentação: customer (name, email, document, phone), reference, amount (centavos),
 * e no postback/webhook: transaction_id, reference, status/action, etc.
 * Ref: https://pt.scribd.com/document/973845116/Documentacao-Da-API-Paradise
 */
function mapearParadiseParaVoxuy(payload) {
  const customer = payload.customer || {};
  const phone = normalizarTelefone(
    payload.phone ?? payload.customer_phone ?? payload.telephone ?? customer.phone ?? customer.cell_phone ?? customer.telephone ?? payload.clientPhoneNumber
  );
  const amount = payload.amount ?? payload.amount_cents ?? payload.value ?? payload.order_value ?? payload.total;
  const statusParadise = (payload.raw_status ?? payload.action ?? payload.status ?? '').toUpperCase();

  let statusVoxuy = 99;
  const statusNum = payload.status != null ? Number(payload.status) : NaN;
  if (Number.isFinite(statusNum)) {
    statusVoxuy = statusNum;
  } else if (statusParadise === 'APPROVED' || statusParadise === 'PAID' || statusParadise === 'APROVADO') {
    statusVoxuy = STATUS.PAGAMENTO_APROVADO;
  } else if (statusParadise === 'DENIED' || statusParadise === 'CANCELLED' || statusParadise === 'CANCELADO') {
    statusVoxuy = STATUS.CANCELADO;
  } else if (statusParadise === 'PENDING') {
    statusVoxuy = 99;
  }

  return {
    id: payload.store_reference ?? payload.reference ?? payload.id ?? payload.transaction_id ?? payload.transactionId,
    clientPhoneNumber: phone,
    clientName: payload.name ?? customer.name ?? payload.customer_name ?? payload.clientName,
    clientEmail: payload.email ?? customer.email ?? payload.customer_email ?? payload.clientEmail,
    clientDocument: payload.document ?? customer.document ?? payload.clientDocument,
    value: amount,
    totalValue: payload.totalValue ?? payload.total ?? payload.amount ?? amount,
    pixQrCode: payload.pix_code ?? payload.pixQrCode ?? payload.qr_code ?? payload.qrCode ?? payload.copiaECola ?? payload.pix?.qrCode ?? payload.pix_copy_paste,
    pixUrl: payload.pix_url ?? payload.pixUrl ?? payload.pixLink ?? payload.link ?? payload.pix?.url ?? payload.payment_url,
    status: statusVoxuy,
    paymentType: 99,
    customEvent: config.customEventId ?? undefined,
    date: payload.timestamp ?? payload.date ?? payload.created_at ?? payload.createdAt ?? payload.dataCriacao ?? new Date().toISOString(),
    metadata: (() => {
      const base = payload.metadata ?? payload.meta ?? {};
      const extra = {};
      if (payload.product?.name) extra.produto_paradise = payload.product.name;
      if (payload.product?.hash) extra.produto_paradise_codigo = payload.product.hash;
      if (payload.tracking?.product_hash) extra.product_hash = payload.tracking.product_hash;
      return Object.keys(extra).length ? { ...base, ...extra } : base;
    })(),
  };
}

/**
 * Mapeia um payload genérico da sua plataforma de pagamento para o formato Voxuy.
 * Ajuste os nomes dos campos conforme a API da sua plataforma.
 */
function mapearParaVoxuy(payload) {
  return {
    id: payload.id || payload.transactionId || payload.pedidoId,
    clientPhoneNumber: normalizarTelefone(payload.phone || payload.telefone || payload.customer?.phone || payload.clientPhoneNumber),
    clientName: payload.name || payload.customerName || payload.customer?.name || payload.clientName,
    clientEmail: payload.email || payload.customer?.email || payload.clientEmail,
    clientDocument: payload.document || payload.cpf || payload.cnpj || payload.clientDocument,
    value: payload.value ?? payload.amount ?? payload.valor,
    totalValue: payload.totalValue ?? payload.total ?? payload.value ?? payload.amount,
    pixQrCode: payload.pixQrCode ?? payload.qrCode ?? payload.copiaECola ?? payload.pix?.qrCode,
    pixUrl: payload.pixUrl ?? payload.pixLink ?? payload.pix?.url ?? payload.link,
    status: payload.status != null ? Number(payload.status) : 99,
    paymentType: 99,
    date: payload.date ?? payload.createdAt ?? payload.dataCriacao ?? new Date().toISOString(),
    metadata: payload.metadata ?? payload.meta ?? (payload.customId ? { customId: payload.customId } : undefined),
  };
}

function normalizarTelefone(tel) {
  if (!tel) return null;
  const s = String(tel).replace(/\D/g, '');
  if (s.length === 10 || s.length === 11) return '+55' + s;
  if (s.startsWith('55')) return '+' + s;
  return tel;
}

/**
 * POST /webhook/voxuy
 * Recebe o payload da sua plataforma de pagamento e envia para a Voxuy.
 * Exemplo de body (genérico):
 * {
 *   "id": "PEDIDO-123",
 *   "phone": "11999999999",
 *   "name": "João",
 *   "email": "joao@email.com",
 *   "value": 99.90,
 *   "pixQrCode": "...",
 *   "pixUrl": "https://..."
 * }
 */
app.post('/webhook/voxuy', async (req, res) => {
  try {
    const body = mapearParaVoxuy(req.body);
    if (!body.clientPhoneNumber) {
      return res.status(400).json({
        ok: false,
        error: 'Telefone do cliente é obrigatório (phone, telefone ou clientPhoneNumber)',
      });
    }
    const resultado = await enviarTransacao(body);
    if (resultado.success) {
      return res.status(200).json({ ok: true, voxuy: resultado.data });
    }
    return res.status(resultado.status || 502).json({
      ok: false,
      error: resultado.error,
      details: resultado.data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /webhook/voxuy/pix
 * Atalho para cobrança PIX: espera os mesmos campos e força paymentType PIX e status pendente.
 */
app.post('/webhook/voxuy/pix', async (req, res) => {
  try {
    const body = mapearParaVoxuy({ ...req.body, paymentType: 99, status: 99 });
    if (!body.clientPhoneNumber) {
      return res.status(400).json({
        ok: false,
        error: 'Telefone do cliente é obrigatório (phone, telefone ou clientPhoneNumber)',
      });
    }
    const resultado = await enviarTransacao(body);
    if (resultado.success) {
      return res.status(200).json({ ok: true, voxuy: resultado.data });
    }
    return res.status(resultado.status || 502).json({
      ok: false,
      error: resultado.error,
      details: resultado.data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /webhook/voxuy/paradise
 * Endpoint específico para a Paradise (paradisepags.com).
 * Configure no painel Paradise a URL de postback para: https://seu-servidor.com/webhook/voxuy/paradise
 * Ou use postback_url ao criar a transação via API Paradise.
 * Aceita o payload no formato da API/webook Paradise: reference, customer { name, email, phone, document }, amount (centavos), etc.
 */
app.post('/webhook/voxuy/paradise', async (req, res) => {
  // Log para você ver no pm2 logs se o payload chegou
  console.log('[Paradise] Postback recebido:', JSON.stringify(req.body, null, 2));
  try {
    const body = mapearParadiseParaVoxuy(req.body);
    if (!body.clientPhoneNumber) {
      return res.status(400).json({
        ok: false,
        error: 'Telefone do cliente é obrigatório. Paradise envia em customer.phone ou phone (apenas números com DDD).',
      });
    }
    const resultado = await enviarTransacao(body);
    if (resultado.success) {
      console.log('[Paradise] Enviado para Voxuy com sucesso. Telefone:', body.clientPhoneNumber);
      return res.status(200).json({ ok: true, voxuy: resultado.data });
    }
    console.error('[Paradise] Erro ao enviar para Voxuy:', resultado.error, resultado.data);
    console.error('[Paradise] Body mapeado (para debug):', JSON.stringify(body, null, 2));
    return res.status(resultado.status || 502).json({
      ok: false,
      error: resultado.error,
      details: resultado.data,
    });
  } catch (err) {
    console.error('[Paradise] Exceção:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true, service: 'voxuy-pix-integration' }));

app.listen(PORT, () => {
  console.log(`Webhook rodando em http://localhost:${PORT}`);
  console.log('Endpoints: POST /webhook/voxuy | /webhook/voxuy/pix | /webhook/voxuy/paradise');
});
