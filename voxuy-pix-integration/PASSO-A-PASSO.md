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

No **seu computador** (onde está a pasta `voxuy-pix-integration`):

1. Compacte a pasta do projeto (sem `node_modules` e sem `.env` com dados sensíveis se for subir por outro meio).
2. Envie para o VPS usando **SCP** (PowerShell no Windows) ou **SFTP** (FileZilla, WinSCP). Exemplo pelo SCP, na pasta onde está o projeto:
   ```bash
   scp -r voxuy-pix-integration root@72.60.10.202:/root/
   ```
3. No VPS, entre na pasta e instale as dependências:
   ```bash
   cd /root/voxuy-pix-integration
   npm install
   ```

4. Crie o arquivo **.env** no VPS com suas credenciais (as mesmas que você já tem):
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

---

### Passo 1.4 – Rodar a aplicação em segundo plano (PM2)

Para o servidor Node continuar rodando e reiniciar sozinho após reinicialização:

```bash
sudo npm install -g pm2
cd /root/voxuy-pix-integration
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

### Passo 2.2 – Onde configurar a URL de postback

A Paradise pode aceitar a URL de postback em **dois** lugares (depende do que o painel oferecer):

**Opção A – URL global de notificação (Configurações / API)**  
1. Vá em **Configurações** ou **Configurações e API**.  
2. Procure por **URL de notificação**, **Webhook**, **Postback** ou **URL de retorno**.  
3. Coloque exatamente:
   ```text
   https://api.securitysw.online/webhook/voxuy/paradise
   ```
4. Salve.

**Opção B – Por transação (ao criar via API)**  
Se você cria a transação pela **API** da Paradise, no body do `POST /api/v1/transaction.php` inclua:
```json
"postback_url": "https://api.securitysw.online/webhook/voxuy/paradise"
```

**Importante:** A URL **precisa** ser **HTTPS**. A Paradise não envia para HTTP.

### Passo 2.3 – Conferir dados do cliente (telefone)

Para a Voxuy enviar WhatsApp, a Paradise precisa enviar o **telefone do cliente** no postback.  
Na criação da transação (checkout ou API), o campo **customer.phone** deve estar preenchido (apenas números com DDD, ex.: `11999999999`).  
Confirme no painel ou na documentação da Paradise que o checkout coleta telefone e que ele vem no postback.

---

## Parte 3: O que configurar na Voxuy

A **mensagem automática** que o cliente recebe no WhatsApp é a que **você criar no funil** na Voxuy (textos, horários, link do PIX, etc.). Quando o PIX for gerado na Paradise e seu servidor avisar a Voxuy, ela dispara exatamente esse funil para o telefone do cliente.

Você já fez a maior parte na primeira conversa. Só conferir:

### Passo 3.1 – Produto e evento (Automações → API)

1. Na Voxuy: **Automações** → **API**.  
2. Produto e evento já criados (ID do produto: 1155934).  
3. Se for usar **evento personalizado**, anote o **ID do evento** e coloque no `.env` do servidor:
   ```env
   VOXUY_CUSTOM_EVENT_ID=63
   ```
   (substitua pelo ID real.)

### Passo 3.2 – Funil de mensagens

1. No evento escolhido, cadastre as mensagens do funil (textos, horários, variáveis).  
2. Use as variáveis da venda (nome, valor, **link do PIX**, etc.) que a API envia – por exemplo campos do **metadata** ou os que a Voxuy disponibiliza para “Venda → Campo metadata (API)”.

### Passo 3.3 – Integração API Voxuy (URL e Token)

1. **Configurações** (ícone engrenagem) → **Integrações** → **API VOXUY**.  
2. Confirme:
   - **URL para webhook:**  
     `https://sistema.voxuy.com/api/bc608452-e9b7-4213-9ee3-2ea983bd995e/webhooks/voxuy/transaction`
   - **Token API:** o mesmo que está no seu `.env` no VPS.

Não precisa colocar nenhuma URL da *sua* parte aqui: **quem chama a Voxuy é o seu servidor**, usando essa URL e esse token.

### Passo 3.4 – Plano

1. **Produtos** → seu produto → plano com ID `7e50b0e6-3554-4b10-84c4-0bc7d7`.  
2. Só conferir se esse plano está ativo e é o que você quer usar no funil.

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
