require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// ── Config ────────────────────────────────────────────────────
const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const HOME_URL     = process.env.HOME_URL    || 'https://homepage-one-beta-16.vercel.app';
const DEPOSIT_URL  = process.env.DEPOSIT_URL || 'https://telebirr-production.up.railway.app';
const LUDO_URL     = process.env.LUDO_URL    || 'https://ludo-1-fdxp.onrender.com';
const BINGO_URL    = process.env.BINGO_URL   || 'https://bingo-game-49f1.onrender.com';
const GAME_URL     = process.env.GAME_URL    || 'https://crazy-c1ol.onrender.com/lobby.html';
const JWT_SECRET   = process.env.JWT_SECRET;
const WALLET_URL   = process.env.WALLET_API_URL || 'https://wallet-api-rdxt.onrender.com';
const ADMIN_IDS    = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const SUPPORT_URL  = 'https://t.me/etgamessupport';
const REFERRAL_BONUS = 10;
const AGENT_COMMISSION_RATE = 0.20; // 20% of house cut

// Deposit bonus configuration (kept in sync with server)
const BONUS_ON_EVERY_DEPOSIT = (process.env.BONUS_ON_EVERY_DEPOSIT || '').toLowerCase() === 'true';
const DEPOSIT_BONUS_PERCENT = parseFloat(process.env.DEPOSIT_BONUS_PERCENT || '10');

// URL of the admin-dashboard service, which now also hosts the agent portal
const AGENT_DASHBOARD_URL = process.env.AGENT_DASHBOARD_URL || 'https://adminpage-gsgg.onrender.com';
// Secret used to sign agent login tokens — must match AGENT_TOKEN_SECRET on
// the admin-dashboard service. Falls back to JWT_SECRET if not set.
const AGENT_TOKEN_SECRET  = process.env.AGENT_TOKEN_SECRET || JWT_SECRET;

if (!BOT_TOKEN)  throw new Error('Missing TELEGRAM_BOT_TOKEN');
if (!JWT_SECRET) throw new Error('Missing JWT_SECRET');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 ET Games bot running...');

// ── Language Support ──────────────────────────────────────────
// Available languages
const LANGUAGES = {
  am: 'አማርኛ',
  en: 'English'
};

