require('dotenv').config();
const axios = require('axios');
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder
} = require('discord.js');

// Create a new Discord client with explicit intents and partials.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// In-memory session stores for interactive selections.
const movieSessions = new Map();
const tvSessions = new Map();
const bookSessions = new Map();

// Register slash commands.
const commands = [
  new SlashCommandBuilder()
    .setName('movie')
    .setDescription('Search for a movie and add it via Radarr.')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('The name of the movie to search for.')
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('tv')
    .setDescription('Search for a TV show and add it via Sonarr.')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('The name of the TV show to search for.')
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('book')
    .setDescription('Search for a book and add it via Readarr.')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('The name of the book to search for.')
        .setRequired(true)
    )
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
})();

// Helper function: Build an embed for an item.
const buildEmbed = (item, index, type = 'Movie') => {
  // For books, the year might not be provided so we only display the title.
  let titleText = `${index + 1}. ${item.title}`;
  if (type !== 'Book' && item.year) {
    titleText += ` (${item.year})`;
  }
  const description = item.overview ? item.overview.slice(0, 400) : 'No overview available.';
  const poster = item.images && Array.isArray(item.images)
    ? item.images.find(img => img.coverType === 'poster')?.remoteUrl
    : null;
  return new EmbedBuilder()
    .setTitle(titleText)
    .setDescription(description)
    .setImage(poster)
    .setFooter({ text: `Select by clicking the button below. (${type} search)` });
};

// Helper function: Call Radarr to add a movie.
const addMovieToRadarr = async movie => {
  return axios.post(`${process.env.RADARR_URL}/movie`, {
    title: movie.title,
    qualityProfileId: 1,
    titleSlug: movie.titleSlug,
    images: movie.images,
    tmdbId: movie.tmdbId,
    year: movie.year,
    monitored: true,
    rootFolderPath: '/movies',
    addOptions: { searchForMovie: true }
  }, {
    headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
  });
};

// Helper function: Call Sonarr to add a TV show.
const addTvShowToSonarr = async show => {
  return axios.post(`${process.env.SONARR_URL}/series`, {
    title: show.title,
    qualityProfileId: 1,
    languageProfileId: 1,
    titleSlug: show.titleSlug || show.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    images: show.images,
    tvdbId: show.tvdbId,
    year: show.year,
    monitored: true,
    rootFolderPath: '/tv',
    seriesType: "standard",
    seasonFolder: true,
    seasons: show.seasons 
      ? show.seasons.filter(s => s.seasonNumber > 0).map(s => ({
          seasonNumber: s.seasonNumber,
          monitored: true
        }))
      : [],
    addOptions: { searchForMissingEpisodes: true }
  }, {
    headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
  });
};

// Helper function: Call Readarr to add a book.
// IMPORTANT: Make sure that qualityProfileId is a valid number for your Readarr setup.
// You can define READARR_BOOK_QUALITY_PROFILE_ID in your .env file (for example, 1).
const addBookToReadarr = async book => {
  return axios.post(`${process.env.READARR_URL}/book`, {
    title: book.title,
    qualityProfileId: Number(process.env.READARR_BOOK_QUALITY_PROFILE_ID) || 1,
    titleSlug: book.titleSlug,
    images: book.images || [],
    monitored: true,
    rootFolderPath: process.env.READARR_BOOK_PATH || '/books',
    addOptions: { searchForBook: true }
  }, {
    headers: { 'X-Api-Key': process.env.READARR_API_KEY }
  });
};

