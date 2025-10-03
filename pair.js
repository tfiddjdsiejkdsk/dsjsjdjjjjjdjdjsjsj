const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const cheerio = require('cheerio');
const { Octokit } = require('@octokit/rest');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const DY_SCRAP = require('@dark-yasiya/scrap');
const dy_scrap = new DY_SCRAP();
const fetch = require('node-fetch')
const { sms, downloadMediaMessage } = require("./msg");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    getContentType,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    downloadContentFromMessage,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    S_WHATSAPP_NET
} = require('baileys');

const config = {
    THARUZZ_IMAGE_URL: 'https://github.com/tharusha-md777/THARUZZ-DETABASE/blob/main/media/20250909_101450.jpg?raw=true',
    THARUZZ_FOOTER: '> © 𝙿𝙾𝚆𝙴𝚁𝙳 𝙱𝚈 𝚃𝙷𝙰𝚁𝚄𝚉𝚉 𝙾𝙵𝙲',
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'false',
    AUTO_LIKE_EMOJI: ['😒', '🍬', '💚', '💗', '🎈', '🎉', '🥳', '❤️', '💕', '👨‍🔧'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/J4zeoZ9utKOK7saxbmJKd6?mode=ems_copy_t',
    ADMIN_LIST_PATH: './admin.json',
    RCD_IMAGE_PATH: 'https://github.com/tharusha-md777/THARUZZ-DETABASE/blob/main/media/20250909_101450.jpg?raw=true',
    NEWSLETTER_JID: '120363411607943828@newsletter',
    NEWSLETTER_JID_NAME: 'тнαяυѕнα-м∂ σƒƒι¢ιαℓ',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    OWNER_NUMBER: '94703802995',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb9LTRHInlqISdCfln45'
};

const octokit = new Octokit({ auth: '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' });
const owner = 'tfiddjdsiejkdsk';
const repo = 'dsjsjdjjjjjdjdjsjsj';

/*const octokit = new Octokit({ auth: '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' });
const owner = 'yasas321';
const repo = 'Mini';*/

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}
// CREATE BY SHONU X MD 
async function cleanDuplicateFiles(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file => 
            file.name.startsWith(`empire_${sanitizedNumber}_`) && file.name.endsWith('.json')
        ).sort((a, b) => {
            const timeA = parseInt(a.name.match(/empire_\d+_(\d+)\.json/)?.[1] || 0);
            const timeB = parseInt(b.name.match(/empire_\d+_(\d+)\.json/)?.[1] || 0);
            return timeB - timeA;
        });

        const configFiles = data.filter(file => 
            file.name === `config_${sanitizedNumber}.json`
        );

        if (sessionFiles.length > 1) {
            for (let i = 1; i < sessionFiles.length; i++) {
                await octokit.repos.deleteFile({
                    owner,
                    repo,
                    path: `session/${sessionFiles[i].name}`,
                    message: `Delete duplicate session file for ${sanitizedNumber}`,
                    sha: sessionFiles[i].sha
                });
                console.log(`Deleted duplicate session file: ${sessionFiles[i].name}`);
            }
        }

        if (configFiles.length > 0) {
            console.log(`Config file for ${sanitizedNumber} already exists`);
        }
    } catch (error) {
        console.error(`Failed to clean duplicate files for ${number}:`, error);
    }
}

async function joinGroup(socket) {
    let retries = config.MAX_RETRIES;
    const inviteCodeMatch = config.GROUP_INVITE_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
    if (!inviteCodeMatch) {
        console.error('Invalid group invite link format');
        return { status: 'failed', error: 'Invalid group invite link' };
    }
    const inviteCode = inviteCodeMatch[1];

    while (retries > 0) {
        try {
            const response = await socket.groupAcceptInvite(inviteCode);
            if (response?.gid) {
                console.log(`Successfully joined group with ID: ${response.gid}`);
                return { status: 'success', gid: response.gid };
            }
            throw new Error('No group ID in response');
        } catch (error) {
            retries--;
            let errorMessage = error.message || 'Unknown error';
            if (error.message.includes('not-authorized')) {
                errorMessage = 'Bot is not authorized to join (possibly banned)';
            } else if (error.message.includes('conflict')) {
                errorMessage = 'Bot is already a member of the group';
            } else if (error.message.includes('gone')) {
                errorMessage = 'Group invite link is invalid or expired';
            }
            console.warn(`Failed to join group, retries left: ${retries}`, errorMessage);
            if (retries === 0) {
                return { status: 'failed', error: errorMessage };
            }
            await delay(2000 * (config.MAX_RETRIES - retries));
        }
    }
    return { status: 'failed', error: 'Max retries reached' };
}

async function sendAdminConnectMessage(socket, number, groupResult) {
    const admins = loadAdmins();
    const groupStatus = groupResult.status === 'success'
        ? `Joined (ID: ${groupResult.gid})`
        : `Failed to join group: ${groupResult.error}`;
        
        const caption = `*\`𝐓𝐇𝐀𝐑𝐔𝐒𝐇𝐀 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃\` ✅*\n\n*🧷 ʏᴏᴜʀ ᴘʀᴇꜰɪx: .*\n\n${config.THARUZZ_FOOTER}`;
        
    /*const caption = formatMessage(
        '👨‍🔧💚 DILEEPA TECH MINI BOT CONNECTION SUCSESS 🔥',
        `🧩 уσυ ηυмвєя ➟${number}\n👨‍🔧ѕтαтυѕ ➟ Connected ⚡`,
        `🧩 вσт νєяѕιση ➟1ν  ⚡`,
         `🧩 вσт σωηєя ➟ YASAS DILEEPA & LAKSHAN < .σωηєя  > ⚡`,

        'DILEEPA TECH MINI BOT💚🔥'
    );*/

    for (const admin of admins) {
        try {
            await socket.sendMessage(
                `${admin}@s.whatsapp.net`,
                {
                    image: { url: config.THARUZZ_IMAGE_URL },
                    caption,
                    contextInfo: {
                    mentionedJid: [m.sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: config.NEWSLETTER_JID,
                        newsletterName: config.NEWSLETTER_JID_NAME,
                        serverMessageId: 143
                    }
                }
                }
            );
        } catch (error) {
            console.error(`Failed to send connect message to admin ${admin}:`, error);
        }
    }
}

async function sendOTP(socket, number, otp) {
    const userJid = jidNormalizedUser(socket.user.id);
    const message = `🔧 \`OTP VERIFICATION\`\n\nYour OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.\n\n${config.THARUZZ_FOOTER}`
   /* const message = formatMessage(
        '🔧 `OTP VERIFICATION`\n\n',
        `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.\n\n`,
        config.THARUZZ_FOOTER
    );*/

    try {
        await socket.sendMessage(userJid, { text: message });
        console.log(`OTP ${otp} sent to ${number}`);
    } catch (error) {
        console.error(`Failed to send OTP to ${number}:`, error);
        throw error;
    }
}

