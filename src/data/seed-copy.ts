import type { Locale } from '@/i18n/locale';

/**
 * Sample content for the on-device demo and store screenshots, written natively per language
 * (not translated word for word). Item order matches buildSeed.
 */
export type SeedCopy = {
  name: string;
  market: string;
  items: [string, string, string, string, string, string, string, string, string, string, string, string];
  firstTranscript: string;
  shortTranscript: string;
  /** Review screen sample: what was said, and what came out of it. */
  review: {
    transcript: string;
    task: string;
    reminder: string;
    event: string;
    shopping: string;
    note: string;
  };
  shared: { name: string; members: [string, string, string]; items: [string, string, string, string, string] };
  search: string;
};

export const SEED_COPY: Record<Locale, SeedCopy> = {
  en: {
    name: 'Emma',
    market: 'Groceries',
    items: ['Call Ahmet', 'Milk, bread', 'Project idea', 'Review the deck', 'Pay the invoice', 'Pack the gym bag', 'Reply to email', 'Keep the lavender palette', 'Question left from the meeting', 'Take the medicine', 'Dentist', 'Eggs'],
    firstTranscript: 'Remind me to call mom tomorrow at 9. Add milk and bread.',
    shortTranscript: 'A short voice note.',
    review: {
      transcript: 'Call the bank tomorrow at 10, remind me to water the plants tonight, dentist on Friday at 3, buy coffee and oat milk, and an idea: a reading club at work.',
      task: 'Call the bank', reminder: 'Water the plants', event: 'Dentist', shopping: 'Coffee, oat milk', note: 'Reading club at work',
    },
    shared: { name: 'Home groceries', members: ['Emma', 'Noah', 'Mia'], items: ['Bananas', 'Pasta', 'Olive oil', 'Dish soap', 'Bread'] },
    search: 'dentist',
  },
  tr: {
    name: 'Ayşe',
    market: 'Market',
    items: ['Ahmet’i ara', 'Süt, ekmek', 'Proje fikri', 'Sunumu gözden geçir', 'Faturayı öde', 'Spor çantasını hazırla', 'E-postaları yanıtla', 'Lavanta paletini kaydet', 'Toplantıdan kalan soru', 'İlacı al', 'Diş hekimi', 'Yumurta'],
    firstTranscript: 'Yarın saat 9’da annemi ara. Marketten süt ve ekmek al.',
    shortTranscript: 'Kısa bir sesli not.',
    review: {
      transcript: 'Yarın 10’da bankayı ara, akşam çiçekleri sulamayı hatırlat, cuma 15’te diş hekimi, kahve ve yulaf sütü al, bir de fikir: işte kitap kulübü.',
      task: 'Bankayı ara', reminder: 'Çiçekleri sula', event: 'Diş hekimi', shopping: 'Kahve, yulaf sütü', note: 'İşte kitap kulübü',
    },
    shared: { name: 'Ev alışverişi', members: ['Ayşe', 'Mehmet', 'Elif'], items: ['Muz', 'Makarna', 'Zeytinyağı', 'Bulaşık deterjanı', 'Ekmek'] },
    search: 'diş',
  },
  de: {
    name: 'Lena',
    market: 'Einkauf',
    items: ['Jonas anrufen', 'Milch, Brot', 'Projektidee', 'Präsentation prüfen', 'Rechnung bezahlen', 'Sporttasche packen', 'E-Mails beantworten', 'Lavendel-Palette merken', 'Offene Frage aus dem Meeting', 'Medikament nehmen', 'Zahnarzt', 'Eier'],
    firstTranscript: 'Erinnere mich morgen um 9, Mama anzurufen. Milch und Brot kaufen.',
    shortTranscript: 'Eine kurze Sprachnotiz.',
    review: {
      transcript: 'Morgen um 10 die Bank anrufen, erinnere mich heute Abend an die Pflanzen, Freitag um 15 Uhr Zahnarzt, Kaffee und Hafermilch kaufen, und eine Idee: ein Lesekreis im Büro.',
      task: 'Bank anrufen', reminder: 'Pflanzen gießen', event: 'Zahnarzt', shopping: 'Kaffee, Hafermilch', note: 'Lesekreis im Büro',
    },
    shared: { name: 'Wocheneinkauf', members: ['Lena', 'Max', 'Sophie'], items: ['Bananen', 'Nudeln', 'Olivenöl', 'Spülmittel', 'Brot'] },
    search: 'zahnarzt',
  },
  es: {
    name: 'Lucía',
    market: 'Compra',
    items: ['Llamar a Pablo', 'Leche, pan', 'Idea de proyecto', 'Revisar la presentación', 'Pagar la factura', 'Preparar la bolsa del gimnasio', 'Responder correos', 'Guardar la paleta lavanda', 'Pregunta pendiente de la reunión', 'Tomar la medicina', 'Dentista', 'Huevos'],
    firstTranscript: 'Recuérdame llamar a mamá mañana a las 9. Comprar leche y pan.',
    shortTranscript: 'Una nota de voz corta.',
    review: {
      transcript: 'Llamar al banco mañana a las 10, recuérdame regar las plantas esta noche, dentista el viernes a las 3, comprar café y leche de avena, y una idea: un club de lectura en el trabajo.',
      task: 'Llamar al banco', reminder: 'Regar las plantas', event: 'Dentista', shopping: 'Café, leche de avena', note: 'Club de lectura en el trabajo',
    },
    shared: { name: 'Compra de casa', members: ['Lucía', 'Diego', 'Sofía'], items: ['Plátanos', 'Pasta', 'Aceite de oliva', 'Lavavajillas', 'Pan'] },
    search: 'dentista',
  },
  fr: {
    name: 'Camille',
    market: 'Courses',
    items: ['Appeler Julien', 'Lait, pain', 'Idée de projet', 'Relire la présentation', 'Payer la facture', 'Préparer le sac de sport', 'Répondre aux e-mails', 'Garder la palette lavande', 'Question restée de la réunion', 'Prendre le médicament', 'Dentiste', 'Œufs'],
    firstTranscript: 'Rappelle-moi d’appeler maman demain à 9 h. Acheter du lait et du pain.',
    shortTranscript: 'Une courte note vocale.',
    review: {
      transcript: 'Appeler la banque demain à 10 h, rappelle-moi d’arroser les plantes ce soir, dentiste vendredi à 15 h, acheter du café et du lait d’avoine, et une idée : un club de lecture au bureau.',
      task: 'Appeler la banque', reminder: 'Arroser les plantes', event: 'Dentiste', shopping: 'Café, lait d’avoine', note: 'Club de lecture au bureau',
    },
    shared: { name: 'Courses de la maison', members: ['Camille', 'Hugo', 'Léa'], items: ['Bananes', 'Pâtes', 'Huile d’olive', 'Liquide vaisselle', 'Pain'] },
    search: 'dentiste',
  },
  it: {
    name: 'Giulia',
    market: 'Spesa',
    items: ['Chiamare Marco', 'Latte, pane', 'Idea per il progetto', 'Rivedere la presentazione', 'Pagare la bolletta', 'Preparare la borsa della palestra', 'Rispondere alle email', 'Salvare la palette lavanda', 'Domanda rimasta dalla riunione', 'Prendere la medicina', 'Dentista', 'Uova'],
    firstTranscript: 'Ricordami di chiamare la mamma domani alle 9. Comprare latte e pane.',
    shortTranscript: 'Una breve nota vocale.',
    review: {
      transcript: 'Chiamare la banca domani alle 10, ricordami di annaffiare le piante stasera, dentista venerdì alle 15, comprare caffè e latte d’avena, e un’idea: un club del libro in ufficio.',
      task: 'Chiamare la banca', reminder: 'Annaffiare le piante', event: 'Dentista', shopping: 'Caffè, latte d’avena', note: 'Club del libro in ufficio',
    },
    shared: { name: 'Spesa di casa', members: ['Giulia', 'Luca', 'Sara'], items: ['Banane', 'Pasta', 'Olio d’oliva', 'Detersivo piatti', 'Pane'] },
    search: 'dentista',
  },
  ja: {
    name: 'ゆい',
    market: '買い物',
    items: ['田中さんに電話', '牛乳、パン', '企画のアイデア', '資料を見直す', '請求書を支払う', 'ジムの荷物を準備', 'メールに返信', 'ラベンダーの配色を保存', '会議で残った質問', '薬を飲む', '歯医者', '卵'],
    firstTranscript: '明日9時に母に電話するようリマインドして。牛乳とパンを買う。',
    shortTranscript: '短いボイスメモ。',
    review: {
      transcript: '明日10時に銀行に電話、今夜植物に水をやるのをリマインド、金曜15時に歯医者、コーヒーとオーツミルクを買う、それとアイデア：職場で読書会。',
      task: '銀行に電話', reminder: '植物に水をやる', event: '歯医者', shopping: 'コーヒー、オーツミルク', note: '職場で読書会',
    },
    shared: { name: '家の買い物', members: ['ゆい', 'けんた', 'さくら'], items: ['バナナ', 'パスタ', 'オリーブオイル', '食器用洗剤', 'パン'] },
    search: '歯医者',
  },
  ko: {
    name: '지민',
    market: '장보기',
    items: ['민수에게 전화', '우유, 빵', '프로젝트 아이디어', '발표 자료 검토', '청구서 결제', '운동 가방 챙기기', '이메일 답장', '라벤더 팔레트 저장', '회의에서 남은 질문', '약 먹기', '치과', '달걀'],
    firstTranscript: '내일 9시에 엄마한테 전화하라고 알려줘. 우유랑 빵 사기.',
    shortTranscript: '짧은 음성 메모.',
    review: {
      transcript: '내일 10시에 은행에 전화, 오늘 밤 화분에 물 주라고 알려줘, 금요일 3시 치과, 커피랑 귀리 우유 사기, 그리고 아이디어: 회사 독서 모임.',
      task: '은행에 전화', reminder: '화분에 물 주기', event: '치과', shopping: '커피, 귀리 우유', note: '회사 독서 모임',
    },
    shared: { name: '우리 집 장보기', members: ['지민', '서준', '하은'], items: ['바나나', '파스타', '올리브유', '주방 세제', '빵'] },
    search: '치과',
  },
  'pt-BR': {
    name: 'Ana',
    market: 'Mercado',
    items: ['Ligar para o Rafael', 'Leite, pão', 'Ideia de projeto', 'Revisar a apresentação', 'Pagar a fatura', 'Arrumar a bolsa da academia', 'Responder e-mails', 'Guardar a paleta lavanda', 'Pergunta que ficou da reunião', 'Tomar o remédio', 'Dentista', 'Ovos'],
    firstTranscript: 'Me lembra de ligar para a mãe amanhã às 9. Comprar leite e pão.',
    shortTranscript: 'Uma nota de voz curta.',
    review: {
      transcript: 'Ligar para o banco amanhã às 10, me lembra de regar as plantas hoje à noite, dentista na sexta às 15h, comprar café e leite de aveia, e uma ideia: um clube do livro no trabalho.',
      task: 'Ligar para o banco', reminder: 'Regar as plantas', event: 'Dentista', shopping: 'Café, leite de aveia', note: 'Clube do livro no trabalho',
    },
    shared: { name: 'Compras de casa', members: ['Ana', 'Lucas', 'Bia'], items: ['Banana', 'Macarrão', 'Azeite', 'Detergente', 'Pão'] },
    search: 'dentista',
  },
  id: {
    name: 'Putri',
    market: 'Belanja',
    items: ['Telepon Budi', 'Susu, roti', 'Ide proyek', 'Periksa presentasi', 'Bayar tagihan', 'Siapkan tas gym', 'Balas email', 'Simpan palet lavender', 'Pertanyaan sisa rapat', 'Minum obat', 'Dokter gigi', 'Telur'],
    firstTranscript: 'Ingatkan aku telepon ibu besok jam 9. Beli susu dan roti.',
    shortTranscript: 'Catatan suara singkat.',
    review: {
      transcript: 'Telepon bank besok jam 10, ingatkan aku siram tanaman nanti malam, dokter gigi Jumat jam 3 sore, beli kopi dan susu oat, dan satu ide: klub buku di kantor.',
      task: 'Telepon bank', reminder: 'Siram tanaman', event: 'Dokter gigi', shopping: 'Kopi, susu oat', note: 'Klub buku di kantor',
    },
    shared: { name: 'Belanja rumah', members: ['Putri', 'Andi', 'Sari'], items: ['Pisang', 'Pasta', 'Minyak zaitun', 'Sabun cuci piring', 'Roti'] },
    search: 'dokter',
  },
};