// Translation strings
const TRANSLATIONS = {
  am: {
    // Menu buttons
    play_games: '🎮 ጨዋታዎች',
    deposit: '💳 ገንዘብ አስገባ',
    withdraw: '🏧 ገንዘብ አውጣ',
    balance: '💰 ሒሳብ',
    refer: '🔗 ሌሎችን ጋብዝ',
    agent: '🏢 ወኪል',
    support: '🆘 ድጋፍ',
    language: '🌍 ቋንቋ',

    // Welcome messages
    welcome: '🎮 እንኳን ወደ ET Games በደህና መጡ!',
    welcome_sub: 'የኢትዮጵያ ቁጥር 1 የቴሌግራም ጨዋታ መድረክ 🎲 ሉዶ • 🃏 ክሬዚ ካርድ • 🎱 ቢንጎ በየቀኑ እውነተኛ ETB ያሸንፉ!',
    register_btn: '🚀 ይመዝገቡ እና ይጫወቱ',
    
    // Registration
    welcome_new: '🎉 እንኳን ወደ ET Games በደህና መጡ!',
    share_phone: '📱 የስልክ ቁጥርዎን ያጋሩ',
    phone_registered: '✅ የስልክ ቁጥር ተቀብለናል!',
    registration_complete: '✅ ምዝገባ ተጠናቋል!',
    welcome_back: '👋 እንኳን ደህና መጡ ተመልሰው',
    
    // Balance
    your_balance: '💰 ሒሳብዎ፡',
    balance_etb: 'ETB',
    
    // Deposit
    deposit_title: '💳 በቴሌብር ገንዘብ ማስገባት',
    deposit_step1: '📋 ደረጃ 1፡ ቴሌብር ይክፈቱ እና ገንዘብ ይላኩ ለ፡',
    deposit_step2: '📋 ደረጃ 2፡ መላክ ከጨረሱ በኋላ የክፍያ ማረጋገጫዎን ይቅዱ',
    deposit_step3: '📋 ደረጃ 3፡ ከታች ይለጥፉ',
    deposit_prompt: 'የቴሌብር መልዕክትዎን፣ አገናኝዎን ወይም የግብይት መለያዎን ይላኩ፡',
    deposit_verifying: '🔄 ክፍያዎን እያረጋገጥን ነው... እባክዎ ይጠብቁ።',
    deposit_success: '✅ ገንዘብ በተሳካ ሁኔታ ገብቷል!',
    deposit_amount: '💰 መጠን፡',
    deposit_balance: '📊 አዲስ ሒሳብ፡',
    deposit_ref: '🔖 ማጣቀሻ፡',
    deposit_payer: '👤 ላኪ፡',
    deposit_failed: '❌ ገንዘብ ማስገባት አልተሳካም',
    deposit_cancel: '❌ ገንዘብ ማስገባት ተሰርዟል',
    try_again: '🔄 እንደገና ይሞክሩ',
    
    // Withdraw
    withdraw_title: '🏧 በቴሌብር ገንዘብ ማውጣት',
    withdraw_min: 'አነስተኛ መውጫ፡',
    withdraw_process: 'በ24 ሰዓታት ውስጥ ይሰራል',
    enter_phone: 'የቴሌብር ስልክ ቁጥርዎን ያስገቡ፡',
    enter_amount: 'መጠን በETB ያስገቡ (አነስተኛ 50)፡',
    withdraw_processing: '⏳ የመውጫ ጥያቄዎን እያስኬድን ነው...',
    withdraw_success: '✅ ገንዘብ ማውጣት ተጠይቋል!',
    withdraw_to: '📱 ወደ፡',
    withdraw_time: '⏳ በ24 ሰዓታት ውስጥ ይሰራል።',
    withdraw_failed: '❌ ገንዘብ ማውጣት አልተሳካም',
    withdraw_cancel: '❌ ገንዘብ ማውጣት ተሰርዟል',
    invalid_phone: '❌ የስልክ ቁጥር የተሳሳተ ነው። ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ (ለምሳሌ 0911223344)፡',
    invalid_amount: '❌ አነስተኛ መውጫ 50 ETB ነው። ትክክለኛ መጠን ያስገቡ፡',
    
    // Referral
    refer_title: '🔗 ሌሎችን ጋብዝ እና ገቢ አግኝ',
    refer_bonus: 'ለእያንዳንዱ ጋብዞት እና ገንዘብ ላስገባ ጓደኛ ',
    refer_rewarded: '✅ የተሸለሙ፡',
    refer_pending: '⏳ በመጠባበቅ ላይ፡',
    refer_earned: '💰 የተገኘ አጠቃላይ፡',
    refer_your_link: '🔗 አገናኝዎ፡',
    refer_share: '📤 አገናኝ ያጋሩ',
    
    // Agent
    agent_title: '🏢 ወኪል መሣሪያ ሰሌዳ',
    agent_not_agent: 'በአሁኑ ጊዜ ወኪል አይደሉም።',
    agent_contact: 'ወኪል ለመሆን እና የተጠቃሚዎች ገንዘብ ሲያስገቡ ኮሚሽን ለማግኘት አስተዳዳሪውን ያግኙ።',
    agent_dashboard: '🏢 ወኪል መሣሪያ ሰሌዳ',
    agent_dashboard_open: '📊 ወኪል መሣሪያ ሰሌዳ ይክፈቱ',
    agent_share_link: '📤 የወኪል አገናኝ ያጋሩ',
    agent_link: '🔗 የወኪል አገናኝዎ፡',
    agent_commission: 'ይህን አገናኝ ያጋሩ — ተጠቃሚዎች በእርስዎ አገናኝ ሲመዘገቡ እና የመጀመሪያ ገንዘባቸውን ሲያስገቡ ኮሚሽን ያገኛሉ!',
    
    // Transactions
    transactions: '📊 የግብይት ታሪክ',
    no_transactions: '📊 እስካሁን ምንም ግብይቶች የሉም።',
    last_transactions: 'የመጨረሻ 10 ግብይቶች',
    
    // Support
    support_title: '🆘 የET Games ድጋፍ',
    support_contact: 'አግኙን፡ @etgamessupport',
    contact_support: '💬 ድጋፍ ያግኙ',
    
    // Help
    help_title: '🎮 የET Games ትዕዛዞች',
    help_start: '/start — ዋና ምናሌ',
    help_deposit: '/deposit — በቴሌብር ገንዘብ ያስገቡ',
    help_withdraw: '/withdraw — ገንዘብ ያውጡ',
    help_balance: '/balance — ሒሳብ ይፈትሹ',
    help_transactions: '/transactions — የመጨረሻ 10 ግብይቶች',
    help_refer: '/refer — ጓደኞችን ይጋብዙ እና ያግኙ',
    help_agent: '/agent — የወኪል መሣሪያ ሰሌዳ',
    help_support: '/support — ድጋፍ ያግኙ',
    help_help: '/help — ይህን መልዕክት ያሳዩ',
    
    // Common
    loading: '⏳ እየተሰራ ነው...',
    error: '❌ ስህተት ተከስቷል',
    cancel: '❌ ሰርዝ',
    back: '🔙 ተመለስ',
    home: '🏠 ዋና ምናሌ',
    confirm: '✅ አረጋግጥ',
    success: '✅ ተሳክቷል!',
    failed: '❌ አልተሳካም',
    pending: '⏳ በመጠባበቅ ላይ',
    balance_update: '📊 የተዘመነ ሒሳብ፡',
    welcome_bonus: '🎁 የእንኳን ደህና መጣችሁ ሽልማት!',
    play_now: '🎮 አሁን ይጫወቱ!',
    language_switched: '🌍 ቋንቋ ተቀይሯል፡ '
  },
  en: {
    // Menu buttons
    play_games: '🎮 Play Games',
    deposit: '💳 Deposit',
    withdraw: '🏧 Withdraw',
    balance: '💰 Balance',
    refer: '🔗 Refer & Earn',
    agent: '🏢 Agent',
    support: '🆘 Support',
    language: '🌍 Language',

    // Welcome messages
    welcome: '🎮 Welcome to ET Games!',
    welcome_sub: "Ethiopia's #1 Telegram gaming platform 🎲 Ludo • 🃏 Crazy Card • 🎱 Bingo Win real ETB every day!",
    register_btn: '🚀 Register & Play Now',
    
    // Registration
    welcome_new: '🎉 Welcome to ET Games!',
    share_phone: '📱 Share My Phone Number',
    phone_registered: '✅ Phone number received!',
    registration_complete: '✅ Registration complete!',
    welcome_back: '👋 Welcome back',
    
    // Balance
    your_balance: '💰 Your balance:',
    balance_etb: 'ETB',
    
    // Deposit
    deposit_title: '💳 Deposit via Telebirr',
    deposit_step1: '📋 Step 1: Open Telebirr and send money to:',
    deposit_step2: '📋 Step 2: After sending, copy your payment proof',
    deposit_step3: '📋 Step 3: Paste it below',
    deposit_prompt: 'Send your Telebirr message, link, or transaction ID now:',
    deposit_verifying: '🔄 Verifying your payment... Please wait.',
    deposit_success: '✅ Deposit Successful!',
    deposit_amount: '💰 Amount:',
    deposit_balance: '📊 New Balance:',
    deposit_ref: '🔖 Reference:',
    deposit_payer: '👤 Payer:',
    deposit_failed: '❌ Deposit Failed',
    deposit_cancel: '❌ Deposit cancelled.',
    try_again: '🔄 Try Again',
    
    // Withdraw
    withdraw_title: '🏧 Withdraw via Telebirr',
    withdraw_min: 'Minimum withdrawal:',
    withdraw_process: 'Processed within 24 hours',
    enter_phone: 'Enter your Telebirr phone number:',
    enter_amount: 'Enter the amount in ETB (minimum 50):',
    withdraw_processing: '⏳ Processing your withdrawal request...',
    withdraw_success: '✅ Withdrawal Requested!',
    withdraw_to: '📱 To:',
    withdraw_time: '⏳ Will be processed within 24 hours.',
    withdraw_failed: '❌ Withdrawal Failed',
    withdraw_cancel: '❌ Withdrawal cancelled.',
    invalid_phone: '❌ Invalid phone number. Enter a valid Ethiopian phone number (e.g. 0911223344):',
    invalid_amount: '❌ Minimum withdrawal is 50 ETB. Enter a valid amount:',
    
    // Referral
    refer_title: '🔗 Refer & Earn',
    refer_bonus: 'Invite friends and earn ',
    refer_rewarded: '✅ Rewarded:',
    refer_pending: '⏳ Pending:',
    refer_earned: '💰 Total earned:',
    refer_your_link: '🔗 Your link:',
    refer_share: '📤 Share Link',
    
    // Agent
    agent_title: '🏢 Agent Dashboard',
    agent_not_agent: 'You are not currently an agent.',
    agent_contact: 'To become an agent and earn commission when your referred users deposit, contact the admin.',
    agent_dashboard: '🏢 Agent Dashboard',
    agent_dashboard_open: '📊 Open Agent Dashboard',
    agent_share_link: '📤 Share Agent Link',
    agent_link: '🔗 Your Agent Link:',
    agent_commission: 'Share this link — when users register through it and make their first deposit, you earn commission!',
    
    // Transactions
    transactions: '📊 Transaction History',
    no_transactions: '📊 No transactions yet.',
    last_transactions: 'Last 10 Transactions',
    
    // Support
    support_title: '🆘 ET Games Support',
    support_contact: 'Contact us: @etgamessupport',
    contact_support: '💬 Contact Support',
    
    // Help
    help_title: '🎮 ET Games Commands',
    help_start: '/start — Main menu',
    help_deposit: '/deposit — Deposit via Telebirr',
    help_withdraw: '/withdraw — Withdraw funds',
    help_balance: '/balance — Check balance',
    help_transactions: '/transactions — Last 10 transactions',
    help_refer: '/refer — Refer friends & earn',
    help_agent: '/agent — Agent dashboard',
    help_support: '/support — Contact support',
    help_help: '/help — Show this message',
    
    // Common
    loading: '⏳ Loading...',
    error: '❌ Error occurred',
    cancel: '❌ Cancel',
    back: '🔙 Back',
    home: '🏠 Home',
    confirm: '✅ Confirm',
    success: '✅ Success!',
    failed: '❌ Failed',
    pending: '⏳ Pending',
    balance_update: '📊 Updated balance:',
    welcome_bonus: '🎁 Welcome bonus!',
    play_now: '🎮 Play Now!',
    language_switched: '🌍 Language switched to: '
  }
};

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