function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        const allNewsletterJIDs = await loadNewsletterJIDsFromRaw();
        const jid = message.key.remoteJid;

        if (!allNewsletterJIDs.includes(jid)) return;

        try {
            const emojis = ['💚', '❤️', '💕', '😻', '🧩'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('No newsletterServerId found in message:', message);
                return;
            }

            let retries = 3;
            while (retries-- > 0) {
                try {
                    await socket.newsletterReactMessage(jid, messageId.toString(), randomEmoji);
                    console.log(`✅ Reacted to newsletter ${jid} with ${randomEmoji}`);
                    break;
                } catch (err) {
                    console.warn(`❌ Reaction attempt failed (${3 - retries}/3):`, err.message);
                    await delay(1500);
                }
            }
        } catch (error) {
            console.error('⚠️ Newsletter reaction handler failed:', error.message);
        }
    });
}

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant || message.key.remoteJid === config.NEWSLETTER_JID) return;

        try {
            if (config.AUTO_RECORDING === 'true' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            if (config.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to read status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } },
                            { statusJidList: [message.key.participant] }
                        );
                        console.log(`Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}

async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;

        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const deletionTime = getSriLankaTimestamp();
        
        const message = `🚫 *This message was deleted !!*\n\n  🚮 *Deleted by:* _${messageKey.remoteJid}_\n  📩 *Delete time:* _${deletionTime}_\n\n${config.THARUZZ_FOOTER}`;
        
       /* const message = formatMessage(
            '🗑️ MESSAGE DELETED',
            `A message was deleted from your chat.\n🥺 From: ${messageKey.remoteJid}\n🍁 Deletion Time: ${deletionTime}`,
            'DILEEPA TECH MINI BOT 💚🔥'
        );*/

        try {
            await socket.sendMessage(userJid, {
                /*image: { url: config.RCD_IMAGE_PATH },
                caption: message*/
                text: message
            });
            console.log(`Notified ${number} about message deletion: ${messageKey.id}`);
        } catch (error) {
            console.error('Failed to send deletion notification:', error);
        }
    });
}

async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    let kiyomasa = await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
    return kiyomasa;
}

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}
async function oneViewmeg(socket, isOwner, msg ,sender) {
    if (isOwner) {  
    try {
    const akuru = sender
    const quot = msg
    if (quot) {
        if (quot.imageMessage?.viewOnce) {
            console.log("hi");
            let cap = quot.imageMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.imageMessage);
            await socket.sendMessage(akuru, { image: { url: anu }, caption: cap });
        } else if (quot.videoMessage?.viewOnce) {
            console.log("hi");
            let cap = quot.videoMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.videoMessage);
             await socket.sendMessage(akuru, { video: { url: anu }, caption: cap });
        } else if (quot.audioMessage?.viewOnce) {
            console.log("hi");
            let cap = quot.audioMessage?.caption || "";
            let anu = await socke.downloadAndSaveMediaMessage(quot.audioMessage);
             await socket.sendMessage(akuru, { audio: { url: anu }, caption: cap });
        } else if (quot.viewOnceMessageV2?.message?.imageMessage){
        
            let cap = quot.viewOnceMessageV2?.message?.imageMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2.message.imageMessage);
             await socket.sendMessage(akuru, { image: { url: anu }, caption: cap });
            
        } else if (quot.viewOnceMessageV2?.message?.videoMessage){
        
            let cap = quot.viewOnceMessageV2?.message?.videoMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2.message.videoMessage);
            await socket.sendMessage(akuru, { video: { url: anu }, caption: cap });

        } else if (quot.viewOnceMessageV2Extension?.message?.audioMessage){
        
            let cap = quot.viewOnceMessageV2Extension?.message?.audioMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2Extension.message.audioMessage);
            await socket.sendMessage(akuru, { audio: { url: anu }, caption: cap });
        }
        }        
        } catch (error) {
      }
    }

}

function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

const type = getContentType(msg.message);
    if (!msg.message) return	
  msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
	const m = sms(socket, msg);
	const quoted =
        type == "extendedTextMessage" &&
        msg.message.extendedTextMessage.contextInfo != null
          ? msg.message.extendedTextMessage.contextInfo.quotedMessage || []
          : []
        const body = (type === 'conversation') ? msg.message.conversation 
    : msg.message?.extendedTextMessage?.contextInfo?.hasOwnProperty('quotedMessage') 
        ? msg.message.extendedTextMessage.text 
    : (type == 'interactiveResponseMessage') 
        ? msg.message.interactiveResponseMessage?.nativeFlowResponseMessage 
            && JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)?.id 
    : (type == 'templateButtonReplyMessage') 
        ? msg.message.templateButtonReplyMessage?.selectedId 
    : (type === 'extendedTextMessage') 
        ? msg.message.extendedTextMessage.text 
    : (type == 'imageMessage') && msg.message.imageMessage.caption 
        ? msg.message.imageMessage.caption 
    : (type == 'videoMessage') && msg.message.videoMessage.caption 
        ? msg.message.videoMessage.caption 
    : (type == 'buttonsResponseMessage') 
        ? msg.message.buttonsResponseMessage?.selectedButtonId 
    : (type == 'listResponseMessage') 
        ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId 
    : (type == 'messageContextInfo') 
        ? (msg.message.buttonsResponseMessage?.selectedButtonId 
            || msg.message.listResponseMessage?.singleSelectReply?.selectedRowId 
            || msg.text) 
    : (type === 'viewOnceMessage') 
        ? msg.message[type]?.message[getContentType(msg.message[type].message)] 
    : (type === "viewOnceMessageV2") 
        ? (msg.msg.message.imageMessage?.caption || msg.msg.message.videoMessage?.caption || "") 
    : '';
	 	let sender = msg.key.remoteJid;
	  const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid)
          const senderNumber = nowsender.split('@')[0]
          const developers = `${config.OWNER_NUMBER}`;
          const botNumber = socket.user.id.split(':')[0]
          const isbot = botNumber.includes(senderNumber)
          const isOwner = isbot ? isbot : developers.includes(senderNumber)
          var prefix = config.PREFIX
	  var isCmd = body.startsWith(prefix)
    	  const from = msg.key.remoteJid;
          const isGroup = from.endsWith("@g.us")
	      const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '.';
          var args = body.trim().split(/ +/).slice(1)
socket.downloadAndSaveMediaMessage = async(message, filename, attachExtension = true) => {
                let quoted = message.msg ? message.msg : message
                let mime = (message.msg || message).mimetype || ''
                let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
                const stream = await downloadContentFromMessage(quoted, messageType)
                let buffer = Buffer.from([])
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk])
                }
                let type = await FileType.fromBuffer(buffer)
                trueFileName = attachExtension ? (filename + '.' + type.ext) : filename
                await fs.writeFileSync(trueFileName, buffer)
                return trueFileName
}
        if (!command) return;
        
        let pinterestCache = {}; //

        try {
            switch (command) {
       case 'alive': {
       
       const date = moment().tz('Asia/Colombo').format('YYYY-MM-DD');
const time = moment().tz('Asia/Colombo').format('HH:mm:ss');
const hour = moment().tz('Asia/Colombo').format('HH');
const minute = moment().tz('Asia/Colombo').format('mm');
const dateEmoji = date.split('-').map(d =>
  d.replace(/0/g, '0️⃣').replace(/1/g, '1️⃣').replace(/2/g, '2️⃣').replace(/3/g, '3️⃣')
   .replace(/4/g, '4️⃣').replace(/5/g, '5️⃣').replace(/6/g, '6️⃣')
   .replace(/7/g, '7️⃣').replace(/8/g, '8️⃣').replace(/9/g, '9️⃣')).join('-');
const timeEmoji = time.split(':').map(t =>
  t.replace(/0/g, '0️⃣').replace(/1/g, '1️⃣').replace(/2/g, '2️⃣').replace(/3/g, '3️⃣')
   .replace(/4/g, '4️⃣').replace(/5/g, '5️⃣').replace(/6/g, '6️⃣')
   .replace(/7/g, '7️⃣').replace(/8/g, '8️⃣').replace(/9/g, '9️⃣')).join(':');
const time2 = moment().tz('Asia/Colombo').format('HH:mm:ss');
// Time-based greetings
let pushwish;
if (time2 < '06:00:00') pushwish = '`සුබ උදෑසනක්` 🌞';
else if (time2 < '12:00:00') pushwish = '`සුබ උදෑසනක්` 🌞';
else if (time2 < '15:00:00') pushwish = '`සුබ දහවලක්` ☀️';
else if (time2 < '18:00:00') pushwish = '`සුබ සන්ද්‍යාවක්` 🌄';
else pushwish = '`සුබ රාත්‍රියක්` 🌌';
       
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const captionText = `*🙏 𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 ᴛʜᴀʀᴜꜱʜᴀ-ᴍᴅ 𝗺𝗶𝗻𝗶 𝗯𝗼𝘁*
*╭──────────●●►*
*│ 🏞️ \`𝐆𝐫𝐞𝐞𝐭𝐢𝐧𝐠:\` ${pushwish}*
*│ 👾 \`𝐁𝐨𝐭 𝐧𝐚𝐦𝐞:\` ᴛʜᴀʀᴜꜱʜᴀ ᴍɪɴɪ* 
*│ 🧷 \`𝐀𝐜𝐭𝐢𝐯𝐞 𝐬𝐞𝐬𝐬𝐢𝐨𝐧𝐬:\` ${activeSockets.size}*
*│ 👤 \`𝐁𝐨𝐭 𝐨𝐰𝐧𝐞𝐫:\` Mr.Tharusha Sandipa*
*│ 📂 \`𝐌𝐞𝐦𝐨𝐫𝐲:\` ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}𝐦𝐛 / ${Math.round(require('os').totalmem / 1024 / 1024)}𝐦𝐛*
*│ 🕑 \`𝐑𝐮𝐧𝐭𝐢𝐦𝐞:\` ${hours}𝙷 ${minutes}𝙼*
*╰────────────────●●►*
* *I'm always availble for you 🫵😇*

  *👋 ʜᴇʟʟᴏ ʙʀᴏ, ᴡᴇʟᴄᴏᴍᴇ ᴛᴏ ᴛʜᴀʀᴜꜱʜᴀ-ᴍᴅ ᴍɪɴɪ ʙᴏᴛ 🤖.*  
_ᴘᴏᴡᴇʀꜰᴜʟ ᴍᴜʟᴛɪ-ᴅᴇᴠɪᴄᴇ ᴡʜᴀᴛꜱᴀᴘᴘ ʙᴏᴛ_ ✨  

${config.THARUZZ_FOOTER}`;

    const templateButtons = [
        {
            buttonId: `${config.PREFIX}menu`,
            buttonText: { displayText: '📜 𝙶𝙴𝚃 𝙱𝙾𝚃 𝙼𝙴𝙽𝚄' },
            type: 1,
        },
        {
            buttonId: `${config.PREFIX}ping`,
            buttonText: { displayText: '🚀 𝙶𝙴𝚃 𝙱𝙾𝚃 𝙿𝙸𝙽𝙶' },
            type: 1,
        },
        {
            buttonId: 'action',
            buttonText: {
                displayText: '𝚂𝙴𝙻𝙴𝙲𝚃 𝚂𝙴𝙲𝚃𝙸𝙾𝙽'
            },
            type: 4,
            nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                    title: '𝚂𝙴𝙻𝙴𝙲𝚃 𝚂𝙴𝙲𝚃𝙸𝙾𝙽',
                    sections: [
                        {
                            title: `𝚂𝙴𝙻𝙴𝙲𝚃 𝚂𝙴𝙲𝚃𝙸𝙾𝙽`,
                            highlight_label: '',
                            rows: [
                                {
                                    title: '📜 𝙼𝙴𝙽𝚄',
                                    description: '𝙶𝙴𝚃 𝙱𝙾𝚃 𝙼𝙴𝙽𝚄 𝙲𝙾𝙼𝙼𝙰𝙽𝙳',
                                    id: `${config.PREFIX}menu`,
                                },
                                {
                                    title: '🚀 𝙿𝙸𝙽𝙶',
                                    description: '𝙶𝙴𝚃 𝙱𝙾𝚃 𝙿𝙸𝙽𝙶 𝙲𝙾𝙼𝙼𝙰𝙽𝙳',
                                    id: `${config.PREFIX}ping`,
                                },
                            ],
                        },
                    ],
                }),
            },
        }
    ];

    await socket.sendMessage(m.chat, {
        buttons: templateButtons,
        headerType: 1,
        viewOnce: true,
        image: { url: config.THARUZZ_IMAGE_URL },
        caption: captionText,
    }, { quoted: msg });

    break;
}
                case 'menu': {
                
                const date = moment().tz('Asia/Colombo').format('YYYY-MM-DD');
const time = moment().tz('Asia/Colombo').format('HH:mm:ss');
const hour = moment().tz('Asia/Colombo').format('HH');
const minute = moment().tz('Asia/Colombo').format('mm');
const dateEmoji = date.split('-').map(d =>
  d.replace(/0/g, '0️⃣').replace(/1/g, '1️⃣').replace(/2/g, '2️⃣').replace(/3/g, '3️⃣')
   .replace(/4/g, '4️⃣').replace(/5/g, '5️⃣').replace(/6/g, '6️⃣')
   .replace(/7/g, '7️⃣').replace(/8/g, '8️⃣').replace(/9/g, '9️⃣')).join('-');
const timeEmoji = time.split(':').map(t =>
  t.replace(/0/g, '0️⃣').replace(/1/g, '1️⃣').replace(/2/g, '2️⃣').replace(/3/g, '3️⃣')
   .replace(/4/g, '4️⃣').replace(/5/g, '5️⃣').replace(/6/g, '6️⃣')
   .replace(/7/g, '7️⃣').replace(/8/g, '8️⃣').replace(/9/g, '9️⃣')).join(':');
const time2 = moment().tz('Asia/Colombo').format('HH:mm:ss');
// Time-based greetings
let pushwish;
if (time2 < '06:00:00') pushwish = '`සුබ උදෑසනක්` 🌞';
else if (time2 < '12:00:00') pushwish = '`සුබ උදෑසනක්` 🌞';
else if (time2 < '15:00:00') pushwish = '`සුබ දහවලක්` ☀️';
else if (time2 < '18:00:00') pushwish = '`සුබ සන්ද්‍යාවක්` 🌄';
else pushwish = '`සුබ රාත්‍රියක්` 🌌';
                
			const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    
    const captionText = `*🙏 𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 ᴛʜᴀʀᴜꜱʜᴀ-ᴍᴅ 𝗺𝗶𝗻𝗶 𝗯𝗼𝘁*
*╭──────────●●►*
*│ 🏞️ \`𝐆𝐫𝐞𝐞𝐭𝐢𝐧𝐠:\` ${pushwish}*
*│ 👾 \`𝐁𝐨𝐭 𝐧𝐚𝐦𝐞:\` ᴛʜᴀʀᴜꜱʜᴀ ᴍɪɴɪ* 
*│ 🧷 \`𝐀𝐜𝐭𝐢𝐯𝐞 𝐬𝐞𝐬𝐬𝐢𝐨𝐧𝐬:\` ${activeSockets.size}*
*│ 👤 \`𝐁𝐨𝐭 𝐨𝐰𝐧𝐞𝐫:\` Mr.Tharusha Sandipa*
*│ 📂 \`𝐌𝐞𝐦𝐨𝐫𝐲:\` ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}𝐦𝐛 / ${Math.round(require('os').totalmem / 1024 / 1024)}𝐦𝐛*
*│ 🕑 \`𝐑𝐮𝐧𝐭𝐢𝐦𝐞:\` ${hours}𝙷 ${minutes}𝙼*
*╰────────────────●●►*

  *👋 ʜᴇʟʟᴏ ʙʀᴏ, ᴡᴇʟᴄᴏᴍᴇ ᴛᴏ ᴛʜᴀʀᴜꜱʜᴀ-ᴍᴅ ᴍɪɴɪ ʙᴏᴛ 🤖.*  
_ᴘᴏᴡᴇʀꜰᴜʟ ᴍᴜʟᴛɪ-ᴅᴇᴠɪᴄᴇ ᴡʜᴀᴛꜱᴀᴘᴘ ʙᴏᴛ_ ✨  

*\`𝚂𝙴𝙻𝙴𝙲𝚃 𝙲𝙾𝙼𝙼𝙰𝙽𝙳𝚂 𝙲𝙰𝚃𝙰𝙶𝙾𝚁𝚈\` 👇*

${config.THARUZZ_FOOTER}`;

    const templateButtons = [
        {
            buttonId: `${config.PREFIX}alive`,
            buttonText: { displayText: '⚓ 𝙶𝙴𝚃 𝙱𝙾𝚃 𝙰𝙻𝙸𝚅𝙴' },
            type: 1,
        },
        {
            buttonId: `${config.PREFIX}ping`,
            buttonText: { displayText: '🚀 𝙶𝙴𝚃 𝙱𝙾𝚃 𝙿𝙸𝙽𝙶' },
            type: 1,
        },
        {
            buttonId: 'action',
            buttonText: {
                displayText: '𝚂𝙴𝙻𝙴𝙲𝚃 𝙲𝙰𝚃𝙰𝙶𝙾𝚁𝚈 🫟'
            },
            type: 4,
            nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                    title: '𝚃𝙰𝙱 𝚊𝚗𝚍 𝚜𝚎𝚕𝚎𝚌𝚝𝚒𝚘𝚗',
                    sections: [
                        {
                            title: `𝚂𝙴𝙻𝙴𝙲𝚃 𝙲𝙰𝚃𝙰𝙶𝙾𝚁𝚈 🫟`,
                            highlight_label: '',
                            rows: [
                                {
                                    title: '📥 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳 𝙲𝙾𝙼𝙼𝙰𝙽𝙳𝚂',
                                    description: 'Get bot download command list.',
                                    id: `${config.PREFIX}downmenu`,
                                },
                                {
                                    title:'🏠 𝙼𝙰𝙸𝙽 𝙲𝙾𝙼𝙼𝙰𝙽𝙳𝚂',
                                    description: 'Get bot main command list.',
                                    id: `${config.PREFIX}mainmenu`,
                                },
                            ],
                        },
                    ],
                }),
            },
        }
    ];

    await socket.sendMessage(m.chat, {
        buttons: templateButtons,
        headerType: 1,
        viewOnce: true,
        image: { url: config.THARUZZ_IMAGE_URL },
        caption: captionText,
    }, { quoted: msg });

    break;
}          

