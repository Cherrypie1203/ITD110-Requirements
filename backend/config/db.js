const mongoose = require('mongoose');

const connectDB = async () => {
  const atlasUri = process.env.MONGODB_URI;
  const localUri = 'mongodb://127.0.0.1:27017/hive';

  if (!atlasUri) {
    console.warn('MONGODB_URI is not defined. Falling back to local MongoDB:', localUri);
  }

  const tryConnect = async (uri) => {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
  };

  try {
    await tryConnect(atlasUri || localUri);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error.message || error);
    if (atlasUri && atlasUri !== localUri) {
      console.warn('Attempting fallback to local MongoDB at', localUri);
      try {
        await tryConnect(localUri);
        console.log('MongoDB connected successfully using local fallback');
        return;
      } catch (localError) {
        console.error('Local MongoDB fallback failed:', localError.message || localError);
      }
    }
    console.error('Verify your MONGODB_URI value in .env or start a local MongoDB instance at mongodb://127.0.0.1:27017/hive');
    process.exit(1);
  }
};

module.exports = connectDB;