require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// ── Config ────────────────────────────────────────────────────
const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const HOME_URL     = process.env.HOME_URL    || 'https://homepage-one-beta-16.vercel.app';
const DEPOSIT_URL  = process.env.DEPOSIT_URL || 'https://telebirr-csaz.onrender.com';
const LUDO_URL     = process.env.LUDO_URL    || 'https://ludo-1-fdxp.onrender.com';
const BINGO_URL    = process.env.BINGO_URL   || 'https://bingo-game-49f1.onrender.com';
const GAME_URL     = process.env.GAME_URL    || 'https://crazy-c1ol.onrender.com/lobby.html';
const JWT_SECRET   = process.env.JWT_SECRET;
const WALLET_URL   = process.env.WALLET_API_URL || 'https://wallet-api-rdxt.onrender.com';
const ADMIN_IDS    = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const SUPPORT_URL  = 'https://t.me/etgamessupport';
const REFERRAL_BONUS = 10; // ETB per referral

if (!BOT_TOKEN)  throw new Error('Missing TELEGRAM_BOT_TOKEN');
if (!JWT_SECRET) throw new Error('Missing JWT_SECRET');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 ET Games bot running...');

// ── Keep-alive HTTP server for Render ────────────────────────
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running!');
}).listen(process.env.PORT || 3000, () => {
  console.log('✅ Health check server running');
});

// ── Helpers ───────────────────────────────────────────────────
function generateToken(chatId, username) {
  return jwt.sign({ chatId: String(chatId), username }, JWT_SECRET, { expiresIn: '30d' });
}