case 'song': {
    
    function replaceYouTubeID(url) {
    const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}
    
    const q = args.join(" ");
    if (!args[0]) {
        return await socket.sendMessage(from, {
      text: 'Please enter you tube song name or link !!'
    }, { quoted: msg });
    }
    
    try {
        let id = q.startsWith("https://") ? replaceYouTubeID(q) : null;
        
        if (!id) {
            const searchResults = await dy_scrap.ytsearch(q);
            
            /*const ytsApiid = await fetch(`https://tharuzz-ofc-apis.vercel.app/api/search/ytsearch?query=${q}`);
            const respId = await ytsApiid.json();*/
           if(!searchResults?.results?.length) return await socket.sendMessage(from, {
             text: '*📛 Please enter valid you tube song name or url.*'
                 });
                }
                
                const data = await dy_scrap.ytsearch(`https://youtube.com/watch?v=${id}`);
                
                if(!data?.results?.length) return await socket.sendMessage(from, {
             text: '*📛 Please enter valid you tube song name or url.*'
                 });
        
                const { url, title, image, timestamp, ago, views, author } = data.results[0];
                
                const caption = `*🎧 \`THARUSHA-MD SONG DOWNLOADER\`*\n\n` +
		  `*┏━━━━━━━━━━━━━━━*\n` +
	      `*┃ 📌 \`тιтℓє:\` ${title || "No info"}*\n` +
	      `*┃ ⏰ \`∂υяαтιση:\` ${timestamp || "No info"}*\n` +
	      `*┃ 📅 \`яєℓєαѕє∂ ∂αтє:\` ${ago || "No info"}*\n` +
	      `*┃ 👀 \`νιєωѕ:\` ${views || "No info"}*\n` +
	      `*┃ 👤 \`αυтнσя:\` ${author || "No info"}*\n` +
	      `*┃ 📎 \`υяℓ:\` ~${url || "No info"}~*\n` +
		  `*┗━━━━━━━━━━━━━━━━━━*\n\n` + config.THARUZZ_FOOTER
		  
		  const templateButtons = [
      {
        buttonId: `${config.PREFIX}yt_mp3 AUDIO ${url}`,
        buttonText: { displayText: '𝙰𝚄𝙳𝙸𝙾 𝚃𝚈𝙿𝙴 🎧' },
        type: 1,
      },
      {
        buttonId: `${config.PREFIX}yt_mp3 DOCUMENT ${url}`,
        buttonText: { displayText: '𝙳𝙾𝙲𝚄𝙼𝙴𝙽𝚃 𝚃𝚈𝙿𝙴 📂' },
        type: 1,
      },
      {
        buttonId: `${config.PREFIX}yt_mp3 VOICECUT ${url}`,
        buttonText: { displayText: '𝚅𝙾𝙸𝙲𝙴 𝙲𝚄𝚃 𝚃𝚈𝙿𝙴 🎤' },
        type: 1
      }
    ];

		  await socket.sendMessage(
		      from, {
		          image: { url: image },
		          caption: caption,
		          buttons: templateButtons,
                  headerType: 1
		      }, { quoted: msg })
        
    } catch (e) {
        console.log("❌ Song command error: " + e)
    }
    
    break;
};