// Short-lived token (1 hour) that proves "I am this agent" to the agent
// portal on the admin-dashboard service. Re-issued fresh every time the
// agent taps the dashboard button/command, so there's no long-lived secret
// floating around in chat history.
function generateAgentToken(chatId) {
  return jwt.sign({ chatId: String(chatId), role: 'agent' }, AGENT_TOKEN_SECRET, { expiresIn: '1h' });
}

function buildAgentDashboardUrl(chatId) {
  const token = generateAgentToken(chatId);
  return `${AGENT_DASHBOARD_URL}/agent.html?token=${token}`;
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

async function getUserLanguage(chatId) {
  try {
    const { data } = await supabase
      .from('users')
      .select('language')
      .eq('chat_id', String(chatId))
      .single();
    return data?.language || 'am'; // Default to Amharic
  } catch {
    return 'am';
  }
}

async function setUserLanguage(chatId, language) {
  await supabase
    .from('users')
    .update({ language })
    .eq('chat_id', String(chatId));
}

// Translation helper
function t(key, lang) {
  const translations = TRANSLATIONS[lang] || TRANSLATIONS.am;
  return translations[key] || key;
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

async function creditUser(chatId, username, amount, game, roundId, target = 'deposit') {
  const adminToken = generateAdminToken();
  const txId = `${roundId}_${Date.now()}`;
  const res = await fetch(`${WALLET_URL}/api/credit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: String(chatId), username,
      transaction_type: 'credit', amount,
      game, round_id: roundId, transaction_id: txId,
      target, // 'deposit' (withdrawable, usable anywhere) or 'bonus' (Bingo-only)
    })
  });
  return res.json();
}

// Reads the admin-configurable toggle deciding whether agent commission
// and referral bonuses land in bonus_balance (Bingo-only, default) or
// deposit_balance (withdrawable cash, old behavior). Cached briefly.
let _walletSettingsCache = null;
let _walletSettingsCacheAt = 0;
async function shouldAgentReferralGoToBonus() {
  const now = Date.now();
  if (_walletSettingsCache && (now - _walletSettingsCacheAt) < 15000) return _walletSettingsCache;
  try {
    const { data } = await supabase.from('wallet_settings').select('agent_referral_to_bonus').eq('id', 1).single();
    _walletSettingsCache = data?.agent_referral_to_bonus !== false; // default true if missing/unset
  } catch {
    _walletSettingsCache = true; // safe default
  }
  _walletSettingsCacheAt = now;
  return _walletSettingsCache;
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

// Pay agent a percentage of a user's deposit
// Called from the deposit server after a successful deposit
async function payAgentDepositCommission(userId, depositAmount, reference) {
  try {
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

    const rate = agent.deposit_commission_rate != null ? agent.deposit_commission_rate : 0.05;
    const commission = Math.floor(depositAmount * rate);
    if (commission <= 0) return;

    const target = (await shouldAgentReferralGoToBonus()) ? 'bonus' : 'deposit';
    await creditUser(agent.chat_id, agent.username, commission, 'agent_deposit_commission', `AGENT_DEP_${reference}`, target);

    await supabase.from('agent_deposit_commissions').insert({
      agent_id: agent.chat_id,
      user_id: String(userId),
      deposit_amount: depositAmount,
      commission,
      reference,
      created_at: new Date().toISOString()
    });

    await supabase.from('agents')
      .update({ total_deposit_commission: (agent.total_deposit_commission || 0) + commission })
      .eq('chat_id', agent.chat_id);

    console.log(`[AGENT] ${agent.chat_id} earned ${commission} ETB deposit commission (${(rate*100).toFixed(0)}% of ${depositAmount} ETB)`);

    const lang = await getUserLanguage(agent.chat_id);
    await bot.sendMessage(agent.chat_id,
      `💳 <b>${t('agent_deposit_commission', lang)}</b>\n\n` +
      `+${commission} ETB (${(rate*100).toFixed(0)}%) ${t('from_deposit', lang)}\n` +
      `${t('deposit_amount', lang)} ${depositAmount} ETB`,
      { parse_mode: 'HTML' }
    ).catch(() => {});

  } catch (err) {
    console.error('[AGENT] Deposit commission error:', err.message);
  }
}

// Pay agent commission when a bingo game ends
// DISABLED — bingo bet commission turned off, agents now only earn from deposits
async function payAgentCommission(userId, gameId, houseCut) {
  return; // no-op — bingo commission disabled
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

  const target = (await shouldAgentReferralGoToBonus()) ? 'bonus' : 'deposit';
  await creditUser(referrer.chat_id, referrer.username, REFERRAL_BONUS, 'referral', `REFERRAL_${referral.id}`, target);

  await supabase.from('referrals').update({
    status: 'rewarded', rewarded_at: new Date().toISOString()
  }).eq('id', referral.id);

  const lang = await getUserLanguage(referrer.chat_id);
  await bot.sendMessage(referrer.chat_id,
    `🎉 ${t('refer_bonus_received', lang)}\n\n💰 +${REFERRAL_BONUS} ETB ${t('added_to_balance', lang)}\n${t('friend_deposited', lang)}`
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
    chat_id: id, username, phone_number: phoneNumber, balance: 0, language: 'am'
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

// Persistent bottom keyboard — dynamically built based on language
async function getMainKeyboard(chatId) {
  const lang = await getUserLanguage(chatId);
  return {
    keyboard: [
      [{ text: t('play_games', lang) }, { text: t('deposit', lang) }],
      [{ text: t('withdraw', lang)  }, { text: t('balance', lang)  }],
      [{ text: t('refer', lang) }, { text: t('agent', lang)  }],
      [{ text: t('support', lang) }, { text: t('language', lang) }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

async function sendMainMenu(chatId, username, balance, isNew) {
  const lang = await getUserLanguage(chatId);
  const homeUrl = buildUrl(HOME_URL, chatId, username);
  const agentUser = await getAgent(chatId);

  const caption = isNew
    ? `✅ ${t('registration_complete', lang)}\n\n👤 ${username}\n💰 ${t('your_balance', lang)} ${balance} ETB\n\n${t('welcome_sub', lang)}`
    : `👋 ${t('welcome_back', lang)} ${username}!\n\n💰 ${t('your_balance', lang)} ${balance} ETB\n\n🎲 ${t('ludo', lang)} · 🃏 ${t('crazy', lang)} · 🎱 ${t('bingo', lang)}`;

  const keyboard = {
    inline_keyboard: [
      [{ text: t('play_games', lang), web_app: { url: homeUrl } }],
      [
        { text: t('deposit', lang),       callback_data: 'deposit' },
        { text: t('withdraw', lang),      callback_data: 'withdraw' },
      ],
      [
        { text: t('transactions', lang),  callback_data: 'transactions' },
        { text: t('balance', lang),       callback_data: 'balance' },
      ],
      [
        { text: t('refer', lang),  callback_data: 'refer' },
        { text: t('support', lang),       url: SUPPORT_URL },
      ],
      [
        { text: t('language', lang),      callback_data: 'language' },
      ],
      ...(agentUser ? [[{ text: t('agent_dashboard', lang), web_app: { url: buildAgentDashboardUrl(chatId) } }]] : []),
    ]
  };

  // First send persistent keyboard so it appears at bottom
  await bot.sendMessage(chatId, '🎮', { reply_markup: await getMainKeyboard(chatId) }).catch(() => {});

  if (process.env.BANNER_URL) {
    try {
      await bot.sendPhoto(chatId, process.env.BANNER_URL, { caption, reply_markup: keyboard });
      return;
    } catch(e) { console.error('Photo send failed:', e.message); }
  }
  await bot.sendMessage(chatId, caption, { reply_markup: keyboard });
}

// ── Language Switcher ─────────────────────────────────────────
async function showLanguageMenu(chatId) {
  const lang = await getUserLanguage(chatId);
  const keyboard = {
    inline_keyboard: [
      [
        { text: `🇪🇹 ${LANGUAGES.am}${lang === 'am' ? ' ✅' : ''}`, callback_data: 'lang_am' },
        { text: `🇬🇧 ${LANGUAGES.en}${lang === 'en' ? ' ✅' : ''}`, callback_data: 'lang_en' },
      ],
      [{ text: t('back', lang), callback_data: 'back_to_main' }]
    ]
  };
  await bot.sendMessage(chatId, `🌍 ${t('select_language', lang)}`, { reply_markup: keyboard });
}

// ── Deposit flow ──────────────────────────────────────────────
const TELEBIRR_PHONE   = '0997515809';
const TELEBIRR_NAME    = 'Biruuke Nigida';

async function startDeposit(chatId, username) {
  const lang = await getUserLanguage(chatId);
  pendingDeposit.set(String(chatId), true);
  const percent = isNaN(DEPOSIT_BONUS_PERCENT) ? 10 : DEPOSIT_BONUS_PERCENT;
  const bonusNote = BONUS_ON_EVERY_DEPOSIT
    ? `\n🎁 Bonus: <b>${percent}% of your deposit will be awarded as bonus</b>`
    : `\n🎁 Note: First deposit may receive a bonus (configurable)`;

  await bot.sendMessage(chatId,
    `${t('deposit_title', lang)}\n\n` +
    `${t('deposit_step1', lang)}\n` +
    `📱 <code>${TELEBIRR_PHONE}</code>  👤 <b>${TELEBIRR_NAME}</b>\n\n` +
    `${t('deposit_step2', lang)}\n` +
    `(Full SMS, receipt link, or just the transaction ID)\n\n` +
    `${t('deposit_step3', lang)}\n\n` +
    `<i>${t('deposit_prompt', lang)}</i>` + bonusNote,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: t('cancel', lang), callback_data: 'cancel_deposit' }]] }
    }
  );
}

async function processDeposit(chatId, username, input) {
  const lang = await getUserLanguage(chatId);
  pendingDeposit.delete(String(chatId));
  const token = generateToken(chatId, username);

  const processingMsg = await bot.sendMessage(chatId,
    `${t('deposit_verifying', lang)}`,
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
        `${t('deposit_success', lang)}\n\n` +
        `${t('deposit_amount', lang)} <b>${data.transaction?.amount?.toLocaleString() || '?'} ETB</b>${bonusLine}\n` +
        `${t('balance_update', lang)} <b>${parseFloat(data.new_balance || 0).toLocaleString()} ETB</b>\n` +
        `${t('deposit_ref', lang)} <code>${data.reference}</code>\n` +
        `${t('deposit_payer', lang)} ${data.transaction?.payer || 'N/A'}\n\n` +
        `${t('balance_ready', lang)} 🎮`,
        { parse_mode: 'HTML' }
      );
    } else {
      await bot.sendMessage(chatId,
        `${t('deposit_failed', lang)}\n\n${data.error || t('unknown_error', lang)}\n\n` +
        `${t('try_again_or_support', lang)}`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[
            { text: t('try_again', lang), callback_data: 'deposit' },
            { text: t('support', lang), url: SUPPORT_URL }
          ]]}
        }
      );
    }
  } catch (err) {
    await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
    await bot.sendMessage(chatId,
      `❌ <b>${t('verification_error', lang)}</b>\n\n${t('manual_review', lang)}\n\n${t('contact_support_if_needed', lang)}`,
      { parse_mode: 'HTML' }
    );
  }
}

// ── Withdraw flow ─────────────────────────────────────────────
async function startWithdraw(chatId) {
  const lang = await getUserLanguage(chatId);
  pendingWithdraw.set(String(chatId), { step: 'phone' });
  await bot.sendMessage(chatId,
    `${t('withdraw_title', lang)}\n\n` +
    `${t('withdraw_min', lang)} <b>50 ETB</b>\n` +
    `${t('withdraw_process', lang)}\n\n` +
    `${t('enter_phone', lang)}`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: t('cancel', lang), callback_data: 'cancel_withdraw' }]] }
    }
  );
}

async function processWithdraw(chatId, username, phone, amount) {
  const lang = await getUserLanguage(chatId);
  pendingWithdraw.delete(String(chatId));
  const token = generateToken(chatId, username);

  const processingMsg = await bot.sendMessage(chatId, `${t('withdraw_processing', lang)}`);

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
        `${t('withdraw_success', lang)}\n\n` +
        `${t('deposit_amount', lang)} <b>${amount} ETB</b>\n` +
        `${t('withdraw_to', lang)} <b>${phone}</b>\n\n` +
        `${t('withdraw_time', lang)}`,
        { parse_mode: 'HTML' }
      );
    } else {
      await bot.sendMessage(chatId,
        `${t('withdraw_failed', lang)}\n\n${data.error || data.message || t('unknown_error', lang)}`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (err) {
    await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
    await bot.sendMessage(chatId, `❌ ${t('error', lang)}: ${err.message}`);
  }
}

// ── Agent dashboard ───────────────────────────────────────────
async function sendAgentDashboard(chatId) {
  const lang = await getUserLanguage(chatId);
  const agent = await getAgent(chatId);
  if (!agent) {
    return bot.sendMessage(chatId,
      `${t('agent_title', lang)}\n\n` +
      `${t('agent_not_agent', lang)}\n\n` +
      `${t('agent_contact', lang)}`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: t('contact_support', lang), url: SUPPORT_URL }]] }
      }
    );
  }

  const dashboardUrl = buildAgentDashboardUrl(chatId);

  // Generate agent referral link
  const botInfo = await bot.getMe();
  const agentLink = `https://t.me/${botInfo.username}?start=AGENT_${chatId}`;

  await bot.sendMessage(chatId,
    `${t('agent_dashboard', lang)}\n\n` +
    `${t('agent_dashboard_desc', lang)}\n\n` +
    `${t('agent_link', lang)}\n<code>${agentLink}</code>\n\n` +
    `${t('agent_commission', lang)}`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: t('agent_dashboard_open', lang), web_app: { url: dashboardUrl } }],
          [{ text: t('agent_share_link', lang), url: `https://t.me/share/url?url=${encodeURIComponent(agentLink)}&text=${encodeURIComponent('Join ET Games! 🎮 Play Bingo, Ludo & win ETB!')}` }]
        ]
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
    const lang = await getUserLanguage(chatId);
    await bot.sendMessage(chatId,
      `🎮 <b>${t('welcome', lang)}</b>\n\n` +
      `${t('welcome_sub', lang)}`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t('register_btn', lang), callback_data: 'start_register' }],
            [{ text: t('support', lang), url: SUPPORT_URL }],
            [{ text: t('language', lang), callback_data: 'language' }],
          ]
        }
      }
    );

    const welcomeText = agentId
      ? `👋 ${t('welcome_agent_invite', lang)}\n\n${t('share_phone_agent', lang)}`
      : referrerId
        ? `👋 ${t('welcome_referral', lang)}\n\n${t('share_phone_referral', lang)} ${REFERRAL_BONUS} ETB ${t('when_deposit', lang)}`
        : `👋 ${t('welcome_new', lang)}\n\n${t('share_phone_register', lang)}`;

    await bot.sendMessage(chatId, welcomeText, {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        keyboard: [[{ text: '📱 ' + t('share_phone', lang), request_contact: true }]],
        resize_keyboard: true, one_time_keyboard: true
      }
    });

    if (referrerId) pendingReferrals.set(String(chatId), referrerId);
    if (agentId)    pendingAgentRefs.set(String(chatId), agentId);

  } catch (e) {
    console.error('/start error:', e);
    const lang = await getUserLanguage(chatId);
    await bot.sendMessage(chatId, `❌ ${t('error', lang)}. ${t('try_again_start', lang)}`);
  }
});

