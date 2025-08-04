const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

/* ------------------------------ Catálogo ------------------------------ */
const servicos = [
  {
    categoria: 'elétrica',
    palavras: ['lâmpada', 'lampada', 'tomada', 'interruptor', 'chuveiro', 'luminária', 'luminaria'],
    tempo: 'até 1 hora',
    resposta:
      'Esse serviço costuma levar até 1 hora e pode ser agendado com preço fixo.'
  },
  {
    categoria: 'hidráulica',
    palavras: [
      'torneira',
      'rabicho',
      'sifão',
      'sifao',
      'ralo',
      'registro',
      'válvula',
      'valvula',
      'descarga',
      'vaso sanitário',
      'vaso sanitario',
      'caixa acoplada'
    ],
    tempo: 'até 2 horas',
    resposta:
      'Esse tipo de reparo costuma levar até 2 horas. Podemos agendar com preço fixo ou fazer orçamento rápido no local.'
  },
  {
    categoria: 'instalação',
    palavras: ['fogão', 'fogao', 'máquina de lavar', 'maquina de lavar', 'lava-louças', 'lava louças', 'lava loucas', 'lava-loucas'],
    tempo: 'até 2 horas (com ponto pronto)',
    resposta:
      'A instalação costuma levar até 2 horas se o ponto já estiver pronto. Agendamos com preço fixo ou avaliamos no local.'
  },
  {
    categoria: 'paredes e acabamento',
    palavras: [
      'quadro',
      'prateleira',
      'espelho',
      'buraco',
      'pintura',
      'mofo',
      'rejunte',
      'massa corrida',
      'pendurar'
    ],
    tempo: '1 a 2 horas, podendo variar',
    resposta:
      'Esse serviço pode levar de 1 a 2 horas, dependendo da complexidade. Em casos maiores, fazemos orçamento.'
  },
  {
    categoria: 'ajustes em móveis ou portas',
    palavras: ['porta', 'gaveta', 'armário', 'armario', 'dobradiça', 'dobradica', 'fechadura'],
    tempo: 'até 2 horas',
    resposta:
      'Podemos realizar esse ajuste em até 2 horas. Agendamos com preço fixo.'
  },
  {
    categoria: 'desentupimento',
    palavras: ['entupido', 'desentupir', 'desentupimento', 'entupimento'],
    tempo: 'até 1 hora (leve) ou mais (grave)',
    resposta:
      'Se for um entupimento leve, resolvemos em até 1 hora. Casos mais graves exigem avaliação no local.'
  }
];

const precoKeywords = [
  'preço','preco','quanto custa','valor','cobra quanto','custo','qual o valor','quanto é','quanto e','preço da visita','preco da visita'
];

const saudacoes = ['oi','olá','ola','bom dia','boa tarde','boa noite','e aí','e ai'];

/* ------------------------------ Textos ------------------------------ */
const encerramentoFrase =
  '✅ *Obrigado! Suas informações foram recebidas.*\n' +
  '📞 Um técnico da nossa equipe vai entrar em contato para confirmar os detalhes e combinar a visita.';

const respostaPreco =
  '💰 Os valores variam conforme o tipo de serviço. Funciona assim:\n\n' +
  '1️⃣ *Serviços simples (até 1 hora)*\n' +
  '• Visita + 1 serviço: *R$ 120*\n' +
  '• Visita + 2 serviços: *R$ 160*\n' +
  '• Hora extra: *R$ 60*\n\n' +
  '2️⃣ *Serviços com tempo variável (1 a 2 horas)*\n' +
  '• Começa com o pacote acima\n' +
  '• Se passar de 1h, avisamos antes e cobramos hora extra\n\n' +
  '3️⃣ *Serviços complexos (quebra de parede, local difícil)*\n' +
  '• Fazemos uma visita de diagnóstico (*R$ 120*)\n' +
  '• O valor é abatido se você aprovar o orçamento.\n\n' +
  '📸 Se puder, envie uma foto do local para analisarmos melhor.';

const fallbackPrompt =
  'Você é a atendente virtual da Resolve Já – Reparos e Manutenção. ' +
  'Seja profissional e objetiva. Se a mensagem não deixar claro o serviço, peça que diga o serviço de forma curta ' +
  '(ex.: trocar torneira, instalar luminária, pendurar espelho). ' +
  'Em seguida, peça endereço e melhor horário e informe que um técnico vai entrar em contato. Não repita informações. Nunca diga que é uma IA.';

