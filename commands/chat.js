const { SlashCommandBuilder } = require('discord.js');
// import openAI and it's configuration
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);
let aiConversation = [
  {"role": "system", "content": "You are a helpful assistant."},
  ];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("chat")
    .setDescription("Starts a new conversation with ChatGPT, or continues a previous one")
    .addStringOption(option => option.setName('input')
      .setDescription('What would you like to say?')
      .setRequired(true)),
  async execute(interaction) {
    // extract the input from the interaction
    let aiPrompt = interaction.options.getString("input").capitalize();

    // add the input to the conversation record
    aiConversation.push({ role: "user", content: aiPrompt });
    interaction.reply({
      content: `${interaction.user} said to ChatGPT: ${aiPrompt} .`,
      ephemeral: false,
    });

    // API call to openAI with full conversation log for a response
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: aiConversation,
      // max_tokens: 7,
    });

    // add chatgpts response to the conversation record
    aiConversation.push({
      role: "assistant",
      content: response.data.choices[0].message.content,
    });

    // send the response to the user
    interaction.followUp({
      content: `ChatGPT responded with ${response.data.choices[0].message.content}`,
      ephemeral: false,
    });
  },
};
