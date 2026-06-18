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
const REFERRAL_BONUS = 10;
const AGENT_COMMISSION_RATE = 0.20; // 20% of house cut

if (!BOT_TOKEN)  throw new Error('Missing TELEGRAM_BOT_TOKEN');
if (!JWT_SECRET) throw new Error('Missing JWT_SECRET');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 ET Games bot running...');

// ── Keep-alive HTTP server ────────────────────────────────────
const http = require('http');
http.createServer((req, res) => { res.writeHead(200); res.end('Bot is running!'); })
  .listen(process.env.PORT || 3000, () => console.log('✅ Health check server running'));

// ── Helpers ───────────────────────────────────────────────────
function generateToken(chatId, username) {
  return jwt.sign({ chatId: String(chatId), username }, JWT_SECRET, { expiresIn: '30d' });
}

function generateAdminToken() {
  return jwt.sign({ chatId: 'system', username: 'bot', isAdmin: true }, JWT_SECRET, { expiresIn: '1h' });
}

function buildUrl(base, chatId, username) {
  const token = generateToken(chatId, username);
  return `${base}?token=${token}&chatId=${chatId}&username=${encodeURIComponent(username)}`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = Math.floor((new Date() - new Date(ts)) / 1000);
  if (d < 60)    return `${d}s ago`;
  if (d < 3600)  return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
}

async function getUser(chatId) {
  const { data } = await supabase.from('users').select('*').eq('chat_id', String(chatId)).single();
  return data;
}