// ── /deposit ──────────────────────────────────────────────────
bot.onText(/\/deposit/, async (msg) => {
  const chatId = msg.chat.id;
  const user   = await getUser(chatId);
  if (!user) {
    const lang = await getUserLanguage(chatId);
    return bot.sendMessage(chatId, `❌ ${t('please_start', lang)}`);
  }
  await startDeposit(chatId, user.username);
});

// ── /withdraw ─────────────────────────────────────────────────
bot.onText(/\/withdraw/, async (msg) => {
  const chatId = msg.chat.id;
  const user   = await getUser(chatId);
  if (!user) {
    const lang = await getUserLanguage(chatId);
    return bot.sendMessage(chatId, `❌ ${t('please_start', lang)}`);
  }
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
    const searchVal = input.replace('@', '').trim();

    // Try exact chat_id first (if numeric)
    let users = null;
    if (/^\d+$/.test(searchVal)) {
      const { data } = await supabase.from('users').select('*')
        .eq('chat_id', searchVal).limit(1);
      users = data;
    }

    // Try username match
    if (!users?.length) {
      const { data } = await supabase.from('users').select('*')
        .ilike('username', searchVal).limit(1);
      users = data;
    }

    // Try partial username match
    if (!users?.length) {
      const { data } = await supabase.from('users').select('*')
        .ilike('username', `%${searchVal}%`).limit(1);
      users = data;
    }

    if (!users?.length) return bot.sendMessage(chatId,
      `❌ User not found: <code>${input}</code>

Try using their chat ID instead.
Use /finduser ${searchVal} to search.`,
      { parse_mode: 'HTML' }
    );

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
    const lang = await getUserLanguage(target.chat_id);
    await bot.sendMessage(target.chat_id,
      `🎉 <b>${t('agent_promoted', lang)}</b>\n\n` +
      `${t('agent_earn', lang)} <b>${(AGENT_COMMISSION_RATE * 100).toFixed(0)}%</b> ${t('agent_earn_desc', lang)}\n\n` +
      `${t('agent_use_dashboard', lang)}`,
      { parse_mode: 'HTML' }
    ).catch(() => {});

  } catch (e) {
    bot.sendMessage(chatId, `❌ Error: ${e.message}`);
  }
});