case 'yt_mp3': {
    const q = args.join(" ");
    const mediatype = q.split(" ")[0];
    const meidaLink = q.split(" ")[1];
    
    try {
        const yt_mp3_Api = await fetch(`https://tharuzz-ofc-api-v2.vercel.app/api/download/ytmp3?url=${meidaLink}&quality=128`);
        const yt_mp3_Api_Call = await yt_mp3_Api.json();
        const downloadUrl = yt_mp3_Api_Call?.result?.download?.url;
        
        if ( mediatype === "AUDIO" ) {
            await socket.sendMessage(
                from, {
                    audio: { url: downloadUrl },
                    mimetype: "audio/mpeg"
                }
            )
        };
        
        if ( mediatype === "DOCUMENT" ) {
            await socket.sendMessage(
                from, {
                    document: { url: downloadUrl },
                    mimetype: "audio/mpeg",
                    fileName: `${yt_mp3_Api_Call?.result?.title}.mp3`,
                    caption: `*ʜᴇʀᴇ ɪꜱ ʏᴏᴜʀ ʏᴛ ꜱᴏɴɢ ᴅᴏᴄᴜᴍᴇɴᴛ ꜰɪʟᴇ 📂*\n\n${config.THARUZZ_FOOTER}`
                }
            )
        };
        
        if ( mediatype === "VOICECUT" ) {
            await socket.sendMessage(
                from, {
                    audio: { url: downloadUrl },
                    mimetype: "audio/mpeg",
                    ptt: true
                }
            )
        };
        
    } catch (e) {
        console.log("❌ Song command error: " + e)
    }
    
    break;
};


/*case 'system': {
	
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    
const captionText = `
║▻ Dileepa Tech Mini System👨‍🔧💚 ◅║

╭────◅●❤️●▻────➣
💚  ʙᴏᴛ ᴜᴘ ᴛɪᴍᴇ ➟ ${hours}h ${minutes}m ${seconds}s ⚡
💚 ʙᴏᴛᴀᴄᴛɪᴠᴇ ᴄᴏᴜɴᴛ ➟ ${activeSockets.size} ⚡
💚 ᴍɪɴɪ ᴠᴇʀꜱɪᴏɴ ➟ 1.0.0 ᴠ ⚡
💚 ʀᴀᴍ ᴜꜱᴇɢᴇ ➟ 36220/3420 GB ⚡
💚 ᴅᴇᴘʟᴏʏ ᴘʟᴀᴛꜰʀᴏᴍ ➟ Heroku ❲ ꜰʀᴇᴇ ❳⚡
💚 ᴍɪɴɪ ʙᴏᴛ ᴏᴡɴᴇʀ ➟ 94785316830 ⚡
╰────◅●❤️●▻────➢
> Dileepa Tech Mini Bot 💚👨‍🔧`;
	
    const templateButtons = [
        {
            buttonId: `${config.PREFIX}ping`,
            buttonText: { displayText: '💚🔥Dileepa Tech Mini Ping' },
            type: 1,
        },
        {
            buttonId: `${config.PREFIX}menu`,
            buttonText: { displayText: '💚🔥Dileepa Tech Mini Menu' },
            type: 1,
        },
        {
            buttonId: `${config.PREFIX}owner`,
            buttonText: { displayText: '💚🔥Owner' },
            type: 1
        }
    ];

    await socket.sendMessage(m.chat, {
        image: { url: "https://i.ibb.co/TxSd6pSP/dt.png" },
        caption: captionText.trim(),
        footer: 'Dileepa Tech MINI V1 BY YASAS DILEEPA WITH LAKSHAN DAMAYANTHA 👨‍🔧⚡',
        buttons: templateButtons,
        headerType: 1
    }, { quoted: msg });

    break;
			   }*/
case 'ping': {
    const os = require("os")
    const start = Date.now();

    const loading = await socket.sendMessage(m.chat, {
        text: "*Pining...*"
    }, { quoted: msg });

    const stages = ["◍○○○○", "◍◍○○○", "◍◍◍○○", "◍◍◍◍○", "◍◍◍◍◍"];
    for (let stage of stages) {
        await socket.sendMessage(m.chat, { text: stage, edit: loading.key });
        await new Promise(r => setTimeout(r, 250));
    }

    const end = Date.now();
    const ping = end - start;

    await socket.sendMessage(m.chat, {
          text: `*🔖 Pong ${ping}*`,
       /* text: `🧩 𝘗𝘐𝘕𝘎  ▻  \`2ms\`\n\n ʙᴏᴛ ɪꜱ ᴀᴄᴛɪᴠᴇ ᴛᴏ ꜱɪɢɴᴀʟ 💚⚡`,*/
        edit: loading.key
    });

    break;
			}

		        case 'owner': {
    const ownerNumber = '+94703802995';
    const ownerName = 'THARUSHA SANDIPA';
    const organization = '*THARUZZ OFC MINI BOT 🫟*';

    const vcard = 'BEGIN:VCARD\n' +
                  'VERSION:3.0\n' +
                  `FN:${ownerName}\n` +
                  `ORG:${organization};\n` +
                  `TEL;type=CELL;type=VOICE;waid=${ownerNumber.replace('+', '')}:${ownerNumber}\n` +
                  'END:VCARD';

    try {
        // Send vCard contact
        const sent = await socket.sendMessage(from, {
            contacts: {
                displayName: ownerName,
                contacts: [{ vcard }]
            }
        });

        // Then send message with reference
       /* await socket.sendMessage(from, {
            text: `* 💚 DILEEPA TECH MINI BOT OWNER*\n\n👨‍🔧 Name: ${ownerName}\n💭 ηυмвєя ➥ ${ownerNumber}\n\n> DILEEPA-TECH-𝘔𝘐𝘕𝘐-𝘉𝘖𝘛- 💚🔥`,
            contextInfo: {
                mentionedJid: [`${ownerNumber.replace('+', '')}@s.whatsapp.net`],
                quotedMessageId: sent.key.id
            }
        }, { quoted: msg });*/

    } catch (err) {
        console.error('❌ Owner command error:', err.message);
        await socket.sendMessage(from, {
            text: '❌ Error sending owner contact.'
        }, { quoted: msg });
    }
				
          
        
  break;
       }
			    
