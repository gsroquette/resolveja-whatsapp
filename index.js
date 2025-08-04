const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

const servicos = [
  {
    categoria: 'elétrica',
    palavras: ['lâmpada', 'tomada', 'interruptor', 'chuveiro', 'luminária'],
    tempo: 'até 1 hora',
    resposta: 'Esse serviço costuma levar até 1 hora e pode ser agendado com preço fixo.'
  },
  {
    categoria: 'hidráulica',
    palavras: ['torneira', 'rabicho', 'sifão', 'ralo', 'registro', 'válvula', 'descarga', 'vaso sanitário'],
    tempo: 'até 2 horas',
    resposta: 'Esse tipo de reparo costuma levar até 2 horas. Podemos agendar com preço fixo ou fazer orçamento rápido no local.'
  },
  {
    categoria: 'instalação',
    palavras: ['fogão', 'máquina de lavar', 'lava-louças'],
    tempo: 'até 2 horas (com ponto pronto)',
    resposta: 'A instalação costuma levar até 2 horas se o ponto já estiver pronto. Agendamos com preço fixo ou avaliamos no local.'
  },
  {
    categoria: 'paredes e acabamento',
    palavras: ['quadro', 'prateleira', 'espelho', 'buraco', 'pintura', 'mofo', 'rejunte'],
    tempo: '1 a 2 horas, podendo variar',
    resposta: 'Esse serviço pode levar de 1 a 2 horas, dependendo da complexidade. Em casos maiores, fazemos orçamento.'
  },
  {
    categoria: 'ajustes em móveis ou portas',
    palavras: ['porta', 'gaveta', 'armário', 'dobradiça', 'fechadura'],
    tempo: 'até 2 horas',
    resposta: 'Podemos realizar esse ajuste em até 2 horas. Agendamos com preço fixo.'
  },
  {
    categoria: 'desentupimento',
    palavras: ['entupido', 'desentupir', 'desentupimento'],
    tempo: 'até 1 hora (leve) ou mais (grave)',
    resposta: 'Se for um entupimento leve, resolvemos em até 1 hora. Casos mais graves exigem avaliação no local.'
  }
];

const palavrasDePreco = [
  'preço', 'quanto custa', 'valor', 'cobra quanto', 'custo', 'qual o valor', 'quanto é', 'preço da visita'
];

const respostaPreco = `
💰 Os valores variam conforme o tipo de serviço. Funciona assim:

1️⃣ *Serviços simples (até 1 hora)*  
• Visita + 1 serviço: *R$ 120*  
• Visita + 2 serviços: *R$ 160*  
• Hora extra: *R$ 60*

2️⃣ *Serviços com tempo variável (1 a 2 horas)*  
• Começa com o pacote acima  
• Se passar de 1h, avisamos antes e cobramos hora extra

3️⃣ *Serviços complexos (quebra de parede, local difícil)*  
• Fazemos uma visita de diagnóstico (*R$ 120*)  
• O valor é abatido se você aprovar o orçamento.

📸 Se puder, envie uma foto do local para analisarmos melhor.
`;

const encerramentoFrase = `
✅ *Obrigado pelas informações!*  
📞 Um técnico da nossa equipe entrará em contato em breve para confirmar os detalhes e combinar a visita.  
Se precisar de algo mais, estou por aqui! 😊
`;

const fallbackPrompt = `
Você é a atendente virtual da Resolve Já – Reparos e Manutenção.
Seja profissional, clara e simpática. Ofereça ajuda com pequenos reparos domésticos.
Peça sempre o endereço, disponibilidade de horário e se o item já está disponível.
Caso não consiga identificar o serviço claramente, peça uma explicação mais detalhada.
Nunca diga que é uma IA.
`;

app.post('/webhook', async (req, res) => {
  const userMsg = req.body.Body?.toLowerCase() || '';
  const from = req.body.From;

  const perguntaPreco = palavrasDePreco.some(p => userMsg.includes(p));
  const servicoDetectado = servicos.find(servico =>
    servico.palavras.some(palavra => userMsg.includes(palavra))
  );

  let respostaFinal = '';

  if (perguntaPreco) {
    respostaFinal = respostaPreco;
  } else if (servicoDetectado) {
    respostaFinal =
      `Certo! Atendemos esse tipo de serviço: *${servicoDetectado.categoria}*.\n` +
      `${servicoDetectado.resposta}\n\n` +
      `Por favor, me informe:\n📍 Seu endereço\n🕐 Melhor dia e horário\n📸 E se possível, envie uma foto do local.`;
  } else {
    try {
      const completion = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini-2024-07-18',
          messages: [
            { role: 'system', content: fallbackPrompt },
            { role: 'user', content: userMsg }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      respostaFinal = completion.data.choices[0].message.content;
    } catch (err) {
      console.error('Erro na OpenAI:', err.response?.data || err.message);
      respostaFinal = 'Desculpe, houve um erro ao processar sua mensagem. Tente novamente em instantes.';
    }
  }

  // Detecção de encerramento com base em frases comuns
  const indiciosDeEncerramento = [
    'meu endereço é', 'pode vir', 'estou disponível', 'pode agendar',
    'meu horário é', 'pode ser', 'venha tal dia', 'dia tal',
    'estarei em casa', 'posso tal hora', 'pode ser amanhã'
  ];
  const forneceuDados = indiciosDeEncerramento.some(frase => userMsg.includes(frase));
  if (forneceuDados) {
    respostaFinal += `\n\n${encerramentoFrase}`;
  }

  try {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({
        Body: respostaFinal,
        From: `whatsapp:${process.env.TWILIO_SANDBOX_NUMBER}`,
        To: from
      }),
      {
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        }
      }
    );
    res.sendStatus(200);
  } catch (err) {
    console.error('Erro ao responder pelo Twilio:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => {
  res.send('Resolve Já – IA ativa!');
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
