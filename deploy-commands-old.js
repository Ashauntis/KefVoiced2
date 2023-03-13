const { TODO } = require("discord.js");
require('dotenv').config();
const clientId = process.env.clientId;
const guildId = process.env.guildId;
const token = process.env.token;

const commands = [
	new SlashCommandBuilder().setName('join').setDescription('Join\'s your current voice channel.'),
	new SlashCommandBuilder().setName('leave').setDescription('Leaves voice chat'),
	new SlashCommandBuilder().setName('private').setDescription('Allows DMs sent directly to KefVoiced to be read aloud in this channel'),
	new SlashCommandBuilder().setName('skip').setDescription('Skip the current audio clip being read'),
	new SlashCommandBuilder().setName('help').setDescription('Need some help?'),
	new SlashCommandBuilder().setName('setlog').setDescription('Designate a channel for logs from KefVoiced.'),
	new SlashCommandBuilder().setName('listvoices').setDescription('Lists the voices available for use'),
	new SlashCommandBuilder().setName('setvoice').setDescription('Set your personal voice option. Eg: /setvoice Salli').addStringOption(option => option.setName('input')
	.setDescription('What voice would you like to use?')
	.setRequired(true)),
	new SlashCommandBuilder().setName('soundboard').setDescription('Send a list of prerecorded sounds to your DMs'),
	new SlashCommandBuilder().setName('chat').setDescription('Ask ChatGPT a question')]
	.map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(token);

rest.put(Routes.applicationCommands(clientId), { body: commands })
	.then(() => console.log('Successfully registered application commands.'))
	.catch(console.error);