async function fetchBalance(chatId, token) {
  try {
    const res  = await fetch(`${WALLET_URL}/api/userinfo/get/${chatId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return data.userData?.balance ?? null;
  } catch { return null; }
}

async function fetchTransactions(chatId) {
  try {
    const token = generateToken(chatId, 'bot');
    const res   = await fetch(`${WALLET_URL}/api/transactions/${chatId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data  = await res.json();
    return Array.isArray(data.transactions) ? data.transactions.slice(0, 10) : [];
  } catch { return []; }
}

async function creditUser(chatId, username, amount, game, roundId) {
  const adminToken = generateAdminToken();
  const txId = `${roundId}_${Date.now()}`;
  const res = await fetch(`${WALLET_URL}/api/credit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: String(chatId), username,
      transaction_type: 'credit', amount,
      game, round_id: roundId, transaction_id: txId
    })
  });
  return res.json();
}

async function getAllUsers() {
  const users = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase.from('users').select('chat_id').range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    users.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return users;
}

// ── Agent helpers ─────────────────────────────────────────────
async function getAgent(chatId) {
  const { data } = await supabase.from('agents').select('*').eq('chat_id', String(chatId)).eq('is_active', true).single();
  return data;
}

async function isAgent(chatId) {
  const agent = await getAgent(chatId);
  return !!agent;
}

// Pay agent commission when a bingo game ends
// Called from bingo server via webhook — or you can call it from bot directly
async function payAgentCommission(userId, gameId, houseCut) {
  try {
    // Find if this user was referred by an agent
    const { data: referral } = await supabase
      .from('referrals')
      .select('agent_id')
      .eq('referred_id', String(userId))
      .not('agent_id', 'is', null)
      .single();

    if (!referral?.agent_id) return;

    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('chat_id', referral.agent_id)
      .eq('is_active', true)
      .single();

    if (!agent) return;

    const commission = Math.floor(houseCut * agent.commission_rate);
    if (commission <= 0) return;

    // Credit agent
    await creditUser(agent.chat_id, agent.username, commission, 'agent_commission', `AGENT_${gameId}`);

    // Log it
    await supabase.from('agent_commissions').insert({
      agent_id: agent.chat_id,
      user_id: String(userId),
      game: 'bingo',
      game_id: gameId,
      house_cut: houseCut,
      commission,
      created_at: new Date().toISOString()
    });

    // Update agent total
    await supabase.from('agents')
      .update({ total_commission: (agent.total_commission || 0) + commission })
      .eq('chat_id', agent.chat_id);

    console.log(`[AGENT] ${agent.chat_id} earned ${commission} ETB commission from game ${gameId}`);

    // Notify agent silently (no ping if night time — just log for now)
    await bot.sendMessage(agent.chat_id,
      `💰 <b>Commission Earned!</b>\n\n` +
      `+${commission} ETB from a Bingo game played by your user.\n` +
      `Game: <code>${gameId}</code>`,
      { parse_mode: 'HTML' }
    ).catch(() => {});

  } catch (err) {
    console.error('[AGENT] Commission error:', err.message);
  }
}

// ── Referral helpers ──────────────────────────────────────────
async function registerReferral(referrerId, referredId, agentId = null) {
  if (String(referrerId) === String(referredId)) return;
  const { data: existing } = await supabase.from('referrals').select('id').eq('referred_id', String(referredId)).single();
  if (existing) return;
  await supabase.from('referrals').insert({
    referrer_id:  String(referrerId),
    referred_id:  String(referredId),
    status:       'pending',
    bonus_amount: REFERRAL_BONUS,
    agent_id:     agentId ? String(agentId) : null,
    created_at:   new Date().toISOString()
  });
}

async function rewardReferrer(referredId) {
  const { data: referral } = await supabase.from('referrals')
    .select('*').eq('referred_id', String(referredId)).eq('status', 'pending').single();
  if (!referral) return;

  const referrer = await getUser(referral.referrer_id);
  if (!referrer) return;

  await creditUser(referrer.chat_id, referrer.username, REFERRAL_BONUS, 'referral', `REFERRAL_${referral.id}`);

  await supabase.from('referrals').update({
    status: 'rewarded', rewarded_at: new Date().toISOString()
  }).eq('id', referral.id);

  await bot.sendMessage(referrer.chat_id,
    `🎉 Your referral bonus has arrived!\n\n💰 +${REFERRAL_BONUS} ETB added to your balance.\nA friend you invited just made their first deposit!`
  ).catch(() => {});
}

async function getReferralStats(chatId) {
  const { data } = await supabase.from('referrals').select('*').eq('referrer_id', String(chatId));
  return data || [];
}

// ── Register user ─────────────────────────────────────────────
async function registerUser(chatId, username, phoneNumber, referrerId = null, agentId = null) {
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

  if (referrerId) await registerReferral(referrerId, chatId, agentId);

  return { user: newUser, isNew: true };
}

// ── Pending state maps ────────────────────────────────────────
const pendingReferrals  = new Map(); // chatId → referrerId
const pendingAgentRefs  = new Map(); // chatId → agentId
const pendingDeposit    = new Map(); // chatId → true (waiting for reference)
const pendingWithdraw   = new Map(); // chatId → { step: 'phone'|'amount', phone? }

// ── Main Menu ─────────────────────────────────────────────────
let WELCOME_BANNER = process.env.WELCOME_BANNER || '';

// Persistent bottom keyboard — always visible
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: '🎮 Play Games' }, { text: '💳 Deposit' }],
    [{ text: '🏧 Withdraw'  }, { text: '💰 Balance'  }],
    [{ text: '🔗 Refer & Earn' }, { text: '🆘 Support' }],
  ],
  resize_keyboard: true,
  persistent: true, // stays visible always
};

async function sendMainMenu(chatId, username, balance, isNew) {
  const homeUrl = buildUrl(HOME_URL, chatId, username);
  const agentUser = await getAgent(chatId);

  const caption = isNew
    ? `✅ Registration complete!\n\n👤 ${username}\n💰 Balance: ${balance} ETB\n\nWelcome to ET Games! 🎮`
    : `👋 Welcome back ${username}!\n\n💰 Balance: ${balance} ETB\n\n🎲 Ludo · 🃏 Crazy Card · 🎱 Bingo`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎮 Open Game Hub', web_app: { url: homeUrl } }],
      [
        { text: '💳 Deposit',       callback_data: 'deposit' },
        { text: '🏧 Withdraw',      callback_data: 'withdraw' },
      ],
      [
        { text: '📊 Transactions',  callback_data: 'transactions' },
        { text: '💰 Balance',       callback_data: 'balance' },
      ],
      [
        { text: '🔗 Refer & Earn',  callback_data: 'refer' },
        { text: '🆘 Support',       url: SUPPORT_URL },
      ],
      ...(agentUser ? [[{ text: '🏢 Agent Dashboard', callback_data: 'agent_dashboard' }]] : []),
    ]
  };

  // First send persistent keyboard so it appears at bottom
  await bot.sendMessage(chatId, '🎮', { reply_markup: MAIN_KEYBOARD }).catch(() => {});

  if (process.env.BANNER_URL) {
    try {
      await bot.sendPhoto(chatId, process.env.BANNER_URL, { caption, reply_markup: keyboard });
      return;
    } catch(e) { console.error('Photo send failed:', e.message); }
  }
  await bot.sendMessage(chatId, caption, { reply_markup: keyboard });
}

// ── Deposit flow ──────────────────────────────────────────────
const TELEBIRR_PHONE   = '0997515809';
const TELEBIRR_NAME    = 'Biruuke Nigida';

async function startDeposit(chatId, username) {
  pendingDeposit.set(String(chatId), true);
  await bot.sendMessage(chatId,
    `💳 <b>Deposit via Telebirr</b>\n\n` +
    `<b>Step 1:</b> Open Telebirr and send money to:\n` +
    `📱 <code>${TELEBIRR_PHONE}</code>  👤 <b>${TELEBIRR_NAME}</b>\n\n` +
    `<b>Step 2:</b> After sending, copy your payment proof\n` +
    `(Full SMS, receipt link, or just the transaction ID)\n\n` +
    `<b>Step 3:</b> Paste it below 👇\n\n` +
    `<i>Send your Telebirr message, link, or transaction ID now:</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_deposit' }]] }
    }
  );
}

async function processDeposit(chatId, username, input) {
  pendingDeposit.delete(String(chatId));
  const token = generateToken(chatId, username);

  const processingMsg = await bot.sendMessage(chatId,
    `🔄 <b>Verifying your payment...</b>\n\nPlease wait, this may take a moment.`,
    { parse_mode: 'HTML' }
  );

  try {
    const res = await fetch(`${DEPOSIT_URL}/api/verify-and-deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input,                      // full SMS, link, or tx ID — same as web
        user_id: String(chatId),
        username,
        user_jwt: token             // same JWT the web uses
      })
    });
    const data = await res.json();

    await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});

    if (data.success) {
      const bonusLine = data.message?.includes('bonus')
        ? `\n🎁 <b>${data.message}</b>` : '';
      await bot.sendMessage(chatId,
        `✅ <b>Deposit Successful!</b>\n\n` +
        `💰 Amount: <b>${data.transaction?.amount?.toLocaleString() || '?'} ETB</b>${bonusLine}\n` +
        `📊 New Balance: <b>${parseFloat(data.new_balance || 0).toLocaleString()} ETB</b>\n` +
        `🔖 Reference: <code>${data.reference}</code>\n` +
        `👤 Payer: ${data.transaction?.payer || 'N/A'}\n\n` +
        `Your balance is ready\. Good luck\! 🎮`,
        { parse_mode: 'HTML' }
      );
    } else {
      await bot.sendMessage(chatId,
        `❌ <b>Deposit Failed</b>\n\n${data.error || 'Unknown error'}\n\n` +
        `Try again with /deposit or contact @etgamessupport`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[
            { text: '🔄 Try Again', callback_data: 'deposit' },
            { text: '🆘 Support', url: SUPPORT_URL }
          ]]}
        }
      );
    }
  } catch (err) {
    await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
    await bot.sendMessage(chatId,
      `❌ <b>Verification Error</b>\n\nYour case has been reported to admin for manual review.\n\nContact @etgamessupport if not resolved within 24h.`,
      { parse_mode: 'HTML' }
    );
  }
}

// ── Withdraw flow ─────────────────────────────────────────────
async function startWithdraw(chatId) {
  pendingWithdraw.set(String(chatId), { step: 'phone' });
  await bot.sendMessage(chatId,
    `🏧 <b>Withdraw via Telebirr</b>\n\n` +
    `Minimum withdrawal: <b>50 ETB</b>\n` +
    `Processed within 24 hours\n\n` +
    `Enter your <b>Telebirr phone number</b>:`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_withdraw' }]] }
    }
  );
}

async function processWithdraw(chatId, username, phone, amount) {
  pendingWithdraw.delete(String(chatId));
  const token = generateToken(chatId, username);

  const processingMsg = await bot.sendMessage(chatId, '⏳ Processing your withdrawal request...');

  try {
    const res = await fetch(`${WALLET_URL}/api/withdraw`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, amount })
    });
    const data = await res.json();

    await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});

    if (res.ok && data.success !== false) {
      await bot.sendMessage(chatId,
        `✅ <b>Withdrawal Requested!</b>\n\n` +
        `💰 Amount: <b>${amount} ETB</b>\n` +
        `📱 To: <b>${phone}</b>\n\n` +
        `⏳ Will be processed within 24 hours.`,
        { parse_mode: 'HTML' }
      );
    } else {
      await bot.sendMessage(chatId,
        `❌ <b>Withdrawal Failed</b>\n\n${data.error || data.message || 'Unknown error'}`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (err) {
    await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
    await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
}

// ── Agent dashboard ───────────────────────────────────────────
async function sendAgentDashboard(chatId) {
  const agent = await getAgent(chatId);
  if (!agent) return bot.sendMessage(chatId, '❌ You are not an agent. Contact admin.');

  // Get referred users
  const { data: referrals } = await supabase
    .from('referrals')
    .select('referred_id, status, created_at')
    .eq('agent_id', String(chatId));

  const totalReferred = referrals?.length || 0;
  const activeUsers   = referrals?.filter(r => r.status === 'rewarded').length || 0;

  // Get commission history
  const { data: commissions } = await supabase
    .from('agent_commissions')
    .select('commission, created_at, user_id')
    .eq('agent_id', String(chatId))
    .order('created_at', { ascending: false })
    .limit(5);

  const totalCommission = agent.total_commission || 0;
  const recentLines = (commissions || []).map(c =>
    `  +${c.commission} ETB  •  ${timeAgo(c.created_at)}`
  ).join('\n') || '  No commissions yet';

  // Generate agent referral link
  const botInfo = await bot.getMe();
  const agentLink = `https://t.me/${botInfo.username}?start=AGENT_${chatId}`;

  await bot.sendMessage(chatId,
    `🏢 <b>Agent Dashboard</b>\n\n` +
    `👤 Agent: <b>${agent.username}</b>\n` +
    `📊 Commission Rate: <b>${(agent.commission_rate * 100).toFixed(0)}%</b> of house cut\n\n` +
    `👥 <b>Your Users</b>\n` +
    `Total referred: <b>${totalReferred}</b>\n` +
    `Active (deposited): <b>${activeUsers}</b>\n\n` +
    `💰 <b>Earnings</b>\n` +
    `Total commission: <b>${totalCommission} ETB</b>\n\n` +
    `📋 <b>Recent Commissions:</b>\n${recentLines}\n\n` +
    `🔗 <b>Your Agent Link:</b>\n<code>${agentLink}</code>\n\n` +
    `Share this link — when users register through it and play Bingo, you earn commission!`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '📤 Share Agent Link', url: `https://t.me/share/url?url=${encodeURIComponent(agentLink)}&text=${encodeURIComponent('Join ET Games! 🎮 Play Bingo, Ludo & win ETB!')}` }
        ]]
      }
    }
  );
}

