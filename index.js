// Copyright (C) 2022 by Kayla Gray + Jared De Blander

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
  connectionMap,
  cachedUserMap,
  polly,
  reconnectVoice,
  playQueue,
  load_document,
  makeDefaultSettings,
} = require("./utility.js");

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

client.once("ready", () => {
  console.log('Ready!');
  // once the client has connected reconnect to the most recent voice connections
  console.log('Reconnecting to voice channels');
  reconnectVoice(client);
});

client.login(process.env.token);
setInterval(playQueue, 100);

// listen for slash commands from the discord client
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // establish the list of supported commands and exit function if it's not supported
  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found`);
    interaction.reply({
      content: 'This interaction isn\'t currently supported. For more information contact the developer on discord - @Kayla#9162',
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
});

// Listen for a message in a channel linked to an active voice connection
client.on("messageCreate", async (message) => {
  console.log('Message create fired');
  // console.log(message);

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

  // if last speaker matches current speaker, no need to inform who's speaking again, unless the channel is private
  if (prServ && (activeConnection.lastSpeaker !== author || !activeConnection.whisper)) {
    message.content = author + ' whispered ' + message.content;
  } else if (activeConnection.lastSpeaker !== author || ( activeConnection.whisper && !prServ)) {
    message.content = author + " said " + message.content;
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
  }

  // filter discord tags to read user name instead of full tag
  message.mentions.users.forEach((value, key) => {
    const needle = `<@!${key}>`;
    const needle_alt = `<@${key}>`;
    const replace = ` at ${value.username} `;
    message.content = message.content.replaceAll(needle, replace);
    message.content = message.content.replaceAll(needle_alt, replace);
  });

  // filter role tags to read role name instead of ID
  message.mentions.roles.forEach((value, key) => {
    const needle = `<@&${key}>`
    const replace = ` at ${value.name}`
    message.content = message.content.replaceAll(needle, replace);
  })

  //TODO filter channel names to read the actual channel name rather than ID

  // filter custom emojis to emoji name
  if (message.content.match(/<:[A-Za-z0-9_]{1,64}:\d{1,64}>/g)) {
    const custemoji = message.content.match(/<:[A-Za-z0-9]{1,64}:\d{1,64}>/g);
    custemoji.forEach((emoji) => {
      const emojiname = emoji.split(":");
      message.content = message.content.replaceAll(emoji, ` ${emojiname[1]} `);
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
    });
  }

  // filter animated emojis to emoji name without fpstag
  if (message.content.match(/<a:[A-Za-z0-9_]{1,64}:\d{1,64}>/g)) {
    const custemoji = message.content.match(/<a:[A-Za-z0-9_]{1,64}:\d{1,64}>/g);
    custemoji.forEach((emoji) => {
      let emojiname = emoji.split(":");
      message.content = message.content.replaceAll(emoji, ` ${emojiname[1]} `);
    });
  }

  // filter for messages that only contain an image
  if (
    message.content === "" &&
    message.attachments.first()?.contentType.includes("image/")
  ) {
    message.content = author + " sent an image.";
  }

  // send the message to the Polly API
  const params = {
    OutputFormat: "ogg_vorbis",
    Engine: 'neural',
    Text: message.content,
    VoiceId: voice,
    SampleRate: "24000",
  };

  polly.synthesizeSpeech(params, function (err, data) {
    if (err) {
      console.log(err);
    } else {
      console.log(`File recieved, adding to queue`);
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
