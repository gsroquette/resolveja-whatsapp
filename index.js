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
    palavras: ['lâmpada', 'lampada', 'tomada', 'interruptor', 'chuveiro', 'luminária', 'luminaria', 'luz'],
    tempo: 'até 1 hora',
    resposta: 'Esse serviço costuma levar até 1 hora e pode ser agendado com preço fixo.'
  },
  {
    categoria: 'hidráulica',
    palavras: [
      'torneira', 'rabicho', 'sifão', 'sifao', 'ralo', 'registro',
      'válvula', 'valvula', 'descarga', 'vaso sanitário', 'vaso sanitario', 'caixa acoplada'
    ],
    tempo: 'até 2 horas',
    resposta: 'Esse tipo de reparo costuma levar até 2 horas. Podemos agendar com preço fixo ou fazer orçamento rápido no local.'
  },
  {
    categoria: 'instalação',
    palavras: [
      'fogão', 'fogao', 'máquina de lavar', 'maquina de lavar',
      'lava-louças', 'lava louças', 'lava-loucas', 'lava loucas'
    ],
    tempo: 'até 2 horas (com ponto pronto)',
    resposta: 'A instalação costuma levar até 2 horas se o ponto já estiver pronto. Agendamos com preço fixo ou avaliamos no local.'
  },
  {
    categoria: 'paredes e acabamento',
    palavras: [
      'quadro', 'prateleira', 'espelho', 'buraco', 'pintura', 'mofo',
      'rejunte', 'massa corrida', 'pendurar'
    ],
    tempo: '1 a 2 horas, podendo variar',
    resposta: 'Esse serviço pode levar de 1 a 2 horas, dependendo da complexidade. Em casos maiores, fazemos orçamento.'
  },
  {
    categoria: 'ajustes em móveis ou portas',
    palavras: ['porta', 'gaveta', 'armário', 'armario', 'dobradiça', 'dobradica', 'fechadura'],
    tempo: 'até 2 horas',
    resposta: 'Podemos realizar esse ajuste em até 2 horas. Agendamos com preço fixo.'
  },
  {
    categoria: 'desentupimento',
    palavras: ['entupido', 'desentupir', 'desentupimento', 'entupimento'],
    tempo: 'até 1 hora (leve) ou mais (grave)',
    resposta: 'Se for um entupimento leve, resolvemos em até 1 hora. Casos mais graves exigem avaliação no local.'
  }
];

/* ------------------------------ Palavras-chave ------------------------------ */
const precoKeywords = [
  'preço','preco','quanto custa','valor','cobra quanto','custo','qual o valor','quanto é','quanto e','preço da visita','preco da visita'
];
const saudacoes = ['oi','olá','ola','bom dia','boa tarde','boa noite','e aí','e ai'];

/* ------------------------------ Textos ------------------------------ */
const encerramentoBase =
  '📍 Me diga seu *endereço completo* e o *melhor dia/horário* para atendimento.\n' +
  '📞 *Um técnico da nossa equipe vai entrar em contato com você.*';

const followupMsg =
  '🔎 *Enquanto aguarda o contato do técnico*, pode nos ajudar com algumas informações?\n' +
  '• Há algo específico que devamos saber sobre o problema?\n' +
  '• O item/peça necessária já está no local?\n' +
  '• Poderia enviar *fotos* do local/equipamento? Isso nos ajuda a chegar mais preparados. 🙏';

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

const promptIA =
  'Você é a atendente virtual da Resolve Já – Reparos e Manutenção. ' +
  'Se a mensagem não deixar claro o serviço, peça que o cliente diga em uma frase curta o serviço desejado (ex.: trocar torneira, instalar luminária, pendurar espelho). ' +
  'Se possível, tente inferir a categoria (elétrica, hidráulica, instalação, paredes/acabamento, portas/móveis, desentupimento). ' +
  'Se identificar a categoria, responda apenas com a categoria (uma palavra). Do contrário, peça a frase curta. ' +
  'Nunca diga que é uma IA. Seja objetiva.';

/* ------------------------------ Menu numerado ------------------------------ */
const menuTexto =
  'Não identifiquei claramente o tipo de serviço. Por favor, escolha uma opção *respondendo só o número*:\n' +
  '1️⃣ Elétrica\n' +
  '2️⃣ Hidráulica\n' +
  '3️⃣ Instalação de eletrodomésticos\n' +
  '4️⃣ Paredes e acabamento\n' +
  '5️⃣ Portas e móveis\n' +
  '6️⃣ Desentupimento';