// ── /start ────────────────────────────────────────────────────
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId   = msg.chat.id;
  const username = msg.from.username || msg.from.first_name || `User${String(chatId).slice(-4)}`;
  const param    = match?.[1]?.trim();

  let referrerId = null;
  let agentId    = null;

  if (param?.startsWith('REF_')) {
    referrerId = param.replace('REF_', '');
  } else if (param?.startsWith('AGENT_')) {
    agentId    = param.replace('AGENT_', '');
    referrerId = agentId; // Agent referral also tracks normal referral
  }

  try {
    const user = await getUser(chatId);

    if (user?.phone_number) {
      const token   = generateToken(chatId, user.username);
      const balance = await fetchBalance(chatId, token) ?? user.balance;
      await sendMainMenu(chatId, user.username, balance, false);
      return;
    }

    // New user — show a nice welcome with inline CTA before asking for phone
    await bot.sendMessage(chatId,
      `🎮 <b>Welcome to ET Games!</b>

` +
      `Ethiopia's #1 Telegram gaming platform\.?

` +
      `🎲 Ludo  •  🃏 Crazy Card  •  🎱 Bingo

` +
      `Win real ETB every day\!`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Register & Play Now', callback_data: 'start_register' }],
            [{ text: '🆘 Support', url: SUPPORT_URL }],
          ]
        }
      }
    );

    const welcomeText = agentId
      ? `👋 Welcome to *ET Games*\\!\n\nYou were invited by an agent 🎉\n\nShare your phone number to get started\\.`
      : referrerId
        ? `👋 Welcome to *ET Games*\\!\n\nYou were invited by a friend 🎉\n\nShare your phone number to register and your friend gets *${REFERRAL_BONUS} ETB* when you make your first deposit\\.`
        : `👋 Welcome to *ET Games*\\!\n\nShare your phone number to register\\.`;

    await bot.sendMessage(chatId, welcomeText, {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        keyboard: [[{ text: '📱 Share My Phone Number', request_contact: true }]],
        resize_keyboard: true, one_time_keyboard: true
      }
    });

    if (referrerId) pendingReferrals.set(String(chatId), referrerId);
    if (agentId)    pendingAgentRefs.set(String(chatId), agentId);

  } catch (e) {
    console.error('/start error:', e);
    await bot.sendMessage(chatId, '❌ Something went wrong. Please try /start again.');
  }
});

