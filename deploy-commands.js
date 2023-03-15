const { REST, Routes } = require('discord.js');
require('dotenv').config();
const clientId = process.env.clientId
const guildId = process.env.guildId
const token = process.env.token
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
// Grab all the command files from the commands directory you created earlier
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// An array to make it easy to delete more than one command at once.
const deletionList = [];

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
	console.log(file);
	const command = require(`./commands/${file}`);
	console.log(command.data);
	commands.push(command.data.toJSON());
}

// Construct and prepare an instance of the REST module
console.log(token);
const rest = new REST({ version: '10' }).setToken(token);
console.log(rest);

// and deploy your commands!
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);

		console.log(`Starting deletion of the ${deletionList} commands in the deletion list`)

		deletionList.forEach((commandId) => rest.delete(Routes.applicationCommand(clientId, commandId)))
		
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();