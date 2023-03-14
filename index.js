// Copyright (C) 2022 by Kayla Grey + Jared De Blander

// Environment Variables
require("dotenv").config();

// Dependencies
const fs = require("fs");
const { join } = require("path");
const { Client, Collection, GatewayIntentBits, Partials, MessageEmbed, MessageFlags } = require("discord.js");
const {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
} = require("@discordjs/voice");

// Load any additional JS files
const {
  reconnectionList,
  connectionMap,
  cachedUserMap,
  polly,
  openai,
  reconnectVoice,
  playQueue,
  joinVoice,
  save_document,
  load_document,
  makeDefaultSettings,
  queueSoundboard,
  switchFn,
} = require("./utility.js");
const soundboard = require("./soundboard.js");

// Extend string class to include a capitalize method
String.prototype.capitalize = function () {
  return this.charAt(0).toUpperCase() + this.slice(1);
};

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.Guilds,
  ],

  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
  ],
});

// load interaction command files
client.commands = new Collection();
const commandsPath = join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = require(filePath);
  // set a new item in the Collection with the key as the command name and the value as the exported module
  if('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command); 
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// data tracking
const sbKey = soundboard.soundboardOptions;
let aiConversation = [
  {"role": "system", "content": "You are a helpful assistant."},
  ];

client.once("ready", () => {

  // once the client has connected reconnect to the voice channels
  // via our utility function reconnectVoice
  // ### CURRENTLY DISABLED DUE TO DISCORD.JS BUG WORKAROUND
  // console.log('Reconnecting to voice channels');
  // reconnectVoice(client);
});


// console.log(process.env.token);
client.login(process.env.token);
setInterval(playQueue, 100);

// listen for slash commands from the discord client

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // useful data renames
  const userId = interaction.member.id;
  const guildId = interaction.member.guild.id;

  // determine if/where a matching active connection is stored
  let activeConnection = connectionMap.get(interaction.guildId);

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found`);
    interaction.reply({
      content: 'This interaction isn\'t currently supported. For more information contact the developer on discord @Kayla#9162',
      ephemeral: true,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }

  // function key for each slash command
  slashCommands = {
    join: () => {
      if (activeConnection) {
        activeConnection.connection.destroy();
        connectionMap.delete(interaction.guildId);

        for (let i = 0; i < reconnectionList.length; i++) {
          if (reconnectionList[i].guild.id === interaction.member.guild.id) {
            reconnectionList.splice(i, 1);
            break;
          }
        }
      }

      const voiceChannel = interaction.member?.voice.channel;
      joinVoice(voiceChannel, voiceChannel, interaction.channelId);

      reconnectionList.push({
        id: voiceChannel.id,
        guild: {
          id: voiceChannel.guild.id,
        },
        ttsChannel: interaction.channelId,
      });

      save_document(reconnectionList, "reconnection");

      interaction.reply({
        content: "Kef Voiced has joined the channel",
        ephemeral: false,
      });
    },

    leave: () => {
      if (activeConnection) {
        interaction.reply({
          content: "Goodbye!",
          ephemeral: false,
        });

        activeConnection.connection.destroy();
        connectionMap.delete(interaction.guildId);

        for (let i = 0; i < reconnectionList.length; i++) {
          if (reconnectionList[i].guild.id === interaction.member.guild.id) {
            reconnectionList.splice(i, 1);
            save_document(reconnectionList, "reconnection");
            break;
          }
        }

      } else {
        interaction.reply({
          content: "Not currently connected to voice",
          ephemeral: true,
        });
      }
    },

    listvoices: () => {
      polly.describeVoices(
        { LanguageCode: "en-US" },
        function (err, data) {
          if (err) {
            console.log(err, err.stack);
          } else {
            response = "The currently supported voices include ";

            let voicesList = [];
            data.Voices.forEach((voice) => {
              if(voice.Name === 'Kevin') return;
              voicesList.push(`${voice.Name} (${voice.Gender})`);
            })
            let lastVoice = voicesList.pop();
            response += voicesList.join(', ') + " and " + lastVoice + ".";

            interaction.reply({ content: response, ephemeral: true });
          }
        }
      );
    },

    setvoice: async () => {
      let choice = interaction.options.getString('input').capitalize();

      //add the prompt from the slash command to the conversation record
      aiConversation.push({"role": "user", "content": choice});
      interaction.reply({
        content: `${interaction.user} said to ChatGPT: ${choice} .`,
        ephemeral: false,
      })

      // temporary home for our openAI testing
      const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: aiConversation,
        // temperature: 0,
        // max_tokens: 7,
      });

      //add chatgpts response to the conversation record
      aiConversation.push({"role": "assistant", "content": response.data.choices[0].message.content})

      interaction.followUp({
        content: `ChatGPT responded with ${response.data.choices[0].message.content}`,
        ephemeral: false,
      })

      // polly.describeVoices( { LanguageCode: 'en-US'}, async function (err, data) {
      //   if (err) {
      //     console.log(err, err.stack);
      //   } else {
      //     let validChoice =  data.Voices.find(voice => voice.Name === choice);
      //     if (choice === 'Kevin') validChoice = false;

      //     if (validChoice) {
      //       let query = await load_document(userId);

      //       if (query) {
      //         query.global.voice = choice;
      //         cachedUserMap.set(userId, query);
      //         save_document(query, userId);
      //       } else {
      //         let newSetting = makeDefaultSettings(userId);
      //         newSetting.global.voice = choice;
      //         cachedUserMap.set(userId, newSetting);
      //         save_document(newSetting, userId);
      //       }
      //       interaction.reply({
      //         content: `Setting your voice to ${choice}`,
      //         ephemeral: true
      //       })

      //     } else interaction.reply({
      //       content: `${choice} is not a supported voice. Use /listvoices to see a full list of supported voices.`,
      //       ephemeral: true
      //     })
      //   }
      // })
    },

    skip: () => {
      try {
        console.log(`Skipping current audio file on guild ${guildId}`);
        activeConnection.playing = false;

        // remove the current audio file from the queue

        if (activeConnection.queue.length != 0) {
          if (activeConnection.queue[0].soundboard === false) {
            fs.unlinkSync(activeConnection.queue[0].path);
            activeConnection.queue.shift();
          }
        }

        // if the queue is now empty then add a moment of silence to the queue to halt the prior broadcast. if the queue is NOT empty then they will naturally disrupt playback of the audio file being played.

        if (activeConnection.queue.length === 0) {
          activeConnection.queue.push({
            id: guildId,
            path: 'audio/silence.ogg',
            message: null,
            soundboard: true,
          });
        }

        interaction.reply({
          content: `Skipping the current audio clip`,
          ephemeral: true
        })

      } catch (err) {
        console.log(err);
      }
    },

    soundboard: async () => {
      console.log('Soundboard command fired');
      if (!activeConnection) {
        interaction.reply({
          content: "Connect the bot to voice and try again!",
          ephemeral: true,
        });
        return;
      }

      if (!interaction.member?.voice.channel) {
        interaction.reply({
          content: 'Join voice and try again!',
          ephemeral: true,
        });
        return;
      }

      // filter so bot reactions aren't collected
      let filter = (reaction, user) => {
        return user.id != "941537585170382928" && user.id != "941542196337844245" && user.id != "996208482455928913";
      };

      // define data tracking
      let sbReactCounter = 0;

      let sbMessages = [];
      let collectorReactions = [];

      // define soundboard embedded message
      const sb = new MessageEmbed()
        .setTitle("Kef Voiced Soundboard")
        .setDescription(
          "The following emoji's will play the associated audio clip in the channel you performed the /soundboard command",
        )
        .addFields({
          name: "Click here for the soundboard key",
          value:
            "[Click me!](https://docs.google.com/spreadsheets/d/1eYwxOGZScgQpLbsAtN5fP0WfLq9VT6jnxzj6-p5QPqE/edit#gid=0)",
          inline: true,
        });

      await interaction.user.send({ embeds: [sb] }).then(() => interaction.reply({
        content: 'Sending you the soundboard via Direct Message',
        ephemeral: true
        })
        ).catch(() => interaction.reply({
        content: 'Something went wrong :(',
        ephemeral: true
        })
        )

      for (let key in sbKey) {
        if (sbReactCounter == 0) {
          sbMessages.push(
            await interaction.user.send({ content: "-", fetchReply: true })
          );
          collectorReactions.push(
            sbMessages[sbMessages.length - 1].createReactionCollector({
              filter,
              time: 86_400_000,
            })
          );
          collectorReactions[collectorReactions.length - 1].on(
            "collect",
            (reaction, user) => {
              queueSoundboard(reaction, interaction, guildId);
            }
          );
        }

        await sbMessages[sbMessages.length - 1].react(key);

        sbReactCounter++;

        if (sbReactCounter == 19) {
          sbReactCounter = 0;
        }
      }
    },

    private: async() => {
      let cached = false;
      // query the database to get their full setting structure
      if (cachedUserMap.has(userId)) {
        cached = true;
        let setting = cachedUserMap.get(userId);
        setting.global.privateServer = guildId;
        await save_document(setting, userId);
      }
      if (cached === false) {
        const query = await load_document(userId);
        if (query) {
          query.global.privateServer = guildId;
          cachedUserMap.set(userId, query);
          await save_document(query, userId);
        } else {
          const newSetting = makeDefaultSettings(userId);
          newSetting.global.privateServer = guildId;
          cachedUserMap.set(userId, newSetting);
          await save_document(query, userId);
        }
      }
      interaction.reply({
        content: 'Successfully set your current Discord server to your user ID for private TTS messages. You can now direct message KefVoiced and the message will be read aloud to a connected bot in the current server. This setting is persistent until you use /private again in another channel.',
        ephemeral: true,
      })
    },

  };
  
});

// Listen for a message in a channel linked to an active voice connection
client.on("messageCreate", async (message) => {
  console.log('Message create fired');
  console.log(message);
  // Check to see if a message was ephemeral - skip if true
  if (message.flags.has(MessageFlags.Ephemeral)) {
    return;
  }

  // useful data
  let userId = message.author.id;
  let guildId = message.channel.guild ? message.channel.guild.id : null;
  let voice = "Joey"; //default value to be replaced by cached data if available
  let prServ = null;

  // mock variables for a private tts message via DM // TODO add a failsafe to confirm user dming bot is also in the channel it's reading from
  let privateMessage = message.member ? false : true; // Indicator that the message was recieved via DM rather than a guild
  if (privateMessage) {
    // check for a cached private log channel
    if (cachedUserMap.has(userId)) {
      prServ = cachedUserMap.get(userId).global.privateServer;
    } else {
      // query the database if the user isn't already cached
      const query = await load_document(userId);
      if (query) {
        cachedUserMap.set(userId, query);
        prServ = cachedUserMap.get(userId).global.privateServer;
      } else {
        // create a default setting for an uncached user, privateServer will start as null
        cachedUserMap.set(userId, makeDefaultSettings(userId));
      }
    }

    if (!prServ) {
      // message.author.send({
      //   content: 'You don\'t currently have a server assigned to use private TTS messaging. Use /private while connected to a voice channel to designate which server your messages will be read to. This setting will be set to your account until you use the command again in a different server.',
      //   ephemeral: true
      // })
    } else {
      guildId = prServ;
    }

  }

  //lets not read any messages the bot is sending to users via dm...
  if (prServ && !(message.author.id != '996208482455928913' && message.author.id != '941537585170382928')) return;

  //determine if there is an active connection
  const activeConnection = connectionMap.get(guildId);

  // No polly request if the bot is not in server, or if there isnt' a matching ttschannel or private DM setting
  if (!activeConnection || !(activeConnection.ttsChannel === message.channelId || prServ)) {
    return;
  }

  // Check to see if user has a cached voice setting
  if (cachedUserMap.has(userId)) {
    voice = cachedUserMap.get(userId).global.voice;
  } else {
    const query = await load_document(userId);
    if (query) {
      cachedUserMap.set(userId, query);
      voice = cachedUserMap.get(userId).global.voice;
    } else {
      cachedUserMap.set(userId, makeDefaultSettings(userId));
    }
  }

  // filter and modify message before it's sent to Polly //

  // define who spoke last
  let author = null;
  if (prServ) {
    author = message.author.username;
    if (author === 'Frahbrah') author = 'Kef';
  } else author = message.member.nickname ? message.member.nickname : message.author.username;

  console.log(`Message Content start value: ${message.content}`)

  // if last speaker matches current speaker, no need to inform who's speaking again, unless the channel is private
  if (prServ && (activeConnection.lastSpeaker !== author || !activeConnection.whisper)) {
    message.content = author + ' whispered ' + message.content;
    console.log(9);
    console.log(message.content);
  } else if (activeConnection.lastSpeaker !== author || ( activeConnection.whisper && !prServ)) {
    message.content = author + " said " + message.content;
    console.log(8);
    console.log(message.content);
  }

  activeConnection.lastSpeaker = author;

  if (prServ) {
    activeConnection.whisper = true;
  } else {
    activeConnection.whisper = false;
  }


  // filter message for links // TODO regex the link so any additional text is still read by polly
  if (message.content.search("http") != -1) {
    message.content = author + " sent a link.";
    console.log(7);
    console.log(message.content);
  }

  // filter discord tags to read user name instead of full tag
  message.mentions.users.forEach((value, key) => {
    const needle = `<@!${key}>`;
    const needle_alt = `<@${key}>`;
    const replace = ` at ${value.username} `;
    message.content = message.content.replaceAll(needle, replace);
    message.content = message.content.replaceAll(needle_alt, replace);
    console.log(6);
    console.log(message.content);
  });

  // filter role tags to read role name instead of ID
  message.mentions.roles.forEach((value, key) => {
    const needle = `<@&${key}>`
    const replace = ` at ${value.name}`
    message.content = message.content.replaceAll(needle, replace);
    console.log(5);
    console.log(message.content);
  })

  //TODO filter channel names to read the actual channel name rather than ID

  // filter custom emojis to emoji name
  if (message.content.match(/<:[A-Za-z0-9_]{1,64}:\d{1,64}>/g)) {
    const custemoji = message.content.match(/<:[A-Za-z0-9]{1,64}:\d{1,64}>/g);
    custemoji.forEach((emoji) => {
      const emojiname = emoji.split(":");
      message.content = message.content.replaceAll(emoji, ` ${emojiname[1]} `);
      console.log(4);
    console.log(message.content);
    });
  }

  // filter animated emojis to emoji name with fpstag
  if (message.content.match(/<a:[0-9]{1,3}fps_[A-Za-z0-9_]{1,64}:\d{1,64}>/g)) {
    const custemoji = message.content.match(
      /<a:[0-9]{1,3}fps_[A-Za-z0-9_]{1,64}:\d{1,64}>/g
    );
    custemoji.forEach((emoji) => {
      let emojiname = emoji.split(":");
      emojiname = emojiname[1].slice(emojiname[1].indexOf("_") + 1);
      message.content = message.content.replaceAll(emoji, ` ${emojiname} `);
      console.log(4);
      console.log(message.content);
    });
  }

  // filter animated emojis to emoji name without fpstag
  if (message.content.match(/<a:[A-Za-z0-9_]{1,64}:\d{1,64}>/g)) {
    const custemoji = message.content.match(/<a:[A-Za-z0-9_]{1,64}:\d{1,64}>/g);
    console.log(3);
    console.log(message.content);
    custemoji.forEach((emoji) => {
      let emojiname = emoji.split(":");
      message.content = message.content.replaceAll(emoji, ` ${emojiname[1]} `);
      console.log(2);
    console.log(message.content);
    });
  }

  // filter for messages that only contain an image
  if (
    message.content === "" &&
    message.attachments.first()?.contentType.includes("image/")
  ) {
    message.content = author + " sent an image.";
    console.log(1);
    console.log(message.content);
  }

  // send the message to the Polly API
  const params = {
    OutputFormat: "ogg_vorbis",
    Text: message.content,
    VoiceId: voice,
    SampleRate: "24000",
  };

  console.log(`Attempting to send API request to Amazon Polly`);
  polly.synthesizeSpeech(params, function (err, data) {
    if (err) {
      console.log(err);
    } else {
      console.log(`File recieved, adding to queue`);
      console.log(`${message.content} sent to Amazon Polly`)
      const fileLoc = "audio/" + message.id + ".ogg";
      fs.writeFile(fileLoc, data.AudioStream, (err) => {
        if (err) {
          console.log(err);
          return;
        } else {
          activeConnection.queue.push({
            id: message.guildId,
            path: fileLoc,
            message: message.content,
            soundboard: false,
          });
        }
      });
    }
  });

  connectionMap.set(guildId, activeConnection);
});