// ── /deposit ──────────────────────────────────────────────────
bot.onText(/\/deposit/, async (msg) => {
  const chatId = msg.chat.id;
  const user   = await getUser(chatId);
  if (!user) return bot.sendMessage(chatId, '❌ Please /start first.');
  await startDeposit(chatId, user.username);
});

// ── /withdraw ─────────────────────────────────────────────────
bot.onText(/\/withdraw/, async (msg) => {
  const chatId = msg.chat.id;
  const user   = await getUser(chatId);
  if (!user) return bot.sendMessage(chatId, '❌ Please /start first.');
  await startWithdraw(chatId);
});

// ── /agent ────────────────────────────────────────────────────
bot.onText(/\/agent/, async (msg) => {
  const chatId = msg.chat.id;
  await sendAgentDashboard(chatId);
});

// ── /makeagent (admin) ────────────────────────────────────────
bot.onText(/\/makeagent(?:\s+(.+))?/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return bot.sendMessage(chatId, '❌ Admin only.');

  const input = match?.[1]?.trim();
  if (!input) return bot.sendMessage(chatId, '❌ Usage: /makeagent @username or /makeagent chat_id');

  try {
    // Find user by username or chat_id
    const searchVal = input.replace('@', '');
    const { data: users } = await supabase.from('users').select('*')
      .or(`username.ilike.${searchVal},chat_id.eq.${searchVal}`).limit(1);

    if (!users?.length) return bot.sendMessage(chatId, `❌ User not found: ${input}`);

    const target = users[0];

    // Check if already agent
    const { data: existing } = await supabase.from('agents').select('id').eq('chat_id', target.chat_id).single();
    if (existing) return bot.sendMessage(chatId, `⚠️ ${target.username} is already an agent.`);

    // Create agent
    await supabase.from('agents').insert({
      chat_id: target.chat_id,
      username: target.username,
      commission_rate: AGENT_COMMISSION_RATE,
      promoted_by: chatId,
      created_at: new Date().toISOString()
    });

    await bot.sendMessage(chatId,
      `✅ <b>${target.username}</b> is now an agent!\n\n` +
      `Commission: ${(AGENT_COMMISSION_RATE * 100).toFixed(0)}% of house cut\n` +
      `Chat ID: <code>${target.chat_id}</code>`,
      { parse_mode: 'HTML' }
    );

    // Notify the new agent
    await bot.sendMessage(target.chat_id,
      `🎉 <b>You're now an ET Games Agent!</b>\n\n` +
      `You earn <b>${(AGENT_COMMISSION_RATE * 100).toFixed(0)}%</b> of the house cut every time your referred users play Bingo.\n\n` +
      `Use /agent to see your dashboard and referral link.`,
      { parse_mode: 'HTML' }
    ).catch(() => {});

  } catch (e) {
    bot.sendMessage(chatId, `❌ Error: ${e.message}`);
  }
});

// ── /removeagent (admin) ──────────────────────────────────────
bot.onText(/\/removeagent(?:\s+(.+))?/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return bot.sendMessage(chatId, '❌ Admin only.');
  const input = match?.[1]?.trim();
  if (!input) return bot.sendMessage(chatId, '❌ Usage: /removeagent @username or chat_id');

  const searchVal = input.replace('@', '');
  const { data: agents } = await supabase.from('agents').select('*')
    .or(`username.ilike.${searchVal},chat_id.eq.${searchVal}`).limit(1);

  if (!agents?.length) return bot.sendMessage(chatId, `❌ Agent not found: ${input}`);

  await supabase.from('agents').update({ is_active: false }).eq('chat_id', agents[0].chat_id);
  bot.sendMessage(chatId, `✅ ${agents[0].username} removed as agent.`);
});