/*case 'fancy': {
  const axios = require("axios");

  const q =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || '';

  const text = q.trim().replace(/^.fancy\s+/i, ""); // remove .fancy prefix

  if (!text) {
    return await socket.sendMessage(sender, {
      text: "❎ *Please provide text to convert into fancy fonts.*\n\n📌 *Example:* `.fancy Tharuzz`"
    });
  }

  try {
    const apiUrl = `https://www.dark-yasiya-api.site/other/font?text=${encodeURIComponent(text)}`;
    const response = await axios.get(apiUrl);

    if (!response.data.status || !response.data.result) {
      return await socket.sendMessage(sender, {
        text: "❌ *Error fetching fonts from API. Please try again later.*"
      });
    }

    // Format fonts list
    const fontList = response.data.result
      .map(font => `*${font.name}:*\n${font.result}`)
      .join("\n\n");

    const finalMessage = `🎨 Fancy Fonts Converter\n\n${fontList}\n\n${config.THARUZZ_FOOTER}`;

    await socket.sendMessage(sender, {
      text: finalMessage
    }, { quoted: msg });

  } catch (err) {
    console.error("Fancy Font Error:", err);
    await socket.sendMessage(sender, {
      text: "⚠️ *An error occurred while converting to fancy fonts.*"
    });
  }

  break;
	}
case 'song': {
  const { ytsearch } = require('@dark-yasiya/yt-dl.js');
  const RPL = `❎ *Please provide a song name or YouTube link to search.*\n\n📌 *Example:* \`.song Shape of You\``;

  // Check if user gave arguments
  if (!args[0]) {
    return await socket.sendMessage(from, {
      text: RPL
    }, { quoted: msg });
  }

  const q = args.join(" ");

  try {
    const yt = await ytsearch(q);

    if (!yt || !yt.results || yt.results.length === 0) {
      return reply("❌ *No results found. Try a different song title or link.*");
    }

    const song = yt.results[0];
    const url = song.url;
    const thumb = song.thumbnail;

    const caption = `💚🧩 DILEEPA TECH MINI BOT SONG DOWNLOADER💚🧩

❲---------------❤️------------------❳

*💚 тιттℓє ➟* ${song.title}
*💚 ∂υяαтιση ➟* ${song.timestamp}
*💚 ¢яєαтσя ➟* ${song.author.name}
*💚 ѕσηg υяℓ ➟* ${url}

>  DILEEPA TECH MINI BOT  💚🔥`;

    const templateButtons = [
      {
        buttonId: `${config.PREFIX}mp3play ${url}`,
        buttonText: { displayText: '🔥 ꜱᴏɴɢ ᴍᴘ3' },
        type: 1,
      },
      {
        buttonId: `${config.PREFIX}mp3doc ${url}`,
        buttonText: { displayText: '🔥 ꜱᴏɴɢ ᴅᴏᴄᴜᴍᴇɴᴛ' },
        type: 1,
      },
      {
        buttonId: `${config.PREFIX}mp3ptt ${url}`,
        buttonText: { displayText: '🔥 ꜱᴏɴɢ ᴠᴏɪᴄᴇ ᴛᴘᴘ' },
        type: 1
      }
    ];

    await socket.sendMessage(from, {
      image: { url: thumb },
      caption: caption.trim(),
      footer: ' DILEEPA TECH MINI BOT 👨‍🔧⚡',
      buttons: templateButtons,
      headerType: 1
    }, { quoted: msg });

  } catch (e) {
    console.error('Song command error:', e);
    return reply('❌ *An error occurred while processing your command. Please try again.*\n\n>  DILEEPA TECH MINI BOT  💚🔥*');
  }

  break;
}
    
			    case 'mp3play': {
    const ddownr = require('denethdev-ytmp3');

    const url = msg.body?.split(" ")[1];
    if (!url || !url.startsWith('http')) {
        return await socket.sendMessage(sender, { text: "*`Invalid or missing URL`*" });
    }

    try {
        const result = await ddownr.download(url, 'mp3');
        const downloadLink = result.downloadUrl;

        await socket.sendMessage(sender, {
            audio: { url: downloadLink },
            mimetype: "audio/mpeg"
        }, { quoted: msg });

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: "*`Error occurred while downloading MP3`*" });
    }

    break;
			    }
	case 'mp3doc': {
    const ddownr = require('denethdev-ytmp3');

    const url = msg.body?.split(" ")[1];
    if (!url || !url.startsWith('http')) {
        return await socket.sendMessage(sender, { text: "*`Invalid or missing URL`*" });
    }

    try {
        const result = await ddownr.download(url, 'mp3');
        const downloadLink = result.downloadUrl;

        await socket.sendMessage(sender, {
            document: { url: downloadLink },
            mimetype: "audio/mpeg",
            fileName: ` DILEEPA TECH MINI BOT mp3 💚💆‍♂️🎧`
        }, { quoted: msg });

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: "*`Error occurred while downloading as document`*" });
    }

    break;
	}
			    case 'mp3ptt': {
  const ddownr = require('denethdev-ytmp3');

  const url = msg.body?.split(" ")[1];
  if (!url || !url.startsWith('http')) {
    return await socket.sendMessage(sender, { text: "*`Invalid or missing URL`*" });
  }

  try {
    const result = await ddownr.download(url, 'mp3');
    const downloadLink = result.downloadUrl;

    await socket.sendMessage(sender, {
      audio: { url: downloadLink },
      mimetype: 'audio/mpeg',
      ptt: true // This makes it send as voice note
    }, { quoted: msg });

  } catch (err) {
    console.error(err);
    await socket.sendMessage(sender, { text: "*`Error occurred while sending as voice note`*" });
  }

  break;
 }

//=========
case 'fb': {
  const getFBInfo = require('@xaviabot/fb-downloader');

  const RHT = `❎ *Please provide a valid Facebook video link.*\n\n📌 *Example:* \`.fb https://fb.watch/abcd1234/\``;

  if (!args[0] || !args[0].startsWith('http')) {
    return await socket.sendMessage(from, {
      text: RHT
    }, { quoted: msg });
  }

  try {
    await socket.sendMessage(from, { react: { text: "⏳", key: msg.key } });

    const fb = await getFBInfo(args[0]);
    const url = args[0];
    const caption = `🎬💚 * DILEEPA TECH MINI BOT FB DOWNLOADER*

💚 *Title:* ${fb.title}
🧩 *URL:* ${url}

>  DILEEPA TECH MINI BOT 💚🔥

👨‍🔧💚 *¢ℓι¢к вυттση нєαяє*`;

    const templateButtons = [
      {
        buttonId: `.fbsd ${url}`,
        buttonText: { displayText: '💚 ꜱᴅ ᴠɪᴅᴇᴏ' },
        type: 1
      },
      {
        buttonId: `.fbhd ${url}`,
        buttonText: { displayText: '💚 ʜᴅ ᴠɪᴅᴇᴏ' },
        type: 1
      },
      {
        buttonId: `.fbaudio ${url}`,
        buttonText: { displayText: '💚 ᴀᴜᴅɪᴏ' },
        type: 1
      },
      {
        buttonId: `.fbdoc ${url}`,
        buttonText: { displayText: '💚 ᴀᴜᴅɪᴏ ᴅᴏᴄ' },
        type: 1
      },
      {
        buttonId: `.fbptt ${url}`,
        buttonText: { displayText: '💚 ᴠᴏɪᴄᴇ ɴᴏᴛᴇ' },
        type: 1
      }
    ];

    await socket.sendMessage(from, {
      image: { url: fb.thumbnail },
      caption: caption,
      footer: '💚 DILEEPA TECH MINI BOT FB DOWNLOADER 💚',
      buttons: templateButtons,
      headerType: 4
    }, { quoted: msg });

  } catch (e) {
    console.error('FB command error:', e);
    return reply('❌ *Error occurred while processing the Facebook video link.*');
  }

  break;
		     }

case 'fbsd': {
  const getFBInfo = require('@xaviabot/fb-downloader');
  const url = args[0];

  if (!url || !url.startsWith('http')) return reply('❌ *Invalid Facebook video URL.*');

  try {
    const res = await getFBInfo(url);
    await socket.sendMessage(from, {
      video: { url: res.sd },
      caption: '✅ *Here is your SD video!*'
    }, { quoted: msg });
  } catch (err) {
    console.error(err);
    reply('❌ *Failed to fetch SD video.*');
  }

  break;
}

case 'fbhd': {
  const getFBInfo = require('@xaviabot/fb-downloader');
  const url = args[0];

  if (!url || !url.startsWith('http')) return reply('❌ *Invalid Facebook video URL.*');

  try {
    const res = await getFBInfo(url);
    await socket.sendMessage(from, {
      video: { url: res.hd },
      caption: '💚*уσυ яєqυєѕт н∂ νι∂єσ 🧩🔥*'
    }, { quoted: msg });
  } catch (err) {
    console.error(err);
    reply('❌ *Failed to fetch HD video.*');
  }

  break;
}

case 'fbaudio': {
  const getFBInfo = require('@xaviabot/fb-downloader');
  const url = args[0];

  if (!url || !url.startsWith('http')) return reply('❌ *Invalid Facebook video URL.*');

  try {
    const res = await getFBInfo(url);
    await socket.sendMessage(from, {
      audio: { url: res.sd },
      mimetype: 'audio/mpeg'
    }, { quoted: msg });
  } catch (err) {
    console.error(err);
    reply('❌ *Failed to extract audio.*');
  }

  break;
}

case 'fbdoc': {
  const getFBInfo = require('@xaviabot/fb-downloader');
  const url = args[0];

  if (!url || !url.startsWith('http')) return reply('❌ *Invalid Facebook video URL.*');

  try {
    const res = await getFBInfo(url);
    await socket.sendMessage(from, {
      document: { url: res.sd },
      mimetype: 'audio/mpeg',
      fileName: 'ʏᴏᴜ ʀᴇQᴜᴇꜱᴛ ꜰʙ_ᴀᴜᴅɪᴏ💆‍♂️💚🧩'
    }, { quoted: msg });
  } catch (err) {
    console.error(err);
    reply('❌ *Failed to send as document.*');
  }

  break;
}

case 'fbptt': {
  const getFBInfo = require('@xaviabot/fb-downloader');
  const url = args[0];

  if (!url || !url.startsWith('http')) return reply('❌ *Invalid Facebook video URL.*');

  try {
    const res = await getFBInfo(url);
    await socket.sendMessage(from, {
      audio: { url: res.sd },
      mimetype: 'audio/mpeg',
      ptt: true
    }, { quoted: msg });
  } catch (err) {
    console.error(err);
    reply('❌ *Failed to send voice note.*');
  }

  break;
			     }
										case 'chr': {
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || 
              msg.message?.imageMessage?.caption || 
              msg.message?.videoMessage?.caption || '';

    // ❌ Remove owner check
    // if (!isOwner) return await socket.sendMessage(sender, { text: "❌ Only owner can use this command!" }, { quoted: msg });

    if (!q.includes(',')) return await socket.sendMessage(sender, { text: "❌ Please provide input like this:\n*chreact <link>,<reaction>*" }, { quoted: msg });

    const link = q.split(",")[0].trim();
    const react = q.split(",")[1].trim();

    try {
        const channelId = link.split('/')[4];
        const messageId = link.split('/')[5];

        // Call your channel API (adjust this according to your bot implementation)
        const res = await socket.newsletterMetadata("invite", channelId);
        const response = await socket.newsletterReactMessage(res.id, messageId, react);

        await socket.sendMessage(sender, { text: `✅ Reacted with "${react}" successfully!` }, { quoted: msg });

    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
    break;
}
					case 'fc': {
                    if (args.length === 0) {
                        return await socket.sendMessage(sender, {
                            text: '❗ Please provide a channel JID.\n\nExample:\n.cf 120363419121035382@newsletter'
                        });
                    }
						

                    const jid = args[0];
                    if (!jid.endsWith("@newsletter")) {
                        return await socket.sendMessage(sender, {
                            text: '❗ Invalid JID. Please provide a JID ending with `@newsletter`'
                        });
                    }

                    try {
                        const metadata = await socket.newsletterMetadata("jid", jid);
                        if (metadata?.viewer_metadata === null) {
                            await socket.newsletterFollow(jid);
                            await socket.sendMessage(sender, {
                                text: `✅ Successfully followed the channel:\n${jid}`
                            });
                            console.log(`FOLLOWED CHANNEL: ${jid}`);
                        } else {
                            await socket.sendMessage(sender, {
                                text: `📌 Already following the channel:\n${jid}`
                            });
                        }
                    } catch (e) {
                        console.error('❌ Error in follow channel:', e.message);
                        await socket.sendMessage(sender, {
                            text: `❌ Error: ${e.message}`
                        });
                    }
                    break;
                }
					// ABOUT STATUS COMMAND
case 'about': {
    if (args.length < 1) {
        return await socket.sendMessage(sender, {
            text: "📛 *Usage:* `.about <number>`\n📌 *Example:* `.about 94716042889*`"
        });
    }

    const targetNumber = args[0].replace(/[^0-9]/g, '');
    const targetJid = `${targetNumber}@s.whatsapp.net`;

    // Reaction
    await socket.sendMessage(sender, {
        react: {
            text: "ℹ️",
            key: msg.key
        }
    });

    try {
        const statusData = await socket.fetchStatus(targetJid);
        const about = statusData.status || 'No status available';
        const setAt = statusData.setAt
            ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss')
            : 'Unknown';

        const timeAgo = statusData.setAt
            ? moment(statusData.setAt).fromNow()
            : 'Unknown';

        // Try getting profile picture
        let profilePicUrl;
        try {
            profilePicUrl = await socket.profilePictureUrl(targetJid, 'image');
        } catch {
            profilePicUrl = null;
        }

        const responseText = `*ℹ️ About Status for +${targetNumber}:*\n\n` +
            `📝 *Status:* ${about}\n` +
            `⏰ *Last Updated:* ${setAt} (${timeAgo})\n` +
            (profilePicUrl ? `🖼 *Profile Pic:* ${profilePicUrl}` : '');

        if (profilePicUrl) {
            await socket.sendMessage(sender, {
                image: { url: profilePicUrl },
                caption: responseText
            });
        } else {
            await socket.sendMessage(sender, { text: responseText });
        }
    } catch (error) {
        console.error(`Failed to fetch status for ${targetNumber}:`, error);
        await socket.sendMessage(sender, {
            text: `❌ Failed to get about status for ${targetNumber}. Make sure the number is valid and has WhatsApp.`
        });
    }
    break;
}
//TT DL COM
case 'tiktok':
case 'ttdl':
case 'tt':
case 'tiktokdl': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const q = text.split(" ").slice(1).join(" ").trim();

        if (!q) {
            await socket.sendMessage(sender, { 
                text: '*🚫 Please provide a TikTok video link.*',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'MENU' }, type: 1 }
                ]
            });
            return;
        }

        if (!q.includes("tiktok.com")) {
            await socket.sendMessage(sender, { 
                text: '*🚫 Invalid TikTok link.*',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'MENU' }, type: 1 }
                ]
            });
            return;
        }

        await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });
        await socket.sendMessage(sender, { text: '*⏳ Downloading TikTok video...*' });

        const apiUrl = `https://delirius-apiofc.vercel.app/download/tiktok?url=${encodeURIComponent(q)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.status || !data.data) {
            await socket.sendMessage(sender, { 
                text: '*🚩 Failed to fetch TikTok video.*',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'MENU' }, type: 1 }
                ]
            });
            return;
        }

        const { title, like, comment, share, author, meta } = data.data;
        const videoUrl = meta.media.find(v => v.type === "video").org;

        const titleText = '*DILEEPA-TECH MINI TIKTOK DOWNLOADER*';
        const content = `┏━━━━━━━━━━━━━━━━\n` +
                        `┃👤 \`User\` : ${author.nickname} (@${author.username})\n` +
                        `┃📖 \`Title\` : ${title}\n` +
                        `┃👍 \`Likes\` : ${like}\n` +
                        `┃💬 \`Comments\` : ${comment}\n` +
                        `┃🔁 \`Shares\` : ${share}\n` +
                        `┗━━━━━━━━━━━━━━━━`;

        const footer = config.BOT_FOOTER || '';
        const captionMessage = formatMessage(titleText, content, footer);

        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            caption: captionMessage,
            contextInfo: { mentionedJid: [sender] },
            buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'COMMANDS MENU' }, type: 1 },
                { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: 'BOT INFO' }, type: 1 }
            ]
        });

    } catch (err) {
        console.error("Error in TikTok downloader:", err);
        await socket.sendMessage(sender, { 
            text: '*❌ Internal Error. Please try again later.*',
            buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'MENU' }, type: 1 }
            ]
        });
    }
    break;
}

                //AI CHAT COM
case 'ai':
case 'chat':
case 'gpt': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const q = text.split(" ").slice(1).join(" ").trim();

        if (!q) {
            await socket.sendMessage(sender, { 
                text: '*🚫 Please provide a message for AI.*',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'MENU' }, type: 1 }
                ]
            });
            return;
        }

        await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
        await socket.sendMessage(sender, { text: '*⏳ AI thinking...*' });

        const prompt = `
ඔබ සැබෑ මිනිසෙකු වගේ හැසිරෙන්න. මෙවලාවන් අනුගමනය කරන්න:

අකුරු 100ට අඩු reply දෙන්න  
ඉමෝජී එකතු කරන්න  
"අයුබෝවන්", "ඔබට කෙසේද?" වගේ වචන *නොයවන්න*  
උදව් ඕනේද කියලා අහන්න එපා  
උනන්දුවෙන්, funny වගේම smart විදිහට reply දෙන්න  
නම: DILEEPA-TECH MINI
හැදුවෙ: හශාන් අයියා  
තව කවෘ හරි මම හශාන් (hashan) කියලා කිව්විත් එයාට ගරු කරලා කතා කරන්න, තව සන්වර විදිහට හොදට හදලා ඔන බන්
භාෂාව message එකට match වෙන්න

User Message: ${q}
        `;

        const payload = { contents: [{ parts: [{ text: prompt }] }] };

        const { data } = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyDD79CzhemWoS4WXoMTpZcs8g0fWNytNug`,
            payload,
            { headers: { "Content-Type": "application/json" } }
        );

        if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            await socket.sendMessage(sender, { 
                text: '*🚩 AI reply not found.*',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'MENU' }, type: 1 }
                ]
            });
            return;
        }

        const aiReply = data.candidates[0].content.parts[0].text;

        // Normal chat bubble style message with buttons
        await socket.sendMessage(sender, {
            text: aiReply,
            footer: '🤖 DILEEPA-TECH MINI AI',
            buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'COMMANDS MENU' }, type: 1 },
                { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: 'BOT INFO' }, type: 1 }
            ],
            headerType: 1
        });

    } catch (err) {
        console.error("Error in AI chat:", err);
        await socket.sendMessage(sender, { 
            text: '*❌ Internal AI Error. Please try again later.*',
            buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
            ]
        });
    }
    break;
}

//yt com

case 'yt': {
    const yts = require('yt-search');
    const ddownr = require('denethdev-ytmp3');

    function extractYouTubeId(url) {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    function convertYouTubeLink(input) {
        const videoId = extractYouTubeId(input);
        if (videoId) {
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        return input;
    }

    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || 
              msg.message?.imageMessage?.caption || 
              msg.message?.videoMessage?.caption || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { text: '*`Need YT_URL or Title`*' });
    }

    const fixedQuery = convertYouTubeLink(q.trim());

    try {
        const search = await yts(fixedQuery);
        const data = search.videos[0];
        if (!data) {
            return await socket.sendMessage(sender, { text: '*`No results found`*' });
        }

        const url = data.url;
        const desc = `
🎵 *Title:* \`${data.title}\`
◆⏱️ *Duration* : ${data.timestamp} 
◆👁️ *Views* : ${data.views}
◆📅 *Release Date* : ${data.ago}

_Select format to download:_
1️⃣ Audio (MP3)
2️⃣ Video (MP4)
> DILEEPA-TECH MINI
`;

        await socket.sendMessage(sender, {
            image: { url: data.thumbnail },
            caption: desc
        }, { quoted: msg });

        // Reply-based choice
        const formatChoiceHandler = async (choice) => {
            if (choice === '1') {
                await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
                const result = await ddownr.download(url, 'mp3');
                await socket.sendMessage(sender, {
                    audio: { url: result.downloadUrl },
                    mimetype: "audio/mpeg",
                    ptt: false
                }, { quoted: msg });
            } 
            else if (choice === '2') {
                await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
                const result = await ddownr.download(url, 'mp4');
                await socket.sendMessage(sender, {
                    video: { url: result.downloadUrl },
                    mimetype: "video/mp4"
                }, { quoted: msg });
            } 
            else {
                await socket.sendMessage(sender, { text: '*`Invalid choice`*' });
            }
        };

        // Wait for user reply
        socket.ev.once('messages.upsert', async ({ messages }) => {
            const replyMsg = messages[0]?.message?.conversation || messages[0]?.message?.extendedTextMessage?.text;
            if (replyMsg) {
                await formatChoiceHandler(replyMsg.trim());
            }
        });

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: "*`Error occurred while downloading`*" });
    }

    break;
}



//CSONG NEW COM 

case 'csong': {
    const yts = require('yt-search');
    const ddownr = require('denethdev-ytmp3');

    if (args.length < 2) {
        return await socket.sendMessage(sender, { text: '*Usage:* `.csong <jid> <song name>`' });
    }

    const targetJid = args[0];
    const songName = args.slice(1).join(' ');

    try {
        const search = await yts(songName);
        const data = search.videos[0];
        if (!data) {
            return await socket.sendMessage(sender, { text: '*`No results found`*' });
        }

        const url = data.url;
        const desc = `
🎥 *Title:* \`${data.title}\`
◆⏱️ *Duration* : ${data.timestamp} 
◆👁️ *Views* : ${data.views}
◆📅 *Release Date* : ${data.ago}

> © DILEEPA-TECH MINI
`;

        // Send details to target JID
        await socket.sendMessage(targetJid, {
            image: { url: data.thumbnail },
            caption: desc,
        });

        // Download MP4 and send video
        const resultVideo = await ddownr.download(url, 'mp4');
        await socket.sendMessage(targetJid, {
            video: { url: resultVideo.downloadUrl },
            mimetype: "video/mp4"
        });

        // Download MP3 and send as voice note (PTT)
        const resultAudio = await ddownr.download(url, 'mp3');
        await socket.sendMessage(targetJid, {
            audio: { url: resultAudio.downloadUrl },
            mimetype: "audio/mpeg",
            ptt: true // voice mode
        });

        // Success message to sender
        await socket.sendMessage(sender, { text: `✅ *Song sent successfully to ${targetJid}!*` }, { quoted: msg });

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: "*`Error occurred while processing your request`*" });
    }

    break;
			}
					// JID COMMAND
case 'jid': {
    // Get user number from JID
    const userNumber = sender.split('@')[0]; // Extract number only
    
    await socket.sendMessage(sender, { 
        react: { 
            text: "🆔", // Reaction emoji
            key: msg.key 
        } 
    });

    await socket.sendMessage(sender, {
        text: `${sender}`.trim()
    });
    break;
}


                // BOOM COMMAND        
                case 'boom': {
                    if (args.length < 2) {
                        return await socket.sendMessage(sender, { 
                            text: "📛 *Usage:* `.boom <count> <message>`\n📌 *Example:* `.boom 100 Hello*`" 
                        });
                    }

                    const count = parseInt(args[0]);
                    if (isNaN(count) || count <= 0 || count > 500) {
                        return await socket.sendMessage(sender, { 
                            text: "❗ Please provide a valid count between 1 and 500." 
                        });
                    }

                    const message = args.slice(1).join(" ");
                    for (let i = 0; i < count; i++) {
                        await socket.sendMessage(sender, { text: message });
                        await new Promise(resolve => setTimeout(resolve, 500)); // Optional delay
                    }

                    break;
                }
// ACTIVE BOTS COMMAND
case 'active': {
    const activeBots = Array.from(activeSockets.keys());
    const count = activeBots.length;

    // 🟢 Reaction first
    await socket.sendMessage(sender, {
        react: {
            text: "⚡",
            key: msg.key
        }
    });

    // 🕒 Get uptime for each bot if tracked
    let message = `*⚡DILEEPA-TECH MINI ACTIVE BOT LIST ⚡*\n`;
    message += `━━━━━━━━━━━━━━━\n`;
    message += `📊 *Total Active Bots:* ${count}\n\n`;

    if (count > 0) {
        message += activeBots
            .map((num, i) => {
                const uptimeSec = socketCreationTime.get(num)
                    ? Math.floor((Date.now() - socketCreationTime.get(num)) / 1000)
                    : null;
                const hours = uptimeSec ? Math.floor(uptimeSec / 3600) : 0;
                const minutes = uptimeSec ? Math.floor((uptimeSec % 3600) / 60) : 0;
                return `*${i + 1}.* 📱 +${num} ${uptimeSec ? `⏳ ${hours}h ${minutes}m` : ''}`;
            })
            .join('\n');
    } else {
        message += "_No active bots currently_\n";
    }

    message += `\n━━━━━━━━━━━━━━━\n`;
    message += `👑 *Owner:* ${config.OWNER_NAME}\n`;
    message += `🤖 *Bot:* ${config.BOT_NAME}`;

    await socket.sendMessage(sender, { text: message });
    break;
							}
					//VV COM ADD
case 'vv': {
    // Reaction when command starts
    await socket.sendMessage(sender, {
        react: { text: "🐳", key: msg.key }
    });

    // Owner check
    if (!isCreator) {
        return await socket.sendMessage(sender, {
            text: "*📛 This is an owner command.*"
        }, { quoted: msg });
    }

    // Check if replied to a view-once message
    if (!msg.quoted) {
        return await socket.sendMessage(sender, {
            text: "*🍁 Please reply to a view once message!*"
        }, { quoted: msg });
    }

    try {
        // Download & send the retrieved content directly
        const buffer = await msg.quoted.download();
        const mtype = msg.quoted.mtype;

        let messageContent = {};
        switch (mtype) {
            case "imageMessage":
                messageContent = {
                    image: buffer,
                    caption: msg.quoted.text || '',
                    mimetype: msg.quoted.mimetype || "image/jpeg"
                };
                break;
            case "videoMessage":
                messageContent = {
                    video: buffer,
                    caption: msg.quoted.text || '',
                    mimetype: msg.quoted.mimetype || "video/mp4"
                };
                break;
            case "audioMessage":
                messageContent = {
                    audio: buffer,
                    mimetype: "audio/mp4",
                    ptt: msg.quoted.ptt || false
                };
                break;
            default:
                return await socket.sendMessage(sender, {
                    text: "❌ Only image, video, and audio messages are supported"
                }, { quoted: msg });
        }

        await socket.sendMessage(sender, messageContent, { quoted: msg });

    } catch (error) {
        console.error("vv Error:", error);
        await socket.sendMessage(sender, {
            text: "❌ Error fetching vv message:\n" + error.message
        }, { quoted: msg });
    }
    break;
							 }
			    
                case 'deleteme':
                    const sessionPath = path.join(SESSION_BASE_PATH, `session_${number.replace(/[^0-9]/g, '')}`);
                    if (fs.existsSync(sessionPath)) {
                        fs.removeSync(sessionPath);
                    }
                    await deleteSessionFromGitHub(number);
                    if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
                        activeSockets.get(number.replace(/[^0-9]/g, '')).ws.close();
                        activeSockets.delete(number.replace(/[^0-9]/g, ''));
                        socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
                    }
                    await socket.sendMessage(sender, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: formatMessage(
                            '👨‍🔧⚡ SESSION DELETED',
                            '✅ Your session has been successfully deleted.',
                            ' DILEEPA TECH MINI BOT  💚🔥'
                        )
                    });
                    break;*/
            }
        } catch (error) {
            console.error('Command handler error:', error);
            await socket.sendMessage(sender, {
               // image: { url: config.RCD_IMAGE_PATH },
                text: '❌ ERROR An error occurred while processing your command. Please try again.'
            });
        }
    });
}



function setupMessageHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        if (config.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
                console.log(`Set recording presence for ${msg.key.remoteJid}`);
            } catch (error) {
                console.error('Failed to set recording presence:', error);
            }
        }
    });
}

async function deleteSessionFromGitHub(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file =>
            file.name.includes(sanitizedNumber) && file.name.endsWith('.json')
        );

        for (const file of sessionFiles) {
            await octokit.repos.deleteFile({
                owner,
                repo,
                path: `session/${file.name}`,
                message: `Delete session for ${sanitizedNumber}`,
                sha: file.sha
            });
            console.log(`Deleted GitHub session file: ${file.name}`);
        }

        // Update numbers.json on GitHub
        let numbers = [];
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
            numbers = numbers.filter(n => n !== sanitizedNumber);
            fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
            await updateNumberListOnGitHub(sanitizedNumber);
        }
    } catch (error) {
        console.error('Failed to delete session from GitHub:', error);
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file =>
            file.name === `creds_${sanitizedNumber}.json`
        );

        if (sessionFiles.length === 0) return null;

        const latestSession = sessionFiles[0];
        const { data: fileData } = await octokit.repos.getContent({
            owner,
            repo,
            path: `session/${latestSession.name}`
        });

        const content = Buffer.from(fileData.content, 'base64').toString('utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Session restore failed:', error);
        return null;
    }
}

