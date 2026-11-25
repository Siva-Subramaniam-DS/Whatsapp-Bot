import pino from 'pino';
import { config } from './config.js';
import { openDb } from './store/db.js';
import { connect } from './bot/connection.js';
import { createHandler } from './bot/handler.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const store = openDb(config.dbPath);

// One handler per socket; the connection rebuilds the client on reconnect.
const handlers = new WeakMap();
const onMessage = (client) => {
  if (!handlers.has(client)) handlers.set(client, createHandler({ client, store, config, logger }));
  return handlers.get(client);
};

await connect({ authDir: config.authDir, logger, onMessage });
