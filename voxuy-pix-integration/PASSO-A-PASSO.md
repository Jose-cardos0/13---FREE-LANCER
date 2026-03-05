# Passo a passo: Integração Paradise → Voxuy (PIX no WhatsApp)

**Objetivo:** Quando um cliente **gerar um PIX** (na Paradise), a **Voxuy seja comunicada** e envie **automaticamente a mensagem que você criou** no funil de WhatsApp.

**O que já está definido:** domínio **securitysw.online**, subdomínio **api.securitysw.online**, VPS Hostinger (IP 72.60.10.202, Ubuntu 22.04 LTS). Este guia leva você do DNS até a configuração na Paradise e na Voxuy.

---

## Seus dados (resumo)

Use estes dados ao seguir os passos abaixo.

**VPS (Hostinger)**

| Campo | Valor |
|-------|--------|
| **IPv4** | `72.60.10.202` |
| **Usuário SSH** | `root` |
| **Sistema** | Ubuntu 22.04 LTS |
| **Hostname** | srv1460798.hstgr.cloud |
| **Localização** | Brazil – São Paulo |

Conexão: `ssh root@72.60.10.202` (senha: a que a Hostinger enviou por e-mail ou no painel).

**Domínio**

| Campo | Valor |
|-------|--------|
| **Domínio** | securitysw.online |
| **Subdomínio da API** | api.securitysw.online |
| **URL do webhook (Paradise)** | `https://api.securitysw.online/webhook/voxuy/paradise` |

**DNS:** registro **A** (não CNAME) com nome `api` apontando para `72.60.10.202`.

---

## Visão geral do fluxo

1. **Cliente** gera um PIX no checkout da Paradise (ou você cria a cobrança PIX pela API).
2. **Paradise** envia uma notificação (postback) para **seu servidor** (esta aplicação na VPS).
3. **Seu servidor** recebe o postback, converte os dados e envia para a **Voxuy**.
4. **Voxuy** dispara a **mensagem automática que você criou** no funil (WhatsApp com link do PIX, lembretes, etc.).

Para a Paradise conseguir chamar seu servidor, ele precisa estar na internet com **HTTPS** e uma **URL fixa**. Por isso você precisa de **domínio** (apontando para o IP da VPS) + **VPS**.

---

## Parte 1: Domínio e VPS

*(Domínio **securitysw.online** e VPS na Hostinger já contratados.)*

### Passo 1.1 – Apontar o domínio para o VPS (DNS)

1. No painel onde está o DNS do domínio **securitysw.online** (Hostinger: **Domínios** → securitysw.online → **DNS / Zona DNS**).
2. Crie um **registro do tipo A** (não use CNAME para apontar para IP):
   - **Tipo:** A  
   - **Nome / Host:** `api`  
   - **Aponta para / Valor:** `72.60.10.202`  
   - **TTL:** 14400 ou padrão  
3. Salve e aguarde a propagação (alguns minutos até 24h).

Assim **api.securitysw.online** passa a apontar para sua VPS. A URL do webhook que você vai usar na Paradise é:  
`https://api.securitysw.online/webhook/voxuy/paradise`

---

### Passo 1.2 – Conectar no VPS e instalar o que precisamos