/* ------------------------------ Estado em memória ------------------------------ */
/** Histórico leve por número:
 * {
 *   servico: string|null,
 *   enderecoOk: boolean,
 *   horarioOk: boolean,
 *   followupEnviado: boolean,
 *   lembretePendente: boolean,
 *   desconhecidasSeguidas: number
 * }
 */
const historico = new Map();

/* ------------------------------ Helpers ------------------------------ */
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function includesAny(texto, lista) {
  const t = normalize(texto);
  return lista.some((p) => t.includes(normalize(p)));
}

function getTwilioFrom() {
  const n = process.env.TWILIO_SANDBOX_NUMBER || '';
  return n.startsWith('whatsapp:') ? n : `whatsapp:${n}`;
}

async function sendWhatsapp(to, body) {
  return axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
    new URLSearchParams({ Body: body, From: getTwilioFrom(), To: to }),
    { auth: { username: process.env.TWILIO_ACCOUNT_SID, password: process.env.TWILIO_AUTH_TOKEN } }
  );
}

async function sendSequence(to, messages) {
  for (const m of messages) {
    if (m && m.trim().length > 0) {
      await sendWhatsapp(to, m);
    }
  }
}

/* Heurísticas simples de endereço/horário */
const indiciosEndereco = [
  'rua','avenida','av ','alameda','travessa','estrada','rodovia','bairro','nº','numero','número','ap ','apt','apartamento'
];
const indiciosHorario = [
  'amanhã','amanha','hoje','manhã','manha','tarde','noite','horário','horario','às ','as ','as ','8:00','9:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'
];
const horaRegex = /\b([01]?\d|2[0-3])[:h][0-5]\d\b/;