// ── /agents (admin) ───────────────────────────────────────────
bot.onText(/\/agents/, async (msg) => {
  const chatId = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return bot.sendMessage(chatId, '❌ Admin only.');

  const { data: agents } = await supabase.from('agents').select('*').eq('is_active', true).order('total_commission', { ascending: false });

  if (!agents?.length) return bot.sendMessage(chatId, '📋 No active agents yet.');

  const lines = agents.map((a, i) =>
    `${i+1}. <b>${a.username}</b> — ${a.total_commission || 0} ETB earned`
  ).join('\n');

  bot.sendMessage(chatId, `🏢 <b>Active Agents (${agents.length})</b>\n\n${lines}`, { parse_mode: 'HTML' });
});

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
    `Invite friends and earn *${REFERRAL_BONUS} ETB* for every friend who deposits\\!\n\n` +
    `✅ Rewarded: ${rewarded}\n` +
    `⏳ Pending: ${pending}\n` +
    `💰 Total earned: ${earned} ETB\n\n` +
    `🔗 Your link:\n\`${refLink}\``,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: [[
        { text: '📤 Share Link', url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('Join ET Games and win ETB! 🎮')}` }
      ]]}
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
  await bot.sendMessage(chatId, `📊 Last 10 Transactions\n💰 Balance: ${balance} ETB\n\n${lines.join('\n')}`);
}

// ── /support ──────────────────────────────────────────────────
bot.onText(/\/support/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🆘 *ET Games Support*\n\nContact us: @etgamessupport`,
    { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: [[{ text: '💬 Contact Support', url: SUPPORT_URL }]] } }
  );
});

// ── /help ─────────────────────────────────────────────────────
bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🎮 <b>ET Games Commands</b>\n\n` +
    `/start — Main menu\n` +
    `/deposit — Deposit via Telebirr\n` +
    `/withdraw — Withdraw funds\n` +
    `/balance — Check balance\n` +
    `/transactions — Last 10 transactions\n` +
    `/refer — Refer friends & earn ${REFERRAL_BONUS} ETB\n` +
    `/agent — Agent dashboard (if you're an agent)\n` +
    `/support — Contact support\n` +
    `/help — Show this message`,
    { parse_mode: 'HTML' }
  );
});

// ── Admin commands ────────────────────────────────────────────
bot.onText(/\/users/, async (msg) => {
  const chatId = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return bot.sendMessage(chatId, `❌ Admin only. Your ID: ${chatId}`);
  const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
  const { data: recent } = await supabase.from('users').select('username,balance,created_at').order('created_at', { ascending: false }).limit(5);
  const lines = (recent||[]).map(u => `👤 ${u.username} — ${u.balance} ETB`);
  await bot.sendMessage(chatId, `👥 Total users: ${count}\n\n🆕 Recent:\n${lines.join('\n')}`);
});

bot.onText(/\/broadcast ([\s\S]+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return bot.sendMessage(chatId, '❌ Admin only.');
  const text = match[1].trim();
  const users = await getAllUsers();
  if (!users.length) return bot.sendMessage(chatId, '❌ No users found.');
  let sent = 0, failed = 0;
  await bot.sendMessage(chatId, `📢 Broadcasting to ${users.length} users...`);
  for (const user of users) {
    try { await bot.sendMessage(user.chat_id, `📢 <b>Announcement</b>\n\n${text}`, { parse_mode: 'HTML' }); sent++; }
    catch { failed++; }
    await new Promise(r => setTimeout(r, 50));
  }
  await bot.sendMessage(chatId, `✅ Done! Sent: ${sent} | Failed: ${failed}`);
});

