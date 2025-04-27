# 📚 Discord Media Request Bot

A Discord bot that lets users easily **search for Movies, TV Shows, and Books** and add them directly to your **Radarr**, **Sonarr**, and **Readarr** servers — right from Discord!

Built with:
- Node.js
- Discord.js v14
- Axios
- Docker + Docker Compose

---

## ✨ Features

- `/movie <name>` — Search and add a movie via **Radarr**
- `/tv <name>` — Search and add a TV show via **Sonarr**
- `/book <name>` — Search and add a book via **Readarr**
- Interactive buttons to confirm or cancel requests
- Clean slash command interface
- Full Docker container support
- Designed for easy deployment with Docker Compose

---

## 🛠 Requirements

- Docker
- Docker Compose
- Existing Radarr, Sonarr, and Readarr servers (preferably on the same Docker network)
- A Discord Bot Token (create one at the [Discord Developer Portal](https://discord.com/developers/applications))

---

## 📂 Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/discord-media-request-bot.git
cd discord-media-request-bot
```

### 2. Create a `.env` file

In the project root, create a file named `.env` with:

```env
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id

RADARR_API_KEY=your_radarr_api_key
RADARR_URL=http://radarr:7878/api/v3

SONARR_API_KEY=your_sonarr_api_key
SONARR_URL=http://sonarr:8989/api/v3

READARR_API_KEY=your_readarr_api_key
READARR_URL=http://readarr:8787/api/v1

READARR_BOOK_QUALITY_PROFILE_ID=1
```

> **Note:** Use container names (`radarr`, `sonarr`, `readarr`) instead of `localhost` when running in Docker.

### 3. Build and run with Docker Compose

```bash
docker compose up -d --build
```

To view live bot logs:

```bash
docker compose logs -f media-request-bot
```

To stop and remove containers:

```bash
docker compose down
```

---

## 🐳 Docker Compose Example

```yaml
version: '3.8'

services:
  discord-media-request-bot:
    container_name: media-request-bot
    build:
      context: .
      dockerfile: Dockerfile
    env_file:
      - .env
    restart: unless-stopped
    networks:
      - media

  radarr:
    image: linuxserver/radarr
    container_name: radarr
    ports:
      - "7878:7878"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York
    volumes:
      - ./radarr/config:/config
      - ./downloads:/downloads
      - /path/to/movies:/movies
    restart: unless-stopped
    networks:
      - media

  sonarr:
    image: linuxserver/sonarr
    container_name: sonarr
    ports:
      - "8989:8989"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York
    volumes:
      - ./sonarr/config:/config
      - ./downloads:/downloads
      - /path/to/tv:/tv
    restart: unless-stopped
    networks:
      - media

  readarr:
    image: linuxserver/readarr:develop
    container_name: readarr
    ports:
      - "8787:8787"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York
    volumes:
      - ./readarr/config:/config
      - ./downloads:/downloads
      - /path/to/books:/books
    restart: unless-stopped
    networks:
      - media

networks:
  media:
```

---

## 🛡️ Security Notice

- **Do not commit** your real `.env` to GitHub.  
- Add `.env` to your `.gitignore`:

```gitignore
.env
node_modules
```

---

## ✨ Future Improvements

- Plex integration for auto-library refresh
- Support for additional media servers
- Web dashboard for request management

---

## 📜 License

This project is open-source under the [MIT License](LICENSE).

---

## ❤️ Credits

Built with love to make managing media libraries easier through Discord!
