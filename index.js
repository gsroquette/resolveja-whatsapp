const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

/** -------------------------------------------------------
 * Helpers
 * ------------------------------------------------------*/
// normaliza para correspondência sem acentos e em minúsculas
const normalize = (txt = '') =>
  txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove diacríticos

// verifica se algum termo aparece na mensagem (já normalizada)
const includesAny = (msgNorm, terms) => terms.some(t => msgNorm.includes(t));

/** -------------------------------------------------------
 * Catálogo de serviços (palavras-chave sem acento)
 * ------------------------------------------------------*/
const servicos = [
  {
    categoria: 'elétrica',
    tempo: 'até 1 hora',
    resposta:
      'Esse serviço costuma levar até 1 hora e pode ser agendado com preço fixo.',
    palavras: [
      'lampada', 'tomada', 'interruptor', 'chuveiro',
      'luminaria', 'luz', 'iluminacao'
    ]
  },
  {
    categoria: 'hidráulica',
    tempo: 'até 2 horas',
    resposta:
      'Esse tipo de reparo costuma levar até 2 horas. Podemos agendar com preço fixo ou fazer orçamento rápido no local.',
    palavras: [
      'torneira', 'rabicho', 'sifao', 'ralo',
      'registro', 'valvula', 'descarga',
      'vaso sanitario', 'vaso', 'caixa acoplada'
    ]
  },
  {
    categoria: 'instalação',
    tempo: 'até 2 horas (com ponto pronto)',
    resposta:
      'A instalação costuma levar até 2 horas se o ponto já estiver pronto. Agendamos com preço fixo ou avaliamos no local.',
    palavras: [
      'fogao', 'maquina de lavar', 'maquina lavar', 'lavadora',
      'lava loucas', 'lava-loucas', 'lava louca', 'lava-louca',
      'lava louças', 'lava-louças'
    ]
  },
  {
    categoria: 'paredes e acabamento',
    tempo: '1 a 2 horas, podendo variar',
    resposta:
      'Esse serviço pode levar de 1 a 2 horas, dependendo da complexidade. Em casos maiores, fazemos orçamento.',
    palavras: [
      'quadro', 'prateleira', 'espelho', 'buraco',
      'pintura', 'mofo', 'rejunte', 'massa corrida', 'pendurar'
    ]
  },
  {
    categoria: 'ajustes em móveis ou portas',
    tempo: 'até 2 horas',
    resposta:
      'Podemos realizar esse ajuste em até 2 horas. Agendamos com preço fixo.',
    palavras: [
      'porta', 'gaveta', 'armario', 'dobradica', 'fechadura', 'folga'
    ]
  },
  {
    categoria: 'desentupimento',
    tempo: 'até 1 hora (leve) ou mais (grave)',
    resposta:
      'Se for um entupimento leve, resolvemos em até 1 hora. Casos mais graves exigem avaliação no local.',
    palavras: [
      'entupido', 'desentupir', 'desentupimento', 'entupimento', 'desentupir pia', 'desentupir ralo'
    ]
  }
];

/** -------------------------------------------------------
 * Regras de preço
 * ------------------------------------------------------*/
const precoKeywords = [
  'preco', 'quanto custa', 'valor', 'cobra quanto',
  'custo', 'qual o valor', 'quanto e', 'preco da visita'
];

const respostaPreco =
  '💰 Os valores variam conforme o tipo de serviço. Funciona assim:\n\n' +
  '1️⃣ *Serviços simples (até 1 hora)*  \n' +
  '• Visita + 1 serviço: *R$ 120*  \n' +
  '• Visita + 2 serviços: *R$ 160*  \n' +
  '• Hora extra: *R$ 60*\n\n' +
  '2️⃣ *Serviços com tempo variável (1 a 2 horas)*  \n' +
  '• Começa com o pacote acima  \n' +
  '• Se passar de 1h, avisamos antes e cobramos hora extra\n\n' +
  '3️⃣ *Serviços complexos (quebra de parede, local difícil)*  \n' +
  '• Fazemos uma visita de diagnóstico (*R$ 120*)  \n' +
  '• O valor é abatido se você aprovar o orçamento.\n\n' +
  '📸 Se puder, envie uma foto do local para analisarmos melhor.';

/** -------------------------------------------------------
 * Saudação e encerramento
 * ------------------------------------------------------*/
