const mongoose = require('mongoose');

let isConnected = false;

async function connectMongo() {
  if (isConnected || mongoose.connection.readyState === 1) {
    isConnected = true;
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  const dbName = process.env.MONGODB_DB_NAME || undefined;

  await mongoose.connect(uri, {
    dbName,
  });

  isConnected = true;
}

module.exports = { connectMongo };