bot.onText(/\/stats/, async (msg) => {
  const chatId = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return bot.sendMessage(chatId, '❌ Admin only.');
  try {
    const safe = async (fn) => { try { return await fn(); } catch { return { data: [], count: 0 }; } };
    const [{ count: totalUsers }, { data: txs }, { data: withdrawals }, { data: referrals }, { data: agentsData }] = await Promise.all([
      safe(() => supabase.from('users').select('*', { count: 'exact', head: true })),
      safe(() => supabase.from('transactions').select('transaction_type,amount,game').eq('status', 'success')),
      safe(() => supabase.from('withdrawals').select('amount,status')),
      safe(() => supabase.from('referrals').select('status')),
      safe(() => supabase.from('agents').select('total_commission').eq('is_active', true)),
    ]);
    const allTxs   = txs || [];
    const deposits = allTxs.filter(t => t.transaction_type==='deposit').reduce((s,t)=>s+parseFloat(t.amount||0),0);
    const debits   = allTxs.filter(t => t.transaction_type==='debit').reduce((s,t)=>s+parseFloat(t.amount||0),0);
    const credits  = allTxs.filter(t => t.transaction_type==='credit').reduce((s,t)=>s+parseFloat(t.amount||0),0);
    const profit   = debits - credits;
    const withdrawn   = (withdrawals||[]).filter(w=>w.status==='completed').reduce((s,w)=>s+parseFloat(w.amount||0),0);
    const pendingW    = (withdrawals||[]).filter(w=>w.status==='pending').reduce((s,w)=>s+parseFloat(w.amount||0),0);
    const rewarded    = (referrals||[]).filter(r=>r.status==='rewarded').length;
    const agentsPaid  = (agentsData||[]).reduce((s,a)=>s+parseFloat(a.total_commission||0),0);
    const bingoP = allTxs.filter(t=>t.transaction_type==='debit'&&t.game?.toLowerCase()==='bingo').reduce((s,t)=>s+parseFloat(t.amount||0),0)
                 - allTxs.filter(t=>t.transaction_type==='credit'&&t.game?.toLowerCase()==='bingo').reduce((s,t)=>s+parseFloat(t.amount||0),0);
    const ludoP  = allTxs.filter(t=>t.transaction_type==='debit'&&t.game?.toLowerCase()==='ludo').reduce((s,t)=>s+parseFloat(t.amount||0),0)
                 - allTxs.filter(t=>t.transaction_type==='credit'&&t.game?.toLowerCase()==='ludo').reduce((s,t)=>s+parseFloat(t.amount||0),0);
    const crazyP = allTxs.filter(t=>t.transaction_type==='debit'&&t.game?.toLowerCase()==='crazy').reduce((s,t)=>s+parseFloat(t.amount||0),0)
                 - allTxs.filter(t=>t.transaction_type==='credit'&&t.game?.toLowerCase()==='crazy').reduce((s,t)=>s+parseFloat(t.amount||0),0);

    await bot.sendMessage(chatId,
      `📊 <b>ET Games Stats</b>\n\n` +
      `👥 Users: <b>${totalUsers}</b>\n` +
      `💳 Deposits: <b>${deposits.toFixed(2)} ETB</b>\n` +
      `📈 Debits: <b>${debits.toFixed(2)} ETB</b>\n` +
      `📉 Credits: <b>${credits.toFixed(2)} ETB</b>\n` +
      `💰 Net Profit: <b>${profit.toFixed(2)} ETB</b>\n\n` +
      `🏧 Withdrawn: <b>${withdrawn.toFixed(2)} ETB</b>\n` +
      `⏳ Pending: <b>${pendingW.toFixed(2)} ETB</b>\n` +
      `🔗 Referrals Paid: <b>${rewarded}</b>\n` +
      `🏢 Agent Commissions: <b>${agentsPaid.toFixed(2)} ETB</b>\n\n` +
      `🎮 <b>Per Game:</b>\n🎲 Ludo: ${ludoP.toFixed(2)} ETB\n🃏 Crazy: ${crazyP.toFixed(2)} ETB\n🎱 Bingo: ${bingoP.toFixed(2)} ETB`,
      { parse_mode: 'HTML' }
    );
  } catch(e) { bot.sendMessage(chatId, '❌ Error: ' + e.message); }
});

bot.onText(/\/top/, async (msg) => {
  const chatId = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return bot.sendMessage(chatId, '❌ Admin only.');
  try {
    const { data: richest } = await supabase.from('users').select('username,balance').order('balance', { ascending: false }).limit(10);
    const { data: txCounts } = await supabase.from('transactions').select('username').eq('transaction_type', 'debit').eq('status', 'success');
    const counts = {};
    (txCounts||[]).forEach(t => { counts[t.username] = (counts[t.username]||0)+1; });
    const activeList = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,count],i) => `${i+1}. ${name||'?'} — <b>${count} games</b>`).join('\n');
    const richList = (richest||[]).map((u,i) => `${i+1}. ${u.username||'?'} — <b>${parseFloat(u.balance||0).toFixed(2)} ETB</b>`).join('\n');
    await bot.sendMessage(chatId, `🏆 <b>Top Players</b>\n\n💰 <b>Richest:</b>\n${richList||'—'}\n\n🎮 <b>Most Active:</b>\n${activeList||'—'}`, { parse_mode: 'HTML' });
  } catch(e) { bot.sendMessage(chatId, '❌ Error: ' + e.message); }
});

bot.onText(/\/finduser (.+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return bot.sendMessage(chatId, '❌ Admin only.');
  const query = match[1].trim();
  try {
    const { data: users } = await supabase.from('users').select('*').or(`username.ilike.%${query}%,chat_id.ilike.%${query}%,phone_number.ilike.%${query}%`).limit(5);
    if (!users?.length) return bot.sendMessage(chatId, `❌ No user found for: ${query}`);
    for (const u of users) {
      const { data: txs } = await supabase.from('transactions').select('transaction_type,amount').eq('user_id', u.chat_id).eq('status', 'success');
      const games     = (txs||[]).filter(t=>t.transaction_type==='debit').length;
      const deposited = (txs||[]).filter(t=>t.transaction_type==='deposit').reduce((s,t)=>s+parseFloat(t.amount||0),0);
      const agentFlag = await isAgent(u.chat_id) ? ' 🏢 Agent' : '';
      await bot.sendMessage(chatId,
        `👤 <b>${u.username||'Unknown'}</b>${agentFlag}\n🆔 <code>${u.chat_id}</code>\n📱 ${u.phone_number||'—'}\n💰 Balance: <b>${parseFloat(u.balance||0).toFixed(2)} ETB</b>\n💳 Deposited: <b>${deposited.toFixed(2)} ETB</b>\n🎮 Games: <b>${games}</b>`,
        { parse_mode: 'HTML' }
      );
    }
  } catch(e) { bot.sendMessage(chatId, '❌ Error: ' + e.message); }
});

