const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,/;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

// --- KODE SCRAPER ANDA (Disesuaikan untuk API) ---

async function animeterbaru(page = 1) {
  const res = await axios.get(`https://cors.caliph.my.id/https://v1.samehadaku.how/anime-terbaru/page/${page}/`, { headers });
  const $ = cheerio.load(res.data);
  const data = [];
  $('.post-show ul li').each((_, e) => {
    const a = $(e).find('.dtla h2 a');
    data.push({
      title: a.text().trim(),
      url: a.attr('href'),
      image: $(e).find('.thumb img').attr('src'),
      episode: $(e).find('.dtla span:contains("Episode")').text().replace('Episode', '').trim(),
    });
  });
  return data;
}

async function search(query) {
  const res = await axios.get(`https://cors.caliph.my.id/https://v1.samehadaku.how/?s=${encodeURIComponent(query)}`, { headers });
  const $ = cheerio.load(res.data);
  const data = [];
  $('.animpost').each((_, e) => {
    data.push({
      title: $(e).find('.data .title h2').text().trim(),
      image: $(e).find('.content-thumb img').attr('src'),
      type: $(e).find('.type').text().trim(),
      score: $(e).find('.score').text().trim(),
      url: $(e).find('a').attr('href')
    });
  });
  return data;
}

async function detail(link) {
  const targetUrl = link.startsWith('http')
    ? link
    : `https://v1.samehadaku.how${link}`;

  const res = await axios.get(
    `https://cors.caliph.my.id/${targetUrl}`,
    { headers }
  );

  const $ = cheerio.load(res.data);

  // ======================
  // EPISODES
  // ======================
  const episodes = [];
  $('.lstepsiode ul li').each((_, e) => {
    episodes.push({
      title: $(e).find('.epsleft .lchx a').text().trim(),
      url: $(e).find('.epsleft .lchx a').attr('href'),
      date: $(e).find('.epsleft .date').text().trim()
    });
  });

  // ======================
  // FLEXIBLE INFO PARSER
  // ======================
  const info = {
    status: null,
    score: null,
    type: null,
    total_episode: null,
    duration: null,
    studio: null,
    season: null,
    released: null,
    genre: null
  };

  $('.anim-senct .right-senc .spe span').each((_, el) => {
    const text = $(el).text().trim().toLowerCase();

    if (text.includes('status'))
      info.status = text.split(':').pop().trim();

    if (text.includes('skor') || text.includes('score'))
      info.score = text.split(':').pop().trim();

    if (text.includes('tipe') || text.includes('type'))
      info.type = text.split(':').pop().trim();

    if (text.includes('total'))
      info.total_episode = text.replace(/[^0-9]/g, '');

    if (text.includes('durasi'))
      info.duration = text.split(':').pop().trim();

    if (text.includes('studio'))
      info.studio = text.split(':').pop().trim();

    if (text.includes('musim') || text.includes('season'))
      info.season = text.split(':').pop().trim();

    if (text.includes('rilis') || text.includes('released'))
      info.released = text.split(':').pop().trim();

    if (text.includes('genre'))
      info.genre = text.split(':').pop().trim();
  });

  // ======================
  // AUTO FALLBACK LOGIC
  // ======================

  if (!info.total_episode && episodes.length > 0) {
    info.total_episode = episodes.length;
  }

  if (!info.duration) {
    info.duration = "Tidak diketahui";
  }

  return {
    title: $('title').text().replace(' - Samehadaku', '').trim(),
    image: $('meta[property="og:image"]').attr('content'),
    description:
      $('.entry-content').text().trim() ||
      $('meta[name="description"]').attr('content'),
    episodes,
    info
  };
}

async function download(link) {
  const targetUrl = link.startsWith('http') ? link : `https://v1.samehadaku.how${link}`;
  const res = await axios.get(`https://cors.caliph.my.id/${targetUrl}`, { headers });
  const cookies = res.headers['set-cookie']?.map(v => v.split(';')[0]).join('; ') || '';
  const $ = cheerio.load(res.data);
  const data = [];

  for (const li of $('div#server > ul > li').toArray()) {
    const div = $(li).find('div');
    const post = div.attr('data-post');
    const nume = div.attr('data-nume');
    const type = div.attr('data-type');
    const name = $(li).find('span').text().trim();
    if (!post) continue;

    const body = new URLSearchParams({ action: 'player_ajax', post, nume, type }).toString();
    
    try {
        const r = await axios.post('https://cors.caliph.my.id/https://v1.samehadaku.how/wp-admin/admin-ajax.php', body, {
        headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookies,
            'Referer': targetUrl
        }
        });
        const $$ = cheerio.load(r.data);
        const iframe = $$('iframe').attr('src');
        if (iframe) data.push({ server: name, url: iframe });
    } catch (e) {
        console.log("Error fetching server:", name);
    }
  }

  return {
    title: $('h1[itemprop="name"]').text().trim(),
    streams: data
  };
}

// --- ROUTES API ---

app.get('/api/latest', async (req, res) => {
  try {
    const data = await animeterbaru(req.query.page || 1);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/search', async (req, res) => {
  try {
    const data = await search(req.query.q);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/detail', async (req, res) => {
  try {
    const data = await detail(req.query.url);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/watch', async (req, res) => {
  try {
    const data = await download(req.query.url);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Untuk Local Development
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
