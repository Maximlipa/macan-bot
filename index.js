const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CLIENT_ID = '1566290468726382632';
const TOKEN = process.env.TOKEN;

const DATA_FILE = path.join(__dirname, 'blacklist.json');

function loadBlacklist() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
    }
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveBlacklist(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Проверить Steam2 ID на наличие в ЧС клана МАКАН')
        .addStringOption(option =>
            option.setName('steam_id')
                .setDescription('Steam2 ID (например: STEAM_0:1:12345678)')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('blacklist_add')
        .setDescription('Добавить игрока в ЧС клана МАКАН (Только для Админов)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('steam_id')
                .setDescription('Steam2 ID игрока')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Причина внесения')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('buyout')
                .setDescription('Сумма откупа в $ (0 если без откупа)')
                .setRequired(false))
].map(command => command.toJSON());

client.once('clientReady', async () => {
    console.log(`Бот ${client.user.tag} успешно запущен!`);

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('Регистрация слэш-команд...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );
        console.log('Команды /check и /blacklist_add зарегистрированы!');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const blacklist = loadBlacklist();

    if (interaction.commandName === 'check') {
        const input = interaction.options.getString('steam_id').trim().toLowerCase();
        const found = blacklist.find(item => item.steam_id.toLowerCase() === input);

        if (found) {
            const buyoutText = found.buyout > 0 
                ? `**Возможен откуп:** $${found.buyout}` 
                : '**Без права на откуп**';

            await interaction.reply({
                embeds: [{
                    color: 0xef4444,
                    title: '⚠️ ИГРОК В ЧЕРНОМ СПИСКЕ',
                    fields: [
                        { name: 'Steam2 ID', value: `\`${found.steam_id}\``, inline: false },
                        { name: 'Причина', value: found.reason, inline: false },
                        { name: 'Статус откупа', value: buyoutText, inline: false }
                    ],
                    footer: { text: 'Клан МАКАН • Gambit RP' }
                }]
            });
        } else {
            await interaction.reply({
                embeds: [{
                    color: 0x10b981,
                    title: '✅ Игрок не найден в ЧС',
                    description: `Игрок с ID \`${interaction.options.getString('steam_id')}\` чист.`,
                    footer: { text: 'Клан МАКАН • Gambit RP' }
                }]
            });
        }
    }

    if (interaction.commandName === 'blacklist_add') {
        const steam_id = interaction.options.getString('steam_id').trim();
        const reason = interaction.options.getString('reason').trim();
        const buyout = interaction.options.getInteger('buyout') || 0;

        blacklist.push({ steam_id, reason, buyout });
        saveBlacklist(blacklist);

        await interaction.reply({
            content: `✅ Игрок \`${steam_id}\` внесен в Черный Список! Все соклановцы сразу увидят его при проверке.`,
            ephemeral: true
        });
    }
});

client.login(TOKEN);

// Веб-сервер и API для Discord Activity
http.createServer((req, res) => {
    if (req.url === '/api/blacklist' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(loadBlacklist()));
    }

    if (req.url === '/api/buyout' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { index } = JSON.parse(body);
            let data = loadBlacklist();
            if (data[index]) {
                data[index].buyout = 0;
                data[index].reason += ' (ВЫКУП ОПЛАЧЕН)';
                saveBlacklist(data);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        });
        return;
    }

    if (req.url === '/api/remove' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { index } = JSON.parse(body);
            let data = loadBlacklist();
            if (data[index]) {
                data.splice(index, 1);
                saveBlacklist(data);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        });
        return;
    }

    let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        }
    });
}).listen(process.env.PORT || 3000);