const menuMap = {
  '1': 'elétrica',
  '2': 'hidráulica',
  '3': 'instalação',
  '4': 'paredes e acabamento',
  '5': 'ajustes em móveis ou portas',
  '6': 'desentupimento'
};

/* ------------------------------ Estado em memória por número ------------------------------ */
/**
 * Por número "from" (Twilio), armazenamos:
 * {
 *   servico: string|null,         // categoria detectada
 *   fechamentoEnviado: boolean,   // já enviou "técnico vai entrar em contato"
 *   followupEnviado: boolean,     // já enviou pergunta extra (detalhes/fotos)
 *   desconhecidasSeguidas: number,// seq. de msgs sem conseguir entender serviço
 *   aguardandoMenu: boolean       // se menu numerado foi enviado e aguardamos 1–6
 * }
 */
const historico = new Map();

/* ------------------------------ Helpers ------------------------------ */
function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
function findServicoByCategoria(cat) {
  const ncat = normalize(cat);
  return servicos.find((s) => normalize(s.categoria) === ncat) || null;
}

/* Heurísticas leves para detectar endereço/horário só para disparar follow-up (opcional) */
const indiciosEndereco = ['rua','avenida','av ','alameda','travessa','estrada','rodovia','bairro','nº','numero','número','ap ','apt','apartamento'];
const indiciosHorario = ['amanhã','amanha','hoje','manhã','manha','tarde','noite','horário','horario','às ','as ','8:00','9:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
const horaRegex = /\b([01]?\d|2[0-3])[:h][0-5]\d\b/;

/* ------------------------------ Webhook ------------------------------ */
app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const userMsg = (req.body.Body || '').toString();
  const userMsgNorm = normalize(userMsg);

  let h = historico.get(from);
  if (!h) {
    h = { servico: null, fechamentoEnviado: false, followupEnviado: false, desconhecidasSeguidas: 0, aguardandoMenu: false };
  }

  // 0) Perguntas de preço: responder sempre que aparecerem
  if (includesAny(userMsg, precoKeywords)) {
    try { await sendWhatsapp(from, respostaPreco); historico.set(from, h); return res.sendStatus(200); }
    catch (err) { console.error('Twilio preço:', err.response?.data || err.message); return res.sendStatus(500); }
  }

  // 1) Saudação curta
  if (includesAny(userMsg, saudacoes) && userMsgNorm.length <= 40 && !h.fechamentoEnviado) {
    const msg = 'Olá! 👋 Diga em uma frase o serviço que precisa (ex.: *trocar torneira*, *instalar luminária*, *pendurar espelho*).';
    try { await sendWhatsapp(from, msg); historico.set(from, h); return res.sendStatus(200); }
    catch (err) { console.error('Twilio saudação:', err.response?.data || err.message); return res.sendStatus(500); }
  }

  // 2) Se está aguardando retorno do menu e o cliente respondeu 1–6
  if (h.aguardandoMenu) {
    const m = userMsgNorm.match(/^\s*([1-6])\b/);
    if (m) {
      const cat = menuMap[m[1]];
      const serv = findServicoByCategoria(cat);
      h.servico = serv ? serv.categoria : cat;
      h.aguardandoMenu = false;

      const tempo = serv?.tempo || 'tempo estimado variável';
      const textoCat = serv?.resposta || 'Podemos avaliar rapidamente e orientar o melhor formato.';
      const respostaServico =
        `Certo! Atendemos esse serviço: *${h.servico}*.\n` +
        `⏱️ Tempo estimado: *${tempo}*.\n` +
        `${textoCat}\n\n` +
        `${encerramentoBase}`;

      try { await sendWhatsapp(from, respostaServico); h.fechamentoEnviado = true; historico.set(from, h); return res.sendStatus(200); }
      catch (err) { console.error('Twilio menu -> serviço:', err.response?.data || err.message); return res.sendStatus(500); }
    }
    // Se respondeu algo que não é 1–6, apenas repita o menu uma vez e siga
    try { await sendWhatsapp(from, menuTexto); historico.set(from, h); return res.sendStatus(200); }
    catch (err) { console.error('Twilio reenvio menu:', err.response?.data || err.message); return res.sendStatus(500); }
  }

  // 3) Tentativa direta por palavras-chave
  const servicoDetectado = servicos.find((s) => includesAny(userMsg, s.palavras));
  if (servicoDetectado && !h.fechamentoEnviado) {
    h.servico = servicoDetectado.categoria;
    const respostaServico =
      `Certo! Atendemos esse serviço: *${servicoDetectado.categoria}*.\n` +
      `⏱️ Tempo estimado: *${servicoDetectado.tempo}*.\n` +
      `${servicoDetectado.resposta}\n\n` +
      `${encerramentoBase}`;

    try { await sendWhatsapp(from, respostaServico); h.fechamentoEnviado = true; historico.set(from, h); return res.sendStatus(200); }
    catch (err) { console.error('Twilio serviço direto:', err.response?.data || err.message); return res.sendStatus(500); }
  }

  // 4) Se já fechamos (avisamos técnico), só disparamos 1 follow-up quando detectar endereço/horário
  const indicouEndereco = includesAny(userMsg, indiciosEndereco);
  const indicouHorario = includesAny(userMsg, indiciosHorario) || horaRegex.test(userMsgNorm);
  if (h.fechamentoEnviado && !h.followupEnviado && (indicouEndereco || indicouHorario)) {
    try { await sendWhatsapp(from, followupMsg); h.followupEnviado = true; historico.set(from, h); return res.sendStatus(200); }
    catch (err) { console.error('Twilio follow-up:', err.response?.data || err.message); return res.sendStatus(500); }
  }

  // 5) Se ainda não há serviço: usar IA uma vez; se ainda vago, menu; se continuar, encaminhar
  if (!h.servico && !h.fechamentoEnviado) {
    h.desconhecidasSeguidas += 1;

    // Tentativa 1: pedir frase curta / tentar inferir categoria via IA
    if (h.desconhecidasSeguidas === 1) {
      try {
        const completion = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          { model: 'gpt-4o-mini-2024-07-18', messages: [
              { role: 'system', content: promptIA },
              { role: 'user', content: userMsg }
            ] },
          { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' } }
        );

        const iaText = completion?.data?.choices?.[0]?.message?.content?.trim()?.toLowerCase() || '';
        // Se a IA respondeu com uma das categorias, já fecha
        const possivelCat = Object.values(menuMap).find(cat => iaText.includes(normalize(cat)));
        if (possivelCat) {
          const serv = findServicoByCategoria(possivelCat);
          h.servico = serv ? serv.categoria : possivelCat;
          const tempo = serv?.tempo || 'tempo estimado variável';
          const textoCat = serv?.resposta || 'Podemos avaliar rapidamente e orientar o melhor formato.';
          const respostaServico =
            `Certo! Atendemos esse serviço: *${h.servico}*.\n` +
            `⏱️ Tempo estimado: *${tempo}*.\n` +
            `${textoCat}\n\n` +
            `${encerramentoBase}`;
          await sendWhatsapp(from, respostaServico);
          h.fechamentoEnviado = true;
          historico.set(from, h);
          return res.sendStatus(200);
        }

        // Caso contrário, pede a frase curta
        await sendWhatsapp(from, 'Para agilizar, me diga em uma frase o serviço (ex.: *trocar torneira*, *instalar luminária*, *pendurar espelho*).');
        historico.set(from, h);
        return res.sendStatus(200);
      } catch (err) {
        console.error('OpenAI tentativa 1:', err.response?.data || err.message);
        try { await sendWhatsapp(from, 'Para agilizar, me diga em uma frase o serviço (ex.: *trocar torneira*, *instalar luminária*, *pendurar espelho*).'); }
        catch (e2) { console.error('Twilio fallback t1:', e2.response?.data || e2.message); }
        historico.set(from, h);
        return res.sendStatus(200);
      }
    }

    // Tentativa 2: menu numerado
    if (h.desconhecidasSeguidas === 2) {
      try { await sendWhatsapp(from, menuTexto); h.aguardandoMenu = true; historico.set(from, h); return res.sendStatus(200); }
      catch (err) { console.error('Twilio menu t2:', err.response?.data || err.message); return res.sendStatus(500); }
    }

    // Tentativa 3+: encaminhar direto para técnico (sem insistir)
    const msg =
      'Sem problemas! Vou pedir para um técnico entrar em contato com você para entender melhor. ' +
      'Se puder, já me envie o *endereço* e o *melhor dia/horário*.';
    try { await sendWhatsapp(from, msg); h.fechamentoEnviado = true; historico.set(from, h); return res.sendStatus(200); }
    catch (err) { console.error('Twilio t3 encaminhar:', err.response?.data || err.message); return res.sendStatus(500); }
  }

  // 6) Caso já tenha fechado e não seja follow-up, mantemos silêncio para evitar ruído
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