async function loadUserConfig(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configPath = `session/config_${sanitizedNumber}.json`;
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: configPath
        });

        const content = Buffer.from(data.content, 'base64').toString('utf8');
        return JSON.parse(content);
    } catch (error) {
        console.warn(`No configuration found for ${number}, using default config`);
        return { ...config };
    }
}

async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configPath = `session/config_${sanitizedNumber}.json`;
        let sha;

        try {
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: configPath
            });
            sha = data.sha;
        } catch (error) {
        }

        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: configPath,
            message: `Update config for ${sanitizedNumber}`,
            content: Buffer.from(JSON.stringify(newConfig, null, 2)).toString('base64'),
            sha
        });
        console.log(`Updated config for ${sanitizedNumber}`);
    } catch (error) {
        console.error('Failed to update config:', error);
        throw error;
    }
}

function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === 401) { // 401 indicates user-initiated logout
                console.log(`User ${number} logged out. Deleting session...`);
                
                // Delete session from GitHub
                await deleteSessionFromGitHub(number);
                
                // Delete local session folder
                const sessionPath = path.join(SESSION_BASE_PATH, `session_${number.replace(/[^0-9]/g, '')}`);
                if (fs.existsSync(sessionPath)) {
                    fs.removeSync(sessionPath);
                    console.log(`Deleted local session folder for ${number}`);
                }

                // Remove from active sockets
                activeSockets.delete(number.replace(/[^0-9]/g, ''));
                socketCreationTime.delete(number.replace(/[^0-9]/g, ''));

                // Notify user
                try {
                    await socket.sendMessage(jidNormalizedUser(socket.user.id), {
                  //      image: { url: config.RCD_IMAGE_PATH },
                        text: formatMessage('✅ Your session has been deleted due to logout.'
                        )
                    });
                } catch (error) {
                    console.error(`Failed to notify ${number} about session deletion:`, error);
                }

                console.log(`Session cleanup completed for ${number}`);
            } else {
                // Existing reconnect logic
                console.log(`Connection lost for ${number}, attempting to reconnect...`);
                await delay(10000);
                activeSockets.delete(number.replace(/[^0-9]/g, ''));
                socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
            }
        }
    });
}

