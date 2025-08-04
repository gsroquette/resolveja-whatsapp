const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_SANDBOX_NUMBER = process.env.TWILIO_SANDBOX_NUMBER;

const atendimentoPadrao = `
Você é a atendente virtual do Resolve Já – Reparos e Manutenção.
Responda de forma profissional, cordial e clara.
Ofereça ajuda com pequenos serviços domésticos (elétrica, hidráulica, instalação, pintura, etc).
Se o cliente disser qual serviço quer, peça os seguintes dados:
1. Endereço
2. Melhor dia e horário
3. Foto do local (se possível)
Nunca diga que é uma IA. Você é uma atendente do Resolve Já.
`;

app.post('/webhook', async (req, res) => {
  const messageBody = req.body.Body;
  const from = req.body.From;

  try {
    const completion = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: atendimentoPadrao },
          { role: 'user', content: messageBody },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const reply = completion.data.choices[0].message.content;

    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({
        Body: reply,
        From: `whatsapp:${TWILIO_SANDBOX_NUMBER}`,
        To: from,
      }),
      {
        auth: {
          username: TWILIO_ACCOUNT_SID,
          password: TWILIO_AUTH_TOKEN,
        },
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error('Erro:', err.response?.data || err);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => {
  res.send('Resolve Já – IA rodando!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