function esc(text) {
  return String(text).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

function buildUrl(base, chatId, username) {
  const token = generateToken(chatId, username);
  return `${base}?token=${token}&chatId=${chatId}&username=${encodeURIComponent(username)}`;
}

async function getUser(chatId) {
  const { data } = await supabase.from('users').select('*').eq('chat_id', String(chatId)).single();
  return data;
}

async function fetchBalance(chatId, token) {
  try {
    const res  = await fetch(`${WALLET_URL}/api/userinfo/get/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data.userData?.balance ?? null;
  } catch { return null; }
}

async function fetchTransactions(chatId) {
  try {
    const token = generateToken(chatId, 'bot');
    const res   = await fetch(`${WALLET_URL}/api/transactions/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data  = await res.json();
    return Array.isArray(data.transactions) ? data.transactions.slice(0, 10) : [];
  } catch { return []; }
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = Math.floor((new Date() - new Date(ts)) / 1000);
  if (d < 60)    return `${d}s ago`;
  if (d < 3600)  return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
}

async function creditUser(chatId, username, amount, description) {
  const adminToken = jwt.sign(
    { chatId: 'system', username: 'bot', isAdmin: true },
    JWT_SECRET, { expiresIn: '1h' }
  )
  const txId = `BONUS_${chatId}_${Date.now()}`
  const res = await fetch(`${WALLET_URL}/api/credit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: String(chatId), username,
      transaction_type: 'credit', amount,
      game: 'bonus', round_id: txId,
      transaction_id: txId
    })
  })
  return res.json()
}

// ── Referral helpers ──────────────────────────────────────────
async function registerReferral(referrerId, referredId) {
  // Don't refer yourself
  if (String(referrerId) === String(referredId)) return;
  // Check if already referred
  const { data: existing } = await supabase.from('referrals')
    .select('id').eq('referred_id', String(referredId)).single();
  if (existing) return;
  await supabase.from('referrals').insert({
    referrer_id:  String(referrerId),
    referred_id:  String(referredId),
    status:       'pending',
    bonus_amount: REFERRAL_BONUS,
    created_at:   new Date().toISOString()
  });
}

async function rewardReferrer(referredId) {
  // Find pending referral for this user
  const { data: referral } = await supabase.from('referrals')
    .select('*').eq('referred_id', String(referredId)).eq('status', 'pending').single();
  if (!referral) return;

  // Get referrer info
  const referrer = await getUser(referral.referrer_id);
  if (!referrer) return;

  // Credit referrer
  await creditUser(referrer.chat_id, referrer.username, REFERRAL_BONUS,
    `Referral bonus — invited ${referredId}`);

  // Mark as rewarded
  await supabase.from('referrals').update({
    status: 'rewarded', rewarded_at: new Date().toISOString()
  }).eq('id', referral.id);

  // Notify referrer
  await bot.sendMessage(referrer.chat_id,
    `🎉 Your referral bonus has arrived!\n\n` +
    `💰 +${REFERRAL_BONUS} ETB added to your balance.\n` +
    `A friend you invited just made their first deposit!`
  );
}

async function getReferralStats(chatId) {
  const { data } = await supabase.from('referrals')
    .select('*').eq('referrer_id', String(chatId));
  return data || [];
}

// ── Register user ─────────────────────────────────────────────
async function registerUser(chatId, username, phoneNumber, referrerId = null) {
  const id = String(chatId);
  const { data: existing } = await supabase.from('users').select('*').eq('chat_id', id).single();

  if (existing) {
    if (phoneNumber && !existing.phone_number) {
      await supabase.from('users').update({ phone_number: phoneNumber }).eq('chat_id', id);
    }
    return { user: { ...existing, phone_number: phoneNumber || existing.phone_number }, isNew: false };
  }

  const { data: newUser, error } = await supabase.from('users').insert({
    chat_id: id, username, phone_number: phoneNumber, balance: 0
  }).select().single();

  if (error) throw new Error(`Registration failed: ${error.message}`);

  // Register referral if came from one
  if (referrerId) await registerReferral(referrerId, chatId);

  return { user: newUser, isNew: true };
}

// ── Main Menu ─────────────────────────────────────────────────
const BANNER_URL   = process.env.BANNER_URL || ''
let WELCOME_BANNER = process.env.WELCOME_BANNER || ''

async function sendMainMenu(chatId, username, balance, isNew) {
  const homeUrl = buildUrl(HOME_URL, chatId, username)

  const caption = isNew
    ? `✅ Registration complete!

👤 ${username}
💰 Balance: ${balance} ETB

Welcome to ET Games! 🎮`
    : `👋 Welcome back ${username}!

💰 Balance: ${balance} ETB

🎲 Ludo · 🃏 Crazy Card · 🎱 Bingo`

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎮 Open Game Hub', web_app: { url: homeUrl } }],
      [
        { text: '📊 Transactions', callback_data: 'transactions' },
        { text: '💰 Balance',      callback_data: 'balance' },
      ],
      [
        { text: '🔗 Refer & Earn', callback_data: 'refer' },
        { text: '🆘 Support',      url: SUPPORT_URL },
      ],
    ]
  }

  if (BANNER_URL) {
    try {
      await bot.sendPhoto(chatId, BANNER_URL, { caption, reply_markup: keyboard })
      return
    } catch(e) { console.error('Photo send failed:', e.message) }
  }
  await bot.sendMessage(chatId, caption, { reply_markup: keyboard })
}

// ── /start ────────────────────────────────────────────────────
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId   = msg.chat.id;
  const username = msg.from.username || msg.from.first_name || `User${String(chatId).slice(-4)}`;
  const param    = match?.[1]?.trim(); // e.g. REF_1133538088

  // Extract referrer ID
  let referrerId = null;
  if (param?.startsWith('REF_')) {
    referrerId = param.replace('REF_', '');
  }

  try {
    const user = await getUser(chatId);

    if (user?.phone_number) {
      const token   = generateToken(chatId, user.username);
      const balance = await fetchBalance(chatId, token) ?? user.balance;
      await sendMainMenu(chatId, user.username, balance, false);
      return;
    }

    // If came via referral, store it temporarily
    if (referrerId && !user) {
      // Store in supabase temporarily or just pass through registration
      await bot.sendMessage(chatId,
        `👋 Welcome to *ET Games*\\!\n\nYou were invited by a friend 🎉\n\nShare your phone number to register and your friend gets *${REFERRAL_BONUS} ETB* when you make your first deposit\\.`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: {
            keyboard: [[{ text: '📱 Share My Phone Number', request_contact: true }]],
            resize_keyboard: true, one_time_keyboard: true
          }
        }
      );
      // Store referrerId temporarily in a map
      pendingReferrals.set(String(chatId), referrerId);
    } else {
      await bot.sendMessage(chatId,
        `👋 Welcome to *ET Games*\\!\n\nShare your phone number to register\\.`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: {
            keyboard: [[{ text: '📱 Share My Phone Number', request_contact: true }]],
            resize_keyboard: true, one_time_keyboard: true
          }
        }
      );
    }
  } catch (e) {
    console.error('/start error:', e);
    await bot.sendMessage(chatId, '❌ Something went wrong. Please try /start again.');
  }
});

// Store pending referrals temporarily
const pendingReferrals = new Map();

// ── /menu ─────────────────────────────────────────────────────
bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  const user   = await getUser(chatId);
  if (!user) return bot.sendMessage(chatId, '❌ Please /start first.');
  const token   = generateToken(chatId, user.username);
  const balance = await fetchBalance(chatId, token) ?? user.balance;
  await sendMainMenu(chatId, user.username, balance, false);
});

// ── /balance ──────────────────────────────────────────────────
bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id;
  const user   = await getUser(chatId);
  if (!user) return bot.sendMessage(chatId, '❌ Please /start first.');
  const token   = generateToken(chatId, user.username);
  const balance = await fetchBalance(chatId, token) ?? user.balance;
  await bot.sendMessage(chatId, `💰 Your balance: ${balance} ETB`);
});

// ── /refer ────────────────────────────────────────────────────
bot.onText(/\/refer/, async (msg) => {
  const chatId = msg.chat.id;
  const user   = await getUser(chatId);
  if (!user) return bot.sendMessage(chatId, '❌ Please /start first.');
  await sendReferInfo(chatId, user);
});

async function sendReferInfo(chatId, user) {
  const botInfo  = await bot.getMe();
  const refLink  = `https://t.me/${botInfo.username}?start=REF_${chatId}`;
  const stats    = await getReferralStats(chatId);
  const rewarded = stats.filter(r => r.status === 'rewarded').length;
  const pending  = stats.filter(r => r.status === 'pending').length;
  const earned   = rewarded * REFERRAL_BONUS;

  await bot.sendMessage(chatId,
    `🔗 *Refer & Earn*\n\n` +
    `Invite friends to ET Games and earn *${REFERRAL_BONUS} ETB* for every friend who registers and makes their first deposit\\!\n\n` +
    `📊 *Your Stats*\n` +
    `✅ Rewarded referrals: ${rewarded}\n` +
    `⏳ Pending referrals: ${pending}\n` +
    `💰 Total earned: ${earned} ETB\n\n` +
    `🔗 *Your referral link:*\n` +
    `\`${refLink}\`\n\n` +
    `Share this link with friends\\!`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [[
          { text: '📤 Share Referral Link', url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('Join ET Games and win ETB! 🎮')}` }
        ]]
      }
    }
  );
}

// ── /transactions ─────────────────────────────────────────────
bot.onText(/\/transactions/, async (msg) => {
  const chatId = msg.chat.id;
  const user   = await getUser(chatId);
  if (!user) return bot.sendMessage(chatId, '❌ Please /start first.');
  await sendTransactionsMsg(chatId, user);
});

async function sendTransactionsMsg(chatId, user) {
  const txs = await fetchTransactions(chatId);
  if (!txs.length) return bot.sendMessage(chatId, '📊 No transactions yet.');
  const token   = generateToken(chatId, user.username);
  const balance = await fetchBalance(chatId, token) ?? user.balance;
  const lines   = txs.map(tx => {
    const type   = tx.transaction_type || 'tx';
    const amount = tx.amount || 0;
    const sign   = (type === 'credit' || type === 'deposit') ? '+' : '-';
    const emoji  = type === 'deposit' ? '🔵' : type === 'credit' ? '🟢' : '🔴';
    return `${emoji} ${sign}${amount} ETB  •  ${type}  •  ${timeAgo(tx.created_at)}`;
  });
  await bot.sendMessage(chatId,
    `📊 Last 10 Transactions\n💰 Balance: ${balance} ETB\n\n${lines.join('\n')}`
  );
}

// ── /support ──────────────────────────────────────────────────
bot.onText(/\/support/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🆘 *ET Games Support*\n\nHaving an issue? Our support team is ready to help\\!\n\nContact us: @etgamessupport`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [[{ text: '💬 Contact Support', url: SUPPORT_URL }]]
      }
    }
  );
});

// ── /help ─────────────────────────────────────────────────────
bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🎮 *ET Games Commands*\n\n` +
    `/start — Main menu\n` +
    `/menu — Open game hub\n` +
    `/balance — Check balance\n` +
    `/transactions — Last 10 transactions\n` +
    `/refer — Refer friends & earn ${REFERRAL_BONUS} ETB\n` +
    `/support — Contact support\n` +
    `/help — Show this message\n\n` +
    `Support: @etgamessupport`,
    { parse_mode: 'MarkdownV2' }
  );
});

// ── /users (admin) ────────────────────────────────────────────
bot.onText(/\/users/, async (msg) => {
  const chatId = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return bot.sendMessage(chatId, `❌ Admin only. Your ID: ${chatId}`);
  const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
  const { data: recent } = await supabase.from('users').select('username,balance,created_at')
    .order('created_at', { ascending: false }).limit(5);
  const lines = (recent||[]).map(u => `👤 ${u.username} — ${u.balance} ETB`);
  await bot.sendMessage(chatId,
    `👥 Total users: ${count}\n\n🆕 Recent:\n${lines.join('\n')}`
  );
});

// ── /broadcast (admin) ────────────────────────────────────────
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return bot.sendMessage(chatId, '❌ Admin only.');
  const text = match[1];
  const { data: users } = await supabase.from('users').select('chat_id');
  if (!users?.length) return bot.sendMessage(chatId, '❌ No users found.');
  let sent = 0, failed = 0;
  await bot.sendMessage(chatId, `📢 Broadcasting to ${users.length} users...`);
  for (const user of users) {
    try {
      await bot.sendMessage(user.chat_id, `📢 <b>Announcement</b>\n\n${text}`, { parse_mode: 'HTML' });
      sent++;
    } catch { failed++; }
    await new Promise(r => setTimeout(r, 50));
  }
  await bot.sendMessage(chatId, `✅ Done! Sent: ${sent} | Failed: ${failed}`);
});

// ── Callback queries ──────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id);
  const user = await getUser(chatId);
  if (!user) return bot.sendMessage(chatId, '❌ Please /start first.');

  if (query.data === 'balance') {
    const token   = generateToken(chatId, user.username);
    const balance = await fetchBalance(chatId, token) ?? user.balance;
    await bot.sendMessage(chatId, `💰 Your balance: ${balance} ETB`);
  } else if (query.data === 'transactions') {
    await sendTransactionsMsg(chatId, user);
  } else if (query.data === 'refer') {
    await sendReferInfo(chatId, user);
  }
});

// ── Contact (registration) ────────────────────────────────────
bot.on('contact', async (msg) => {
  const chatId  = msg.chat.id;
  const contact = msg.contact;
  if (contact.user_id !== chatId) return bot.sendMessage(chatId, '❌ Please share your own phone number.');

  const username    = msg.from.username || msg.from.first_name || `User${String(chatId).slice(-4)}`;
  const referrerId  = pendingReferrals.get(String(chatId)) || null;

  try {
    const { user, isNew } = await registerUser(chatId, username, contact.phone_number, referrerId);
    if (referrerId) pendingReferrals.delete(String(chatId));

    await bot.sendMessage(chatId, '✅ Phone number received!', {
      reply_markup: { remove_keyboard: true }
    });

    // ── Welcome bonus for new users ───────────────────────────
    if (isNew) {
      try {
        const adminToken = jwt.sign(
          { chatId: 'system', username: 'bot', isAdmin: true },
          JWT_SECRET, { expiresIn: '1h' }
        )
        const bonusRes = await fetch(`${WALLET_URL}/api/credit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(chatId), username,
            transaction_type: 'credit', amount: 10,
            game: 'bonus',
            round_id: `WELCOME_${chatId}`,
            transaction_id: `WELCOME_${chatId}_${Date.now()}`
          })
        })
        const bonusData = await bonusRes.json()
        user.balance = bonusData.new_balance || 10

        const welcomeCaption =
          `🎉 *Welcome to ET Games!*

` +
          `You have received a *FREE 10 ETB* welcome bonus! 🎁

` +
          `Your balance is now *${user.balance} ETB* — start playing now and win big! 💰

` +
          `🎲 Ludo · 🃏 Crazy Card · 🎱 Bingo`

        const welcomeKeyboard = { inline_keyboard: [[
          { text: '🎮 Play Now!', web_app: { url: buildUrl(HOME_URL, chatId, username) } }
        ]]}

        if (WELCOME_BANNER) {
          try {
            await bot.sendPhoto(chatId, WELCOME_BANNER, { caption: welcomeCaption, parse_mode: 'Markdown', reply_markup: welcomeKeyboard })
          } catch {
            await bot.sendMessage(chatId, welcomeCaption, { parse_mode: 'Markdown', reply_markup: welcomeKeyboard })
          }
        } else {
          await bot.sendMessage(chatId, welcomeCaption, { parse_mode: 'Markdown', reply_markup: welcomeKeyboard })
        }
      } catch (e) { console.error('Welcome bonus error:', e.message) }
    }

    await sendMainMenu(chatId, username, user.balance, isNew);
  } catch (e) {
    console.error('Contact error:', e);
    await bot.sendMessage(chatId, '❌ Registration failed. Please try /start again.');
  }
});

