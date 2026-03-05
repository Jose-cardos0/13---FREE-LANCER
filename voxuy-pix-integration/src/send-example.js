/**
 * Exemplo de envio de uma cobrança PIX para a Voxuy.
 * Execute: npm run send
 * Ou: node src/send-example.js
 */

const { enviarCobrancaPix, STATUS } = require('./voxuy-client');

async function main() {
  const resultado = await enviarCobrancaPix({
    clientPhoneNumber: '+5511999999999', // substitua pelo número real
    clientName: 'Cliente Exemplo',
    id: 'PEDIDO-12345', // ID único da transação no seu sistema
    value: 99.9,        // R$ 99,90 (pode ser em reais ou centavos: 9990)
    pixQrCode: '00020126580014br.gov.bcb.pix...', // QR code PIX (copia e cola)
    pixUrl: 'https://exemplo.com/pix/xxx',         // link para pagamento PIX
    status: STATUS.PENDENTE, // 0 = aguardando pagamento
    metadata: {
      produto: 'Curso XYZ',
      pedido: '12345',
    },
  });

  if (resultado.success) {
    console.log('Enviado para a Voxuy com sucesso:', resultado.data);
  } else {
    console.error('Erro:', resultado.error);
    if (resultado.data) console.error('Detalhes:', resultado.data);
  }
}

main().catch(console.error);
