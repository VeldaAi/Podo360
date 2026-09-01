// ─────────────────────────────────────────────────────────────
// Podo360 — Treatment consent document templates
// Source: "receita da MCR.pdf" (Centro de Podologia Avançado
// Adriana Andrade) — digitized 2026-08-24 for digital signing.
// PT text is faithful to the source; ES/EN are translations.
// ─────────────────────────────────────────────────────────────
'use strict';

// Placeholders replaced at render time:
//  {{patient_name}} {{birth_date}} {{cpf}} {{phone}} {{city}}
//  {{date}} {{treatment}} {{professional}} {{guardian_name}}

const DOCS = [
  {
    key: 'intake',
    signer: 'patient',
    title: { pt: 'Ficha de Anamnese', es: 'Ficha de Anamnesis', en: 'Intake Form' },
    sections: [] // content built dynamically from patient anamnesis
  },
  {
    key: 'consentimento-geral',
    signer: 'patient',
    title: { pt: 'Termo de Consentimento Geral', es: 'Consentimiento General', en: 'General Consent Form' },
    sections: [
      { h: { pt: 'TERMO DE CONSENTIMENTO', es: 'CONSENTIMIENTO INFORMADO', en: 'INFORMED CONSENT' }, body: {
        pt: 'Eu, {{patient_name}}, portador(a) do CPF {{cpf}}, declaro para os devidos fins:',
        es: 'Yo, {{patient_name}}, portador del CPF {{cpf}}, declaro a los efectos oportunos:',
        en: 'I, {{patient_name}}, holder of CPF {{cpf}}, declare for all purposes:'
      } },
      { h: null, body: {
        pt: '1) Que fui informado(a) dos procedimentos aos quais serei submetido(a) no Centro de Podologia, bem como dos riscos e reações que possam vir a apresentar, isentando de responsabilidade o profissional.',
        es: '1) Que fui informado(a) de los procedimientos a los que seré sometido(a) en el Centro de Podología, así como de los riesgos y reacciones que puedan presentarse, eximiendo de responsabilidad al profesional.',
        en: '1) That I have been informed of the procedures I will undergo at the Podology Center, as well as the risks and reactions that may arise, releasing the professional from liability.'
      } },
      { h: null, body: {
        pt: '2) O procedimento e todas as implicações relativas ao mesmo me foram esclarecidas e eu estou ciente de qualquer responsabilidade e reações que por ventura venham apresentar.',
        es: '2) El procedimiento y todas sus implicaciones me fueron aclarados y soy consciente de cualquier responsabilidad y reacción que pueda presentarse.',
        en: '2) The procedure and all its implications have been explained to me, and I am aware of any responsibility and reactions that may arise.'
      } },
      { h: null, body: {
        pt: '3) Ao iniciar o procedimento, a profissional informou-me sobre o procedimento e mostrou-me os produtos que foram selecionados para o procedimento.',
        es: '3) Al iniciar el procedimiento, la profesional me informó sobre el procedimiento y me mostró los productos seleccionados para el mismo.',
        en: '3) Before starting, the professional informed me about the procedure and showed me the products selected for it.'
      } },
      { h: null, body: {
        pt: '4) Assumo responsabilidade nos procedimentos pós, pois afirmo que recebi as instruções necessárias (cuidados pós) e comprometo-me a segui-las corretamente.',
        es: '4) Asumo la responsabilidad en los procedimientos posteriores, pues afirmo haber recibido las instrucciones necesarias (cuidados posteriores) y me comprometo a seguirlas correctamente.',
        en: '4) I take responsibility for post-procedure care, as I confirm I received the necessary instructions (aftercare) and commit to following them correctly.'
      } },
      { h: null, body: {
        pt: '5) Autorizo, gratuitamente, o uso da minha imagem para divulgação por meio de fotos e vídeos em reprodução na internet, por meio de todas as plataformas digitais.  [ ] Sim   [ ] Não',
        es: '5) Autorizo gratuitamente el uso de mi imagen para divulgación mediante fotos y videos en internet, a través de todas las plataformas digitales.  [ ] Sí   [ ] No',
        en: '5) I freely authorize the use of my image for publicity through photos and videos on the internet, on all digital platforms.  [ ] Yes   [ ] No'
      } },
      { h: null, body: {
        pt: 'Declaro que autorizo a profissional a realizar o procedimento marcado acima e confirmo meu desejo de executar a técnica e que estou ciente dos cuidados que devo tomar pós-procedimento.',
        es: 'Declaro que autorizo a la profesional a realizar el procedimiento marcado arriba y confirmo mi deseo de ejecutar la técnica, siendo consciente de los cuidados posteriores.',
        en: 'I declare that I authorize the professional to perform the procedure marked above and confirm my wish to undergo the technique, aware of the aftercare required.'
      } }
    ]
  },
  {
    key: 'onicocriptose',
    signer: 'patient',
    title: { pt: 'Contrato Onicocriptose', es: 'Contrato Onicocriptosis', en: 'Ingrown Toenail Contract' },
    sections: [
      { h: { pt: 'CONTRATO ONICOCRIPTOSE — TERMO DE CONSENTIMENTO', es: 'CONTRATO ONICOCRIPTOSIS — CONSENTIMIENTO', en: 'INGROWN TOENAIL — CONSENT CONTRACT' }, body: {
        pt: 'Paciente: {{patient_name}}   Data de Nascimento: {{birth_date}}   Tratamento Realizado: {{treatment}}   Início: {{date}}',
        es: 'Paciente: {{patient_name}}   Fecha de nacimiento: {{birth_date}}   Tratamiento realizado: {{treatment}}   Inicio: {{date}}',
        en: 'Patient: {{patient_name}}   Date of birth: {{birth_date}}   Treatment: {{treatment}}   Start: {{date}}'
      } },
      { h: null, body: {
        pt: 'Declaro estar ciente de tudo, inclusive dos riscos oferecidos e do resultado que pode ser apenas relativo, já que determinado pela individualidade de cada ser e na dependência da resposta do meu organismo.',
        es: 'Declaro ser consciente de todo, incluidos los riesgos ofrecidos y que el resultado puede ser solo relativo, ya que está determinado por la individualidad de cada ser y la respuesta de mi organismo.',
        en: 'I declare that I am aware of everything, including the risks involved and that the result may be only relative, since it depends on each individual and on my body\'s response.'
      } },
      { h: null, body: {
        pt: 'Declaro para os devidos fins, estar ciente que deverei comparecer aos ____ retornos orientados pelo profissional para acompanhamento de cicatrização e troca de curativos referente ao tratamento de onicocriptose (unha encravada) e que, em caso de necessidade de mais retornos, terei que arcar com os custos adicionais de novas sessões.',
        es: 'Declaro estar consciente de que deberé asistir a los ____ retornos indicados por el profesional para el seguimiento de la cicatrización y cambio de curativos del tratamiento de onicocriptosis (uña encarnada) y que, si se necesitan más retornos, asumiré los costos adicionales de nuevas sesiones.',
        en: 'I declare that I am aware I must attend the ____ follow-up visits advised by the professional to monitor healing and dressing changes for the ingrown toenail treatment, and that additional visits, if needed, will be charged as new sessions.'
      } },
      { h: null, body: {
        pt: 'Declaro estar ciente que, caso eu não retorne nas datas pré estabelecidas ao podólogo, este não se responsabilizará em caso de recidiva ou outra situação relacionada ao processo de onicocriptose e será cobrado o valor normal do procedimento podológico a ser realizado novamente.',
        es: 'Declaro estar consciente de que, si no regreso en las fechas establecidas, el podólogo no se responsabilizará en caso de recidiva u otra situación relacionada con la onicocriptosis, y se cobrará el valor normal del procedimiento.',
        en: 'I declare that if I fail to return on the pre-established dates, the podologist will not be held responsible in case of recurrence or any other situation related to the ingrown toenail, and the normal fee for a new procedure will apply.'
      } },
      { h: null, body: {
        pt: 'Também estou bem informado(a) de que o tabagismo, álcool e drogas podem causar complicações locais ou gerais. O consumo de alimentos gordurosos, embutidos, açúcares, cafés e refrigerantes também podem agravar a situação.',
        es: 'También estoy bien informado(a) de que el tabaquismo, el alcohol y las drogas pueden causar complicaciones locales o generales. El consumo de alimentos grasos, embutidos, azúcares, cafés y refrescos también puede agravar la situación.',
        en: 'I am also well informed that smoking, alcohol and drugs may cause local or general complications. Fatty foods, processed meats, sugars, coffee and soft drinks may also worsen the condition.'
      } },
      { h: null, body: {
        pt: 'Em caso de faltas nos retornos, estou ciente que deverei comunicar ao profissional responsável com antecedência; caso este não seja notificado do não comparecimento, o tratamento será automaticamente cancelado.',
        es: 'En caso de faltar a los retornos, estoy consciente de que debo comunicarlo al profesional con antelación; si no se le notifica la ausencia, el tratamiento se cancelará automáticamente.',
        en: 'In case of missing follow-ups, I am aware I must notify the professional in advance; if the absence is not communicated, the treatment will be automatically cancelled.'
      } },
      { h: null, body: {
        pt: 'Declaro que fui orientado(a) pelo profissional responsável a fazer o tratamento preventivo de podologia após o último retorno.',
        es: 'Declaro que fui orientado(a) por el profesional responsable a realizar el tratamiento preventivo de podología después del último retorno.',
        en: 'I declare that I was advised by the responsible professional to undergo preventive podology treatment after the last follow-up.'
      } }
    ]
  },
  {
    key: 'ortese-ungueal',
    signer: 'patient',
    title: { pt: 'Termo de Consentimento — Órtese Ungueal', es: 'Consentimiento — Órtesis Ungueal', en: 'Nail Orthosis Consent' },
    sections: [
      { h: { pt: 'TERMO DE CONSENTIMENTO E RESPONSABILIDADE – ÓRTESE UNGUEAL', es: 'CONSENTIMIENTO Y RESPONSABILIDAD – ÓRTESIS UNGUEAL', en: 'CONSENT AND RESPONSIBILITY – NAIL ORTHOSIS' }, body: {
        pt: 'Paciente: {{patient_name}}   Data de Nascimento: {{birth_date}}   Tratamento Realizado: {{treatment}}   Início: {{date}}',
        es: 'Paciente: {{patient_name}}   Fecha de nacimiento: {{birth_date}}   Tratamiento: {{treatment}}   Inicio: {{date}}',
        en: 'Patient: {{patient_name}}   Date of birth: {{birth_date}}   Treatment: {{treatment}}   Start: {{date}}'
      } },
      { h: { pt: 'SOBRE O TRATAMENTO:', es: 'SOBRE EL TRATAMIENTO:', en: 'ABOUT THE TREATMENT:' }, body: {
        pt: 'A órtese é um dispositivo aplicado na unha para correção da curvatura e melhora do crescimento, promovendo alívio de dores e desconfortos. O paciente está ciente de que: a eficácia do tratamento depende do crescimento da unha e dos cuidados diários; o tratamento requer acompanhamento periódico.',
        es: 'La órtesis es un dispositivo aplicado en la uña para corregir la curvatura y mejorar el crecimiento, aliviando dolores y molestias. El paciente es consciente de que: la eficacia depende del crecimiento de la uña y de los cuidados diarios; el tratamiento requiere seguimiento periódico.',
        en: 'The orthosis is a device applied to the nail to correct curvature and improve growth, relieving pain and discomfort. The patient is aware that: treatment effectiveness depends on nail growth and daily care; the treatment requires periodic follow-up.'
      } },
      { h: { pt: 'RETORNO E RECOLOCAÇÃO:', es: 'RETORNO Y REUBICACIÓN:', en: 'FOLLOW-UP AND REPLACEMENT:' }, body: {
        pt: 'O valor da consulta inclui 1 retorno, que deve ser feito entre 8 e 10 dias. Após esse prazo, caso não compareça, será considerado como finalizado, e para novo atendimento será cobrada nova consulta. Se a órtese se soltar dentro de 8 dias, a recolocação é gratuita. Após esse período, haverá uma taxa de R$ 30,00.',
        es: 'El valor de la consulta incluye 1 retorno, que debe realizarse entre 8 y 10 días. Pasado ese plazo, si no asiste, se considerará finalizado y se cobrará una nueva consulta. Si la órtesis se desprende dentro de 8 días, la recolocación es gratuita. Después de ese período, se aplicará una tasa de R$ 30,00.',
        en: 'The consultation fee includes 1 return visit, which must take place within 8 to 10 days. After that period, if you do not attend, the treatment is considered finished and a new consultation will be charged. If the orthosis comes off within 8 days, replacement is free. After that period, a R$ 30.00 fee applies.'
      } },
      { h: { pt: 'CUIDADOS COM A ÓRTESE:', es: 'CUIDADOS CON LA ÓRTESIS:', en: 'ORTHOSIS CARE:' }, body: {
        pt: '- Evitar impactos, puxões ou atritos na órtese. - Usar calçados confortáveis. - Evitar exposição a água quente, sauna e produtos químicos sem proteção.',
        es: '- Evitar impactos, tirones o fricción en la órtesis. - Usar calzado cómodo. - Evitar exposición a agua caliente, sauna y productos químicos sin protección.',
        en: '- Avoid impacts, pulling or friction on the orthosis. - Wear comfortable footwear. - Avoid hot water, sauna and chemical exposure without protection.'
      } },
      { h: null, body: {
        pt: 'Declaro estar ciente e de acordo com as informações e condições acima, bem como fui devidamente orientado(a) sobre o procedimento, seus cuidados e responsabilidades.',
        es: 'Declaro estar consciente y de acuerdo con la información y condiciones anteriores, y haber sido debidamente orientado(a) sobre el procedimiento, sus cuidados y responsabilidades.',
        en: 'I declare that I am aware of and agree with the above information and conditions, and that I have been properly advised about the procedure, its care and responsibilities.'
      } }
    ]
  },
  {
    key: 'peeling-ungueal',
    signer: 'patient',
    title: { pt: 'Contrato Peeling Ungueal', es: 'Contrato Peeling Ungueal', en: 'Nail Peeling Contract' },
    sections: [
      { h: { pt: 'CONTRATO PEELING UNGUEAL — TERMO DE CONSENTIMENTO', es: 'CONTRATO PEELING UNGUEAL — CONSENTIMIENTO', en: 'NAIL PEELING — CONSENT CONTRACT' }, body: {
        pt: 'Paciente: {{patient_name}}   Data de Nascimento: {{birth_date}}   Tratamento Realizado: {{treatment}}   Início: {{date}}',
        es: 'Paciente: {{patient_name}}   Fecha de nacimiento: {{birth_date}}   Tratamiento: {{treatment}}   Inicio: {{date}}',
        en: 'Patient: {{patient_name}}   Date of birth: {{birth_date}}   Treatment: {{treatment}}   Start: {{date}}'
      } },
      { h: null, body: {
        pt: 'Declaro estar ciente de todas as informações referentes ao tratamento de peeling ungueal, incluindo a aplicação de ácidos específicos para renovação da pele dos pés, e que os resultados podem variar conforme a individualidade de cada organismo.',
        es: 'Declaro estar consciente de toda la información referente al tratamiento de peeling ungueal, incluyendo la aplicación de ácidos específicos para la renovación de la piel de los pies, y que los resultados pueden variar según la individualidad de cada organismo.',
        en: 'I declare that I am aware of all information regarding the nail peeling treatment, including the application of specific acids to renew the skin of the feet, and that results may vary according to each individual.'
      } },
      { h: null, body: {
        pt: 'Estou ciente de que o ácido utilizado continua agindo na pele após a aplicação, sendo fundamental o comparecimento ao retorno indicado pelo(a) profissional, para avaliação da resposta da pele, acompanhamento do processo de descamação e aplicação de novos produtos, se necessário.',
        es: 'Soy consciente de que el ácido utilizado continúa actuando sobre la piel tras la aplicación, siendo fundamental asistir al retorno indicado por el/la profesional para evaluar la respuesta de la piel, acompañar la descamación y aplicar nuevos productos si es necesario.',
        en: 'I am aware that the acid used continues to act on the skin after application, making it essential to attend the follow-up advised by the professional to assess skin response, monitor peeling and apply new products if needed.'
      } },
      { h: null, body: {
        pt: 'Declaro ter sido informado(a) de que o não comparecimento aos retornos pode acarretar em efeitos adversos, como ressecamento excessivo, irritações, queimaduras, escurecimento da pele e descamação desigual. Caso isso ocorra, estarei ciente de que o procedimento terá que ser refeito e será cobrado como novo atendimento.',
        es: 'Declaro haber sido informado(a) de que la inasistencia a los retornos puede causar efectos adversos, como resequedad excesiva, irritaciones, quemaduras, oscurecimiento de la piel y descamación desigual. De ocurrir, seré consciente de que el procedimiento deberá repetirse y se cobrará como nueva atención.',
        en: 'I declare that I have been informed that failing to attend follow-ups may cause adverse effects such as excessive dryness, irritation, burns, skin darkening and uneven peeling. Should this occur, I am aware the procedure will need to be redone and charged as a new appointment.'
      } },
      { h: { pt: 'CUIDADOS PÓS-PROCEDIMENTO:', es: 'CUIDADOS POSTERIORES:', en: 'AFTERCARE:' }, body: {
        pt: 'Fui orientado(a) sobre os cuidados pós-procedimento, incluindo, mas não se limitando a: não puxar ou remover pele descamada; manter os pés limpos e secos; hidratar apenas com os produtos indicados pelo profissional; usar calçados abertos ou confortáveis sempre que possível.',
        es: 'Fui orientado(a) sobre los cuidados posteriores, incluyendo: no arrancar la piel descamada; mantener los pies limpios y secos; hidratar solo con los productos indicados por el profesional; usar calzado abierto o cómodo siempre que sea posible.',
        en: 'I have been advised on aftercare, including but not limited to: do not pull or remove peeling skin; keep feet clean and dry; moisturize only with products recommended by the professional; wear open or comfortable footwear whenever possible.'
      } },
      { h: null, body: {
        pt: 'Tenho conhecimento de que o uso de substâncias como cigarro, álcool e drogas pode prejudicar a resposta da pele ao tratamento e comprometer os resultados. Alimentação desequilibrada também pode interferir negativamente no processo de regeneração cutânea. Comprometo-me a informar ao profissional com antecedência em caso de impossibilidade de comparecer aos retornos. Caso eu não comunique, o tratamento será automaticamente cancelado e uma nova sessão será cobrada, se for necessário retomar.',
        es: 'Sé que el uso de sustancias como cigarrillo, alcohol y drogas puede perjudicar la respuesta de la piel y comprometer los resultados. La alimentación desequilibrada también puede interferir negativamente. Me comprometo a informar al profesional con antelación si no puedo asistir a los retornos. Si no lo comunico, el tratamiento se cancelará automáticamente y se cobrará una nueva sesión si es necesario retomarlo.',
        en: 'I am aware that substances such as cigarettes, alcohol and drugs can harm the skin\'s response to treatment and compromise results. An unbalanced diet can also interfere negatively with skin regeneration. I commit to informing the professional in advance if I cannot attend follow-ups. If I do not communicate this, the treatment will be automatically cancelled and a new session will be charged if needed.'
      } },
      { h: null, body: {
        pt: 'Declaro, por fim, que compreendi todas as orientações, que minhas dúvidas foram esclarecidas, e que autorizo, de forma livre e consciente, a realização do peeling ungueal.',
        es: 'Declaro, por último, que comprendí todas las orientaciones, que mis dudas fueron aclaradas y que autorizo, de forma libre y consciente, la realización del peeling ungueal.',
        en: 'Finally, I declare that I understood all the instructions, that my questions were answered, and that I freely and consciously authorize the nail peeling procedure.'
      } }
    ]
  },
  {
    key: 'peeling-podal',
    signer: 'patient',
    title: { pt: 'Contrato Peeling Podal', es: 'Contrato Peeling Podal', en: 'Foot Peeling Contract' },
    sections: [
      { h: { pt: 'CONTRATO PEELING PODAL — TERMO DE CONSENTIMENTO', es: 'CONTRATO PEELING PODAL — CONSENTIMIENTO', en: 'FOOT PEELING — CONSENT CONTRACT' }, body: {
        pt: 'Paciente: {{patient_name}}   Data de Nascimento: {{birth_date}}   Tratamento Realizado: {{treatment}}   Início: {{date}}',
        es: 'Paciente: {{patient_name}}   Fecha de nacimiento: {{birth_date}}   Tratamiento: {{treatment}}   Inicio: {{date}}',
        en: 'Patient: {{patient_name}}   Date of birth: {{birth_date}}   Treatment: {{treatment}}   Start: {{date}}'
      } },
      { h: null, body: {
        pt: 'Declaro estar ciente de todas as informações referentes ao tratamento de peeling podal, incluindo a aplicação de ácidos específicos para renovação da pele dos pés, e que os resultados podem variar conforme a individualidade de cada organismo. Estou ciente de que o ácido utilizado continua agindo na pele após a aplicação, sendo fundamental o comparecimento ao retorno indicado pelo(a) profissional, para avaliação da resposta da pele, acompanhamento do processo de descamação e aplicação de novos produtos, se necessário.',
        es: 'Declaro estar consciente de toda la información referente al tratamiento de peeling podal, incluyendo la aplicación de ácidos específicos para la renovación de la piel de los pies, y que los resultados pueden variar según cada organismo. Soy consciente de que el ácido continúa actuando tras la aplicación, siendo fundamental asistir al retorno indicado por el/la profesional.',
        en: 'I declare that I am aware of all information regarding the foot peeling treatment, including the application of specific acids to renew the skin of the feet, and that results may vary by individual. I am aware the acid continues to act after application, making follow-up visits essential.'
      } },
      { h: null, body: {
        pt: 'Declaro ter sido informado(a) de que o não comparecimento aos retornos pode acarretar em efeitos adversos, como ressecamento excessivo, irritações, queimaduras, escurecimento da pele e descamação desigual. Caso isso ocorra, estarei ciente de que o procedimento terá que ser refeito e será cobrado como novo atendimento.',
        es: 'Declaro haber sido informado(a) de que la inasistencia a los retornos puede causar efectos adversos, como resequedad excesiva, irritaciones, quemaduras, oscurecimiento de la piel y descamación desigual. De ocurrir, el procedimiento deberá repetirse y se cobrará como nueva atención.',
        en: 'I declare that I have been informed that missing follow-ups may cause adverse effects such as excessive dryness, irritation, burns, skin darkening and uneven peeling. Should this occur, the procedure will need to be redone and charged as a new appointment.'
      } },
      { h: { pt: 'CUIDADOS PÓS-PROCEDIMENTO:', es: 'CUIDADOS POSTERIORES:', en: 'AFTERCARE:' }, body: {
        pt: 'Fui orientado(a) sobre os cuidados pós-procedimento, incluindo: não puxar ou remover pele descamada; manter os pés limpos e secos; hidratar apenas com os produtos indicados pelo profissional; usar calçados abertos ou confortáveis sempre que possível.',
        es: 'Fui orientado(a) sobre los cuidados posteriores, incluyendo: no arrancar la piel descamada; mantener los pies limpios y secos; hidratar solo con los productos indicados; usar calzado abierto o cómodo.',
        en: 'I have been advised on aftercare: do not pull peeling skin; keep feet clean and dry; moisturize only with recommended products; wear open or comfortable footwear.'
      } },
      { h: null, body: {
        pt: 'Tenho conhecimento de que o uso de substâncias como cigarro, álcool e drogas pode prejudicar a resposta da pele ao tratamento e comprometer os resultados. Alimentação desequilibrada também pode interferir negativamente no processo de regeneração cutânea. Comprometo-me a informar ao profissional com antecedência em caso de impossibilidade de comparecer aos retornos. Caso eu não comunique, o tratamento será automaticamente cancelado e uma nova sessão será cobrada, se for necessário retomar.',
        es: 'Sé que el uso de sustancias como cigarrillo, alcohol y drogas puede perjudicar la respuesta de la piel. La alimentación desequilibrada también puede interferir. Me comprometo a informar al profesional con antelación si no puedo asistir. Si no lo comunico, el tratamiento se cancelará automáticamente y se cobrará una nueva sesión.',
        en: 'I am aware that substances such as cigarettes, alcohol and drugs can harm the skin\'s response. An unbalanced diet can also interfere. I commit to informing the professional in advance if I cannot attend. Otherwise the treatment will be automatically cancelled and a new session charged.'
      } },
      { h: null, body: {
        pt: 'Declaro, por fim, que compreendi todas as orientações, que minhas dúvidas foram esclarecidas, e que autorizo, de forma livre e consciente, a realização do peeling podal.',
        es: 'Declaro, por último, que comprendí todas las orientaciones, que mis dudas fueron aclaradas y que autorizo, de forma libre y consciente, la realización del peeling podal.',
        en: 'Finally, I declare that I understood all instructions, that my questions were answered, and that I freely and consciously authorize the foot peeling procedure.'
      } }
    ]
  },
  {
    key: 'paroniquia-infantil',
    signer: 'guardian',
    title: { pt: 'Termo de Consentimento — Paroníquia Infantil', es: 'Consentimiento — Paroniquia Infantil', en: 'Child Paronychia Consent' },
    sections: [
      { h: { pt: 'TERMO DE CONSENTIMENTO – TRATAMENTO DE PARONÍQUIA (INFECÇÃO PERIUNGUEAL) EM PACIENTE INFANTIL', es: 'CONSENTIMIENTO – TRATAMIENTO DE PARONIQUIA (INFECCIÓN PERIUNGUEAL) EN PACIENTE INFANTIL', en: 'CONSENT – PARONYCHIA (PERIUNGUAL INFECTION) TREATMENT IN A CHILD' }, body: {
        pt: 'Nome da criança: {{patient_name}}   Data de nascimento: {{birth_date}}   Tratamento: Paroníquia (infecção ao redor da unha)   Início: {{date}}',
        es: 'Nombre del niño(a): {{patient_name}}   Fecha de nacimiento: {{birth_date}}   Tratamiento: Paroniquia (infección alrededor de la uña)   Inicio: {{date}}',
        en: 'Child\'s name: {{patient_name}}   Date of birth: {{birth_date}}   Treatment: Paronychia (infection around the nail)   Start: {{date}}'
      } },
      { h: null, body: {
        pt: 'Eu, {{guardian_name}}, na qualidade de pai/mãe ou responsável legal da criança mencionada acima, autorizo o início e continuidade do tratamento podológico para paroníquia, entendendo que se trata de uma infecção localizada nas bordas das unhas, geralmente causada por bactérias ou fungos, que provoca dor, vermelhidão, inchaço e, em alguns casos, presença de pus. Declaro ter sido orientado(a) sobre a importância do tratamento precoce para evitar agravamento da infecção e necessidade de procedimentos mais invasivos.',
        es: 'Yo, {{guardian_name}}, en calidad de padre/madre o responsable legal del niño(a) mencionado arriba, autorizo el inicio y continuidad del tratamiento podológico para paroniquia, entendiendo que se trata de una infección localizada en los bordes de las uñas, generalmente causada por bacterias u hongos, que provoca dolor, enrojecimiento, hinchazón y, en algunos casos, pus. Declaro haber sido orientado(a) sobre la importancia del tratamiento precoz para evitar el agravamiento de la infección.',
        en: 'I, {{guardian_name}}, as father/mother or legal guardian of the child mentioned above, authorize the start and continuation of the podological treatment for paronychia, understanding it is an infection localized at the edges of the nails, usually caused by bacteria or fungi, causing pain, redness, swelling and, in some cases, pus. I declare I have been advised of the importance of early treatment to avoid worsening of the infection.'
      } },
      { h: { pt: 'O TRATAMENTO PODE INCLUIR:', es: 'EL TRATAMIENTO PUEDE INCLUIR:', en: 'THE TREATMENT MAY INCLUDE:' }, body: {
        pt: '- Limpeza e drenagem local (quando indicado); - Curativos com produtos antissépticos e cicatrizantes; - Acompanhamento dos sinais inflamatórios ao longo dos dias.',
        es: '- Limpieza y drenaje local (cuando esté indicado); - Curativos con productos antisépticos y cicatrizantes; - Seguimiento de los signos inflamatorios a lo largo de los días.',
        en: '- Local cleaning and drainage (when indicated); - Dressings with antiseptic and healing products; - Monitoring of inflammatory signs over the days.'
      } },
      { h: { pt: 'ORIENTAÇÕES AO RESPONSÁVEL:', es: 'ORIENTACIONES AL RESPONSABLE:', en: 'GUIDANCE FOR THE GUARDIAN:' }, body: {
        pt: 'Fui orientado(a) quanto à importância de: evitar alimentos "remosos" e processados (como chocolate, frituras, embutidos, refrigerantes, doces, leite condensado, entre outros), pois podem agravar o quadro inflamatório e dificultar a cicatrização; manter a criança com alimentação leve e rica em frutas, legumes, água e alimentos naturais; evitar o uso de calçados apertados ou fechados que causem atrito na região afetada; garantir que a criança não mexa ou coce a região lesionada; não molhar o curativo, caso seja utilizado, sem orientação profissional; retornar nas datas agendadas para acompanhamento da melhora e, se necessário, troca de curativos.',
        es: 'Fui orientado(a) sobre la importancia de: evitar alimentos "remosos" y procesados (como chocolate, frituras, embutidos, refrescos, dulces, leche condensada, entre otros), pues pueden agravar el cuadro inflamatorio y dificultar la cicatrización; mantener al niño(a) con alimentación ligera y rica en frutas, verduras, agua y alimentos naturales; evitar calzado apretado o cerrado que cause fricción; garantizar que el niño(a) no toque ni rasque la zona lesionada; no mojar el curativo sin orientación profesional; regresar en las fechas programadas.',
        en: 'I have been advised of the importance of: avoiding "inflammatory" and processed foods (such as chocolate, fried foods, processed meats, soft drinks, sweets, condensed milk, among others), as they may worsen inflammation and hinder healing; keeping the child on a light diet rich in fruits, vegetables, water and natural foods; avoiding tight or closed shoes that cause friction; ensuring the child does not touch or scratch the affected area; not wetting the dressing without professional guidance; returning on scheduled dates to monitor improvement and, if necessary, change dressings.'
      } },
      { h: { pt: 'RESPONSABILIDADE:', es: 'RESPONSABILIDAD:', en: 'RESPONSIBILITY:' }, body: {
        pt: 'Entendo que o não cumprimento das orientações pode comprometer a eficácia do tratamento, prolongar o tempo de recuperação ou agravar a infecção. Caso seja necessário realizar novos atendimentos além do previsto, estou ciente de que poderá haver custos adicionais. Comprometo-me a informar o profissional com antecedência em caso de ausência no retorno agendado. Declaro que todas as minhas dúvidas foram esclarecidas e que autorizo, de forma consciente, o tratamento podológico da criança acima identificada.',
        es: 'Entiendo que el incumplimiento de las orientaciones puede comprometer la eficacia del tratamiento, prolongar la recuperación o agravar la infección. Si se requieren nuevas atenciones, soy consciente de que puede haber costos adicionales. Me comprometo a informar al profesional con antelación en caso de ausencia. Declaro que todas mis dudas fueron aclaradas y que autorizo, de forma consciente, el tratamiento podológico del niño(a) identificado arriba.',
        en: 'I understand that failure to follow the instructions may compromise the effectiveness of the treatment, prolong recovery or worsen the infection. If additional appointments are needed, I am aware there may be extra costs. I commit to informing the professional in advance of any absence. I declare that all my questions were answered and that I consciously authorize the child\'s podological treatment.'
      } }
    ]
  },
  {
    key: 'sessoes-calo-verruga',
    signer: 'patient',
    title: { pt: 'Termo de Consentimento — Sessões para Calo/Calosidade/Verruga', es: 'Consentimiento — Sesiones para Callo/Callosidad/Verruga', en: 'Callus/Wart Sessions Consent' },
    sections: [
      { h: { pt: 'TERMO DE CONSENTIMENTO SESSÕES PARA CALO — CALOSIDADE/VERRUGA', es: 'CONSENTIMIENTO — SESIONES PARA CALLO/CALLOSIDAD/VERRUGA', en: 'CONSENT — CALLUS/WART SESSIONS' }, body: {
        pt: 'Paciente: {{patient_name}}   DN: {{birth_date}}   Telefone: {{phone}}   Tratamento: {{treatment}}   Início: {{date}}',
        es: 'Paciente: {{patient_name}}   FN: {{birth_date}}   Teléfono: {{phone}}   Tratamiento: {{treatment}}   Inicio: {{date}}',
        en: 'Patient: {{patient_name}}   DOB: {{birth_date}}   Phone: {{phone}}   Treatment: {{treatment}}   Start: {{date}}'
      } },
      { h: null, body: {
        pt: 'Autorizo a profissional {{professional}} a realizar o tratamento proposto. Aceito me submeter ao tratamento proposto pela podólogista e seguirei à risca todas as recomendações, tendo consciência que o total sucesso do tratamento depende da minha participação e colaboração.',
        es: 'Autorizo a la profesional {{professional}} a realizar el tratamiento propuesto. Acepto someterme al tratamiento propuesto por la podóloga y seguiré al pie de la letra todas las recomendaciones, siendo consciente de que el éxito total depende de mi participación y colaboración.',
        en: 'I authorize the professional {{professional}} to perform the proposed treatment. I accept to undergo the treatment proposed by the podologist and will strictly follow all recommendations, aware that the full success of the treatment depends on my participation and collaboration.'
      } },
      { h: null, body: {
        pt: 'Fico ciente de que preciso voltar aos retornos corretamente, comunicar qualquer intercorrência sob minha total responsabilidade; a não comunicação desses fatos pode agravar meu caso e comprometer o tratamento, perdendo assim toda a minha garantia, tendo que iniciar novamente o procedimento sob minha total responsabilidade financeira e de comparecimento.',
        es: 'Soy consciente de que debo regresar a los retornos correctamente y comunicar cualquier eventualidad bajo mi total responsabilidad; la falta de comunicación puede agravar mi caso y comprometer el tratamiento, perdiendo toda mi garantía y debiendo reiniciar el procedimiento bajo mi total responsabilidad financiera y de asistencia.',
        en: 'I am aware that I must attend follow-ups properly and report any complications under my full responsibility; failure to communicate may worsen my case and compromise the treatment, thereby losing all my guarantee and having to restart the procedure under my full financial and attendance responsibility.'
      } },
      { h: null, body: {
        pt: 'Estou consciente de que a podólogista não é uma ciência exata, e que cada organismo reage de maneira individualizada. Declaro estar ciente de tudo, inclusive dos riscos oferecidos e do resultado que pode ser apenas relativo, já que determinado pela individualidade de cada ser e na dependência da resposta do meu organismo.',
        es: 'Soy consciente de que la podología no es una ciencia exacta y que cada organismo reacciona de manera individualizada. Declaro estar consciente de todo, incluidos los riesgos y que el resultado puede ser solo relativo.',
        en: 'I am aware that podology is not an exact science and that each body reacts individually. I declare that I am aware of everything, including the risks and that the result may be only relative.'
      } },
      { h: null, body: {
        pt: 'No caso de falta a sessão sem aviso de 24h de antecedência, a sessão será dada como realizada. Em caso de atraso, a sessão será tolerada de 10 minutos. Quantidade de sessões: ____. O contratante pagará pelos serviços contratados acima a importância de __________.',
        es: 'En caso de inasistencia sin aviso de 24 horas de antelación, la sesión se dará por realizada. En caso de retraso, la sesión será tolerada por 10 minutos. Cantidad de sesiones: ____. El contratante pagará por los servicios contratados la cantidad de __________.',
        en: 'In case of missing a session without 24-hour notice, the session will be considered as performed. In case of delay, a 10-minute tolerance applies. Number of sessions: ____. The contracting party will pay for the services contracted above the amount of __________.'
      } }
    ]
  },
  {
    key: 'sessoes-laser',
    signer: 'patient',
    title: { pt: 'Termo de Consentimento — Sessões Laser', es: 'Consentimiento — Sesiones Láser', en: 'Laser Sessions Consent' },
    sections: [
      { h: { pt: 'TERMO DE CONSENTIMENTO SESSÕES LASER', es: 'CONSENTIMIENTO — SESIONES LÁSER', en: 'CONSENT — LASER SESSIONS' }, body: {
        pt: 'Paciente: {{patient_name}}   DN: {{birth_date}}   Telefone: {{phone}}   Tratamento: {{treatment}}   Início: {{date}}',
        es: 'Paciente: {{patient_name}}   FN: {{birth_date}}   Teléfono: {{phone}}   Tratamiento: {{treatment}}   Inicio: {{date}}',
        en: 'Patient: {{patient_name}}   DOB: {{birth_date}}   Phone: {{phone}}   Treatment: {{treatment}}   Start: {{date}}'
      } },
      { h: null, body: {
        pt: 'Autorizo a profissional {{professional}} a realizar o tratamento proposto. Aceito me submeter ao tratamento proposto pela podólogista e seguirei à risca todas as recomendações, tendo consciência que o total sucesso do tratamento depende da minha participação e colaboração. Fico ciente de que preciso voltar aos retornos corretamente, comunicar qualquer intercorrência sob minha total responsabilidade; a não comunicação desses fatos pode agravar meu caso e comprometer o tratamento, perdendo assim toda a minha garantia.',
        es: 'Autorizo a la profesional {{professional}} a realizar el tratamiento propuesto. Acepto someterme al tratamiento propuesto por la podóloga y seguiré todas las recomendaciones, siendo consciente de que el éxito total depende de mi participación. Soy consciente de que debo regresar a los retornos y comunicar cualquier eventualidad bajo mi total responsabilidad.',
        en: 'I authorize the professional {{professional}} to perform the proposed treatment. I accept to undergo the treatment and will strictly follow all recommendations, aware that full success depends on my participation. I am aware I must attend follow-ups and report any complications under my full responsibility.'
      } },
      { h: null, body: {
        pt: 'Estou consciente de que a podólogista não é uma ciência exata, e que cada organismo reage de maneira individualizada. Declaro estar ciente de tudo, inclusive dos riscos oferecidos e do resultado que pode ser apenas relativo. No caso de falta a sessão sem aviso de 24h de antecedência, a sessão será dada como realizada. Em caso de atraso, a sessão será tolerada de 10 minutos. Quantidade de sessões: ____. O contratante pagará pelos serviços contratados acima a importância de __________.',
        es: 'Soy consciente de que la podología no es una ciencia exacta y que cada organismo reacciona individualmente. Declaro estar consciente de todo, incluidos los riesgos. En caso de inasistencia sin aviso de 24 horas, la sesión se dará por realizada; el retraso será tolerado por 10 minutos. Cantidad de sesiones: ____. El contratante pagará la cantidad de __________.',
        en: 'I am aware that podology is not an exact science and each body reacts individually. I declare I am aware of everything, including the risks. Missing a session without 24-hour notice means the session counts as performed; a 10-minute delay tolerance applies. Number of sessions: ____. The contracting party will pay the amount of __________.'
      } }
    ]
  },
  {
    key: 'laser-onicomicose',
    signer: 'patient',
    title: { pt: 'Contrato Tratamento com Laser Onicomicose', es: 'Contrato Tratamiento con Láser Onicomicosis', en: 'Laser Onychomycosis Treatment Contract' },
    sections: [
      { h: { pt: 'CONTRATO TRATAMENTO COM LASER ONICOMICOSE', es: 'CONTRATO TRATAMIENTO CON LÁSER ONICOMICOSIS', en: 'LASER ONYCHOMYCOSIS TREATMENT CONTRACT' }, body: {
        pt: 'Paciente: {{patient_name}}   DN: {{birth_date}}   CPF: {{cpf}}   Telefone: {{phone}}   Tratamento: {{treatment}}   Início: {{date}}',
        es: 'Paciente: {{patient_name}}   FN: {{birth_date}}   CPF: {{cpf}}   Teléfono: {{phone}}   Tratamiento: {{treatment}}   Inicio: {{date}}',
        en: 'Patient: {{patient_name}}   DOB: {{birth_date}}   CPF: {{cpf}}   Phone: {{phone}}   Treatment: {{treatment}}   Start: {{date}}'
      } },
      { h: null, body: {
        pt: 'Autorizo a profissional {{professional}} a realizar o tratamento proposto. Aceito me submeter ao tratamento proposto pela podologista e seguirei à risca todas as recomendações, tendo consciência que o total sucesso do tratamento depende da minha participação e colaboração.',
        es: 'Autorizo a la profesional {{professional}} a realizar el tratamiento propuesto. Acepto someterme al tratamiento propuesto por la podóloga y seguiré todas las recomendaciones, siendo consciente de que el éxito total depende de mi participación.',
        en: 'I authorize the professional {{professional}} to perform the proposed treatment. I accept to undergo the treatment proposed by the podologist and will strictly follow all recommendations, aware that full success depends on my participation.'
      } },
      { h: null, body: {
        pt: 'Fico ciente de que preciso voltar aos retornos corretamente, comunicar qualquer intercorrência sob minha total responsabilidade; a não comunicação desses fatos pode agravar meu caso e comprometer o tratamento, perdendo assim toda a minha garantia, tendo que iniciar novamente o procedimento sob minha total responsabilidade financeira e de comparecimento.',
        es: 'Soy consciente de que debo regresar a los retornos y comunicar cualquier eventualidad bajo mi total responsabilidad; la falta de comunicación puede agravar mi caso y comprometer el tratamiento, perdiendo toda mi garantía.',
        en: 'I am aware I must attend follow-ups and report any complications under my full responsibility; failure to communicate may worsen my case and compromise the treatment, losing all my guarantee.'
      } },
      { h: null, body: {
        pt: 'Estou consciente de que a podologia não é uma ciência exata, e que cada organismo reage de maneira individualizada. Declaro estar ciente de tudo, inclusive dos riscos oferecidos e do resultado que pode ser apenas relativo. No caso de falta a sessão sem aviso de 24h de antecedência, a sessão será dada como realizada. Em caso de atraso, a sessão será tolerada de 10 minutos. Quantidade de sessões: ____. O contratante pagará pelos serviços contratados acima a importância de __________.',
        es: 'Soy consciente de que la podología no es una ciencia exacta y que cada organismo reacciona individualmente. Declaro estar consciente de todo, incluidos los riesgos. En caso de inasistencia sin aviso de 24 horas, la sesión se dará por realizada; el retraso será tolerado por 10 minutos.',
        en: 'I am aware that podology is not an exact science and each body reacts individually. I declare I am aware of everything, including the risks. Missing a session without 24-hour notice counts as performed; 10-minute delay tolerance applies.'
      } }
    ]
  },
  {
    key: 'laser-ilib',
    signer: 'patient',
    title: { pt: 'Contrato Tratamento com Laser Técnica ILIB', es: 'Contrato Tratamiento con Láser Técnica ILIB', en: 'ILIB Laser Treatment Contract' },
    sections: [
      { h: { pt: 'CONTRATO TRATAMENTO COM LASER TÉCNICA ILIB', es: 'CONTRATO TRATAMIENTO CON LÁSER TÉCNICA ILIB', en: 'ILIB LASER TREATMENT CONTRACT' }, body: {
        pt: 'Nome: {{patient_name}}   Data de Nascimento: {{birth_date}}   CPF: {{cpf}}   Tel: {{phone}}',
        es: 'Nombre: {{patient_name}}   Fecha de nacimiento: {{birth_date}}   CPF: {{cpf}}   Tel: {{phone}}',
        en: 'Name: {{patient_name}}   Date of birth: {{birth_date}}   CPF: {{cpf}}   Phone: {{phone}}'
      } },
      { h: null, body: {
        pt: 'Fui informado(a) da durabilidade do tratamento que é entre 1 a 2 anos, havendo casos que pode chegar até 2,5 anos. Estou ciente que devo comparecer ao consultório podológico conforme orientação do profissional, para o tratamento acima indicado.',
        es: 'Fui informado(a) de que la duración del tratamiento es de 1 a 2 años, pudiendo llegar hasta 2,5 años en algunos casos. Soy consciente de que debo acudir al consultorio según la orientación del profesional.',
        en: 'I have been informed that the treatment lasts between 1 and 2 years, and in some cases up to 2.5 years. I am aware I must attend the podology office as advised by the professional.'
      } },
      { h: null, body: {
        pt: 'Estou ciente que durante o tratamento serão necessários alguns cuidados para que o tratamento seja eficaz, cuidados esses passados pelo podólogista. Pacientes gestantes ou em período de amamentação devem informar essa condição, para que o podólogista responsável possa avaliar a possibilidade da realização do tratamento. Estou ciente que devo informar se tenho algum problema de saúde ou se estou em tratamento.',
        es: 'Soy consciente de que durante el tratamiento serán necesarios algunos cuidados para su eficacia, indicados por el podólogo. Las pacientes embarazadas o en período de lactancia deben informar esa condición para que el podólogo evalúe la posibilidad del tratamiento. Debo informar si tengo algún problema de salud o estoy en tratamiento.',
        en: 'I am aware that some care is needed during the treatment for it to be effective, as instructed by the podologist. Pregnant or breastfeeding patients must inform this condition so the podologist can assess the feasibility of the treatment. I must inform if I have any health problem or am undergoing treatment.'
      } },
      { h: null, body: {
        pt: 'Estou ciente que o resultado desejado não será plenamente atingido, considerando que cada organismo reage de maneira diversa quando se trata de tratamento podológico de onicomicose, e que o tratamento é 50% paciente e 50% profissional. Declaro, portanto, que fui devidamente informado(a) quanto ao tratamento que será realizado, sendo concedida a oportunidade de esclarecer todas as dúvidas.',
        es: 'Soy consciente de que el resultado deseado no se alcanzará plenamente, considerando que cada organismo reacciona de manera diversa, y que el tratamiento es 50% paciente y 50% profesional. Declaro que fui debidamente informado(a) del tratamiento a realizar, con oportunidad de aclarar todas mis dudas.',
        en: 'I am aware the desired result may not be fully achieved, as each body reacts differently, and that treatment is 50% patient and 50% professional. I declare that I was duly informed about the treatment to be performed, with the opportunity to clarify all my questions.'
      } }
    ]
  },
  {
    key: 'contrato-laser',
    signer: 'patient',
    title: { pt: 'Contrato Laser (Prestação de Serviços)', es: 'Contrato Láser (Prestación de Servicios)', en: 'Laser Service Contract' },
    sections: [
      { h: { pt: 'CONTRATO LASER — PRESTAÇÃO DE SERVIÇOS', es: 'CONTRATO LÁSER — PRESTACIÓN DE SERVICIOS', en: 'LASER — SERVICE CONTRACT' }, body: {
        pt: 'Por este instrumento particular, de um lado o Centro de Podologia, CNPJ/identificação conforme registro, doravante denominado CONTRATADO e, do outro, {{patient_name}}, inscrito(a) no CPF sob o nº {{cpf}}, doravante denominado CONTRATANTE, tem, entre si, justo e contratado a prestação de serviços que será regida pelas seguintes disposições: Declaro que foi lido e compreendido por mim.',
        es: 'Por este instrumento particular, de un lado el Centro de Podología, en adelante CONTRATADO y, del otro, {{patient_name}}, inscrito en el CPF nº {{cpf}}, en adelante CONTRATANTE, acuerdan la prestación de servicios regida por las siguientes disposiciones: Declaro que fue leído y comprendido por mí.',
        en: 'By this private instrument, on one side the Podology Center, hereinafter CONTRACTED PARTY, and on the other, {{patient_name}}, registered under CPF {{cpf}}, hereinafter CONTRACTING PARTY, agree to the provision of services governed by the following provisions: I declare that it was read and understood by me.'
      } },
      { h: { pt: 'CLÁUSULA PRIMEIRA — DO OBJETO', es: 'CLÁUSULA PRIMERA — DEL OBJETO', en: 'CLAUSE ONE — PURPOSE' }, body: {
        pt: 'O objeto da presente contratação é a prestação de serviços pelo contratado ao CONTRATANTE, especialmente para realização do tratamento estético já esclarecido e autorizado pela(o) CONTRATANTE no TERMO DE CONSENTIMENTO INFORMADO, documento que passa a integrar este Contrato. O serviço será prestado de acordo com o número de sessões indicadas e desejadas, observando sua validade, sendo realizadas com intervalos, conforme estabelecido no Termo de Consentimento e de acordo com a disponibilidade de agenda do profissional.',
        es: 'El objeto de esta contratación es la prestación de servicios por el contratado al CONTRATANTE, especialmente para la realización del tratamiento estético ya aclarado y autorizado en el CONSENTIMIENTO INFORMADO, documento que forma parte de este Contrato. El servicio se prestará según el número de sesiones indicadas, con los intervalos establecidos y según disponibilidad de agenda.',
        en: 'The purpose of this contract is the provision of services by the contracted party to the contracting party, especially for the aesthetic treatment already explained and authorized in the INFORMED CONSENT, which forms part of this Contract. Services will be provided according to the number of indicated sessions, with established intervals and scheduling availability.'
      } },
      { h: { pt: 'CLÁUSULA SEGUNDA — DOS HORÁRIOS E FALTAS', es: 'CLÁUSULA SEGUNDA — HORARIOS E INASISTENCIAS', en: 'CLAUSE TWO — SCHEDULING AND NO-SHOWS' }, body: {
        pt: 'Os serviços serão realizados em dias e horários previamente agendados. Caso o CONTRATANTE se atrase, a aplicação durará apenas o tempo remanescente, com tolerância de 10 minutos. Caso o CONTRATANTE não compareça nem desmarque com antecedência mínima de 24 horas, a sessão será considerada como realizada, não havendo reembolso, compensação ou reagendamento. Em caso de problema técnico com o equipamento ou com o profissional que impeça a sessão, esta será reagendada para a próxima data disponível.',
        es: 'Los servicios se realizarán en días y horarios previamente agendados. Si el CONTRATANTE llega tarde, la aplicación durará solo el tiempo restante, con tolerancia de 10 minutos. Si no asiste ni cancela con al menos 24 horas de antelación, la sesión se considerará realizada, sin reembolso ni reagendamiento. En caso de problema técnico que impida la sesión, se reagendará.',
        en: 'Services will be provided on pre-scheduled dates and times. If the contracting party is late, the application will last only the remaining time, with a 10-minute tolerance. If the contracting party fails to attend or cancel with at least 24 hours\' notice, the session will be considered performed, with no refund, compensation or rescheduling. In case of technical issues preventing the session, it will be rescheduled.'
      } },
      { h: { pt: 'CLÁUSULA TERCEIRA — CANCELAMENTO E MULTA', es: 'CLÁUSULA TERCERA — CANCELACIÓN Y MULTA', en: 'CLAUSE THREE — CANCELLATION AND PENALTY' }, body: {
        pt: 'No caso de cancelamento injustificado do tratamento ou rescisão do Contrato por culpa da(o) CONTRATANTE, esta(e) deverá pagar multa de 20% incidente sobre o valor restante correspondente aos tratamentos ainda não realizados. Os cancelamentos justificados só serão aceitos mediante apresentação de documentos comprobatórios. Em caso de inadimplência, o CONTRATANTE está ciente de que poderá ter o seu nome incluído nos órgãos de proteção ao crédito, tais como SERASA e SCPC e, caso seja necessário, autoriza a inclusão.',
        es: 'En caso de cancelación injustificada o rescisión por culpa del CONTRATANTE, deberá pagar una multa del 20% sobre el valor restante de los tratamientos no realizados. Las cancelaciones justificadas solo se aceptarán con documentos comprobatorios. En caso de mora, el CONTRATANTE podrá ser incluido en los órganos de protección al crédito (SERASA, SCPC) y autoriza dicha inclusión.',
        en: 'In case of unjustified cancellation or termination of the contract through the contracting party\'s fault, a 20% penalty applies on the remaining value of treatments not yet performed. Justified cancellations are only accepted with supporting documents. In case of default, the contracting party may be included in credit protection agencies such as SERASA and SCPC, and authorizes such inclusion.'
      } }
    ]
  },
  {
    key: 'onicomicose',
    signer: 'patient',
    title: { pt: 'Contrato Onicomicose', es: 'Contrato Onicomicosis', en: 'Onychomycosis Contract' },
    sections: [
      { h: { pt: 'CONTRATO ONICOMICOSE', es: 'CONTRATO ONICOMICOSIS', en: 'ONYCHOMYCOSIS CONTRACT' }, body: {
        pt: 'Paciente: {{patient_name}}   Data de Nascimento: {{birth_date}}   Tratamento Realizado: {{treatment}}   Início: {{date}}',
        es: 'Paciente: {{patient_name}}   Fecha de nacimiento: {{birth_date}}   Tratamiento: {{treatment}}   Inicio: {{date}}',
        en: 'Patient: {{patient_name}}   Date of birth: {{birth_date}}   Treatment: {{treatment}}   Start: {{date}}'
      } },
      { h: null, body: {
        pt: 'Fui informado(a) da durabilidade do tratamento que é entre 1 a 2 anos, havendo casos que pode chegar até 2,5 anos. Estou ciente que devo comparecer ao consultório podológico conforme orientação do profissional, para o tratamento acima indicado.',
        es: 'Fui informado(a) de que la duración del tratamiento es de 1 a 2 años, pudiendo llegar hasta 2,5 años. Soy consciente de que debo acudir al consultorio según la orientación del profesional.',
        en: 'I have been informed that the treatment lasts between 1 and 2 years, and in some cases up to 2.5 years. I am aware I must attend the podology office as advised by the professional.'
      } },
      { h: null, body: {
        pt: 'Estou ciente que durante o tratamento serão necessários alguns cuidados para que o tratamento seja eficaz, cuidados esses passados pelo podólogista. Pacientes gestantes ou em período de amamentação devem informar essa condição, para que o podólogista responsável possa avaliar a possibilidade da realização do tratamento. Estou ciente que devo informar se tenho algum problema de saúde ou se estou em tratamento.',
        es: 'Soy consciente de que durante el tratamiento serán necesarios algunos cuidados para su eficacia, indicados por el podólogo. Las pacientes embarazadas o en período de lactancia deben informar esa condición. Debo informar si tengo algún problema de salud o estoy en tratamiento.',
        en: 'I am aware that some care is needed during the treatment for it to be effective, as instructed by the podologist. Pregnant or breastfeeding patients must inform this condition. I must inform if I have any health problem or am undergoing treatment.'
      } },
      { h: null, body: {
        pt: 'Estou ciente que o resultado desejado será plenamente atingido, considerando que cada organismo reage de maneira diversa quando se trata de tratamento podológico de onicomicose, e que o tratamento é 50% paciente e 50% profissional. Declaro, portanto, que fui devidamente informado(a) quanto ao tratamento que será realizado, sendo concedida a oportunidade de esclarecer todas as dúvidas.',
        es: 'Soy consciente de que el resultado deseado será plenamente alcanzado, considerando que cada organismo reacciona de manera diversa, y que el tratamiento es 50% paciente y 50% profesional. Declaro que fui debidamente informado(a), con oportunidad de aclarar todas mis dudas.',
        en: 'I am aware the desired result will be fully achieved considering each body reacts differently, and that treatment is 50% patient and 50% professional. I declare that I was duly informed about the treatment, with the opportunity to clarify all my questions.'
      } }
    ]
  },
  {
    key: 'curativos',
    signer: 'patient',
    title: { pt: 'Termo de Responsabilidade para Curativos', es: 'Responsabilidad para Curaciones', en: 'Dressing Change Responsibility' },
    sections: [
      { h: { pt: 'TERMO DE RESPONSABILIDADE PARA CURATIVOS', es: 'RESPONSABILIDAD PARA CURATIVOS', en: 'DRESSING CHANGE RESPONSIBILITY' }, body: {
        pt: 'Paciente: {{patient_name}}   Tratamento Realizado: {{treatment}}   Início: {{date}}',
        es: 'Paciente: {{patient_name}}   Tratamiento realizado: {{treatment}}   Inicio: {{date}}',
        en: 'Patient: {{patient_name}}   Treatment: {{treatment}}   Start: {{date}}'
      } },
      { h: null, body: {
        pt: 'Declaro que estou ciente da necessidade de retornar para a troca de curativo após o procedimento podológico, conforme as orientações do profissional. O retorno deverá ser feito de 24h a 48h, não ultrapassando esse período. Não comparecendo ao retorno no prazo acima especificado, torna-se o podólogo responsável isento de quaisquer responsabilidades sobre o mesmo.',
        es: 'Declaro que soy consciente de la necesidad de regresar para el cambio de curativo después del procedimiento podológico, según las orientaciones del profesional. El retorno deberá hacerse entre 24h y 48h, sin superar ese período. De no asistir en ese plazo, el podólogo queda exento de cualquier responsabilidad.',
        en: 'I declare that I am aware of the need to return for a dressing change after the podological procedure, as instructed by the professional. The return must occur within 24 to 48 hours, not exceeding that period. Failure to return within the specified period releases the podologist from any responsibility.'
      } }
    ]
  },
  {
    key: 'orientacoes-onicomicose',
    signer: 'patient',
    title: { pt: 'Orientações para Casa — Onicomicose', es: 'Instrucciones para Casa — Onicomicosis', en: 'Home Care Instructions — Onychomycosis' },
    sections: [
      { h: { pt: 'ORIENTAÇÕES PARA CASA DURANTE O TRATAMENTO DE ONICOMICOSE', es: 'INSTRUCCIONES PARA CASA DURANTE EL TRATAMIENTO DE ONICOMICOSIS', en: 'HOME CARE INSTRUCTIONS DURING ONYCHOMYCOSIS TREATMENT' }, body: {
        pt: 'Paciente: {{patient_name}}   Tratamento Realizado: {{treatment}}   Início: {{date}}',
        es: 'Paciente: {{patient_name}}   Tratamiento realizado: {{treatment}}   Inicio: {{date}}',
        en: 'Patient: {{patient_name}}   Treatment: {{treatment}}   Start: {{date}}'
      } },
      { h: { pt: 'PÉS', es: 'PIES', en: 'FEET' }, body: {
        pt: 'Os cuidados com os pés são importantes para a prevenção, manutenção e resultado final do tratamento. Lavar os pés e as unhas com sabonete antisséptico; secar bem os pés e entre os dedos, de preferência com papel toalha; não usar hidratante entre os dedos; usar o produto indicado pelo profissional todos os dias.',
        es: 'El cuidado de los pies es importante para la prevención, mantenimiento y resultado final del tratamiento. Lavar los pies y uñas con jabón antiséptico; secar bien los pies y entre los dedos, preferiblemente con toalla de papel; no usar hidratante entre los dedos; usar el producto indicado por el profesional todos los días.',
        en: 'Foot care is important for the prevention, maintenance and final result of the treatment. Wash feet and nails with antiseptic soap; dry feet and between toes thoroughly, preferably with paper towel; do not use moisturizer between toes; use the product recommended by the professional every day.'
      } },
      { h: { pt: 'CALÇADOS', es: 'CALZADO', en: 'FOOTWEAR' }, body: {
        pt: 'Higienização dos calçados com Lysoform ao final do dia. O mesmo calçado não poderá ser usado 2 vezes seguido; colocar para arejar após o uso e deixar em local arejado por 24 horas. Lavar as palmilhas dos calçados semanalmente. Não usar antitranspirante em creme, eles deixam os pés úmidos, podendo juntar bactérias que causam o mau cheiro e aumentar a proliferação dos fungos.',
        es: 'Higienizar el calzado con Lysoform al final del día. No usar el mismo calzado 2 veces seguidas; dejarlo airear por 24 horas. Lavar las plantillas semanalmente. No usar antitranspirante en crema, pues deja los pies húmedos, pudiendo acumular bacterias y aumentar la proliferación de hongos.',
        en: 'Sanitize footwear with Lysoform at the end of the day. Do not wear the same shoes two days in a row; let them air out for 24 hours. Wash insoles weekly. Do not use cream antiperspirant, as it leaves feet moist, which can harbor odor-causing bacteria and increase fungal growth.'
      } },
      { h: { pt: 'MEIAS', es: 'MEDIAS', en: 'SOCKS' }, body: {
        pt: 'Usar meias de algodão e trocar diariamente.',
        es: 'Usar medias de algodón y cambiarlas diariamente.',
        en: 'Wear cotton socks and change them daily.'
      } }
    ]
  },
  {
    key: 'cuidados-verruga',
    signer: 'patient',
    title: { pt: 'Cuidados Após Remoção de Verruga', es: 'Cuidados Después de la Extracción de Verruga', en: 'Post-Wart Removal Care' },
    sections: [
      { h: { pt: 'CUIDADOS INDICADOS APÓS REMOÇÃO DE VERRUGA', es: 'CUIDADOS DESPUÉS DE LA EXTRACCIÓN DE VERRUGA', en: 'CARE AFTER WART REMOVAL' }, body: {
        pt: 'Paciente: {{patient_name}}   Data: {{date}}',
        es: 'Paciente: {{patient_name}}   Fecha: {{date}}',
        en: 'Patient: {{patient_name}}   Date: {{date}}'
      } },
      { h: { pt: '1. HIGIENE DIÁRIA', es: '1. HIGIENE DIARIA', en: '1. DAILY HYGIENE' }, body: {
        pt: 'Lavar o local 1x ao dia com sabonete neutro ou glicerinado. Secar com gaze ou toalha limpa, sem friccionar.',
        es: 'Lavar la zona 1 vez al día con jabón neutro o glicerina. Secar con gasa o toalla limpia, sin friccionar.',
        en: 'Wash the area once daily with neutral or glycerin soap. Dry with gauze or a clean towel, without rubbing.'
      } },
      { h: { pt: '2. APLICAÇÃO TÓPICA', es: '2. APLICACIÓN TÓPICA', en: '2. TOPICAL APPLICATION' }, body: {
        pt: 'Manhã e noite: aplicar uma fina camada de óleo de girassol ozonizado, cobrindo suavemente a área. Cobrir com gaze estéril se houver atrito com roupas ou risco de contaminação.',
        es: 'Mañana y noche: aplicar una fina capa de aceite de girasol ozonizado, cubriendo suavemente el área. Cubrir con gasa estéril si hay fricción con la ropa o riesgo de contaminación.',
        en: 'Morning and night: apply a thin layer of ozonated sunflower oil, gently covering the area. Cover with sterile gauze if there is friction with clothing or risk of contamination.'
      } },
      { h: { pt: '3. EVITAR', es: '3. EVITAR', en: '3. AVOID' }, body: {
        pt: 'Exposição solar direta sobre a lesão até completa cicatrização (usar roupas leves e cobertura física). Coçar, arrancar crostas ou usar produtos caseiros. Banhos de mar, piscina ou sauna nos primeiros 7 dias.',
        es: 'Exposición solar directa sobre la lesión hasta la cicatrización completa (usar ropa ligera y cobertura física). Rascar, arrancar costras o usar productos caseros. Baños de mar, piscina o sauna en los primeros 7 días.',
        en: 'Direct sun exposure on the lesion until complete healing (wear light clothing and physical cover). Scratching, picking scabs or using homemade products. Sea baths, pools or saunas in the first 7 days.'
      } }
    ]
  }
];

const DOC_MAP = Object.fromEntries(DOCS.map(d => [d.key, d]));

module.exports = { DOCS, DOC_MAP };