// ── Admin: send photo to update banners ──────────────────────
// Send with caption "welcome" → updates welcome bonus photo
// Send without caption → updates main menu banner
bot.on('photo', async (msg) => {
  const chatId  = String(msg.chat.id)
  if (!ADMIN_IDS.includes(chatId)) return
  const fileId  = msg.photo[msg.photo.length - 1].file_id
  const caption = (msg.caption || '').toLowerCase()

  if (caption.includes('welcome')) {
    WELCOME_BANNER = fileId
    await bot.sendMessage(chatId,
      `✅ Welcome bonus photo updated!

New users will see this when they register.

To keep after restart add to env:
WELCOME_BANNER=${fileId}`
    )
  } else {
    process.env.BANNER_URL = fileId
    await bot.sendMessage(chatId,
      `✅ Main menu banner updated!

To keep after restart add to env:
BANNER_URL=${fileId}`
    )
    const user = await getUser(chatId)
    if (user) await sendMainMenu(chatId, user.username, user.balance, false)
  }
})

// ── /photocast (admin) — blast photo+caption to all users ────
// Usage: Send a photo to the bot with caption starting with /photocast
// Example caption: /photocast Big announcement! New game coming soon! 🎮
bot.on('photo', async (msg) => {
  const chatId  = String(msg.chat.id)
  if (!ADMIN_IDS.includes(chatId)) return
  const fileId  = msg.photo[msg.photo.length - 1].file_id
  const caption = (msg.caption || '').trim()
  const lower   = caption.toLowerCase()

  // /photocast command — blast to all users
  if (lower.startsWith('/photocast')) {
    const text = caption.replace(/^\/photocast\s*/i, '').trim()
    if (!text) return bot.sendMessage(chatId, '❌ Add a message after /photocast\n\nExample caption:\n/photocast Hello everyone! New update is live! 🎮')

    const { data: users } = await supabase.from('users').select('chat_id')
    if (!users?.length) return bot.sendMessage(chatId, '❌ No users found.')

    await bot.sendMessage(chatId, `📢 Sending photo to ${users.length} users...`)

    let sent = 0, failed = 0
    for (const user of users) {
      try {
        await bot.sendPhoto(user.chat_id, fileId, {
          caption: text,
          parse_mode: 'HTML'
        })
        sent++
      } catch { failed++ }
      await new Promise(r => setTimeout(r, 60))
    }
    await bot.sendMessage(chatId, `✅ Done!
✓ Sent: ${sent}
✗ Failed: ${failed}`)
    return
  }

  // welcome → update welcome banner
  if (lower.includes('welcome')) {
    WELCOME_BANNER = fileId
    await bot.sendMessage(chatId,
      `✅ Welcome bonus photo updated!

New users will see this when they register.

To keep after restart:
WELCOME_BANNER=${fileId}`
    )
    return
  }

  // no caption or other caption → update main menu banner
  process.env.BANNER_URL = fileId
  await bot.sendMessage(chatId,
    `✅ Main menu banner updated!

To keep after restart:
BANNER_URL=${fileId}`
  )
  const user = await getUser(chatId)
  if (user) await sendMainMenu(chatId, user.username, user.balance, false)
})

// ── Errors ────────────────────────────────────────────────────
bot.on('polling_error', e => console.error('Polling error:', e.message));
process.on('uncaughtException',  e => console.error('Uncaught:', e));
process.on('unhandledRejection', e => console.error('Unhandled:', e));