bot.onText(/\/pending/, async (msg) => {
  const chatId = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return bot.sendMessage(chatId, '❌ Admin only.');
  try {
    const { data: withdrawals } = await supabase.from('withdrawals').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (!withdrawals?.length) return bot.sendMessage(chatId, '✅ No pending withdrawals!');
    const total = withdrawals.reduce((s,w)=>s+parseFloat(w.amount||0),0);
    const lines = withdrawals.map((w,i) => {
      const approveUrl = `https://wallet-api-rdxt.onrender.com/api/withdraw/${w.id}/complete-notify`;
      const rejectUrl  = `https://wallet-api-rdxt.onrender.com/api/withdraw/${w.id}/reject-notify`;
      return `${i+1}. <b>${w.username}</b> — ${w.amount} ETB to ${w.phone}\n<a href="${approveUrl}">✅ Approve</a> | <a href="${rejectUrl}">❌ Reject</a>`;
    }).join('\n\n');
    await bot.sendMessage(chatId, `🏧 <b>Pending (${withdrawals.length})</b>\nTotal: <b>${total.toFixed(2)} ETB</b>\n\n${lines}`, { parse_mode: 'HTML', disable_web_page_preview: true });
  } catch(e) { bot.sendMessage(chatId, '❌ Error: ' + e.message); }
});

// ── Callback queries ──────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id);
  const user = await getUser(chatId);

  // Register button on welcome screen
  if (query.data === 'start_register') {
    const welcomeText = pendingAgentRefs.has(String(chatId))
      ? `🎉 You were invited by an agent!

Share your phone number to join ET Games and get started:`
      : pendingReferrals.has(String(chatId))
        ? `🎉 You were invited by a friend!

Share your phone to register — your friend gets ${REFERRAL_BONUS} ETB when you deposit!`
        : `📱 Share your phone number to create your account:`;

    await bot.sendMessage(chatId, welcomeText, {
      reply_markup: {
        keyboard: [[{ text: '📱 Share My Phone Number', request_contact: true }]],
        resize_keyboard: true, one_time_keyboard: true
      }
    });
    return;
  }

  if (query.data === 'deposit') {
    if (!user) return bot.sendMessage(chatId, '❌ Please /start first.');
    return startDeposit(chatId, user.username);
  }
  if (query.data === 'cancel_deposit') {
    pendingDeposit.delete(String(chatId));
    return bot.sendMessage(chatId, '❌ Deposit cancelled.');
  }
  if (query.data === 'withdraw') {
    if (!user) return bot.sendMessage(chatId, '❌ Please /start first.');
    return startWithdraw(chatId);
  }
  if (query.data === 'cancel_withdraw') {
    pendingWithdraw.delete(String(chatId));
    return bot.sendMessage(chatId, '❌ Withdrawal cancelled.');
  }
  if (query.data === 'agent_dashboard') {
    return sendAgentDashboard(chatId);
  }
  if (!user) return bot.sendMessage(chatId, '❌ Please /start first.');
  if (query.data === 'balance') {
    const token   = generateToken(chatId, user.username);
    const balance = await fetchBalance(chatId, token) ?? user.balance;
    return bot.sendMessage(chatId, `💰 Your balance: ${balance} ETB`);
  }
  if (query.data === 'transactions') return sendTransactionsMsg(chatId, user);
  if (query.data === 'refer')        return sendReferInfo(chatId, user);
});

// ── Text message handler (keyboard + deposit/withdraw flows) ─────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId   = String(msg.chat.id);
  const text     = msg.text.trim();
  const user     = await getUser(chatId);

  // Handle persistent keyboard buttons
  if (user) {
    if (text === '🎮 Play Games') {
      const homeUrl = buildUrl(HOME_URL, chatId, user.username);
      return bot.sendMessage(chatId, '🎮 Opening Game Hub...', {
        reply_markup: { inline_keyboard: [[{ text: '🎮 Open Game Hub', web_app: { url: homeUrl } }]] }
      });
    }
    if (text === '💳 Deposit')     return startDeposit(chatId, user.username);
    if (text === '🏧 Withdraw')    return startWithdraw(chatId);
    if (text === '🆘 Support')     return bot.sendMessage(chatId, `Contact support: @etgamessupport`, { reply_markup: { inline_keyboard: [[{ text: '💬 Contact Support', url: SUPPORT_URL }]] } });
    if (text === '🔗 Refer & Earn') return sendReferInfo(chatId, user);
    if (text === '💰 Balance') {
      const token   = generateToken(chatId, user.username);
      const balance = await fetchBalance(chatId, token) ?? user.balance;
      return bot.sendMessage(chatId, `💰 Your balance: <b>${balance} ETB</b>`, { parse_mode: 'HTML' });
    }
  }

  if (!user) return;

  // Deposit flow — waiting for reference
  if (pendingDeposit.has(chatId)) {
    return processDeposit(chatId, user.username, text);
  }

  // Withdraw flow
  if (pendingWithdraw.has(chatId)) {
    const state = pendingWithdraw.get(chatId);

    if (state.step === 'phone') {
      // Validate phone
      const phone = text.replace(/\s/g, '');
      if (!/^(\+251|0251|251|09|07)\d{8,9}$/.test(phone)) {
        return bot.sendMessage(chatId, '❌ Invalid phone number. Enter a valid Ethiopian phone number (e.g. 0911223344):');
      }
      pendingWithdraw.set(chatId, { step: 'amount', phone });
      return bot.sendMessage(chatId,
        `📱 Phone: <b>${phone}</b>\n\nNow enter the <b>amount in ETB</b> (minimum 50):`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_withdraw' }]] } }
      );
    }

    if (state.step === 'amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 50) {
        return bot.sendMessage(chatId, '❌ Minimum withdrawal is 50 ETB. Enter a valid amount:');
      }
      return processWithdraw(chatId, user.username, state.phone, amount);
    }
  }
});