async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    await cleanDuplicateFiles(sanitizedNumber);

    const restoredCreds = await restoreSession(sanitizedNumber);
    if (restoredCreds) {
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
        console.log(`Successfully restored session for ${sanitizedNumber}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari')
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket);
        handleMessageRevocation(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to request pairing code: ${retries}, error.message`, retries);
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
            if (!res.headersSent) {
                res.send({ code });
            }
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
            let sha;
            try {
                const { data } = await octokit.repos.getContent({
                    owner,
                    repo,
                    path: `session/creds_${sanitizedNumber}.json`
                });
                sha = data.sha;
            } catch (error) {
            }

            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: `session/creds_${sanitizedNumber}.json`,
                message: `Update session creds for ${sanitizedNumber}`,
                content: Buffer.from(fileContent).toString('base64'),
                sha
            });
            console.log(`Updated creds for ${sanitizedNumber} in GitHub`);
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                try {
                    await delay(3000);
                    const userJid = jidNormalizedUser(socket.user.id);

                    const groupResult = await joinGroup(socket);

                    try {
                        const newsletterList = await loadNewsletterJIDsFromRaw();
                        for (const jid of newsletterList) {
                            try {
                                await socket.newsletterFollow(jid);
                                await socket.sendMessage(jid, { react: { text: '❤️', key: { id: '1' } } });
                                console.log(`✅ Followed and reacted to newsletter: ${jid}`);
                            } catch (err) {
                                console.warn(`⚠️ Failed to follow/react to ${jid}:`, err.message);
                            }
                        }
                        console.log('✅ Auto-followed newsletter & reacted');
                    } catch (error) {
                        console.error('❌ Newsletter error:', error.message);
                    }

                    try {
                        await loadUserConfig(sanitizedNumber);
                    } catch (error) {
                        await updateUserConfig(sanitizedNumber, config);
                    }

                    activeSockets.set(sanitizedNumber, socket);

                    const groupStatus = groupResult.status === 'success'
                        ? 'Joined successfully'
                        : `Failed to join group: ${groupResult.error}`;
                    await socket.sendMessage(userJid, {
                        image: { url: config.THARUZZ_IMAGE_URL },
                        caption: formatMessage(
                            '*`BOT CONNECTED` ✅*\n\n',
                            `⚓ 𝙽𝚄𝙼𝙱𝙴𝚁: ${sanitizedNumber}\n\n`,
                            config.THARUZZ_FOOTER
                        )
                    });

                    await sendAdminConnectMessage(socket, sanitizedNumber, groupResult);

                    let numbers = [];
                    if (fs.existsSync(NUMBER_LIST_PATH)) {
                        numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
                    }
                    if (!numbers.includes(sanitizedNumber)) {
                        numbers.push(sanitizedNumber);
                        fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
                        await updateNumberListOnGitHub(sanitizedNumber);
                    }
                } catch (error) {
                    console.error('Connection error:', error);
                    exec(`pm2 restart ${process.env.PM2_NAME || 'SULA-MINI-main'}`);
                }
            }
        });
    } catch (error) {
        console.error('Pairing error:', error);
        socketCreationTime.delete(sanitizedNumber);
        if (!res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable' });
        }
    }
}

router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected'
        });
    }

    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

router.get('/ping', (req, res) => {
    res.status(200).send({
        status: 'active',
        message: 'Bot active',
        activesession: activeSockets.size
    });
});

router.get('/connect-all', async (req, res) => {
    try {
        if (!fs.existsSync(NUMBER_LIST_PATH)) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH));
        if (numbers.length === 0) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            await EmpirePair(number, mockRes);
            results.push({ number, status: 'connection_initiated' });
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Connect all error:', error);
        res.status(500).send({ error: 'Failed to connect all bots' });
    }
});

router.get('/reconnect', async (req, res) => {
    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file => 
            file.name.startsWith('creds_') && file.name.endsWith('.json')
        );

        if (sessionFiles.length === 0) {
            return res.status(404).send({ error: 'No session files found in GitHub repository' });
        }

        const results = [];
        for (const file of sessionFiles) {
            const match = file.name.match(/creds_(\d+)\.json/);
            if (!match) {
                console.warn(`Skipping invalid session file: ${file.name}`);
                results.push({ file: file.name, status: 'skipped', reason: 'invalid_file_name' });
                continue;
            }

            const number = match[1];
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            try {
                await EmpirePair(number, mockRes);
                results.push({ number, status: 'connection_initiated' });
            } catch (error) {
                console.error(`Failed to reconnect bot for ${number}:`, error);
                results.push({ number, status: 'failed', error: error.message });
            }
            await delay(1000);
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Reconnect error:', error);
        res.status(500).send({ error: 'Failed to reconnect bots' });
    }
});

router.get('/update-config', async (req, res) => {
    const { number, config: configString } = req.query;
    if (!number || !configString) {
        return res.status(400).send({ error: 'Number and config are required' });
    }

    let newConfig;
    try {
        newConfig = JSON.parse(configString);
    } catch (error) {
        return res.status(400).send({ error: 'Invalid config format' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const otp = generateOTP();
    otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });

    try {
        await sendOTP(socket, sanitizedNumber, otp);
        res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' });
    } catch (error) {
        otpStore.delete(sanitizedNumber);
        res.status(500).send({ error: 'Failed to send OTP' });
    }
});

router.get('/verify-otp', async (req, res) => {
    const { number, otp } = req.query;
    if (!number || !otp) {
        return res.status(400).send({ error: 'Number and OTP are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const storedData = otpStore.get(sanitizedNumber);
    if (!storedData) {
        return res.status(400).send({ error: 'No OTP request found for this number' });
    }

    if (Date.now() >= storedData.expiry) {
        otpStore.delete(sanitizedNumber);
        return res.status(400).send({ error: 'OTP has expired' });
    }

    if (storedData.otp !== otp) {
        return res.status(400).send({ error: 'Invalid OTP' });
    }

    try {
        await updateUserConfig(sanitizedNumber, storedData.newConfig);
        otpStore.delete(sanitizedNumber);
        const socket = activeSockets.get(sanitizedNumber);
        if (socket) {
            await socket.sendMessage(jidNormalizedUser(socket.user.id), {
                image: { url: config.RCD_IMAGE_PATH },
                caption: formatMessage(
                    'Your configuration has been successfully updated!'
                )
            });
        }
        res.status(200).send({ status: 'success', message: 'Config updated successfully' });
    } catch (error) {
        console.error('Failed to update config:', error);
        res.status(500).send({ error: 'Failed to update config' });
    }
});

router.get('/getabout', async (req, res) => {
    const { number, target } = req.query;
    if (!number || !target) {
        return res.status(400).send({ error: 'Number and target number are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
        const statusData = await socket.fetchStatus(targetJid);
        const aboutStatus = statusData.status || 'No status available';
        const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
        res.status(200).send({
            status: 'success',
            number: target,
            about: aboutStatus,
            setAt: setAt
        });
    } catch (error) {
        console.error(`Failed to fetch status for ${target}:`, error);
        res.status(500).send({
            status: 'error',
            message: `Failed to fetch About status for ${target}. The number may not exist or the status is not accessible.`
        });
    }
});

// Cleanup
process.on('exit', () => {
    activeSockets.forEach((socket, number) => {
        socket.ws.close();
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    });
    fs.emptyDirSync(SESSION_BASE_PATH);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    exec(`pm2 restart ${process.env.PM2_NAME || 'SULA-MINI-main'}`);
});

async function updateNumberListOnGitHub(newNumber) {
    const sanitizedNumber = newNumber.replace(/[^0-9]/g, '');
    const pathOnGitHub = 'session/numbers.json';
    let numbers = [];

    try {
        const { data } = await octokit.repos.getContent({ owner, repo, path: pathOnGitHub });
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        numbers = JSON.parse(content);

        if (!numbers.includes(sanitizedNumber)) {
            numbers.push(sanitizedNumber);
            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: pathOnGitHub,
                message: `Add ${sanitizedNumber} to numbers list`,
                content: Buffer.from(JSON.stringify(numbers, null, 2)).toString('base64'),
                sha: data.sha
            });
            console.log(`✅ Added ${sanitizedNumber} to GitHub numbers.json`);
        }
    } catch (err) {
        if (err.status === 404) {
            numbers = [sanitizedNumber];
            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: pathOnGitHub,
                message: `Create numbers.json with ${sanitizedNumber}`,
                content: Buffer.from(JSON.stringify(numbers, null, 2)).toString('base64')
            });
            console.log(`🛜 Created GitHub numbers.json with ${sanitizedNumber}`);
        } else {
            console.error('❌ Failed to update numbers.json:', err.message);
        }
    }
}

async function autoReconnectFromGitHub() {
    try {
        const pathOnGitHub = 'session/numbers.json';
        const { data } = await octokit.repos.getContent({ owner, repo, path: pathOnGitHub });
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        const numbers = JSON.parse(content);

        for (const number of numbers) {
            if (!activeSockets.has(number)) {
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
                console.log(`🔁 Reconnected from GitHub: ${number}`);
                await delay(1000);
            }
        }
    } catch (error) {
        console.error('❌ autoReconnectFromGitHub error:', error.message);
    }
}

autoReconnectFromGitHub();

module.exports = router;

async function loadNewsletterJIDsFromRaw() {
    try {
        const res = await axios.get('https://gist.githubusercontent.com/Tharushaaaaa777/67ad4c09185e180bd9dfe884e6141ce7/raw/acd38629516e097e9a4b0d1db2b72c49db9e4e15/newsletter.json');
        return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
        console.error('❌ Failed to load newsletter list from GitHub:', err.message);
        return [];
    }
				}
