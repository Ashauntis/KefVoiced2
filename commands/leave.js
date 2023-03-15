const { SlashCommandBuilder } = require('discord.js');
const { connectionMap, reconnectionList, save_document } = require('../utility')

module.exports = {
    data: new SlashCommandBuilder()
      .setName('leave')
      .setDescription("Disconnects the bot from voice, and prevents it from reconnecting on bot restart."),
    async execute(interaction) {
        //Confirm there is an active connection on this guild
        let activeConnection = connectionMap.get(interaction.guildId);

        //Say goodbye to the user, cause we're polite
        if (activeConnection) {
            interaction.reply({
                content: "Goodbye!",
                ephemeral: false,
            });
            
            // Destroy the connection instance, and remove it from the connection map
            activeConnection.connection.destroy();
            connectionMap.delete(interaction.guildId);
    
            // Remove the data record from the reconnectionList in the database
            for (let i = 0; i < reconnectionList.length; i++) {
                if (reconnectionList[i].guild.id === interaction.member.guild.id) {
                    reconnectionList.splice(i, 1);
                    save_document(reconnectionList, "reconnection");
                    break;
                }
            }
        
        // Can't disconnect if you're not connected in the first place... 
        } else {
            interaction.reply({
                content: "Not currently connected to voice",
                ephemeral: true,
            });
        }
    }
};