/* ------------------------------ Webhook ------------------------------ */
app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const userMsg = (req.body.Body || '').toString();
  const userMsgNorm = normalize(userMsg);

  let h = historico.get(from);
  if (!h) {
    h = {
      servico: null,
      enderecoOk: false,
      horarioOk: false,
      followupEnviado: false,
      lembretePendente: false,
      desconhecidasSeguidas: 0
    };
  }

  /* 1) Perguntas de preço: resposta direta e curta */
  if (includesAny(userMsg, precoKeywords)) {
    try {
      await sendWhatsapp(from, respostaPreco);
      historico.set(from, h);
      return res.sendStatus(200);
    } catch (err) {
      console.error('Twilio preço:', err.response?.data || err.message);
      return res.sendStatus(500);
    }
  }

  /* 2) Saudação simples */
  if (includesAny(userMsg, saudacoes) && userMsgNorm.length <= 40) {
    const msg =
      'Olá! 👋 Como posso ajudar com seus pequenos reparos?\n' +
      'Se preferir, diga o serviço (ex.: *trocar torneira*, *instalar luminária*, *pendurar espelho*).';
    try {
      await sendWhatsapp(from, msg);
      historico.set(from, h);
      return res.sendStatus(200);
    } catch (err) {
      console.error('Twilio saudação:', err.response?.data || err.message);
      return res.sendStatus(500);
    }
  }

  /* 3) Detecta serviço por palavras-chave (simples e direto) */
  const servicoDetectado = servicos.find((s) => includesAny(userMsg, s.palavras));

  if (!h.servico && servicoDetectado) {
    // Primeira vez que identifica o serviço
    h.servico = servicoDetectado.categoria;
    h.desconhecidasSeguidas = 0;

    const respostaServico =
      `Certo! Atendemos esse serviço: *${servicoDetectado.categoria}*.\n` +
      `⏱️ Tempo estimado: *${servicoDetectado.tempo}*.\n` +
      `${servicoDetectado.resposta}\n\n` +
      'Para seguirmos, me envie:\n' +
      '• 📍 *Endereço completo*\n' +
      '• 🕐 *Melhor dia e horário*\n\n' +
      '📞 *Um técnico vai entrar em contato para combinar os detalhes.*';

    try {
      await sendWhatsapp(from, respostaServico);
    } catch (err) {
      console.error('Twilio serviço:', err.response?.data || err.message);
      return res.sendStatus(500);
    }
  }

  /* 4) Atualiza flags de endereço / horário */
  if (includesAny(userMsg, indiciosEndereco)) h.enderecoOk = true;
  if (includesAny(userMsg, indiciosHorario) || horaRegex.test(userMsgNorm)) h.horarioOk = true;

  /* 5) Se serviço claro + endereço + horário → encerra e envia follow-up opcional */
  if (h.servico && h.enderecoOk && h.horarioOk) {
    const mensagens = [];
    // Envia agradecimento/encerramento (uma única vez por sequência)
    mensagens.push(encerramentoFrase);

    // Follow-up para preparar o técnico (uma única vez)
    if (!h.followupEnviado) {
      mensagens.push(
        '🔎 *Enquanto aguarda o contato do técnico*, pode nos ajudar com algumas informações?\n' +
        '• Há algo específico que devamos saber sobre o problema?\n' +
        '• O item/peça necessária já está no local?\n' +
        '• Poderia enviar *fotos* do local/equipamento? Isso nos ajuda a chegar mais preparados. 🙏'
      );
      h.followupEnviado = true;
    }

    try {
      await sendSequence(from, mensagens);
      historico.set(from, h);
      return res.sendStatus(200);
    } catch (err) {
      console.error('Twilio encerramento/follow-up:', err.response?.data || err.message);
      return res.sendStatus(500);
    }
  }

  /* 6) Se já sabemos o serviço e ainda faltam dados → lembrete curto (somente se necessário) */
  if (h.servico && !(h.enderecoOk && h.horarioOk)) {
    // envia lembrete somente 1x até chegar um dado novo
    if (!h.lembretePendente) {
      const faltando = !h.enderecoOk && !h.horarioOk
        ? 'o *endereço completo* e o *melhor dia/horário*'
        : !h.enderecoOk
          ? 'o *endereço completo*'
          : 'o *melhor dia/horário*';

      const lembrete =
        `Perfeito! Para seguirmos, me envie ${faltando}. ` +
        `Assim o técnico já entra em contato para confirmar.`;
      try {
        await sendWhatsapp(from, lembrete);
        h.lembretePendente = true; // evita repetir
        historico.set(from, h);
        return res.sendStatus(200);
      } catch (err) {
        console.error('Twilio lembrete:', err.response?.data || err.message);
        return res.sendStatus(500);
      }
    } else {
      // Se a pessoa respondeu algo (qualquer coisa), liberamos novo lembrete se ainda faltar algum dado
      h.lembretePendente = false;
      historico.set(from, h);
      return res.sendStatus(200);
    }
  }

  /* 7) Se serviço ainda não foi identificado → usa OpenAI UMA vez por mensagem */
  if (!h.servico && !servicoDetectado) {
    h.desconhecidasSeguidas += 1;

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
      const respostaIA =
        content && content.length > 0
          ? content
          : 'Para agilizar, me diga de forma curta qual serviço você precisa (ex.: trocar torneira, instalar luminária, pendurar espelho).';

      await sendWhatsapp(from, respostaIA);
    } catch (err) {
      console.error('OpenAI fallback erro:', err.response?.data || err.message);
      await sendWhatsapp(
        from,
        'Para agilizar, me diga de forma curta qual serviço você precisa (ex.: trocar torneira, instalar luminária, pendurar espelho).'
      );
    }

    // Se o cliente "enrola" (3 mensagens sem identificar serviço), encaminha gentilmente
    if (h.desconhecidasSeguidas >= 3) {
      try {
        await sendWhatsapp(
          from,
          'Sem problemas! Vou pedir para um técnico te ligar e entender melhor. ' +
          'Se puder, já me envie o *endereço* e o *melhor dia/horário*.'
        );
      } catch (err) {
        console.error('Twilio encaminhar técnico:', err.response?.data || err.message);
      }
    }

    historico.set(from, h);
    return res.sendStatus(200);
  }

  // Se nada acima exigiu resposta (situação rara), não responda para evitar ruído.
  historico.set(from, h);
  return res.sendStatus(200);
});

/* ------------------------------ Healthcheck ------------------------------ */
app.get('/', (req, res) => {
  res.send('Resolve Já – IA ativa!');
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