// ── Contact (registration) ────────────────────────────────────
bot.on('contact', async (msg) => {
  const chatId  = msg.chat.id;
  const contact = msg.contact;
  if (contact.user_id !== chatId) return bot.sendMessage(chatId, '❌ Please share your own phone number.');

  const username   = msg.from.username || msg.from.first_name || `User${String(chatId).slice(-4)}`;
  const referrerId = pendingReferrals.get(String(chatId)) || null;
  const agentId    = pendingAgentRefs.get(String(chatId)) || null;

  try {
    const { user, isNew } = await registerUser(chatId, username, contact.phone_number, referrerId, agentId);
    pendingReferrals.delete(String(chatId));
    pendingAgentRefs.delete(String(chatId));

    await bot.sendMessage(chatId, '✅ Phone number received!', { reply_markup: { remove_keyboard: true } });

    const WELCOME_BONUS_ENABLED = process.env.WELCOME_BONUS !== 'false';
    if (isNew && WELCOME_BONUS_ENABLED) {
      try {
        const bonusRes = await fetch(`${WALLET_URL}/api/credit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${generateAdminToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(chatId), username,
            transaction_type: 'credit', amount: 10,
            game: 'bonus', round_id: `WELCOME_${chatId}`,
            transaction_id: `WELCOME_${chatId}_${Date.now()}`
          })
        });
        const bonusData = await bonusRes.json();
        user.balance = bonusData.new_balance || 10;

        const welcomeMsg =
          `🎉 <b>Welcome to ET Games!</b>\n\n` +
          `You received a <b>FREE 10 ETB</b> welcome bonus! 🎁\n\n` +
          `Your balance: <b>${user.balance} ETB</b> — start playing now!`;

        const welcomeKeyboard = { inline_keyboard: [[{ text: '🎮 Play Now!', web_app: { url: buildUrl(HOME_URL, chatId, username) } }]] };

        if (WELCOME_BANNER) {
          await bot.sendPhoto(chatId, WELCOME_BANNER, { caption: welcomeMsg, parse_mode: 'HTML', reply_markup: welcomeKeyboard }).catch(
            () => bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'HTML', reply_markup: welcomeKeyboard })
          );
        } else {
          await bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'HTML', reply_markup: welcomeKeyboard });
        }
      } catch (e) { console.error('Welcome bonus error:', e.message); }
    }

    await sendMainMenu(chatId, username, user.balance, isNew);
  } catch (e) {
    console.error('Contact error:', e);
    await bot.sendMessage(chatId, '❌ Registration failed. Please try /start again.');
  }
});

// ── Photo handler (admin banners + photocast) ─────────────────
bot.on('photo', async (msg) => {
  const chatId  = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return;
  const fileId  = msg.photo[msg.photo.length - 1].file_id;
  const caption = (msg.caption || '').trim();
  const lower   = caption.toLowerCase();

  if (lower.startsWith('/photocast')) {
    const text = caption.replace(/^\/photocast\s*/i, '').trim();
    if (!text) return bot.sendMessage(chatId, '❌ Add a message after /photocast');
    const users = await getAllUsers();
    if (!users.length) return bot.sendMessage(chatId, '❌ No users found.');
    await bot.sendMessage(chatId, `📢 Sending photo to ${users.length} users...`);
    let sent = 0, failed = 0;
    for (const user of users) {
      try { await bot.sendPhoto(user.chat_id, fileId, { caption: text, parse_mode: 'HTML' }); sent++; }
      catch { failed++; }
      await new Promise(r => setTimeout(r, 60));
    }
    await bot.sendMessage(chatId, `✅ Done!\n✓ Sent: ${sent}\n✗ Failed: ${failed}`);
    return;
  }

  if (lower.includes('welcome')) {
    WELCOME_BANNER = fileId;
    return bot.sendMessage(chatId, `✅ Welcome banner updated!\nBANNER_ID=${fileId}`);
  }

  process.env.BANNER_URL = fileId;
  await bot.sendMessage(chatId, `✅ Main menu banner updated!\nBANNER_ID=${fileId}`);
  const user = await getUser(chatId);
  if (user) await sendMainMenu(chatId, user.username, user.balance, false);
});

// ── Errors ────────────────────────────────────────────────────
bot.on('polling_error', e => console.error('Polling error:', e.message));
process.on('uncaughtException',  e => console.error('Uncaught:', e));
process.on('unhandledRejection', e => console.error('Unhandled:', e));

// ── Export payAgentCommission for bingo server ────────────────
module.exports = { payAgentCommission };