// ── /setdepositrate (admin) — set per-agent deposit commission % ──────
bot.onText(/\/setdepositrate(?:\s+(.+))?/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (!ADMIN_IDS.includes(chatId)) return bot.sendMessage(chatId, '❌ Admin only.');

  const input = match?.[1]?.trim();
  if (!input) return bot.sendMessage(chatId,
    '❌ Usage: /setdepositrate @username 5\n\nSets the agent\'s deposit commission to 5%.'
  );

  const parts = input.split(/\s+/);
  if (parts.length < 2) return bot.sendMessage(chatId, '❌ Usage: /setdepositrate @username 5');

  const searchVal = parts[0].replace('@', '').trim();
  const percent   = parseFloat(parts[1]);

  if (isNaN(percent) || percent < 0 || percent > 100) {
    return bot.sendMessage(chatId, '❌ Percent must be a number between 0 and 100.');
  }

  try {
    let agentsData = null;
    if (/^\d+$/.test(searchVal)) {
      const { data } = await supabase.from('agents').select('*').eq('chat_id', searchVal).limit(1);
      agentsData = data;
    }
    if (!agentsData?.length) {
      const { data } = await supabase.from('agents').select('*').ilike('username', `%${searchVal}%`).limit(1);
      agentsData = data;
    }

    if (!agentsData?.length) return bot.sendMessage(chatId, `❌ Agent not found: ${input}`);

    const agent = agentsData[0];
    const rate  = percent / 100;

    await supabase.from('agents').update({ deposit_commission_rate: rate }).eq('chat_id', agent.chat_id);

    await bot.sendMessage(chatId,
      `✅ <b>${agent.username}</b>'s deposit commission set to <b>${percent}%</b>.`,
      { parse_mode: 'HTML' }
    );

    const lang = await getUserLanguage(agent.chat_id);
    await bot.sendMessage(agent.chat_id,
      `📊 <b>${t('deposit_commission_updated', lang)}</b>\n\n${t('deposit_commission_rate', lang)} <b>${percent}%</b> ${t('of_deposits', lang)}`,
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

  const searchVal = input.replace('@', '').trim();
  let agentsData = null;
  if (/^\d+$/.test(searchVal)) {
    const { data } = await supabase.from('agents').select('*').eq('chat_id', searchVal).limit(1);
    agentsData = data;
  }
  if (!agentsData?.length) {
    const { data } = await supabase.from('agents').select('*').ilike('username', `%${searchVal}%`).limit(1);
    agentsData = data;
  }
  const agents = agentsData;

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
    `${i+1}. <b>${a.username}</b> — ${a.total_deposit_commission || 0} ETB earned (${((a.deposit_commission_rate ?? 0.05) * 100).toFixed(0)}% deposit rate)`
  ).join('\n');

  bot.sendMessage(chatId, `🏢 <b>Active Agents (${agents.length})</b>\n\n${lines}`, { parse_mode: 'HTML' });
});

