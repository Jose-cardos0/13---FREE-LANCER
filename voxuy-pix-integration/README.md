# Integração API Voxuy – Cobranças PIX no WhatsApp

Integração da [API Voxuy](https://intercom.help/voxuy/pt-BR/articles/6965206-api-voxuy) com a **Paradise** ([paradisepags.com](https://paradisepags.com/)) para enviar cobranças PIX na automação de WhatsApp da Voxuy.

## Dados da sua conta (já configurados)

| Item | Valor |
|------|--------|
| **URL Webhook** | `https://sistema.voxuy.com/api/bc608452-e9b7-4213-9ee3-2ea983bd995e/webhooks/voxuy/transaction` |
| **Token API** | (em `.env`) |
| **Plano** | `7e50b0e6-3554-4b10-84c4-0bc7d7` |
| **ID do produto** | 1155934 |

## Instalação

```bash
cd voxuy-pix-integration
npm install
```

Copie `.env.example` para `.env` e preencha (ou use o `.env` já criado com seus dados).

## Uso

### 1. Chamar direto do seu backend (Node.js)

Quando sua plataforma de pagamento gerar uma cobrança PIX, chame o cliente e envie os dados para a Voxuy:

```javascript
const { enviarCobrancaPix, STATUS } = require('./src/voxuy-client');

const resultado = await enviarCobrancaPix({
  clientPhoneNumber: '+5511999999999',  // obrigatório – com DDI
  clientName: 'Nome do Cliente',
  id: 'PEDIDO-12345',                   // ID único da transação
  value: 99.90,                         // em reais (ou use centavos: 9990)
  pixQrCode: '00020126...',             // código PIX (copia e cola)
  pixUrl: 'https://...',                // link para pagamento
  status: STATUS.PENDENTE,              // 0 = aguardando pagamento
  metadata: { produto: 'Curso X', pedido: '12345' },
});

if (resultado.success) {
  console.log('Enviado para a Voxuy:', resultado.data);
} else {
  console.error('Erro:', resultado.error);
}
```

### 2. Servidor de webhook (sua plataforma chama sua API)

Se sua plataforma de pagamento envia webhook quando um PIX é criado, suba este servidor e configure a URL de webhook dela para apontar para o seu servidor:

```bash
npm start
```

O servidor sobe na porta **3000** (ou use `PORT` no `.env`).

**Endpoints:**

- **POST** `/webhook/voxuy` – recebe o payload genérico e envia para a Voxuy.
- **POST** `/webhook/voxuy/pix` – atalho para cobrança PIX.
- **POST** `/webhook/voxuy/paradise` – **específico para a Paradise** (mapeamento dos campos da API/webook Paradise).

---

### Integração com a Paradise (paradisepags.com)

A Paradise usa **centavos** no campo `amount` e o cliente em `customer`: `name`, `email`, `document`, `phone` (apenas números com DDD). Documentação: painel **multi.paradisepags.com** → Configurações e API.

**Opção A – Postback da Paradise para a Voxuy**

1. Suba este servidor (`npm start`) e exponha a URL com HTTPS (ex.: ngrok, seu domínio).
2. No painel da Paradise, configure a **URL de postback** para:  
   `https://seu-dominio.com/webhook/voxuy/paradise`  
   Ou use o parâmetro `postback_url` ao criar a transação via API.
3. Quando a Paradise notificar (criação de PIX, pagamento aprovado, etc.), o servidor converte o payload e envia para a Voxuy.

**Opção B – Depois de criar a transação na Paradise via API**

Ao criar a transação com `POST https://multi.paradisepags.com/api/v1/transaction.php`, você recebe a resposta (com dados do PIX, se houver). A partir daí, chame o cliente para enviar à Voxuy:

```javascript
const { enviarCobrancaPix } = require('./src/voxuy-client');

// Resposta da API Paradise (exemplo)
const respostaParadise = await criarTransacaoParadise({ amount: 9990, reference: 'PED-123', customer: { name, email, phone, document }, ... });

await enviarCobrancaPix({
  id: respostaParadise.reference || respostaParadise.id,
  clientPhoneNumber: '+55' + respostaParadise.customer.phone,
  clientName: respostaParadise.customer.name,
  clientEmail: respostaParadise.customer.email,
  value: respostaParadise.amount,  // já em centavos
  pixQrCode: respostaParadise.pix_copy_paste || respostaParadise.qr_code,
  pixUrl: respostaParadise.payment_url || respostaParadise.link,
  status: 0,  // pendente
});
```

O endpoint `/webhook/voxuy/paradise` aceita tanto o formato da **resposta da API** Paradise quanto o formato do **postback** (ex.: `reference`, `customer`, `amount`, `transaction_id`, `action`/`status`, etc.).

---

Exemplo de body genérico (para `/webhook/voxuy` ou `/webhook/voxuy/pix`):

```json
{
  "id": "PEDIDO-123",
  "phone": "11999999999",
  "name": "João",
  "email": "joao@email.com",
  "value": 99.90,
  "pixQrCode": "00020126...",
  "pixUrl": "https://..."
}
```

O telefone pode vir como `phone`, `telefone` ou `clientPhoneNumber`; o código adiciona `+55` se vier só com DDD + número.

### 3. Testar envio manual

Edite `src/send-example.js` com um telefone real (e opcionalmente um PIX de teste) e rode:

```bash
npm run send
```

## Campos importantes para a Voxuy (PIX)

- **apiToken**, **planId** – já vêm do `.env`.
- **clientPhoneNumber** – obrigatório; formato `+5511999999999`.
- **paymentType** – PIX = `7` (já definido em `enviarCobrancaPix`).
- **status** – ex.: `0` (pendente), `1` (aprovado).
- **value** / **totalValue** – em **centavos** (ex.: R$ 69,90 = `6990`). O cliente aceita valor em reais e converte.
- **pixQrCode** – QR code PIX (copia e cola).
- **pixUrl** – URL do PIX.
- **metadata** – objeto com dados extras para usar como variáveis nas mensagens do funil na Voxuy.

## Estrutura do projeto

```
voxuy-pix-integration/
├── .env                 # Suas credenciais (não versionar)
├── .env.example
├── package.json
├── README.md
└── src/
    ├── config.js        # Lê .env
    ├── voxuy-client.js  # Cliente da API Voxuy (enviarTransacao, enviarCobrancaPix)
    ├── index.js         # Export do cliente
    ├── send-example.js  # Exemplo de envio
    └── webhook-server.js # Servidor que recebe da sua plataforma e envia à Voxuy
```

## Referência da API Voxuy

- [API Voxuy – Central de conhecimento](https://intercom.help/voxuy/pt-BR/articles/6965206-api-voxuy)

Se precisar usar **evento personalizado**, crie o evento no painel da Voxuy, copie o **ID do evento** e defina no `.env`:

```env
VOXUY_CUSTOM_EVENT_ID=63
```

(Substitua `63` pelo ID do seu evento.)
