/**
 * Integração API Voxuy - Cobranças PIX para automação WhatsApp
 *
 * Uso direto no seu backend:
 *   const { enviarCobrancaPix, enviarTransacao } = require('./voxuy-client');
 *   await enviarCobrancaPix({ clientPhoneNumber: '+5511999999999', ... });
 */

const { enviarTransacao, enviarCobrancaPix, montarBody, PAYMENT_TYPE, STATUS, reaisParaCentavos } = require('./voxuy-client');

module.exports = {
  enviarTransacao,
  enviarCobrancaPix,
  montarBody,
  PAYMENT_TYPE,
  STATUS,
  reaisParaCentavos,
};
