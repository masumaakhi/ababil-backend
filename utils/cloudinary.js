const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a buffer to Cloudinary
 * @param {Buffer} buffer - File buffer from multer
 * @param {String} folder - Cloudinary folder name
 * @returns {Promise<String>} - Returns the secure_url of the uploaded image
 */
const uploadToCloudinary = (buffer, folder = 'ababil-shop/products') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    
    uploadStream.end(buffer);
  });
};

const uploadUrlToCloudinary = (url, folder = 'ababil-shop/products') => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(url, { folder, resource_type: 'auto' }, (error, result) => {
      if (error) return reject(error);
      resolve(result.secure_url);
    });
  });
};

module.exports = { cloudinary, uploadToCloudinary, uploadUrlToCloudinary };
