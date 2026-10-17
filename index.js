const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require(\'discord.js\');
const express = require(\'express\');

const app = express();
app.get(\'/\', (req, res) => res.send(\'Bistro Bot is online!\'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server on port ${PORT}`));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const pendingVouches = new Map();

const commands = [
  new SlashCommandBuilder().setName(\'calculate\').setDescription(\'Roblox Robux Tax Calculator\').addIntegerOption(o => o.setName(\'amount\').setDescription(\'Amount of Robux\').setRequired(true)),
  new SlashCommandBuilder().setName(\'username\').setDescription(\'Check if Roblox username is valid/taken\').addStringOption(o => o.setName(\'name\').setDescription(\'Roblox username\').setRequired(true)),
  new SlashCommandBuilder().setName(\'gpscan\').setDescription(\'Scan all Gamepasses of a Roblox user\').addStringOption(o => o.setName(\'name\').setDescription(\'Roblox username\').setRequired(true)),
  new SlashCommandBuilder().setName(\'deal\').setDescription(\'Create a deal - bot will auto-tag if no vouch\').addUserOption(o => o.setName(\'user\').setDescription(\'User you dealt with\').setRequired(true)),
  new SlashCommandBuilder().setName(\'vouch\').setDescription(\'Vouch a successful transaction\').addUserOption(o => o.setName(\'user\').setDescription(\'Who you vouched for\').setRequired(true)).addStringOption(o => o.setName(\'proof\').setDescription(\'Proof link/image\')),
  new SlashCommandBuilder().setName(\'pending\').setDescription(\'Show users who have not vouched yet\'),
].map(c => c.toJSON());

const rest = new REST({ version: \'10\' }).setToken(TOKEN);
(async () => {
  try {
    console.log(\'Registering slash commands...\');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(\'Slash commands registered!\');
  } catch (e) { console.error(e) }
})();

client.once(\'ready\', () => {
  console.log(`Bistro Bot online as ${client.user.tag}`);
  client.user.setActivity(\'Bistro Blocks | /calculate /gpscan\', { type: ActivityType.Playing });
});

client.on(\'interactionCreate\', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === \'calculate\') {
    const amount = interaction.options.getInteger(\'amount\');
    const afterTax = Math.floor(amount * 0.7);
    const toReceive = Math.ceil(amount / 0.7);
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(\'Roblox Calculator\')
      .addFields(
        { name: \'You Give\', value: `${amount} Robux`, inline: true },
        { name: \'They Receive (30% Tax)\', value: `${afterTax} Robux`, inline: true },
        { name: `To Receive ${amount} After Tax, Charge`, value: `${toReceive} Robux`, inline: false }
      )
      .setFooter({ text: \'Roblox takes 30% tax\' });
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === \'username\') {
    await interaction.deferReply();
    const name = interaction.options.getString(\'name\');
    try {
      const res = await fetch(\'https://users.roblox.com/v1/usernames/users\', {
        method: \'POST\',
        headers: { \'Content-Type\': \'application/json\' },
        body: JSON.stringify({ usernames: [name], excludeBannedUsers: false })
      });
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        const user = data.data[0];
        const embed = new EmbedBuilder().setColor(0x00FF00).setTitle(\'Username Found - TAKEN\').setDescription(`**Username:** ${user.name}\n**Display:** ${user.displayName}\n**User ID:** ${user.id}\n**Profile:** https://www.roblox.com/users/${user.id}/profile`).setThumbnail(`https://www.roblox.com/headshot/150x150/user/${user.id}`);
        return interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder().setColor(0x57F287).setTitle(\'Username AVAILABLE & Valid\').setDescription(`**${name}** is available to claim!`);
        return interaction.editReply({ embeds: [embed] });
      }
    } catch (e) {
      return interaction.editReply(\'Error checking username. Try again.\');
    }
  }

  if (interaction.commandName === \'gpscan\') {
    await interaction.deferReply();
    const name = interaction.options.getString(\'name\');
    try {
      const userRes = await fetch(\'https://users.roblox.com/v1/usernames/users\', { method: \'POST\', headers: { \'Content-Type\': \'application/json\' }, body: JSON.stringify({ usernames: [name] }) });
      const userData = await userRes.json();
      if (!userData.data || userData.data.length === 0) return interaction.editReply(`User \`${name}\` not found.`);
      const userId = userData.data[0].id;
      const gamesRes = await fetch(`https://games.roblox.com/v2/users/${userId}/games?sortOrder=Asc&limit=50`);
      const gamesData = await gamesRes.json();
      if (!gamesData.data || gamesData.data.length === 0) return interaction.editReply(`\`${name}\` has no public games.`);
      let totalGPs = 0;
      let description = \'\';
      for (let game of gamesData.data.slice(0, 5)) {
        const gpRes = await fetch(`https://games.roblox.com/v1/games/${game.id}/game-passes?limit=100&sortOrder=Asc`);
        const gpData = await gpRes.json();
        if (gpData.data && gpData.data.length > 0) {
          totalGPs += gpData.data.length;
          for (let gp of gpData.data.slice(0, 3)) {
            description += `**${gp.name}** - ${gp.price ? gp.price + \' R$\' : \'Free\'} [Link](https://www.roblox.com/game-pass/${gp.id})\n`;
          }
        }
      }
      const embed = new EmbedBuilder().setColor(0x0099FF).setTitle(`Gamepass Scan for ${name}`).setDescription(description || \'No gamepasses found in recent games.\').addFields({ name: \'User ID\', value: `${userId}`, inline: true }, { name: \'Total GPs Found\', value: `${totalGPs}`, inline: true }).setFooter({ text: \'Scanned first 5 games\' });
      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      return interaction.editReply(\'Error scanning gamepasses. Try again in 1 min.\');
    }
  }

  if (interaction.commandName === \'deal\') {
    const user = interaction.options.getUser(\'user\');
    if (user.id === interaction.user.id) return interaction.reply({ content: \'You cannot create a deal with yourself.\', ephemeral: true });
    pendingVouches.set(interaction.user.id, { with: user.id, time: Date.now() });
    pendingVouches.set(user.id, { with: interaction.user.id, time: Date.now() });
    const embed = new EmbedBuilder().setColor(0xFFA500).setTitle(\'Deal Started\').setDescription(`${interaction.user} and ${user} - Please do \`/vouch\` after transaction!\n\nBot will auto-tag you if you don\'t vouch within 1 hour.`);
    interaction.reply({ content: `${user}`, embeds: [embed] });
    setTimeout(async () => {
      if (pendingVouches.has(interaction.user.id)) {
        interaction.channel.send(`Reminder: ${interaction.user} & ${user} - You have not vouched yet! Please use \`/vouch\` to avoid being labeled as **UNVOUCHED**`);
        try {
          const guild = interaction.guild;
          let role = guild.roles.cache.find(r => r.name === \'Unvouched\');
          if (!role) role = await guild.roles.create({ name: \'Unvouched\', color: 0xFF0000, reason: \'Auto vouch system\' });
          const member1 = await guild.members.fetch(interaction.user.id).catch(()=>null);
          const member2 = await guild.members.fetch(user.id).catch(()=>null);
          if(member1) await member1.roles.add(role).catch(()=>{});
          if(member2) await member2.roles.add(role).catch(()=>{});
        } catch {}
      }
    }, 60 * 60 * 1000);
  }

  if (interaction.commandName === \'vouch\') {
    const user = interaction.options.getUser(\'user\');
    const proof = interaction.options.getString(\'proof\') || \'No proof\';
    pendingVouches.delete(interaction.user.id);
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const role = interaction.guild.roles.cache.find(r => r.name === \'Unvouched\');
      if (role && member.roles.cache.has(role.id)) await member.roles.remove(role);
    } catch {}
    const embed = new EmbedBuilder().setColor(0x57F287).setTitle(\'Vouch Recorded\').setDescription(`${interaction.user} vouched for ${user}\n**Proof:** ${proof}`);
    interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === \'pending\') {
    if (pendingVouches.size === 0) return interaction.reply(\'No pending vouches. All clear!\');
    let desc = \'\';
    for (let [userId, data] of pendingVouches) {
      const mins = Math.floor((Date.now() - data.time) / 60000);
      desc += `<@${userId}> -> <@${data.with}> - ${mins}m ago\n`;
    }
    const embed = new EmbedBuilder().setColor(0xED4245).setTitle(\'Pending Vouches (Not Yet Vouched)\').setDescription(desc);
    interaction.reply({ embeds: [embed] });
  }
});

client.login(TOKEN);
