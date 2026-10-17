import { all, db, get, now, run, syncHashtags, tx, uid } from './db/index.js';
import { hashPassword } from './lib/auth.js';
import { seedGifts } from './realtime.js';

const SAMPLE_VIDEOS = [
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
];

const pick = <T>(list: readonly T[], i: number): T => list[((i % list.length) + list.length) % list.length] as T;
const rnd = (max: number): number => Math.floor(Math.random() * max);
const daysAgoIso = (days: number, jitterDays = 1): string =>
  new Date(Date.now() - days * 86400000 - rnd(jitterDays * 86400000)).toISOString();

const CREATORS: Array<[string, string, string]> = [
  ['lea.mood', 'Léa', 'Films courts sur la ville. Paris.'],
  ['thom.cuisine', 'Thomas', 'Recettes en 30 secondes.'],
  ['nova.fit', 'Nova', 'Coach sportive. 5 min par jour.'],
  ['kairo.vibe', 'Kairo', 'Lo-fi et beats maison.'],
  ['sacha.travel', 'Sacha', '48h dans une ville, zéro plan.'],
  ['maya.art', 'Maya', 'Speedpaint et illustration.'],
  ['antoine.tech', 'Antoine', 'Code et café.'],
  ['zoe.beauty', 'Zoé', 'Routines simples, peau nette.'],
  ['ruben.dance', 'Ruben', 'Chorégraphies en 15 secondes.'],
  ['ines.study', 'Inès', 'On révise ensemble.'],
  ['polo.sport', 'Polo', 'Skate et parkour.'],
  ['yasmine.life', 'Yasmine', 'Vlog minimal.'],
  ['max.guitare', 'Max', 'Acoustique chaque dimanche.'],
  ['elena.mode', 'Elena', 'OOTD et seconde main.'],
  ['nabil.gym', 'Nabil', 'Transformation en 90 jours.'],
  ['camille.dog', 'Camille', 'Mon golden retriever.'],
  ['theo.science', 'Théo', 'Le savant de Y.'],
  ['laura.dance', 'Laura', 'Covers et chorégraphie.'],
  ['hugo.cars', 'Hugo', 'Tuning et nuits blanches.'],
  ['sarah.minimal', 'Sarah', 'Moins, mais mieux.'],
  ['nina.crafts', 'Nina', 'DIY à trois euros.'],
  ['omar.food', 'Omar', 'Street food test.'],
  ['alice.talks', 'Alice', 'POV et confessions.'],
  ['yanis.surfer', 'Yanis', 'Vagues et soleil.'],
];