const saudacoes = [
  'oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'e aí', 'tudo bem'
].map(normalize);

const indiciosEncerramento = [
  'meu endereco e', 'meu endereço é', 'pode vir', 'estou disponivel', 'estou disponível',
  'pode agendar', 'meu horario e', 'meu horário é', 'pode ser', 'venha tal dia',
  'dia tal', 'estarei em casa', 'posso tal hora', 'pode ser amanha', 'pode ser amanhã'
].map(normalize);

const encerramentoFrase =
  '✅ *Obrigado pelas informações!*  \n' +
  '📞 Um técnico da nossa equipe entrará em contato em breve para confirmar os detalhes e combinar a visita.  \n' +
  'Se precisar de algo mais, estou por aqui! 😊';

/** -------------------------------------------------------
 * Prompt de fallback (OpenAI)
 * ------------------------------------------------------*/
const fallbackPrompt =
  'Você é a atendente virtual da Resolve Já – Reparos e Manutenção.\n' +
  'Seja profissional, clara e simpática. Ofereça ajuda com pequenos reparos domésticos.\n' +
  'Peça sempre o endereço, disponibilidade de horário e se o item já está disponível.\n' +
  'Caso a mensagem seja apenas uma saudação (ex.: "oi", "olá"), responda com uma saudação cordial e pergunte qual serviço precisa.\n' +
  'Nunca diga que é uma IA.';

/** -------------------------------------------------------
 * Webhook
 * ------------------------------------------------------*/
app.post('/webhook', async (req, res) => {
  // Mensagem bruta e normalizada (sem acentos)
  const userMsgRaw = req.body.Body || '';
  const userMsg = userMsgRaw.toString();
  const userMsgNorm = normalize(userMsg);
  const from = req.body.From;

  let respostaFinal = '';

  // 1) Saudação curta → responde sem chamar a OpenAI
  const isSaudacao = includesAny(userMsgNorm, saudacoes);
  if (isSaudacao && userMsgNorm.length <= 30) {
    respostaFinal =
      'Olá! 👋 Como posso ajudar com seus pequenos reparos ou manutenção? ' +
      'Se preferir, me diga o serviço (ex.: trocar torneira, instalar luminária, pendurar espelho).';
  }

  // 2) Pergunta de preço → resposta fixa clara
  const isPerguntaPreco = includesAny(userMsgNorm, precoKeywords);
  if (!respostaFinal && isPerguntaPreco) {
    respostaFinal = respostaPreco;
  }

  // 3) Serviço reconhecido → resposta com categoria + tempo estimado
  const servicoDetectado = servicos.find(s => includesAny(userMsgNorm, s.palavras));
  if (!respostaFinal && servicoDetectado) {
    respostaFinal =
      `Certo! Atendemos esse tipo de serviço: *${servicoDetectado.categoria}*.\n` +
      `⏱️ Tempo estimado: *${servicoDetectado.tempo}*.\n` +
      `${servicoDetectado.resposta}\n\n` +
      'Por favor, me informe:\n' +
      '📍 Seu endereço\n' +
      '🕐 Melhor dia e horário\n' +
      '📸 E se possível, envie uma foto do local.';
  }

  // 4) Fallback via OpenAI (se nada acima respondeu)
  if (!respostaFinal) {
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

      const content = completion?.data?.choices?.[0]?.message?.content?.trim();
      respostaFinal =
        content && content.length > 0
          ? content
          : 'Posso ajudar com pequenos reparos! Qual serviço você precisa?';
    } catch (err) {
      console.error('Erro na OpenAI:', err.response?.data || err.message);
      respostaFinal =
        'Desculpe, tive um problema para processar agora. Pode me dizer qual serviço você precisa (ex.: trocar torneira, instalar luminária, pendurar espelho)?';
    }
  }

  // 5) Encerramento automático se o cliente já informou dados de agendamento
  const forneceuDados = includesAny(userMsgNorm, indiciosEncerramento);
  if (forneceuDados) {
    respostaFinal += `\n\n${encerramentoFrase}`;
  }

  // 6) Envio pelo Twilio
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

    // Observação: se for erro 63038 (limite de mensagens do Sandbox), não há como enviar notificação ao cliente.
    // Mas registramos nos logs para você ver no Render.
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => {
  res.send('Resolve Já – IA ativa!');
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