// When the bot is ready.
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Handle interactions from slash commands and buttons.
client.on('interactionCreate', async interaction => {
  try {
    // Slash command handling.
    if (interaction.isChatInputCommand()) {
      const query = interaction.options.getString('query');
      // MOVIE COMMAND
      if (interaction.commandName === 'movie') {
        await interaction.deferReply({ flags: 64 });
        const { data: results } = await axios.get(`${process.env.RADARR_URL}/movie/lookup`, {
          params: { term: query },
          headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
        });
        const movies = results.slice(0, 3);
        if (movies.length === 0) return interaction.editReply('❌ No movie results found.');
        const buttons = movies.map((movie, i) => new ButtonBuilder()
          .setCustomId(`movie_select:${interaction.id}:${i}`)
          .setLabel(`${i + 1}`)
          .setStyle('Primary'));
        movieSessions.set(interaction.id, { movies, userId: interaction.user.id });
        const embeds = movies.map((movie, i) => buildEmbed(movie, i, 'Movie'));
        const row = new ActionRowBuilder().addComponents(buttons);
        await interaction.editReply({ embeds, components: [row] });
      }
      // TV COMMAND
      else if (interaction.commandName === 'tv') {
        await interaction.deferReply({ flags: 64 });
        const { data: results } = await axios.get(`${process.env.SONARR_URL}/series/lookup`, {
          params: { term: query },
          headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
        });
        const shows = results.slice(0, 3);
        if (shows.length === 0) return interaction.editReply('❌ No TV show results found.');
        const buttons = shows.map((show, i) => new ButtonBuilder()
          .setCustomId(`tv_select:${interaction.id}:${i}`)
          .setLabel(`${i + 1}`)
          .setStyle('Primary'));
        tvSessions.set(interaction.id, { shows, userId: interaction.user.id });
        const embeds = shows.map((show, i) => buildEmbed(show, i, 'TV Show'));
        const row = new ActionRowBuilder().addComponents(buttons);
        await interaction.editReply({ embeds, components: [row] });
      }
      // BOOK COMMAND
      else if (interaction.commandName === 'book') {
        await interaction.deferReply({ flags: 64 });
        const { data: results } = await axios.get(`${process.env.READARR_URL}/book/lookup`, {
          params: { term: query },
          headers: { 'X-Api-Key': process.env.READARR_API_KEY }
        });
        console.log('Book lookup results:', results);
        const books = results.slice(0, 3);
        if (books.length === 0) return interaction.editReply('❌ No book results found.');
        const buttons = books.map((book, i) => new ButtonBuilder()
          .setCustomId(`book_select:${interaction.id}:${i}`)
          .setLabel(`${i + 1}`)
          .setStyle('Primary'));
        bookSessions.set(interaction.id, { books, userId: interaction.user.id });
        const embeds = books.map((book, i) => buildEmbed(book, i, 'Book'));
        const row = new ActionRowBuilder().addComponents(buttons);
        await interaction.editReply({ embeds, components: [row] });
      }
    }
    // Button interaction handling.
    else if (interaction.isButton()) {
      const [action, sessionId, indexStr] = interaction.customId.split(':');
      const index = parseInt(indexStr, 10);
      let session, selectedItem, confirmIdPrefix, cancelIdPrefix, typeLabel;

      // Validate the user.
      if (
        interaction.user.id !== (movieSessions.get(sessionId)?.userId ||
                                  tvSessions.get(sessionId)?.userId ||
                                  bookSessions.get(sessionId)?.userId)
      ) {
        return interaction.reply({ content: 'This selection is not for you.', flags: 64 });
      }

      // Retrieve session data based on the action.
      if (action === 'movie_select') {
        session = movieSessions.get(sessionId);
        if (!session) return interaction.reply({ content: 'Session expired.', flags: 64 });
        selectedItem = session.movies[index];
        confirmIdPrefix = 'movie_confirm';
        cancelIdPrefix = 'movie_cancel';
        typeLabel = `${selectedItem.title} (${selectedItem.year || 'N/A'})`;
      }
      else if (action === 'tv_select') {
        session = tvSessions.get(sessionId);
        if (!session) return interaction.reply({ content: 'Session expired.', flags: 64 });
        selectedItem = session.shows[index];
        confirmIdPrefix = 'tv_confirm';
        cancelIdPrefix = 'tv_cancel';
        typeLabel = `${selectedItem.title} (${selectedItem.year || 'N/A'})`;
      }
      else if (action === 'book_select') {
        session = bookSessions.get(sessionId);
        if (!session) return interaction.reply({ content: 'Session expired.', flags: 64 });
        selectedItem = session.books[index];
        confirmIdPrefix = 'book_confirm';
        cancelIdPrefix = 'book_cancel';
        typeLabel = `${selectedItem.title}`;
      }

      // If the user is selecting an option, show a confirmation prompt.
      if (action.endsWith('select')) {
        const confirmButton = new ButtonBuilder()
          .setCustomId(`${confirmIdPrefix}:${sessionId}:${index}`)
          .setLabel('Confirm')
          .setStyle('Success');
        const cancelButton = new ButtonBuilder()
          .setCustomId(`${cancelIdPrefix}:${sessionId}:${index}`)
          .setLabel('Cancel')
          .setStyle('Danger');
        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle(`You selected: ${typeLabel}`)
              .setDescription(selectedItem.overview ? selectedItem.overview.slice(0, 400) : 'No overview available.')
          ],
          components: [row]
        });
      }
      // Confirmation actions.
      else if (action.endsWith('confirm')) {
        // Re-retrieve the session and selected item in case it's not set in this interaction.
        if (action.startsWith('movie')) {
          session = movieSessions.get(sessionId);
          if (!session) return interaction.followUp({ content: 'Session expired.', flags: 64 });
          selectedItem = session.movies[index];
        } else if (action.startsWith('tv')) {
          session = tvSessions.get(sessionId);
          if (!session) return interaction.followUp({ content: 'Session expired.', flags: 64 });
          selectedItem = session.shows[index];
        } else if (action.startsWith('book')) {
          session = bookSessions.get(sessionId);
          if (!session) return interaction.followUp({ content: 'Session expired.', flags: 64 });
          selectedItem = session.books[index];
        }
        await interaction.update({ components: [] });
        try {
          if (action.startsWith('movie')) {
            await addMovieToRadarr(selectedItem);
            await interaction.followUp({ content: `✅ Movie **${selectedItem.title} (${selectedItem.year || 'N/A'})** added to Radarr and search started!`, flags: 64 });
            movieSessions.delete(sessionId);
          }
          else if (action.startsWith('tv')) {
            await addTvShowToSonarr(selectedItem);
            await interaction.followUp({ content: `✅ TV show **${selectedItem.title} (${selectedItem.year || 'N/A'})** added to Sonarr and search started!`, flags: 64 });
            tvSessions.delete(sessionId);
          }
          else if (action.startsWith('book')) {
            await addBookToReadarr(selectedItem);
            await interaction.followUp({ content: `✅ Book **${selectedItem.title}** added to Readarr and search started!`, flags: 64 });
            bookSessions.delete(sessionId);
          }
        } catch (err) {
          console.error('Error adding item:', err.response?.data || err.message);
          await interaction.followUp({ content: '❌ Error adding item.', flags: 64 });
        }
      }
      // Cancel actions.
      else if (action.endsWith('cancel')) {
        if (action.startsWith('movie')) movieSessions.delete(sessionId);
        else if (action.startsWith('tv')) tvSessions.delete(sessionId);
        else if (action.startsWith('book')) bookSessions.delete(sessionId);
        await interaction.update({ content: '🚫 Selection cancelled.', embeds: [], components: [] });
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'An error occurred. Please try again later.', flags: 64 });
    } else {
      await interaction.reply({ content: 'An error occurred. Please try again later.', flags: 64 });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
