const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name:   { type: String, required: true },
  email:  { type: String, required: true, unique: true, lowercase: true },
  phone:  { type: String, required: true },
  password:{ type: String, required: true },
  twoFASecret: { type: String }, // 2FA secret
  isTwoFAEnabled: { type: Boolean, default: false },
  createdAt: { 
    type: Date, 
    default: () => {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      return new Date(now.getTime() + istOffset);
    }
  }
});

module.exports = mongoose.model('User', UserSchema);