const CAPTIONS = [
  'Il est 4h du matin et personne ne me voit. #cinematique #nuit #ville',
  'Recette de 30 secondes, pas une de plus. #cuisine #facile #recette',
  '5 minutes, zéro matériel, promesse. #sport #fitness #routine',
  'Le son du mois. #musique #lofi #beats',
  '48h à Lisbonne, il reste 12 minutes. #voyage #lisbonne #cityguide',
  'Speedpaint : 4 heures en 20 secondes. #art #digitalart #speedpaint',
  'Un script, une pile de café. #code #dev #coding',
  'Ma routine du soir en 3 étapes. #beauté #skincare #routine',
  'Choréo apprise en 3 jours. #dance #chorégraphie #danse',
  'Révisions de dernière minute. #etude #concours #studytok',
  'Le parkour du jour, encore. #sport #parkour #skate',
  'Journée sans plan, ça fait du bien. #vlog #slowliving',
  'Session acoustique du dimanche. #musique #guitare #acoustique',
  '3 pièces, 40 euros, zéro échec. #mode #seconemain #ootd',
  'Jour 60 : les photos parlent. #transformation #gym #fit',
  'Il a encore fait la bêtise. #chien #pets #humour',
  'L’explication en 30 secondes. #science #culture #savoir',
  'Cover de la semaine. #danse #cover #kpop',
  'Nuit blanche, tunes à fond. #cars #tuning #nuit',
  'J’ai effacé tout ce qui m’encombrait. #minimalisme #rangement',
  'DIY à 3 euros, le résultat bluffe. #diy #craft #budget',
  'Le meilleur plat de la rue, promis. #streetfood #food #test',
  'POV : tu réponds au dernier message. #humour #pov #storytime',
  'Marée basse, session parfaite. #surf #ocean #vague',
  'La recette secrète de ma grand-mère. #cuisine #recette #famille',
  '3 mois plus tard, on recommence. #sport #discipline #habitude',
  'Ce son va rester dans ma tête. #musique #viral #son',
  'Le petit-déjeuner parfait en 5 minutes. #cuisine #healthy',
  'Elle a vu la caméra. #pets #funny #chien',
  'Retour aux racines. #campagne #nature #slowliving',
  'Un jour sans écran, ça change tout. #digitaldetox #bienetre',
  'L’astuce que personne ne veut connaître. #diy #home #astuce',
  'Test de 10 jours, mon avis honnête. #test #challenge #avis',
  'Le meilleur investissement de l’année. #finance #budget #argent',
  'Vlog de 6h du matin, sans montage. #vlog #matin #authenticite',
  'Quand le chat décide de tout. #pets #chat #humour',
  'Apprendre une langue en 30 jours. #langue #apprentissage #voyage',
  'Le workout qui change tout. #sport #workout #motivation',
  'Recette healthy qui a vraiment du goût. #healthy #nutrition #cuisine',
  'Astuce de photographe. #photo #astuce #tip',
  'Il a tenu 30 jours sans réseaux. #challenge #habitude #discipline',
  'Le son original de ce projet. #music #originalsound #nouveau',
  'Sortie de cette ville, respire. #voyage #escape #nature',
  'Le DIY le plus simple du monde. #astuce #lifehack #facile',
  'Ma chambre, 6 mois après. #interieur #deco #changement',
  'Test honnête : ça vaut le coup ? #test #audio #avis',
  'Une simple idée qui a tout changé. #mindset #changement #vie',
  'Prêt pour l’hiver. #hiver #mode #look',
  'Le live de ce soir sera spécial. #live #soir #direct',
  'Petite victoire du jour. #motivation #victoire #routine',
  'On se retrouve là. #rencontre #communaute #ami',
  'Guitare, café, pluie. #lofi #ambiance #chill',
  'Le dernier spectacle de l’année. #theatre #art #culture',
  'Des ambiances que personne ne recommande. #beats #producer #music',
  'Le temps d’un café. #moment #pause #calme',
  'Adopté il y a 3 ans. #histoire #chiens #emotion',
  'Ce projet me tient à cœur. #projet #passion #creation',
  'Ça marche enfin. #succes #progres #motivation',
  'Rien à dire, tout à montrer. #visuel #photo #art',
  'Ce matin, j’ai choisi le calme. #matin #calme #routine',
  'On continue. #motivation #sport #esprit',
  'Une idée par jour pendant 30 jours. #defi #creativite #idees',
  'Le détail que personne ne regarde. #detail #design #art',
  'Toujours pas de wifi, toujours des idées. #creativite #offline',
  'J’ai enfin terminé mon projet. #projet #fierte #accomplissement',
  'La rue à 5h du matin, je recommande. #nuit #ville #ambiance',
  'Petit pas, grand saut. #progres #motivation #objectif',
  'Ce que personne ne vous dit sur la réussite. #succes #verite',
];

const COMMENTS = [
  'Ça déchire !',
  'Trop bien ce son.',
  'Comment t’as fait ça ?',
  'J’ai ri trop fort.',
  'Il me faut la recette !',
  'T’es au top.',
  'En favoris direct.',
  'La transition est parfaite.',
  'Quelle qualité, sérieux.',
  'Ça m’a donné envie de sortir courir.',
  'Première fois que je commente, mais bravo.',
  'Le refrain !',
  'J’ai vu ça dans mes rêves.',
  'Tu peux faire un tuto ?',
  'Toujours au top, continue.',
  'Vous êtes sérieux ?',
  'C’est exactement ce qu’il me fallait.',
  'La lumière est incroyable.',
  'Quelle app tu utilises ?',
  'Bravo, continue comme ça.',
];

const SOUNDS: Array<[string, string]> = [
  ['Midnight Pulse', 'Kairo'],
  ['Café Calme', 'Léa'],
  ['Neon Runner', 'Y Studio'],
  ['Plage Slow', 'Maya'],
  ['Kitchen Beat', 'Thomas'],
  ['Street Glow', 'Hugo'],
  ['Sunrise Loop', 'Yasmine'],
  ['Deep Focus', 'Antoine'],
];