// ── /menu ─────────────────────────────────────────────────────
bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  const user   = await getUser(chatId);
  if (!user) {
    const lang = await getUserLanguage(chatId);
    return bot.sendMessage(chatId, `❌ ${t('please_start', lang)}`);
  }
  const token   = generateToken(chatId, user.username);
  const balance = await fetchBalance(chatId, token) ?? user.balance;
  await sendMainMenu(chatId, user.username, balance, false);
});

// ── /balance ──────────────────────────────────────────────────
bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id;
  const user   = await getUser(chatId);
  if (!user) {
    const lang = await getUserLanguage(chatId);
    return bot.sendMessage(chatId, `❌ ${t('please_start', lang)}`);
  }
  const token   = generateToken(chatId, user.username);
  const balance = await fetchBalance(chatId, token) ?? user.balance;
  const lang = await getUserLanguage(chatId);
  await bot.sendMessage(chatId, `${t('your_balance', lang)} ${balance} ETB`);
});

// ── /refer ────────────────────────────────────────────────────
bot.onText(/\/refer/, async (msg) => {
  const chatId = msg.chat.id;
  const user   = await getUser(chatId);
  if (!user) {
    const lang = await getUserLanguage(chatId);
    return bot.sendMessage(chatId, `❌ ${t('please_start', lang)}`);
  }
  await sendReferInfo(chatId, user);
});

