import { Module } from '../lib/plugins.js';
import axios from 'axios';
import { load as cheerioLoad } from 'cheerio';
import he from 'he';

export default Module({
  command: 'weather',
  package: 'info',
  description: 'Weather forecast'
})(async (message, match) => {
  let city = match || 'Johannesburg'
  let res = await axios.get(`https://wttr.in/${city}?0`)
  let $ = cheerioLoad(res.data)
  let raw = $('pre').html()
  if (!raw) return message.send('err')
  raw = raw.replace(/<\/?span[^>]*>/g, '')
  let text = he.decode(raw.trim())
  message.send('```' + text + '```');
})
