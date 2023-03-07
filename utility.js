const soundboard = require('./soundboard.js');
const sbKey = soundboard.soundboardOptions;

const {Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  // organization: "Personal",
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

// let openAIconfig = {
//   method: "POST", 
//   "model": "gpt-3.5-turbo",
//   "prompt": null,

// }

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
} = require('@discordjs/voice');
const aws = require('aws-sdk');
const fs = require('fs');
const { join } = require("path");

// data tracking
let reconnectionList = [];
let connectionMap = new Map();
// Define our connection class

class VoiceConnection {
  constructor() {
    this.player = createAudioPlayer();
    this.connection = null;
    this.queue = [];
    this.playing = false;
    this.lastSpeaker = null;
    this.whisper = false;

    this.player.on((AudioPlayerStatus.Idle || AudioPlayerStatus.Paused), () => {
      try {
        console.log(`Playback ended on guild ${this.connection.guildId}`)
        this.playing = false;
        if (this.queue.length != 0) {
          if (this.queue[0].soundboard === false) {
            fs.unlinkSync(this.queue[0].path);
          }
          this.queue.shift();
        }

      } catch (err) {
        console.log(err);
      }
    })
  }
}

// Utility functions

aws.config.getCredentials(function(err) {
  if (err) {
    console.log(err.stack);
  } else {
    console.log('Successfully logged into AWS');
  }
});

const dynamo = new aws.DynamoDB({
  apiVersion: '2012-08-10',
  region: 'us-east-1',
});

const polly = new aws.Polly({ apiVersion: '2016-06-10', region: 'us-east-1' });

function makeEmptyCacheEntry(userID) {
  return {
      [userID]: {
      },
  };
}

function makeDefaultSettings(userID) {
  return {
      global: {
        voice: "Joey",
        privateChannel: null,
      }
  };
}

async function load_document(id) {
  // set result_data to null to start
  let result_data = null;

  // specify the parameters for the getItem call
  const params = {
    TableName: "kef_voiced_settings",
    Key: {
      id: { S: id },
    },
  };

  console.log("Loading document with id: " + id);
  // get the document from Amazon DynamoDB
  await dynamo.getItem(params, function(err, data) {
      if (err) {
        console.log(err, err.stack);
      } else if (Object.keys(data).length == 0) {
        // console.log("No document found with id: " + id);
      } else {
        // console.dir(data);
        result_data = JSON.parse(data.Item.value.S);
      }
    })
    .promise();

  if (result_data == null) {
    // console.log(`Document not found: ${id}`);
  } else {
    console.log(`Successfully loaded document: ${id} `);
  }

  return result_data;
}

async function save_document(data_object, id) {
  // create a new document from a stringified object
  const value = JSON.stringify(data_object);

  // specify the parameters for the putItem call
  const params = {
    TableName: "kef_voiced_settings",
    Item: {
      id: { S: id },
      value: { S: value },
    },
  };

  // store the document in Amazon DynamoDB
  const r = await dynamo
    .putItem(params, function(err) {
      if (err) {
        console.log("Error", err, err.stack);
      } else {
        console.log(`Document added. ID: ${id}, Data:`);
        console.dir(data_object);
      }
    })
    .promise();

  return r;
}

const switchFn =
  (lookupObject, defaultCase = '_default') =>
  (expression) =>
  {
    console.log('in switch expression');
    (lookupObject[expression] || lookupObject[defaultCase])();
  }

async function joinVoice(connection, channel, ttsChannel ) {

  const newConnection = new VoiceConnection();
  // activeConnections.push(new VoiceConnection());
  // const i = activeConnections.length - 1;

  newConnection.connection = await joinVoiceChannel({
    channelId: connection.id,
    guildId: connection.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  newConnection.connection.on('stateChange', (old_state, new_state) => {
    console.log('Connection state change from', old_state.status, 'to', new_state.status);
    if (old_state.status === VoiceConnectionStatus.Ready && new_state.status === VoiceConnectionStatus.Connecting) {
      console.log("Bug Fix Executing");
      newConnection.connection.configureNetworking();
    }
  })

  newConnection.connection.subscribe(newConnection.player);

  newConnection.channelId = connection.id;
  newConnection.guildId = connection.guild.id;
  newConnection.soundboard = [];
  newConnection.ttsChannel = ttsChannel;

  connectionMap.set(connection.guild.id, newConnection);

};

async function reconnectVoice(client) {
  try {
    reconnectionList = await load_document('reconnection');

    // Guarantee reconnectionList is an array, otherwise revert it to an empty array
    if (!Array.isArray(reconnectionList)) {
      reconnectionList = [];
      return;
    }

    if (reconnectionList.length > 0) {
      reconnectionList.forEach(async (connection) => {
        const channel = client.channels.cache.get(connection.id);
        if (!channel) return console.error('The channel does not exist!');
        joinVoice(connection, channel, connection.ttsChannel);
      });
    }
  } catch (error) {
    console.error(error);
  }
}

function playQueue() {

  connectionMap.forEach((connection) => {
    if (connection.queue.length != 0 && !connection.playing) {
      // if the player is not playing, play the next audiofile
      try {
        console.log(`Attempting to play an Audio File from the queue for guild ${connection.guildId}`)
        // check if audio file exists
        if (fs.existsSync(connection.queue[0].path)) {
          connection.playing = true;
          connection.connection = getVoiceConnection(connection.queue[0].id);
          const audioClip = createAudioResource(
            fs.createReadStream(
              join(__dirname, connection.queue[0].path),
              {
                inputType: StreamType.OggOpus,
              }
            )
          );
          connection.player.play(audioClip);
        } else {
          throw new Error('File does not exist!');
        }
      } catch (e) {
        console.log('Error playing file');
        console.error(e);
      }
    } else {
      // console.log('queue is empty or currently playing');
      // console.log('player state = ' + connection.player._state.status + ', connection.playing=' + connection.playing);

    }
  });
}

function queueSoundboard(reaction, interaction, guildId) {
  const pathguide = sbKey[reaction.emoji.name];
  const activeConnection = connectionMap.get(guildId);

  if (!pathguide) {
    interaction.user.send({
      content: `${reaction.emoji.name} isn't a currently supported sound key.`,
    });
  } else {
    activeConnection.queue.push({
      id: interaction.guildId,
      path: "audio/soundboard/" + pathguide + ".mp3",
      message: pathguide,
      soundboard: true,
    });
    connectionMap.set(guildId, activeConnection);
  }
}


module.exports = {
    switchFn,
    joinVoice,
    reconnectVoice,
    makeEmptyCacheEntry,
    makeDefaultSettings,
    save_document,
    load_document,
    playQueue,
    queueSoundboard,
    connectionMap,
    reconnectionList,
    polly,
    openai,
};