async function sendReferInfo(chatId, user) {
  const lang = await getUserLanguage(chatId);
  const botInfo  = await bot.getMe();
  const refLink  = `https://t.me/${botInfo.username}?start=REF_${chatId}`;
  const stats    = await getReferralStats(chatId);
  const rewarded = stats.filter(r => r.status === 'rewarded').length;
  const pending  = stats.filter(r => r.status === 'pending').length;
  const earned   = rewarded * REFERRAL_BONUS;

  await bot.sendMessage(chatId,
    `${t('refer_title', lang)}\n\n` +
    `${t('refer_bonus_desc', lang)} *${REFERRAL_BONUS} ETB* ${t('refer_bonus_desc2', lang)}\n\n` +
    `✅ ${t('refer_rewarded', lang)} ${rewarded}\n` +
    `⏳ ${t('refer_pending', lang)} ${pending}\n` +
    `💰 ${t('refer_earned', lang)} ${earned} ETB\n\n` +
    `${t('refer_your_link', lang)}\n\`${refLink}\``,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: [[
        { text: t('refer_share', lang), url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('Join ET Games and win ETB! 🎮')}` }
      ]]}
    }
  );
}

// ── /transactions ─────────────────────────────────────────────
bot.onText(/\/transactions/, async (msg) => {
  const chatId = msg.chat.id;
  const user   = await getUser(chatId);
  if (!user) {
    const lang = await getUserLanguage(chatId);
    return bot.sendMessage(chatId, `❌ ${t('please_start', lang)}`);
  }
  await sendTransactionsMsg(chatId, user);
});

async function sendTransactionsMsg(chatId, user) {
  const lang = await getUserLanguage(chatId);
  const txs = await fetchTransactions(chatId);
  if (!txs.length) return bot.sendMessage(chatId, `${t('no_transactions', lang)}`);
  const token   = generateToken(chatId, user.username);
  const balance = await fetchBalance(chatId, token) ?? user.balance;
  const lines   = txs.map(tx => {
    const type   = tx.transaction_type || 'tx';
    const amount = tx.amount || 0;
    const sign   = (type === 'credit' || type === 'deposit') ? '+' : '-';
    const emoji  = type === 'deposit' ? '🔵' : type === 'credit' ? '🟢' : '🔴';
    return `${emoji} ${sign}${amount} ETB  •  ${type}  •  ${timeAgo(tx.created_at)}`;
  });
  await bot.sendMessage(chatId, `${t('transactions', lang)}\n💰 ${t('your_balance', lang)} ${balance} ETB\n\n${lines.join('\n')}`);
}

// ── /support ──────────────────────────────────────────────────
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLanguage(chatId);
  await bot.sendMessage(chatId,
    `${t('support_title', lang)}\n\n${t('support_contact', lang)}`,
    { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: [[{ text: t('contact_support', lang), url: SUPPORT_URL }]] } }
  );
});

// ── /help ─────────────────────────────────────────────────────
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLanguage(chatId);
  await bot.sendMessage(chatId,
    `${t('help_title', lang)}\n\n` +
    `${t('help_start', lang)}\n` +
    `${t('help_deposit', lang)}\n` +
    `${t('help_withdraw', lang)}\n` +
    `${t('help_balance', lang)}\n` +
    `${t('help_transactions', lang)}\n` +
    `${t('help_refer', lang)}\n` +
    `${t('help_agent', lang)}\n` +
    `${t('help_support', lang)}\n` +
    `${t('help_help', lang)}`,
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
    try { 
      const lang = await getUserLanguage(user.chat_id);
      await bot.sendMessage(user.chat_id, `📢 <b>${t('announcement', lang)}</b>\n\n${text}`, { parse_mode: 'HTML' }); 
      sent++; 
    }
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
      safe(() => supabase.from('agents').select('total_deposit_commission').eq('is_active', true)),
    ]);
    const allTxs   = txs || [];
    const deposits = allTxs.filter(t => t.transaction_type==='deposit').reduce((s,t)=>s+parseFloat(t.amount||0),0);
    const debits   = allTxs.filter(t => t.transaction_type==='debit').reduce((s,t)=>s+parseFloat(t.amount||0),0);
    const credits  = allTxs.filter(t => t.transaction_type==='credit').reduce((s,t)=>s+parseFloat(t.amount||0),0);
    const profit   = debits - credits;
    const withdrawn   = (withdrawals||[]).filter(w=>w.status==='completed').reduce((s,w)=>s+parseFloat(w.amount||0),0);
    const pendingW    = (withdrawals||[]).filter(w=>w.status==='pending').reduce((s,w)=>s+parseFloat(w.amount||0),0);
    const rewarded    = (referrals||[]).filter(r=>r.status==='rewarded').length;
    const agentsPaid  = (agentsData||[]).reduce((s,a)=>s+parseFloat(a.total_deposit_commission||0),0);
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
      `🏢 Agent Deposit Commissions: <b>${agentsPaid.toFixed(2)} ETB</b>\n\n` +
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

  // Language selection
  if (query.data === 'language') {
    return showLanguageMenu(chatId);
  }
  if (query.data === 'lang_am' || query.data === 'lang_en') {
    const newLang = query.data === 'lang_am' ? 'am' : 'en';
    await setUserLanguage(chatId, newLang);
    const lang = newLang;
    await bot.sendMessage(chatId, `${t('language_switched', lang)} ${LANGUAGES[newLang]}`);
    // Update keyboard
    if (user) {
      const token = generateToken(chatId, user.username);
      const balance = await fetchBalance(chatId, token) ?? user.balance;
      await sendMainMenu(chatId, user.username, balance, false);
    } else {
      // If no user, just update the keyboard
      await bot.sendMessage(chatId, '🎮', { reply_markup: await getMainKeyboard(chatId) });
    }
    return;
  }
  if (query.data === 'back_to_main') {
    if (user) {
      const token = generateToken(chatId, user.username);
      const balance = await fetchBalance(chatId, token) ?? user.balance;
      await sendMainMenu(chatId, user.username, balance, false);
    } else {
      await bot.sendMessage(chatId, '🎮', { reply_markup: await getMainKeyboard(chatId) });
    }
    return;
  }

  // Register button on welcome screen
  if (query.data === 'start_register') {
    const lang = await getUserLanguage(chatId);
    const welcomeText = pendingAgentRefs.has(String(chatId))
      ? `🎉 ${t('welcome_agent_invite', lang)}\n\n${t('share_phone_agent', lang)}`
      : pendingReferrals.has(String(chatId))
        ? `🎉 ${t('welcome_referral', lang)}\n\n${t('share_phone_referral', lang)} ${REFERRAL_BONUS} ETB ${t('when_deposit', lang)}`
        : `${t('share_phone_register', lang)}`;

    await bot.sendMessage(chatId, welcomeText, {
      reply_markup: {
        keyboard: [[{ text: '📱 ' + t('share_phone', lang), request_contact: true }]],
        resize_keyboard: true, one_time_keyboard: true
      }
    });
    return;
  }

  if (query.data === 'deposit') {
    if (!user) {
      const lang = await getUserLanguage(chatId);
      return bot.sendMessage(chatId, `❌ ${t('please_start', lang)}`);
    }
    return startDeposit(chatId, user.username);
  }
  if (query.data === 'cancel_deposit') {
    pendingDeposit.delete(String(chatId));
    const lang = await getUserLanguage(chatId);
    return bot.sendMessage(chatId, `${t('deposit_cancel', lang)}`);
  }
  if (query.data === 'withdraw') {
    if (!user) {
      const lang = await getUserLanguage(chatId);
      return bot.sendMessage(chatId, `❌ ${t('please_start', lang)}`);
    }
    return startWithdraw(chatId);
  }
  if (query.data === 'cancel_withdraw') {
    pendingWithdraw.delete(String(chatId));
    const lang = await getUserLanguage(chatId);
    return bot.sendMessage(chatId, `${t('withdraw_cancel', lang)}`);
  }
  if (!user) {
    const lang = await getUserLanguage(chatId);
    return bot.sendMessage(chatId, `❌ ${t('please_start', lang)}`);
  }
  if (query.data === 'balance') {
    const token   = generateToken(chatId, user.username);
    const balance = await fetchBalance(chatId, token) ?? user.balance;
    const lang = await getUserLanguage(chatId);
    return bot.sendMessage(chatId, `${t('your_balance', lang)} ${balance} ETB`);
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
  const lang = await getUserLanguage(chatId);

  // Handle persistent keyboard buttons
  if (user) {
    if (text === t('play_games', lang) || text === '🎮 ጨዋታዎች' || text === '🎮 Play Games') {
      const homeUrl = buildUrl(HOME_URL, chatId, user.username);
      return bot.sendMessage(chatId, `${t('opening_games', lang)}`, {
        reply_markup: { inline_keyboard: [[{ text: t('play_games', lang), web_app: { url: homeUrl } }]] }
      });
    }
    if (text === t('deposit', lang) || text === '💳 ገንዘብ አስገባ' || text === '💳 Deposit')     return startDeposit(chatId, user.username);
    if (text === t('withdraw', lang) || text === '🏧 ገንዘብ አውጣ' || text === '🏧 Withdraw')    return startWithdraw(chatId);
    if (text === t('support', lang) || text === '🆘 ድጋፍ' || text === '🆘 Support')     return bot.sendMessage(chatId, `${t('support_contact', lang)}`, { reply_markup: { inline_keyboard: [[{ text: t('contact_support', lang), url: SUPPORT_URL }]] } });
    if (text === t('agent', lang) || text === '🏢 ወኪል' || text === '🏢 Agent')       return sendAgentDashboard(chatId);
    if (text === t('refer', lang) || text === '🔗 ሌሎችን ጋብዝ' || text === '🔗 Refer & Earn') return sendReferInfo(chatId, user);
    if (text === t('balance', lang) || text === '💰 ሒሳብ' || text === '💰 Balance') {
      const token   = generateToken(chatId, user.username);
      const balance = await fetchBalance(chatId, token) ?? user.balance;
      return bot.sendMessage(chatId, `${t('your_balance', lang)} <b>${balance} ETB</b>`, { parse_mode: 'HTML' });
    }
    if (text === t('language', lang) || text === '🌍 ቋንቋ' || text === '🌍 Language') {
      return showLanguageMenu(chatId);
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
        return bot.sendMessage(chatId, `${t('invalid_phone', lang)}`);
      }
      pendingWithdraw.set(chatId, { step: 'amount', phone });
      return bot.sendMessage(chatId,
        `📱 ${t('withdraw_to', lang)} <b>${phone}</b>\n\n${t('enter_amount', lang)}`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: t('cancel', lang), callback_data: 'cancel_withdraw' }]] } }
      );
    }

    if (state.step === 'amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 50) {
        return bot.sendMessage(chatId, `${t('invalid_amount', lang)}`);
      }
      return processWithdraw(chatId, user.username, state.phone, amount);
    }
  }
});

// ── Contact (registration) ────────────────────────────────────
bot.on('contact', async (msg) => {
  const chatId  = msg.chat.id;
  const contact = msg.contact;
  if (contact.user_id !== chatId) {
    const lang = await getUserLanguage(chatId);
    return bot.sendMessage(chatId, `❌ ${t('share_own_phone', lang)}`);
  }

  const username   = msg.from.username || msg.from.first_name || `User${String(chatId).slice(-4)}`;
  const referrerId = pendingReferrals.get(String(chatId)) || null;
  const agentId    = pendingAgentRefs.get(String(chatId)) || null;

  try {
    const { user, isNew } = await registerUser(chatId, username, contact.phone_number, referrerId, agentId);
    pendingReferrals.delete(String(chatId));
    pendingAgentRefs.delete(String(chatId));

    const lang = await getUserLanguage(chatId);
    await bot.sendMessage(chatId, `${t('phone_registered', lang)}`, { reply_markup: { remove_keyboard: true } });

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
            transaction_id: `WELCOME_${chatId}_${Date.now()}`,
            target: 'bonus',
          })
        });
        const bonusData = await bonusRes.json();
        user.balance = bonusData.new_balance || 10;

        const welcomeMsg =
          `🎉 <b>${t('welcome_new', lang)}</b>\n\n` +
          `${t('welcome_bonus', lang)} 🎁\n\n` +
          `${t('your_balance', lang)} <b>${user.balance} ETB</b> — ${t('start_playing', lang)}`;

        const welcomeKeyboard = { inline_keyboard: [[{ text: t('play_now', lang), web_app: { url: buildUrl(HOME_URL, chatId, username) } }]] };

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
    const lang = await getUserLanguage(chatId);
    await bot.sendMessage(chatId, `❌ ${t('registration_failed', lang)} ${t('try_again_start', lang)}`);
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
      try { 
        const lang = await getUserLanguage(user.chat_id);
        await bot.sendPhoto(user.chat_id, fileId, { caption: `📢 <b>${t('announcement', lang)}</b>\n\n${text}`, parse_mode: 'HTML' }); 
        sent++; 
      }
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
module.exports = { payAgentCommission, payAgentDepositCommission };