const PRODUCTS: Array<[string, number, string]> = [
  ['T-shirt Y Essential', 2900, 'Coton bio, coupe oversize. Édition numérotée.'],
  ['Casquette Y Logo', 1900, 'Broderie 3D, taille unique réglable.'],
  ['Hoodie Y Studio', 5900, 'Molleton 400g, poche zippée.'],
  ['Pack stickers Y', 900, 'Lot de 12 stickers holographiques.'],
  ['Sac à dos Y 20L', 7900, 'Imperméable, compartiment matelasse.'],
  ['Bouteille isotherme Y', 3400, 'Inox, 750 ml, garde 24 h.'],
  ['Écouteurs Y Pro', 12900, 'Réduction de bruit active.'],
  ['Enceinte Y Mini', 8900, 'Bass boost, 12 h d’autonomie.'],
  ['Clavier mécanique Y', 15900, 'Switches linéaires, RGB.'],
  ['Lampe de bureau Y', 6900, 'Température ajustable, veilleuse.'],
  ['Tapis de yoga Y', 4900, 'TPE 6 mm, antidérapant.'],
  ['Tapis abstrait Kontur', 3500, 'Motif abstrait, fait main.'],
];

const LIVE_TITLES: Array<[string, string]> = [
  ['On code ensemble 🎧', 'kairo.vibe'],
  ['Recette express de 20 min', 'thom.cuisine'],
  ['Q&A — posez vos questions', 'alice.talks'],
  ['Je peins en direct', 'maya.art'],
  ['Soirée jeux & chat', 'ruben.dance'],
];

const TABLES = [
  'notifications', 'live_messages', 'live_viewers', 'live_rooms', 'messages',
  'conversation_members', 'conversations', 'comments', 'comment_likes', 'likes',
  'saves', 'shares', 'video_views', 'video_sounds', 'video_hashtags', 'videos',
  'hashtags', 'sounds', 'orders', 'order_items', 'cart_items', 'products',
  'reports', 'search_history', 'blocks', 'follows', 'sessions', 'users',
];