1. **Conectar por SSH** (no Windows: PowerShell ou [PuTTY](https://www.putty.org/)):
   ```bash
   ssh root@72.60.10.202
   ```
   Use a **senha** que a Hostinger enviou por e-mail ou que aparece no painel do VPS (ao clicar em “Acesso SSH” ou similar).

2. **Instalar Node.js** (versão 18 ou 20):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   node -v
   ```

3. **Instalar Nginx** (para servir a aplicação e HTTPS):
   ```bash
   sudo apt update
   sudo apt install -y nginx
   ```

4. **Instalar Certbot** (certificado SSL gratuito para HTTPS):
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   ```

---

### Passo 1.3 – Enviar o projeto para o VPS

**Opção A – Clonar do GitHub (recomendado)**

No **VPS** (já conectado com `ssh root@72.60.10.202`):

1. Clone o repositório (o projeto está dentro da pasta `voxuy-pix-integration`):
   ```bash
   cd /root
   git clone https://github.com/Jose-cardos0/13---FREE-LANCER.git
   cd 13---FREE-LANCER/voxuy-pix-integration
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

**Opção B – Enviar pelo SCP (do seu computador)**

No **seu computador**, na pasta onde está `voxuy-pix-integration`:
   ```bash
   scp -r voxuy-pix-integration root@72.60.10.202:/root/
   ```
No VPS:
   ```bash
   ssh root@72.60.10.202
   cd /root/voxuy-pix-integration
   npm install
   ```

---

4. Crie o arquivo **.env** na pasta do projeto no VPS (se clonou do GitHub, você já está em `13---FREE-LANCER/voxuy-pix-integration`):
   ```bash
   nano .env
   ```
   Cole (e ajuste se precisar):
   ```env
   VOXUY_WEBHOOK_URL=https://sistema.voxuy.com/api/bc608452-e9b7-4213-9ee3-2ea983bd995e/webhooks/voxuy/transaction
   VOXUY_API_TOKEN=8c01c758-2f53-42e5-82e7-9465185d7341
   VOXUY_PLAN_ID=7e50b0e6-3554-4b10-84c4-0bc7d7
   PORT=3000
   ```
   Salve (Ctrl+O, Enter, Ctrl+X).

   **Importante:** Não commite o `.env` com tokens reais no GitHub. Use o `.gitignore` para ignorar `.env`; no servidor, crie o `.env` manualmente como acima.

---

### Passo 1.4 – Rodar a aplicação em segundo plano (PM2)

Na **pasta do projeto** no VPS (se clonou do GitHub: `cd /root/13---FREE-LANCER/voxuy-pix-integration`; se enviou por SCP: `cd /root/voxuy-pix-integration`):

```bash
sudo npm install -g pm2
pm2 start src/webhook-server.js --name voxuy-webhook
pm2 save
pm2 startup
```

Anote: a aplicação está escutando na **porta 3000** dentro do VPS.

---

### Passo 1.5 – Configurar Nginx e HTTPS (Certbot)

1. Crie o arquivo de configuração do Nginx:
   ```bash
   sudo nano /etc/nginx/sites-available/voxuy-webhook
   ```

2. Cole (já com seu domínio **api.securitysw.online**):
   ```nginx
   server {
       listen 80;
       server_name api.securitysw.online;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
   Salve (Ctrl+O, Enter) e saia (Ctrl+X).

3. Ative o site e recarregue o Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/voxuy-webhook /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. Gere o certificado SSL (HTTPS) com Certbot:
   ```bash
   sudo certbot --nginx -d api.securitysw.online
   ```
   Informe o e-mail e aceite os termos. O Certbot ajusta o Nginx para HTTPS.

5. Teste no navegador:
   - **https://api.securitysw.online/health**  
   Deve retornar: `{"ok":true,"service":"voxuy-pix-integration"}`.

**URL do webhook para colocar na Paradise:**
```text
https://api.securitysw.online/webhook/voxuy/paradise
```

---

## Parte 2: O que configurar na Paradise

### Passo 2.1 – Entrar no painel da Paradise

1. Acesse o painel: **multi.paradisepags.com** (ou o que a Paradise indicar).
2. Faça login com sua conta de loja.

### Passo 2.2 – Onde configurar a URL de postback (webhook)

No painel da Paradise a configuração fica em **Integrações**, no card **Webhooks (Postbacks)**:

1. No **menu lateral esquerdo**, clique em **Integrações** (ícone de engrenagem).
2. Na página de integrações, localize o card **Webhooks (Postbacks)** — onde diz “Configure URLs para receber notificações em tempo real sobre os eventos de suas transações”.
3. Clique no botão **Adicionar/Gerenciar Webhooks**.
4. Adicione uma nova URL de webhook e preencha:
   - **URL:**  
     ```text
     https://api.securitysw.online/webhook/voxuy/paradise
     ```
   - **Eventos:** marque pelo menos **approved** (aprovado) e **pending** (pendente), para que a Paradise avise quando um PIX for gerado (pendente) e quando for pago (aprovado). Inclua outros eventos se quiser (ex.: refunded).
5. Salve.

**Se você criar transações pela API** da Paradise, também pode enviar a URL por transação no body do `POST /api/v1/transaction.php`:
```json
"postback_url": "https://api.securitysw.online/webhook/voxuy/paradise"
```

**Importante:** A URL **precisa** ser **HTTPS**. A Paradise não envia para HTTP.

### Passo 2.3 – Conferir dados do cliente (telefone)

Para a Voxuy enviar WhatsApp, o **telefone do cliente** precisa chegar no postback.

**Na documentação da API Paradise** ([Documentação da API - Paradise](https://pt.scribd.com/document/973845116/Documentacao-Da-API-Paradise)) o objeto **customer** na **criação da transação** é obrigatório e inclui:
- **name** (nome)
- **email** (e-mail)
- **document** (CPF/CNPJ, apenas números)
- **phone** (telefone com DDD, **apenas números** — ex.: `11999999999`)

Ou seja: ao criar a transação (pelo checkout ou pela API), o campo **customer.phone** deve ser enviado. O postback costuma repassar os dados da transação (incluindo o customer), então o telefone tende a vir no payload que a Paradise envia para sua URL — nosso servidor já mapeia `customer.phone` e `phone` no endpoint `/webhook/voxuy/paradise`.

**O que fazer:** (1) Garanta que seu checkout ou sua chamada à API Paradise sempre envie **customer.phone** ao criar a transação. (2) Se após o teste o WhatsApp não disparar, confira nos logs do servidor (`pm2 logs voxuy-webhook`) se o telefone está vindo no body do postback; em último caso, consulte o suporte da Paradise para confirmar a estrutura exata do payload do webhook.

---

## Parte 3: O que configurar na Voxuy

A **mensagem automática** que o cliente recebe no WhatsApp é a que **você criar no funil** na Voxuy (textos, horários, link do PIX, etc.). Quando o PIX for gerado na Paradise e seu servidor avisar a Voxuy, ela dispara exatamente esse funil para o telefone do cliente.

Você já fez a maior parte na primeira conversa. Só conferir:

### Passo 3.1 – Produto e evento (Automações → API)

1. Na Voxuy: **Automações** → **API**.  
2. Produto e evento já criados (ID do **produto**: 1155934).  
3. **ID do evento** é diferente do ID do produto: é o código do **evento** (funil) que você criou dentro do produto. Se você usa evento personalizado, anote esse **ID do evento** na Voxuy e coloque no `.env`:
   ```env
   VOXUY_CUSTOM_EVENT_ID=1155934
   ```
   (use o ID real do seu **evento**; se o seu evento tiver outro número, troque. Se não usar evento customizado, pode remover ou comentar essa linha.)

   **Seu `.env` já está com os dados da Voxuy (webhook URL, token, plan ID e, se usar, custom event ID).** Não é preciso alterar nada aí para o fluxo funcionar.

### Passo 3.2 – Funil de mensagens (e erro “Mensagem não configurada no funil”)

1. **Automações** → **Funil de conversão** → selecione o **Produto** (ex.: Produto01) e o **evento** (ex.: **Pix** → **Gerado**).  
2. Cadastre pelo menos uma **Mensagem**: clique no **+** → **Mensagem** → preencha **Nome de referência** e o **texto** em “Digite sua mensagem aqui”. A Voxuy grava **automaticamente** (na tela aparece “Dados salvos automaticamente”; não há botão Salvar). Feche o bloco com o **X** quando terminar.  
3. **Ligue os blocos:** a Voxuy só considera que o funil tem mensagem se o **Início** estiver **conectado** ao bloco de mensagem. Arraste a **linha** que sai do “Início” (do ponto **Então**) até o bloco da mensagem (“Obrigado!”). Sem essa ligação, a Voxuy mostra: *“Não existem mensagens configuradas no Funil de conversão do produto Produto01 e evento Pix gerado”*.  
4. Use as variáveis da venda (nome, valor, **Código Pix**, **Link Pix**) em “Venda” / “Venda - Pix” no ícone **<>** para personalizar o texto.

Referência: [Funil de conversão – Voxuy](https://intercom.help/voxuy/pt-BR/articles/6965226-funil-de-conversao).

### Passo 3.3 – Integração API Voxuy (só conferir; não é onde você coloca sua URL)

**Resumo:** A URL do **seu** servidor (`https://api.securitysw.online/...`) você coloca só na **Paradise**. Na **Voxuy** você não coloca sua URL — só confere os dados que a **própria Voxuy** mostra (e que já estão no seu `.env`).

| Onde | O que você faz |
|------|-----------------|
| **Paradise** (Integrações → Webhooks) | Você **coloca** a URL do seu servidor: `https://api.securitysw.online/webhook/voxuy/paradise` — para a Paradise **chamar** sua API quando o PIX for gerado. |
| **Voxuy** (Configurações → Integrações → API VOXUY) | Você **não coloca** nenhuma URL sua. Só **confere** o que está na tela: a “URL para webhook” e o “Token API” são dados **da Voxuy** (que seu servidor usa para **enviar** os dados para ela). O seu `.env` no VPS já tem esses mesmos valores. |

Na Voxuy: **Configurações** (engrenagem) → **Integrações** → **API VOXUY**. Lá aparecem a URL da Voxuy e o Token. Só confira se são os mesmos do seu `.env` (webhook URL e token). **Não** digite a URL api.securitysw.online na Voxuy — essa URL fica só na Paradise.

### Passo 3.4 – Plano (e “só Produto01” ou todos?)

A API envia **todas** as transações PIX da Paradise para o **mesmo** plano (o que está no `.env`). Esse plano pertence a **um** produto na Voxuy (ex.: Produto01). Ou seja: não importa qual produto da Paradise gerou o PIX (ex.: “Taxa de verificação” ou outro) — tudo cai no mesmo produto/plano na Voxuy. Se você quiser **a mesma mensagem para todo PIX gerado**, esse comportamento é o correto: um funil “Pix gerado” nesse produto atende todos. O nome/código do produto da Paradise passa a ir no **metadata** (ex.: `produto_paradise`, `produto_paradise_codigo`) para você ver no relatório qual foi a oferta.

1. **Produtos** → confira a qual **produto** o plano `7e50b0e6-3554-4b10-84c4-0bc7d7` está vinculado (provavelmente Produto01).  
2. O funil “Pix gerado” precisa estar configurado **nesse** produto. Se aparecer “não tem fluxo” mesmo com o fluxo criado, confira na Voxuy: (a) esse plano é mesmo do Produto01; (b) o funil está em **Funil de conversão** → Produto01 → evento **Pix** → **Gerado**; (c) a ligação Início → mensagem está feita e as mensagens estão preenchidas.

### Passo 3.5 – Chat do atendente (se usar atendente humano)

Se o funil for atendido por alguém no chat da Voxuy:  
No chat, marque o **produto** e o **evento de API/Customizado** que você criou, para as conversas aparecerem no lugar certo.

---

## Resumo rápido

| Onde | O que fazer |
|------|-------------|
| **Domínio** | securitysw.online; registro **A** para `api` → `72.60.10.202` (não CNAME). |
| **VPS** | `ssh root@72.60.10.202`; Node.js, Nginx, Certbot; projeto `voxuy-pix-integration`, PM2, `.env`; Nginx + HTTPS para **api.securitysw.online**. |
| **Paradise** | **URL de postback:** `https://api.securitysw.online/webhook/voxuy/paradise`. Garantir que o checkout/API envia **telefone** do cliente. |
| **Voxuy** | Produto/evento/plano e funil de mensagens; Integração API (URL e token iguais ao `.env`). |

---

## Testando

1. **Health check:**  
   Abra no navegador: **https://api.securitysw.online/health**  
   Deve retornar: `{"ok":true,"service":"voxuy-pix-integration"}`.

2. **Venda de teste na Paradise:**  
   Faça uma compra de teste (ou crie uma transação pela API da Paradise).  
   A Paradise chama `https://api.securitysw.online/webhook/voxuy/paradise`, o servidor repassa para a Voxuy e o funil de WhatsApp dispara para o telefone do cliente.

3. **Logs no VPS:**  
   No servidor: `ssh root@72.60.10.202`  
   Depois: `pm2 logs voxuy-webhook`  
   Veja se as requisições chegam e se há erros.

---

## Depois de gerar o PIX: ver se o payload chegou e a Voxuy enviou a mensagem

Quando você **gera o QR code PIX** na Paradise (tela “Pagamento Gerado!”), a Paradise pode enviar um postback para sua API. Siga estes passos para conferir se chegou e se a Voxuy disparou o WhatsApp.

### 1. Ver se o payload chegou na sua API

1. Conecte na VPS:
   ```bash
   ssh root@72.60.10.202
   ```
2. Abra os logs da aplicação (deixe aberto enquanto testa):
   ```bash
   pm2 logs voxuy-webhook
   ```
3. Gere um PIX na Paradise (ou use um que acabou de gerar). A Paradise deve chamar:
   `https://api.securitysw.online/webhook/voxuy/paradise`
4. Nos logs você deve ver:
   - **`[Paradise] Postback recebido:`** seguido do JSON que a Paradise enviou (aqui você vê o payload completo).
   - Se aparecer **`[Paradise] Enviado para Voxuy com sucesso. Telefone: +55...`** → sua API recebeu o postback e repassou para a Voxuy.
   - Se aparecer **`[Paradise] Erro ao enviar para Voxuy:`** → o payload chegou, mas algo falhou ao enviar para a Voxuy (ex.: telefone faltando, token/planId inválido).

**Se não aparecer nenhuma linha quando o PIX é gerado:**

- Confirme na Paradise: **Integrações** → **Webhooks (Postbacks)** → a URL cadastrada é exatamente `https://api.securitysw.online/webhook/voxuy/paradise` e os eventos incluem **pending** (e **approved** se quiser quando pagar).
- Às vezes o postback é enviado só quando o pagamento muda de status (ex.: aprovado). Teste também **pagando** o PIX (ou use um valor simbólico) e veja se o log aparece.
- Verifique se o servidor está no ar: `pm2 status` (voxuy-webhook deve estar “online”) e teste no navegador: https://api.securitysw.online/health

### 2. Fazer a Voxuy enviar a mensagem

Para a Voxuy disparar o WhatsApp:

1. **Telefone no payload:** o postback da Paradise precisa trazer o telefone do cliente (`customer.phone` ou `phone`). Nos logs, confira se no JSON aparece um número. Se não aparecer, o checkout/API da Paradise precisa enviar **customer.phone** ao criar a transação.
2. **Funil na Voxuy:** na Voxuy, o **evento/plano** que você configurou deve ter um **funil de mensagens** ativo (pelo menos uma mensagem). O número usado será o que vier no payload (normalizado para +55...).
3. **Após o postback:** quando sua API envia para a Voxuy com sucesso (log “Enviado para Voxuy com sucesso”), a Voxuy agenda o funil para aquele telefone. A mensagem pode levar alguns segundos ou minutos conforme o agendamento do funil.

**Resumo:** Gere o PIX → veja em `pm2 logs voxuy-webhook` se saiu “Postback recebido” e “Enviado para Voxuy com sucesso” → confira no WhatsApp do número que está no payload se a mensagem do funil chegou. Se o payload não chegar, revise a URL do webhook na Paradise. Se chegar mas não disparar WhatsApp, confira telefone no payload e funil na Voxuy.