async function seed(): Promise<void> {
  const force = process.env.Y_FORCE === '1';
  const existing = get<{ c: number }>('SELECT COUNT(*) AS c FROM users')?.c ?? 0;
  if (existing > 0 && !force) {
    console.log(`[seed] ${existing} comptes déjà présents. Utilise Y_FORCE=1 pour réinitialiser.`);
    return;
  }

  console.log('[seed] preparation...');
  seedGifts();

  if (force) {
    tx(() => {
      for (const table of TABLES) db.exec(`DELETE FROM ${table}`);
    });
    console.log('[seed] base réinitialisée');
  }

  const password = await hashPassword('yolove2026');
  const userIds: string[] = [];

  tx(() => {
    CREATORS.forEach(([username, display, bio], i) => {
      const id = uid();
      userIds.push(id);
      run(
        `INSERT INTO users (id, username, email, password_hash, display_name, avatar, bio, link,
           verified, is_private, coin_balance, created_at, updated_at)
         VALUES (?,?,?,?,?,NULL,?,?,?,0,?,?,?)`,
        [
          id, username, `${username}@y.app`, password, display, bio,
          i % 5 === 0 ? `y.app/${username.split('.')[0]}` : '',
          i % 7 === 0 ? 1 : 0,
          1000 + rnd(90) * 100,
          daysAgoIso(400 - i * 13, 3),
          now(),
        ],
      );
    });
  });
  console.log(`[seed] ${userIds.length} comptes (mot de passe : yolove2026)`);

  const soundIds = tx(() => {
    const ids: string[] = [];
    SOUNDS.forEach(([name, artist], i) => {
      const id = uid();
      ids.push(id);
      run('INSERT INTO sounds (id, name, artist, path, is_original, created_at) VALUES (?,?,?,?,?,?)', [
        id, name, artist, `seed:sound-${i}`, i < 4 ? 1 : 0, now(),
      ]);
    });
    return ids;
  });

  const videoIds = tx(() => {
    const ids: string[] = [];
    for (let i = 0; i < CAPTIONS.length; i++) {
      const id = uid();
      ids.push(id);
      run(
        `INSERT INTO videos (id, user_id, path, thumbnail, description, kind, duration, created_at)
         VALUES (?,?,?,NULL,?,'original',?,?)`,
        [id, pick(userIds, i * 7 + 3), SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length], CAPTIONS[i] ?? '', 8 + (i % 45), daysAgoIso(rnd(42), 2)],
      );
      syncHashtags(id, CAPTIONS[i] ?? '');
      run('INSERT OR IGNORE INTO video_sounds (video_id, sound_id) VALUES (?,?)', [id, pick(soundIds, i)]);
      run('UPDATE sounds SET use_count = use_count + 1 WHERE id = ?', [pick(soundIds, i)]);
    }
    return ids;
  });
  console.log(`[seed] ${videoIds.length} vidéos`);

  tx(() => {
    for (const id of videoIds) {
      const likes = rnd(900);
      const views = likes * (3 + rnd(8)) + rnd(400);
      run(
        `UPDATE videos SET view_count = ?, like_count = ?, share_count = ?, comment_count = ? WHERE id = ?`,
        [views, likes, rnd(likes / 4), rnd(likes / 12), id],
      );
      run('UPDATE users SET like_count = like_count + ? WHERE id = (SELECT user_id FROM videos WHERE id = ?)', [likes, id]);
    }
  });

  tx(() => {
    for (const a of userIds) {
      for (const b of userIds) {
        if (a === b) continue;
        if (rnd(100) < 28) {
          run('INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?,?,?)', [
            a, b, daysAgoIso(rnd(200), 2),
          ]);
        }
      }
    }
    run(
      `UPDATE users SET follower_count = (SELECT COUNT(*) FROM follows WHERE following_id = users.id),
                        following_count = (SELECT COUNT(*) FROM follows WHERE follower_id = users.id),
                        video_count = (SELECT COUNT(*) FROM videos WHERE user_id = users.id)`,
    );
  });

  tx(() => {
    for (const videoId of videoIds) {
      const likers = userIds.filter(() => rnd(100) < 22);
      for (const userId of likers)
        run('INSERT OR IGNORE INTO likes (user_id, video_id, created_at) VALUES (?,?,?)', [
          userId, videoId, daysAgoIso(rnd(30), 1),
        ]);
      if (rnd(100) < 35)
        run('INSERT OR IGNORE INTO saves (user_id, video_id, created_at) VALUES (?,?,?)', [
          pick(userIds, rnd(userIds.length)), videoId, daysAgoIso(rnd(20), 1),
        ]);
      run(
        'INSERT INTO shares (id, video_id, user_id, channel, created_at) VALUES (?,?,?,?,?)',
        [uid(), videoId, pick(userIds, rnd(userIds.length)), pick(['link', 'dm', 'copy'] as const, rnd(3)), daysAgoIso(rnd(25), 1)],
      );
      for (let k = 0; k < rnd(6); k++)
        run(
          'INSERT OR IGNORE INTO video_views (video_id, user_id, created_at) VALUES (?,?,?)',
          [videoId, pick(userIds, rnd(userIds.length)), daysAgoIso(rnd(25), 1)],
        );
    }
  });
  console.log('[seed] interactions');

  tx(() => {
    for (const videoId of videoIds) {
      const author = get<{ user_id: string }>('SELECT user_id FROM videos WHERE id = ?', [videoId])?.user_id;
      const count = rnd(6);
      for (let k = 0; k < count; k++) {
        const commenter = pick(userIds, rnd(userIds.length));
        if (commenter === author) continue;
        const parentId = uid();
        run(
          `INSERT INTO comments (id, video_id, user_id, parent_id, text, like_count, created_at)
           VALUES (?,?,?,NULL,?,?,?)`,
          [parentId, videoId, commenter, pick(COMMENTS, rnd(COMMENTS.length)), rnd(40), daysAgoIso(rnd(20), 1)],
        );
        if (rnd(100) < 45) {
          run(
            `INSERT INTO comments (id, video_id, user_id, parent_id, text, like_count, created_at)
             VALUES (?,?,?,?,?,?,?)`,
            [uid(), videoId, pick(userIds, rnd(userIds.length)), parentId, pick(COMMENTS, rnd(COMMENTS.length)), rnd(10), daysAgoIso(rnd(18), 1)],
          );
        }
      }
    }
    run(
      `UPDATE videos SET comment_count = (SELECT COUNT(*) FROM comments WHERE video_id = videos.id)`,
    );
  });
  console.log('[seed] commentaires');

  tx(() => {
    const videosByUser = new Map<string, string[]>();
    for (const row of all<{ id: string; user_id: string }>('SELECT id, user_id FROM videos'))
      videosByUser.set(row.user_id, [...(videosByUser.get(row.user_id) ?? []), row.id]);

    for (const row of all<{ id: string; user_id: string }>('SELECT id, user_id FROM videos')) {
      const likedBy = all<{ user_id: string }>('SELECT user_id FROM likes WHERE video_id = ? LIMIT 6', [row.id]);
      for (const l of likedBy) {
        const id = uid();
        run(
          `INSERT INTO notifications (id, user_id, actor_id, type, video_id, text, created_at)
           VALUES (?,?,?,'like',?,'',?)`,
          [id, row.user_id, l.user_id, row.id, daysAgoIso(rnd(10), 1)],
        );
      }
      const others = [...videosByUser.keys()].filter((u) => u !== row.user_id);
      for (const other of others.slice(0, 2))
        run(
          `INSERT INTO notifications (id, user_id, actor_id, type, text, created_at)
           VALUES (?,?,?,'follow','',?)`,
          [uid(), row.user_id, other, daysAgoIso(rnd(14), 1)],
        );
    }
  });
  console.log('[seed] notifications');

  tx(() => {
    for (let i = 0; i < 6; i++) {
      const a = pick(userIds, i * 3);
      const b = pick(userIds, i * 3 + 7);
      if (a === b) continue;
      const existing = get<{ id: string }>(
        `SELECT c.id FROM conversations c
         JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
         JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ? LIMIT 1`,
        [a, b],
      );
      const id = existing?.id ?? uid();
      if (!existing) {
        run('INSERT INTO conversations (id, created_at, updated_at) VALUES (?,?,?)', [id, daysAgoIso(6, 1), now()]);
        run('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?)', [id, a]);
        run('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?)', [id, b]);
      }
      for (let m = 0; m < 4; m++) {
        const from = m % 2 === 0 ? a : b;
        run(
          `INSERT INTO messages (id, conversation_id, user_id, kind, body, seen, created_at)
           VALUES (?,?,?,'text',?,?,?)`,
          [
            uid(), id, from,
            pick(['Salut !', 'Tu as vu ma dernière vidéo ?', 'On se cale demain ?', 'Merci pour le like !', 'Envoie-moi le son 🎧'], rnd(5)),
            m < 2 ? 1 : 0,
            daysAgoIso(5 - m, 1),
          ],
        );
      }
    }
  });
  console.log('[seed] conversations');

  tx(() => {
    LIVE_TITLES.forEach(([title, hostUsername], i) => {
      const host = userIds[CREATORS.findIndex(([u]) => u === hostUsername)] ?? userIds[i];
      if (!host) return;
      const id = uid();
      run(
        `INSERT INTO live_rooms (id, host_id, title, status, started_at, peak_viewers, total_viewers, gift_coins)
         VALUES (?,?,?,'live',?,?,?,?)`,
        [id, host, title, new Date(Date.now() - (i + 1) * 900000).toISOString(), 20 + rnd(400), 40 + rnd(900), rnd(3000)],
      );
      for (let k = 0; k < 12; k++) {
        const viewer = pick(userIds, rnd(userIds.length));
        run('INSERT OR IGNORE INTO live_viewers (room_id, user_id, joined_at) VALUES (?,?,?)', [
          id, viewer, new Date(Date.now() - (i + 1) * 900000).toISOString(),
        ]);
        const isGift = rnd(100) < 25;
        const gift = get<{ id: string; name: string; coins: number }>(
          'SELECT id, name, coins FROM gifts ORDER BY coins LIMIT 1 OFFSET ?',
          [rnd(6)],
        );
        run(
          `INSERT INTO live_messages (id, room_id, user_id, kind, body, gift_id, coins, created_at)
           VALUES (?,?,?,?,?,?,?,?)`,
          isGift
            ? [uid(), id, viewer, 'gift', gift?.name ?? 'Rose', gift?.id ?? null, gift?.coins ?? 1, new Date(Date.now() - k * 20000).toISOString()]
            : [uid(), id, viewer, 'comment', pick(COMMENTS, rnd(COMMENTS.length)), null, 0, new Date(Date.now() - k * 20000).toISOString()],
        );
      }
    });
  });
  console.log('[seed] lives');

  tx(() => {
    for (let i = 0; i < PRODUCTS.length; i++) {
      const [title, price, description] = PRODUCTS[i] as [string, number, string];
      run(
        `INSERT INTO products (id, seller_id, title, description, price, currency, image, stock, sales, created_at)
         VALUES (?,?,?,?,?,'EUR',NULL,?,?,?)`,
        [uid(), pick(userIds, i * 3), title, description, price, 5 + rnd(90), rnd(400), daysAgoIso(rnd(60), 1)],
      );
    }
  });
  console.log('[seed] boutique');

  console.log('\n[seed] Terminé. Connexion : un compte @y.app au choix / mot de passe yolove2026');
}

seed().then(
  () => process.exit(0),
  (err) => {
    console.error('[seed] echec', err);
    process.exit(1);
  },
);
